'use strict';
window.HermesDocuments=(()=>{
  const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
  let context,owner,epoch=0,sequence=0,items=[],current=null,draft=null,versions=[],search='',trash=false,mode='edit',busy=false,conflict=false,loaded=false,error='',pending=null,usage=null;
  const dirty=()=>Boolean(draft&&(!current||draft.name!==current.name||draft.content!==current.content));
  const stamp=value=>new Date(value).toLocaleString('zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  function configure(value){context=value;}
  function reset(){epoch++;sequence++;owner=null;items=[];current=null;draft=null;versions=[];search='';trash=false;mode='edit';busy=false;conflict=false;loaded=false;error='';pending=null;usage=null;}
  async function load(){
    if(!context.state.me)return;
    if(owner!==context.state.me.user.id){reset();owner=context.state.me.user.id;}
    const version=epoch,seq=++sequence;
    try{
      const result=await context.api('/documents');if(version!==epoch||seq!==sequence)return;
      items=result.documents;usage=result.usage;loaded=true;error='';
      const remote=current&&items.find(d=>d.id===current.id);
      if(remote&&remote.version!==current.version)conflict=true;
    }catch(cause){if(version===epoch){error='文档列表未同步，请重试。';}throw cause;}
  }
  function editor(){
    if(!draft)return `<div class="document-empty">${i('files')}<h2>${trash?'回收站':'我的文档'}</h2><p>${loaded?'尚未选择文档':'正在读取文档…'}</p>${trash?'':'<button class="secondary" data-doc-action="new">新建文档</button>'}</div>`;
    const deleted=current?.deleted,changed=dirty();
    return `<div class="document-editor-head"><input id="document-name" aria-label="文档名称" maxlength="160" value="${e(draft.name)}" ${busy||deleted?'disabled':''}><div class="document-commands">
      <button class="icon-button" data-doc-action="save" title="保存文档" aria-label="保存文档" ${busy||deleted||!changed?'disabled':''}>${i('save')}</button>
      <button class="icon-button" data-doc-action="preview" title="在线预览" aria-label="在线预览">${i('scan-eye')}</button>
      <button class="icon-button" data-doc-action="attach" title="附加给 Hermes" aria-label="附加给 Hermes" ${busy||deleted?'disabled':''}>${i('paperclip')}</button>
      <button class="icon-button" data-doc-action="${deleted?'restore':'trash'}" title="${deleted?'恢复文档':'移入回收站'}" aria-label="${deleted?'恢复文档':'移入回收站'}" ${busy||!current?'disabled':''}>${i(deleted?'rotate-ccw':'trash-2')}</button>${deleted?`<button class="icon-button danger" data-doc-action="purge" title="彻底删除文档" aria-label="彻底删除文档" ${busy?'disabled':''}>${i('trash-2')}</button>`:''}</div></div>
      <div class="document-subhead"><div class="tabs"><button data-doc-mode="edit" class="${mode==='edit'?'active':''}">编辑</button><button data-doc-mode="preview" class="${mode==='preview'?'active':''}">预览</button><button data-doc-mode="history" class="${mode==='history'?'active':''}" ${!current?'disabled':''}>版本</button></div><span id="document-save-state" role="status">${busy?'正在保存…':deleted?'回收站':changed?'未保存':current?`已保存 · v${current.version}`:'未保存'}</span></div>
      ${conflict?'<div class="document-conflict" role="alert">服务器已有新版本，本地内容已保留。<div><button class="text-button" data-doc-action="remote">查看服务器版本</button><button class="text-button" data-doc-action="reload">载入服务器版本</button><button class="text-button" data-doc-action="copy">另存为副本</button></div></div>':''}
      ${mode==='edit'?`<textarea id="document-content" aria-label="文档内容" spellcheck="false" ${busy||deleted?'readonly':''}>${e(draft.content)}</textarea>`:mode==='preview'?`<div class="document-inline-preview markdown-body">${/\.(md|markdown)$/i.test(draft.name)?window.HermesChat.markdown(draft.content):`<pre><code>${e(draft.content)}</code></pre>`}</div>`:`<div class="document-history">${versions.map(v=>`<div><span><strong>v${v.version} · ${e(v.name)}</strong><small>${stamp(v.updated)}${v.deleted?' · 已移入回收站':''}</small></span><button class="icon-button" data-doc-version="${v.version}" title="预览版本" aria-label="预览版本 ${v.version}">${i('eye')}</button><button class="icon-button" data-doc-restore-version="${v.version}" title="载入此版本" aria-label="载入版本 ${v.version}" ${busy||deleted?'disabled':''}>${i('rotate-ccw')}</button></div>`).join('')}</div>`}
      <footer class="document-editor-foot"><span>${e(draft.name.split('.').at(-1).toUpperCase())}</span><span id="document-byte-count">${new TextEncoder().encode(draft.content).length.toLocaleString()} / 64,000 字节</span></footer>`;
  }
  function panel(){
    const visible=items.filter(d=>d.deleted===trash&&d.name.toLowerCase().includes(search.toLowerCase()));
    return `<div class="page-header"><h1>工作空间</h1><div class="document-commands"><input type="file" id="document-import" hidden accept=".md,.markdown,.txt,.json,.csv,.log,.js,.ts,.jsx,.tsx,.py,.css,.html,.xml,.yaml,.yml,.sh,.sql"><button class="icon-button" data-doc-action="import" title="导入文本文件" aria-label="导入文本文件" ${busy?'disabled':''}>${i('upload')}</button><button class="icon-button" data-doc-action="new" title="新建文档" aria-label="新建文档" ${busy?'disabled':''}>${i('plus')}</button></div></div>
    <div class="workspace-toolbar"><div class="tabs"><button data-doc-filter="active" class="${trash?'':'active'}">文档</button><button data-doc-filter="trash" class="${trash?'active':''}">回收站</button></div><span class="document-usage">${usage?`${items.length} / ${usage.maxDocuments} · ${(usage.bytes/1024/1024).toFixed(1)} / 20 MB`:''}</span></div>
    ${error?`<div class="document-conflict" role="alert">${e(error)}<button class="text-button" data-doc-action="refresh">重试</button></div>`:''}
    <div class="document-workspace"><aside class="document-library"><label class="document-search">${i('search')}<input id="document-search" aria-label="搜索文档" placeholder="搜索文档" value="${e(search)}"></label><div class="document-list">${visible.map(d=>`<button data-doc-open="${d.id}" class="${current?.id===d.id?'selected':''}">${i('file-text')}<span><strong>${e(d.name)}</strong><small>${stamp(d.updated)} · v${d.version}</small></span></button>`).join('')||'<p class="document-list-empty">暂无文档</p>'}</div></aside><section class="document-editor" aria-label="文档编辑器">${editor()}</section></div>`;
  }
  function discard(){return !dirty()||confirm('当前文档有未保存内容，确认放弃这些修改？');}
  async function open(id,force=false){
    if(!force&&!discard())return;const version=epoch;
    const result=await context.api(`/documents/${id}`);if(version!==epoch)return;
    current=result;draft={name:result.name,content:result.content};versions=[];conflict=false;pending=null;mode='edit';trash=result.deleted;
  }
  async function save(deleted=current?.deleted||false){
    if(!draft)return false;
    if(new TextEncoder().encode(draft.content).length>64000)throw new Error('单个文档不能超过 64 KB，本地内容已保留。');
    const version=epoch,body={id:current?.id||pending?.body.id||crypto.randomUUID(),version:current?.version||0,name:draft.name.trim(),content:draft.content,deleted};
    const fingerprint=JSON.stringify(body);if(pending?.fingerprint!==fingerprint)pending={body,fingerprint,key:crypto.randomUUID()};
    const result=await context.api('/documents',{method:'POST',key:pending.key,body});if(version!==epoch)return false;
    current=result;draft={name:result.name,content:result.content};conflict=false;pending=null;await load();return version===epoch;
  }
  async function action(b){
    if(busy)return;const version=epoch,name=b.dataset.docAction;
    try{
      if(b.dataset.docFilter){trash=b.dataset.docFilter==='trash';context.render();return;}
      if(name==='new'){if(!discard())return;current=null;draft={name:'未命名.md',content:''};mode='edit';trash=false;conflict=false;pending=null;context.render();document.querySelector('#document-name')?.focus();return;}
      if(name==='import'){document.querySelector('#document-import').click();return;}
      if(name==='preview'){window.HermesChat.preview(draft);return;}
      busy=true;context.render();
      if(b.dataset.docOpen)await open(b.dataset.docOpen);
      if(name==='refresh')await load();
      if(name==='save')await save();
      if(name==='attach'){
        if(dirty()&&!await save())return;
        if(version===epoch&&await window.HermesChat.attachDocument(draft))context.notify('文档已附加到输入框，尚未发送。');
      }
      if(name==='trash'&&discard()&&confirm('将此文档移入回收站？已发送给 Hermes 的副本不受影响。')){draft={name:current.name,content:current.content};if(await save(true)){current=null;draft=null;}}
      if(name==='restore'){if(await save(false))trash=false;}
      if(name==='purge'&&confirm('彻底删除此文档及工作台版本历史？此操作不可恢复。已发送的聊天附件、远端副本和既有备份不会一并删除。')){await context.api(`/documents/${current.id}`,{method:'DELETE',body:{version:current.version,confirm:true}});if(version!==epoch)return;current=null;draft=null;await load();}
      if(name==='copy'){current=null;pending=null;conflict=false;if(await save(false))context.notify('已另存为独立文档。');}
      if(name==='reload')await open(current.id);
      if(name==='remote'){const file=await context.api(`/documents/${current.id}`);if(version===epoch)window.HermesChat.preview(file);}
      if(b.dataset.docMode){
        if(b.dataset.docMode==='history'){const result=await context.api(`/documents/${current.id}/versions`);if(version!==epoch)return;versions=result.versions;}
        mode=b.dataset.docMode;
      }
      if(b.dataset.docVersion||b.dataset.docRestoreVersion){
        const file=await context.api(`/documents/${current.id}/versions/${b.dataset.docVersion||b.dataset.docRestoreVersion}`);if(version!==epoch)return;
        if(b.dataset.docVersion)window.HermesChat.preview(file);
        else if(discard()){draft={name:file.name,content:file.content};mode='edit';context.notify('历史版本已载入编辑器，保存后生成新版本。');}
      }
    }catch(cause){if(version===epoch){if(cause.code==='DOCUMENT_CONFLICT')conflict=true;context.notify(cause.message);}}
    finally{if(version===epoch){busy=false;context.render();}}
  }
  document.addEventListener('click',event=>{const b=event.target.closest('[data-doc-action],[data-doc-open],[data-doc-mode],[data-doc-filter],[data-doc-version],[data-doc-restore-version]');if(b){event.preventDefault();void action(b);}});
  document.addEventListener('input',event=>{
    if(event.target.id==='document-search'){search=event.target.value;context.render();return;}
    if(!draft)return;
    if(event.target.id==='document-name')draft.name=event.target.value;
    else if(event.target.id==='document-content')draft.content=event.target.value;
    else return;
    document.querySelector('#document-save-state').textContent=dirty()?'未保存':`已保存 · v${current?.version||0}`;
    document.querySelector('[data-doc-action=save]').disabled=busy||!dirty();
    document.querySelector('#document-byte-count').textContent=`${new TextEncoder().encode(draft.content).length.toLocaleString()} / 64,000 字节`;
  });
  document.addEventListener('change',async event=>{
    if(event.target.id!=='document-import'||busy)return;const file=event.target.files[0];if(!file||!discard())return;
    const version=epoch;busy=true;context.render();
    try{
      if(file.size>64000)throw new Error('单个文档不能超过 64 KB。');
      if(!/^[^/\\\x00-\x1f]+\.(md|markdown|txt|json|csv|log|js|ts|jsx|tsx|py|css|html|xml|yaml|yml|sh|sql)$/i.test(file.name)||file.name.length>160)throw new Error('请选择 Markdown、UTF-8 文本或代码文件。');
      const content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());if(version!==epoch)return;
      if(content.includes('\0'))throw new Error('不支持二进制文件。');
      current=null;pending=null;draft={name:file.name,content};conflict=false;mode='edit';trash=false;context.notify('文件已导入编辑器，尚未保存。');
    }catch(cause){if(version===epoch)context.notify(cause.message);}finally{if(version===epoch){busy=false;context.render();}}
  });
  window.addEventListener('beforeunload',event=>{if(dirty()&&!window.I18n?.reloading){event.preventDefault();event.returnValue='';}});
  document.addEventListener('keydown',event=>{if(context?.state.page==='workspace'&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();if(dirty())void action({dataset:{docAction:'save'}});}});
  function capture(){const el=document.activeElement;return {id:el?.id,start:el?.selectionStart,end:el?.selectionEnd,top:document.querySelector('#document-content')?.scrollTop||0};}
  function restore(saved){if(saved?.id?.startsWith('document-')){const el=document.getElementById(saved.id);el?.focus({preventScroll:true});el?.setSelectionRange?.(saved.start,saved.end);}const editor=document.querySelector('#document-content');if(editor)editor.scrollTop=saved?.top||0;}
  async function saveReply(run){
    if(busy||!discard())return;const version=epoch;busy=true;context.render();
    try{
      const name=`Hermes-${new Date(run.created).toISOString().slice(0,10)}-${run.id.slice(0,8)}.md`;
      const result=await context.api('/documents',{method:'POST',key:run.id,body:{id:run.id,version:0,name,content:run.output,deleted:false}});
      if(version!==epoch)return;await load();if(version!==epoch)return;await open(result.id,true);
      if(version!==epoch)return;context.state.page='workspace';context.state.workspaceView='documents';context.state.chatExpanded=false;context.notify('回复已保存到工作空间。');
    }catch(cause){if(version===epoch)context.notify(cause.message);}finally{if(version===epoch){busy=false;context.render();}}
  }
  async function openFromProject(id){if(busy)return;const version=epoch;await open(id);if(version===epoch&&current?.id===id){context.state.workspaceView='documents';context.render();}}
  return {configure,reset,load,panel,capture,restore,dirty,saveReply,openFromProject};
})();
