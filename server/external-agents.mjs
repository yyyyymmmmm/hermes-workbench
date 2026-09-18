import {Fault} from './core.mjs';
const candidates=[{id:'codex',name:'Codex',vendor:'OpenAI'},{id:'claude',name:'Claude Code',vendor:'Anthropic'},{id:'opencode',name:'OpenCode',vendor:'OpenCode'}];
export async function externalAgents(call,origin){
 const schema=await call('/openapi.json');
 if(!schema.paths||typeof schema.paths!=='object')throw new Fault(502,'CAPABILITY_FORMAT','Gateway returned no API schema');
 let terminal={status:'unknown',backend:null},terminalError=null;
 if(schema.paths['/api/tools/terminal/backends']?.get){
  try{const data=await call('/api/tools/terminal/backends?profile=default');if(!Array.isArray(data.backends))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported terminal status');const active=data.backends.find(b=>b.name===data.active||b.active===true);terminal={backend:typeof data.active==='string'?data.active.slice(0,100):null,status:['ready','needs_setup','unavailable'].includes(active?.status)?active.status:'unknown'};}
  catch(error){terminalError=error.code||'UPSTREAM_UNAVAILABLE';}
 }
 // Generic plugins and model providers are not installed external coding CLIs.
 return {origin,checkedAt:new Date().toISOString(),terminal,terminalError,management:'not_supported',items:candidates.map(item=>({...item,installed:null,version:null,authenticated:null,callable:null,installable:false}))};
}
