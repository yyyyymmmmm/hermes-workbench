import { configuration,vault } from '../core.mjs';
import { database } from '../store.mjs';
import { hermesAdapter } from '../hermes.mjs';
const config=configuration(),store=database(config.dataDir);
try{
  const rows=store.all('SELECT owner FROM connections WHERE origin=?',process.argv[2]);
  if(rows.length!==1)throw new Error('Exactly one configured connection for this origin is required. No credentials were read or printed.');
  const adapter=hermesAdapter(config,store,vault(config.dataDir));
  for(const section of ['tools','skills','mcp','memory','schedules','voice']){
    try{const result=await adapter.inspect(rows[0].owner,section);console.log(JSON.stringify({section,status:'available',count:result.items?.length,fields:result.values?Object.keys(result.values):undefined}));}
    catch(error){console.log(JSON.stringify({section,status:'unavailable',code:error.code||'PROBE_FAILED'}));}
  }
}finally{store.db.close();}
