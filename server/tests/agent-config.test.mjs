import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {configInput,configRevision,mergeConfig,configPatch} from '../agent-config.mjs';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,testConfig} from './fixtures.mjs';

test('configuration edits preserve secrets, reject unknown fields and unsafe provider keys',()=>{
 const config={memory:{memory_enabled:false,other:42},tts:{provider:'elevenlabs',elevenlabs:{api_key:'secret',voice_id:'old'}},env:{TOKEN:'secret'}};
 const base={section:'voice',revision:configRevision(config),confirm:true,changes:{voice:'new'}};
 const edited=mergeConfig(config,base);
 assert.deepEqual(configPatch(config,base),{tts:{elevenlabs:{voice_id:'new'}}});
 assert.equal(edited.tts.elevenlabs.voice_id,'new');assert.equal(edited.tts.elevenlabs.api_key,'secret');assert.deepEqual(edited.env,config.env);assert.equal(config.tts.elevenlabs.voice_id,'old');
 assert.throws(()=>configInput.parse({...base,changes:{ttsProvider:'__proto__'}}));
 assert.throws(()=>configInput.parse({...base,changes:{api_key:'bad'}}));
 assert.throws(()=>configInput.parse({...base,changes:{}}));
 assert.equal(configRevision({b:2,a:1}),configRevision({a:1,b:2}));
});

test('configuration API requires ownership, CSRF, confirmation and fresh revision; verifies writes without retries',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-config-')),config=testConfig(dir);
 let remote={memory:{memory_enabled:false,memory_char_limit:1024},env:{TOKEN:'secret'}},writes=0,mode='ok';
 const app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,opts)=>{
  if(new URL(url).pathname!=='/api/config')return mockHermes(url,opts);
  if(opts.method==='PUT'){writes++;const patch=JSON.parse(opts.body).config;assert.equal(patch.env,undefined);if(mode!=='ignore')for(const [k,v]of Object.entries(patch))remote[k]={...remote[k],...v};if(mode==='timeout')throw new Error('lost response');return {status:200,headers:{},text:'{"ok":true}'};}
  return {status:200,headers:{},text:JSON.stringify({config:remote})};
 }});
 const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
 try{
  const alice=await login('alice'),bob=await login('bob');
  assert.equal((await app.inject({method:'POST',url:'/api/hermes/connect',headers:alice,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}})).statusCode,200);
  const read=()=>app.inject({url:'/api/hermes/capabilities/memory',headers:alice});
  const initial=(await read()).json();assert.equal(JSON.stringify(initial).includes('secret'),false);
  const body={section:'memory',revision:initial.revision,confirm:true,changes:{memoryEnabled:true}};
  const save=(payload=body,headers=alice)=>app.inject({method:'POST',url:'/api/hermes/config',headers,payload});
  assert.equal((await save(body,bob)).statusCode,409);
  assert.equal((await save(body,{...alice,'x-csrf-token':'bad'})).statusCode,403);
  assert.equal((await save({...body,confirm:false})).statusCode,400);
  remote.memory.memory_char_limit=2048;
  assert.equal((await save()).json().error.code,'CONFIG_CONFLICT');assert.equal(writes,0);
  body.revision=(await read()).json().revision;
  const saved=await save();assert.equal(saved.statusCode,200);assert.equal(saved.json().verified,true);assert.equal(writes,1);assert.equal(remote.env.TOKEN,'secret');assert.equal(remote.memory.memory_char_limit,2048);
  body.revision=saved.json().revision;body.changes={memoryEnabled:false};mode='ignore';
  assert.equal((await save()).json().error.code,'CONFIG_UNVERIFIED');assert.equal(writes,2);
  mode='timeout';assert.equal((await save()).json().error.code,'CONFIG_UNVERIFIED');assert.equal(writes,3);assert.equal((await read()).json().values.memoryEnabled,false);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
