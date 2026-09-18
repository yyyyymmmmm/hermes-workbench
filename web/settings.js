'use strict';
window.HermesSettings=(()=>{
  const e=v=>window.HermesViews.esc(v),i=n=>window.HermesViews.icon(n);
  function panel(){const p=I18n.prefs;return `<div class="page-header"><h1>设置</h1></div><div class="preferences"><section><h2>外观</h2><div class="theme-options" role="radiogroup" aria-label="主题">${[['minimal','极简白'],['dark','夜间'],['blue','腾讯蓝'],['red','网易红'],['pink','哔哩粉']].map(([id,name])=>`<label class="theme-option"><input type="radio" name="theme" value="${id}" ${p.theme===id?'checked':''}><span class="theme-swatch swatch-${id}" aria-hidden="true">${i('check')}</span><span>${e(name)}</span></label>`).join('')}</div></section><section><h2>语言与地区</h2><label class="preference-row"><span>显示语言</span><select id="display-language"><option value="zh-CN" ${p.locale==='zh-CN'?'selected':''}>简体中文</option><option value="en" ${p.locale==='en'?'selected':''}>English</option></select></label><div class="preference-row"><span>时区</span><span>${e(Intl.DateTimeFormat().resolvedOptions().timeZone)}</span></div></section><section><h2>辅助功能</h2><label class="preference-row"><span>减少动画</span><input type="checkbox" id="reduce-motion" ${p.motion==='reduce'?'checked':''}></label></section><section><h2>应用</h2><div class="preference-row"><span>版本</span><span>0.1 · Preview</span></div><div class="preference-row"><span>设备偏好</span><span>外观与语言保存在当前设备</span></div></section></div>`;}
  document.addEventListener('change',event=>{const el=event.target;if(el.matches('input[name=theme]'))I18n.set({theme:el.value});if(el.id==='reduce-motion')I18n.set({motion:el.checked?'reduce':'system'});if(el.id==='display-language'){
    if((window.HermesDocuments?.dirty()||window.HermesChat?.hasDraft())&&!confirm(I18n.t('切换语言需要重新载入。未保存的文档和消息将丢失，确认继续？'))){el.value=I18n.locale;return;}
    I18n.set({locale:el.value});
  }});
  return {panel};
})();
