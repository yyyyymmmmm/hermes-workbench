import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../app.mjs';
import {testConfig,mockAuth,modelFixture} from './fixtures.mjs';
test('model application enforces confirmation, ownership and preflight; verifies the new default',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-model-')),config=testConfig(dir),fixture=modelFixture();let mismatch=false,app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,options)=>{const r=await fixture.transport(url,options);if(mismatch&&new URL(url).pathname==='/api/model/options'){const d=JSON.parse(r.text);d.current.model='fixture-model-b';r.text=JSON.stringify(d);}return r;}});
 try{
  const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username:'model-user',password:'test-password'}}),headers={origin:config.origin,cookie:login.headers['set-cookie'].split(';')[0],'x-csrf-token':login.json().csrf};
  const post=(url,payload,h=headers)=>app.inject({method:'POST',url,headers:h,payload});
  await post('/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'});
  const body={model:'fixture-model-b',provider:'test-provider',expected:{model:'fixture-model-a',provider:'test-provider'},confirm:true};
  assert.equal((await post('/api/hermes/model',body,{...headers,'x-csrf-token':'wrong'})).statusCode,403);
  assert.equal((await post('/api/hermes/model',{...body,confirm:false})).statusCode,400);
  assert.equal((await post('/api/hermes/model',{...body,model:'missing'})).statusCode,400);
  const good=await post('/api/hermes/model',body);assert.equal(good.statusCode,200);assert.equal(good.json().verified,true);assert.equal(good.json().preference.scope,'default-profile-new-sessions');
  assert.equal((await post('/api/hermes/model',body)).json().error.code,'MODEL_CONFLICT');assert.equal(fixture.writes.length,1);
  mismatch=true;const bad=await post('/api/hermes/model',{...body,model:'fixture-model-a',expected:{model:'fixture-model-b',provider:'test-provider'}});assert.equal(bad.json().error.code,'MODEL_UNVERIFIED');
  assert.equal(fixture.writes.length,2);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
