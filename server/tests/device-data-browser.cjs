const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');const dir=mkdtempSync(join(tmpdir(),'device-data-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.nativeCalls=[];window.HermesNative={postMessage:message=>window.nativeCalls.push(JSON.parse(message))};});
  const login=await ctx.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'device-user',password:'test-password'}}),session=await login.json();
  await ctx.request.post(config.origin+'/api/hermes/connect',{headers:{origin:config.origin,'x-csrf-token':session.csrf},data:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  await page.goto(config.origin);await page.locator('.sidebar .nav [data-page=health]').click();assert.equal(await page.evaluate(()=>nativeCalls.length),0);
  await page.locator('[data-device-all]').click();await page.locator('[data-device-read=health]').click();assert.equal(await page.evaluate(()=>nativeCalls[0].metrics.length),6);
  await page.evaluate(()=>HermesNative.onmessage({data:JSON.stringify({id:nativeCalls[0].id,source:'Fixture Health',from:new Date().toISOString(),to:new Date().toISOString(),metrics:[{key:'steps',value:1234,unit:'count',status:'available',at:new Date().toISOString()},{key:'weight',status:'no_data'}]})}));
  await page.locator('.health-stat strong').filter({hasText:'1234'}).waitFor();
  page.on('dialog',dialog=>dialog.accept());await page.locator('[data-device-share]').click();assert.match(await page.locator('#live-chat-form textarea').inputValue(),/1234/);
  assert.equal((await (await ctx.request.get(config.origin+'/api/runs')).json()).conversations.length,0);
  await page.locator('.sidebar .nav [data-page=calendar]').click();await page.locator('[data-device-read=calendar]').click();
  await page.evaluate(()=>HermesNative.onmessage({data:JSON.stringify({id:nativeCalls[1].id,source:'Fixture Calendar',events:[{title:'<script>alert(1)</script>',start:Date.now(),end:Date.now()+3600000,allDay:false}]})}));
  assert.ok((await page.locator('.device-data').innerText()).includes('<script>alert(1)</script>'));
  await page.locator('.sidebar .nav [data-page=health]').click();mkdirSync('test-results',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/device-data-${width}.png`});}
  await page.locator('[data-device-clear]').click();assert.equal(await page.locator('.health-stat').count(),0);assert.deepEqual(errors,[]);
  console.log('PASS explicit native request, selected metrics, empty data, safe rendering, draft-only sharing, clear and responsive layouts');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
