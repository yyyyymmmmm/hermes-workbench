import {z} from 'zod';
import {Fault,hash} from './core.mjs';
import {managementView} from './agent-management.mjs';
export const profileName=z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/).refine(v=>!['constructor','prototype'].includes(v));
const revision=z.string().regex(/^[a-f0-9]{64}$/);
const runtimeFields={maxTurns:['agent','max_turns'],timeout:['agent','gateway_timeout'],childTurns:['delegation','max_iterations'],children:['delegation','max_concurrent_children'],depth:['delegation','max_spawn_depth'],childTimeout:['delegation','child_timeout_seconds'],orchestrator:['delegation','orchestrator_enabled']};
const runtimeInput=z.object({maxTurns:z.number().int().min(1).max(500).optional(),timeout:z.number().int().min(0).max(7200).optional(),childTurns:z.number().int().min(1).max(250).optional(),children:z.number().int().min(1).max(10).optional(),depth:z.number().int().min(1).max(3).optional(),childTimeout:z.number().int().min(30).max(3600).optional(),orchestrator:z.boolean().optional()}).strict().refine(v=>Object.keys(v).length>0);
export const profileInput=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name:profileName,description:z.string().trim().max(1000),confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('soul'),name:profileName,content:z.string().max(32000),revision,confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('description'),name:profileName,description:z.string().trim().max(1000),revision,confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('tool'),name:profileName,tool:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),enabled:z.boolean(),revision,confirm:z.literal(true)}).strict(),
 z.object({action:z.literal('availability'),name:profileName,enabled:z.boolean(),revision,confirm:z.literal(true)}).strict()
 ,z.object({action:z.literal('runtime'),name:profileName,changes:runtimeInput,revision,confirm:z.literal(true)}).strict()
]);
export async function profileService({store,owner,connection,call},action,input){
 const available=name=>store.one('SELECT enabled FROM profile_access WHERE owner=? AND connection_id=? AND name=?',owner,connection,name)?.enabled!==0;
 async function list(){
  const data=await call('/api/profiles');if(!Array.isArray(data.profiles))throw new Fault(502,'CAPABILITY_FORMAT','Invalid profile list');
  return {items:data.profiles.filter(p=>profileName.safeParse(p.name).success).map(p=>({name:p.name,model:typeof p.model==='string'?p.model.slice(0,500):'',provider:typeof p.provider==='string'?p.provider.slice(0,100):'',description:typeof p.description==='string'?p.description.slice(0,1000):'',running:typeof p.gateway_running==='boolean'?p.gateway_running:null,enabled:available(p.name)}))};
 }
 async function detail(name){
  const item=(await list()).items.find(p=>p.name===name);if(!item)throw new Fault(404,'PROFILE_NOT_FOUND','Profile is unavailable');
  const soul=await call(`/api/profiles/${encodeURIComponent(name)}/soul`);
  if(typeof soul.content!=='string'||soul.content.length>32000)throw new Fault(502,'CAPABILITY_FORMAT','Unsupported soul document');
  const tools=managementView('tools',await call(`/api/tools/toolsets?profile=${encodeURIComponent(name)}`)).items;
  const raw=await call(`/api/config?profile=${encodeURIComponent(name)}`),config=raw.config||raw;
  const runtime=Object.fromEntries(Object.entries(runtimeFields).map(([key,[group,field]])=>[key,config[group]?.[field]]).filter(([key,value])=>key==='orchestrator'?typeof value==='boolean':typeof value==='number'&&Number.isFinite(value)));
  const value={...item,content:soul.content,tools,runtime};return {...value,revision:hash(JSON.stringify({...value,running:undefined,connection,owner}))};
 }
 if(action==='list')return list();
 if(action==='detail')return detail(profileName.parse(input.name));
 const body=profileInput.parse(input),name=body.name;
 // Serialize profile writes in the adapter; reject active work on any local account sharing the origin.
 const origin=store.one('SELECT origin FROM connections WHERE owner=?',owner)?.origin;
 if(store.one("SELECT r.id FROM runs r JOIN connections c ON c.owner=r.owner WHERE c.origin=? AND r.status IN ('queued','running','approval','stopping','unknown')",origin))throw new Fault(409,'RUN_ACTIVE','Resolve active work before editing profiles');
 if(body.action==='create'){
  if((await list()).items.some(p=>p.name===name))throw new Fault(409,'PROFILE_EXISTS','Profile already exists');
  try{await call('/api/profiles','POST',{name,description:body.description,clone_from_default:false,clone_all:false,no_skills:true});const result=await list();if(!result.items.some(p=>p.name===name))throw Error('Readback mismatch');return result;}
  catch(error){if(['HERMES_REJECTED','HERMES_AUTH_EXPIRED','HERMES_UNSUPPORTED'].includes(error.code))throw error;throw new Fault(502,'PROFILE_UNVERIFIED','Creation outcome is unknown; refresh before retrying');}
 }
 const before=await detail(name);if(before.revision!==body.revision)throw new Fault(409,'CONFIG_CONFLICT','Profile changed; reload before saving');
 if(body.action==='availability'){
  store.run('INSERT INTO profile_access(owner,connection_id,name,enabled) VALUES(?,?,?,?) ON CONFLICT(owner,connection_id,name) DO UPDATE SET enabled=excluded.enabled',owner,connection,name,Number(body.enabled));return detail(name);
 }
 const path=`/api/profiles/${encodeURIComponent(name)}`;
 if(body.action==='tool'&&!before.tools.some(t=>t.id===body.tool&&t.enabled!==null))throw new Fault(400,'INVALID_INPUT','Tool cannot be configured');
 if(body.action==='runtime'&&Object.keys(body.changes).some(key=>!Object.hasOwn(before.runtime,key)))throw new Fault(400,'INVALID_INPUT','Runtime setting is not exposed by this server');
 try{
  if(body.action==='soul')await call(`${path}/soul`,'PUT',{content:body.content});
  if(body.action==='description')await call(`${path}/description`,'PUT',{description:body.description});
  if(body.action==='tool')await call(`/api/tools/toolsets/${encodeURIComponent(body.tool)}?profile=${encodeURIComponent(name)}`,'PUT',{enabled:body.enabled,profile:name});
  if(body.action==='runtime'){const config={};for(const [key,value] of Object.entries(body.changes)){const [group,field]=runtimeFields[key];(config[group]??={})[field]=value;}await call(`/api/config?profile=${encodeURIComponent(name)}`,'PUT',{config});}
  const result=await detail(name);
  if(body.action==='soul'&&result.content!==body.content||body.action==='description'&&result.description!==body.description||body.action==='tool'&&result.tools.find(t=>t.id===body.tool)?.enabled!==body.enabled)throw Error('Readback mismatch');
  if(body.action==='runtime'&&!Object.entries(body.changes).every(([key,value])=>result.runtime[key]===value))throw Error('Readback mismatch');
  return {...result,verified:true};
 }catch(error){if(['HERMES_REJECTED','HERMES_AUTH_EXPIRED','HERMES_UNSUPPORTED'].includes(error.code))throw error;throw new Fault(502,'PROFILE_UNVERIFIED','Write outcome is unknown; reload before retrying');}
}
