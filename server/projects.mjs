import {z} from 'zod';
import {Fault} from './core.mjs';
const schema=z.object({id:z.uuid(),version:z.number().int().min(0),name:z.string().trim().min(1).max(100),description:z.string().trim().max(2000),archived:z.boolean()}).strict();
export function projectService(store){
  function get(owner,id){const row=store.one('SELECT * FROM projects WHERE owner=? AND id=?',owner,id);if(!row)throw new Fault(404,'PROJECT_UNAVAILABLE','Project not found');return row;}
  function transact(work){store.db.exec('BEGIN IMMEDIATE');try{const result=work();store.db.exec('COMMIT');return result;}catch(error){if(store.db.isTransaction)store.db.exec('ROLLBACK');throw error;}}
  return {
    list(owner){return {projects:store.all('SELECT id,name,description,archived,version,updated FROM projects WHERE owner=? ORDER BY updated DESC,id',owner).map(p=>({...p,archived:Boolean(p.archived),taskIds:store.all("SELECT l.resource_id FROM project_links l JOIN tasks t ON t.owner=l.owner AND t.id=l.resource_id WHERE l.owner=? AND l.project_id=? AND l.kind='task' AND t.deleted=0",owner,p.id).map(r=>r.resource_id),documents:store.all("SELECT d.id,d.name,d.version FROM project_links l JOIN documents d ON d.owner=l.owner AND d.id=l.resource_id WHERE l.owner=? AND l.project_id=? AND l.kind='document' AND d.deleted=0 AND d.purged=0",owner,p.id)}))};},
    save(owner,raw){const p=schema.parse(raw);return transact(()=>{
      const existing=store.one('SELECT version FROM projects WHERE owner=? AND id=?',owner,p.id);
      if((existing?.version||0)!==p.version)throw new Fault(409,'PROJECT_CONFLICT','Project changed. Reload before saving');
      if(!existing&&store.one('SELECT COUNT(*) AS n FROM projects WHERE owner=?',owner).n>=200)throw new Fault(409,'PROJECT_LIMIT','Project limit reached');
      store.run('INSERT INTO projects VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,description=excluded.description,archived=excluded.archived,version=excluded.version,updated=excluded.updated',owner,p.id,p.name,p.description,Number(p.archived),p.version+1,Date.now());
      return {id:p.id,version:p.version+1};
    });},
    link(owner,id,raw){const input=z.object({version:z.number().int().positive(),kind:z.enum(['task','document']),resourceId:z.uuid(),linked:z.boolean()}).strict().parse(raw);return transact(()=>{
      const p=get(owner,id);if(p.version!==input.version)throw new Fault(409,'PROJECT_CONFLICT','Project changed. Reload before saving');
      if(p.archived)throw new Fault(409,'PROJECT_UNAVAILABLE','Project archived');
      const resource=input.kind==='task'?store.one('SELECT id FROM tasks WHERE owner=? AND id=? AND deleted=0',owner,input.resourceId):store.one('SELECT id FROM documents WHERE owner=? AND id=? AND deleted=0 AND purged=0',owner,input.resourceId);
      if(!resource)throw new Fault(404,'RESOURCE_UNAVAILABLE','Resource not available');
      if(input.linked)store.run('INSERT OR IGNORE INTO project_links VALUES(?,?,?,?)',owner,id,input.kind,input.resourceId);
      else store.run('DELETE FROM project_links WHERE owner=? AND project_id=? AND kind=? AND resource_id=?',owner,id,input.kind,input.resourceId);
      store.run('UPDATE projects SET version=version+1,updated=? WHERE owner=? AND id=?',Date.now(),owner,id);
      return {version:p.version+1};
    });}
  };
}
