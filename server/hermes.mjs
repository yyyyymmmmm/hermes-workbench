import { CookieJar } from 'tough-cookie';
import { randomUUID } from 'node:crypto';
import { Fault } from './core.mjs';
import { request, jsonResponse, hermesUrl,resolveTarget } from './network.mjs';
import {externalMcpInput} from './mcp-input.mjs';
import { managementPath,managementView } from './agent-management.mjs';
import { configInput,configRevision,configPatch } from './agent-config.mjs';
import {mcpFailure} from './mcp-errors.mjs';
import {skillHubService} from './skills-hub.mjs';
import {profileService,profileName} from './profiles.mjs';
import {externalAgents} from './external-agents.mjs';
import {agentContent} from './agent-content.mjs';

export function normalizeModels(input) {
  if (!input || input.ok === false || input.success === false || input.error) throw new Fault(502, 'MODEL_DISCOVERY_FAILED', 'Gateway rejected model discovery');
  const data = input.data?.providers ? input.data : input;
  if (!Array.isArray(data.providers)) throw new Fault(502, 'UNSUPPORTED_MODEL_CATALOG', 'Gateway returned an unsupported model catalog');
  const models = [], seen = new Set();
  for (const provider of data.providers) {
    if (!provider || provider.authenticated === false) continue;
    const slug = provider.slug || provider.id;
    if (typeof slug !== 'string' || !Array.isArray(provider.models)) continue;
    for (const item of provider.models) {
      const id = typeof item === 'string' ? item : item?.id || item?.model;
      const key = JSON.stringify([slug, id]);
      if (typeof id !== 'string' || !id || seen.has(key)) continue;
      seen.add(key);
      models.push({ id, provider: slug, providerName: typeof provider.name === 'string' ? provider.name : slug,
        reasoning: Array.isArray(item?.reasoning_options) ? item.reasoning_options.filter(x => typeof x === 'string') : [] });
    }
  }
  const current = data.current || data.main || {};
  const firstString = (...values) => values.find(value => typeof value === 'string' && value.length > 0) || null;
  return { models, current: { model: firstString(current.model, data.model, data.current_model, data.default_model),
    provider: firstString(current.provider, data.provider, data.current_provider, data.default_provider) }, fetchedAt: new Date().toISOString() };
}

export function hermesAdapter(config, store, vault, transport = request) {
  const pending = new Set();
  const configWriters = new Set();
  const oauthFlows = new Map();
  const skillHub=skillHubService();
  async function exclusiveConfig(origin,work){
    if(configWriters.has(origin))throw new Fault(409,'CONNECTION_BUSY','Another configuration operation is in progress');
    configWriters.add(origin);
    try{return await work();}finally{configWriters.delete(origin);}
  }
  async function exclusive(owner, work) {
    if (pending.has(owner)) throw new Fault(409, 'CONNECTION_BUSY', 'Another Hermes connection operation is in progress');
    pending.add(owner);
    try { return await work(); } finally { pending.delete(owner); }
  }
  async function remote(origin, jar, path, method = 'GET', body) {
    const url = new URL(path, origin).href;
    const cookie = await jar.getCookieString(url);
    const response = await transport(url, { method, privateHosts: config.privateHosts,
      headers: { accept: 'application/json', ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
    for (const cookie of response.headers['set-cookie'] || []) await jar.setCookie(cookie, url);
    if (path === '/auth/logout' && [204, 302, 303].includes(response.status)) return { ok: true };
    if ([401, 403].includes(response.status)) throw new Fault(409, 'HERMES_AUTH_EXPIRED', 'Hermes session expired or permission was denied; reconnect Hermes');
    if ([404, 405, 501].includes(response.status)) throw new Fault(422, 'HERMES_UNSUPPORTED', 'This gateway does not support the requested API');
    if (response.status < 200 || response.status >= 300) throw new Fault(502, 'HERMES_UPSTREAM_ERROR', 'Hermes gateway rejected the request');
    const data = jsonResponse(response);
    const flowStatus=method==='GET'&&path.startsWith('/api/mcp/oauth/flows/');
    if (!flowStatus&&(data?.ok === false || data?.success === false || data?.error)) {
      if(path.startsWith('/api/mcp/'))throw mcpFailure(data);
      throw new Fault(502, 'HERMES_REJECTED', 'Hermes gateway reported a failure');
    }
    return data;
  }
  const get = owner => {
    const row = store.one('SELECT * FROM connections WHERE owner=?', owner);
    if (!row) throw new Fault(409, 'HERMES_NOT_CONNECTED', 'Connect your Hermes server first');
    return row;
  };
  return {
    content(owner,resource,input){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const work=()=>agentContent({store,owner,connection:row.id,call:(path,method,body)=>remote(row.origin,jar,path,method,body)},resource,input);
      try{return await (input?exclusiveConfig(row.origin,work):work());}
      finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
    });},
    externalAgents(owner){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      try{return await externalAgents(path=>remote(row.origin,jar,path),row.origin);}
      finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
    });},
    profiles(owner,action,input={}){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const work=()=>profileService({store,owner,connection:row.id,call:(path,method,body)=>remote(row.origin,jar,path,method,body)},action,input);
      try{return await (action==='write'?exclusiveConfig(row.origin,work):work());}
      finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
    });},
    skillsHub(owner,action,input){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const work=()=>skillHub({owner,connection:row.id,call:(path,method,body)=>remote(row.origin,jar,path,method,body)},action,input);
      try{return await (action==='install'?exclusiveConfig(row.origin,work):work());}
      finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
    });},
    isBusy(owner){return pending.has(owner)||configWriters.has(store.one('SELECT origin FROM connections WHERE owner=?',owner)?.origin);},
    speak(owner,text){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const data=await remote(row.origin,jar,'/api/audio/speak?profile=default','POST',{text});
      const url=data.data_url;
      if(typeof url!=='string'||url.length>1900000||!/^data:audio\/(mpeg|mp3|wav|x-wav|ogg|webm);base64,[A-Za-z0-9+/]+=*$/.test(url))throw new Fault(502,'VOICE_FORMAT','Gateway returned unsupported audio');
      store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);
      return {dataUrl:url};
    });},
    inspect(owner,section,profile='default'){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const path=new URL(managementPath(section),'https://placeholder.invalid');path.searchParams.set('profile',profileName.parse(profile));
      const data=await remote(row.origin,jar,path.pathname+path.search);
      store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);
      return {section,...managementView(section,data),...(['memory','voice'].includes(section)?{revision:configRevision(data)}:{}),checkedAt:new Date().toISOString()};
    });},
    saveConfig(owner,raw){return exclusive(owner,async()=>{
      const input=configInput.parse(raw),row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      return exclusiveConfig(row.origin,async()=>{
      const path='/api/config?profile=default',current=await remote(row.origin,jar,path);
      if(configRevision(current)!==input.revision)throw new Fault(409,'CONFIG_CONFLICT','Server configuration changed. Reload before saving.');
      const config=configPatch(current,input);
      // The gateway deep-merges config maps. Send only edited fields, never credentials.
      // No documented CAS: never retry an uncertain write.
      try{
        await remote(row.origin,jar,path,'PUT',{config});
        const result=await remote(row.origin,jar,path);
        const values=managementView(input.section,result).values;
        if(!Object.entries(input.changes).every(([k,v])=>(values[k]??'')===v))throw new Error('Readback mismatch');
        return {section:input.section,...managementView(input.section,result),revision:configRevision(result),checkedAt:new Date().toISOString(),verified:true};
      }catch{throw new Fault(502,'CONFIG_UNVERIFIED','Save outcome is unconfirmed. Reload the server configuration before trying again.');}
      finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
      });
    });},
    installMcp(owner,name){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      return exclusiveConfig(row.origin,async()=>{
        const catalog=managementView('catalog',await remote(row.origin,jar,managementPath('catalog')));
        if(!catalog.items.some(v=>v.id===name&&v.installable))throw new Fault(409,'INSTALL_UNAVAILABLE','Catalog entry is installed or needs additional setup');
        try{
          await remote(row.origin,jar,'/api/mcp/catalog/install?profile=default','POST',{name,enable:false,env:{},profile:'default'});
          const result=managementView('catalog',await remote(row.origin,jar,managementPath('catalog')));
          if(!result.items.some(v=>v.id===name&&v.installed&&v.enabled===false))throw new Error('Install unverified');
          return {section:'catalog',...result,verified:true,checkedAt:new Date().toISOString()};
        }catch{throw new Fault(502,'INSTALL_UNVERIFIED','Install outcome is unconfirmed. Reload the catalog before trying again.');}
        finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
      });
    });},
    mcpAction(owner,input){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const path=`/api/mcp/servers/${encodeURIComponent(input.name)}`;
      const available=managementView('mcp',await remote(row.origin,jar,managementPath('mcp'))).items;
      if(!available.some(v=>v.id===input.name))throw new Fault(404,'CAPABILITY_NOT_FOUND','Remote item no longer exists');
      const flow=input.flow&&oauthFlows.get(input.flow);
      if(['status','cancel'].includes(input.action)&&(!flow||flow.owner!==owner||flow.connection!==row.id||flow.name!==input.name||flow.expires<Date.now()))throw new Fault(409,'MCP_FLOW_EXPIRED','Authorization expired. Start again.');
      try{
        if(input.action==='authorize'){
          for(const [key,value]of oauthFlows)if(value.expires<Date.now())oauthFlows.delete(key);
          const existing=[...oauthFlows.entries()].find(([,v])=>v.owner===owner&&v.connection===row.id&&v.name===input.name);
          if(existing)return {state:'authorization_required',flow:existing[0],url:existing[1].url};
          if(oauthFlows.size>=1000)throw new Fault(429,'RATE_LIMITED','Too many authorization flows');
          const result=await remote(row.origin,jar,`${path}/auth?profile=default`,'POST',{});
          let url;try{url=new URL(result.authorization_url);}catch{throw new Fault(502,'MCP_AUTH_FORMAT','Unsupported authorization response');}
          if(url.protocol!=='https:'||url.username||url.password||typeof result.flow_id!=='string'||!result.flow_id||result.flow_id.length>200)throw new Fault(502,'MCP_AUTH_FORMAT','Unsupported authorization response');
          const id=randomUUID();oauthFlows.set(id,{owner,connection:row.id,name:input.name,remote:result.flow_id,url:url.href,expires:Date.now()+5*60*1000});
          return {state:'authorization_required',flow:id,url:url.href};
        }
        if(input.action==='cancel'){
          await remote(row.origin,jar,`/api/mcp/oauth/flows/${encodeURIComponent(flow.remote)}`,'DELETE');oauthFlows.delete(input.flow);return {state:'cancelled'};
        }
        if(input.action==='status'){
          const result=await remote(row.origin,jar,`/api/mcp/oauth/flows/${encodeURIComponent(flow.remote)}`);
          if(result.status==='approved'){oauthFlows.delete(input.flow);return {state:'authorized'};}
          if(result.status==='error'){oauthFlows.delete(input.flow);return {state:'authorization_failed'};}
          return {state:'authorization_required'};
        }
        if(input.action==='remove'){
          await remote(row.origin,jar,`${path}?profile=default`,'DELETE');
          const remaining=managementView('mcp',await remote(row.origin,jar,managementPath('mcp'))).items;
          if(remaining.some(v=>v.id===input.name))throw new Fault(502,'MCP_WRITE_UNVERIFIED','Remote change could not be verified');
          for(const [key,value]of oauthFlows)if(value.owner===owner&&value.name===input.name)oauthFlows.delete(key);
          return {state:'removed'};
        }
        const result=await remote(row.origin,jar,`${path}/test?profile=default`,'POST',{});
        if(result.ok!==true||!Array.isArray(result.tools))throw new Fault(502,'MCP_TEST_FAILED','Connection test failed');
        await remote(row.origin,jar,`${path}/enabled?profile=default`,'PUT',{enabled:true,profile:'default'});
        const updated=managementView('mcp',await remote(row.origin,jar,managementPath('mcp'))).items;
        if(!updated.some(v=>v.id===input.name&&v.enabled===true))throw new Fault(502,'MCP_WRITE_UNVERIFIED','Remote change could not be verified');
        return {state:'enabled',toolCount:result.tools.length,checkedAt:new Date().toISOString()};
      }finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
    });},
    addExternalMcp(owner,raw){return exclusive(owner,async()=>{
      const input=externalMcpInput.parse(raw);
      // Reject non-public destinations. The remote gateway must also enforce egress policy.
      await resolveTarget(input.url);
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      return exclusiveConfig(row.origin,async()=>{
        const before=managementView('mcp',await remote(row.origin,jar,managementPath('mcp')));
        if(before.items.some(v=>v.id===input.name))throw new Fault(409,'MCP_NAME_EXISTS','A server with this name already exists');
        try{
          await remote(row.origin,jar,'/api/mcp/servers?profile=default','POST',{name:input.name,url:input.url,auth:input.auth,profile:'default'});
          const result=managementView('mcp',await remote(row.origin,jar,managementPath('mcp')));
          if(!result.items.some(v=>v.id===input.name))throw new Fault(502,'MCP_WRITE_UNVERIFIED','Remote change could not be verified');
          return {section:'mcp',...result,checkedAt:new Date().toISOString()};
        }finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
      });
    });},
    manage(owner,input){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const name=encodeURIComponent(input.id);
      const available=managementView(input.section,await remote(row.origin,jar,managementPath(input.section))).items;
      if(!available.some(item=>item.id===input.id))throw new Fault(404,'CAPABILITY_NOT_FOUND','Remote item no longer exists');
      if(input.section==='tools'){
        if(!available.some(item=>item.id===input.id&&item.enabled!==null))throw new Fault(400,'INVALID_INPUT','Tool is not configurable');
        await exclusiveConfig(row.origin,async()=>{
          await remote(row.origin,jar,`/api/tools/toolsets/${name}?profile=default`,'PUT',{enabled:input.enabled,profile:'default'});
          const items=managementView('tools',await remote(row.origin,jar,'/api/tools/toolsets?profile=default')).items;
          if(items.find(item=>item.id===input.id)?.enabled!==input.enabled)throw new Fault(502,'CONFIG_UNVERIFIED','Tool setting could not be verified');
        });
      }
      else if(input.section==='skills')await remote(row.origin,jar,'/api/skills/toggle','PUT',{name:input.id,enabled:input.enabled});
      else if(input.section==='mcp')await remote(row.origin,jar,`/api/mcp/servers/${name}/enabled`,'PUT',{enabled:input.enabled});
      else await remote(row.origin,jar,`/api/cron/jobs/${name}/${input.action}`,'POST',{});
      store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);
      return {accepted:true};
    });},
    async ticket(owner) {
      const row = get(owner), jar = await CookieJar.deserialize(JSON.parse(vault.open(owner, row.jar)));
      const response = await remote(row.origin, jar, '/api/auth/ws-ticket', 'POST', {});
      if (typeof response.ticket !== 'string' || !response.ticket || response.ticket.length > 8192) throw new Fault(502, 'HERMES_TICKET_INVALID', 'Gateway returned an invalid WebSocket ticket');
      store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?', vault.seal(owner, JSON.stringify(await jar.serialize())), owner, row.id);
      const url = new URL('/api/ws', row.origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', response.ticket);
      return { url: url.href, cookie: await jar.getCookieString(new URL('/api/ws', row.origin).href), connectionId: row.id };
    },
    info(owner) {
      const row = store.one('SELECT * FROM connections WHERE owner=?', owner);
      return row ? { connected: true, connectionId: row.id, origin: row.origin, username: row.username, updatedAt: row.updated,
        catalog: row.catalog ? JSON.parse(row.catalog) : null, preference: row.preference ? JSON.parse(row.preference) : null } : { connected: false };
    },
    connect(owner, input) { return exclusive(owner, async () => {
      const origin = hermesUrl(input.origin, config.privateHosts), jar = new CookieJar();
      const status = await remote(origin, jar, '/api/status');
      if (status.auth_required !== true) throw new Fault(422, 'HERMES_AUTH_REQUIRED', 'Only authenticated Hermes gateways are supported');
      const providers = await remote(origin, jar, '/api/auth/providers');
      const supported = providers.providers?.filter(p => p.supports_password === true);
      const provider = supported?.find(p => p.name === 'basic') || supported?.[0];
      if (!provider || typeof provider.name !== 'string') throw new Fault(422, 'HERMES_PASSWORD_UNSUPPORTED', 'Gateway does not offer password login');
      await remote(origin, jar, '/auth/password-login', 'POST', { provider: provider.name, username: input.username, password: input.password, next: '' });
      const me = await remote(origin, jar, '/api/auth/me');
      const identity = [me.username, me.user_id, me.email, me.display_name].some(v => typeof v === 'string' && v.length > 0);
      if (me.authenticated === false || (!identity && me.authenticated !== true) || !await jar.getCookieString(origin)) throw new Fault(502, 'HERMES_LOGIN_UNVERIFIED', 'Gateway login could not be verified');
      const sealed = vault.seal(owner, JSON.stringify(await jar.serialize()));
      const previous = store.one('SELECT id,origin,username FROM connections WHERE owner=?',owner);
      const connectionId = previous?.origin===origin && previous?.username===input.username ? previous.id : randomUUID();
      store.run('INSERT INTO connections VALUES(?,?,?,?,?,NULL,NULL,?) ON CONFLICT(owner) DO UPDATE SET id=excluded.id,origin=excluded.origin,username=excluded.username,jar=excluded.jar,catalog=NULL,preference=NULL,updated=excluded.updated', owner, connectionId, origin, input.username, sealed, Date.now());
      return this.info(owner);
    }); },
    models(owner,profile='default') { return exclusive(owner, async () => {
      const row = get(owner), jar = await CookieJar.deserialize(JSON.parse(vault.open(owner, row.jar)));
      const data = normalizeModels(await remote(row.origin, jar, `/api/model/options?profile=${encodeURIComponent(profileName.parse(profile))}&explicit_only=1&refresh=true`));
      store.run('UPDATE connections SET jar=?,updated=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),Date.now(),owner,row.id);
      if(profile==='default')store.run('UPDATE connections SET catalog=? WHERE owner=? AND id=?',JSON.stringify(data),owner,row.id);
      return data;
    }); },
    applyModel(owner,input){return exclusive(owner,async()=>{
      const row=get(owner),jar=await CookieJar.deserialize(JSON.parse(vault.open(owner,row.jar)));
      const profile=profileName.parse(input.profile||'default');
      return exclusiveConfig(row.origin,async()=>{
        const path=`/api/model/options?profile=${encodeURIComponent(profile)}&explicit_only=1`;
        const before=normalizeModels(await remote(row.origin,jar,path));
        if(before.current.model!==input.expected.model||before.current.provider!==input.expected.provider)throw new Fault(409,'MODEL_CONFLICT','Model configuration changed; refresh and review');
        if(!before.models.some(m=>m.id===input.model&&m.provider===input.provider))throw new Fault(400,'UNKNOWN_MODEL','Model is no longer available');
        let submitted=false;
        try{
          submitted=true;
          await remote(row.origin,jar,`/api/model/set?profile=${encodeURIComponent(profile)}`,'POST',{scope:'main',model:input.model,provider:input.provider,profile,confirm_expensive_model:input.confirmExpensive});
          const catalog=normalizeModels(await remote(row.origin,jar,path));
          if(catalog.current.model!==input.model||catalog.current.provider!==input.provider)throw new Error('Readback mismatch');
          const preference={model:input.model,provider:input.provider,profile,scope:profile==='default'?'default-profile-new-sessions':'profile-new-sessions',applied:true};
          if(profile==='default')store.run('UPDATE connections SET catalog=?,preference=?,updated=? WHERE owner=? AND id=?',JSON.stringify(catalog),JSON.stringify(preference),Date.now(),owner,row.id);
          return {catalog,preference,verified:true};
        }catch(error){
          if(['HERMES_UNSUPPORTED','HERMES_AUTH_EXPIRED','HERMES_REJECTED'].includes(error.code))throw error;
          if(submitted)throw new Fault(502,'MODEL_UNVERIFIED','Model write outcome is unknown; refresh before retrying');
          throw error;
        }finally{store.run('UPDATE connections SET jar=? WHERE owner=? AND id=?',vault.seal(owner,JSON.stringify(await jar.serialize())),owner,row.id);}
      });
    });},
    preference(owner, selection) {
      const row = get(owner), catalog = row.catalog && JSON.parse(row.catalog);
      if (!catalog?.models.some(m => m.id === selection.model && m.provider === selection.provider)) throw new Fault(400, 'UNKNOWN_MODEL', 'Refresh the model catalog and select an available model');
      const value = { ...selection, scope: 'workbench-preference', applied: false };
      store.run('UPDATE connections SET preference=? WHERE owner=?', JSON.stringify(value), owner);
      return value;
    },
    disconnect(owner) { return exclusive(owner, async () => {
      const row = get(owner); let upstreamRevoked = false;
      try {
        const jar = await CookieJar.deserialize(JSON.parse(vault.open(owner, row.jar)));
        await remote(row.origin, jar, '/auth/logout', 'POST', {});
        try { await remote(row.origin, jar, '/api/auth/me'); }
        catch (error) { if (error.code === 'HERMES_AUTH_EXPIRED') upstreamRevoked = true; }
      } catch { /* Local credential removal must remain available when the gateway is offline. */ }
      store.run('DELETE FROM connections WHERE owner=?', owner);
      return { disconnected: true, upstreamRevoked };
    }); }
  };
}
