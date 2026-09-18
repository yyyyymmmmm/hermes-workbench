import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createApp} from '../app.mjs';
import {testConfig,mockAuth,skillFixture} from './fixtures.mjs';
import {skillHubService} from '../skills-hub.mjs';
test('skill catalog distinguishes source timeout, invalid identifiers and genuine empty results',async()=>{
 const service=skillHubService();let response={results:[],timed_out:['official']};
 const call=async path=>path.startsWith('/api/skills/hub/')?response:{skills:[]};
 const search=()=>service({owner:'test',connection:'test',call},'search',{q:'frontend'});
 await assert.rejects(search,e=>e.code==='SKILL_SEARCH_TIMEOUT');
 response={results:[{identifier:'unsupported/format'}],timed_out:[]};await assert.rejects(search,e=>e.code==='CAPABILITY_FORMAT');
 response={results:[],timed_out:[]};const empty=await search();assert.deepEqual(empty.items,[]);assert.equal(empty.sourceLabel,'Official (Nous)');
});
test('skill install requires matching safe review, confirmation and provenance readback',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-hub-')),config=testConfig(dir),f=skillFixture();let app=await createApp(config,{auth:mockAuth,hermesTransport:f.transport});
 try{
  const login=async username=>{const r=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.origin},payload:{username,password:'test-password'}});return {origin:config.origin,cookie:r.headers['set-cookie'].split(';')[0],'x-csrf-token':r.json().csrf};};
  const a=await login('alice'),b=await login('bob'),post=(action,payload,headers=a)=>app.inject({method:'POST',url:'/api/hermes/skills-hub/'+action,headers,payload});
  for(const headers of [a,b])await app.inject({method:'POST',url:'/api/hermes/connect',headers,payload:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  assert.equal((await post('review',{identifier:'https://127.0.0.1/internal'})).statusCode,400);
  assert.equal((await post('search',{q:''})).json().items.length,1);
  let review=(await post('review',{identifier:f.id})).json();assert.equal(review.allowed,true);
  assert.equal((await post('install',{reviewId:review.reviewId,confirm:true},b)).json().error.code,'SKILL_REVIEW_EXPIRED');
  assert.equal((await post('install',{reviewId:review.reviewId,confirm:false})).statusCode,400);
  assert.equal((await post('install',{reviewId:review.reviewId,confirm:true},{...a,'x-csrf-token':'bad'})).statusCode,403);
  f.state.changed=true;assert.equal((await post('install',{reviewId:review.reviewId,confirm:true})).json().error.code,'SKILL_CHANGED');assert.equal(f.state.writes,0);
  f.state.unsafe=true;review=(await post('review',{identifier:f.id})).json();assert.equal(review.allowed,false);
  assert.equal((await post('install',{reviewId:review.reviewId,confirm:true})).json().error.code,'SKILL_BLOCKED');assert.equal(f.state.writes,0);
  f.state.unsafe=false;review=(await post('review',{identifier:f.id})).json();const installed=await post('install',{reviewId:review.reviewId,confirm:true});assert.equal(installed.statusCode,200);assert.equal(installed.json().verified,true);
  assert.equal((await post('install',{reviewId:review.reviewId,confirm:true})).json().error.code,'SKILL_REVIEW_EXPIRED');assert.equal(f.state.writes,1);
  f.state.installed=false;f.state.unverified=true;review=(await post('review',{identifier:f.id})).json();assert.equal((await post('install',{reviewId:review.reviewId,confirm:true})).json().error.code,'SKILL_INSTALL_UNVERIFIED');
  assert.equal((await post('install',{reviewId:review.reviewId,confirm:true})).json().error.code,'SKILL_REVIEW_EXPIRED');assert.equal(f.state.writes,2);
 }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
