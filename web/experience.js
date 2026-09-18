'use strict';
window.HermesExperience=(()=>{
  const scrollSelectors=['#main','.project-list','.document-list','.chat-session-drawer','.skill-review-body'];
  const reduced=()=>document.documentElement.dataset.motion==='reduce'||matchMedia('(prefers-reduced-motion: reduce)').matches;
  let previous=null;
  function capture(state){
    const root=document.querySelector('#app'),active=document.activeElement;
    const editable=active&&root?.contains(active)&&active.matches('input:not([type=password]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=hidden]),textarea,select');
    const key=JSON.stringify([state.me?.user.id,state.page,state.agentTab,state.workspaceView,Boolean(state.chatExpanded)]);
    const snapshot={key,menu:Boolean(state.menu),drawer:Boolean(state.aiDrawer),aiHidden:Boolean(state.aiHidden),expanded:Boolean(state.chatExpanded),scroll:scrollSelectors.map(selector=>[selector,document.querySelector(selector)?.scrollTop||0]),turns:[...document.querySelectorAll('[data-output]')].map(el=>el.dataset.output),completed:new Map([...document.querySelectorAll('[data-complete]')].map(el=>[el.dataset.complete,el.checked])),focus:null};
    if(editable){
      const fields=[...root.querySelectorAll('input,textarea,select')];
      snapshot.focus={index:fields.indexOf(active),tag:active.tagName,id:active.id,name:active.name,value:active.value,start:active.selectionStart,end:active.selectionEnd};
    }
    return {before:previous,dom:snapshot};
  }
  function animate(el,frames,duration=200,delay=0){if(el&&!reduced())el.animate(frames,{duration,delay,fill:'backwards',easing:'cubic-bezier(.2,.8,.2,1)'});}
  function restore(saved){
    const {before,dom}=saved,same=before?.key===dom.key;
    if(same){
      for(const [selector,top]of dom.scroll){const el=document.querySelector(selector);if(el)el.scrollTop=top;}
      const f=dom.focus,el=f&&document.querySelectorAll('#app input,#app textarea,#app select')[f.index];
      if(el&&(f.id||f.name)&&el.tagName===f.tag&&el.id===f.id&&el.name===f.name&&!el.disabled){el.focus({preventScroll:true});try{el.setSelectionRange(f.start,f.end);}catch{}}
    }else{
      animate(document.querySelector('#main'),[{opacity:.35,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],220);
      document.querySelectorAll('.overview-page .summary-item,.overview-page .recent-project').forEach((el,index)=>{
        animate(el,[{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'translateY(0)'}],280,Math.min(index,5)*35);
      });
    }
    if(!before||before.drawer!==dom.drawer||before.aiHidden!==dom.aiHidden||before.expanded!==dom.expanded){
      const el=document.querySelector('.assistant');if(el&&getComputedStyle(el).display!=='none')animate(el,[{opacity:.3,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],240);
    }
    if(before&&!before.menu&&dom.menu)animate(document.querySelector('.sidebar'),[{transform:'translateX(-20px)',opacity:.4},{transform:'translateX(0)',opacity:1}],220);
    for(const el of document.querySelectorAll('[data-complete]'))if(el.checked&&dom.completed.get(el.dataset.complete)===false)animate(el,[{transform:'scale(.85)'},{transform:'scale(1.12)'},{transform:'scale(1)'}],240);
    for(const el of document.querySelectorAll('[data-output]'))if(before&&same&&!dom.turns.includes(el.dataset.output))animate(el.closest('.chat-turn'),[{opacity:.3,transform:'translateY(6px)'},{opacity:1,transform:'translateY(0)'}],200);
    previous=dom;
  }
  return {capture,restore};
})();
