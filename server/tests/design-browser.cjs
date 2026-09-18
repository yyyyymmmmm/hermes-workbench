const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),{randomUUID}=require('node:crypto');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-design-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await context.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'Alex',password:'test-password'}}),session=await login.json(),headers={origin:config.origin,'x-csrf-token':session.csrf};
  const id=randomUUID();assert.equal((await context.request.post(config.origin+'/api/projects',{headers,data:{id,version:0,name:'September release',description:'Design review and release preparation',archived:false}})).ok(),true);
  await page.goto(config.origin);await page.locator('.recent-project').waitFor();await page.locator('.overview-health [data-page=health]').click();await page.locator('.health-stats').waitFor();assert.ok((await page.locator('#main').innerText()).includes('尚未授权健康数据'));await page.locator('.sidebar button[data-page=home]').click();mkdirSync('test-results',{recursive:true});
  for(const width of [1600,1440,1100,900,390,360]){await page.setViewportSize({width,height:900});await page.waitForTimeout(260);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const box=await page.locator('.overview-heading').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);await page.screenshot({path:`test-results/design-home-${width}.png`});}
  await page.setViewportSize({width:1440,height:1000});await page.locator('.recent-project').click();await page.locator('.project-detail h2').filter({hasText:'September release'}).waitFor();
  await page.waitForTimeout(300);const search=page.getByLabel('搜索项目');await search.fill('Sept');assert.equal(await search.inputValue(),'Sept');assert.equal(await search.evaluate(el=>el===document.activeElement),true);
  assert.equal(await page.evaluate(()=>document.querySelector('#main').getAnimations().length),0);
  await page.locator('.sidebar [data-page=settings]').click();await page.screenshot({path:'test-results/design-settings.png'});
  await page.locator('.sidebar button[data-page=home]').click();
  assert.equal(await page.locator('.summary-item').count(),4);
  assert.equal(await page.locator('.recent-project progress').getAttribute('value'),'0');
  await page.waitForTimeout(550);
  assert.equal(await page.locator('.summary-item').first().evaluate(el=>getComputedStyle(el).borderRadius),'8px');
  await page.locator('.summary-item').first().hover();await page.waitForTimeout(220);
  assert.notEqual(await page.locator('.summary-item').first().evaluate(el=>getComputedStyle(el).transform),'none');
  await page.mouse.move(0,0);
  await page.evaluate(()=>I18n.set({motion:'reduce'}));await page.locator('.sidebar [data-page=settings]').click();await page.locator('.sidebar button[data-page=home]').click();assert.equal(await page.evaluate(()=>document.querySelector('#main').getAnimations({subtree:true}).length),0);
  for(const theme of ['minimal','dark','blue','red','pink']){await page.evaluate(theme=>I18n.set({theme}),theme);await page.screenshot({path:`test-results/design-theme-${theme}.png`});}
  assert.deepEqual(errors,[]);console.log('PASS: real homepage projects, responsive layout, search focus, transition lifecycle, reduced motion and five themes');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
