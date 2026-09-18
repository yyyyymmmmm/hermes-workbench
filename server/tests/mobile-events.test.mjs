import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,mockGateway,testConfig} from './fixtures.mjs';
test('mobile event batches preserve owner isolation and cursor validation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'mobile-events-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:mockGateway});
 try{
  const login=async username=>{const result=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:result.headers['set-cookie'].split(';')[0],'x-csrf-token':result.json().csrf};};
  const a=await login('alice'),b=await login('bob');
  await app.inject({method:'POST',url:'/api/hermes/connect',headers:a,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  const run=await app.inject({method:'POST',url:'/api/runs',headers:{...a,'idempotency-key':randomUUID()},payload:{text:'Mobile events',executionConsent:true}});assert.equal(run.statusCode,202,run.body);
  const url=`/api/runs/${run.json().id}/event-batch`;
  assert.equal((await app.inject({url,headers:b})).statusCode,404);
  assert.equal((await app.inject({url})).statusCode,401);
  assert.equal((await app.inject({url:url+'?after=-1',headers:a})).statusCode,400);
  const result=await app.inject({url,headers:a});assert.equal(result.statusCode,200);assert.ok(Array.isArray(result.json().events));
  assert.deepEqual((await app.inject({url:url+'?after=9007199254740991',headers:a})).json().events,[]);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
