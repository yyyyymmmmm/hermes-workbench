import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {Fault,hash} from './core.mjs';
import {managementView} from './agent-management.mjs';

const identifier=z.string().max(250).regex(/^official\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/);
const str=(v,n=2000)=>typeof v==='string'?v.slice(0,n):'';
export function skillHubService(){
  const reviews=new Map();
  async function review(call,id){
    const query='?profile=default&identifier='+encodeURIComponent(id);
    const preview=await call('/api/skills/hub/preview'+query),scan=await call('/api/skills/hub/scan'+query);
    if(preview.identifier!==id||scan.identifier!==id||typeof preview.skill_md!=='string'||preview.skill_md.length>65536||!Array.isArray(preview.files)||preview.files.length>500||!Array.isArray(scan.findings)||scan.findings.length>500)throw new Fault(502,'CAPABILITY_FORMAT','Unsupported skill review');
    const result={identifier:id,name:str(preview.name,200),content:preview.skill_md,files:preview.files.filter(v=>typeof v==='string').map(v=>str(v,500)),verdict:str(scan.verdict,30),policy:str(scan.policy,30),summary:str(scan.summary),findings:scan.findings.map(v=>({severity:str(v.severity,30),file:str(v.file,500),line:Number.isInteger(v.line)?v.line:0,description:str(v.description)}))};
    return {...result,allowed:scan.verdict==='safe'&&scan.policy==='allow'&&!scan.findings.some(v=>['critical','high'].includes(v.severity)),fingerprint:hash(JSON.stringify({preview,scan}))};
  }
  return async function operate({owner,connection,call},action,raw){
    for(const [id,value] of reviews)if(value.expires<Date.now())reviews.delete(id);
    if(action==='search'){
      const {q}=z.object({q:z.string().trim().max(100)}).strict().parse(raw);
      const result=await call(q?`/api/skills/hub/search?profile=default&source=official&limit=50&q=${encodeURIComponent(q)}`:'/api/skills/hub/sources?profile=default');
      const rows=q?result.results:result.featured;if(!Array.isArray(rows))throw new Fault(502,'CAPABILITY_FORMAT','Unsupported skill catalog');
      if(result.timed_out===true||Array.isArray(result.timed_out)&&result.timed_out.includes('official'))throw new Fault(504,'SKILL_SEARCH_TIMEOUT','Official source search timed out');
      const accepted=rows.filter(v=>identifier.safeParse(v?.identifier).success);
      if(rows.length&&!accepted.length)throw new Fault(502,'CAPABILITY_FORMAT','Source returned unsupported identifiers');
      const installed=managementView('skills',await call('/api/skills?profile=default')).items;
      return {source:'official',sourceLabel:'Official (Nous)',query:q,skipped:rows.length-accepted.length,limited:accepted.length>=50,items:accepted.slice(0,50).map(v=>({identifier:v.identifier,name:str(v.name,200),description:str(v.description),installed:installed.some(s=>s.name===v.name)||Boolean(result.installed?.[v.identifier])}))};
    }
    if(action==='review'){
      const input=z.object({identifier}).strict().parse(raw),result=await review(call,input.identifier);
      if(reviews.size>=1000)throw new Fault(429,'RATE_LIMITED','Too many pending reviews');
      const id=randomUUID();reviews.set(id,{owner,connection,identifier:input.identifier,fingerprint:result.fingerprint,expires:Date.now()+10*60*1000});
      const {fingerprint,...visible}=result;return {...visible,reviewId:id};
    }
    const input=z.object({reviewId:z.uuid(),confirm:z.literal(true)}).strict().parse(raw),ticket=reviews.get(input.reviewId);
    if(!ticket||ticket.owner!==owner||ticket.connection!==connection)throw new Fault(409,'SKILL_REVIEW_EXPIRED','Review expired; inspect the skill again');
    const latest=await review(call,ticket.identifier);
    if(latest.fingerprint!==ticket.fingerprint)throw new Fault(409,'SKILL_CHANGED','Skill changed after review');
    if(!latest.allowed)throw new Fault(403,'SKILL_BLOCKED','Skill scan does not permit installation');
    const before=managementView('skills',await call('/api/skills?profile=default')).items;
    if(before.some(s=>s.name===latest.name))throw new Fault(409,'SKILL_EXISTS','Skill is already installed');
    reviews.delete(input.reviewId);
    try{
      await call('/api/skills/hub/install?profile=default','POST',{identifier:ticket.identifier,profile:'default'});
      const sources=await call('/api/skills/hub/sources?profile=default');
      const after=managementView('skills',await call('/api/skills?profile=default')).items;
      const found=after.find(s=>s.name===latest.name);
      if(!found||sources.installed?.[ticket.identifier]?.name!==latest.name)throw new Error('Unverified installation');
      return {installed:true,name:found.name,enabled:found.enabled,verified:true};
    }catch{throw new Fault(502,'SKILL_INSTALL_UNVERIFIED','Install result is unconfirmed; check installed skills before retrying');}
  };
}
