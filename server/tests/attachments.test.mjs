import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../app.mjs';
import { validateAttachments } from '../attachments.mjs';
import { mockAuth,mockHermes,mockGateway,testConfig } from './fixtures.mjs';

test('attachment limits use UTF-8 bytes and reject paths, binary and unsupported types',()=>{
  for(const file of [{name:'../secret.md',content:'x'},{name:'photo.png',content:'x'},{name:'binary.txt',content:'\0'},{name:'large.md',content:'中'.repeat(22000)}])assert.throws(()=>validateAttachments([file]));
  assert.throws(()=>validateAttachments(Array.from({length:6},()=>({name:'a.txt',content:'a'}))));
  assert.throws(()=>validateAttachments(Array.from({length:4},()=>({name:'a.txt',content:'a'.repeat(64000)}))));
});

test('attachments reach the gateway, survive restart, remain owner-scoped; history paginates',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'hermes-files-')),config=testConfig(directory);
  let remoteText,app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:async(...args)=>{
    const client=await mockGateway(...args),rpc=client.rpc.bind(client);
    client.rpc=(method,params)=>{if(method==='prompt.submit')remoteText=params.text;return rpc(method,params);};return client;
  }});
  const login=async username=>{const res=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:res.headers['set-cookie'].split(';')[0],'x-csrf-token':res.json().csrf};};
  const call=(headers,method,url,payload)=>app.inject({method,url,headers:{...headers,...(method==='POST'?{'idempotency-key':randomUUID()}:{})},payload});
  try{
    const alice=await login('alice'),bob=await login('bob');
    await call(alice,'POST','/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'});
    const attachment={name:'notes.md',content:'# Notes\n\nactual reference content'};
    const created=await call(alice,'POST','/api/runs',{text:'Read this',executionConsent:true,attachments:[attachment]});
    assert.equal(created.statusCode,202,created.body);const run=created.json();
    await new Promise(resolve=>setTimeout(resolve,120));
    assert.ok(remoteText.includes(JSON.stringify(attachment.content)));
    assert.equal((await call(alice,'GET',`/api/runs/${run.id}`)).json().prompt,'Read this');
    assert.equal((await call(bob,'GET',`/api/runs/${run.id}/attachments/0`)).statusCode,404);
    assert.equal((await call(alice,'GET',`/api/runs/${run.id}/attachments/0`)).json().content,attachment.content);
    assert.equal((await call(alice,'GET',`/api/runs/${run.id}/attachments/1`)).statusCode,404);
    for(let index=0;index<21;index++){
      const next=await call(alice,'POST','/api/runs',{text:`Turn ${index}`,conversationId:run.conversationId});
      assert.equal(next.statusCode,202,next.body);await new Promise(resolve=>setTimeout(resolve,100));
    }
    const page=(await call(alice,'GET',`/api/conversations/${run.conversationId}/messages`)).json();
    assert.equal(page.messages.length,20);assert.equal(page.hasMore,true);
    const older=(await call(alice,'GET',`/api/conversations/${run.conversationId}/messages?before=${page.messages[0].id}`)).json();
    assert.equal(older.messages.length,2);assert.equal(older.hasMore,false);assert.equal(older.messages[0].id,run.id);
    await app.close();app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:mockGateway});
    assert.equal((await call(alice,'GET',`/api/runs/${run.id}/attachments/0`)).json().content,attachment.content);
    assert.equal((await call(alice,'GET',`/api/runs/${run.id}`)).json().executionGranted,true);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});
