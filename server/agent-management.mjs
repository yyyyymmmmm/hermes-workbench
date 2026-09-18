import { Fault } from './core.mjs';
const paths={catalog:'/api/mcp/catalog?profile=default',tools:'/api/tools/toolsets',skills:'/api/skills',mcp:'/api/mcp/servers',schedules:'/api/cron/jobs?profile=default',memory:'/api/config?profile=default',voice:'/api/config?profile=default'};
const str=(v,max=1000)=>typeof v==='string'?v.slice(0,max):'';
export function managementPath(section){if(!Object.hasOwn(paths,section))throw new Fault(404,'CAPABILITY_NOT_FOUND','Unknown capability');return paths[section];}
export function managementView(section,data){
  if(section==='catalog'){
    if(!Array.isArray(data?.entries))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported MCP catalog');
    return {items:data.entries.filter(v=>v&&typeof v.name==='string').map(v=>({id:str(v.name,200),name:str(v.name,200),description:str(v.description),transport:str(v.transport,100),auth:str(v.auth_type,40),status:v.installed?'installed':'',installed:v.installed===true,enabled:typeof v.enabled==='boolean'?v.enabled:null,tools:[],installable:v.installed===false&&v.needs_install===false&&v.transport==='http'&&Array.isArray(v.required_env)&&v.required_env.length===0,notes:str(v.post_install,2000)}))};
  }
  if(['memory','voice'].includes(section)){
    const c=data.config||data;if(!c||typeof c!=='object'||Array.isArray(c))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported configuration format');
    const values=section==='memory'?{memoryEnabled:c.memory?.memory_enabled,userProfileEnabled:c.memory?.user_profile_enabled,memoryLimit:c.memory?.memory_char_limit,userLimit:c.memory?.user_char_limit,compressionEnabled:c.compression?.enabled,approvalMode:c.approvals?.mode}: {sttEnabled:c.stt?.enabled,sttProvider:c.stt?.provider,ttsProvider:c.tts?.provider,voice:c.tts?.[c.tts?.provider]?.voice||c.tts?.[c.tts?.provider]?.voice_id};
    // Never forward raw config: it may include provider credentials and command environments.
    return {values:Object.fromEntries(Object.entries(values).filter(([,v])=>['string','number','boolean'].includes(typeof v)).map(([k,v])=>[k,typeof v==='string'?v.slice(0,150):v]))};
  }
  const keys={tools:['toolsets','items','data'],skills:['skills','items','data'],mcp:['servers','items','data'],schedules:['jobs','items','data']}[section];
  const items=Array.isArray(data)?data:keys.map(k=>data?.[k]).find(Array.isArray)||keys.map(k=>data?.data?.[k]).find(Array.isArray);
  if(!items)throw new Fault(502,'CAPABILITY_FORMAT','Unsupported capability list');
  return {items:items.filter(v=>v&&typeof v==='object').map(v=>({id:str(v.id||v.name||v.key,200),name:str(v.name||v.label||v.id||v.key,200),description:str(v.description||v.summary),enabled:typeof(v.enabled??v.active)==='boolean'?(v.enabled??v.active):null,paused:typeof v.paused==='boolean'?v.paused:null,status:str(v.status||v.state,100),transport:str(v.transport||v.type,100),auth:str(v.auth,40),schedule:typeof v.schedule==='string'?str(v.schedule):str(v.schedule?.display||v.schedule?.cron),tools:Array.isArray(v.tools)?v.tools.filter(t=>typeof t==='string').slice(0,100):[]}))};
}
