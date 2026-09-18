'use strict';
(()=>{
 const pending=new Map();
 if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
 function receive(raw){let value=raw;if(typeof raw==='string'){try{value=JSON.parse(raw);}catch{return;}}const p=pending.get(value?.id);if(!p)return;pending.delete(value.id);p.clean();value.error?p.reject(new TypeError(value.error)):p.resolve(new Response(Uint8Array.from(atob(value.body||''),c=>c.charCodeAt(0)),{status:value.status,headers:{'content-type':value.contentType||'application/json'}}));}
 window.addEventListener('hermes-http-result',event=>receive(event.detail));
 window.fetch=(input,options={})=>new Promise((resolve,reject)=>{
  const url=new URL(typeof input==='string'?input:input.url,location.href);
  if(url.protocol!==location.protocol||url.host!==location.host||!url.pathname.startsWith('/api/')||url.username||url.password||url.hash){reject(new TypeError('Only workspace API requests are allowed'));return;}
  const body=options.body||'';if(typeof body!=='string'||body.length>524288){reject(new TypeError('Unsupported request body'));return;}
  if(pending.size>=16){reject(new TypeError('Too many requests'));return;}
  const id=crypto.randomUUID(),signal=options.signal;
  const abort=()=>{pending.delete(id);clean();reject(new DOMException('Request cancelled; remote mutation may still complete','AbortError'));};
  const timer=setTimeout(abort,90000),clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});
  pending.set(id,{resolve,reject,clean});
  const message={id,path:url.pathname+url.search,method:options.method||'GET',headers:Object.fromEntries(new Headers(options.headers||{})),body};
  try{if(window.HermesHTTP){window.HermesHTTP.onmessage=event=>receive(event.data);window.HermesHTTP.postMessage(JSON.stringify(message));}else if(window.webkit?.messageHandlers?.workspaceHTTP){window.webkit.messageHandlers.workspaceHTTP.postMessage(message);}else{throw new Error('Native connection unavailable');}}catch(error){pending.delete(id);clean();reject(error);}
 });
 window.EventSource=class {
  constructor(value){this.closed=false;this.url=new URL(value,location.href);this.cursor=Number(this.url.searchParams.get('after')||0);this.controller=new AbortController();this.readyState=0;this.timer=setTimeout(()=>this.poll(),0);}
  async poll(){if(this.closed)return;try{
   const path=this.url.pathname.replace(/\/events$/,'/event-batch')+'?after='+this.cursor;
   const response=await fetch(path,{signal:this.controller.signal});if(!response.ok)throw new Error('Event connection failed');
   const value=await response.json();this.readyState=1;
   for(const event of value.events){if(this.closed)return;if(event.seq>this.cursor){this.cursor=event.seq;this.onmessage?.({data:JSON.stringify(event),lastEventId:String(event.seq)});}}
   if(!this.closed)this.timer=setTimeout(()=>this.poll(),value.events.length>=100?100:1000);
  }catch(error){if(!this.closed){this.readyState=0;this.onerror?.(error);if(!this.closed)this.timer=setTimeout(()=>this.poll(),5000);}}}
  close(){this.closed=true;this.readyState=2;clearTimeout(this.timer);this.controller.abort();}
 };
})();
