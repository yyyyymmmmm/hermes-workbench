import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
import {CookieJar} from 'tough-cookie';
import {configuration,vault} from '../core.mjs';
import {request} from '../network.mjs';
const c=configuration(),db=new DatabaseSync(join(c.dataDir,'workbench.sqlite'),{readOnly:true});
try{
 const rows=db.prepare('SELECT owner,origin,jar FROM connections WHERE origin=?').all(process.argv[2]);if(rows.length!==1)throw Error('Expected one connection');
 const r=rows[0],jar=await CookieJar.deserialize(JSON.parse(vault(c.dataDir).open(r.owner,r.jar)));
 const get=async path=>{const url=r.origin+path,res=await request(url,{method:'GET',privateHosts:c.privateHosts,headers:{accept:'application/json',cookie:await jar.getCookieString(url)}});if(res.status!==200)throw Error('Read failed');return JSON.parse(res.text);};
 const schema=await get('/openapi.json');
 console.log(JSON.stringify({executionPaths:Object.entries(schema.paths||{}).filter(([p])=>/terminal|shell|exec|process|pty/.test(p))}));
 const hub=await get('/api/dashboard/plugins/hub');for(const p of hub.plugins||[])if(/codex|claude|coding|opencode|kimi|acp/i.test(p.name))console.log(JSON.stringify({plugin:p}));
 const tools=await get('/api/tools/toolsets?profile=default');console.log(JSON.stringify({agentTools:(tools.toolsets||[]).filter(p=>/codex|claude|coding|opencode|kimi|acp/i.test(JSON.stringify(p))).map(p=>({name:p.name,enabled:p.enabled,tools:p.tools,description:p.description}))}));
 console.log(JSON.stringify({dashboardPaths:Object.keys(schema.paths||{}).filter(p=>/dashboard|codex|claude|acp|plugin/.test(p))}));
 for(const path of ['/api/dashboard/plugins','/api/dashboard/plugins/hub']){const data=await get(path);console.log(JSON.stringify({path,keys:Object.keys(data),shape:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,Array.isArray(v)?v.slice(0,30).map(x=>typeof x==='object'?Object.fromEntries(Object.entries(x).filter(([f])=>['name','id','identifier','description','version','enabled','installed','source','tools','type','status'].includes(f))):typeof x):typeof v]))}));}
 for(const [path,entry] of Object.entries(schema.paths||{}).filter(([p])=>/agent-plugin|coding.agent|dashboard\/.*agent/.test(p))){console.log(JSON.stringify({path,entry}));for(const op of Object.values(entry)){const ref=op.requestBody?.content?.['application/json']?.schema?.$ref;if(ref)console.log(JSON.stringify({ref,schema:schema.components.schemas[ref.split('/').at(-1)]}));}}
}catch(e){console.log(JSON.stringify({code:e.code||e.message||'PROBE_FAILED'}));process.exitCode=1;}finally{db.close();}
