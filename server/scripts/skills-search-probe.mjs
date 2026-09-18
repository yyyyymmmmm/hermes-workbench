import {configuration,vault} from '../core.mjs';
import {database} from '../store.mjs';
import {hermesAdapter} from '../hermes.mjs';
import {request} from '../network.mjs';
const config=configuration(),store=database(config.dataDir);
try{
 const rows=store.all('SELECT owner FROM connections WHERE origin=?',process.argv[2]);
 if(rows.length!==1)throw new Error('Exactly one configured connection is required');
 const adapter=hermesAdapter(config,store,vault(config.dataDir),async(url,options)=>{
  const response=await request(url,options),path=new URL(url).pathname;
  if(path.startsWith('/api/skills/hub/')){
   let data;try{data=JSON.parse(response.text);}catch{}
   console.log(JSON.stringify({path,status:response.status,keys:Object.keys(data||{}),indexAvailable:data?.index_available,timedOut:data?.timed_out,sourceCounts:data?.source_counts,sources:data?.sources?.map?.(s=>({id:s.id,name:s.name,label:s.label,description:s.description,keys:Object.keys(s)})),results:(data?.results||data?.featured||[]).slice(0,4).map(s=>({identifier:s.identifier,name:s.name,source:s.source})),total:(data?.results||data?.featured||[]).length}));
  }return response;
 });
 for(const q of ['',process.argv[3]||'calendar']){try{const r=await adapter.skillsHub(rows[0].owner,'search',{q});console.log(JSON.stringify({q,accepted:r.items.length}));}catch(error){console.log(JSON.stringify({q,error:error.code||'PROBE_FAILED'}));}}
}finally{store.db.close();}
