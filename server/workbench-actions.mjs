import {randomUUID} from 'node:crypto';
import {marked} from 'marked';
import {z} from 'zod';
import {Fault} from './core.mjs';
const fields={title:z.string().trim().min(1).max(300),scheduledAt:z.iso.datetime({offset:true}).nullable(),minutes:z.number().int().min(5).max(1440),timeZone:z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}})};
const schema=z.object({version:z.literal(1),operations:z.array(z.discriminatedUnion('op',[
 z.object({op:z.literal('create'),...fields}).strict(),
 z.object({op:z.literal('update'),id:z.uuid(),version:z.number().int().positive(),...fields,completed:z.boolean()}).strict(),
 z.object({op:z.literal('delete'),id:z.uuid(),version:z.number().int().positive()}).strict()
])).min(1).max(10)}).strict().refine(p=>{const ids=p.operations.filter(o=>o.op!=='create').map(o=>o.id);return new Set(ids).size===ids.length;});
export function workbenchActions(store){
 const own=(owner,id)=>{const r=store.one('SELECT * FROM workbench_actions WHERE owner=? AND run_id=?',owner,id);if(!r)throw new Fault(404,'ACTION_NOT_FOUND','No structured task proposal');return r;};
 const transaction=fn=>{store.db.exec('BEGIN IMMEDIATE');try{const r=fn();store.db.exec('COMMIT');return r;}catch(e){if(store.db.isTransaction)store.db.exec('ROLLBACK');throw e;}};
 const taskBody=t=>({id:t.id,version:t.version,title:t.title,scheduledAt:t.scheduledAt,minutes:t.minutes,timeZone:t.timeZone,completed:t.completed,deleted:Boolean(t.deleted)});
 function context(owner,id){const r=store.one('SELECT r.project_context,c.project_id FROM runs r JOIN conversations c ON c.id=r.conversation_id WHERE r.owner=? AND r.id=? AND r.status=\'completed\'',owner,id);if(!r?.project_context||!store.one('SELECT id FROM projects WHERE owner=? AND id=? AND archived=0',owner,r.project_id))throw new Fault(409,'PROJECT_UNAVAILABLE','Project unavailable');return {...r,snapshot:JSON.parse(r.project_context)};}
 const service={
  get(owner,id){const r=own(owner,id),snapshot=store.one('SELECT project_context FROM runs WHERE owner=? AND id=?',owner,id)?.project_context;return {runId:id,status:r.status,proposal:JSON.parse(r.proposal),before:snapshot?JSON.parse(snapshot).tasks:[],receipt:r.receipt?JSON.parse(r.receipt):null,error:r.error};},
  stage(owner,id,output){
   if(store.one('SELECT run_id FROM workbench_actions WHERE run_id=?',id))return;
   const blocks=marked.lexer(output).filter(t=>t.type==='code'&&t.lang==='hermes-actions');if(!blocks.length)return;
   let proposal;
   try{if(blocks.length!==1)throw new Error();proposal=schema.parse(JSON.parse(blocks[0].text));context(owner,id);}catch{store.run('INSERT INTO workbench_actions VALUES(?,?,?,?,?,?,?)',id,owner,'{"operations":[]}','invalid',null,'INVALID_PROPOSAL',Date.now());return;}
   store.run('INSERT INTO workbench_actions VALUES(?,?,?,?,?,?,?)',id,owner,JSON.stringify(proposal),'pending',null,'',Date.now());
   const c=context(owner,id),automatic=store.one('SELECT auto_create FROM project_policies WHERE owner=? AND project_id=?',owner,c.project_id)?.auto_create;
   if(automatic&&proposal.operations.every(o=>o.op==='create')){try{service.apply(owner,id,true);}catch(e){store.run('UPDATE workbench_actions SET error=? WHERE run_id=?',e.code||'ACTION_FAILED',id);}}
  },
  apply(owner,id,automatic=false){try{return transaction(()=>{
   const record=own(owner,id);if(record.status==='applied')return service.get(owner,id);
   if(record.status!=='pending')throw new Fault(409,'ACTION_STATE','Proposal is not pending');
   const proposal=schema.parse(JSON.parse(record.proposal)),c=context(owner,id),receipt=[];
   if(automatic&&(!proposal.operations.every(o=>o.op==='create')||!store.one('SELECT auto_create FROM project_policies WHERE owner=? AND project_id=?',owner,c.project_id)?.auto_create))throw new Fault(403,'ACTION_CONSENT','Creation is not authorized');
   for(const [index,operation] of proposal.operations.entries()){
    let before=null,body;
    if(operation.op==='create'){const {op,...fields}=operation;body={...fields,id:randomUUID(),version:0,completed:false,deleted:false,linkProject:c.project_id};}
    else{
     const known=c.snapshot.tasks.find(t=>t.id===operation.id&&t.version===operation.version);
     const row=store.one("SELECT t.body FROM tasks t JOIN project_links l ON l.owner=t.owner AND l.resource_id=t.id AND l.kind='task' WHERE t.owner=? AND t.id=? AND l.project_id=? AND t.deleted=0",owner,operation.id,c.project_id);
     if(!known||!row)throw new Fault(409,'ACTION_SCOPE','Task is not in the authorized project snapshot');
     before=JSON.parse(row.body);if(before.version!==operation.version)throw new Fault(409,'VERSION_CONFLICT','Task changed; request a fresh proposal');
     const {op,...fields}=operation;body=operation.op==='delete'?{...taskBody(before),deleted:true}:{...taskBody(before),...fields};
    }
    const after=store.mutate(owner,randomUUID(),body);
    if(operation.op==='create'){store.run('INSERT INTO task_sources VALUES(?,?,?,?)',owner,after.id,id,index);after.sourceRunId=id;store.run('UPDATE tasks SET body=? WHERE owner=? AND id=?',JSON.stringify(after),owner,after.id);}
    receipt.push({op:operation.op,before,after});
   }
   store.run('UPDATE workbench_actions SET status=\'applied\',receipt=?,error=\'\',updated=? WHERE run_id=?',JSON.stringify({automatic,projectId:c.project_id,changes:receipt,at:Date.now()}),Date.now(),id);
   return service.get(owner,id);
  });}catch(error){store.run("UPDATE workbench_actions SET error=?,updated=? WHERE owner=? AND run_id=? AND status='pending'",error.code||'ACTION_FAILED',Date.now(),owner,id);throw error;}},
  dismiss(owner,id){const r=own(owner,id);if(r.status==='pending')store.run('UPDATE workbench_actions SET status=\'dismissed\',updated=? WHERE run_id=?',Date.now(),id);return service.get(owner,id);},
  undo(owner,id){return transaction(()=>{
   const r=own(owner,id);if(r.status==='undone')return service.get(owner,id);if(r.status!=='applied')throw new Fault(409,'ACTION_STATE','Nothing to undo');
   const receipt=JSON.parse(r.receipt);
   for(const change of receipt.changes){const current=store.one('SELECT version FROM tasks WHERE owner=? AND id=?',owner,change.after.id);if(current?.version!==change.after.version)throw new Fault(409,'VERSION_CONFLICT','Task changed after execution; undo would overwrite it');}
   for(const change of receipt.changes){const body=change.before?{...taskBody(change.before),version:change.after.version}:{...taskBody(change.after),deleted:true};store.mutate(owner,randomUUID(),body,{restore:true});}
   store.run('UPDATE workbench_actions SET status=\'undone\',updated=? WHERE run_id=?',Date.now(),id);return service.get(owner,id);
  });}
 };
 return service;
}
