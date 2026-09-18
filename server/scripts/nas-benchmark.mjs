import {performance} from 'node:perf_hooks';
import {configuration,vault} from '../core.mjs';
import {database} from '../store.mjs';
import {hermesAdapter} from '../hermes.mjs';
import {openGateway} from '../gateway.mjs';
import {gatewayPool} from '../gateway-pool.mjs';
const config=configuration(),store=database(config.dataDir),hermes=hermesAdapter(config,store,vault(config.dataDir));
const origin=process.argv[2];
const pool=gatewayPool((ticket,receive,closed)=>openGateway(ticket,config.privateHosts,receive,closed));
try{
 const rows=store.all('SELECT owner,id FROM connections WHERE origin=?',origin);
 if(rows.length!==1)throw new Error('Select one uniquely configured NAS connection');
 const {owner,id}=rows[0];
 if(store.one("SELECT id FROM runs WHERE owner=? AND status IN ('queued','running','approval','stopping','unknown')",owner))throw new Error('Active workbench run; benchmark postponed');
 for(const mode of ['direct-cold','pool-cold','pool-warm']){
  let start;let firstEvent=null,firstText=null,runtime,finish,fail,timer,client,bytes=0;
  const completed=new Promise((resolve,reject)=>{finish=resolve;fail=reject;});completed.catch(()=>{});
  const receive=frame=>{if(frame.method!=='event'||!runtime||frame.params?.session_id!==runtime)return;const {type,payload={}}=frame.params;if(firstEvent===null)firstEvent=performance.now()-start;if(type==='message.delta'&&payload.text){firstText??=performance.now()-start;bytes+=Buffer.byteLength(payload.text);}if(type==='message.complete'){if(payload.text){firstText??=performance.now()-start;bytes=Buffer.byteLength(payload.text);}finish(payload.status);}if(type==='error')fail(new Error('Remote inference failed'));};
  try{
   const before=(await hermes.models(owner)).current;
   start=performance.now();
   const ticket=()=>hermes.ticket(owner);
   client=mode==='direct-cold'?await openGateway(await ticket(),config.privateHosts,receive,()=>fail(new Error('Disconnected'))):await pool.acquire(id,ticket,receive,()=>fail(new Error('Disconnected')));
   const connected=performance.now()-start;
   const session=await client.rpc('session.create',{cols:72,source:'desktop',profile:'default'});runtime=session.session_id;
   timer=setTimeout(()=>fail(new Error('Benchmark timeout')),60000);
   await client.rpc('prompt.submit',{session_id:runtime,profile:'default',text:'This is a latency test. Do not call tools, access files, or modify anything. Reply with exactly: HERMES_OK'});
   const status=await completed;
   const totalMs=Math.round(performance.now()-start),after=(await hermes.models(owner)).current;
   console.log(JSON.stringify({mode,reused:client.reused===true,model:session.model||null,configuredModel:before?.model,configurationStable:JSON.stringify(before)===JSON.stringify(after),provider:session.provider||before?.provider||null,connectMs:Math.round(connected),firstEventMs:Math.round(firstEvent||0),firstTextMs:firstText===null?null:Math.round(firstText),totalMs,bytes,status}));
   client.close({reuse:true});
  }catch(error){if(runtime)await client?.rpc('session.interrupt',{session_id:runtime,profile:'default'}).catch(()=>{});client?.close();throw error;}finally{clearTimeout(timer);}
 }
}catch(error){console.error(JSON.stringify({failed:true,code:error.code||'BENCHMARK_FAILED',message:error.code?'Connection or inference failed':error.message}));process.exitCode=1;}finally{pool.close();store.db.close();}
