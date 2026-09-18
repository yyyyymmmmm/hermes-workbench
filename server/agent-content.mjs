import {z} from 'zod';
import {Fault,hash} from './core.mjs';

const revision=z.string().regex(/^[a-f0-9]{64}$/);
const identifier=z.string().regex(/^[A-Za-z0-9_-]{1,200}$/);
const fields={name:z.string().trim().min(1).max(200),prompt:z.string().trim().min(1).max(16000),schedule:z.string().trim().min(1).max(200)};
const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('soul'),content:z.string().max(32000),revision,confirm:z.literal(true)}).strict(),
  z.object({action:z.literal('create'),...fields,key:z.uuid(),confirm:z.literal(true)}).strict(),
  z.object({action:z.literal('update'),id:identifier,...fields,revision,confirm:z.literal(true)}).strict(),
  z.object({action:z.literal('delete'),id:identifier,revision,confirm:z.literal(true)}).strict()
]);
const text=(v,max=2000)=>typeof v==='string'?v.slice(0,max):'';
export function scheduleView(raw){
  const job=raw?.job||raw;
  if(!job||!identifier.safeParse(job.id).success)throw new Fault(502,'CAPABILITY_FORMAT','Unsupported schedule document');
  const result={id:job.id,name:text(job.name,200),prompt:text(job.prompt,16000),schedule:typeof job.schedule==='string'?text(job.schedule,200):text(job.schedule?.expr||job.schedule?.display,200),enabled:job.enabled===true,nextRun:text(job.next_run_at),lastRun:text(job.last_run_at),lastStatus:text(job.last_status),lastError:text(job.last_error),delivery:text(job.deliver),profile:'default'};
  return {...result,revision:hash(JSON.stringify([result.id,result.name,result.prompt,result.schedule,result.enabled,result.delivery]))};
}
export async function agentContent({call,store,owner,connection},resource,raw){
  const soulPath='/api/profiles/default/soul',jobsPath='/api/cron/jobs?profile=default';
  async function soul(){const result=await call(soulPath);if(typeof result.content!=='string'||result.content.length>32000)throw new Fault(502,'CAPABILITY_FORMAT','Unsupported soul document');return {content:result.content,revision:hash(result.content),checkedAt:new Date().toISOString()};}
  const jobPath=id=>`/api/cron/jobs/${encodeURIComponent(identifier.parse(id))}?profile=default`;
  async function detail(id){return scheduleView(await call(jobPath(id)));}
  async function list(){const result=await call(jobsPath),items=Array.isArray(result)?result:result.jobs;if(!Array.isArray(items))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported schedule list');return items.map(scheduleView);}
  if(!raw){
    if(resource==='soul')return soul();
    const id=identifier.parse(resource),result=await detail(id);
    try{
      const history=await call(`/api/cron/jobs/${encodeURIComponent(id)}/runs?profile=default&limit=20`);
      if(!Array.isArray(history.runs))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported run history');
      result.runs=history.runs.slice(0,20).map(run=>Object.fromEntries(['id','status','started_at','finished_at','error'].filter(key=>typeof run[key]==='string').map(key=>[key,text(run[key])])));
    }catch(error){result.historyError=error.code||'HERMES_UPSTREAM_ERROR';}
    return result;
  }
  const body=input.parse(raw);
  if((resource==='soul')!==(body.action==='soul'))throw new Fault(400,'INVALID_INPUT','Invalid resource');
  if(body.action==='soul'){
    if((await soul()).revision!==body.revision)throw new Fault(409,'CONFIG_CONFLICT','Server content changed; reload before saving');
    try{await call(soulPath,'PUT',{content:body.content});const result=await soul();if(result.content!==body.content)throw Error();return {...result,verified:true};}
    catch(error){if(['HERMES_UNSUPPORTED','HERMES_AUTH_EXPIRED','HERMES_REJECTED'].includes(error.code))throw error;throw new Fault(502,'CONFIG_UNVERIFIED','Save outcome is unconfirmed; reload before retrying');}
  }
  let receipt;
  if(body.action==='create'){
    receipt=`schedule:${connection}:${body.key}`;const fingerprint=hash(JSON.stringify(body));
    const prior=store.one('SELECT * FROM mutations WHERE owner=? AND key=?',owner,receipt);
    if(prior){if(prior.hash!==fingerprint)throw new Fault(409,'IDEMPOTENCY_CONFLICT','Request key was already used');const result=JSON.parse(prior.response);if(result.pending)throw new Fault(409,'SCHEDULE_UNVERIFIED','Creation outcome is unknown; inspect the remote list before creating another task');return result;}
    const before=await list();
    store.run('INSERT INTO mutations(owner,key,hash,response) VALUES(?,?,?,?)',owner,receipt,fingerprint,JSON.stringify({pending:true}));
    try{
      await call(jobsPath,'POST',{name:body.name,prompt:body.prompt,schedule:body.schedule,deliver:'local'});
      const added=(await list()).filter(j=>!before.some(b=>b.id===j.id)&&j.name===body.name&&j.prompt===body.prompt);
      if(added.length!==1)throw Error('Unconfirmed creation');
      const result={...added[0],verified:true};store.run('UPDATE mutations SET response=? WHERE owner=? AND key=?',JSON.stringify(result),owner,receipt);return result;
    }catch{throw new Fault(502,'SCHEDULE_UNVERIFIED','Creation outcome is unknown; inspect the remote list before creating another task');}
  }
  const before=await detail(body.id);
  if(before.revision!==body.revision)throw new Fault(409,'CONFIG_CONFLICT','Schedule changed; reload before saving');
  try{
    if(body.action==='delete'){await call(jobPath(body.id),'DELETE');if((await list()).some(j=>j.id===body.id))throw Error();return {id:body.id,deleted:true,verified:true};}
    await call(jobPath(body.id),'PUT',{updates:{name:body.name,prompt:body.prompt,schedule:body.schedule}});
    const result=await detail(body.id);
    if(result.name!==body.name||result.prompt!==body.prompt||result.schedule!==body.schedule)throw Error();
    return {...result,verified:true};
  }catch(error){if(['HERMES_UNSUPPORTED','HERMES_AUTH_EXPIRED','HERMES_REJECTED'].includes(error.code))throw error;throw new Fault(502,'SCHEDULE_UNVERIFIED','Schedule change is unconfirmed; reload before retrying');}
}
