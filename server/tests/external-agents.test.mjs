import {test} from 'node:test';
import assert from 'node:assert/strict';
import {externalAgents} from '../external-agents.mjs';

test('external CLI diagnostics distinguish terminal readiness from CLI installation',async()=>{
 const paths=[];
 const result=await externalAgents(async path=>{
  paths.push(path);
  if(path==='/openapi.json')return {paths:{'/api/tools/terminal/backends':{get:{}}},plugins:['openai-codex']};
  return {active:'docker',backends:[{name:'docker',status:'ready'}]};
 },'https://example.test');
 assert.deepEqual(paths,['/openapi.json','/api/tools/terminal/backends?profile=default']);
 assert.equal(result.terminal.status,'ready');
 assert.equal(result.management,'not_supported');
 assert.equal(result.items.length,3);
 for(const item of result.items){assert.equal(item.installed,null);assert.equal(item.authenticated,null);assert.equal(item.callable,null);assert.equal(item.installable,false);}
});
test('missing and failed terminal probes remain unknown, never installed or absent',async()=>{
 const missing=await externalAgents(async()=>({paths:{}}),'https://example.test');
 assert.equal(missing.terminal.status,'unknown');
 const failed=await externalAgents(async path=>{if(path==='/openapi.json')return {paths:{'/api/tools/terminal/backends':{get:{}}}};throw Object.assign(new Error('unavailable'),{code:'HERMES_AUTH'});},'https://example.test');
 assert.equal(failed.terminal.status,'unknown');assert.equal(failed.terminalError,'HERMES_AUTH');
 await assert.rejects(externalAgents(async()=>({}),'https://example.test'),{code:'CAPABILITY_FORMAT'});
});
