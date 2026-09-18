import { randomUUID } from 'node:crypto';
import { Fault, hash } from './core.mjs';
import { openGateway } from './gateway.mjs';
import { validateAttachments,attachedPrompt } from './attachments.mjs';
import {projectChat,projectPrompt} from './project-chat.mjs';
import {workbenchActions} from './workbench-actions.mjs';

const activeStates = ['queued', 'running', 'approval', 'stopping', 'unknown'];
const text = (value, length = 8000) => typeof value === 'string' ? value.slice(0, length) : '';
export function runService(config, store, hermes, gateway = openGateway) {
  const live = new Map();
  const projects=projectChat(store),actions=workbenchActions(store);
  store.run("UPDATE runs SET status='unknown',updated=? WHERE status IN ('queued','running','approval','stopping')", Date.now());
  store.run("UPDATE run_requests SET status='expired' WHERE status='pending'");
  const own = (owner, id) => {
    const row = store.one('SELECT * FROM runs WHERE owner=? AND id=?', owner, id);
    if (!row) throw new Fault(404, 'RUN_NOT_FOUND', 'Run was not found');
    return row;
  };
  function event(id, type, data = {}) {
    const seq = (store.one('SELECT MAX(seq) AS seq FROM run_events WHERE run_id=?', id)?.seq || 0) + 1;
    store.run('INSERT INTO run_events VALUES(?,?,?)', id, seq, JSON.stringify({ type, ...data }));
  }
  function status(id, value, detail = '') {
    store.run('UPDATE runs SET status=?,updated=? WHERE id=?', value, Date.now(), id);
    event(id, 'status', { status: value, detail });
  }
  function finish(id, value, detail = '') {
    const handle = live.get(id);
    if (!handle || handle.finished) return;
    handle.finished = true; clearTimeout(handle.timer); handle.client?.close(); live.delete(id);
    store.run("UPDATE run_requests SET status='expired' WHERE run_id=? AND status IN ('pending','sending')", id);
    status(id, value, detail);
    if(value==='completed'){
      const row=store.one('SELECT owner,output,project_context FROM runs WHERE id=?',id);
      if(row?.project_context){try{actions.stage(row.owner,id,row.output);event(id,'workbench-actions');}catch{event(id,'notice',{text:'Task proposal could not be processed; no automatic retry'});}}
    }
  }
  function pending(id, frame, payload, method, rpc) {
    const row = payload.request || payload;
    const remoteId = rpc ? frame.id : row.request_id || row.id || payload.request_id;
    if (!['string', 'number'].includes(typeof remoteId)) { event(id, 'notice', { text: 'Gateway request is missing an identifier; handle it on the server' }); return; }
    const encoded = JSON.stringify(remoteId);
    if (store.one("SELECT id FROM run_requests WHERE run_id=? AND remote_id=? AND status IN ('pending','sending')", id, encoded)) return;
    const choices = (Array.isArray(row.choices || row.options) ? row.choices || row.options : []).slice(0, 12).map(c => typeof c === 'string' ? { label: c, value: c } : { label: c.label || c.text || c.title, value: c.value || c.answer || c.id }).filter(c => typeof c.label === 'string' && typeof c.value === 'string').map(c=>({ label:text(c.label,200),value:text(c.value,200) }));
    const argumentText = row.arguments || row.args;
    const rawDetail = [row.command,row.detail,row.description,row.reason,row.context,row.args_text,
      argumentText ? typeof argumentText==='string' ? argumentText : JSON.stringify(argumentText) : ''].filter(v=>typeof v==='string'&&v).join('\n\n');
    const rawTitle = row.title || row.command || row.question || row.prompt || row.tool_name;
    const request = { id: randomUUID(), method, title: text(rawTitle, 2000) || 'Hermes requires a response',
      detail: text(rawDetail), choices,
      unsupported: rawDetail.length>8000 || (typeof rawTitle==='string'&&rawTitle.length>2000) ||
        Boolean(Array.isArray(row.questions) && row.questions.length > 0) || typeof row.question==='object' || (method === 'approval' && !choices.length) };
    store.run('INSERT INTO run_requests VALUES(?,?,?,?,?,?,?,?)', request.id, id, encoded, method, Number(rpc), JSON.stringify(request), 'pending', Date.now());
    status(id, 'approval'); event(id, 'request', { request });
  }
  async function execute(row, conversation) {
    const handle = live.get(row.id);
    const agentProfile=conversation.agent_profile||'default';handle.profile=agentProfile;
    try {
      let selectedProfile=null;
      if(agentProfile!=='default'){selectedProfile=(await hermes.profiles(row.owner,'list')).items.find(p=>p.name===agentProfile&&p.enabled);if(!selectedProfile)throw new Fault(409,'PROFILE_NOT_FOUND','Profile is unavailable');}
      if(row.agent_mode){
        const tools=await hermes.inspect(row.owner,'tools',agentProfile);
        if(!tools.items.some(t=>t.enabled===true&&t.tools.includes('delegate_task')))throw new Fault(409,'DELEGATION_UNAVAILABLE','Native delegation is not enabled');
      }
      if(handle.finished)return;
      if(handle.stop){finish(row.id,'stopped');return;}
      const ticket = await hermes.ticket(row.owner);
      if (ticket.connectionId !== conversation.connection_id) throw new Fault(409, 'CONNECTION_CHANGED', 'Connection changed; create a new conversation');
      handle.client = await gateway(ticket, config.privateHosts, frame => {
        if (handle.finished) return;
        try {
          const payload = frame.params?.payload || frame.params || {};
          const runtime = frame.params?.session_id || payload.session_id;
          if (!handle.runtime || (runtime && runtime !== handle.runtime)) return;
          if (['approval','clarify'].includes(frame.method) && frame.id !== undefined) { pending(row.id, frame, payload, frame.method, true); return; }
          if (frame.method !== 'event') return;
          const type = frame.params?.type;
          if (type === 'message.start') { handle.started = true; status(row.id, handle.stop ? 'stopping' : 'running'); return; }
          if (['approval.request','clarify.request'].includes(type)) { pending(row.id, frame, payload, type.split('.')[0], false); return; }
          if (['request.cancel','approval.expired','approval.expire','clarify.expired','clarify.expire'].includes(type)) {
            store.run("UPDATE run_requests SET status='expired' WHERE run_id=? AND remote_id=?", row.id, JSON.stringify(payload.request_id || payload.id));
            event(row.id,'request-expired'); return;
          }
          if (!handle.started) return;
          if (type === 'message.delta') {
            const delta = text(payload.text, 32768);
            if (handle.output.length + delta.length > 200000) { finish(row.id, 'unknown', 'OUTPUT_LIMIT'); return; }
            handle.output += delta;
            store.run('UPDATE runs SET output=?,updated=? WHERE id=?', handle.output, Date.now(), row.id);
            event(row.id, 'delta', { text: delta });
          } else if (type === 'message.complete') {
            if (payload.text) handle.output = text(payload.text, 200000);
            store.run('UPDATE runs SET output=? WHERE id=?', handle.output, row.id);
            event(row.id, 'output', { text: handle.output });
            const failed = ['error','failed','failure'].includes(payload.status);
            const stopped=handle.stop || ['interrupted','cancelled','canceled','stopped'].includes(payload.status);
            finish(row.id, failed ? 'failed' : stopped ? 'stopped' : 'completed', failed ? 'REMOTE_FAILED' : '');
          } else if (type === 'error') finish(row.id, 'failed', 'REMOTE_FAILED');
          else if (['tool.start','tool.complete','tool.error'].includes(type)) event(row.id, 'tool', { status:type, name:text(payload.name || payload.tool_name,200) });
          // Hidden reasoning events are not stored or forwarded.
        } catch { finish(row.id, 'unknown', 'UNSUPPORTED_GATEWAY_EVENT'); }
      }, () => finish(row.id, handle.submitted ? 'unknown' : 'failed', 'GATEWAY_DISCONNECTED'));
      if (handle.finished) { handle.client.close(); return; }
      const result = await handle.client.rpc(conversation.remote_id ? 'session.resume' : 'session.create', {
        ...(conversation.remote_id ? { session_id: conversation.remote_id } : {}), cols:72, source:'desktop', profile:agentProfile
      });
      if (handle.finished) return;
      if(typeof result.profile==='string'&&result.profile!==agentProfile)throw new Fault(409,'PROFILE_MISMATCH','Gateway returned a different agent profile');
      if (typeof result.session_id !== 'string' || !result.session_id || result.session_id.length>300) throw new Fault(502,'INVALID_REMOTE_SESSION','Gateway did not return a session');
      handle.runtime = result.session_id;
      const runtimeModel=typeof result.model==='string'&&result.model.trim()?result.model.trim().slice(0,500):null;
      const profile=agentProfile==='default'?JSON.parse(store.one('SELECT catalog FROM connections WHERE owner=?',row.owner)?.catalog||'null')?.current:selectedProfile;
      if(runtimeModel||!conversation.remote_id&&profile?.model)event(row.id,'model',{model:{id:runtimeModel||profile.model,provider:typeof result.provider==='string'?result.provider.slice(0,200):profile?.provider||null,source:runtimeModel?'session':'catalog-snapshot'}});
      store.run('UPDATE runs SET runtime_id=? WHERE id=?', handle.runtime, row.id);
      store.run('UPDATE conversations SET remote_id=? WHERE id=? AND owner=?', text(result.stored_session_id,300) || conversation.remote_id || handle.runtime, conversation.id, row.owner);
      if (conversation.remote_id && result.running !== false) throw new Fault(409,'REMOTE_STATE_UNKNOWN','Remote session is running or did not confirm idle');
      if (handle.stop) { finish(row.id,'stopped'); return; }
      handle.submitted = true;
      status(row.id,'running');
      const attachments=store.all('SELECT name,content FROM run_attachments WHERE run_id=? ORDER BY position',row.id);
      const mode=row.agent_mode?'\n\n[Workbench collaboration preference for this turn]\nUse the native delegate_task tool when independent subtasks benefit from parallel specialists. Choose appropriate roles (research, implementation, review), provide each child only the authorized context needed, avoid concurrent edits to the same files, and synthesize verified results. Simple tasks do not require delegation. Respect remote concurrency and cost limits and all existing approvals. Do not claim delegation without a real tool call. Report unfinished background work explicitly; do not claim it is complete. Only the parent proposes workbench task mutations. This preference does not grant additional permissions.\n':'';
      await handle.client.rpc('prompt.submit', { session_id:handle.runtime, profile:agentProfile, text:attachedPrompt(row.prompt,attachments)+projectPrompt(row.project_context?JSON.parse(row.project_context):null)+mode });
      if (handle.stop && !handle.finished) await handle.client.rpc('session.interrupt',{session_id:handle.runtime,profile:agentProfile});
    } catch (error) {
      if (!handle.finished) finish(row.id, handle.submitted && error.code !== 'GATEWAY_REJECTED' ? 'unknown' : 'failed', error.code || 'RUN_FAILED');
    }
  }
  return {
    active(owner) { return store.one("SELECT id,status FROM runs WHERE owner=? AND status IN ('queued','running','approval','stopping','unknown')", owner); },
    list(owner) {
      return { conversations: store.all('SELECT id,title,category,metadata_version AS version,created,project_id AS projectId FROM conversations WHERE owner=? ORDER BY created DESC LIMIT 100', owner),
        runs: store.all('SELECT id,conversation_id,prompt,status,created,updated FROM runs WHERE owner=? ORDER BY created DESC LIMIT 100', owner) };
    },
    get(owner,id) {
      const row = own(owner,id);
      return { id:row.id,conversationId:row.conversation_id,prompt:row.prompt,status:row.status,output:row.output,created:row.created,
        agentMode:Boolean(row.agent_mode),
        agentProfile:store.one('SELECT agent_profile FROM conversations WHERE owner=? AND id=?',owner,row.conversation_id)?.agent_profile||'default',
        outcomeCode:JSON.parse(store.one("SELECT body FROM run_events WHERE run_id=? AND json_extract(body,'$.type')='status' ORDER BY seq DESC LIMIT 1",id)?.body||'{}').detail||'',
        tools:store.all("SELECT seq,body FROM run_events WHERE run_id=? AND json_extract(body,'$.type')='tool' ORDER BY seq DESC LIMIT 50",id).reverse().map(v=>({seq:v.seq,...JSON.parse(v.body)})),
        model:JSON.parse(store.one("SELECT e.body FROM run_events e JOIN runs r ON r.id=e.run_id WHERE r.owner=? AND r.conversation_id=? AND json_extract(e.body,'$.type')='model' ORDER BY r.created DESC,e.seq DESC LIMIT 1",owner,row.conversation_id)?.body||'null')?.model||null,
        projectId:store.one('SELECT project_id FROM conversations WHERE owner=? AND id=?',owner,row.conversation_id)?.project_id||null,
        projectAccess:JSON.parse(store.one('SELECT project_access FROM conversations WHERE owner=? AND id=?',owner,row.conversation_id)?.project_access||'{"tasks":false,"documents":[]}'),
        actions:store.one('SELECT status FROM workbench_actions WHERE owner=? AND run_id=?',owner,id)?.status||null,
        executionGranted:Boolean(store.one('SELECT execution_granted FROM conversations WHERE owner=? AND id=?',owner,row.conversation_id)?.execution_granted),
        attachments:store.all('SELECT position,name,bytes FROM run_attachments WHERE run_id=? ORDER BY position',id),
        cursor:store.one('SELECT MAX(seq) AS seq FROM run_events WHERE run_id=?',id)?.seq || 0,
        requests:store.all("SELECT body,status FROM run_requests WHERE run_id=? AND status IN ('pending','sending')",id).map(r=>({...JSON.parse(r.body),status:r.status})) };
    },
    events(owner,id,cursor) { own(owner,id); return store.all('SELECT seq,body FROM run_events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 100',id,cursor).map(r=>({seq:r.seq,...JSON.parse(r.body)})); },
    submit(owner,key,input) {
      const attachments=validateAttachments(input.attachments);
      const fingerprint = hash(JSON.stringify(input));
      const previous = store.one('SELECT * FROM runs WHERE owner=? AND request_key=?',owner,key);
      if (previous) { if (previous.fingerprint !== fingerprint) throw new Fault(409,'IDEMPOTENCY_CONFLICT','Request key was used for another request'); return this.get(owner,previous.id); }
      if (this.active(owner)) throw new Fault(409,'RUN_ACTIVE','Resolve the existing run before starting another');
      const connection = store.one('SELECT id FROM connections WHERE owner=?',owner);
      if (!connection) throw new Fault(409,'HERMES_NOT_CONNECTED','Connect Hermes first');
      let conversation;
      if (input.conversationId) {
        conversation = store.one('SELECT * FROM conversations WHERE owner=? AND id=?',owner,input.conversationId);
        if (!conversation) throw new Fault(404,'CONVERSATION_NOT_FOUND','Conversation was not found');
        if (conversation.connection_id !== connection.id) throw new Fault(409,'CONNECTION_CHANGED','Connection changed; create a new conversation');
        if(input.projectId&&input.projectId!==conversation.project_id)throw new Fault(409,'PROJECT_CONVERSATION_IMMUTABLE','Switch project in a new conversation');
        if(input.projectAccess)throw new Fault(409,'PROJECT_CONVERSATION_IMMUTABLE','Change project permissions in a new conversation');
        if(input.agentProfile&&input.agentProfile!==conversation.agent_profile)throw new Fault(409,'PROFILE_IMMUTABLE','Switch agent in a new conversation');
        if(!conversation.execution_granted&&!input.executionConsent)throw new Fault(403,'EXECUTION_CONSENT_REQUIRED','Authorize this conversation before sending');
      } else {
        if(!input.executionConsent)throw new Fault(403,'EXECUTION_CONSENT_REQUIRED','Authorize this conversation before sending');
        conversation = { id:randomUUID(),owner,connection_id:connection.id,title:input.text.slice(0,60),remote_id:null,created:Date.now() };
        if(input.projectId&&!input.projectConsent)throw new Fault(403,'PROJECT_CONSENT_REQUIRED','Authorize project context before sending');
        conversation.project_id=input.projectId||null;
        conversation.project_access=JSON.stringify(input.projectAccess||{tasks:false,documents:[]});
        conversation.agent_profile=input.agentProfile||'default';
      }
      if(store.one('SELECT enabled FROM profile_access WHERE owner=? AND connection_id=? AND name=?',owner,connection.id,conversation.agent_profile)?.enabled===0)throw new Fault(409,'PROFILE_DISABLED','Profile is paused in this workbench');
      const snapshot=projects.snapshot(owner,conversation.project_id,JSON.parse(conversation.project_access||'{"tasks":false,"documents":[]}'),conversation.id);
      const row = {id:randomUUID(),owner,conversation_id:conversation.id,prompt:input.text,agent_mode:input.agentMode?1:0,project_context:snapshot?JSON.stringify(snapshot):null};
      store.db.exec('BEGIN IMMEDIATE');
      try {
      if(!input.conversationId)store.run('INSERT INTO conversations(id,owner,connection_id,title,remote_id,created,execution_granted) VALUES(?,?,?,?,?,?,1)',conversation.id,owner,connection.id,conversation.title,null,conversation.created);
      if(!input.conversationId)store.run('UPDATE conversations SET project_id=?,project_access=? WHERE id=?',conversation.project_id,conversation.project_access,conversation.id);
      if(!input.conversationId)store.run('UPDATE conversations SET agent_profile=? WHERE id=?',conversation.agent_profile,conversation.id);
      if(input.executionConsent)store.run('UPDATE conversations SET execution_granted=1 WHERE id=? AND owner=?',conversation.id,owner);
      store.run('INSERT INTO runs(id,owner,conversation_id,request_key,fingerprint,prompt,status,created,updated) VALUES(?,?,?,?,?,?,?,?,?)',row.id,owner,conversation.id,key,fingerprint,input.text,'queued',Date.now(),Date.now());
      store.run('UPDATE runs SET project_context=? WHERE id=?',row.project_context,row.id);
      store.run('UPDATE runs SET agent_mode=? WHERE id=?',row.agent_mode,row.id);
      attachments.forEach((file,index)=>store.run('INSERT INTO run_attachments VALUES(?,?,?,?,?)',row.id,index,file.name,file.content,Buffer.byteLength(file.content,'utf8')));
      store.db.exec('COMMIT');
      } catch(error) { if(store.db.isTransaction)store.db.exec('ROLLBACK');throw error; }
      const handle = { output:'',finished:false,submitted:false,started:false,stop:false };
      handle.timer = setTimeout(()=>finish(row.id,'unknown','RUN_TIMEOUT'),10*60*1000); live.set(row.id,handle);
      event(row.id,'status',{status:'queued'});
      void execute(row,conversation);
      return this.get(owner,row.id);
    },
    async interrupt(owner,id) {
      const row = own(owner,id), handle = live.get(id);
      if (!activeStates.includes(row.status)) return this.get(owner,id);
      if (!handle) throw new Fault(409,'RUN_NEEDS_RECONCILIATION','Reconnect and check the remote run first');
      handle.stop = true; status(id,'stopping');
      if (handle.client && handle.runtime) await handle.client.rpc('session.interrupt',{session_id:handle.runtime,profile:handle.profile||'default'});
      return this.get(owner,id);
    },
    messages(owner,conversationId,before) {
      const conversation=store.one('SELECT id FROM conversations WHERE owner=? AND id=?',owner,conversationId);
      if(!conversation)throw new Fault(404,'CONVERSATION_NOT_FOUND','Conversation was not found');
      const position=before?store.one('SELECT rowid AS position FROM runs WHERE id=? AND owner=? AND conversation_id=?',before,owner,conversationId)?.position:Number.MAX_SAFE_INTEGER;
      if(!position)throw new Fault(400,'INVALID_CURSOR','Invalid conversation cursor');
      const rows=store.all('SELECT id FROM runs WHERE owner=? AND conversation_id=? AND rowid<? ORDER BY rowid DESC LIMIT 21',owner,conversationId,position);
      return {messages:rows.slice(0,20).reverse().map(r=>this.get(owner,r.id)),hasMore:rows.length>20};
    },
    attachment(owner,id,index){own(owner,id);const file=store.one('SELECT name,content,bytes FROM run_attachments WHERE run_id=? AND position=?',id,index);if(!file)throw new Fault(404,'ATTACHMENT_NOT_FOUND','Attachment was not found');return file;},
    revoke(owner,conversationId){
      const found=store.one('SELECT id FROM conversations WHERE owner=? AND id=?',owner,conversationId);
      if(!found)throw new Fault(404,'CONVERSATION_NOT_FOUND','Conversation was not found');
      store.run('UPDATE conversations SET execution_granted=0 WHERE owner=? AND id=?',owner,conversationId);
      return {executionGranted:false};
    },
    async answer(owner,id,requestId,answer) {
      own(owner,id); const handle = live.get(id);
      const request = store.one("SELECT * FROM run_requests WHERE id=? AND run_id=? AND status='pending'",requestId,id);
      if (!request || !handle?.client) throw new Fault(409,'REQUEST_EXPIRED','Request expired or connection was lost');
      const data = JSON.parse(request.body);
      if (data.unsupported || (request.method==='approval' && !data.choices.some(c=>c.value===answer))) throw new Fault(400,'INVALID_ANSWER','Answer is not supported for this request');
      store.run("UPDATE run_requests SET status='sending' WHERE id=?",requestId); event(id,'request-answering');
      try {
        if (request.rpc) await handle.client.respond(JSON.parse(request.remote_id), request.method==='approval'?{choice:answer}:{answer});
        else await handle.client.rpc(request.method==='approval'?'approval.respond':'clarify.respond',{session_id:handle.runtime,request_id:JSON.parse(request.remote_id),...(request.method==='approval'?{choice:answer}:{answer})});
        store.run("UPDATE run_requests SET status='answered' WHERE id=?",requestId); event(id,'request-answered');
        if (!handle.finished) status(id,'running');
      } catch(error) { finish(id,'unknown','ANSWER_DELIVERY_UNKNOWN'); throw error; }
      return this.get(owner,id);
    },
    async reconcile(owner,id) {
      const row = own(owner,id);
      if (row.status !== 'unknown') return this.get(owner,id);
      if (!row.runtime_id) throw new Fault(409,'REMOTE_STATE_UNKNOWN','Remote session identity is unknown; inspect the server');
      const conversation = store.one('SELECT * FROM conversations WHERE id=? AND owner=?',row.conversation_id,owner);
      const ticket = await hermes.ticket(owner);
      if (ticket.connectionId !== conversation.connection_id) throw new Fault(409,'CONNECTION_CHANGED','Cannot inspect another connection');
      const client = await gateway(ticket,config.privateHosts,()=>{},()=>{});
      try {
        const remote = await client.rpc('session.status',{session_id:row.runtime_id,profile:conversation.agent_profile||'default'});
        if (remote.running === false) status(id,'ended','REMOTE_IDLE_OUTPUT_UNVERIFIED');
        else throw new Fault(409,'REMOTE_STATE_UNKNOWN','Remote execution is still running or its state is unknown');
      } finally { client.close(); }
      return this.get(owner,id);
    },
    abandon(owner,id) {
      const row=own(owner,id);
      if(row.status!=='unknown') throw new Fault(409,'RUN_STATE_CHANGED','Only unconfirmed runs can be abandoned');
      status(id,'abandoned','USER_ACKNOWLEDGED_REMOTE_MAY_CONTINUE');
      return this.get(owner,id);
    },
    close() { for (const id of [...live.keys()]) finish(id,'unknown','WORKBENCH_SHUTDOWN'); }
  };
}
