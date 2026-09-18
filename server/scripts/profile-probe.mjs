import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {CookieJar} from 'tough-cookie';
import {configuration,vault} from '../core.mjs';
import {request} from '../network.mjs';
const c=configuration(),db=new DatabaseSync(join(c.dataDir,'workbench.sqlite'),{readOnly:true});
try{
 const rows=db.prepare('SELECT owner,origin,jar FROM connections WHERE origin=?').all(process.argv[2]);
 if(rows.length!==1)throw Error('Expected one connection');
 const r=rows[0],jar=await CookieJar.deserialize(JSON.parse(vault(c.dataDir).open(r.owner,r.jar)));
 const get=async path=>{const url=r.origin+path,res=await request(url,{method:'GET',privateHosts:c.privateHosts,headers:{accept:'application/json',cookie:await jar.getCookieString(url)}});if(res.status!==200)throw Error('Read failed');return JSON.parse(res.text);};
 const schema=await get('/openapi.json');
 for(const path of ['/api/profiles','/api/profiles/{name}','/api/profiles/{name}/soul','/api/profiles/{name}/description','/api/profiles/{name}/model','/api/tools/toolsets/{name}']){
  const entry=schema.paths[path];console.log(JSON.stringify({path,entry}));
  for(const op of Object.values(entry||{})){const ref=op.requestBody?.content?.['application/json']?.schema?.$ref;if(ref)console.log(JSON.stringify({ref,schema:schema.components.schemas[ref.split('/').at(-1)]}));}
 }
 const list=await get('/api/profiles');console.log(JSON.stringify({listKeys:Object.keys(list),profiles:(list.profiles||[]).map(p=>({keys:Object.keys(p),name:p.name,model:p.model,active:p.active}))}));
 const soul=await get('/api/profiles/default/soul');console.log(JSON.stringify({soulFields:Object.keys(soul)}));
 const raw=await get('/api/config?profile=default'),config=raw.config||raw;for(const key of ['agent','delegation'])console.log(JSON.stringify({group:key,fields:Object.entries(config[key]||{}).filter(([k])=>/max_|timeout|enabled/.test(k)).map(([name,value])=>({name,type:typeof value}))}));
}catch(e){console.log(JSON.stringify({code:e.code||e.message||'PROBE_FAILED'}));process.exitCode=1;}finally{db.close();}
