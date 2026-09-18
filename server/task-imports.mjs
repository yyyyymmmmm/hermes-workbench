import {randomUUID} from 'node:crypto';
import {marked} from 'marked';
import {z} from 'zod';
import {Fault,hash} from './core.mjs';

const itemSchema=z.object({index:z.number().int().min(0).max(29),title:z.string().trim().min(1).max(300),scheduledAt:z.iso.datetime({offset:true}).nullable(),minutes:z.number().int().min(5).max(1440),timeZone:z.string().max(100).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}})}).strict();
const inputSchema=z.object({confirm:z.literal(true),projectId:z.uuid().optional(),items:z.array(itemSchema).min(1).max(30)}).strict().refine(v=>new Set(v.items.map(i=>i.index)).size===v.items.length);

// Only explicit Markdown checkboxes are proposals. Prose, code and tool output are never commands.
export function checklist(output){
  const items=[];
  const plain=tokens=>(tokens||[]).map(t=>t.type==='html'?'':t.tokens?plain(t.tokens):t.text||'').join('');
  marked.walkTokens(marked.lexer(output),token=>{
    if(token.type!=='list_item'||!token.task)return;
    const title=plain(token.tokens.filter(t=>t.type!=='list')).replace(/\s+/g,' ').trim();
    if(title&&!token.checked)items.push({index:items.length,title:title.slice(0,300),truncated:title.length>300});
  });
  if(items.length>30)throw new Fault(422,'TASK_PLAN_LIMIT','Reply contains more than 30 proposed tasks');
  return items;
}
export function taskImportService(store){
  const binding=(owner,id)=>store.one('SELECT c.project_id FROM conversations c JOIN runs r ON r.conversation_id=c.id WHERE r.owner=? AND r.id=?',owner,id)?.project_id||null;
  function read(owner,id){
    const run=store.one('SELECT status,output FROM runs WHERE owner=? AND id=?',owner,id);
    if(!run)throw new Fault(404,'RUN_NOT_FOUND','Run was not found');
    if(run.status!=='completed')throw new Fault(409,'TASK_PLAN_NOT_READY','Only completed replies can be imported');
    if(store.one('SELECT run_id FROM workbench_actions WHERE owner=? AND run_id=?',owner,id))throw new Fault(409,'ACTION_STATE','Use the structured proposal receipt for this reply');
    return checklist(run.output);
  }
  return {
    list(owner,id){return {projectId:binding(owner,id),items:read(owner,id).map(item=>({...item,taskId:store.one('SELECT task_id FROM task_sources WHERE owner=? AND run_id=? AND item=?',owner,id,item.index)?.task_id||null}))};},
    apply(owner,id,key,raw){
      const input=inputSchema.parse(raw),fingerprint=hash(JSON.stringify({id,input}));
      const projectId=binding(owner,id);if(projectId&&input.projectId&&projectId!==input.projectId)throw new Fault(409,'ACTION_SCOPE','Project conversation cannot write to another project');if(projectId)input.projectId=projectId;
      store.db.exec('BEGIN IMMEDIATE');
      try{
        const receipt=store.one('SELECT * FROM task_imports WHERE owner=? AND key=?',owner,key);
        if(receipt){if(receipt.fingerprint!==fingerprint)throw new Fault(409,'IDEMPOTENCY_CONFLICT','Import key already used');store.db.exec('COMMIT');return JSON.parse(receipt.response);}
        const proposals=read(owner,id);
        const tasks=[];
        for(const item of input.items){
          if(!proposals.some(p=>p.index===item.index))throw new Fault(400,'INVALID_INPUT','Unknown proposal');
          if(store.one('SELECT task_id FROM task_sources WHERE owner=? AND run_id=? AND item=?',owner,id,item.index))throw new Fault(409,'TASK_PLAN_IMPORTED','A selected item was already imported');
          const {index,...fields}=item;
          const task=store.mutate(owner,randomUUID(),{...fields,id:randomUUID(),version:0,completed:false,deleted:false,...(input.projectId?{linkProject:input.projectId}:{})});
          store.run('INSERT INTO task_sources VALUES(?,?,?,?)',owner,task.id,id,index);
          task.sourceRunId=id;
          store.run('UPDATE tasks SET body=? WHERE owner=? AND id=?',JSON.stringify(task),owner,task.id);
          tasks.push(task);
        }
        const result={tasks};
        store.run('INSERT INTO task_imports VALUES(?,?,?,?)',owner,key,fingerprint,JSON.stringify(result));
        store.db.exec('COMMIT');return result;
      }catch(error){if(store.db.isTransaction)store.db.exec('ROLLBACK');throw error;}
    }
  };
}
