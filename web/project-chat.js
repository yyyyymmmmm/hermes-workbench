'use strict';
window.HermesProjectChat=(()=>{
 let context,dialog=null,epoch=0;
 const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
 const statusLabels={pending:'待确认',applied:'已同步到待办',undone:'已撤销',dismissed:'已忽略',invalid:'任务指令格式无效'};
 function reset(){epoch++;dialog?.remove();dialog=null;}
 function modal(title){reset();dialog=document.createElement('dialog');dialog.className='project-chat-dialog';dialog.innerHTML=`<div class="dialog-head"><h2>${e(title)}</h2><button type="button" class="icon-button" data-project-chat-close title="关闭" aria-label="关闭">${i('x')}</button></div><div class="project-chat-body" role="status">正在加载</div>`;dialog.addEventListener('cancel',event=>{event.preventDefault();reset();});dialog.addEventListener('click',event=>{if(event.target.closest('[data-project-chat-close]'))reset();});document.body.append(dialog);dialog.showModal();return epoch;}
 function error(message){if(dialog){let el=dialog.querySelector('[role=alert]');if(!el){el=document.createElement('p');el.className='form-error';el.role='alert';dialog.append(el);}el.textContent=message;}else context.notify(message);}
 function bar(id,access,busy){const projects=window.HermesProjects.overview();return `<div class="chat-project-toolbar"><label class="chat-project-select">${i('folder')}<select id="chat-project-select" aria-label="对话项目" title="${e(id?projects.find(p=>p.id===id)?.name||'项目不可用':'未关联项目')}" data-current="${e(id||'')}" ${busy?'disabled':''}><option value="">项目</option>${id&&!projects.some(p=>p.id===id)?`<option value="${e(id)}" selected disabled>项目不可用</option>`:''}${projects.map(p=>`<option value="${p.id}" ${p.id===id?'selected':''}>${e(p.name)}</option>`).join('')}</select>${i('chevron-down')}</label>${id?`<button type="button" class="icon-button" data-project-policy="${e(id)}" title="项目自动化" aria-label="项目自动化">${i('sliders-horizontal')}</button><small>${access.tasks?'任务已授权':'任务未授权'} · ${access.documents.length} ${e('份资料')}</small>`:''}</div>`;}
 document.addEventListener('change',event=>{if(event.target.id!=='chat-project-select')return;const id=event.target.value;event.target.value=event.target.dataset.current;if(id)void choose(id);else void window.HermesChat.openProject('',{tasks:false,documents:[]});});
 async function choose(id=''){
  const version=modal('选择项目');try{
   const result=await context.api('/projects');if(version!==epoch)return;
   const projects=result.projects.filter(p=>!p.archived);
   dialog.querySelector('.project-chat-body').innerHTML=`<form id="project-chat-selection"><label>项目<select name="project"><option value="">独立对话</option>${projects.map(p=>`<option value="${p.id}" ${p.id===id?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><div class="project-chat-grants"></div><p class="project-chat-boundary">切换项目会新建会话，不携带原会话历史和附件。</p><div class="form-actions"><button type="button" class="secondary" data-project-preview>预览共享内容</button><button class="primary" type="submit">开始对话</button></div></form>`;
   const form=dialog.querySelector('form');
   function grants(){const p=projects.find(p=>p.id===form.elements.project.value);form.querySelector('.project-chat-grants').innerHTML=p?`<p>${e(p.name)} · ${e(p.description)}</p><label class="project-grant"><input type="checkbox" name="tasks">共享项目任务与日历安排</label><fieldset><legend>授权文档（最多三份）</legend>${p.documents.map(d=>`<label class="project-grant"><input type="checkbox" name="document" value="${d.id}"><span>${e(d.name)}</span></label>`).join('')||'<span>暂无关联文档</span>'}</fieldset>`:'';form.querySelector('[data-project-preview]').disabled=!p;}
   const access=()=>({tasks:Boolean(form.elements.tasks?.checked),documents:[...form.querySelectorAll('[name=document]:checked')].map(el=>el.value)});
   form.elements.project.addEventListener('change',grants);grants();
   form.querySelector('[data-project-preview]').addEventListener('click',async event=>{const button=event.currentTarget;button.disabled=true;try{const value=await context.api(`/projects/${form.elements.project.value}/context-preview`,{method:'POST',body:access()});if(version!==epoch)return;let pre=form.querySelector('pre');if(!pre){pre=document.createElement('pre');pre.className='project-context-preview';form.querySelector('.form-actions').before(pre);}pre.textContent=JSON.stringify(value,null,2);}catch(cause){if(version===epoch)error(cause.message);}finally{button.disabled=false;}});
   form.addEventListener('submit',async event=>{event.preventDefault();event.stopPropagation();const id=form.elements.project.value,a=access();if(a.documents.length>3){error('最多授权三份文档');return;}if(id&&!confirm('授权此会话每次发送时读取项目说明及勾选的数据？数据将发送到你的 Hermes 服务器，授权随会话保存。'))return;if(await window.HermesChat.openProject(id,a))reset();});
  }catch(cause){if(version===epoch)error(cause.message);}window.lucide?.createIcons();
 }
 async function policy(id){const version=modal('项目自动化');try{const p=await context.api(`/projects/${id}/chat-policy`);if(version!==epoch)return;dialog.querySelector('.project-chat-body').innerHTML=`<form><label class="project-grant"><input type="checkbox" name="auto" ${p.autoCreate?'checked':''}>自动创建项目任务</label><p>开启后，该项目所有会话的有效创建指令无需逐次确认，每次最多十项。修改、删除仍需确认。授权资料可能影响模型判断，请仅共享可信内容。</p><div class="form-actions"><button class="primary">保存</button></div></form>`;dialog.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();event.stopPropagation();const autoCreate=event.target.elements.auto.checked;if(autoCreate&&!confirm('允许该项目自动创建任务及明确安排的日历事项？'))return;const button=event.target.querySelector('button');button.disabled=true;try{await context.api(`/projects/${id}/chat-policy`,{method:'POST',body:{autoCreate,confirm:true}});if(version===epoch)reset();}catch(cause){if(version===epoch)error(cause.message);}finally{button.disabled=false;}});}catch(cause){if(version===epoch)error(cause.message);}}
 async function review(id){const version=modal('项目任务操作');try{
  const data=await context.api(`/runs/${id}/actions`);if(version!==epoch)return;
  const ops=data.proposal.operations,labels={create:'创建',update:'修改',delete:'删除'};
  dialog.querySelector('.project-chat-body').innerHTML=`<div class="action-status">${e(statusLabels[data.status]||data.status)}</div>${data.error?`<p role="alert">${e(data.error)}</p>`:''}<div class="project-operation-list">${ops.map((op,index)=>`<article><span class="tag">${e(labels[op.op])}</span><strong>${e(op.title||data.receipt?.changes[index]?.before?.title||op.id)}</strong>${op.scheduledAt?`<time>${e(new Date(op.scheduledAt).toLocaleString('zh-CN'))}</time>`:''}${op.op!=='create'?`<small>${e(op.id)} · v${op.version}</small>`:''}</article>`).join('')}</div><div class="form-actions">${data.status==='pending'?'<button class="secondary" data-project-operation="dismiss">忽略</button><button class="primary" data-project-operation="apply">确认执行</button>':data.status==='applied'?'<button class="secondary" data-project-operation="undo">撤销本次操作</button>':''}</div>`;
  dialog.querySelectorAll('[data-project-operation]').forEach(button=>button.addEventListener('click',async()=>{
   if(!confirm('确认操作？如任务已被其他操作修改，将拒绝覆盖。'))return;dialog.querySelectorAll('[data-project-operation]').forEach(b=>b.disabled=true);
   try{await context.api(`/runs/${id}/actions/${button.dataset.projectOperation}`,{method:'POST',body:{confirm:true}});if(version!==epoch)return;await context.refresh();context.changed();if(version===epoch)await review(id);}catch(cause){if(version===epoch){error(cause.message);dialog.querySelectorAll('[data-project-operation]').forEach(b=>b.disabled=false);}}
  }));
  dialog.querySelectorAll('.project-operation-list article').forEach((article,index)=>{const op=ops[index],old=data.before?.find(t=>t.id===op.id);if(old){const info=document.createElement('p');info.className='operation-before';info.textContent=`${'现有任务'}: ${old.title} / ${old.completed?'已完成':'待完成'} / ${old.scheduledAt?new Date(old.scheduledAt).toLocaleString('zh-CN'):'未安排时间'}`;article.append(info);}if(op.op==='update'){const next=document.createElement('p');next.className='operation-before';next.textContent=`${'修改后'}: ${op.completed?'已完成':'待完成'} / ${op.scheduledAt?new Date(op.scheduledAt).toLocaleString('zh-CN'):'未安排时间'} / ${op.minutes} min`;article.append(next);}});
 }catch(cause){if(version===epoch)error(cause.message);}}
 function decorate(timeline){for(const run of timeline){if(!run.actions)continue;const article=document.querySelector(`[data-output="${run.id}"]`)?.closest('.chat-turn');if(!article)continue;for(const code of article.querySelectorAll('.chat-output pre code')){try{const data=JSON.parse(code.textContent);if(data.version===1&&Array.isArray(data.operations))code.parentElement.hidden=true;}catch{}}if(article.querySelector('[data-project-actions]'))continue;const button=document.createElement('button');button.className='project-action-receipt';button.dataset.projectActions=run.id;button.innerHTML=`${i(run.actions==='applied'?'circle-check':'list-checks')}<span>${e(statusLabels[run.actions]||run.actions)}</span>${i('chevron-right')}`;article.append(button);}}
 function welcome(id){const root=document.querySelector('.chat-welcome'),project=window.HermesProjects.overview().find(p=>p.id===id);if(!root||!project)return;root.classList.add('project-welcome');root.innerHTML=`<span class="project-welcome-symbol">${i('folder-kanban')}</span><h3>${e(project.name)}</h3><p>${project.completed} / ${project.total} ${e('任务完成')}</p><div class="project-chat-prompts"><button data-project-prompt="progress">${i('chart-no-axes-combined')}检查项目进度${i('arrow-up-right')}</button><button data-project-prompt="plan">${i('calendar-plus')}安排下一步${i('arrow-up-right')}</button></div>`;}
 document.addEventListener('click',event=>{const button=event.target.closest('[data-project-prompt]');if(button)window.HermesChat.draftMessage(button.dataset.projectPrompt==='progress'?'根据已授权的项目上下文总结当前进度，指出尚未完成的事项。不要修改任务。':'请为当前项目提出下一步任务；需要写入时使用工作台结构化任务指令，不要擅自安排日期。');});
 document.addEventListener('click',event=>{const button=event.target.closest('[data-project-chat],[data-project-policy],[data-project-actions]');if(!button||button.disabled)return;if(button.hasAttribute('data-project-chat'))void choose(button.dataset.projectChat);else if(button.dataset.projectPolicy)void policy(button.dataset.projectPolicy);else void review(button.dataset.projectActions);});
 async function reviewFiles(id){
  const version=modal('项目文件');
  try{
   const data=await context.api(`/runs/${id}/files`);if(version!==epoch)return;
   dialog.querySelector('.project-chat-body').innerHTML=`<div class="project-operation-list">${data.files.map(f=>`<article><strong>${e(f.name)}</strong><small>${f.bytes.toLocaleString()} B</small><pre class="project-context-preview"><code>${e(f.content)}</code></pre><button class="secondary" data-project-file-save="${f.index}" ${f.saved?'disabled':''}>${f.saved?'已归档':'保存到当前项目'}</button></article>`).join('')||'<p>本次回复没有可归档文件。NAS 路径不会自动导入。</p>'}</div><div class="form-actions"><button type="button" class="secondary" data-project-chat-close>返回对话</button></div>`;
   dialog.querySelector('.project-operation-list').classList.add('project-file-list');
   dialog.querySelectorAll('[data-project-file-save]').forEach(button=>button.addEventListener('click',async()=>{
    button.disabled=true;
    try{
     await context.api(`/runs/${id}/files/${button.dataset.projectFileSave}`,{method:'POST',body:{confirm:true}});
     if(version!==epoch)return;
     button.textContent='已归档';
     await context.refresh();context.changed();
    }catch(cause){if(version===epoch){button.disabled=false;error(cause.message);}}
   }));
  }catch(cause){if(version===epoch)error(cause.message);}
 }
 function decorateFiles(timeline){
  decorateCards(timeline);
  for(const run of timeline){
   if(run.status!=='completed'||!run.projectId)continue;
   const article=document.querySelector(`[data-output="${run.id}"]`)?.closest('.chat-turn');
   if(!article||article.querySelector('[data-project-files]'))continue;
   const blocks=window.marked.lexer(run.output||'').filter(token=>token.type==='code'&&token.lang==='hermes-files');
   if(!blocks.length)continue;
   article.querySelectorAll('.chat-output pre code').forEach(code=>{if(blocks.some(block=>block.text.trim()===code.textContent.trim()))code.parentElement.hidden=true;});
   const button=document.createElement('button');button.className='project-action-receipt';button.dataset.projectFiles=run.id;
   button.innerHTML=`${i('files')}<span>预览并归档项目文件</span>${i('chevron-right')}`;article.append(button);
  }
 }
 document.addEventListener('click',event=>{const button=event.target.closest('[data-project-files]');if(button)void reviewFiles(button.dataset.projectFiles);});
 const cards=new Map();
 function drawCard(node,id,entry){
  const data=entry.data,labels={create:'创建',update:'修改',delete:'删除'};
  node.innerHTML=`<header>${i(data?.status==='applied'?'circle-check':'list-checks')}<strong>项目任务安排</strong><span class="tag">${e(data?statusLabels[data.status]||data.status:'正在加载')}</span></header><div class="interaction-body">${data?`<ol class="interaction-operations">${data.proposal.operations.map(op=>`<li><span class="tag">${e(labels[op.op])}</span><div><strong>${e(op.title||data.before?.find(t=>t.id===op.id)?.title||op.id)}</strong><small>${op.scheduledAt?e(new Date(op.scheduledAt).toLocaleString(I18n.locale))+' · '+e(op.timeZone):'未安排日历时间'}${op.minutes?' · '+op.minutes+' min':''}</small>${op.op==='update'?`<small>${op.completed?'已完成':'待完成'}</small>`:''}</div></li>`).join('')}</ol><p>仅操作当前项目的工作台任务；有明确时间的任务同步显示在工作台日历，不代表已写入外部日历。</p>`:''}${entry.error?`<p role="alert">${e(entry.error)}</p>`:''}${entry.armed?'<p role="alert">请再次确认。修改过的任务不会被强制覆盖。</p>':''}</div><footer>${data?`<button type="button" class="text-button" data-project-actions="${id}">查看详情</button>${data.status==='pending'?`<button type="button" class="secondary" data-card-op="dismiss">忽略</button><button type="button" class="primary" data-card-op="apply">${entry.armed==='apply'?'确认修改或删除':'确认安排'}</button>`:data.status==='applied'?`<button type="button" class="secondary" data-card-op="undo">${entry.armed==='undo'?'确认撤销':'撤销本次操作'}</button>`:''}${entry.armed?'<button type="button" class="secondary" data-card-op="cancel">取消</button>':''}`:entry.error?'<button type="button" class="secondary" data-card-op="retry">重试</button>':''}</footer>`;
  node.querySelectorAll('button').forEach(button=>button.disabled=Boolean(entry.busy));
  node.setAttribute('aria-busy',String(Boolean(entry.busy)));window.lucide?.createIcons();
 }
 async function loadCard(id,entry){
  if(entry.loading)return;entry.loading=true;
  try{entry.data=await context.api(`/runs/${id}/actions`);entry.error=entry.data.error||'';}catch(cause){entry.error=cause.message;}
  finally{entry.loading=false;const node=document.querySelector(`[data-operation-card="${id}"]`);if(node&&cards.get(id)===entry)drawCard(node,id,entry);}
 }
 function decorateCards(timeline){
  const owner=context.state.me?.user.id;
  for(const [id,entry] of cards)if(entry.owner!==owner)cards.delete(id);
  for(const run of timeline){
   if(!run.actions)continue;
   const article=document.querySelector(`[data-output="${run.id}"]`)?.closest('.chat-turn');if(!article)continue;
   const blocks=window.marked.lexer(run.output||'').filter(token=>token.type==='code'&&token.lang==='hermes-actions');
   article.querySelectorAll('.chat-output pre code').forEach(code=>{if(blocks.some(block=>block.text.trim()===code.textContent.trim()))code.parentElement.hidden=true;});
   let entry=cards.get(run.id);if(!entry){entry={owner,data:null,error:'',busy:false,loading:false};cards.set(run.id,entry);}
   let node=article.querySelector('[data-operation-card]');if(!node){node=document.createElement('section');node.className='interaction-card';node.dataset.operationCard=run.id;article.append(node);}
   drawCard(node,run.id,entry);
   if(!entry.busy&&(!entry.data&&!entry.error||entry.data&&entry.data.status!==run.actions))void loadCard(run.id,entry);
  }
 }
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-card-op]'),node=button?.closest('[data-operation-card]');if(!node)return;
  const id=node.dataset.operationCard,entry=cards.get(id),op=button.dataset.cardOp;
  if(!entry||entry.busy||entry.owner!==context.state.me?.user.id)return;
  if(op==='retry'){entry.error='';void loadCard(id,entry);return;}
  if(op==='cancel'){entry.armed=null;drawCard(node,id,entry);return;}
  if(!['apply','dismiss','undo'].includes(op))return;
  if((op==='undo'||op==='apply'&&entry.data.proposal.operations.some(o=>o.op!=='create'))&&entry.armed!==op){entry.armed=op;drawCard(node,id,entry);return;}
  entry.busy=true;entry.error='';drawCard(node,id,entry);
  try{const result=await context.api(`/runs/${id}/actions/${op}`,{method:'POST',body:{confirm:true}});if(entry.owner!==context.state.me?.user.id)return;entry.data=result;entry.armed=null;await context.refresh();context.changed();}
  catch(cause){entry.error=cause.message;}
  finally{entry.busy=false;const current=document.querySelector(`[data-operation-card="${id}"]`);if(current&&entry.owner===context.state.me?.user.id)drawCard(current,id,entry);}
 });
 return {configure:c=>context=c,reset,bar,choose,decorate:decorateFiles,welcome};
})();
