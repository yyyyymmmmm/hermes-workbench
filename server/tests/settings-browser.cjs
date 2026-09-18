const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-settings-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));mkdirSync('test-results',{recursive:true});
  await page.goto(config.origin);await page.getByLabel('账号',{exact:true}).fill('theme-user');await page.getByLabel('密码',{exact:true}).fill('test-password');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'你好，theme-user'}).waitFor();
  await page.locator('.sidebar .nav [data-page=account]').click();
  await page.locator('[data-action=rename-device]').click();await page.locator('#device-name-form [name=device]').fill('Personal laptop');await page.locator('#device-name-form [type=submit]').click();await page.locator('.device strong').filter({hasText:'Personal laptop'}).waitFor();
  for(const width of [1440,390,360]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/account-${width}.png`,fullPage:true,animations:'disabled'});}
  await page.setViewportSize({width:1440,height:1000});await page.locator('.sidebar [data-page=settings]').click();
  for(const theme of ['classic','minimal','dark','blue','red','pink']){await page.locator(`input[name=theme][value=${theme}]`).check();assert.equal(await page.locator('html').getAttribute('data-theme'),theme);await page.screenshot({path:`test-results/theme-${theme}.png`,fullPage:true,animations:'disabled'});}
  await page.locator('input[name=theme][value=classic]').check();for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/classic-${width}.png`,fullPage:true,animations:'disabled'});}await page.setViewportSize({width:1440,height:1000});
  await page.locator('#reduce-motion').check();await page.locator('#display-language').selectOption('en');await page.waitForLoadState('load');await page.getByRole('heading',{name:'Hello, theme-user'}).waitFor();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  const untranslated=[];
  for(const name of ['home','tasks','calendar','workspace','hermes','runs','health','connections','modules','account','settings']){
   await page.locator(`.sidebar .nav button[data-page=${name}]`).click();
   const text=await page.locator('#app').innerText();const lines=text.split('\n').filter(s=>/[\u3400-\u9fff]/.test(s)&&!(name==='account'&&s==='我的电脑'));if(lines.length)untranslated.push({name,lines});
  }
  assert.deepEqual(untranslated,[]);
  await page.locator('.sidebar .nav [data-page=tasks]').click();await page.getByRole('button',{name:'New task',exact:true}).click();await page.getByLabel('Task title',{exact:true}).fill('日历里的用户原文');await page.getByRole('button',{name:'Save',exact:true}).click();await page.locator('.task strong').filter({hasText:'日历里的用户原文'}).waitFor();
  await page.locator('.sidebar .nav [data-page=settings]').click();
  await page.locator('input[name=theme][value=dark]').check();await page.screenshot({path:'test-results/settings-english-dark.png',fullPage:true,animations:'disabled'});
  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`test-results/settings-english-${width}.png`,fullPage:true,animations:'disabled'});}
  assert.deepEqual(errors,[]);console.log('PASS: six themes, persisted language, English across all pages, motion, desktop/mobile');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
