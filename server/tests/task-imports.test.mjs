import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {database} from '../store.mjs';
import {checklist} from '../task-imports.mjs';
import {mockAuth,testConfig} from './fixtures.mjs';

test('task proposals parse explicit unchecked Markdown lists only',()=>{
  assert.deepEqual(checklist('Prose\n\n- Ordinary\n- [x] Done\n- [ ] **Review** [plan](https://example.com)\n\n```md\n- [ ] Not a task\n```').map(i=>i.title),['Review plan']);
  assert.deepEqual(checklist('- [ ] <script>alert(1)</script>'),[]);
  assert.equal(checklist('- [ ] '+'x'.repeat(301))[0].truncated,true);
  assert.throws(()=>checklist(Array.from({length:31},()=>'- [ ] Task').join('\n')),e=>e.code==='TASK_PLAN_LIMIT');
});
test('reviewed task imports are atomic, owner-scoped, idempotent and traceable after restart',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hermes-import-')),config=testConfig(dir);let app=await createApp(config,{auth:mockAuth}),store=database(dir);
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {owner:r.json().user.id,headers:{origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf}};};
  try{
    const a=await login('alice'),b=await login('bob'),run=randomUUID(),conversation=randomUUID();
    store.run('INSERT INTO conversations(id,owner,connection_id,title,remote_id,created,execution_granted) VALUES(?,?,?,?,?,?,?)',conversation,a.owner,randomUUID(),'Plan',null,Date.now(),1);
    store.run('INSERT INTO runs(id,owner,conversation_id,request_key,fingerprint,prompt,status,output,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',run,a.owner,conversation,randomUUID(),'test','Plan','completed','- [ ] First\n- [ ] Second',Date.now(),Date.now());
    const url=`/api/runs/${run}/task-plan`,key=randomUUID(),post=(body,headers=a.headers,k=key)=>app.inject({method:'POST',url,headers:{...headers,'idempotency-key':k},payload:body});
    assert.equal((await app.inject({url,headers:b.headers})).statusCode,404);
    const item=index=>({index,title:'Reviewed '+index,scheduledAt:'2026-09-20T10:00:00+08:00',minutes:30,timeZone:'Asia/Shanghai'}),body={confirm:true,items:[item(0),item(1)]};
    assert.equal((await post(body,{...a.headers,'x-csrf-token':'bad'})).statusCode,403);
    assert.equal((await post({...body,confirm:false})).statusCode,400);
    assert.equal((await post(body,b.headers)).statusCode,404);
    assert.equal((await post({...body,items:[item(0),item(2)]})).statusCode,400);
    assert.equal(store.tasks(a.owner).length,0);assert.equal(store.one('SELECT COUNT(*) n FROM task_sources').n,0);
    assert.equal((await post({...body,projectId:randomUUID()})).statusCode,409);assert.equal(store.tasks(a.owner).length,0);
    const result=await post(body);assert.equal(result.statusCode,200);assert.equal(result.json().tasks.length,2);
    assert.deepEqual((await post(body)).json(),result.json());
    assert.equal((await post({...body,items:[item(0)]})).statusCode,409);
    assert.equal((await post(body,a.headers,randomUUID())).statusCode,409);
    let task=store.tasks(a.owner)[0];assert.equal(task.sourceRunId,run);
    const {revision,updatedAt,sourceRunId,...edit}=task;
    const update=await app.inject({method:'POST',url:'/api/tasks',headers:{...a.headers,'idempotency-key':randomUUID()},payload:{...edit,completed:true}});assert.equal(update.statusCode,200);assert.equal(update.json().task.sourceRunId,run);
    store.db.close();await app.close();app=await createApp(config,{auth:mockAuth});store=database(dir);
    assert.equal(store.tasks(a.owner).length,2);assert.ok((await app.inject({url,headers:a.headers})).json().items.every(i=>i.taskId));
    assert.equal((await post(body,a.headers,randomUUID())).statusCode,409);
  }finally{store.db.close();await app.close();rmSync(dir,{recursive:true,force:true});}
});
