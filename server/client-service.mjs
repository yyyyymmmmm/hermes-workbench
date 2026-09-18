export function clientService(env={...process.env,WORKBENCH_SERVICE_ORIGIN:process.env.WORKBENCH_SERVICE_ORIGIN||'https://hermes.didichou.site'}){
 const value=(env.WORKBENCH_SERVICE_ORIGIN||'').trim();
 if(!value){if(env.WORKBENCH_RELEASE==='true')throw new Error('Official releases require WORKBENCH_SERVICE_ORIGIN');return {origin:'',mode:'preview'};}
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash||['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Official service must be an HTTPS origin without credentials, path or query');
 return {origin:url.origin,mode:'hosted'};
}
