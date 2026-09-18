'use strict';
(()=>{
 const pending=new Map();
 const streams=new Map();
 function sendNative(message){if(window.HermesHTTP){window.HermesHTTP.onmessage=event=>receive(event.data);window.HermesHTTP.postMessage(JSON.stringify(message));}else if(window.webkit?.messageHandlers?.workspaceHTTP)window.webkit.messageHandlers.workspaceHTTP.postMessage(message);else throw new Error('Native connection unavailable');}
 if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=[...b].map(v=>v.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;};
 function receive(raw){let value=raw;if(typeof raw==='string'){try{value=JSON.parse(raw);}catch{return;}}if(streams.has(value?.id)){streams.get(value.id).receive(value);return;}const p=pending.get(value?.id);if(!p)return;pending.delete(value.id);p.clean();value.error?p.reject(new TypeError(value.error)):p.resolve(new Response([204,205,304].includes(value.status)?null:Uint8Array.from(atob(value.body||''),c=>c.charCodeAt(0)),{status:value.status,headers:{'content-type':value.contentType||'application/json'}}));}
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
  constructor(value){
   const url=new URL(value,location.href);
   if(url.protocol!==location.protocol||url.host!==location.host||!/^\/api\/runs\/[a-f0-9-]{36}\/events$/i.test(url.pathname))throw new TypeError('Invalid event stream');
   this.url=url;this.cursor=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(this.cursor)||this.cursor<0)throw new TypeError('Invalid cursor');this.closed=false;this.readyState=0;this.retries=0;this.timer=setTimeout(()=>this.connect(),0);
  }
  connect(){
   if(this.closed)return;this.id=crypto.randomUUID();this.buffer='';this.decoder=new TextDecoder();streams.set(this.id,this);
   try{sendNative({id:this.id,path:this.url.pathname+'?after='+this.cursor,method:'GET',headers:{},body:'',stream:true});}
   catch{this.retry();}
  }
  receive(value){
   if(this.closed)return;
   if(value.error||value.done){this.retry();return;}
   if(value.status===200){this.readyState=1;this.retries=0;this.onopen?.({});}
   if(!value.body)return;
   try{
    this.buffer+=this.decoder.decode(Uint8Array.from(atob(value.body),c=>c.charCodeAt(0)),{stream:true});
    if(this.buffer.length>1024*1024)throw new Error('Event buffer limit');
    let index;while((index=this.buffer.indexOf('\n\n'))>=0){
     const frame=this.buffer.slice(0,index);this.buffer=this.buffer.slice(index+2);
     const data=frame.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');
     if(!data)continue;const event=JSON.parse(data);
     if(Number.isSafeInteger(event.seq)&&event.seq>this.cursor){this.cursor=event.seq;this.onmessage?.({data:JSON.stringify(event),lastEventId:String(event.seq)});}
     if(this.closed)return;
    }
   }catch{this.retry();}
  }
  retry(){
   if(this.closed)return;streams.delete(this.id);try{sendNative({id:this.id,cancel:true});}catch{}
   this.readyState=0;this.onerror?.({});clearTimeout(this.timer);this.timer=setTimeout(()=>this.connect(),Math.min(30000,1000*2**this.retries++));
  }
  close(){this.closed=true;this.readyState=2;clearTimeout(this.timer);streams.delete(this.id);if(this.id)try{sendNative({id:this.id,cancel:true});}catch{}}
 };
})();
