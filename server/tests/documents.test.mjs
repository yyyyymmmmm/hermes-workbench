import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../app.mjs';
import { database } from '../store.mjs';
import { documentService } from '../documents.mjs';
import { mockAuth,testConfig } from './fixtures.mjs';

test('documents: isolation, CSRF, idempotency, conflicts, versions, restart and purge tombstones',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'hermes-docs-')),config=testConfig(directory);
  let app=await createApp(config,{auth:mockAuth});
  const login=async username=>{const result=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:result.headers['set-cookie'].split(';')[0],'x-csrf-token':result.json().csrf};};
  const call=(headers,method,url,payload,key=randomUUID())=>app.inject({method,url,headers:{...headers,'idempotency-key':key},payload});
  try{
    const alice=await login('alice'),bob=await login('bob'),id=randomUUID(),key=randomUUID();
    const input={id,version:0,name:'notes.md',content:'# Personal notes',deleted:false};
    assert.equal((await call({...alice,'x-csrf-token':'wrong'},'POST','/api/documents',input)).statusCode,403);
    assert.equal((await call(alice,'POST','/api/documents',{...input,name:'../secret.md'})).statusCode,400);
    assert.equal((await call(alice,'POST','/api/documents',{...input,content:'中'.repeat(22000)})).statusCode,400);
    const created=await call(alice,'POST','/api/documents',input,key);assert.equal(created.statusCode,200,created.body);
    assert.equal(created.json().version,1);
    assert.deepEqual((await call(alice,'POST','/api/documents',input,key)).json(),created.json());
    assert.equal((await call(alice,'POST','/api/documents',{...input,content:'changed'},key)).statusCode,409);
    assert.equal((await call(alice,'POST','/api/documents',input)).statusCode,409);
    assert.equal((await call(bob,'GET',`/api/documents/${id}`)).statusCode,404);
    assert.equal((await call(bob,'GET',`/api/documents/${id}/versions`)).statusCode,404);
    assert.equal((await call(bob,'DELETE',`/api/documents/${id}`,{version:1,confirm:true})).statusCode,404);
    assert.equal((await call(bob,'GET','/api/documents')).json().documents.length,0);
    assert.equal((await call(alice,'DELETE',`/api/documents/${id}`,{version:1,confirm:true})).json().error.code,'DOCUMENT_NOT_TRASHED');
    for(let version=1;version<=22;version++){
      const saved=await call(alice,'POST','/api/documents',{...input,version,content:`revision ${version}`});assert.equal(saved.json().version,version+1,saved.body);
    }
    assert.equal((await call(alice,'GET',`/api/documents/${id}/versions`)).json().versions.length,20);
    assert.equal((await call(alice,'GET',`/api/documents/${id}/versions/1`)).statusCode,404);
    assert.equal((await call(alice,'GET',`/api/documents/${id}/versions/23`)).json().content,'revision 22');
    await app.close();app=await createApp(config,{auth:mockAuth});
    assert.equal((await call(alice,'GET',`/api/documents/${id}`)).json().version,23);
    const trash=await call(alice,'POST','/api/documents',{...input,version:23,deleted:true});assert.equal(trash.json().deleted,true);
    assert.equal((await call(alice,'DELETE',`/api/documents/${id}`,{version:23,confirm:true})).statusCode,409);
    assert.equal((await call(alice,'DELETE',`/api/documents/${id}`,{version:24,confirm:false})).statusCode,400);
    assert.equal((await call(alice,'DELETE',`/api/documents/${id}`,{version:24,confirm:true})).json().purged,true);
    assert.equal((await call(alice,'POST','/api/documents',input,key)).statusCode,404,'delayed retry cannot resurrect purged data');
    assert.equal((await call(alice,'GET',`/api/documents/${id}/versions/24`)).statusCode,404);
    assert.equal((await call(alice,'GET','/api/documents')).json().usage.bytes,0);
  }finally{await app.close();rmSync(directory,{recursive:true,force:true});}
});

test('document storage quota rolls back the content and its revision atomically',()=>{
  const directory=mkdtempSync(join(tmpdir(),'hermes-doc-quota-')),store=database(directory);
  try{
    const owner=store.user({username:'quota-user'}).id,service=documentService(store),content='x'.repeat(64000);
    let denied=false;
    for(let doc=0;doc<20&&!denied;doc++){
      const id=randomUUID();
      for(let version=0;version<20;version++){
        try{service.save(owner,randomUUID(),{id,version,name:'quota.txt',content,deleted:false});}
        catch(error){assert.equal(error.code,'DOCUMENT_QUOTA');denied=true;assert.equal(service.get(owner,id).version,version);break;}
      }
    }
    assert.equal(denied,true);assert.ok(service.list(owner).usage.bytes<=20*1024*1024);
  }finally{store.db.close();rmSync(directory,{recursive:true,force:true});}
});
