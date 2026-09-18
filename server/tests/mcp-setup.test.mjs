import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,testConfig} from './fixtures.mjs';

test('MCP setup isolates OAuth flows, validates URLs, verifies before enabling and removes with readback',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-mcp-')),config=testConfig(dir);
 let exists=true,enabled=false,approved=false,testOk=false,unsafe=false,enables=0,cancels=0;
 const app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,opts)=>{
  const p=new URL(url).pathname;let data;
  if(p==='/api/mcp/servers'){if(opts.method==='POST'){assert.equal(JSON.parse(opts.body).url,'https://8.8.8.8/mcp');exists=true;}data={servers:exists?[{name:'notion',enabled}]:[]};}
  if(p==='/api/mcp/servers/notion/auth')data={flow_id:'remote-secret-id',authorization_url:unsafe?'javascript:alert(1)':'https://accounts.example.test/authorize?state=test'};
  if(p==='/api/mcp/oauth/flows/remote-secret-id'){if(opts.method==='DELETE')cancels++;data={status:approved?'approved':'pending',access_token:'DO-NOT-FORWARD'};}
  if(p==='/api/mcp/servers/notion/test')data={ok:testOk,tools:[{name:'lookup'}]};
  if(p==='/api/mcp/servers/notion/enabled'){enables++;enabled=JSON.parse(opts.body).enabled;data={ok:true};}
  if(p==='/api/mcp/servers/notion'&&opts.method==='DELETE'){exists=false;data={ok:true};}
  return data?{status:200,headers:{},text:JSON.stringify(data)}:mockHermes(url,opts);
 }});
 const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});const headers={origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};await app.inject({method:'POST',url:'/api/hermes/connect',headers,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});return headers;};
 try{
  const a=await login('alice'),b=await login('bob');
  const act=(action,extra={},headers=a)=>app.inject({method:'POST',url:'/api/hermes/mcp-action',headers,payload:{name:'notion',action,confirm:true,...extra}});
  assert.equal((await act('authorize',{confirm:false})).statusCode,400);
  assert.equal((await act('authorize',{}, {...a,'x-csrf-token':'bad'})).statusCode,403);
  unsafe=true;assert.equal((await act('authorize')).json().error.code,'MCP_AUTH_FORMAT');unsafe=false;
  const auth=(await act('authorize')).json();assert.equal(auth.state,'authorization_required');assert.equal(JSON.stringify(auth).includes('remote-secret-id'),false);
  assert.equal((await act('status',{flow:auth.flow},b)).json().error.code,'MCP_FLOW_EXPIRED');
  assert.deepEqual((await act('authorize')).json(),auth);
  assert.deepEqual((await act('status',{flow:auth.flow})).json(),{state:'authorization_required'});
  approved=true;assert.deepEqual((await act('status',{flow:auth.flow})).json(),{state:'authorized'});
  assert.equal((await act('verify')).statusCode,502);assert.equal(enables,0);
  testOk=true;const verified=(await act('verify')).json();assert.equal(verified.state,'enabled');assert.equal(verified.toolCount,1);assert.equal(enables,1);
  const again=(await act('authorize')).json();assert.equal((await act('cancel',{flow:again.flow})).json().state,'cancelled');assert.equal(cancels,1);
  assert.equal((await act('remove')).json().state,'removed');assert.equal(exists,false);
  const add=(url,headers=a)=>app.inject({method:'POST',url:'/api/hermes/mcp-external',headers,payload:{name:'notion',url,auth:'oauth',confirm:true}});
  assert.equal((await add('https://127.0.0.1/mcp')).statusCode,400);
  assert.equal((await add('https://8.8.8.8/mcp',{...a,'x-csrf-token':'bad'})).statusCode,403);
  assert.equal((await add('https://8.8.8.8/mcp')).statusCode,200);assert.equal(exists,true);
  assert.equal((await add('https://8.8.8.8/mcp')).json().error.code,'MCP_NAME_EXISTS');
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
