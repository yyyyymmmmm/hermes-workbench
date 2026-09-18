'use strict';
window.HermesTaskPlan=(()=>{
  let context,epoch=0,busy=false,dialog=null,request=null,runId=null;
  const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
  function reset(){epoch++;busy=false;request=null;runId=null;dialog?.remove();dialog=null;}
  function close(){if(busy&&dialog?.querySelector('form'))return;if(dialog?.querySelector('form')&&!confirm('放弃本次任务安排？'))return;reset();}
  async function open(id){
    if(dialog)return;const version=++epoch;runId=id;busy=true;
    dialog=document.createElement('dialog');dialog.className='task-plan-dialog';dialog.setAttribute('aria-label','确认任务清单');
    dialog.innerHTML=`<div class="dialog-head"><h2>确认任务清单</h2><button type="button" class="icon-button" data-plan-close aria-label="关闭">${i('x')}</button></div><div class="plan-body"><p role="status">正在加载任务清单</p></div>`;
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('click',event=>{if(event.target.closest('[data-plan-close]'))close();});document.body.append(dialog);dialog.showModal();window.lucide?.createIcons();
    try{
      const plan=await context.api(`/runs/${id}/task-plan`);if(version!==epoch)return;const projects=await context.api('/projects');if(version!==epoch)return;
      const available=plan.items.filter(p=>!p.taskId);
      dialog.querySelector('.plan-body').innerHTML=available.length?`<form id="task-plan-form"><label class="plan-project">项目<select name="project"><option value="">不关联项目</option>${projects.projects.filter(p=>!p.archived).map(p=>`<option value="${p.id}" ${window.HermesProjects.activeId()===p.id?'selected':''}>${e(p.name)}</option>`).join('')}</select></label><div class="plan-items">${plan.items.map(p=>`<section class="plan-item" data-plan-index="${p.index}"><label class="plan-choice"><input type="checkbox" name="selected" ${p.taskId?'disabled':'checked'}><span>${p.taskId?'已添加':'添加任务'}</span><strong>${e(p.title)}</strong></label><label>任务名称<input name="title" aria-label="任务名称" value="${e(p.title)}" maxlength="300" required ${p.taskId?'disabled':''}></label>${p.truncated?'<p class="plan-warning">标题已截短，请核对原回复</p>':''}<div class="plan-time"><label>日历时间<input name="scheduled" type="datetime-local" ${p.taskId?'disabled':''}></label><label>时长（分钟）<input name="minutes" type="number" min="5" max="1440" value="30" required ${p.taskId?'disabled':''}></label></div></section>`).join('')}</div><div class="form-error" role="alert"></div><footer><button type="button" class="secondary" data-plan-close>取消</button><button type="submit" class="primary">确认添加</button></footer></form>`:`<p>${plan.items.length?'这份清单已全部添加':'回复中没有未完成的复选清单'}</p>`;
      dialog.querySelector('form')?.addEventListener('submit',submit);
      if(plan.projectId&&dialog.querySelector('form')){const select=dialog.querySelector('[name=project]');select.value=plan.projectId;select.disabled=true;}
      dialog.querySelector('form')?.addEventListener('change',event=>{if(event.target.name==='selected'){const section=event.target.closest('.plan-item');section.querySelectorAll('input:not([name=selected])').forEach(input=>input.disabled=!event.target.checked);}});
    }catch(error){if(version===epoch)dialog.querySelector('.plan-body').textContent=error.message;}
    finally{if(version===epoch)busy=false;}
  }
  async function submit(event){
    event.preventDefault();event.stopPropagation();if(busy)return;
    const form=event.target,items=[...form.querySelectorAll('.plan-item')].filter(row=>row.querySelector('[name=selected]').checked&&!row.querySelector('[name=selected]').disabled).map(row=>({index:Number(row.dataset.planIndex),title:row.querySelector('[name=title]').value.trim(),scheduledAt:row.querySelector('[name=scheduled]').value?new Date(row.querySelector('[name=scheduled]').value).toISOString():null,minutes:Number(row.querySelector('[name=minutes]').value),timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
    if(!items.length){form.querySelector('.form-error').textContent='请至少选择一项任务';return;}
    const projectId=form.elements.project.value,body={confirm:true,items,...(projectId?{projectId}:{})},fingerprint=JSON.stringify(body);
    if(request&&request.fingerprint!==fingerprint){form.querySelector('.form-error').textContent='上次提交结果未确认，请保持原内容重试或关闭后重新核对';return;}
    request??={fingerprint,key:crypto.randomUUID()};busy=true;const version=epoch;form.querySelector('[type=submit]').disabled=true;form.querySelector('.form-error').textContent='';
    form.querySelectorAll('input,select').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});
    try{
      await context.api(`/runs/${runId}/task-plan`,{method:'POST',body,key:request.key});if(version!==epoch)return;
      reset();await context.refresh();context.changed();context.notify('任务已添加，待办与日历已更新');
    }catch(error){if(version===epoch){if(error.code&&error.code!=='REQUEST_FAILED')request=null;form.querySelector('.form-error').textContent=error.message;}}
    finally{if(version===epoch){busy=false;form.querySelector('[type=submit]').disabled=false;form.querySelectorAll('input,select').forEach(el=>el.disabled=el.dataset.wasDisabled==='true');}}
  }
  document.addEventListener('click',event=>{const button=event.target.closest('[data-plan-run]');if(button)void open(button.dataset.planRun);});
  window.addEventListener('beforeunload',event=>{if(dialog?.querySelector('form')){event.preventDefault();event.returnValue='';}});
  return {configure:c=>context=c,reset};
})();
