import { z } from 'zod';
import { Fault, hash } from './core.mjs';
import { attachmentSchema, validateAttachments } from './attachments.mjs';

export const documentSchema=attachmentSchema.extend({id:z.uuid(),version:z.number().int().min(0),deleted:z.boolean().default(false)}).strict();
const LIMIT=20*1024*1024;
export function documentService(store){
  const clean=row=>({...row,deleted:Boolean(row.deleted)});
  function get(owner,id,version){
    const row=version===undefined?store.one('SELECT id,name,content,bytes,version,deleted,updated FROM documents WHERE owner=? AND id=? AND purged=0',owner,id):store.one('SELECT id,name,content,bytes,version,deleted,updated FROM document_versions WHERE owner=? AND id=? AND version=?',owner,id,version);
    if(!row)throw new Fault(404,'DOCUMENT_NOT_FOUND','Document or version not found');
    return clean(row);
  }
  return {
    get,
    list(owner){return {documents:store.all('SELECT id,name,bytes,version,deleted,updated FROM documents WHERE owner=? AND purged=0 ORDER BY updated DESC,id',owner).map(clean),usage:{bytes:store.one('SELECT COALESCE(SUM(bytes),0) AS bytes FROM document_versions WHERE owner=?',owner).bytes,limit:LIMIT,maxDocuments:200}};},
    versions(owner,id){get(owner,id);return {versions:store.all('SELECT version,name,bytes,deleted,updated FROM document_versions WHERE owner=? AND id=? ORDER BY version DESC LIMIT 20',owner,id).map(clean)};},
    purge(owner,id,version){
      store.db.exec('BEGIN IMMEDIATE');
      try{
        const row=get(owner,id);
        if(row.version!==version)throw new Fault(409,'DOCUMENT_CONFLICT','Document changed on another device');
        if(!row.deleted)throw new Fault(409,'DOCUMENT_NOT_TRASHED','Move the document to trash first');
        store.run('DELETE FROM document_versions WHERE owner=? AND id=?',owner,id);
        // Keep a content-free tombstone so delayed writes cannot recreate a purged document.
        store.run("UPDATE documents SET name='',content='',bytes=0,version=version+1,purged=1,updated=? WHERE owner=? AND id=?",Date.now(),owner,id);
        store.db.exec('COMMIT');return {purged:true};
      }catch(error){if(store.db.isTransaction)store.db.exec('ROLLBACK');throw error;}
    },
    save(owner,key,raw){
      const input=documentSchema.parse(raw);validateAttachments([{name:input.name,content:input.content}]);
      const fingerprint=hash(JSON.stringify(input));
      store.db.exec('BEGIN IMMEDIATE');
      try{
        const existing=store.one('SELECT version,purged FROM documents WHERE owner=? AND id=?',owner,input.id);
        if(existing?.purged)throw new Fault(404,'DOCUMENT_NOT_FOUND','Document permanently removed');
        const prior=store.one('SELECT fingerprint,result FROM document_mutations WHERE owner=? AND key=?',owner,key);
        if(prior){if(prior.fingerprint!==fingerprint)throw new Fault(409,'IDEMPOTENCY_CONFLICT','Request key already used');store.db.exec('COMMIT');return {...input,...JSON.parse(prior.result)};}
        if((existing?.version||0)!==input.version)throw new Fault(409,'DOCUMENT_CONFLICT','Document changed on another device');
        if(!existing&&input.deleted)throw new Fault(404,'DOCUMENT_NOT_FOUND','Document not found');
        if(!existing&&store.one('SELECT COUNT(*) AS count FROM documents WHERE owner=? AND purged=0',owner).count>=200)throw new Fault(409,'DOCUMENT_QUOTA','Document count quota reached');
        const result={version:input.version+1,bytes:Buffer.byteLength(input.content,'utf8'),updated:Date.now()};
        store.run('INSERT INTO documents(owner,id,name,content,bytes,version,deleted,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,id) DO UPDATE SET name=excluded.name,content=excluded.content,bytes=excluded.bytes,version=excluded.version,deleted=excluded.deleted,updated=excluded.updated',owner,input.id,input.name,input.content,result.bytes,result.version,Number(input.deleted),result.updated);
        store.run('INSERT INTO document_versions VALUES(?,?,?,?,?,?,?,?)',owner,input.id,result.version,input.name,input.content,result.bytes,Number(input.deleted),result.updated);
        store.run('DELETE FROM document_versions WHERE owner=? AND id=? AND version<=?',owner,input.id,result.version-20);
        if(store.one('SELECT COALESCE(SUM(bytes),0) AS bytes FROM document_versions WHERE owner=?',owner).bytes>LIMIT)throw new Fault(409,'DOCUMENT_QUOTA','Document storage quota reached');
        store.run('INSERT INTO document_mutations VALUES(?,?,?,?)',owner,key,fingerprint,JSON.stringify(result));
        store.db.exec('COMMIT');return {...input,...result};
      }catch(error){if(store.db.isTransaction)store.db.exec('ROLLBACK');throw error;}
    }
  };
}
