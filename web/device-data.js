'use strict';
window.HermesDeviceData=(()=>{
 let context,health=null,calendar=null,error='',busy=false,pending=null;
 const names={steps:['今日步数','Today\'s steps'],sleep:['睡眠（过去24小时）','Sleep (past 24 hours)'],weight:['体重','Weight'],restingHeartRate:['静息心率','Resting heart rate'],bodyFat:['体脂率','Body fat'],oxygen:['血氧','Oxygen saturation'],bloodGlucose:['血糖','Blood glucose']};
 const selected=new Set(['steps']);
 const t=(zh,en)=>I18n.locale==='en'?en:zh,e=value=>HermesViews.esc(value),icon=n=>HermesViews.icon(n);
 const available=()=>Boolean(window.HermesNative?.postMessage||window.webkit?.messageHandlers?.hermesDevice);
 function reset(){if(pending){clearTimeout(pending.timer);pending.reject(new Error('CANCELLED'));}pending=null;health=null;calendar=null;error='';busy=false;selected.clear();selected.add('steps');}
 function receive(data){if(typeof data==='string'){try{data=JSON.parse(data);}catch{return;}}if(!pending||data?.id!==pending.id)return;const p=pending;pending=null;clearTimeout(p.timer);data.error?p.reject(new Error(data.error)):p.resolve(data);}
 window.addEventListener('hermes-native-result',event=>receive(event.detail));
 function request(method,event){return new Promise((resolve,reject)=>{
  const id=crypto.randomUUID(),message={id,method,metrics:[...selected],...(event?{event}:{})};
  pending={id,resolve,reject,timer:setTimeout(()=>{if(pending?.id===id){pending=null;reject(new Error('TIMEOUT'));}},120000)};
  try{if(window.HermesNative){window.HermesNative.onmessage=event=>receive(event.data);window.HermesNative.postMessage(JSON.stringify(message));}else window.webkit.messageHandlers.hermesDevice.postMessage(message);}catch(error){clearTimeout(pending.timer);pending=null;reject(error);}
 });}
 function controls(kind){return `<div class="section-head"><h2>${kind==='health'?t('健康数据','Health data'):t('手机系统日历','Device calendar')}</h2><button class="secondary" data-device-read="${kind}" ${busy||!available()||(kind==='health'&&!selected.size)?'disabled':''}>${icon('refresh-cw')}${busy?t('等待授权…','Awaiting authorization…'):t('授权并读取','Authorize and read')}</button></div>${!available()?`<p>${t('请在新版安卓或 iOS 客户端中读取手机数据。','Use the updated Android or iOS client to read device data.')}</p>`:''}${error?`<p class="form-error" role="alert">${e(error)}</p>`:''}`;}
 function status(value){return ({denied:t('未授权','Not authorized'),read_failed:t('读取失败','Read failed'),no_data:t('无可读取记录（可能未授权）','No readable records (access may not be granted)')})[value]||'';}
 function healthPanel(){return `<div class="page-header"><h1>${t('生活与健康','Life and health')}</h1></div><section class="device-data">${controls('health')}<div class="device-health-options">${Object.entries(names).map(([key,label])=>`<label><input type="checkbox" data-health-key="${key}" ${selected.has(key)?'checked':''} ${busy?'disabled':''}>${e(t(...label))}</label>`).join('')}<button class="text-button" data-device-all ${busy?'disabled':''}>${t('选择全部支持项','Select all supported types')}</button></div><p class="inline-status">${t('步数为今日累计，睡眠为过去24小时入睡阶段合并时长；其他指标为近七天最新记录。仅申请读取。','Steps are today\'s total; sleep merges asleep stages in the past 24 hours; other metrics are the latest record within seven days. Read access only.')}</p>${health?`<p>${e(health.source)} · ${e(new Date(health.to).toLocaleString(I18n.locale))}</p><div class="health-stats">${health.metrics.map(m=>`<section class="health-stat"><span>${e(names[m.key]?t(...names[m.key]):m.key)}</span><strong>${m.status==='available'?e(m.value):'--'}<small>${e(m.unit||'')}</small></strong><p>${m.status==='available'?e(new Date(m.at).toLocaleString(I18n.locale)):e(status(m.status))}</p></section>`).join('')}</div><button class="secondary" data-device-share>${icon('message-square')}${t('预览给 Hermes 的摘要','Preview summary for Hermes')}</button>`:''}<p>${t('本页不自动上传或发送给 Hermes。关闭页面或退出账号会清除本次读取结果；系统权限请在手机设置中撤销。','This page does not automatically upload or send data to Hermes. Closing the page or signing out clears these results; revoke system permissions in device settings.')}</p><button class="text-button" data-device-clear>${t('清除本次读取结果','Clear read results')}</button></section>`;}
 function calendarPanel(){
  const tasks=context.state.tasks.filter(task=>!task.deleted&&!task.completed&&task.scheduledAt);
  const exportForm=`<div class="device-calendar-export"><label>${t('已安排的任务','Scheduled task')}<select id="device-calendar-task" ${busy?'disabled':''}>${tasks.map(task=>`<option value="${e(task.id)}">${e(task.title)} · ${e(new Date(task.scheduledAt).toLocaleString(I18n.locale))}</option>`).join('')}</select></label><button class="secondary" data-device-compose ${busy||!available()||!tasks.length?'disabled':''}>${icon('calendar-plus')}${t('在系统日历中编辑','Edit in system calendar')}</button></div><p>${t('保存由系统日历确认。重复操作可能生成重复日程；不会自动修改待办或建立双向同步。','Save in the system calendar. Repeating this action may create duplicates; tasks are unchanged and no two-way sync is established.')}</p>`;
  const rows=calendar?.events.map(item=>`<div class="device"><div class="copy"><strong>${e(item.title)}</strong><p>${e(new Date(item.start).toLocaleString(I18n.locale))} / ${e(new Date(item.end).toLocaleString(I18n.locale))}${item.allDay?' · '+t('全天','All day'):''}</p></div></div>`).join('');
  return `<section class="device-data">${controls('calendar')}${exportForm}<p>${t('只读未来七天，最多显示100条；尚未导入待办或双向同步。','Read-only next seven days, up to 100 events; not imported into tasks or synchronized.')}</p>${calendar?`<p>${e(calendar.source)}</p>${rows||`<p>${t('此时间范围没有可读取日程。','No readable events in this range.')}</p>`}`:''}</section>`;
 }
 document.addEventListener('change',ev=>{const key=ev.target.dataset.healthKey;if(key&&!busy){ev.target.checked?selected.add(key):selected.delete(key);context.render();}});
 document.addEventListener('click',async ev=>{
  const button=ev.target.closest('[data-device-read],[data-device-all],[data-device-clear],[data-device-share],[data-device-compose]');if(!button||busy||!context?.state.me)return;
  if(button.hasAttribute('data-device-all')){Object.keys(names).forEach(k=>selected.add(k));context.render();return;}
  if(button.hasAttribute('data-device-clear')){reset();context.render();return;}
  if(button.hasAttribute('data-device-share')){
   if(!context.state.hermes.connected){context.notify(t('请先连接 Hermes 服务器。','Connect your Hermes server first.'));return;}
   const metrics=health?.metrics.filter(m=>selected.has(m.key)&&m.status==='available')||[];if(!metrics.length)return;
   const summary=JSON.stringify({source:health.source,from:health.from,to:health.to,metrics},null,2);
   if(!confirm(t('以下健康摘要将放入独立对话草稿，发送后交给此 Hermes 服务器：','This health summary will be placed in an independent draft and sent to this Hermes server only when you send it:')+'\n'+context.state.hermes.origin+'\n\n'+summary))return;
   await HermesChat.prepareExternalAgent(t('请根据以下有限的健康数据提供一般生活方式建议。注明数据时间与缺失信息，不作诊断、用药或急症排除判断。\n','Offer general lifestyle suggestions from this limited health data. Note dates and missing information; do not diagnose, prescribe, or rule out emergencies.\n')+summary);return;
  }
  let event;
  const compose=button.hasAttribute('data-device-compose');
  if(compose){const task=context.state.tasks.find(task=>task.id===document.querySelector('#device-calendar-task')?.value&&!task.deleted&&!task.completed&&task.scheduledAt);if(!task)return;const start=new Date(task.scheduledAt).getTime();event={title:task.title,start,end:start+task.minutes*60000};}
  const owner=context.state.me.user.id;busy=true;error='';context.render();
  try{const result=await request(compose?'calendar.compose':button.dataset.deviceRead==='health'?'health.read':'calendar.read',event);if(context.state.me?.user.id!==owner)return;if(compose){context.notify(result.status==='saved'?t('系统日历已确认保存；未建立双向同步。','System calendar confirmed saving; two-way sync is not enabled.'):result.status==='cancelled'?t('已取消日历编辑','Calendar editing cancelled'):t('已打开系统编辑器，保存结果尚未确认。','System editor opened; saving is not confirmed.'));}else if(button.dataset.deviceRead==='health')health=result;else calendar=result;}
  catch(cause){if(context.state.me?.user.id!==owner)return;error=({CANCELLED:t('已取消读取','Read cancelled'),PERMISSION_DENIED:t('系统权限未授予','System permission not granted'),HEALTH_UNAVAILABLE:t('健康服务不可用，请检查 Health Connect 或设备支持。','Health service unavailable; check Health Connect or device support.'),TIMEOUT:t('授权等待超时，请关闭系统弹窗后重试。','Authorization timed out. Close the system dialog before retrying.')})[cause.message]||t('读取未完成，请检查系统权限后重试。','Read failed. Check system permissions and retry.');}
  finally{if(context.state.me?.user.id===owner){busy=false;context.render();}}
 });
 function overview(){return `<section class="overview-health"><div class="section-head"><h2>${icon('heart-pulse')}${t('生活与健康','Life and health')}</h2><button class="text-button" data-page="health">${t('查看健康','View health')}${icon('arrow-up-right')}</button></div><p>${health?e(health.source)+' · '+e(new Date(health.to).toLocaleString(I18n.locale)):t('尚未读取手机健康数据','Device health data has not been read')}</p></section>`;}
 return {configure:c=>context=c,reset,healthPanel,calendarPanel,overview};
})();
