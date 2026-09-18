import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {createApp} from '../app.mjs';
import {database} from '../store.mjs';
import {testConfig,mockAuth} from './fixtures.mjs';

test('conversation search covers old titles and messages, paginates and isolates accounts',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-search-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth});
 let store;
 try{
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {id:r.json().user.id,headers:{cookie:r.headers['set-cookie'].split(';')[0]}};};
  const alice=await login('alice'),bob=await login('bob');store=database(dir);
  for(let n=0;n<125;n++)store.run('INSERT INTO conversations(id,owner,connection_id,title,created) VALUES(?,?,?,?,?)',randomUUID(),alice.id,'test',`Searchable ${n}`,n);
  const id=randomUUID();store.run('INSERT INTO conversations(id,owner,connection_id,title,created) VALUES(?,?,?,?,?)',id,alice.id,'test','Hidden title',0);
  store.run('INSERT INTO runs(id,owner,conversation_id,request_key,fingerprint,prompt,status,output,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',randomUUID(),alice.id,id,randomUUID(),'test','Question','completed','Needle in reply',0,0);
  const search=(q,offset=0,headers=alice.headers)=>app.inject({url:`/api/conversations/search?q=${encodeURIComponent(q)}&offset=${offset}`,headers});
  assert.equal((await search('Searchable')).json().items.length,20);assert.equal((await search('Searchable')).json().hasMore,true);
  assert.equal((await search('Searchable',120)).json().items.length,5);
  assert.equal((await search('Needle')).json().items[0].id,id);
  assert.equal((await search('Searchable',0,bob.headers)).json().items.length,0);
  assert.equal((await search('')).statusCode,400);
 }finally{store?.db.close();await app.close();rmSync(dir,{recursive:true,force:true});}
});
