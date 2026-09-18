'use strict';
window.HermesChatModels=(()=>{
 let context,dialog=null,epoch=0,catalog=null,busy=false,applying=false,selected=null,overrideProfile=null;
 const targetProfile=()=>overrideProfile||window.HermesChat.modelState().profile||'default';
 const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
 function reset(){epoch++;dialog?.remove();dialog=null;busy=false;applying=false;catalog=null;selected=null;overrideProfile=null;}
 function close(){if(applying)return;reset();trigger();window.lucide?.createIcons();document.querySelector('[data-chat-models]')?.focus({preventScroll:true});}
 function error(message){const el=dialog?.querySelector('[role=alert]');if(el)el.textContent=message;position();}
 function position(){
  if(!dialog)return;const anchor=document.querySelector('[data-chat-models]')?.getBoundingClientRect();if(!anchor)return;
  const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
  const w=Math.min(340,width-24);dialog.style.width=w+'px';dialog.style.maxHeight=Math.max(180,height-24)+'px';
  dialog.style.left=Math.max(left+12,Math.min(anchor.right-w,left+width-w-12))+'px';
  dialog.style.top=Math.max(top+12,Math.min(anchor.top-dialog.offsetHeight-10,top+height-dialog.offsetHeight-12))+'px';
 }
 function trigger(){const button=document.querySelector('[data-chat-models]');if(!button)return;const s=window.HermesChat.modelState(),record=s.model,defaultId=s.profile==='default'?context.state.hermes.catalog?.current?.model:null,id=record?.id||defaultId;
  const label=id?String(id).split('/').filter(Boolean).at(-1):'选择模型';
  const source=record?.source==='session'?'会话模型':record?'会话创建时的模型配置':s.hasConversation?'服务器默认模型，旧会话模型未核验':'新会话默认模型';
  button.innerHTML=`<span>${e(label)}</span>${i('chevron-down')}`;button.title=id?`${id}\n${source}`:'选择模型';button.setAttribute('aria-expanded',String(Boolean(dialog)));
 }
 function list(){
  if(!dialog)return;const q=dialog.querySelector('input[type=search]').value.trim().toLowerCase(),root=dialog.querySelector('.chat-model-results');
  const visible=(catalog?.models||[]).map((m,index)=>({m,index})).filter(({m})=>(m.id+' '+m.providerName).toLowerCase().includes(q));
  if(!visible.some(item=>item.index===selected))selected=null;
  const groups=new Map();for(const row of visible){const key=row.m.providerName||row.m.provider;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
  const active=overrideProfile?null:window.HermesChat.modelState().model,currentId=active?.id||catalog?.current?.model,currentProvider=active?.provider||catalog?.current?.provider;
  root.innerHTML=[...groups].map(([provider,rows])=>`<section class="chat-model-group"><h3>${e(provider)}</h3>${rows.map(({m,index})=>`<label class="chat-model-option"><input type="radio" name="chat-model" value="${index}" ${selected===index?'checked':''} ${busy?'disabled':''}><span><strong title="${e(m.id)}">${e(m.id.split('/').filter(Boolean).at(-1))}</strong></span>${i('check')}</label>`).join('')}</section>`).join('')||(busy?'<div class="model-skeleton" aria-label="正在获取模型…"><span></span><span></span><span></span></div>':'<p class="chat-model-empty">没有匹配模型</p>');
  dialog.querySelector('.chat-model-confirm').hidden=selected===null;dialog.querySelector('[data-apply-model]').disabled=busy||selected===null;window.lucide?.createIcons();position();
  if(selected===null)for(const input of root.querySelectorAll('input')){const m=catalog.models[Number(input.value)];input.closest('label').dataset.current=String(m.id===currentId&&m.provider===currentProvider);}
 }
 async function fetchModels(){
  const version=epoch;busy=true;selected=null;dialog.querySelector('[data-refresh-models]').disabled=true;dialog.querySelector('.model-loading').hidden=false;error('');list();
  try{const profile=targetProfile(),fetched=await context.api('/hermes/models/refresh',{method:'POST',body:{profile}});if(version!==epoch)return;catalog=fetched;if(profile==='default')context.state.hermes.catalog=catalog;trigger();}
  catch(cause){if(version===epoch)error(cause.message);}
  finally{if(version===epoch){busy=false;dialog.querySelector('[data-refresh-models]').disabled=false;dialog.querySelector('.model-loading').hidden=true;list();}}
 }
 async function apply(){
  const model=catalog?.models[selected];if(busy||!model)return;const version=epoch;busy=true;applying=true;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=true);error('');
  try{const profile=targetProfile(),result=await context.api('/hermes/model',{method:'POST',body:{profile,model:model.id,provider:model.provider,expected:catalog.current,confirm:true,confirmExpensive:dialog.querySelector('[name=expensive]').checked}});if(version!==epoch)return;if(profile==='default'){context.state.hermes.catalog=result.catalog;context.state.hermes.preference=result.preference;}if(!overrideProfile)window.HermesChat.newModelConversation();busy=false;applying=false;close();context.render();context.notify('远端模型已回读确认，将用于新会话');}
  catch(cause){if(version===epoch){error(cause.message);selected=null;catalog=null;dialog.querySelectorAll('button,input').forEach(el=>el.disabled=false);}}
  finally{if(version===epoch){busy=false;applying=false;list();}}
 }
 async function open(profile=null){
  if(dialog){close();return;}if(!context.state.hermes.connected){context.notify('请先连接 Hermes 服务器。');return;}
  const s=window.HermesChat.modelState();if(!s.canSwitch){context.notify('请先结束或核对当前执行。');return;}
  overrideProfile=profile;catalog=targetProfile()==='default'?context.state.hermes.catalog:null;selected=null;dialog=document.createElement('div');dialog.className='chat-model-dialog';dialog.setAttribute('popover','manual');dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','选择模型');
  dialog.innerHTML=`<div class="chat-model-search"><label>${i('search')}<input type="search" aria-label="搜索可用模型" placeholder="搜索模型"></label><button class="icon-button" type="button" data-refresh-models title="刷新模型" aria-label="刷新模型">${i('refresh-cw')}</button><button class="icon-button" type="button" data-close-models aria-label="关闭" title="关闭">${i('x')}</button></div><div class="model-loading" role="status" hidden>正在获取模型…</div><div class="chat-model-results" role="group" aria-label="可用模型"></div><p class="form-error" role="alert"></p><div class="chat-model-confirm" hidden><p class="chat-model-scope">${s.hasConversation?'新会话生效，保留项目和草稿。':''}同时更新服务器共享默认模型。</p><details class="chat-model-advanced"><summary>费用授权</summary><label class="chat-model-cost"><input type="checkbox" name="expensive">允许网关标记的高费用模型</label></details><button type="button" class="primary" data-apply-model>${s.hasConversation?'切换并新建会话':'应用模型'}</button></div>`;
  dialog.querySelector('[data-close-models]').addEventListener('click',close);dialog.querySelector('[data-refresh-models]').addEventListener('click',()=>{if(!busy)void fetchModels();});dialog.querySelector('input[type=search]').addEventListener('input',list);dialog.addEventListener('change',event=>{if(event.target.name==='chat-model'&&!busy){selected=Number(event.target.value);list();}});dialog.querySelector('details').addEventListener('toggle',position);dialog.querySelector('[data-apply-model]').addEventListener('click',apply);
  dialog.querySelector('.chat-model-scope').textContent=`${targetProfile()} · ${'所选 Agent 的新会话生效，不改变其他档案。'}`;
  if(overrideProfile)dialog.querySelector('[data-apply-model]').textContent='应用模型';
  document.body.append(dialog);dialog.showPopover();list();trigger();dialog.querySelector('input[type=search]').focus({preventScroll:true});
  dialog.addEventListener('change',event=>{if(event.target.name==='chat-model')dialog?.querySelector(`[name=chat-model][value="${selected}"]`)?.focus({preventScroll:true});});
  if(!catalog)await fetchModels();
 }
 function decorate(hasConversation,locked){
  const footer=document.querySelector('.assistant .compose-footer'),toolbar=document.querySelector('.chat-project-toolbar'),button=footer?.querySelector('.model-picker');if(!footer||!button)return;
  if(toolbar){const project=toolbar.querySelector('.chat-project-select'),scope=document.querySelector('.chat-context-popover');if(project)button.before(project);if(scope){const policy=toolbar.querySelector('[data-project-policy]'),detail=toolbar.querySelector('small');if(detail)scope.append(detail);if(policy)scope.append(policy);}toolbar.remove();}
  delete button.dataset.page;button.dataset.chatModels='';button.disabled=locked;button.setAttribute('aria-label','选择模型');button.setAttribute('aria-haspopup','dialog');trigger();footer.classList.add('compact-composer');
  const plan=footer.querySelector('[data-chat-action=plan]');if(plan)document.querySelector('.chat-context-popover')?.append(plan);position();
 }
 document.addEventListener('click',event=>{if(event.target.closest('[data-chat-models]'))void open();});
 document.addEventListener('pointerdown',event=>{if(dialog&&!dialog.contains(event.target)&&!event.target.closest('[data-chat-models]'))close();});
 document.addEventListener('keydown',event=>{if(dialog&&event.key==='Escape'){event.preventDefault();close();}});
 window.addEventListener('resize',position);window.visualViewport?.addEventListener('resize',position);document.addEventListener('scroll',position,true);
 return {configure:c=>context=c,reset,decorate,openForProfile:name=>open(name)};
})();
