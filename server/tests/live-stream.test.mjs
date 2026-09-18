import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,testConfig} from './fixtures.mjs';
test('live SSE pushes reasoning and tools, replays cursor and isolates owners',{timeout:15000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'live-stream-')),config=testConfig(dir);let emit;
 const gateway=async(_t,_h,receive)=>{emit=(type,payload={})=>receive({method:'event',params:{session_id:'stream',type,payload}});return {async rpc(method){if(method.startsWith('session.'))return {session_id:'stream',running:false};if(method==='prompt.submit')emit('message.start');return {};},close(){}};};
 const app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway});const abort=new AbortController();
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
  const a=await login('alice'),b=await login('bob');
  await app.inject({method:'POST',url:'/api/hermes/connect',headers:a,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  const submitted=await app.inject({method:'POST',url:'/api/runs',headers:{...a,'idempotency-key':randomUUID()},payload:{text:'Test stream',executionConsent:true}});const id=submitted.json().id;
  while(!emit)await new Promise(r=>setTimeout(r,5));
  assert.equal((await app.inject({url:`/api/runs/${id}/events`,headers:b})).statusCode,404);
  const response=await fetch(`${config.origin}/api/runs/${id}/events`,{headers:{cookie:a.cookie},signal:abort.signal});assert.equal(response.status,200);
  const reader=response.body.getReader(),decoder=new TextDecoder();let content='';
  emit('reasoning.delta',{text:'Visible model summary'});emit('tool.started',{name:'search'});emit('message.delta',{text:'Hello'});
  while(!content.includes('Hello')){const part=await reader.read();content+=decoder.decode(part.value);}
  const events=content.split('\n').filter(l=>l.startsWith('data: ')).map(l=>JSON.parse(l.slice(6)));
  assert.ok(events.some(e=>e.type==='reasoning'&&e.text==='Visible model summary'));
  assert.ok(events.some(e=>e.type==='tool'&&e.status==='tool.start'));
  const cursor=events.at(-1).seq;
  emit('reasoning.available',{text:'NOT A REASONING SUMMARY'});
  emit('message.complete',{text:'Hello',status:'complete'});
  const detail=(await app.inject({url:`/api/runs/${id}`,headers:a})).json();assert.equal(detail.reasoning,'Visible model summary');assert.equal(detail.progress.phase,'completed');
  const replay=(await app.inject({url:`/api/runs/${id}/event-batch?after=${cursor}`,headers:a})).json().events;
  assert.ok(replay.length);assert.ok(replay.every(e=>e.seq>cursor));assert.ok(replay.every(e=>Number.isFinite(e.at)));
  abort.abort();await reader.cancel().catch(()=>{});
 }finally{abort.abort();await app.close();rmSync(dir,{recursive:true,force:true});}
});
