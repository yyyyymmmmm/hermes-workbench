const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');const dir=fs.mkdtempSync(join(tmpdir(),'bundle-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser,cookie='';
 try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
  await page.exposeBinding('nativeRequest',async(_,message)=>{
   requests.push(message.path);const result=await app.inject({url:message.path,method:message.method,headers:{...message.headers,origin:config.origin,...(cookie?{cookie}:{})},...(message.body?{payload:message.body}:{})});
   if(result.headers['set-cookie'])cookie=[result.headers['set-cookie']].flat().map(s=>s.split(';')[0]).join('; ');
   return {id:message.id,status:result.statusCode,contentType:result.headers['content-type'],body:Buffer.from(result.rawPayload).toString('base64')};
  });
  await page.addInitScript(()=>{window.HermesHTTP={postMessage:async message=>{const result=await window.nativeRequest(JSON.parse(message));window.HermesHTTP.onmessage({data:JSON.stringify(result)});}};});
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url());assert.equal(url.origin,'https://appassets.androidplatform.net');assert.ok(!url.pathname.startsWith('/api/'),'API must use native transport');
   const file=join(__dirname,'../../mobile/www',url.pathname==='/'?'index.html':url.pathname.slice(1));
   const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.jpg')?'image/jpeg':'text/html';
   await route.fulfill({body:fs.readFileSync(file),contentType:type});
  });
  await page.goto('https://appassets.androidplatform.net/');await page.getByLabel('账号',{exact:true}).fill('bundled-user');await page.getByLabel('密码',{exact:true}).fill('test-password');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('heading',{name:'你好，bundled-user'}).waitFor();assert.ok(requests.includes('/api/auth/login'));
  await page.evaluate(()=>{state.page='tasks';render();});await page.getByRole('button',{name:'新建任务',exact:true}).click();await page.getByLabel('任务名称',{exact:true}).fill('Bundled task');await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.task strong').filter({hasText:'Bundled task'}).waitFor();
  assert.equal(await page.evaluate(()=>document.cookie),'');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.evaluate(()=>{state.page='health';render();});await page.getByRole('heading',{name:'生活与健康'}).waitFor();assert.equal(await page.locator('[data-device-read=health]').isDisabled(),true);
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/mobile-bundled-ui.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS bundled assets only, native API adapter, login, task write, inaccessible cookies and mobile rendering');
 }finally{await browser?.close();await app.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
