const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-config-browser-')),config=testConfig(dir);
 let reads={},soul='Be helpful.',jobs=[],catalogFails=false;
 let remote={memory:{memory_enabled:true,user_profile_enabled:true,memory_char_limit:2000,user_char_limit:1000},compression:{enabled:true},tts:{provider:'test',test:{voice:'sample'}},stt:{enabled:true,provider:'test'}},writes=0,installed=false,enabled=false,browser;
 const app=await createApp(config,{auth:mockAuth,hermesTransport:async(url,opts)=>{
  const path=new URL(url).pathname;
  if(opts.method==='GET')reads[path]=(reads[path]||0)+1;
  if(path==='/api/mcp/catalog'&&catalogFails)return {status:503,headers:{},text:'{}'};
  if(path==='/api/profiles/default/soul'){if(opts.method==='PUT')soul=JSON.parse(opts.body).content;return {status:200,headers:{},text:JSON.stringify({content:soul})};}
  if(path==='/api/cron/jobs'){if(opts.method==='POST')jobs.push({...JSON.parse(opts.body),id:'job-1',enabled:true});return {status:200,headers:{},text:JSON.stringify(jobs)};}
  if(path==='/api/cron/jobs/job-1/runs')return {status:200,headers:{},text:'{"runs":[]}'};
  if(path==='/api/cron/jobs/job-1'){if(opts.method==='PUT')Object.assign(jobs[0],JSON.parse(opts.body).updates);const result=jobs[0];if(opts.method==='DELETE')jobs=[];return {status:200,headers:{},text:JSON.stringify(result)};}
  if(path==='/api/mcp/catalog/install'){assert.equal(JSON.parse(opts.body).enable,false);installed=true;return {status:200,headers:{},text:'{"ok":true}'};}
  if(path==='/api/mcp/catalog')return {status:200,headers:{},text:JSON.stringify({entries:[{name:'notion',description:'Workspace connector',transport:'http',auth_type:'oauth',installed,enabled,required_env:[],needs_install:false,post_install:'OAuth required'}]})};
  let data;
  if(path==='/api/mcp/servers')data={servers:installed?[{name:'notion',enabled}]:[]};
  if(path==='/api/skills')data={skills:Array.from({length:201},(_,n)=>({name:`skill-${String(n).padStart(3,'0')}`,description:`Test entry ${n}`,enabled:n%2===0}))};
  if(path.endsWith('/notion/auth'))data={flow_id:'fixture-flow',authorization_url:'https://accounts.example.test/authorize'};
  if(path==='/api/mcp/oauth/flows/fixture-flow')data={status:'approved'};
  if(path.endsWith('/notion/test'))data={ok:true,tools:[{name:'search'}]};
  if(path.endsWith('/notion/enabled')){enabled=true;data={ok:true};}
  if(path==='/api/mcp/servers/notion'&&opts.method==='DELETE'){installed=false;data={ok:true};}
  if(data)return {status:200,headers:{},text:JSON.stringify(data)};
  if(new URL(url).pathname!=='/api/config')return mockHermes(url,opts);
  if(opts.method==='PUT'){for(const [k,v]of Object.entries(JSON.parse(opts.body).config))remote[k]={...remote[k],...v};writes++;}
  return {status:200,headers:{},text:JSON.stringify({config:remote})};
 }});
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const login=await context.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'config-user',password:'test-password'}}),session=await login.json();
  await context.request.post(config.origin+'/api/hermes/connect',{headers:{origin:config.origin,'x-csrf-token':session.csrf},data:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  await page.goto(config.origin);await page.locator('.sidebar .nav [data-page=hermes]').click();await page.locator('[data-agent-tab=memory]').click();
  const limit=page.getByLabel('记忆字符上限',{exact:true});await limit.fill('4096');const configReads=reads['/api/config'];
  await page.locator('[data-agent-tab=voice]').click();await page.locator('[data-agent-tab=memory]').click();assert.equal(await limit.inputValue(),'4096');assert.ok(reads['/api/config']<=configReads+1);
  await page.locator('[data-agent-save=memory]').click();await page.getByText('配置已保存并回读验证',{exact:true}).waitFor();assert.equal(writes,1);assert.equal(remote.memory.memory_char_limit,4096);
  await limit.fill('8192');remote.memory.user_char_limit=3000;await page.locator('[data-agent-save=memory]').click();await page.getByRole('alert').filter({hasText:'服务器配置已变化'}).waitFor();assert.equal(await limit.inputValue(),'8192');assert.equal(await page.locator('[data-agent-save=memory]').isDisabled(),true);assert.equal(writes,1);
  await page.locator('[data-agent-fetch=memory]').click();await page.waitForFunction(()=>document.querySelector('[data-agent-field=memoryLimit]')?.value==='4096');
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/agent-config-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/agent-config-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
  await page.setViewportSize({width:1440,height:1000});await page.locator('.sidebar .nav [data-page=modules]').click();await page.locator('[data-agent-install]').click();await page.getByText('待连接',{exact:true}).waitFor();assert.equal(installed,true);
  await page.locator('[data-mcp-action=authorize]').click();const link=page.getByRole('link',{name:'打开授权页面'});await link.waitFor();assert.equal(await link.getAttribute('href'),'https://accounts.example.test/authorize');
  await page.locator('[data-mcp-action=status]').click();await page.getByText('授权完成，请验证连接',{exact:true}).waitFor();await page.locator('[data-mcp-action=verify]').click();await page.locator('.capability-card>header .tag').filter({hasText:'已启用'}).waitFor();assert.equal(enabled,true);
  await page.screenshot({path:'test-results/mcp-setup.png',fullPage:true});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/mcp-setup-mobile.png',fullPage:true});
  await page.locator('[data-mcp-action=remove]').click();await page.locator('[data-agent-install]').waitFor();assert.equal(installed,false);assert.deepEqual(errors,[]);
  await page.locator('[data-library-tab=skills]').click();await page.locator('.capability-card').first().waitFor();await page.locator('[data-capability-detail] summary').first().click();assert.equal(await page.locator('[data-agent-toggle]').count(),10);
  await page.getByLabel('搜索能力',{exact:true}).fill('skill-200');await page.getByText('skill-200',{exact:true}).waitFor();assert.equal(await page.locator('[data-agent-toggle]').count(),1);
  await page.getByLabel('搜索能力',{exact:true}).fill('');await page.getByLabel('能力状态',{exact:true}).selectOption('disabled');assert.equal(await page.locator('[data-agent-toggle]').count(),10);assert.equal(await page.locator('[data-agent-toggle]:checked').count(),0);
  await page.getByRole('button',{name:'下一页',exact:true}).click();await page.getByText('skill-021',{exact:true}).waitFor();await page.screenshot({path:'test-results/capability-search-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1440,height:1000});
  const skillsReads=reads['/api/skills'];
  await page.locator('.sidebar .nav [data-page=connections]').click();await page.locator('[data-agent-resource=mcp]').waitFor();
  await page.locator('.sidebar .nav [data-page=modules]').click();await page.getByText('skill-021',{exact:true}).waitFor();assert.equal(reads['/api/skills'],skillsReads);
  const columns=await page.locator('.capability-grid').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);assert.equal(columns,2);
  await page.screenshot({path:'test-results/capability-cards-desktop.png',fullPage:true,animations:'disabled'});
  await page.locator('[data-library-tab=catalog]').click();const catalogReads=reads['/api/mcp/catalog'];await page.locator('[data-library-tab=skills]').click();await page.locator('[data-library-tab=catalog]').click();assert.equal(reads['/api/mcp/catalog'],catalogReads);
  catalogFails=true;await page.locator('[data-agent-fetch=catalog]').click();await page.getByRole('alert').first().waitFor();assert.equal(await page.locator('.capability-card').count(),1);const failedReads=reads['/api/mcp/catalog'];await page.locator('[data-library-tab=skills]').click();await page.locator('[data-library-tab=catalog]').click();assert.equal(reads['/api/mcp/catalog'],failedReads);
  catalogFails=false;await page.locator('[data-agent-fetch=catalog]').click();await page.waitForFunction(()=>!document.querySelector('[data-agent-resource=catalog] [role=alert]'));
  await page.locator('.sidebar .nav [data-page=hermes]').click();await page.locator('[data-agent-tab=memory]').click();await page.locator('[data-soul-content]').fill('A careful assistant');
  await page.locator('[data-agent-tab=voice]').click();await page.locator('[data-agent-tab=memory]').click();assert.equal(await page.locator('[data-soul-content]').inputValue(),'A careful assistant');
  await page.locator('[data-soul-save]').click();await page.waitForFunction(()=>!document.querySelector('[data-soul-save]')?.disabled);assert.equal(soul,'A careful assistant');
  await page.locator('[data-agent-tab=schedules]').click();await page.locator('[data-agent-resource=schedules] .capability-pager').waitFor();await page.locator('[data-schedule-new]').click();
  await page.locator('[data-schedule-field=name]').fill('Daily review');await page.locator('[data-schedule-field=schedule]').fill('0 9 * * *');await page.locator('[data-schedule-field=prompt]').fill('Review my tasks');
  await page.locator('[data-schedule-save]').click();await page.getByText('Daily review',{exact:true}).waitFor();assert.equal(jobs.length,1);
  await page.locator('[data-capability-detail] summary').click();await page.locator('[data-schedule-edit]').click();await page.locator('[data-schedule-field=name]').fill('Evening review');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/schedule-editor-mobile.png',fullPage:true,animations:'disabled'});
  await page.locator('[data-schedule-save]').click();await page.getByText('Evening review',{exact:true}).waitFor();assert.equal(jobs[0].name,'Evening review');
  await page.locator('[data-schedule-edit]').click();await page.locator('[data-schedule-delete]').click();await page.getByText('没有匹配结果',{exact:true}).waitFor();assert.equal(jobs.length,0);assert.deepEqual(errors,[]);
  console.log('PASS: cache reuse, stale retention, SOUL read/write, schedules CRUD;  configuration, conflict recovery, MCP install/authorize/verify/enable/remove, desktop/mobile');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
