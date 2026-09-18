'use strict';
window.HermesSkillsHub=(()=>{
  let page=0;let context,items=[],query='',loaded=false,busy=false,error='',epoch=0,dialog=null,review=null;
  const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
  function reset(){page=0;epoch++;items=[];query='';loaded=false;busy=false;error='';dialog?.remove();dialog=null;review=null;}
  function panel(){return `<section class="agent-section"><div class="section-head"><h2>Skills Hub</h2><span class="tag">Official (Nous)</span></div>
    <div class="capability-toolbar"><input id="hub-query" type="search" maxlength="100" value="${e(query)}" ${busy?'disabled':''} placeholder="搜索技能" aria-label="搜索技能"><button class="secondary" data-hub-search ${busy?'disabled':''}>${i('search')}搜索</button><button class="secondary" data-hub-browse ${busy?'disabled':''}>${i('compass')}推荐技能</button></div>
    <div class="inline-status" role="status">${busy?'正在连接 Skills Hub…':''}</div>${error?`<p class="form-error" role="alert">${e(error)}</p>`:''}
    ${loaded?items.slice(page*10,page*10+10).map((item,index)=>`<div class="setting-row"><div class="setting-copy"><div><strong>${e(item.name)}</strong><p>${e(item.description)}</p><small>${e(item.identifier)}</small></div></div><button class="secondary" data-hub-review="${index+page*10}" ${busy?'disabled':''}>${item.installed?'已安装 · 查看':'预览与扫描'}</button></div>`).join('')||'<div class="empty-state">Official (Nous) · 没有匹配结果</div>':!error&&!busy?'<div class="empty-state">尚未搜索技能</div>':''}
    ${loaded?`<nav class="capability-pager"><span>${items.length} · ${page+1} / ${Math.max(1,Math.ceil(items.length/10))}</span><button class="icon-button" data-hub-page="-1" aria-label="上一页" ${busy||page===0?'disabled':''}>${i('chevron-left')}</button><button class="icon-button" data-hub-page="1" aria-label="下一页" ${busy||(page+1)*10>=items.length?'disabled':''}>${i('chevron-right')}</button></nav>`:''}</section>`;}
  function showReview(result,installed){
    review=result;dialog=document.createElement('dialog');dialog.className='skill-review';dialog.setAttribute('aria-label','技能安装审查');
    dialog.innerHTML=`<div class="dialog-head"><h2>${e(result.name)}</h2><button class="icon-button" data-hub-close title="关闭" aria-label="关闭">${i('x')}</button></div><div class="skill-review-body"><p class="inline-status">${e(result.identifier)}</p><p class="skill-verdict ${result.allowed?'':'danger'}">${result.allowed?'扫描通过，仍需核对来源与权限':'扫描未通过，禁止安装'}</p><p>${e(result.summary)}</p><details><summary>扫描发现 · ${result.findings.length}</summary>${result.findings.map(f=>`<p><strong>${e(f.severity)}</strong> ${e(f.file)}:${f.line}<br>${e(f.description)}</p>`).join('')}</details><details><summary>文件清单 · ${result.files.length}</summary><pre>${e(result.files.join('\n'))}</pre></details><article class="markdown-body">${window.HermesChat.markdown(result.content)}</article></div><p class="form-error" role="alert"></p><footer><button class="secondary" data-hub-close>取消</button><button class="primary" data-hub-install ${installed||!result.allowed?'disabled':''}>${installed?'已安装':'安装到服务器'}</button></footer>`;
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy){dialog.remove();dialog=null;review=null;}});document.body.append(dialog);dialog.showModal();window.lucide?.createIcons();
  }
  document.addEventListener('input',event=>{if(event.target.id==='hub-query')query=event.target.value;});
  document.addEventListener('keydown',event=>{if(event.target.id==='hub-query'&&event.key==='Enter'){event.preventDefault();document.querySelector('[data-hub-search]')?.click();}});
  document.addEventListener('click',async event=>{
    const b=event.target.closest('[data-hub-search],[data-hub-browse],[data-hub-review],[data-hub-close],[data-hub-install],[data-hub-page]');if(!b||busy)return;
    const searching=b.hasAttribute('data-hub-search')||b.hasAttribute('data-hub-browse');if(b.hasAttribute('data-hub-browse'))query='';if(searching){loaded=false;items=[];page=0;}
    if(b.dataset.hubPage){page+=Number(b.dataset.hubPage);context.render();return;}
    if(b.hasAttribute('data-hub-close')){dialog?.remove();dialog=null;review=null;return;}
    if(b.hasAttribute('data-hub-install')&&!confirm('安装到共享 default 档案？技能可能立即可用，并可指导 Hermes 调用工具或运行代码。扫描不保证安全，请确认信任来源。'))return;
    const version=epoch;busy=true;error='';context.render();if(dialog){dialog.querySelector('[data-hub-install]').disabled=true;if(b.hasAttribute('data-hub-install'))dialog.querySelector('[data-hub-install]').textContent='正在安装…';}
    try{
      if(searching){const result=await context.api('/hermes/skills-hub/search',{method:'POST',body:{q:query}});if(version!==epoch)return;items=result.items;page=0;loaded=true;}
      if(b.hasAttribute('data-hub-review')){const item=items[Number(b.dataset.hubReview)],result=await context.api('/hermes/skills-hub/review',{method:'POST',body:{identifier:item.identifier}});if(version!==epoch)return;showReview(result,item.installed);}
      if(b.hasAttribute('data-hub-install')){
        await context.api('/hermes/skills-hub/install',{method:'POST',body:{reviewId:review.reviewId,confirm:true}});if(version!==epoch)return;
        const item=items.find(v=>v.identifier===review.identifier);if(item)item.installed=true;
        dialog.remove();dialog=null;review=null;context.notify('技能已安装并回读确认');
      }
    }catch(cause){if(version===epoch){if(dialog){dialog.querySelector('.form-error').textContent=cause.message;dialog.querySelector('[data-hub-install]').textContent='安装到服务器';dialog.querySelector('[data-hub-install]').disabled=true;}else error=cause.message;}}
    finally{if(version===epoch){busy=false;context.render();}}
  });
  return {configure:c=>context=c,reset,panel};
})();
