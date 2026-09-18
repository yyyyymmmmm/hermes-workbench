import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gatewayPool} from '../gateway-pool.mjs';
test('gateway leases reuse only released healthy scoped sockets and never replay RPCs',async()=>{
 let opens=0,tickets=0,closes=0;const receive=[];
 const pool=gatewayPool(async(_ticket,onFrame)=>{opens++;receive.push(onFrame);return {rpc:async value=>value,respond:async()=>{},close:()=>closes++};},{idleMs:10});
 try{
  const ticket=async()=>{tickets++;return {};};let seen=0;
  const a=await pool.acquire('alice/connection/session',ticket,()=>seen++,()=>{});assert.equal(a.reused,false);
  await assert.rejects(pool.acquire('alice/connection/session',ticket,()=>{},()=>{}));
  a.close({reuse:true});receive[0]({});assert.equal(seen,0);
  const next=await pool.acquire('alice/connection/session',ticket,()=>seen++,()=>{});assert.equal(next.reused,true);receive[0]({});assert.equal(seen,1);assert.equal(tickets,1);
  const b=await pool.acquire('bob/connection/session',ticket,()=>{},()=>{});assert.equal(opens,2);b.close();next.close();
  const fresh=await pool.acquire('alice/connection/session',ticket,()=>{},()=>{});assert.equal(fresh.reused,false);fresh.close({reuse:true});await new Promise(r=>setTimeout(r,20));assert.equal(closes,3);
 }finally{pool.close();}
});
