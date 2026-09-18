import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,mockGateway,testConfig} from './fixtures.mjs';

test('conversation metadata is owner scoped, conflict checked, searchable; agent preference uses native delegation',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hermes-collaboration-')),config=testConfig(dir);let enabled=true,submissions=[];
  const app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,options)=>new URL(url).pathname==='/api/tools/toolsets'?{status:200,headers:{},text:JSON.stringify({toolsets:[{name:'delegation',enabled,tools:['delegate_task']}]})}:mockHermes(url,options),gateway:async(...args)=>{const g=await mockGateway(...args),rpc=g.rpc;g.rpc=(method,p)=>{if(method==='prompt.submit')submissions.push(p.text);return rpc(method,p);};return g;}});
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
  const call=(headers,method,url,payload)=>app.inject({method,url,payload,headers:{...headers,'idempotency-key':randomUUID()}});
  try{
    const alice=await login('alice'),bob=await login('bob');await call(alice,'POST','/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'});
    const r=await call(alice,'POST','/api/runs',{text:'Research and review',executionConsent:true,agentMode:true});assert.equal(r.statusCode,202,r.body);const {id,conversationId}=r.json();
    await new Promise(resolve=>setTimeout(resolve,180));assert.match(submissions[0],/native delegate_task/);assert.equal((await call(alice,'GET',`/api/runs/${id}`)).json().agentMode,true);
    const body={title:'Release review',category:'Work',version:0};
    assert.equal((await call(bob,'PATCH',`/api/conversations/${conversationId}`,body)).statusCode,404);
    assert.equal((await call(alice,'PATCH',`/api/conversations/${conversationId}`,{...body,title:' '})).statusCode,400);
    assert.equal((await call(alice,'PATCH',`/api/conversations/${conversationId}`,body)).json().version,1);
    assert.equal((await call(alice,'PATCH',`/api/conversations/${conversationId}`,body)).statusCode,409);
    assert.equal((await call(alice,'GET','/api/conversations/search?q=Release')).json().items[0].category,'Work');
    assert.equal((await call(alice,'GET','/api/runs')).json().conversations[0].title,'Release review');
    enabled=false;const rejected=await call(alice,'POST','/api/runs',{text:'No delegation available',executionConsent:true,agentMode:true});await new Promise(resolve=>setTimeout(resolve,80));assert.equal((await call(alice,'GET',`/api/runs/${rejected.json().id}`)).json().status,'failed');assert.equal(submissions.length,1);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
