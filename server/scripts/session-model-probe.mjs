import {configuration,vault} from '../core.mjs';
import {database} from '../store.mjs';
import {hermesAdapter} from '../hermes.mjs';
import {openGateway} from '../gateway.mjs';
const config=configuration(),store=database(config.dataDir);let client;
try{
 const rows=store.all('SELECT owner FROM connections WHERE origin=?',process.argv[2]);if(rows.length!==1)throw new Error('Exactly one connection required');
 const row=store.one('SELECT runtime_id FROM runs WHERE owner=? AND runtime_id IS NOT NULL ORDER BY created DESC LIMIT 1',rows[0].owner);if(!row)throw new Error('No runtime to inspect');
 const adapter=hermesAdapter(config,store,vault(config.dataDir)),ticket=await adapter.ticket(rows[0].owner);
 client=await openGateway(ticket,config.privateHosts,()=>{},()=>{});
 const result=await client.rpc('session.status',{session_id:row.runtime_id,profile:'default'});
 console.log(JSON.stringify({keys:Object.keys(result),model:typeof result.model==='string'?result.model:undefined,provider:typeof result.provider==='string'?result.provider:undefined,sessionKeys:Object.keys(result.session||{})}));
}catch(error){console.log(JSON.stringify({error:error.code||'PROBE_FAILED'}));}finally{client?.close();store.db.close();}
