import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {mockAuth,mockHermes,testConfig} from './fixtures.mjs';

test('SOUL and schedules enforce ownership, confirmation, revision, readback and durable creation deduplication',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'hermes-content-')),config=testConfig(dir);
  let soul='Original',jobs=[],creates=0,mode='ok';
  const app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,opts)=>{
    const path=new URL(url).pathname,body=opts.body?JSON.parse(opts.body):{};let result;
    if(path==='/api/profiles/default/soul'){if(opts.method==='PUT'&&mode!=='ignore')soul=body.content;result={content:soul};}
    else if(path==='/api/cron/jobs'){
      if(opts.method==='POST'){creates++;jobs.push({...body,id:randomUUID(),enabled:true});if(mode==='timeout')throw Error('response lost');}
      result=jobs;
    }else if(path.startsWith('/api/cron/jobs/')){
      if(path.endsWith('/runs'))result={runs:[{id:'run-1',status:'completed',started_at:'2026-09-18T09:00:00Z',provider_snapshot:'SECRET'}]};
      else{const id=path.split('/').at(-1),job=jobs.find(j=>j.id===id);
        if(!job)return {status:404,headers:{},text:'{}'};
        if(opts.method==='PUT')Object.assign(job,body.updates);
        if(opts.method==='DELETE')jobs=jobs.filter(j=>j.id!==id);
        result=job;
      }
    }else return mockHermes(url,opts);
    return {status:200,headers:{},text:JSON.stringify(result)};
  }});
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
  try{
    const alice=await login('alice'),bob=await login('bob');
    await app.inject({method:'POST',url:'/api/hermes/connect',headers:alice,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
    const read=resource=>app.inject({url:'/api/hermes/content/'+resource,headers:alice});
    const write=(resource,payload,headers=alice)=>app.inject({method:'POST',url:'/api/hermes/content/'+resource,headers,payload});
    const initial=(await read('soul')).json();
    const edit={action:'soul',content:'Updated',revision:initial.revision,confirm:true};
    assert.equal((await write('soul',edit,bob)).statusCode,409);
    assert.equal((await write('soul',edit,{...alice,'x-csrf-token':'bad'})).statusCode,403);
    assert.equal((await write('soul',{...edit,confirm:false})).statusCode,400);
    const saved=(await write('soul',edit)).json();assert.equal(saved.verified,true);assert.equal(soul,'Updated');
    assert.equal((await write('soul',edit)).json().error.code,'CONFIG_CONFLICT');
    mode='ignore';assert.equal((await write('soul',{...edit,revision:saved.revision,content:'Ignored'})).json().error.code,'CONFIG_UNVERIFIED');mode='ok';
    const create={action:'create',key:randomUUID(),name:'Daily review',prompt:'Summarize tasks',schedule:'0 9 * * *',confirm:true};
    const job=(await write('schedules',create)).json();assert.equal(job.verified,true);assert.equal(creates,1);
    assert.deepEqual((await write('schedules',create)).json(),job);assert.equal(creates,1);
    assert.equal((await write('schedules',{...create,name:'Different'})).json().error.code,'IDEMPOTENCY_CONFLICT');
    const detail=(await read(job.id)).json();assert.equal(detail.runs.length,1);assert.equal(JSON.stringify(detail).includes('SECRET'),false);
    const update={action:'update',id:job.id,name:'Evening',prompt:'Review progress',schedule:'0 18 * * *',revision:job.revision,confirm:true};
    const changed=(await write('schedules',update)).json();assert.equal(changed.verified,true);assert.equal(jobs[0].name,'Evening');
    assert.equal((await write('schedules',{action:'delete',id:job.id,revision:job.revision,confirm:true})).json().error.code,'CONFIG_CONFLICT');
    assert.equal((await write('schedules',{action:'delete',id:job.id,revision:changed.revision,confirm:true})).json().deleted,true);assert.equal(jobs.length,0);
    mode='timeout';const uncertain={...create,key:randomUUID()};assert.equal((await write('schedules',uncertain)).json().error.code,'SCHEDULE_UNVERIFIED');assert.equal(creates,2);
    assert.equal((await write('schedules',uncertain)).json().error.code,'SCHEDULE_UNVERIFIED');assert.equal(creates,2);
    assert.equal((await write('schedules',{...update,id:'../secret'})).statusCode,400);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
