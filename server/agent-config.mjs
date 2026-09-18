import { z } from 'zod';
import { createHash } from 'node:crypto';
import { Fault } from './core.mjs';

const provider=z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/).refine(v=>!['constructor','prototype','__proto__'].includes(v));
const fields={
  memory:{memoryEnabled:['memory','memory_enabled'],userProfileEnabled:['memory','user_profile_enabled'],memoryLimit:['memory','memory_char_limit'],userLimit:['memory','user_char_limit'],compressionEnabled:['compression','enabled']},
  voice:{sttEnabled:['stt','enabled'],sttProvider:['stt','provider'],ttsProvider:['tts','provider']}
};
const nonempty=s=>s.refine(v=>Object.keys(v).length>0);
export const configInput=z.discriminatedUnion('section',[
  z.object({section:z.literal('memory'),revision:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.literal(true),changes:nonempty(z.object({memoryEnabled:z.boolean().optional(),userProfileEnabled:z.boolean().optional(),memoryLimit:z.number().int().min(256).max(1000000).optional(),userLimit:z.number().int().min(256).max(1000000).optional(),compressionEnabled:z.boolean().optional()}).strict())}).strict(),
  z.object({section:z.literal('voice'),revision:z.string().regex(/^[a-f0-9]{64}$/),confirm:z.literal(true),changes:nonempty(z.object({sttEnabled:z.boolean().optional(),sttProvider:provider.optional(),ttsProvider:provider.optional(),voice:z.string().trim().max(150).optional()}).strict())}).strict()
]);
export function unwrapConfig(data){const c=data?.config??data;if(!c||typeof c!=='object'||Array.isArray(c))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported configuration format');return c;}
function canonical(v){return Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;}
export const configRevision=data=>createHash('sha256').update(JSON.stringify(canonical(unwrapConfig(data)))).digest('hex');
export function mergeConfig(data,input){
  const {section,changes}=configInput.parse(input),c=structuredClone(unwrapConfig(data));
  for(const [key,value] of Object.entries(changes)){
    if(key==='voice')continue;
    const [group,field]=fields[section][key];
    if(!c[group]||typeof c[group]!=='object'||Array.isArray(c[group]))c[group]={};
    c[group][field]=value;
  }
  if(Object.hasOwn(changes,'voice')){
    const p=provider.parse(c.tts?.provider);
    if(!Object.hasOwn(c.tts,p)||!c.tts[p]||typeof c.tts[p]!=='object'||Array.isArray(c.tts[p]))c.tts[p]={};
    const key=p==='elevenlabs'?'voice_id':'voice';
    if(changes.voice)c.tts[p][key]=changes.voice;
    else {delete c.tts[p].voice;delete c.tts[p].voice_id;}
  }
  return c;
}
export function configPatch(data,input){
  const merged=mergeConfig(data,input),patch={};
  for(const key of Object.keys(input.changes)){
    if(key==='voice'){
      const p=merged.tts.provider,field=p==='elevenlabs'?'voice_id':'voice';
      (patch.tts??={})[p]={[field]:input.changes.voice};
    }else{
      const [group,field]=fields[input.section][key];
      (patch[group]??={})[field]=merged[group][field];
    }
  }
  return patch;
}
