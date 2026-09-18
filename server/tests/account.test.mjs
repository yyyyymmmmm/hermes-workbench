import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../app.mjs';
import {testConfig,mockAuth} from './fixtures.mjs';
test('device rename and bulk revocation enforce owner, confirmation and CSRF',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'account-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth});
 try{
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {id:r.json().sessionId,headers:{origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf}};};
  const a=await login('alice'),other=await login('alice'),b=await login('bob');
  const rename=(session,device)=>app.inject({method:'PATCH',url:'/api/devices/'+other.id,headers:session.headers,payload:{device}});
  assert.equal((await rename(b,'stolen')).statusCode,404);
  assert.equal((await rename(a,' ')).statusCode,400);
  assert.equal((await rename({...a,headers:{...a.headers,'x-csrf-token':'bad'}},'bad')).statusCode,403);
  assert.equal((await rename(a,'Laptop')).statusCode,200);
  const devices=(await app.inject({url:'/api/devices',headers:a.headers})).json().devices;assert.equal(devices.find(d=>d.id===other.id).device,'Laptop');
  const revoke=payload=>app.inject({method:'POST',url:'/api/devices/revoke-others',headers:a.headers,payload});
  assert.equal((await revoke({})).statusCode,400);assert.equal((await revoke({confirm:true})).json().revoked,1);assert.equal((await revoke({confirm:true})).json().revoked,0);
  assert.equal((await app.inject({url:'/api/me',headers:other.headers})).statusCode,401);
  for(const session of [a,b])assert.equal((await app.inject({url:'/api/me',headers:session.headers})).statusCode,200);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
