export function gatewayPool(open,{idleMs=30000}={}){
 const entries=new Map();
 function drop(key,entry){clearTimeout(entry.timer);if(entries.get(key)===entry)entries.delete(key);entry.dead=true;entry.client?.close();}
 return {
  async acquire(key,ticket,receive,closed){
   let entry=entries.get(key),reused=Boolean(entry&&!entry.busy&&!entry.dead);
   if(entry?.busy)throw new Error('Gateway already leased');
   if(!reused){
    entry={busy:true,receive,closed,dead:false};entries.set(key,entry);
    try{entry.client=await open(await ticket(),frame=>entry.receive?.(frame),()=>{const notify=entry.closed;drop(key,entry);notify?.();});if(entry.dead)throw new Error('Gateway closed');}
    catch(error){drop(key,entry);throw error;}
   }else{clearTimeout(entry.timer);entry.busy=true;entry.receive=receive;entry.closed=closed;}
   let released=false;
   return {reused,rpc:(...args)=>entry.client.rpc(...args),respond:(...args)=>entry.client.respond(...args),close({reuse=false}={}){
    if(released)return;released=true;entry.receive=null;entry.closed=null;entry.busy=false;
    if(!reuse||entry.dead){drop(key,entry);return;}
    entry.timer=setTimeout(()=>drop(key,entry),idleMs);entry.timer.unref?.();
   }};
  },
  close(){for(const [key,entry] of entries)drop(key,entry);}
 };
}
