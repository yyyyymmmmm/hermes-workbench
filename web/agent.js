'use strict';
window.HermesAgent=(()=>{
  const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
  let context,data={},errors={},drafts={},blocked={},setup={},busy=false,epoch=0,selected=new Set();
  function configure(c){context=c;}
  let scheduleDraft=null;
  let scope='',fresh={},inflight={},queue=Promise.resolve(),opened=new Set();
  function checkScope(){
    const state=context.state, key=JSON.stringify([state.me?.user?.id,state.hermes?.connectionId,state.hermes?.origin,state.hermes?.username,'default']);
    if(scope!==key){reset();scope=key;}
  }
  function stamp(id){
    return data[id]?.checkedAt ? new Date(data[id].checkedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '';
  }
  function autoLoad(){
    if(!context)return;checkScope();
    if(!context.state.hermes?.connected||busy)return;
    for(const node of document.querySelectorAll('[data-agent-resource]')){
      const id=node.dataset.agentResource,ttl=id==='catalog'?600000:id==='mcp'?30000:60000;
      if(inflight[id]||errors[id]||Object.keys(drafts[id]||{}).length||(data[id]&&Date.now()-(fresh[id]||0)<ttl))continue;
      const version=epoch;
      const button=node.querySelector('[data-agent-fetch]'),status=node.querySelector('.resource-status span');if(button)button.disabled=true;if(status)status.textContent='正在同步…';
      fetchSection(id).catch(()=>{}).finally(()=>{if(version===epoch)context.render();});
    }
  }
  async function writeApi(path,options){
    const version=epoch;await queue.catch(()=>{});
    if(version!==epoch)throw new Error('ACCOUNT_CHANGED');
    return context.api(path,options);
  }
  function resourceHead(id,name){return `<div class="section-head"><h2>${e(name)}</h2><div class="resource-status"><span role="status">${inflight[id]?'正在同步…':stamp(id)}</span><button class="icon-button" data-agent-fetch="${id}" title="刷新" aria-label="刷新" ${busy||inflight[id]?'disabled':''}>${i('refresh-cw')}</button></div></div>`;}
  function placeholder(){return `<div class="empty-state" role="status">${context.state.hermes?.connected?'正在加载…':'请先连接 Hermes'}</div>`;}
  document.addEventListener('toggle',event=>{const id=event.target.dataset?.capabilityDetail;if(!id)return;if(event.target.open)opened.add(id);else opened.delete(id);},true);
  let external={name:'',url:'',auth:'oauth'},externalOpen=false,externalError='';
  function externalEditor(){return `<div class="external-mcp capability-add"><button class="secondary" data-external-toggle>${i('plus')}添加外部 MCP</button>${externalOpen?`<div class="external-fields"><label>连接名称<input data-external-field="name" value="${e(external.name)}" maxlength="100"></label><label>服务地址<input type="url" data-external-field="url" value="${e(external.url)}" placeholder="https://example.com/mcp" maxlength="2048"></label><label>认证方式<select data-external-field="auth"><option value="oauth" ${external.auth==='oauth'?'selected':''}>OAuth</option><option value="none" ${external.auth==='none'?'selected':''}>无认证</option></select></label><p class="form-error" role="alert">${e(externalError)}</p><button class="primary" data-external-add ${busy?'disabled':''}>${i('plug')}添加连接</button></div>`:''}</div>`;}
  document.addEventListener('input',event=>{if(event.target.dataset.externalField)external[event.target.dataset.externalField]=event.target.value;});
  document.addEventListener('change',event=>{if(event.target.dataset.externalField)external[event.target.dataset.externalField]=event.target.value;});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-external-toggle],[data-external-add]');if(!b||busy)return;
    if(b.hasAttribute('data-external-toggle')){externalOpen=!externalOpen;context.render();return;}
    if(!confirm('将外部 MCP 添加到共享服务器？可能立即按远端默认策略启用，请确认来源可信。'))return;
    const version=epoch;busy=true;externalError='';context.render();
    try{const result=await writeApi('/hermes/mcp-external',{method:'POST',body:{...external,confirm:true}});if(version===epoch){data.mcp=result;libraryTab='mcp';externalOpen=false;external={name:'',url:'',auth:'oauth'};context.notify('连接已添加，请验证连接状态');}}
    catch(error){if(version===epoch)externalError=error.message;}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  function catalogActions(item,index){
    if(item.installable)return `<button class="secondary" data-agent-install="${index}" ${busy||blocked.catalog?'disabled':''}>${i('plus')}添加</button>`;
    if(!item.installed)return '<span class="tag">需额外配置</span>';
    const pending=setup[item.id]?.flow;
    const button=(action,label)=>`<button class="secondary" data-mcp-action="${action}" data-mcp-name="${e(item.id)}" ${busy?'disabled':''}>${e(label)}</button>`;
    return `${pending?button('status','检查授权')+button('cancel','取消授权'):(item.auth==='oauth'?button('authorize','连接账号'):'')+button('verify','验证并启用')}<button class="icon-button" data-mcp-action="remove" data-mcp-name="${e(item.id)}" title="移除" aria-label="移除 ${e(item.name)}" ${busy||pending?'disabled':''}>${i('trash-2')}</button>`;
  }
  function capabilityCard(id,item,index,actions){
    const key=id+':'+item.id,glyph={catalog:'plug',mcp:'plug',skills:'puzzle',tools:'wrench',schedules:'calendar-clock'}[id]||'blocks';
    return `<article class="capability-card"><header><span class="capability-icon tone-${id}">${i(glyph)}</span><div><h3>${e(item.name)}</h3><small>${e(id==='catalog'?'MCP':id==='skills'?'Skill':item.transport||item.status||'Hermes')}</small></div>${item.enabled===true?'<span class="tag green">已启用</span>':item.enabled===false?`<span class="tag">${id==='catalog'&&item.installed?'待连接':'已停用'}</span>`:''}</header><p class="capability-description">${e(item.description||item.schedule||'')}</p>${id==='catalog'&&!item.installed?`<div class="capability-primary">${actions}</div>`:'' }<details data-capability-detail="${e(key)}" ${opened.has(key)?'open':''}><summary>${id==='catalog'&&!item.installed?'授权与生效要求':'管理'}${i('chevron-down')}</summary><div class="capability-details">${item.notes?`<p>${e(item.notes)}</p>`:''}${setupStatus(item)}<div class="mcp-actions">${id==='catalog'&&!item.installed?'':actions}</div></div></details></article>`;
  }
  function catalog(){
    const items=data.catalog?listToolbar('catalog')+'<div class="capability-grid">'+(pageRows('catalog').rows.map(({item,index})=>capabilityCard('catalog',item,index,catalogActions(item,index))).join('')||'<div class="empty-state">没有匹配结果</div>')+'</div>'+listPager('catalog'):null;
    return `<section class="agent-section" data-agent-resource="catalog">${resourceHead('catalog','MCP 目录')}${errors.catalog?`<p class="form-error" role="alert">${e(errors.catalog)}</p>`:''}${items??placeholder()}</section>`;
  }
  function setupStatus(item){const s=setup[item.id];if(!s)return '';return `${s.error?`<p class="form-error" role="alert">${e(s.error)}</p>`:''}${s.url?`<a class="secondary" href="${e(s.url)}" target="_blank" rel="noopener noreferrer">打开授权页面${i('external-link')}</a>`:''}<p class="inline-status" role="status">${e({authorization_required:'等待账号授权',authorized:'授权完成，请验证连接',authorization_failed:'授权失败，可重新连接',cancelled:'授权已取消',enabled:'连接已验证并启用；现有会话可能需要重建'}[s.state]||'')}${s.state==='enabled'?` · ${s.toolCount} tools`:''}</p>`;}
  function reset(){window.HermesSkillsHub?.reset();epoch++;scheduleDraft=null;fresh={};inflight={};opened.clear();data={};errors={};drafts={};blocked={};setup={};busy=false;selected.clear();for(const id of Object.keys(lists))delete lists[id];libraryTab='catalog';external={name:'',url:'',auth:'oauth'};externalOpen=false;externalError='';}
  const labels={memoryEnabled:'长期记忆',userProfileEnabled:'用户画像',memoryLimit:'记忆字符上限',userLimit:'画像字符上限',compressionEnabled:'上下文压缩',sttEnabled:'语音识别',sttProvider:'识别服务商',ttsProvider:'朗读服务商',voice:'音色 ID'};
  function editor(id){
    const result=data[id],draft=drafts[id]||{};
    return `<section class="agent-section" data-agent-resource="${id}">${resourceHead(id,id==='memory'?'记忆配置':'远端语音配置')}<p class="inline-status">共享服务器配置 · default</p>${errors[id]?`<p class="form-error" role="alert">${e(errors[id])}</p>`:''}${result?`<div>${Object.entries(labels).filter(([key])=>Object.hasOwn(result.values,key)&&key!=='approvalMode').map(([key,label])=>{const value=Object.hasOwn(draft,key)?draft[key]:result.values[key],bool=typeof result.values[key]==='boolean',number=typeof result.values[key]==='number';return `<label class="setting-row"><strong>${e(label)}</strong><input data-agent-field="${key}" data-section="${id}" aria-label="${e(label)}" type="${bool?'checkbox':number?'number':'text'}" ${bool?(value?'checked':''):`value="${e(value)}"`} ${number?'min="256" max="1000000" step="1"':'maxlength="150"'} ${busy?'disabled':''}></label>`;}).join('')}</div><div class="setting-actions"><button class="primary" data-agent-save="${id}" ${busy||blocked[id]?'disabled':''}>${i('save')}保存到服务器</button><button class="secondary" data-agent-discard="${id}" ${busy?'disabled':''}>放弃修改</button><span class="inline-status">${Object.keys(draft).length?'有未保存修改':'与服务器一致'}</span></div>`:placeholder()}</section>`;
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
    const rows=result?.items?pageRows(id).rows.map(({item,index})=>{
      const actions=id==='mcp'?catalogActions({...item,installed:true},index):['skills','tools'].includes(id)&&item.enabled!==null?`<label class="capability-enable"><span>启用</span><input type="checkbox" data-agent-toggle="${id}" data-index="${index}" aria-label="${e(item.name)}" ${item.enabled?'checked':''} ${busy?'disabled':''}></label>`:id==='schedules'?`<button class="secondary" data-schedule-edit="${e(item.id)}">${i('settings-2')}管理</button><button class="icon-button" data-agent-job="pause" data-index="${index}" title="暂停" aria-label="暂停 ${e(item.name)}" ${busy?'disabled':''}>${i('pause')}</button><button class="icon-button" data-agent-job="resume" data-index="${index}" title="恢复" aria-label="恢复 ${e(item.name)}" ${busy?'disabled':''}>${i('play')}</button>`:`<span class="tag">${item.enabled===null?'未知':item.enabled?'已启用':'已停用'}</span>`;
      if(id==='tools')return `<div class="setting-row"><div class="setting-copy"><span class="capability-icon tone-tools">${i('wrench')}</span><div><strong>${e(item.name)}</strong><p>${e(item.description)}</p></div></div>${actions}</div>`;
      return capabilityCard(id,item,index,actions);
    }).join(''):'';
    return `<section class="agent-section" data-agent-resource="${id}">${resourceHead(id,names[id])}${errors[id]?`<p class="form-error" role="alert">${e(errors[id])}</p>`:''}${result?listToolbar(id)+`<div class="${id==='tools'?'tool-settings':'capability-grid'}">${rows||'<div class="empty-state">没有匹配结果</div>'}</div>`+listPager(id):placeholder()}</section>`;
  }
  function library(){return `<div class="settings capability-library">${externalEditor()}<div class="agent-tabs" role="tablist" aria-label="能力分类">${[['catalog','发现'],['mcp','已添加 MCP'],['skills','已安装 Skills'],['hub','Skills Hub']].map(([id,label])=>`<button role="tab" data-library-tab="${id}" aria-selected="${libraryTab===id}" class="${libraryTab===id?'active':''}">${e(label)}</button>`).join('')}</div>${libraryTab==='catalog'?catalog():libraryTab==='hub'?window.HermesSkillsHub.panel():section(libraryTab)}</div>`;}
  document.addEventListener('input',event=>{
    const el=event.target,id=el.dataset.capabilitySearch;if(!id)return;
    const s=listState(id),position=el.selectionStart;s.query=el.value;s.page=0;context.render();
    const next=document.querySelector('[data-capability-search="'+id+'"]');next?.focus({preventScroll:true});try{next?.setSelectionRange(position,position);}catch{}
  });
  document.addEventListener('change',event=>{const id=event.target.dataset.capabilityFilter;if(!id)return;listState(id).filter=event.target.value;listState(id).page=0;context.render();});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-capability-page],[data-library-tab]');if(!b||busy)return;
    if(b.dataset.capabilityPage){listState(b.dataset.capabilityPage).page+=Number(b.dataset.step);context.render();return;}
    libraryTab=b.dataset.libraryTab;context.render();
  });
  function panel(tab){return `<div class="settings">${tab==='tools'?`${section('tools')}<section class="agent-section"><div class="section-head"><h2>工作台上下文</h2><button class="secondary" data-agent-share ${selected.size?'':'disabled'}>${i('paperclip')}附加已选任务</button></div><p class="inline-status">仅共享已选任务及日历时间的快照；不会自动授权写入或共享健康数据。</p>${context.state.tasks.filter(t=>!t.deleted).map(t=>`<label class="context-task"><input type="checkbox" data-context-task="${t.id}" ${selected.has(t.id)?'checked':''}><span>${e(t.title)}<small>${t.scheduledAt?e(new Date(t.scheduledAt).toLocaleString('zh-CN')):'未安排时间'} · ${t.completed?'已完成':'待完成'}</small></span></label>`).join('')||'<div class="empty-state">暂无任务</div>'}</section>`:tab==='skills'?section('skills')+section('mcp'):tab==='memory'?soulEditor()+editor(tab):tab==='schedules'?scheduleForm()+section(tab):tab==='voice'?editor(tab):section(tab)}</div>`;}
  function fetchSection(id,discard=false){
    if(inflight[id])return inflight[id];
    const version=epoch;
    const work=queue.catch(()=>{}).then(async()=>{
      if(version!==epoch)return;
      try{
        const result=await context.api(id==='soul'?'/hermes/content/soul':`/hermes/capabilities/${id}`);
        if(version===epoch&&(discard||!Object.keys(drafts[id]||{}).length)){data[id]=result;fresh[id]=Date.now();delete errors[id];delete blocked[id];}
      }catch(error){if(version===epoch){errors[id]=error.message;blocked[id]=true;}throw error;}
    });
    queue=work.catch(()=>{});
    inflight[id]=work.finally(()=>{if(version===epoch)delete inflight[id];});
    return inflight[id];
  }
  document.addEventListener('input',event=>{const el=event.target;if(!el.dataset.agentField||busy)return;const id=el.dataset.section,key=el.dataset.agentField;(drafts[id]??={})[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value):el.value;const status=el.closest('.agent-section').querySelector('.setting-actions .inline-status');if(status)status.textContent='有未保存修改';});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-agent-save],[data-agent-discard]');if(!b||busy)return;
    const id=b.dataset.agentSave||b.dataset.agentDiscard;
    if(b.dataset.agentDiscard){delete drafts[id];context.render();return;}
    const changes=Object.fromEntries(Object.entries(drafts[id]||{}).filter(([key,value])=>value!==data[id].values[key]));
    if(!Object.keys(changes).length)return;
    if(!confirm('此操作会修改远端服务器上的共享配置或任务状态，可能影响其他客户端。确认继续？'))return;
    const version=epoch;busy=true;context.render();
    try{const result=await writeApi('/hermes/config',{method:'POST',body:{section:id,revision:data[id].revision,changes,confirm:true}});if(version===epoch){data[id]=result;delete drafts[id];delete errors[id];context.notify('配置已保存并回读验证');}}
    catch(error){if(version===epoch){errors[id]=error.message;blocked[id]=true;}}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-agent-install]');if(!b||busy||blocked.catalog)return;
    const item=data.catalog?.items[Number(b.dataset.agentInstall)];if(!item?.installable)return;
    if(!confirm(`${item.name}\n${'添加到共享服务器？添加后可连接账号、验证工具并启用。'}`))return;
    const version=epoch;busy=true;context.render();
    try{const result=await writeApi('/hermes/install-mcp',{method:'POST',body:{name:item.id,confirm:true}});if(version===epoch){data.catalog=result;fresh.catalog=Date.now();opened.add('catalog:'+item.id);delete errors.catalog;delete data.mcp;context.notify('已添加，请连接账号或验证并启用');}}
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
      let result=await writeApi('/hermes/mcp-action',{method:'POST',body:{name,action,...(previous.flow&&['status','cancel'].includes(action)?{flow:previous.flow}:{}),confirm:true}});
      if(version!==epoch)return;
      setup[name]=result.state==='authorization_required'?{...previous,...result}:result;
      if(['removed','enabled'].includes(result.state)){await fetchSection('mcp');if(data.catalog)await fetchSection('catalog');}
    }catch(error){if(version===epoch)setup[name]={...(error.code==='MCP_FLOW_EXPIRED'?{}:previous),error:error.message};}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  async function manage(body){if(!confirm('此操作会修改远端服务器上的共享配置或任务状态，可能影响其他客户端。确认继续？')){context.render();return;}await writeApi('/hermes/manage',{method:'POST',body:{...body,confirm:true}});await fetchSection(body.section);}
  document.addEventListener('click',async event=>{const b=event.target.closest('[data-agent-fetch],[data-agent-job],[data-agent-share]');if(!b||busy)return;const version=epoch;busy=true;context.render();try{
    if(b.dataset.agentFetch){if(Object.keys(drafts[b.dataset.agentFetch]||{}).length&&!confirm('重新读取将放弃未保存修改，继续？'))return;await fetchSection(b.dataset.agentFetch,true);delete drafts[b.dataset.agentFetch];}
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
  function soulEditor(){
    const result=data.soul,content=drafts.soul?.content??result?.content??'';
    return `<section class="agent-section" data-agent-resource="soul">${resourceHead('soul','SOUL · 行为设定')}${errors.soul?`<p class="form-error" role="alert">${e(errors.soul)}</p>`:''}${result?`<label class="content-field">SOUL.md<textarea data-soul-content ${busy?'disabled':''} rows="12" maxlength="32000">${e(content)}</textarea></label><div class="setting-actions"><button class="primary" data-soul-save ${busy||blocked.soul?'disabled':''}>${i('save')}保存到服务器</button><button class="secondary" data-agent-discard="soul">放弃修改</button><span class="inline-status">${drafts.soul?'有未保存修改':'与服务器一致'}</span></div><p class="inline-status">共享服务器配置 · default</p>`:placeholder()}</section>`;
  }
  function scheduleForm(){
    const d=scheduleDraft;
    return `<div class="capability-add"><button class="primary" data-schedule-new ${busy?'disabled':''}>${i('plus')}新建定时任务</button></div>${d?`<section class="schedule-editor"><div class="section-head"><h2>${d.id?'编辑定时任务':'新建定时任务'}</h2><button class="icon-button" data-schedule-close aria-label="关闭">${i('x')}</button></div><div class="schedule-fields"><label>任务名称<input data-schedule-field="name" ${busy?'disabled':''} maxlength="200" value="${e(d.name)}"></label><label>执行规则<input data-schedule-field="schedule" ${busy?'disabled':''} maxlength="200" value="${e(d.schedule)}" placeholder="0 9 * * *"></label><label class="schedule-prompt">任务指令<textarea data-schedule-field="prompt" ${busy?'disabled':''} maxlength="16000" rows="6">${e(d.prompt)}</textarea></label></div><p class="inline-status">时间规则由 Hermes 服务器解析，使用服务器时区。新建后按远端策略执行，可能产生模型费用。</p>${d.id?`<p class="inline-status">下次执行：${e(d.nextRun||'—')} · 上次执行：${e(d.lastRun||'—')} · ${e(d.lastStatus)}</p>`:''}${d.lastError?`<p class="form-error">${e(d.lastError)}</p>`:''}${d.id?`<details class="schedule-history"><summary>运行记录</summary>${d.historyError?'<p class="form-error">运行记录暂不可用</p>':d.runs?.length?d.runs.map(run=>`<div class="setting-row"><span>${e(run.started_at||run.id||'—')}</span><span>${e(run.status||'—')} ${e(run.error||'')}</span></div>`).join(''):'<p class="inline-status">暂无运行记录</p>'}</details>`:''}${errors.scheduleSave?`<p class="form-error" role="alert">${e(errors.scheduleSave)}</p>`:''}<div class="setting-actions"><button class="primary" data-schedule-save ${busy||d.uncertain?'disabled':''}>${i('save')}保存到服务器</button>${d.id?`<button class="secondary danger" data-schedule-delete ${busy||d.uncertain?'disabled':''}>${i('trash-2')}删除</button>`:''}<button class="secondary" data-schedule-close>取消</button></div></section>`:''}`;
  }
  document.addEventListener('input',event=>{
    if(event.target.hasAttribute('data-soul-content')){drafts.soul={content:event.target.value};const status=event.target.closest('.agent-section').querySelector('.setting-actions .inline-status');if(status)status.textContent='有未保存修改';}
    if(event.target.dataset.scheduleField&&scheduleDraft){scheduleDraft[event.target.dataset.scheduleField]=event.target.value;scheduleDraft.dirty=true;}
  });
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-soul-save],[data-schedule-new],[data-schedule-edit],[data-schedule-close],[data-schedule-save],[data-schedule-delete]');
    if(!b||busy)return;
    if(b.hasAttribute('data-schedule-new')||b.hasAttribute('data-schedule-close')){
      if(scheduleDraft?.dirty&&!confirm('放弃未保存修改？'))return;
      scheduleDraft=b.hasAttribute('data-schedule-new')?{key:crypto.randomUUID(),name:'',prompt:'',schedule:'',dirty:false}:null;delete errors.scheduleSave;context.render();return;
    }
    if(b.hasAttribute('data-soul-save')&&!drafts.soul)return;
    if(!b.dataset.scheduleEdit&&!confirm('此操作会修改远端服务器上的共享配置或任务状态，可能影响其他客户端。确认继续？'))return;
    const version=epoch;busy=true;context.render();
    try{
      await queue.catch(()=>{});if(version!==epoch)return;
      if(b.dataset.scheduleEdit){const result=await context.api('/hermes/content/'+encodeURIComponent(b.dataset.scheduleEdit));if(version!==epoch)return;scheduleDraft={...result,dirty:false};delete errors.scheduleSave;}
      else if(b.hasAttribute('data-soul-save')){
        const result=await writeApi('/hermes/content/soul',{method:'POST',body:{action:'soul',content:drafts.soul.content,revision:data.soul.revision,confirm:true}});
        if(version===epoch){data.soul=result;fresh.soul=Date.now();delete drafts.soul;delete errors.soul;context.notify('配置已保存并回读验证');}
      }else{
        const d=scheduleDraft,action=b.hasAttribute('data-schedule-delete')?'delete':d.id?'update':'create';
        const body={action,confirm:true,...(d.id?{id:d.id,revision:d.revision}:{key:d.key}),...(action==='delete'?{}:{name:d.name,prompt:d.prompt,schedule:d.schedule})};
        await writeApi('/hermes/content/schedules',{method:'POST',body});
        if(version!==epoch)return;scheduleDraft=null;delete errors.scheduleSave;await fetchSection('schedules');context.notify('配置已保存并回读验证');
      }
    }catch(error){if(version===epoch){if(b.hasAttribute('data-soul-save')){errors.soul=error.message;blocked.soul=true;}else{errors.scheduleSave=error.message;if(scheduleDraft&&['SCHEDULE_UNVERIFIED','CONFIG_CONFLICT'].includes(error.code))scheduleDraft.uncertain=true;context.notify(error.message);}}}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  const dirty=()=>Boolean(scheduleDraft?.dirty)||Object.values(drafts).some(draft=>Object.keys(draft).length>0);
  window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
  return {configure,reset,autoLoad,prepare:checkScope,addConnection:externalEditor,panel:tab=>tab==='external'?window.HermesExternalAgents.panel():tab==='collaboration'?window.HermesProfiles.panel():tab==='skills'?library():panel(tab),connections:()=>section('mcp'),dirty:()=>dirty()||window.HermesProfiles.dirty()};
})();
