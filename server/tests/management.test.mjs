import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../app.mjs';
import {managementView} from '../agent-management.mjs';
import {mockAuth,mockHermes,testConfig} from './fixtures.mjs';

test('management responses whitelist fields and do not expose provider keys or command environments',()=>{
 const config={config:{memory:{memory_enabled:true,user_profile_enabled:false,memory_char_limit:1234},tts:{provider:'test',test:{voice:'voice-a',api_key:'SECRET'}},api_key:'SECRET',env:{TOKEN:'SECRET'}}};
 assert.deepEqual(managementView('memory',config).values,{memoryEnabled:true,userProfileEnabled:false,memoryLimit:1234});
 assert.equal(JSON.stringify(managementView('voice',config)).includes('SECRET'),false);
 assert.throws(()=>managementView('skills',{message:'not supported'}));
});
test('management uses real allowlisted endpoints, account auth, explicit confirmation and safe audio',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-management-')),config=testConfig(dir);let enabled=true,methodUsed,speech=false,installed=false,installWrites=0;
 const app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,opts)=>{
  const path=new URL(url).pathname;let data;
  if(path==='/api/mcp/catalog')data={entries:[{name:'notion',transport:'http',needs_install:false,required_env:[],installed,enabled:false},{name:'unsafe',transport:'stdio',needs_install:true,required_env:[],installed:false,enabled:false}]};
  if(path==='/api/mcp/catalog/install'){assert.equal(opts.method,'POST');assert.deepEqual(JSON.parse(opts.body),{name:'notion',enable:false,env:{},profile:'default'});installed=true;installWrites++;data={ok:true};}
  if(path==='/api/skills')data={skills:[{name:'test-skill',enabled}]};
  if(path==='/api/skills/toggle'){methodUsed=opts.method;enabled=JSON.parse(opts.body).enabled;data={ok:true};}
  if(path==='/api/audio/speak'){speech=true;data={data_url:'data:audio/wav;base64,UklGRg=='};}
  return data?{status:200,headers:{},text:JSON.stringify(data)}:mockHermes(url,opts);
 }});
 const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
 try{
  const alice=await login('alice'),bob=await login('bob');
  await app.inject({method:'POST',url:'/api/hermes/connect',headers:alice,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  assert.equal((await app.inject({url:'/api/hermes/capabilities/skills',headers:alice})).json().items[0].enabled,true);
  assert.equal((await app.inject({url:'/api/hermes/capabilities/skills',headers:bob})).statusCode,409);
  assert.equal((await app.inject({method:'POST',url:'/api/hermes/manage',headers:alice,payload:{section:'skills',id:'test-skill',enabled:false}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/hermes/manage',headers:alice,payload:{section:'skills',id:'test-skill',enabled:false,confirm:true}})).statusCode,200);
  assert.equal(methodUsed,'PUT');assert.equal(enabled,false);
  assert.equal((await app.inject({method:'POST',url:'/api/hermes/manage',headers:alice,payload:{section:'mcp',id:'..',enabled:false,confirm:true}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/hermes/speak',headers:alice,payload:{text:'Read this.'}})).statusCode,200);assert.equal(speech,true);
  const install=(payload,headers=alice)=>app.inject({method:'POST',url:'/api/hermes/install-mcp',headers,payload});
  assert.equal((await install({name:'notion',confirm:true},bob)).statusCode,409);
  assert.equal((await install({name:'notion',confirm:false})).statusCode,400);
  assert.equal((await install({name:'unsafe',confirm:true})).statusCode,409);assert.equal(installWrites,0);
  const result=await install({name:'notion',confirm:true});assert.equal(result.statusCode,200);assert.equal(result.json().verified,true);assert.equal(result.json().items[0].installed,true);assert.equal(installWrites,1);
  assert.equal((await install({name:'notion',confirm:true})).statusCode,409);assert.equal(installWrites,1);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
