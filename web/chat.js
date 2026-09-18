'use strict';
window.HermesChat = (() => {
  const labels={queued:'等待提交',running:'正在执行',approval:'等待确认',stopping:'正在中断',unknown:'结果未确认',completed:'已完成',failed:'执行失败',stopped:'已中断',ended:'远端已停止 · 结果待核对',abandoned:'已结束本地跟踪'};
  const active=s=>['queued','running','approval','stopping','unknown'].includes(s);
  const e=v=>window.HermesViews.esc(v), i=n=>window.HermesViews.icon(n);
  let audioURL=null,speaking=false,sessionsOpen=false,paintTimer=null;
  let consent=null;
  let projectId='',projectAccess={tasks:false,documents:[]};
  let agentProfile='default';
  let agentMode=false,categoryFilter='*',metadataSaving=false,modeLoading=false;
  function sessionRows(){
    const categories=[...new Set(conversations.map(c=>c.category).filter(Boolean))].sort();
    return `<label class="session-category-filter">分类<select id="session-category-filter"><option value="*">全部分类</option><option value="" ${categoryFilter===''?'selected':''}>未分类</option>${categories.map(c=>`<option value="${e(c)}" ${categoryFilter===c?'selected':''}>${e(c)}</option>`).join('')}</select></label><div class="chat-recent">${conversations.filter(c=>categoryFilter==='*'||c.category===categoryFilter).map(c=>`<div class="session-entry"><button data-chat-conversation="${c.id}" aria-current="${current?.conversationId===c.id}">${i('message-square')}<span>${e(c.title)}${c.category?`<small>${e(c.category)}</small>`:''}</span></button><button class="icon-button" data-session-edit="${c.id}" title="重命名与分类" aria-label="重命名与分类">${i('ellipsis')}</button></div>`).join('')}</div>`;
  }
  function editSession(id){
    const c=conversations.find(c=>c.id===id)||sessionSearch.items.find(c=>c.id===id);if(!c)return;
    document.querySelector('#session-editor')?.remove();const dialog=document.createElement('dialog');dialog.id='session-editor';dialog.className='session-editor';
    dialog.innerHTML=`<div class="dialog-head"><h2>整理会话</h2><button type="button" class="icon-button" data-session-close aria-label="关闭">${i('x')}</button></div><form id="session-metadata-form"><label>会话名称<input name="title" required maxlength="120" value="${e(c.title)}"></label><label>分类<input name="category" maxlength="40" list="session-categories" value="${e(c.category)}" placeholder="未分类"></label><datalist id="session-categories">${[...new Set(conversations.map(c=>c.category).filter(Boolean))].map(v=>`<option value="${e(v)}"></option>`).join('')}</datalist><p class="form-error" role="alert"></p><div class="form-actions"><button class="secondary" type="button" data-session-close>取消</button><button class="primary" type="submit">保存</button></div></form>`;
    dialog.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();if(metadataSaving)return;metadataSaving=true;const version=epoch,form=event.target,submit=form.querySelector('[type=submit]');submit.disabled=true;
      try{const values=new FormData(form),updated=await context.api(`/conversations/${id}`,{method:'PATCH',body:{title:values.get('title'),category:values.get('category'),version:c.version}});if(version!==epoch)return;for(const list of [conversations,sessionSearch.items]){const item=list.find(v=>v.id===id);if(item)Object.assign(item,updated);}context.changed();dialog.close();context.render();}
      catch(error){if(version===epoch)form.querySelector('.form-error').textContent=error.message;if(error.code==='CONVERSATION_CONFLICT')await load();}
      finally{metadataSaving=false;submit.disabled=false;}
    });
    dialog.addEventListener('click',event=>{if(event.target.closest('[data-session-close]')&&!metadataSaving)dialog.close();});dialog.addEventListener('cancel',event=>{if(metadataSaving)event.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();window.lucide?.createIcons();
  }
  document.addEventListener('click',event=>{const b=event.target.closest('[data-session-edit]');if(b)editSession(b.dataset.sessionEdit);});
  document.addEventListener('change',event=>{if(event.target.id==='session-category-filter'){categoryFilter=event.target.value;context.render();}});
  function paintOutput(id,version){if(paintTimer)return;paintTimer=setTimeout(()=>{paintTimer=null;if(version!==epoch||current?.id!==id)return;const output=document.querySelector(`[data-output="${id}"]`),log=document.querySelector('.live-chat-log');if(output&&log){const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<70;output.innerHTML=markdown(current.output);window.HermesProjectChat?.decorate(timeline);if(bottom)log.scrollTop=log.scrollHeight;updateJump();}},70);}
  function fitComposer(){const input=document.querySelector('#live-chat-form textarea');if(!input)return;input.style.height='auto';input.style.height=Math.min(180,Math.max(56,input.scrollHeight))+'px';const send=input.form.querySelector('[type=submit]');if(send)send.disabled=!context.state.hermes.connected||submitting||Boolean(current&&active(current.status))||(!draft.trim()&&!files.length);}
  function updateJump(){const log=document.querySelector('.live-chat-log'),button=document.querySelector('[data-chat-action=latest]');if(log&&button)button.hidden=log.scrollHeight-log.scrollTop-log.clientHeight<70;}
  document.addEventListener('scroll',event=>{if(event.target.matches?.('.live-chat-log'))updateJump();},true);
  function stopAudio(){const player=document.querySelector('#voice-player audio');player?.pause();document.querySelector('#voice-player')?.remove();if(audioURL)URL.revokeObjectURL(audioURL);audioURL=null;}
  let context,owner,source,current,selected, runs=[],conversations=[],timeline=[],files=[],draft='',fresh=false,granted=false,submitting=false,loading=false,epoch=0,cursor=0,requestKey, fingerprint,hasMore=false,prepend=false,previewFile;
  function configure(options){context=options;window.HermesProjectChat?.configure(options);window.HermesChatModels?.configure(options);}
  let sessionSearch={query:'',items:[],offset:0,hasMore:false,busy:false,error:'',open:false};
  function searchPanel(){const s=sessionSearch;return `<details class="session-search" ${s.open?'open':''}><summary>搜索历史会话</summary><div class="session-search-input"><input id="session-query" type="search" aria-label="搜索会话标题与消息" value="${e(s.query)}" maxlength="200"><button type="button" class="icon-button" data-session-search="0" aria-label="搜索会话" ${s.busy?'disabled':''}>${i('search')}</button></div>${s.error?`<p class="form-error" role="alert">${e(s.error)}</p>`:''}<div class="session-search-results">${s.items.map(item=>`<button type="button" data-chat-conversation="${item.id}"><span>${e(item.title)}</span><small>${e(new Date(item.created).toLocaleString('zh-CN'))}</small></button>`).join('')}</div><div class="session-search-pager"><button class="icon-button" data-session-search="${s.offset-20}" aria-label="上一页" ${s.busy||s.offset===0?'disabled':''}>${i('chevron-left')}</button><span>${Math.floor(s.offset/20)+1}</span><button class="icon-button" data-session-search="${s.offset+20}" aria-label="下一页" ${s.busy||!s.hasMore?'disabled':''}>${i('chevron-right')}</button></div></details>`;}
  document.addEventListener('toggle',event=>{if(event.target.matches?.('.session-search'))sessionSearch.open=event.target.open;},true);
  document.addEventListener('input',event=>{if(event.target.id==='session-query'){sessionSearch.query=event.target.value;sessionSearch.offset=0;sessionSearch.hasMore=false;}});
  document.addEventListener('keydown',event=>{if(event.target.id==='session-query'&&event.key==='Enter'){event.preventDefault();document.querySelector('[data-session-search="0"]')?.click();}});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-session-search]');if(!b||sessionSearch.busy||!sessionSearch.query.trim())return;
    const s=sessionSearch,version=epoch,q=s.query,offset=Math.max(0,Number(b.dataset.sessionSearch));s.busy=true;s.error='';s.open=true;context.render();
    try{const result=await context.api(`/conversations/search?q=${encodeURIComponent(q)}&offset=${offset}`);if(version===epoch&&s===sessionSearch&&q===s.query)Object.assign(s,result);}
    catch(error){if(version===epoch&&s===sessionSearch)s.error=error.message;}
    finally{if(s===sessionSearch){s.busy=false;if(version===epoch)context.render();}}
  });
  function reset(){consent=null;agentProfile='default';window.HermesProfiles?.reset();agentMode=false;categoryFilter='*';document.querySelector('#session-editor')?.remove();window.HermesChatModels?.reset();projectId='';projectAccess={tasks:false,documents:[]};window.HermesProjectChat?.reset();clearTimeout(paintTimer);paintTimer=null;sessionsOpen=false;epoch++;sessionSearch={query:'',items:[],offset:0,hasMore:false,busy:false,error:'',open:false};stopAudio();speaking=false;source?.close();source=null;owner=null;current=null;selected=null;runs=[];conversations=[];timeline=[];files=[];draft='';fresh=false;granted=false;submitting=false;loading=false;requestKey=null;fingerprint=null;previewFile=null;document.querySelector('#document-preview')?.remove();}
  function markdown(text){return DOMPurify.sanitize(marked.parse(text||'',{gfm:true,breaks:true}),{ALLOWED_TAGS:['p','br','h1','h2','h3','h4','h5','h6','ul','ol','li','strong','em','del','blockquote','pre','code','hr','table','thead','tbody','tr','th','td','a'],ALLOWED_ATTR:['href','title'],ALLOW_DATA_ATTR:false});}
  function syncCurrent(){if(!current)return;const index=timeline.findIndex(r=>r.id===current.id);if(index<0)timeline.push(current);else timeline[index]=current;}
  async function load(){
    if(!context.state.me||loading)return;
    if(owner!==context.state.me.user.id){reset();owner=context.state.me.user.id;}
    const version=epoch;loading=true;
    try{
      const result=await context.api('/runs');if(version!==epoch)return;runs=result.runs;conversations=result.conversations;
      if(!selected&&!fresh)selected=runs[0]?.id;
      if(selected){const target=selected,detail=await context.api(`/runs/${target}`);if(version!==epoch)return;
        const history=await context.api(`/conversations/${detail.conversationId}/messages`);if(version!==epoch||selected!==target||submitting)return;
        const same=current?.conversationId===detail.conversationId;
        timeline=same?timeline.filter(r=>!history.messages.some(n=>n.id===r.id)).concat(history.messages):history.messages;
        hasMore=same&&timeline.length>20?hasMore:history.hasMore;
        current=timeline.at(-1)||detail;if(!same)agentMode=Boolean(current.agentMode);selected=current.id;granted=current.executionGranted;watch();
      }
    }finally{if(version===epoch)loading=false;}
  }
  function watch(){
    source?.close();source=null;if(!current||!active(current.status)||current.status==='unknown')return;
    const id=current.id,version=epoch;cursor=current.cursor;
    source=new EventSource(`/api/runs/${id}/events?after=${cursor}`);
    source.onmessage=async message=>{
      if(version!==epoch||current?.id!==id)return;
      const event=JSON.parse(message.data);if(event.seq<=cursor)return;cursor=event.seq;
      if(event.type==='model'){current.model=event.model;syncCurrent();context.render();return;}
      if(['tool','reasoning','progress'].includes(event.type)){if(event.type==='tool')current.tools=[...(current.tools||[]),event].slice(-50);else if(event.type==='reasoning')current.reasoning=(current.reasoning||'')+event.text;else current.progress=event;syncCurrent();renderActivity(current);return;}
      if(event.type==='delta'||event.type==='output'){
        current.output=event.type==='output'?event.text:current.output+event.text;syncCurrent();
        paintOutput(id,version);
      }else if(event.type==='status'){
        current.status=event.status;syncCurrent();context.render();
        if(!active(event.status)||event.status==='unknown'){source?.close();source=null;await load().catch(()=>{});if(version===epoch&&event.status==='completed'&&current?.projectId){await context.refresh().catch(()=>{});context.changed();}if(version===epoch)context.render();}
      }else if(event.type.startsWith('request')){
        try{const detail=await context.api(`/runs/${id}`);if(version===epoch&&current?.id===id){current=detail;cursor=Math.max(cursor,detail.cursor);syncCurrent();context.render();}}catch(error){context.notify(error.message);}
      }
    };
    source.onerror=()=>{if(version===epoch&&current?.id===id){const status=document.querySelector('.live-run-status');if(status)status.textContent='连接中断，正在恢复记录…';}};
  }
  function approvals(){return(current?.requests||[]).map(r=>`<section class="chat-approval"><strong>${e(r.title)}</strong><pre>${e(r.detail)}</pre>${r.unsupported?'<p>请在 Hermes 服务器处理此请求，或中断执行。</p>':r.method==='approval'?`<div class="approval-actions">${r.choices.map(c=>`<button class="secondary" data-run-answer="${r.id}" data-answer="${e(c.value)}" ${r.status==='sending'?'disabled':''}>${e(c.label)}</button>`).join('')}</div>`:`<form class="clarify-form" data-request="${r.id}"><label>回复<input name="answer" required maxlength="4000"></label><button class="primary">发送答复</button></form>`}</section>`).join('');}
  function fileButton(f,attrs){return `<button type="button" class="chat-file" ${attrs} title="${e(f.name)}">${i('file-text')}<span>${e(f.name)}</span><small>${Math.ceil(f.bytes/1024)} KB</small></button>`;}
  function renderActivity(run){
    const output=document.querySelector(`[data-output="${run.id}"]`);if(!output||!run.reasoning&&!run.progress&&!run.tools?.length)return;
    let activity=output.parentElement.querySelector('.run-activity');if(!activity){activity=document.createElement('div');activity.className='run-activity';output.before(activity);}
    const open=activity.querySelector('.reasoning-panel')?.open||false,toolsOpen=activity.querySelector('.agent-tool-events')?.open||false;
    const labels={connected:'连接已建立','connection-reused':'已复用会话连接',completed:'已完成',failed:'执行失败',stopped:'已中断',unknown:'结果未确认','first-text':'开始返回正文',connecting:'正在连接服务器',submitted:'已提交，等待模型响应',thinking:'模型正在思考','compression.started':'正在整理上下文','compression.completed':'上下文整理完成'};
    activity.innerHTML=`${run.progress?`<p class="activity-phase">${e(labels[run.progress.phase]||run.progress.phase)} · ${Math.max(0,(run.progress.at-run.created)/1000).toFixed(1)} s</p>`:''}${run.reasoning?`<details class="reasoning-panel" ${open?'open':''}><summary>模型返回的思考</summary><pre></pre></details>`:''}${run.tools?.length?`<details class="agent-tool-events" ${toolsOpen?'open':''}><summary>工具活动 · ${run.tools.length}</summary>${run.tools.map(t=>`<div><code>${e(t.name)}</code><span>${t.status==='tool.start'?'开始调用':t.status==='tool.complete'?'调用完成':'调用失败'}</span></div>`).join('')}</details>`:''}`;
    const pre=activity.querySelector('.reasoning-panel pre');if(pre)pre.textContent=run.reasoning;
  }
  function panel(state){
    const connected=state.hermes.connected,busy=current&&active(current.status);
    return `<aside class="assistant ${state.aiDrawer?'drawer':''}" aria-label="Hermes 助手">
      <div class="assistant-top"><span class="ai-mark">${i('sparkles')}</span><h2>Hermes</h2><button class="icon-button" data-chat-action="sessions" title="历史会话" aria-label="历史会话" aria-expanded="${sessionsOpen}">${i('history')}</button><button class="icon-button" data-chat-action="expand" title="${state.chatExpanded?'还原面板':'展开对话'}" aria-label="展开对话">${i('maximize-2')}</button><button class="icon-button" data-chat-action="new" title="新对话" aria-label="新对话">${i('square-pen')}</button><button class="icon-button" data-action="toggle-ai" title="收起助手" aria-label="收起助手">${i('panel-right-close')}</button></div>
      <div class="assistant-status"><span class="dot ${busy?'amber':''}"></span><span class="live-run-status">${current?labels[current.status]:connected?'就绪 · 默认档案':'未连接 Agent'}</span></div>
      ${window.HermesProjectChat?.bar(current?.projectId||projectId,current?.projectAccess||projectAccess,Boolean(busy||submitting))||''}
      ${sessionsOpen?`<section class="chat-session-drawer" aria-label="历史会话"><header><strong>历史会话</strong><button class="icon-button" data-chat-action="sessions" title="关闭历史" aria-label="关闭历史">${i('x')}</button></header><select id="conversation-select" aria-label="对话记录"><option value="">新对话</option>${conversations.map(c=>`<option value="${c.id}" ${current?.conversationId===c.id?'selected':''}>${e(c.title)}</option>`).join('')}</select>
      ${searchPanel()}${sessionRows()}</section>`:''}
      <details class="chat-context" ${state.aiContext?'open':''}><summary title="上下文与权限" aria-label="上下文与权限">${i('shield-check')}</summary><div class="chat-context-popover"><strong>上下文与权限</strong><p>共享会话历史、已授权的项目数据及主动附加的文件；不共享健康数据。</p><button class="text-button" data-chat-action="permission">${i('shield-check')}${granted?'已授权本会话 · 撤销':'尚未授权执行'}</button></div></details>
      <div class="chat-stream"><div class="chat-log live-chat-log" role="log" aria-label="对话消息">${hasMore?'<button class="text-button" data-chat-action="older">加载更早消息</button>':''}${timeline.length?timeline.map(r=>`<article class="chat-turn"><small class="message-author">你</small><div class="user-message">${e(r.prompt)}</div><div class="chat-files">${(r.attachments||[]).map(f=>fileButton(f,`data-file-run="${r.id}" data-file-index="${f.position}"`)).join('')}</div><small class="message-author">Hermes${r.status==='completed'?'':` · ${labels[r.status]||e(r.status)}`}</small><div class="assistant-message chat-output markdown-body" data-output="${r.id}">${r.output?markdown(r.output):`<span class="chat-waiting">${active(r.status)?'正在等待回复…':'没有返回文本'}</span>`}</div>${r.output?`<div class="chat-message-actions"><button class="icon-button" data-copy-response="${r.id}" title="复制回复" aria-label="复制回复">${i('copy')}</button><button class="icon-button" data-preview-response="${r.id}" title="预览 Markdown" aria-label="预览 Markdown">${i('file-text')}</button></div>`:''}</article>`).join(''):`<div class="chat-welcome">${i('sparkles')}<h3>下一件事，一起完成。</h3>${connected?'':`<button class="secondary" data-page="hermes">${i('plug')}连接 Hermes</button>`}</div>`}${approvals()}${consentCard()}</div><button class="icon-button chat-jump" data-chat-action="latest" title="回到最新消息" aria-label="回到最新消息" hidden>${i('arrow-down')}</button></div>
      ${current?.status==='unknown'?'<div class="chat-recovery"><p>请求可能仍在远端执行，未自动重发。</p><button class="secondary" data-chat-action="reconcile">核对远端状态</button></div>':''}
      <form id="live-chat-form" class="assistant-compose"><div class="pending-files">${files.map((f,index)=>`<div>${fileButton(f,`data-pending-preview="${index}"`)}<button type="button" class="icon-button" data-remove-file="${index}" aria-label="移除 ${e(f.name)}" title="移除附件">${i('x')}</button></div>`).join('')}</div><input type="file" id="chat-file-input" multiple hidden accept=".md,.markdown,.txt,.json,.csv,.log,.js,.ts,.jsx,.tsx,.py,.css,.html,.xml,.yaml,.yml,.sh,.sql"><div class="chat-input"><textarea name="message" aria-label="发送给 Hermes 的消息" placeholder="描述任务，让 Hermes 接着做…" maxlength="6000" ${!connected||submitting?'disabled':''}>${e(draft)}</textarea><div class="compose-footer"><button type="button" class="icon-button" data-chat-action="attach" title="添加文本或代码附件" aria-label="添加附件" ${busy||submitting?'disabled':''}>${i('paperclip')}</button><button type="button" class="icon-button" data-chat-action="plan" title="起草任务清单" aria-label="起草任务清单" ${busy||submitting?'disabled':''}>${i('list-todo')}</button><button type="button" class="model-label model-picker" data-page="hermes" title="管理模型">${e(current?'会话模型':state.hermes.catalog?.current?.model||'远端默认模型')}</button>${busy&&current.status!=='unknown'?`<button type="button" class="send" data-chat-action="stop" aria-label="中断执行" title="中断执行">${i('square')}</button>`:`<button type="submit" class="send" aria-label="发送" title="发送" ${!connected||busy||submitting?'disabled':''}>${i('arrow-up')}</button>`}</div></div></form></aside>`;
  }
  function history(){return `<div class="page-header"><h1>执行中心</h1><button class="secondary" data-chat-action="reload">${i('refresh-cw')}刷新</button></div>${runs.map(r=>`<button class="run-row live-run-row" data-chat-run="${r.id}"><span>${i('message-square')}</span><span><strong>${e(r.prompt.slice(0,100))}</strong><small>${e(new Date(r.created).toLocaleString('zh-CN'))}</small></span><span class="tag">${labels[r.status]}</span></button>`).join('')||'<div class="empty-state">暂无执行记录</div>'}`;}
  function authorize(send=false){consent={version:epoch,origin:context.state.hermes.origin,send};context.state.aiContext=false;context.render();document.querySelector('[data-consent="allow"]')?.focus();return false;}
  function consentCard(){if(!consent||consent.version!==epoch)return '';return `<section class="interaction-card consent-card" aria-label="会话授权"><header>${i('shield-check')}<strong>授权本次会话</strong><span class="tag">待确认</span></header><div class="interaction-body"><p>消息、所选附件和已授权的项目资料将发送至：</p><code>${e(consent.origin)}</code><p>允许 Hermes 按远端权限调用工具，可能产生费用。不自动共享健康数据，远端工具审批仍需单独确认。</p><small>授权持续到撤销或新建会话。</small></div><footer><button type="button" class="secondary" data-consent="cancel">暂不授权</button><button type="button" class="primary" data-consent="allow">${consent.send?'授权并发送':'授权本会话'}</button></footer></section>`;}
  document.addEventListener('click',event=>{
    const button=event.target.closest('[data-consent]');if(!button||!consent)return;
    const pending=consent;consent=null;
    if(button.dataset.consent==='allow'&&pending.version===epoch&&pending.origin===context.state.hermes.origin){granted=true;context.render();if(pending.send)document.querySelector('#live-chat-form')?.requestSubmit();}
    else context.render();
  });
  async function action(button){
    if(submitting)return;const name=button.dataset.chatAction,version=epoch;
    try{
      if(name==='agent-mode'){
        if(modeLoading||current&&active(current.status))return;
        if(agentMode){agentMode=false;context.render();return;}
        modeLoading=true;context.render();
        try{const tools=await context.api(`/hermes/capabilities/tools?profile=${encodeURIComponent(current?.agentProfile||agentProfile)}`);if(version!==epoch)return;if(!tools.items.some(t=>t.enabled===true&&t.tools.includes('delegate_task')))throw new Error('服务器未启用原生 Agent 委派工具，请在工具权限中检查。');if(confirm('启用 Agent 协作？Hermes 将按任务需要委派子 Agent，可能增加模型费用。原有工具审批仍然有效。'))agentMode=true;}finally{modeLoading=false;}
        context.render();return;
      }
      if(name==='sessions'){sessionsOpen=!sessionsOpen;context.state.aiContext=false;context.render();return;}
      if(name==='latest'){const log=document.querySelector('.live-chat-log');if(log)log.scrollTop=log.scrollHeight;updateJump();return;}
      if(name==='expand'){context.state.chatExpanded=!context.state.chatExpanded;context.state.aiHidden=false;context.state.aiDrawer=innerWidth<=1080;context.render();return;}
      if(name==='plan'){draft+=(draft?'\n\n':'')+'请把接下来要做的事整理成 Markdown 未完成复选清单（- [ ] 任务名称），每项一个明确行动，最多 30 项。只提出建议，不要执行或声称已经创建任务。';context.render();document.querySelector('#live-chat-form textarea')?.focus();return;}
      if(name==='attach'){document.querySelector('#chat-file-input').click();return;}
      if(name==='new'||button.dataset.chatRun||button.dataset.chatConversation){
        if((draft||files.length)&&!confirm('放弃当前未发送的消息和附件？'))return;
        projectId='';projectAccess={tasks:false,documents:[]};sessionsOpen=false;epoch++;source?.close();loading=false;draft='';files=[];timeline=[];current=null;granted=false;hasMore=false;selected=button.dataset.chatRun||null;fresh=!selected;
        if(button.dataset.chatConversation){const version=epoch,result=await context.api(`/conversations/${button.dataset.chatConversation}/messages`);if(version!==epoch)return;selected=result.messages.at(-1)?.id;fresh=!selected;}
        if(selected)await load();context.state.aiHidden=false;context.state.aiDrawer=innerWidth<=1080;if(innerWidth<=760)context.state.page='chat';context.render();return;
      }
      if(name==='permission'){
        if(granted){if(!confirm('撤销本会话后续消息的执行授权？已开始的任务不会因此停止。'))return;if(current)await context.api(`/conversations/${current.conversationId}/revoke`,{method:'POST'});if(version!==epoch)return;granted=false;if(current)current.executionGranted=false;}
        else authorize();context.render();return;
      }
      if(name==='older'){const result=await context.api(`/conversations/${current.conversationId}/messages?before=${timeline[0].id}`);if(version!==epoch)return;timeline=result.messages.filter(r=>!timeline.some(t=>t.id===r.id)).concat(timeline);hasMore=result.hasMore;prepend=true;context.render();return;}
      submitting=true;button.disabled=true;let result;
      if(name==='stop')result=await context.api(`/runs/${current.id}/interrupt`,{method:'POST'});
      if(name==='reconcile')result=await context.api(`/runs/${current.id}/reconcile`,{method:'POST'});
      if(name==='abandon'&&confirm('这不会停止远端任务。确认已核对风险并结束本地跟踪？'))result=await context.api(`/runs/${current.id}/abandon`,{method:'POST',body:{acknowledgeRemoteMayContinue:true}});
      if(button.dataset.runAnswer)result=await context.api(`/runs/${current.id}/requests/${button.dataset.runAnswer}`,{method:'POST',body:{answer:button.dataset.answer}});
      if(version!==epoch)return;if(result){current=result;syncCurrent();}if(name==='reload'||name==='reconcile')await load();
    }catch(error){context.notify(error.message);}finally{if(version===epoch){submitting=false;context.render();}}
  }
  async function addFiles(incoming){
    if(submitting||current&&active(current.status)){context.notify('请先结束或核对当前执行，再添加附件。');return;}const version=epoch;
    if(!incoming.length){context.notify('未读取到文件，请拖入实际文件而不是文件夹或链接。');return;}
    for(const file of incoming){
      try{
        if(!/^[^/\\\x00-\x1f]+\.(md|markdown|txt|json|csv|log|js|ts|jsx|tsx|py|css|html|xml|yaml|yml|sh|sql)$/i.test(file.name)||file.name.length>160)throw new Error('目前支持 Markdown、文本和代码文件；暂不支持图片、PDF 或 Office 文件。');
        if(file.size>64000)throw new Error('单个附件不能超过 64 KB');
        const content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(version!==epoch)return;
        if(content.includes('\0'))throw new Error('不支持二进制文件');
        if(files.length>=5||files.reduce((n,f)=>n+f.bytes,0)+file.size>192000)throw new Error('最多 5 个附件，总大小不超过 192 KB');
        files.push({name:file.name,content,bytes:file.size});
      }catch(error){context.notify(error.message);}
    }
    if(version===epoch)context.render();
  }
  function preview(file,raw=false){
    previewFile=file;let dialog=document.querySelector('#document-preview');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='document-preview';dialog.className='document-preview';document.body.append(dialog);dialog.addEventListener('close',()=>{previewFile=null;dialog.remove();});}
    dialog.innerHTML=`<header class="dialog-head"><h2>${e(file.name)}</h2><button class="icon-button" data-preview-close title="关闭预览" aria-label="关闭预览">${i('x')}</button></header><div class="preview-toolbar"><div class="tabs"><button data-preview-mode="preview" class="${raw?'':'active'}">预览</button><button data-preview-mode="source" class="${raw?'active':''}">源文件</button></div><button class="icon-button" data-preview-download title="下载文件" aria-label="下载文件">${i('download')}</button></div><div class="document-content markdown-body">${!raw&&/\.(md|markdown)$/i.test(file.name)?markdown(file.content):`<pre><code>${e(file.content)}</code></pre>`}</div>`;
    window.lucide?.createIcons();
    if(!dialog.open)dialog.showModal();
  }
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');
    if(event.target.closest('.markdown-body a')){event.preventDefault();const a=event.target.closest('a');try{const url=new URL(a.getAttribute('href'));if(['https:','http:'].includes(url.protocol))window.open(url.href,'_blank','noopener,noreferrer');}catch{}return;}
    if(!b)return;
    if(b.matches('[data-chat-action],[data-chat-run],[data-run-answer],[data-chat-conversation]')){event.preventDefault();void action(b);return;}
    const version=epoch;
    try{
      if(b.dataset.copyResponse){const run=timeline.find(r=>r.id===b.dataset.copyResponse);if(run){await navigator.clipboard.writeText(run.output);context.notify('回复已复制');}}
      if(b.dataset.removeFile!==undefined){files.splice(Number(b.dataset.removeFile),1);context.render();}
      if(b.dataset.pendingPreview!==undefined)preview(files[Number(b.dataset.pendingPreview)]);
      if(b.dataset.fileRun){const file=await context.api(`/runs/${b.dataset.fileRun}/attachments/${b.dataset.fileIndex}`);if(version===epoch)preview(file);}
      if(b.dataset.previewResponse){const run=timeline.find(r=>r.id===b.dataset.previewResponse);if(run)preview({name:'Hermes回复.md',content:run.output});}
      if(b.dataset.saveResponse){const run=timeline.find(r=>r.id===b.dataset.saveResponse);if(run&&!active(run.status))await window.HermesDocuments.saveReply(run);}
      if(b.dataset.speakResponse&&!speaking){
        const run=timeline.find(r=>r.id===b.dataset.speakResponse);if(!run)return;
        if(run.output.length>8000)throw new Error('回复过长，请先在文档中整理为短文本。');
        speaking=true;b.disabled=true;
        try{const result=await context.api('/hermes/speak',{method:'POST',body:{text:run.output}});if(version!==epoch)return;stopAudio();const [header,encoded]=result.dataUrl.split(',');audioURL=URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:header.slice(5).split(';')[0]}));
          const dock=document.createElement('div');dock.id='voice-player';dock.innerHTML=`<audio controls aria-label="语音播放"></audio><button class="icon-button" data-stop-audio title="关闭朗读" aria-label="关闭朗读">${i('x')}</button>`;document.body.append(dock);dock.querySelector('audio').src=audioURL;window.lucide?.createIcons();await dock.querySelector('audio').play().catch(()=>{});
        }finally{if(version===epoch)speaking=false;b.disabled=false;}
      }
      if(b.hasAttribute('data-stop-audio'))stopAudio();
      if(b.hasAttribute('data-preview-close'))document.querySelector('#document-preview').close();
      if(b.dataset.previewMode)preview(previewFile,b.dataset.previewMode==='source');
      if(b.hasAttribute('data-preview-download')&&previewFile){const url=URL.createObjectURL(new Blob([previewFile.content],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=previewFile.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    }catch(error){context.notify(error.message);}
  });
  document.addEventListener('input',event=>{if(event.target.matches('#live-chat-form textarea')){draft=event.target.value;fitComposer();}});
  document.addEventListener('toggle',event=>{if(event.target.isConnected&&event.target.matches('.chat-context'))context.state.aiContext=event.target.open;},true);
  document.addEventListener('change',event=>{
    if(event.target.id==='chat-file-input')void addFiles([...event.target.files]);
    if(event.target.id==='conversation-select')void action({dataset:event.target.value?{chatConversation:event.target.value}:{chatAction:'new'}});
  });
  const fileDrag=event=>Array.from(event.dataTransfer?.types||[]).includes('Files');
  function clearDrop(){document.querySelectorAll('.chat-drop-active').forEach(el=>el.classList.remove('chat-drop-active'));document.querySelector('#chat-drop-hint')?.remove();}
  document.addEventListener('dragover',event=>{
    if(!fileDrag(event)||!context?.state.me)return;event.preventDefault();
    const assistant=event.target.closest?.('.assistant');
    if(!assistant){clearDrop();event.dataTransfer.dropEffect='none';return;}
    event.dataTransfer.dropEffect='copy';assistant.classList.add('chat-drop-active');
    if(!document.querySelector('#chat-drop-hint')){const hint=document.createElement('div');hint.id='chat-drop-hint';hint.role='status';hint.textContent='松开以添加附件';assistant.append(hint);}
  });
  document.addEventListener('dragleave',event=>{if(!event.relatedTarget)clearDrop();});
  document.addEventListener('dragend',clearDrop);
  document.addEventListener('drop',event=>{
    if(!fileDrag(event)||!context?.state.me)return;event.preventDefault();clearDrop();
    if(!event.target.closest?.('.assistant')){context.notify('请将文件拖入 Hermes 对话区域。');return;}
    const entries=[...(event.dataTransfer.items||[])];if(entries.some(item=>item.webkitGetAsEntry?.()?.isDirectory)){context.notify('暂不支持上传文件夹，请选择具体文件。');return;}
    void addFiles([...event.dataTransfer.files]);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&(sessionsOpen||context?.state.aiContext)){sessionsOpen=false;context.state.aiContext=false;context.render();document.querySelector('#live-chat-form textarea')?.focus();return;}
    if(event.target.matches('#live-chat-form textarea')&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.target.form.requestSubmit();}
    if(!event.target.matches('.agent-tabs [role=tab]')||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=[...event.target.parentElement.querySelectorAll('[role=tab]')],index=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length,id=tabs[next].dataset.agentTab;tabs[next].click();document.querySelector(`[data-agent-tab="${id}"]`)?.focus();
  });
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.matches('#live-chat-form,.clarify-form'))return;event.preventDefault();if(submitting||form.id==='live-chat-form'&&current&&active(current.status))return;
    if(form.id==='live-chat-form'){if(!draft.trim()&&!files.length)return;if(!granted){authorize(true);return;}}
    submitting=true;const version=epoch;context.render();
    try{
      if(form.matches('.clarify-form')){const result=await context.api(`/runs/${current.id}/requests/${form.dataset.request}`,{method:'POST',body:{answer:new FormData(form).get('answer')}});if(version!==epoch)return;current=result;syncCurrent();}
      else{
        const body={text:draft.trim()||'请查看所附文件。',agentProfile:current?.agentProfile||agentProfile,agentMode,...(current?.executionGranted?{}:{executionConsent:true}),...(current?{conversationId:current.conversationId}:projectId?{projectId,projectAccess,projectConsent:true}:{}),...(files.length?{attachments:files.map(({name,content})=>({name,content}))}:{})};
        const next=JSON.stringify(body);if(fingerprint!==next){requestKey=crypto.randomUUID();fingerprint=next;}
        const run=await context.api('/runs',{method:'POST',key:requestKey,body});if(version!==epoch)return;
        current=run;selected=run.id;fresh=false;draft='';files=[];granted=run.executionGranted;requestKey=null;fingerprint=null;syncCurrent();watch();
      }
    }catch(error){if(version===epoch){if(error.code==='EXECUTION_CONSENT_REQUIRED'){granted=false;if(current)current.executionGranted=false;}context.notify(error.message);}}finally{if(version===epoch){submitting=false;context.render();}}
  });
  function capture(){const log=document.querySelector('.live-chat-log'),input=document.querySelector('#live-chat-form textarea');return {conversationId:current?.conversationId,top:log?.scrollTop||0,height:log?.scrollHeight||0,bottom:!log||log.scrollHeight-log.scrollTop-log.clientHeight<70,focus:document.activeElement===input,start:input?.selectionStart,end:input?.selectionEnd};}
  function restore(saved){const log=document.querySelector('.live-chat-log');if(log)log.scrollTop=saved.conversationId!==current?.conversationId?log.scrollHeight:prepend?saved.top+log.scrollHeight-saved.height:saved.bottom?log.scrollHeight:saved.top;prepend=false;if(saved.focus){const input=document.querySelector('#live-chat-form textarea');input?.focus({preventScroll:true});input?.setSelectionRange(saved.start,saved.end);}
    fitComposer();updateJump();
    for(const button of document.querySelectorAll('.session-search-results>button[data-chat-conversation]')){const row=document.createElement('div');row.className='session-entry';button.before(row);row.append(button);const edit=document.createElement('button');edit.type='button';edit.className='icon-button';edit.dataset.sessionEdit=button.dataset.chatConversation;edit.title='重命名与分类';edit.setAttribute('aria-label',edit.title);edit.innerHTML=i('ellipsis');row.append(edit);}
    for(const run of timeline){if(run.status!=='failed'||!run.outcomeCode)continue;const output=document.querySelector(`[data-output="${run.id}"]`);if(output&&!output.parentElement.querySelector('.run-failure')){const error=document.createElement('p');error.className='run-failure form-error';error.textContent=run.outcomeCode==='DELEGATION_UNAVAILABLE'?'服务器未启用原生 Agent 委派工具，请在工具权限中检查。':run.outcomeCode;output.after(error);}}
    const footer=document.querySelector('.compose-footer');
    if(footer&&!footer.querySelector('[data-chat-action="agent-mode"]')){const button=document.createElement('button');button.type='button';button.className='icon-button agent-mode-toggle';button.dataset.chatAction='agent-mode';button.title=agentMode?'Agent 协作已开启':'Agent 协作';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(agentMode));button.disabled=modeLoading||!context.state.hermes.connected||submitting||Boolean(current&&active(current.status));button.innerHTML=i('network');footer.querySelector('[data-chat-action="plan"]')?.before(button);}
    for(const run of timeline)renderActivity(run);
    window.HermesProjectChat?.decorate(timeline);
    window.HermesChatModels?.decorate(Boolean(current),Boolean(submitting||current&&active(current.status)));
    const collaboration=document.querySelector('[data-chat-action="agent-mode"]'),scope=document.querySelector('.chat-context-popover');if(collaboration&&scope){collaboration.classList.add('text-button');collaboration.classList.remove('icon-button');collaboration.innerHTML=i('network')+(agentMode?'本会话优先协作：开启':'本会话优先协作：关闭');scope.append(collaboration);}
    if(!timeline.length)window.HermesProjectChat?.welcome(projectId);
    for(const run of timeline){if(run.status!=='completed'||run.actions)continue;const preview=document.querySelector(`[data-preview-response="${run.id}"]`);if(preview&&!preview.parentElement.querySelector('[data-plan-run]')){const button=document.createElement('button');button.className='icon-button';button.dataset.planRun=run.id;button.title='安排为待办';button.setAttribute('aria-label','安排为待办');button.innerHTML=i('list-plus');preview.after(button);}}
    for(const run of timeline){if(!run.output||active(run.status))continue;const preview=document.querySelector(`[data-preview-response="${run.id}"]`);if(preview&&!preview.parentElement.querySelector('[data-save-response]')){const button=document.createElement('button');button.className='icon-button';button.dataset.saveResponse=run.id;button.title='保存为工作空间文档';button.setAttribute('aria-label','保存为工作空间文档');button.innerHTML=i('save');preview.after(button);}}
    for(const run of timeline){if(!run.output||active(run.status))continue;const preview=document.querySelector(`[data-preview-response="${run.id}"]`);if(preview&&!preview.parentElement.querySelector('[data-speak-response]')){const button=document.createElement('button');button.className='icon-button';button.dataset.speakResponse=run.id;button.title='服务器朗读回复';button.setAttribute('aria-label','服务器朗读回复');button.disabled=speaking;button.innerHTML=i('volume-2');preview.after(button);}}
  }
  async function attachDocument(file){
    if(submitting||current&&active(current.status)){context.notify('请先结束或核对当前执行，再附加文档。');return false;}
    const count=files.length;await addFiles([new File([file.content],file.name,{type:'text/plain'})]);
    if(files.length===count)return false;
    context.state.aiHidden=false;context.state.aiDrawer=innerWidth<=1080;context.render();return true;
  }
  async function openProject(id,access){
    if(submitting||current&&active(current.status)){context.notify('请先结束或核对当前执行。');return false;}
    if((current||draft||files.length)&&!confirm('切换项目将新建会话，未发送内容不会带入。继续？'))return false;
    draft='';files=[];await action({dataset:{chatAction:'new'}});projectId=id;projectAccess=access;
    context.state.aiHidden=false;context.state.aiDrawer=innerWidth<=1080;if(innerWidth<=760)context.state.page='chat';else context.state.chatExpanded=true;context.render();return true;
  }
  function draftMessage(text){draft=text;context.render();document.querySelector('#live-chat-form textarea')?.focus();}
  async function prepareExternalAgent(text){
    if(submitting||current&&active(current.status)){context.notify('请先结束或核对当前执行。');return false;}
    if((draft||files.length)&&!confirm('放弃当前未发送的消息和附件？'))return false;
    draft='';files=[];await action({dataset:{chatAction:'new'}});agentProfile='default';agentMode=false;draft=text;
    context.state.chatExpanded=innerWidth>760;context.state.aiHidden=false;context.state.aiDrawer=innerWidth<=1080;if(innerWidth<=760)context.state.page='chat';
    context.render();document.querySelector('#live-chat-form textarea')?.focus();return true;
  }
  function newModelConversation(){agentProfile=current?.agentProfile||agentProfile;projectId=current?.projectId||projectId;projectAccess=current?.projectAccess||projectAccess;epoch++;source?.close();source=null;loading=false;current=null;selected=null;timeline=[];fresh=true;granted=false;hasMore=false;requestKey=null;fingerprint=null;context.render();}
  async function selectProfile(name){
    if(submitting||current&&active(current.status)){context.notify('请先结束或核对当前执行。');return false;}
    if(name===(current?.agentProfile||agentProfile))return true;
    if((current||draft||files.length)&&!confirm('切换 Agent 将新建会话，未发送内容不会带入。继续？'))return false;
    draft='';files=[];newModelConversation();agentProfile=name;agentMode=false;context.state.aiHidden=false;context.state.aiDrawer=innerWidth<=1080;if(innerWidth<=760)context.state.page='chat';context.render();return true;
  }
  return {configure,reset,load,panel,history,capture,restore,preview,markdown,attachDocument,openProject,draftMessage,prepareExternalAgent,newModelConversation,selectProfile,modelState:()=>({profile:current?.agentProfile||agentProfile,hasConversation:Boolean(current),model:current?.model,canSwitch:!submitting&&!(current&&active(current.status))}),projectId:()=>current?.projectId||projectId,hasDraft:()=>Boolean(draft||files.length),summary:()=>({pending:runs.filter(r=>r.status==='approval').length})};
})();
