'use strict';
window.I18n=(()=>{
  const key='hermes.appearance.v1',themes=['classic','minimal','dark','blue','red','pink','fluent'];
  let reloading=false,prefs={theme:'classic',locale:'zh-CN',motion:'system'};
  try{const saved=JSON.parse(localStorage.getItem(key)||'{}');if(themes.includes(saved.theme))prefs.theme=saved.theme;if(['zh-CN','en'].includes(saved.locale))prefs.locale=saved.locale;if(['system','reduce'].includes(saved.motion))prefs.motion=saved.motion;}catch{}
  function apply(){document.documentElement.dataset.theme=prefs.theme;document.documentElement.lang=prefs.locale;document.documentElement.dataset.motion=prefs.motion;document.documentElement.style.colorScheme=prefs.theme==='dark'?'dark':'light';}
  function t(value){if(prefs.locale!=='en')return value;const catalog=window.HermesEnglish||{};if(catalog[value]!==undefined)return catalog[value];if(catalog[value.trim()]!==undefined)return value.replace(value.trim(),catalog[value.trim()]);return value.replace(/[\u3400-\u9fff][\u3400-\u9fff，。！？；：、（）…· ]*/g,part=>catalog[part]??catalog[part.trim()]??part);}
  function html(parts,...values){return parts.reduce((s,part,index)=>s+(prefs.locale==='en'?part.replace(/[\u3400-\u9fff][\u3400-\u9fff，。！？；：、（）…· ]*/g,t):part)+(index<values.length?values[index]:''),'');}
  function set(patch){const next={...prefs,...patch};if(!themes.includes(next.theme)||!['zh-CN','en'].includes(next.locale)||!['system','reduce'].includes(next.motion))return;const changed=next.locale!==prefs.locale;prefs=next;try{localStorage.setItem(key,JSON.stringify(prefs));}catch{}apply();if(changed){reloading=true;location.reload();}}
  apply();
  window.addEventListener('storage',event=>{if(event.key===key){try{const next=JSON.parse(event.newValue);if(themes.includes(next?.theme)){prefs.theme=next.theme;prefs.motion=next.motion==='reduce'?'reduce':'system';apply();}}catch{}}});
  return {t,html,set,get reloading(){return reloading;},get prefs(){return {...prefs};},get locale(){return prefs.locale;}};
})();
