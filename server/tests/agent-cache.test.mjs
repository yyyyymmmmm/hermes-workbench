import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('agent cache deduplicates, serializes resources, revalidates stale data and drops previous-account responses',async()=>{
  let now=100000,visible=['catalog'],requests=[],pending=[],renders=0;
  const window={addEventListener(){},HermesViews:{esc:String,icon:()=>''}},document={addEventListener(){},querySelectorAll:()=>visible.map(id=>({dataset:{agentResource:id},querySelector:()=>null}))};
  class Clock extends Date{static now(){return now;}}
  runInNewContext(readFileSync(new URL('../../web/agent.js',import.meta.url),'utf8'),{window,document,Date:Clock,Set,Promise});
  const agent=window.HermesAgent,state={me:{user:{id:'alice'}},hermes:{connected:true,connectionId:'one'},tasks:[]};
  agent.configure({state,render(){renders++;agent.autoLoad();},notify(){},api(path){requests.push(path);return new Promise((resolve,reject)=>pending.push({resolve,reject}));}});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  agent.prepare();agent.autoLoad();agent.autoLoad();await tick();assert.equal(requests.length,1);
  pending.shift().resolve({items:[{id:'alpha',name:'Alpha',description:'',installed:false,enabled:false}],checkedAt:new Date().toISOString()});await tick();assert.equal(renders,1);
  agent.autoLoad();await tick();assert.equal(requests.length,1);assert.match(agent.panel('skills'),/Alpha/);
  now+=600001;agent.autoLoad();agent.autoLoad();await tick();assert.equal(requests.length,2);
  pending.shift().reject(Error('Offline'));await tick();assert.match(agent.panel('skills'),/Alpha/);agent.autoLoad();await tick();assert.equal(requests.length,2);
  state.hermes.connectionId='two';agent.prepare();agent.autoLoad();await tick();assert.equal(requests.length,3);assert.doesNotMatch(agent.panel('skills'),/Alpha/);
  state.me.user.id='bob';agent.prepare();agent.autoLoad();pending.shift().resolve({items:[{id:'private',name:'Alice private data',description:''}]});await tick();assert.doesNotMatch(agent.panel('skills'),/Alice private data/);assert.equal(requests.length,4);
  pending.shift().resolve({items:[]});await tick();visible=['memory','voice'];agent.autoLoad();await tick();assert.equal(requests.length,5);
  pending.shift().resolve({values:{}});await tick();assert.equal(requests.length,6);pending.shift().resolve({values:{}});await tick();assert.equal(requests.length,6);
});
