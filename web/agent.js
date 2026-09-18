'use strict';
window.HermesAgent=(()=>{
  const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
  let context,data={},errors={},drafts={},blocked={},setup={},busy=false,epoch=0,selected=new Set();
  function configure(c){context=c;}
  let external={name:'',url:'',auth:'oauth'},externalOpen=false,externalError='';
  function externalEditor(){return `<div class="external-mcp"><button class="secondary" data-external-toggle>${i('plus')}添加外部 MCP</button>${externalOpen?`<div class="external-fields"><label>连接名称<input data-external-field="name" value="${e(external.name)}" maxlength="100"></label><label>服务地址<input type="url" data-external-field="url" value="${e(external.url)}" placeholder="https://example.com/mcp" maxlength="2048"></label><label>认证方式<select data-external-field="auth"><option value="oauth" ${external.auth==='oauth'?'selected':''}>OAuth</option><option value="none" ${external.auth==='none'?'selected':''}>无认证</option></select></label><p class="form-error" role="alert">${e(externalError)}</p><button class="primary" data-external-add ${busy?'disabled':''}>${i('plug')}添加连接</button></div>`:''}</div>`;}
  document.addEventListener('input',event=>{if(event.target.dataset.externalField)external[event.target.dataset.externalField]=event.target.value;});
  document.addEventListener('change',event=>{if(event.target.dataset.externalField)external[event.target.dataset.externalField]=event.target.value;});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-external-toggle],[data-external-add]');if(!b||busy)return;
    if(b.hasAttribute('data-external-toggle')){externalOpen=!externalOpen;context.render();return;}
    if(!confirm('将外部 MCP 添加到共享服务器？可能立即按远端默认策略启用，请确认来源可信。'))return;
    const version=epoch;busy=true;externalError='';context.render();
    try{const result=await context.api('/hermes/mcp-external',{method:'POST',body:{...external,confirm:true}});if(version===epoch){data.mcp=result;libraryTab='mcp';externalOpen=false;external={name:'',url:'',auth:'oauth'};context.notify('连接已添加，请验证连接状态');}}
    catch(error){if(version===epoch)externalError=error.message;}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  function catalogActions(item,index){
    if(item.installable)return `<button class="secondary" data-agent-install="${index}" ${busy||blocked.catalog?'disabled':''}>${i('plus')}添加</button>`;
    if(!item.installed)return '<span class="tag">需额外配置</span>';
    const pending=setup[item.id]?.flow;
    const button=(action,label)=>`<button class="secondary" data-mcp-action="${action}" data-mcp-name="${e(item.id)}" ${busy?'disabled':''}>${e(label)}</button>`;
    return `<span class="tag">${item.enabled?'已启用':'待连接'}</span>${pending?button('status','检查授权')+button('cancel','取消授权'):(item.auth==='oauth'?button('authorize','连接账号'):'')+button('verify','验证并启用')}<button class="icon-button" data-mcp-action="remove" data-mcp-name="${e(item.id)}" title="移除" aria-label="移除 ${e(item.name)}" ${busy||pending?'disabled':''}>${i('trash-2')}</button>`;
  }
  function catalog(){
    const items=data.catalog?listToolbar('catalog')+(pageRows('catalog').rows.map(({item,index})=>`<div class="setting-row mcp-entry"><div class="setting-copy"><div><strong>${e(item.name)}</strong><p>${e(item.description)}</p><details><summary>授权与生效要求</summary><p>${e(item.notes)}</p></details>${setupStatus(item)}</div></div><div class="mcp-actions">${catalogActions(item,index)}</div></div>`).join('')||'<div class="empty-state">没有匹配结果</div>')+listPager('catalog'):null;
    return `<section class="agent-section"><div class="section-head"><h2>MCP 目录</h2><button class="secondary" data-agent-fetch="catalog" ${busy?'disabled':''}>${i('refresh-cw')}读取服务器</button></div>${errors.catalog?`<p class="form-error" role="alert">${e(errors.catalog)}</p>`:''}${items??'<div class="empty-state">尚未读取服务器</div>'}</section>`;
  }
  function setupStatus(item){const s=setup[item.id];if(!s)return '';return `${s.error?`<p class="form-error" role="alert">${e(s.error)}</p>`:''}${s.url?`<a class="secondary" href="${e(s.url)}" target="_blank" rel="noopener noreferrer">打开授权页面${i('external-link')}</a>`:''}<p class="inline-status" role="status">${e({authorization_required:'等待账号授权',authorized:'授权完成，请验证连接',authorization_failed:'授权失败，可重新连接',cancelled:'授权已取消',enabled:'连接已验证并启用；现有会话可能需要重建'}[s.state]||'')}${s.state==='enabled'?` · ${s.toolCount} tools`:''}</p>`;}
  function reset(){window.HermesSkillsHub?.reset();epoch++;data={};errors={};drafts={};blocked={};setup={};busy=false;selected.clear();for(const id of Object.keys(lists))delete lists[id];libraryTab='catalog';external={name:'',url:'',auth:'oauth'};externalOpen=false;externalError='';}
  const labels={memoryEnabled:'长期记忆',userProfileEnabled:'用户画像',memoryLimit:'记忆字符上限',userLimit:'画像字符上限',compressionEnabled:'上下文压缩',sttEnabled:'语音识别',sttProvider:'识别服务商',ttsProvider:'朗读服务商',voice:'音色 ID'};
  function editor(id){
    const result=data[id],draft=drafts[id]||{};
    return `<section class="agent-section"><div class="section-head"><h2>${e(id==='memory'?'记忆配置':'远端语音配置')}</h2><button class="secondary" data-agent-fetch="${id}" ${busy?'disabled':''}>${i('refresh-cw')}读取服务器</button></div><p class="inline-status">共享服务器配置 · default</p>${errors[id]?`<p class="form-error" role="alert">${e(errors[id])}</p>`:''}${result?`<div>${Object.entries(labels).filter(([key])=>Object.hasOwn(result.values,key)&&key!=='approvalMode').map(([key,label])=>{const value=Object.hasOwn(draft,key)?draft[key]:result.values[key],bool=typeof result.values[key]==='boolean',number=typeof result.values[key]==='number';return `<label class="setting-row"><strong>${e(label)}</strong><input data-agent-field="${key}" data-section="${id}" aria-label="${e(label)}" type="${bool?'checkbox':number?'number':'text'}" ${bool?(value?'checked':''):`value="${e(value)}"`} ${number?'min="256" max="1000000" step="1"':'maxlength="150"'} ${busy?'disabled':''}></label>`;}).join('')}</div><div class="setting-actions"><button class="primary" data-agent-save="${id}" ${busy||blocked[id]?'disabled':''}>${i('save')}保存到服务器</button><button class="secondary" data-agent-discard="${id}" ${busy?'disabled':''}>放弃修改</button><span class="inline-status">${Object.keys(draft).length?'有未保存修改':'与服务器一致'}</span></div>`:'<div class="empty-state">尚未读取服务器</div>'}</section>`;
  }
  const lists={},pageSize=10;
  let libraryTab='catalog';
  function listState(id){return lists[id]??={query:'',filter:'all',page:0};}
  function pageRows(id){
    const s=listState(id),all=(data[id]?.items||[]).map((item,index)=>({item,index}));
    const filtered=all.filter(({item})=>(item.name+' '+item.description+' '+item.transport).toLocaleLowerCase().includes(s.query.trim().toLocaleLowerCase())&&(s.filter==='all'||(s.filter==='enabled'?item.enabled===true:item.enabled===false)));
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));s.page=Math.min(s.page,pages-1);
    return {rows:filtered.slice(s.page*pageSize,(s.page+1)*pageSize),count:filtered.length,pages};
  }
  function listToolbar(id){const s=listState(id);return `<div class="capability-toolbar"><input type="search" data-capability-search="${id}" value="${e(s.query)}" aria-label="搜索能力" placeholder="搜索名称或描述"><select data-capability-filter="${id}" aria-label="能力状态">${[['all','全部'],['enabled','已启用'],['disabled','已停用']].map(([value,label])=>`<option value="${value}" ${s.filter===value?'selected':''}>${e(label)}</option>`).join('')}</select></div>`;}
  function listPager(id){const s=listState(id),p=pageRows(id);return `<nav class="capability-pager" aria-label="能力分页"><span>${p.count} · ${s.page+1} / ${p.pages}</span><button class="icon-button" data-capability-page="${id}" data-step="-1" aria-label="上一页" ${s.page===0?'disabled':''}>${i('chevron-left')}</button><button class="icon-button" data-capability-page="${id}" data-step="1" aria-label="下一页" ${s.page+1>=p.pages?'disabled':''}>${i('chevron-right')}</button></nav>`;}
  function section(id){
    const result=data[id],names={tools:'工具集',skills:'Skills',mcp:'MCP',memory:'记忆配置',schedules:'远端定时任务',voice:'远端语音配置'};
    const rows=result?.items?pageRows(id).rows.map(({item,index})=>`<div class="setting-row ${id==='mcp'?'mcp-entry':''}"><div class="setting-copy"><div><strong>${e(item.name)}</strong><p>${e(item.description||item.schedule||item.transport)}</p><small>${e(item.status)}</small></div></div>${id==='mcp'?`<div class="mcp-actions">${catalogActions({...item,installed:true},index)}</div>`:['skills'].includes(id)&&item.enabled!==null?`<input type="checkbox" data-agent-toggle="${id}" data-index="${index}" aria-label="${e(item.name)}" ${item.enabled?'checked':''} ${busy?'disabled':''}>`:id==='schedules'?`<div class="setting-actions"><button class="icon-button" data-agent-job="pause" data-index="${index}" title="暂停" aria-label="暂停 ${e(item.name)}" ${busy?'disabled':''}>${i('pause')}</button><button class="icon-button" data-agent-job="resume" data-index="${index}" title="恢复" aria-label="恢复 ${e(item.name)}" ${busy?'disabled':''}>${i('play')}</button></div>`:`<span class="tag">${item.enabled===null?'未知':item.enabled?'已启用':'已停用'}</span>`}</div>`).join(''):'';
    return `<section class="agent-section"><div class="section-head"><h2>${e(names[id])}</h2><button class="secondary" data-agent-fetch="${id}" ${busy?'disabled':''}>${i('refresh-cw')}读取服务器</button></div>${errors[id]?`<p class="form-error" role="alert">${e(errors[id])}</p>`:''}${result?listToolbar(id)+(rows||'<div class="empty-state">没有匹配结果</div>')+listPager(id):'<div class="empty-state">尚未读取服务器</div>'}</section>`;
  }
  function library(){return `<div class="settings"><div class="agent-tabs" role="tablist" aria-label="能力分类">${[['catalog','发现'],['mcp','已添加 MCP'],['skills','已安装 Skills'],['hub','Skills Hub']].map(([id,label])=>`<button role="tab" data-library-tab="${id}" aria-selected="${libraryTab===id}" class="${libraryTab===id?'active':''}">${e(label)}</button>`).join('')}</div>${externalEditor()}${libraryTab==='catalog'?catalog():libraryTab==='hub'?window.HermesSkillsHub.panel():section(libraryTab)}</div>`;}
  document.addEventListener('input',event=>{
    const el=event.target,id=el.dataset.capabilitySearch;if(!id)return;
    const s=listState(id),position=el.selectionStart;s.query=el.value;s.page=0;context.render();
    const next=document.querySelector('[data-capability-search="'+id+'"]');next?.focus({preventScroll:true});try{next?.setSelectionRange(position,position);}catch{}
  });
  document.addEventListener('change',event=>{const id=event.target.dataset.capabilityFilter;if(!id)return;listState(id).filter=event.target.value;listState(id).page=0;context.render();});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-capability-page],[data-library-tab]');if(!b||busy)return;
    if(b.dataset.capabilityPage){listState(b.dataset.capabilityPage).page+=Number(b.dataset.step);context.render();return;}
    libraryTab=b.dataset.libraryTab;context.render();if(libraryTab==='hub')return;if(!data[libraryTab]){const version=epoch;busy=true;try{await fetchSection(libraryTab);}catch(error){if(version===epoch)context.notify(error.message);}finally{if(version===epoch){busy=false;context.render();}}}
  });
  function panel(tab){return `<div class="settings">${tab==='tools'?`${section('tools')}<section class="agent-section"><div class="section-head"><h2>工作台上下文</h2><button class="secondary" data-agent-share ${selected.size?'':'disabled'}>${i('paperclip')}附加已选任务</button></div><p class="inline-status">仅共享已选任务及日历时间的快照；不会自动授权写入或共享健康数据。</p>${context.state.tasks.filter(t=>!t.deleted).map(t=>`<label class="context-task"><input type="checkbox" data-context-task="${t.id}" ${selected.has(t.id)?'checked':''}><span>${e(t.title)}<small>${t.scheduledAt?e(new Date(t.scheduledAt).toLocaleString('zh-CN')):'未安排时间'} · ${t.completed?'已完成':'待完成'}</small></span></label>`).join('')||'<div class="empty-state">暂无任务</div>'}</section>`:tab==='skills'?section('skills')+section('mcp'):['memory','voice'].includes(tab)?editor(tab):section(tab)}</div>`;}
  async function fetchSection(id){const version=epoch;try{const result=await context.api(`/hermes/capabilities/${id}`);if(version===epoch){data[id]=result;delete errors[id];delete drafts[id];delete blocked[id];}}catch(error){if(version===epoch){errors[id]=error.message;blocked[id]=true;}throw error;}}
  document.addEventListener('input',event=>{const el=event.target;if(!el.dataset.agentField||busy)return;const id=el.dataset.section,key=el.dataset.agentField;(drafts[id]??={})[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;const status=el.closest('.agent-section').querySelector('.setting-actions .inline-status');if(status)status.textContent='有未保存修改';});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-agent-save],[data-agent-discard]');if(!b||busy)return;
    const id=b.dataset.agentSave||b.dataset.agentDiscard;
    if(b.dataset.agentDiscard){delete drafts[id];context.render();return;}
    const changes=Object.fromEntries(Object.entries(drafts[id]||{}).filter(([key,value])=>value!==data[id].values[key]));
    if(!Object.keys(changes).length)return;
    if(!confirm('此操作会修改远端服务器上的共享配置或任务状态，可能影响其他客户端。确认继续？'))return;
    const version=epoch;busy=true;context.render();
    try{const result=await context.api('/hermes/config',{method:'POST',body:{section:id,revision:data[id].revision,changes,confirm:true}});if(version===epoch){data[id]=result;delete drafts[id];delete errors[id];context.notify('配置已保存并回读验证');}}
    catch(error){if(version===epoch){errors[id]=error.message;blocked[id]=true;}}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-agent-install]');if(!b||busy||blocked.catalog)return;
    const item=data.catalog?.items[Number(b.dataset.agentInstall)];if(!item?.installable)return;
    if(!confirm(`${item.name}\n${'添加到共享服务器？添加后可连接账号、验证工具并启用。'}`))return;
    const version=epoch;busy=true;context.render();
    try{const result=await context.api('/hermes/install-mcp',{method:'POST',body:{name:item.id,confirm:true}});if(version===epoch){data.catalog=result;delete errors.catalog;delete data.mcp;context.notify('已添加，请连接账号或验证并启用');}}
    catch(error){if(version===epoch){errors.catalog=error.message;blocked.catalog=true;}}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-mcp-action]');if(!b||busy)return;
    const name=b.dataset.mcpName,action=b.dataset.mcpAction,previous=setup[name]||{};
    const warning={authorize:'即将连接第三方账号，请在授权页面核对权限。继续？',verify:'验证连接后将启用工具，Hermes 可按服务器策略调用它们。继续？',remove:'从共享服务器移除此连接？不会删除第三方平台数据，也不会撤销第三方授权。'}[action];
    if(warning&&!confirm(warning))return;
    const version=epoch;busy=true;context.render();
    try{
      let result=await context.api('/hermes/mcp-action',{method:'POST',body:{name,action,...(previous.flow&&['status','cancel'].includes(action)?{flow:previous.flow}:{}),confirm:true}});
      if(version!==epoch)return;
      setup[name]=result.state==='authorization_required'?{...previous,...result}:result;
      if(['removed','enabled'].includes(result.state)){await fetchSection('mcp');if(data.catalog)await fetchSection('catalog');}
    }catch(error){if(version===epoch)setup[name]={...(error.code==='MCP_FLOW_EXPIRED'?{}:previous),error:error.message};}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  async function manage(body){if(!confirm('此操作会修改远端服务器上的共享配置或任务状态，可能影响其他客户端。确认继续？')){context.render();return;}await context.api('/hermes/manage',{method:'POST',body:{...body,confirm:true}});await fetchSection(body.section);}
  document.addEventListener('click',async event=>{const b=event.target.closest('[data-agent-fetch],[data-agent-job],[data-agent-share]');if(!b||busy)return;const version=epoch;busy=true;context.render();try{
    if(b.dataset.agentFetch){if(Object.keys(drafts[b.dataset.agentFetch]||{}).length&&!confirm('重新读取将放弃未保存修改，继续？'))return;await fetchSection(b.dataset.agentFetch);}
    if(b.dataset.agentJob)await manage({section:'schedules',id:data.schedules.items[Number(b.dataset.index)].id,action:b.dataset.agentJob});
    if(b.hasAttribute('data-agent-share')){
      const tasks=context.state.tasks.filter(t=>selected.has(t.id)&&!t.deleted).map(({id,title,completed,scheduledAt,minutes,timeZone,version})=>({id,title,completed,scheduledAt,minutes,timeZone,version}));
      if(!tasks.length)return;
      const content=JSON.stringify({source:'Hermes Workbench',capturedAt:new Date().toISOString(),readOnly:true,tasks},null,2);
      if(await window.HermesChat.attachDocument({name:'workbench-tasks.json',content}))context.notify('任务与日历快照已附加，发送前可预览。');
    }
  }catch(error){if(version===epoch)context.notify(error.message);}finally{if(version===epoch){busy=false;context.render();}}});
  document.addEventListener('change',async event=>{const el=event.target;
    if(el.dataset.contextTask){if(el.checked)selected.add(el.dataset.contextTask);else selected.delete(el.dataset.contextTask);context.render();return;}
    if(!el.dataset.agentToggle||busy)return;const version=epoch;busy=true;context.render();try{await manage({section:el.dataset.agentToggle,id:data[el.dataset.agentToggle].items[Number(el.dataset.index)].id,enabled:el.checked});}catch(error){if(version===epoch)context.notify(error.message);}finally{if(version===epoch){busy=false;context.render();}}
  });
  const dirty=()=>Object.values(drafts).some(draft=>Object.keys(draft).length>0);
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  return {configure,reset,panel:tab=>tab==='external'?window.HermesExternalAgents.panel():tab==='collaboration'?window.HermesProfiles.panel():tab==='skills'?library():panel(tab),connections:()=>externalEditor()+section('mcp'),dirty:()=>dirty()||window.HermesProfiles.dirty()};
})();
