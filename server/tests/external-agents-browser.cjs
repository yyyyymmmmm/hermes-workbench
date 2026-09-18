const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes,mockGateway}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'external-ui-')),config=testConfig(dir);
 const response=data=>({status:200,text:JSON.stringify(data),headers:{}});
 const transport=async(url,...args)=>{const path=new URL(url).pathname;if(path==='/openapi.json')return response({paths:{'/api/tools/terminal/backends':{get:{}}}});if(path==='/api/tools/terminal/backends')return response({active:'local',backends:[{name:'local',status:'ready'}]});return mockHermes(url,...args);};
 const app=await createApp(config,{auth:mockAuth,hermesTransport:transport,gateway:mockGateway});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:960}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await ctx.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'external-user',password:'test-password'}}),session=await login.json();
  await ctx.request.post(config.origin+'/api/hermes/connect',{headers:{origin:config.origin,'x-csrf-token':session.csrf},data:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  await page.goto(config.origin);await page.locator('.sidebar [data-page=hermes]').click();await page.locator('[data-agent-tab=external]').click();
  await page.locator('[data-external-agent-check=codex]:enabled').waitFor();assert.equal(await page.locator('.external-agent-card').count(),3);
  mkdirSync('test-results',{recursive:true});for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/external-agents-${width}.png`});}
  await page.locator('[data-external-agent-check=codex]').click();const composer=page.locator('#live-chat-form textarea');await composer.waitFor({state:'visible'});assert.match(await composer.inputValue(),/Codex/);assert.ok(!await page.evaluate(()=>HermesChat.projectId()));
  page.once('dialog',d=>d.dismiss());await page.evaluate(()=>HermesChat.prepareExternalAgent('replacement'));assert.match(await composer.inputValue(),/Codex/);
  page.once('dialog',d=>d.accept());await page.evaluate(()=>HermesChat.prepareExternalAgent('replacement'));assert.equal(await composer.inputValue(),'replacement');
  const runs=await (await ctx.request.get(config.origin+'/api/runs')).json();assert.equal(runs.conversations.length,0);assert.deepEqual(errors,[]);
  console.log('PASS external diagnostics layout, independent draft, cancel protection, no automatic run');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
