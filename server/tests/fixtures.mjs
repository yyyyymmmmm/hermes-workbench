export const mockAuth = {
  async register() { return { registered: true }; },
  async login(username, password) {
    if (password !== 'test-password') { const { Fault } = await import('../core.mjs'); throw new Fault(401, 'INVALID_CREDENTIALS', 'Invalid credentials'); }
    return { username, name: username };
  }
};
export function modelFixture(){
  let model='fixture-model-a';const writes=[];
  const transport=async(url,options={})=>{
    if(new URL(url).pathname==='/api/model/set'&&options.headers?.cookie?.includes('gateway=secret-cookie')){const body=JSON.parse(options.body);writes.push(body);model=body.model;return {status:200,text:JSON.stringify({ok:true}),headers:{}};}
    const response=await mockHermes(url,options);
    if(new URL(url).pathname==='/api/model/options'&&response.status===200){const data=JSON.parse(response.text);data.current.model=model;response.text=JSON.stringify(data);}
    return response;
  };
  return {transport,writes};
}
export function skillFixture(){
  const id='official/productivity/release-plan',name='release-plan',state={installed:false,unsafe:false,changed:false,unverified:false,writes:0};
  const transport=async(url,options={})=>{
    const path=new URL(url).pathname;
    if(!options.headers?.cookie?.includes('gateway=secret-cookie'))return mockHermes(url,options);
    const result=data=>({status:200,text:JSON.stringify(data),headers:{}});
    const item={identifier:id,name,description:'Release preparation checklist',source:'official'};
    if(path==='/api/skills/hub/sources')return result({featured:[item],installed:state.installed&&!state.unverified?{[id]:{name}}:{}});
    if(path==='/api/skills/hub/search')return result({results:[item]});
    if(path==='/api/skills/hub/preview')return result({...item,skill_md:'# Release plan\n\nReview changes before publishing.'+(state.changed?' Updated.':''),files:['SKILL.md']});
    if(path==='/api/skills/hub/scan')return result({...item,verdict:state.unsafe?'dangerous':'safe',policy:'allow',summary:'Fixture scan',findings:state.unsafe?[{severity:'critical',file:'SKILL.md',line:1,description:'Unsafe instruction'}]:[]});
    if(path==='/api/skills/hub/install'){state.writes++;state.installed=true;return result({ok:true});}
    if(path==='/api/skills')return result({skills:state.installed?[{name,enabled:true}]:[]});
    return mockHermes(url,options);
  };
  return {transport,state,id};
}
export async function mockHermes(url, options = {}) {
  const path = new URL(url).pathname;
  const result = (data, status = 200, headers = {}) => ({ status, text: JSON.stringify(data), headers });
  if (path === '/api/status') return result({ auth_required: true });
  if (path === '/api/auth/providers') return result({ providers: [{ name: 'basic', supports_password: true }] });
  if (path === '/auth/password-login') {
    const data = JSON.parse(options.body);
    if (data.password !== 'hermes-test-password') return result({}, 401);
    return result({ ok: true }, 200, { 'set-cookie': ['gateway=secret-cookie; Path=/; HttpOnly; Secure'] });
  }
  if (!options.headers?.cookie?.includes('gateway=secret-cookie')) return result({}, 401);
  if (path === '/api/auth/me') return result({ authenticated: true, username: 'remote-user' });
  if (path === '/api/auth/ws-ticket') return result({ ticket: 'fixture-ticket' });
  if (path === '/api/model/options') return result({ providers: [{ slug: 'test-provider', name: 'Fixture Provider', authenticated: true, models: ['fixture-model-a', { id: 'fixture-model-b', reasoning_options: ['low', 'high'] }] }], current: { model: 'fixture-model-a', provider: 'test-provider' } });
  if (path === '/auth/logout') return result({ ok: true }, 302, { 'set-cookie': ['gateway=; Path=/; Max-Age=0; HttpOnly; Secure'] });
  return result({}, 404);
}
export function testConfig(dataDir, origin = 'http://127.0.0.1:4317') {
  return { dataDir, origin, host: '127.0.0.1', port: 0, secure: false, ttl: 28800,
    appId: '10016', secret: 'fixture-secret', authUrl: 'https://auth.example.test/api.php', tolerance: 300, privateHosts: [] };
}
export async function mockGateway(_ticket, _hosts, receive, closed) {
  let runtime='fixture-runtime', ended=false, timer;
  const emit=(type,payload={})=>{if(!ended)receive({jsonrpc:'2.0',method:'event',params:{type,session_id:runtime,payload}});};
  const complete=()=>{emit('message.delta',{text:'真实协议测试回复'});emit('message.complete',{text:'真实协议测试回复',status:'complete'});};
  return {
    async rpc(method,params) {
      if(method==='session.create'||method==='session.resume')return {session_id:runtime,stored_session_id:'fixture-stored',running:false};
      if(method==='session.status')return {running:false};
      if(method==='prompt.submit') {
        timer=setTimeout(()=>{
          emit('message.start');
          if(params.text==='disconnect'){closed();return;}
          if(params.text==='hold')return;
          if(params.text==='approval'){receive({jsonrpc:'2.0',id:'approval-1',method:'approval',params:{session_id:runtime,title:'Test command',command:'echo test',choices:[{label:'仅本次允许',value:'once'},{label:'拒绝',value:'deny'}]}});return;}
          complete();
        },80);return {accepted:true};
      }
      if(method==='session.interrupt'){clearTimeout(timer);emit('message.start');emit('message.complete',{text:'',status:'interrupted'});return {ok:true};}
      return {ok:true};
    },
    async respond(){complete();},
    close(){ended=true;clearTimeout(timer);}
  };
}
