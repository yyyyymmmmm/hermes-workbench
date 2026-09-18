import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {mockAuth,testConfig} from './fixtures.mjs';

test('projects preserve shared resources, isolate owners, reject stale links and atomically attach new tasks',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-projects-')),config=testConfig(dir);let app=await createApp(config,{auth:mockAuth});
 const login=async name=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username:name,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
 try{
  const a=await login('alice'),b=await login('bob'),project={id:randomUUID(),version:0,name:'Product',description:'A real project',archived:false};
  const post=(url,payload,headers=a)=>app.inject({method:'POST',url,headers,payload});
  assert.equal((await post('/api/projects',project,{...a,'x-csrf-token':'wrong'})).statusCode,403);
  assert.equal((await post('/api/projects',project)).statusCode,200);
  assert.equal((await post('/api/projects',project)).statusCode,409);
  const task={id:randomUUID(),version:0,title:'Shared task',scheduledAt:'2026-09-20T09:00:00Z',minutes:30,timeZone:'UTC',completed:false,deleted:false,linkProject:project.id},key=randomUUID();
  const create=await post('/api/tasks',task,{...a,'idempotency-key':key});assert.equal(create.statusCode,200);assert.equal(create.json().task.linkProject,undefined);
  assert.equal((await post('/api/tasks',task,{...a,'idempotency-key':key})).statusCode,200);
  const list=async(headers=a)=>(await app.inject({url:'/api/projects',headers})).json().projects;
  let p=(await list())[0];assert.deepEqual(p.taskIds,[task.id]);assert.equal(p.version,2);assert.equal((await list(b)).length,0);
  const denied={...task,id:randomUUID()};assert.equal((await post('/api/tasks',denied,{...b,'idempotency-key':randomUUID()})).statusCode,409);
  assert.equal((await app.inject({url:'/api/tasks',headers:b})).json().tasks.length,0);
  const doc={id:randomUUID(),version:0,name:'plan.md',content:'# Plan',deleted:false};
  await post('/api/documents',doc,{...a,'idempotency-key':randomUUID()});
  const link={version:p.version,kind:'document',resourceId:doc.id,linked:true};
  assert.equal((await post(`/api/projects/${p.id}/links`,link,b)).statusCode,404);
  assert.equal((await post(`/api/projects/${p.id}/links`,link)).statusCode,200);
  assert.equal((await post(`/api/projects/${p.id}/links`,link)).statusCode,409);
  p=(await list())[0];assert.equal(p.documents[0].name,'plan.md');
  await post('/api/projects',{...project,version:p.version,archived:true});
  assert.equal((await post('/api/tasks',{...task,id:randomUUID()},{...a,'idempotency-key':randomUUID()})).statusCode,409);
  assert.equal((await app.inject({url:'/api/tasks',headers:a})).json().tasks.length,1);
  await app.close();app=await createApp(config,{auth:mockAuth});p=(await list())[0];assert.equal(p.archived,true);assert.equal(p.documents.length,1);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
