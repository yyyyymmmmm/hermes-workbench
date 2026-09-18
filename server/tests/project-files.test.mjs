import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,testConfig} from './fixtures.mjs';
test('project files: explicit atomic archive, ownership, replay and content validation',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-files-')),config=testConfig(dir);let output='',prompt='';
 const gateway=async(_t,_h,receive)=>({async rpc(method,p){if(method.startsWith('session.'))return {session_id:'files',running:false};if(method==='prompt.submit'){prompt=p.text;receive({method:'event',params:{session_id:'files',type:'message.start'}});receive({method:'event',params:{session_id:'files',type:'message.complete',payload:{text:output,status:'complete'}}});}return {};},close(){}});
 const app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway});
 try{
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
  const a=await login('alice'),b=await login('bob');
  const post=(url,payload,headers=a)=>app.inject({method:'POST',url,headers:{...headers,'idempotency-key':randomUUID()},payload});
  const get=(url,headers=a)=>app.inject({url,headers});
  await post('/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'});
  const projectId=randomUUID();await post('/api/projects',{id:projectId,version:0,name:'Files',description:'',archived:false});
  const block=files=>'```hermes-files\n'+JSON.stringify({version:1,files})+'\n```';
  async function run(text){output=text;const r=await post('/api/runs',{text:'Create a report',projectId,projectAccess:{tasks:false,documents:[]},projectConsent:true,executionConsent:true});assert.equal(r.statusCode,202,r.body);for(let i=0;i<100;i++){const d=(await get('/api/runs/'+r.json().id)).json();if(d.status==='completed')return '/api/runs/'+d.id+'/files';await new Promise(r=>setTimeout(r,10));}throw Error('timeout');}
  const url=await run(block([{name:'report.md',content:'# Report\nVerified text'}]));
  assert.ok(prompt.includes('Workbench file delivery protocol'));
  assert.equal((await get('/api/documents')).json().documents.length,0);
  assert.equal((await get(url,b)).statusCode,404);
  assert.equal((await app.inject({url})).statusCode,401);
  assert.equal((await post(url+'/0',{confirm:true},{...a,'x-csrf-token':'bad'})).statusCode,403);
  assert.equal((await post(url+'/0',{confirm:false})).statusCode,400);
  const preview=(await get(url)).json().files[0];assert.equal(preview.saved,false);
  const saved=await post(url+'/0',{confirm:true});assert.equal(saved.statusCode,200,saved.body);
  assert.equal((await post(url+'/0',{confirm:true})).statusCode,200);
  assert.equal((await get('/api/documents')).json().documents.length,1);
  assert.equal((await get('/api/projects')).json().projects[0].documents[0].id,preview.documentId);
  assert.equal((await get(url)).json().files[0].saved,true);
  const invalid=await run(block([{name:'../../secret.md',content:'bad'}]));assert.equal((await get(invalid)).statusCode,422);
  assert.equal((await post(invalid+'/0',{confirm:true})).statusCode,422);
  const oversize=await run(block([{name:'large.md',content:'中'.repeat(22000)}]));assert.equal((await get(oversize)).statusCode,422);
  const pathOnly=await run('Created /nas/report.md');assert.deepEqual((await get(pathOnly)).json().files,[]);
  const pending=await run(block([{name:'later.md',content:'Later'}]));
  const p=(await get('/api/projects')).json().projects[0];await post('/api/projects',{id:p.id,version:p.version,name:p.name,description:p.description,archived:true});
  assert.equal((await post(pending+'/0',{confirm:true})).statusCode,409);
  assert.equal((await get('/api/documents')).json().documents.length,1);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
