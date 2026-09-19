const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
  const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
  const dir=mkdtempSync(join(tmpdir(),'hermes-fluent-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser;
  try{
    await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));mkdirSync('test-results',{recursive:true});
    const login=await context.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'fluent-user',password:'test-password'}}),session=await login.json();
    await context.request.post(config.origin+'/api/hermes/connect',{headers:{origin:config.origin,'x-csrf-token':session.csrf},data:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
    await page.goto(config.origin);await page.locator('.sidebar [data-page=settings]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');
    await page.locator('input[name=theme][value=fluent]').check();assert.equal(await page.locator('html').getAttribute('data-theme'),'fluent');
    await page.screenshot({path:'test-results/fluent-settings-desktop.png',animations:'disabled'});
    await page.reload();await page.locator('.sidebar').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'fluent');
    await page.locator('.sidebar [data-page=connections]').click();await page.screenshot({path:'test-results/fluent-connections-desktop.png',animations:'disabled'});
    for(const width of [390,360]){
      await page.setViewportSize({width,height:844});await page.locator('.mobile-nav [data-action=toggle-ai]').click();
      await page.locator('.chat-page').waitFor();const input=page.getByLabel('发送给 Hermes 的消息');await input.fill('Keep this draft');
      for(const theme of ['classic','fluent','dark','glass']){
        await page.evaluate(theme=>I18n.set({theme}),theme);await page.getByRole('button',{name:'打开导航',exact:true}).click();
        await page.locator('.sidebar.open').waitFor();await page.waitForTimeout(260);
        assert.equal(await page.locator('.main-shell').evaluate(el=>el.inert),true);
        const onTop=await page.locator('.sidebar [data-page=tasks]').evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});assert.equal(onTop,true);
        for(let n=0;n<22;n++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('.sidebar'))),true);}
        await page.screenshot({path:`test-results/navigation-${theme}-${width}.png`,animations:'disabled'});
        await page.keyboard.press('Escape');assert.equal(await page.locator('.main-shell').evaluate(el=>el.inert),false);assert.equal(await input.inputValue(),'Keep this draft');
        assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'menu');
        await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.locator('.nav-overlay').click({position:{x:width-10,y:200}});assert.equal(await page.locator('.sidebar').getAttribute('class'),'sidebar ');
      }
      await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.locator('.sidebar [data-page=settings]').click();await page.locator('input[name=theme][value=fluent]').check();
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`test-results/fluent-settings-${width}.png`,animations:'disabled'});
    }
    await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>!document.querySelector('.main-shell').inert);assert.equal(await page.locator('.main-shell').evaluate(el=>el.inert),false);assert.equal(await page.locator('.sidebar').evaluate(el=>el.inert),false);
    await page.locator('input[name=theme][value=classic]').check();assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');
    await page.setViewportSize({width:900,height:1000});await page.getByRole('button',{name:'切换 Hermes 面板',exact:true}).click();await page.getByRole('button',{name:'展开对话',exact:true}).click();
    const assistant=await page.locator('.assistant').boundingBox(),sidebar=await page.locator('.sidebar').boundingBox();assert.ok(assistant.x>=sidebar.x+sidebar.width);assert.ok(assistant.x+assistant.width<=901);
    await page.screenshot({path:'test-results/navigation-tablet.png',animations:'disabled'});
    assert.deepEqual(errors,[]);console.log('PASS: Fluent opt-in/persistence, desktop/mobile layout, navigation above chat, inert background, focus trap, Escape/backdrop, drafts and resize');
  }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
