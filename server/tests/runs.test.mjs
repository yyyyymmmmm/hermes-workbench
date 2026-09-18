import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import { WebSocketServer } from 'ws';
import { createApp } from '../app.mjs';
import { openGateway } from '../gateway.mjs';
import { mockAuth,mockHermes,mockGateway,testConfig } from './fixtures.mjs';

test('WebSocket transport waits for ready, correlates RPC, and sends exact approval response', {timeout:10000}, async()=>{
  const server=new WebSocketServer({port:0,host:'127.0.0.1'});await once(server,'listening');
  let response;
  server.on('connection',socket=>{
    socket.send(JSON.stringify({jsonrpc:'2.0',method:'event',params:{type:'gateway.ready'}}));
    socket.on('message',bytes=>{
      const frame=JSON.parse(bytes);
      if(frame.method)socket.send(JSON.stringify({jsonrpc:'2.0',id:frame.id,result:{session_id:'session-test'}}));
      else response=frame;
    });
    socket.send('null');
  });
  const port=server.address().port;
  const client=await openGateway({url:`ws://127.0.0.1:${port}/api/ws?ticket=test`},[`127.0.0.1:${port}`],()=>{},()=>{});
  try {
    assert.equal((await client.rpc('session.create',{})).session_id,'session-test');
    await client.respond('permission-id',{choice:'once'});
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.deepEqual(response,{jsonrpc:'2.0',id:'permission-id',result:{choice:'once'}});
  } finally {client.close();await new Promise(resolve=>server.close(resolve));}
});

test('runs: consent, ownership, idempotency, approvals, interruption, disconnect and reconciliation', {timeout:15000}, async()=>{
  const directory=mkdtempSync(join(tmpdir(),'hermes-runs-')),config=testConfig(directory);
  let submitCount=0;
  const app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:async(...args)=>{
    const client=await mockGateway(...args),rpc=client.rpc.bind(client);
    client.rpc=(method,params)=>{if(method==='prompt.submit')submitCount++;return rpc(method,params);};return client;
  }});
  const login=async username=>{
    const response=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});
    return {origin:config.origin,cookie:response.headers['set-cookie'].split(';')[0],'x-csrf-token':response.json().csrf};
  };
  try {
    const alice=await login('alice'),bob=await login('bob');
    const call=(headers,method,url,payload,extra={})=>app.inject({method,url,payload,headers:{...headers,...extra}});
    const key=randomUUID(),payload={text:'approval',executionConsent:true};
    await call(alice,'POST','/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'});
    assert.equal((await call(alice,'POST','/api/runs',{text:'hello'}, {'idempotency-key':key})).statusCode,403);
    const created=await call(alice,'POST','/api/runs',payload,{'idempotency-key':key});
    assert.equal(created.statusCode,202,created.body);const id=created.json().id;
    assert.equal((await call(alice,'POST','/api/runs',payload,{'idempotency-key':key})).json().id,id);
    assert.equal((await call(alice,'POST','/api/runs',{...payload,text:'different'},{'idempotency-key':key})).statusCode,409);
    assert.equal((await call(bob,'GET',`/api/runs/${id}`)).statusCode,404);
    assert.equal((await call(bob,'GET',`/api/runs/${id}/events`)).statusCode,404);
    assert.equal((await call(bob,'GET','/api/runs')).json().runs.length,0);
    assert.equal((await call(alice,'DELETE','/api/hermes')).statusCode,409);
    await new Promise(resolve=>setTimeout(resolve,150));
    const pending=(await call(alice,'GET',`/api/runs/${id}`)).json();
    assert.equal(pending.status,'approval');assert.equal(submitCount,1);
    assert.equal(pending.requests[0].detail.includes('echo test'),true);
    const requestId=pending.requests[0].id;
    assert.equal((await call(bob,'POST',`/api/runs/${id}/requests/${requestId}`,{answer:'once'})).statusCode,404);
    assert.equal((await call(alice,'POST',`/api/runs/${id}/requests/${requestId}`,{answer:'invented'})).statusCode,400);
    const answered=await call(alice,'POST',`/api/runs/${id}/requests/${requestId}`,{answer:'once'});
    assert.equal(answered.json().status,'completed',answered.body);
    assert.equal(answered.json().output,'真实协议测试回复');
    assert.equal((await call(alice,'POST',`/api/runs/${id}/requests/${requestId}`,{answer:'once'})).statusCode,409);
    const next=await call(alice,'POST','/api/runs',{text:'hold',conversationId:pending.conversationId},{'idempotency-key':randomUUID()});
    assert.equal(next.statusCode,202,'conversation grant persists');
    await new Promise(resolve=>setTimeout(resolve,130));
    assert.equal((await call(alice,'POST',`/api/runs/${next.json().id}/interrupt`)).json().status,'stopped');
    assert.equal((await call(bob,'GET',`/api/conversations/${pending.conversationId}/messages`)).statusCode,404);
    assert.equal((await call(bob,'POST',`/api/conversations/${pending.conversationId}/revoke`)).statusCode,404);
    assert.equal((await call(alice,'GET',`/api/conversations/${pending.conversationId}/messages`)).json().messages.length,2);
    await call(alice,'POST',`/api/conversations/${pending.conversationId}/revoke`);
    assert.equal((await call(alice,'POST','/api/runs',{text:'hold',conversationId:pending.conversationId},{'idempotency-key':randomUUID()})).statusCode,403);
    const lost=await call(alice,'POST','/api/runs',{text:'disconnect',executionConsent:true},{'idempotency-key':randomUUID()});
    await new Promise(resolve=>setTimeout(resolve,130));
    assert.equal((await call(alice,'GET',`/api/runs/${lost.json().id}`)).json().status,'unknown');
    assert.equal(submitCount,3);
    assert.equal((await call(alice,'POST','/api/runs',{text:'no duplicate',executionConsent:true},{'idempotency-key':randomUUID()})).statusCode,409);
    assert.equal((await call(alice,'POST','/api/hermes/connect',{origin:'https://other.example.test',username:'remote-user',password:'hermes-test-password'})).statusCode,409);
    assert.equal((await call(alice,'POST','/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'})).statusCode,200);
    const checked=await call(alice,'POST',`/api/runs/${lost.json().id}/reconcile`);
    assert.equal(checked.json().status,'ended',checked.body);
    const abandoned=await call(alice,'POST','/api/runs',{text:'disconnect',executionConsent:true},{'idempotency-key':randomUUID()});
    await new Promise(resolve=>setTimeout(resolve,130));
    assert.equal((await call(alice,'POST',`/api/runs/${abandoned.json().id}/abandon`,{acknowledgeRemoteMayContinue:false})).statusCode,400);
    assert.equal((await call(alice,'POST',`/api/runs/${abandoned.json().id}/abandon`,{acknowledgeRemoteMayContinue:true})).json().status,'abandoned');
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});

test('restart retains incomplete runs as unknown and never resubmits automatically',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'hermes-run-restart-')),config=testConfig(directory);
  let app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:mockGateway});
  try{
    const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username:'alice',password:'test-password'}});
    const headers={origin:config.origin,cookie:login.headers['set-cookie'].split(';')[0],'x-csrf-token':login.json().csrf};
    await app.inject({method:'POST',url:'/api/hermes/connect',headers,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
    const run=await app.inject({method:'POST',url:'/api/runs',headers:{...headers,'idempotency-key':randomUUID()},payload:{text:'hold',executionConsent:true}});
    await new Promise(resolve=>setTimeout(resolve,130));await app.close();
    let opened=0;
    app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:async(...args)=>{opened++;return mockGateway(...args);}});
    const restored=await app.inject({url:`/api/runs/${run.json().id}`,headers});
    assert.equal(restored.json().status,'unknown');assert.equal(restored.json().prompt,'hold');assert.equal(opened,0);
    const checked=await app.inject({method:'POST',url:`/api/runs/${run.json().id}/reconcile`,headers});
    assert.equal(checked.json().status,'ended');assert.equal(opened,1);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
