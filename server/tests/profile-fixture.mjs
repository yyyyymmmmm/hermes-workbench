import {mockHermes} from './fixtures.mjs';
export function profileFixture(){
 const profiles=new Map([['default',{name:'default',description:'General assistant',model:'fixture-model-a',provider:'test-provider',content:'Default role',enabled:true}]]),writes=[],configs=new Map();let unverified=false;
 const response=data=>({status:200,headers:{},text:JSON.stringify(data)});
 const transport=async(url,o={})=>{
  if(!o.headers?.cookie?.includes('gateway=secret-cookie'))return mockHermes(url,o);
  const u=new URL(url),path=u.pathname,method=o.method||'GET',body=o.body?JSON.parse(o.body):{},name=decodeURIComponent(path.split('/')[3]||''),profile=u.searchParams.get('profile')||'default',p=profiles.get(profile);
  if(path==='/api/profiles'&&method==='GET')return response({profiles:[...profiles.values()].map(p=>({...p,path:'/secret/private/home',api_key:'must-not-leak',has_env:true,gateway_running:true}))});
  if(path==='/api/profiles'&&method==='POST'){writes.push({path,body});profiles.set(body.name,{name:body.name,description:body.description,model:'fixture-model-a',provider:'test-provider',content:'',enabled:false});return response({ok:true});}
  if(path.endsWith('/soul')){const item=profiles.get(name);if(!item)return {status:404,headers:{},text:'{}'};if(method==='PUT'){writes.push({path,body});if(!unverified)item.content=body.content;}return response({content:item.content,exists:true});}
  if(path.endsWith('/description')){writes.push({path,body});profiles.get(name).description=body.description;return response({ok:true});}
  if(path==='/api/tools/toolsets')return response({toolsets:p?[{name:'delegation',tools:['delegate_task'],enabled:p.enabled,description:'Native task delegation'}]:[]});
  if(path==='/api/config'){if(!configs.has(profile))configs.set(profile,{agent:{max_turns:50,gateway_timeout:600},delegation:{max_iterations:50,max_concurrent_children:3,max_spawn_depth:1,child_timeout_seconds:600,orchestrator_enabled:true},provider:{api_key:'must-not-leak'}});const config=configs.get(profile);if(method==='PUT'){writes.push({path,body,profile});for(const [key,value] of Object.entries(body.config))Object.assign(config[key]??={},value);}return response({config});}
  if(path==='/api/tools/toolsets/delegation'&&method==='PUT'){writes.push({path,body});profiles.get(body.profile).enabled=body.enabled;return response({ok:true});}
  if(path==='/api/model/options'&&p)return response({providers:[{slug:'test-provider',name:'Fixture',authenticated:true,models:['fixture-model-a','fixture-model-b']}],current:{model:p.model,provider:p.provider}});
  if(path==='/api/model/set'&&p){writes.push({path,body});p.model=body.model;p.provider=body.provider;return response({ok:true});}
  return mockHermes(url,o);
 };
 return {transport,profiles,writes,unverified:value=>unverified=value};
}
