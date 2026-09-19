const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
  const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
  const dir=mkdtempSync(join(tmpdir(),'hermes-glass-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser;
  try{
    await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
    browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));mkdirSync('test-results',{recursive:true});
    await page.context().request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'glass-user',password:'test-password'}});
    await page.goto(config.origin);await page.locator('.sidebar [data-page=settings]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');await page.locator('input[name=theme][value=glass]').check();
    await page.screenshot({path:'test-results/glass-settings-desktop.png',animations:'disabled'});
    await page.reload();await page.locator('.sidebar').waitFor();assert.equal(await page.locator('html').getAttribute('data-theme'),'glass');
    assert.match(await page.locator('.sidebar').evaluate(el=>getComputedStyle(el).backdropFilter),/blur/);
    await page.waitForFunction(()=>document.querySelectorAll('[data-liquid-surface]').length>0);
    assert.ok(await page.locator('[data-liquid-defs] filter').count()<=6);
    const lens=page.locator('.global-search');
    assert.match(await lens.evaluate(el=>el.style.backdropFilter),/url\(/);
    // Exercise the rendered lens with a structured backdrop, not only a CSS string.
    await page.evaluate(()=>{document.querySelector('.topbar').style.backgroundImage='repeating-linear-gradient(90deg,#c1d9e7 0 9px,#fafafa 9px 18px)';});
    const refracted=await lens.screenshot();
    await lens.evaluate(el=>{el.style.backdropFilter='none';});
    const flat=await lens.screenshot();assert.notDeepEqual(refracted,flat);
    await page.reload();await page.waitForFunction(()=>document.querySelectorAll('[data-liquid-surface]').length>0);
    await page.emulateMedia({forcedColors:'active'});await page.waitForFunction(()=>!document.querySelector('[data-liquid-defs]'));
    await page.emulateMedia({forcedColors:'none'});await page.waitForFunction(()=>document.querySelectorAll('[data-liquid-surface]').length>0);
    await page.locator('.sidebar [data-page=connections]').click();const card=page.locator('.capability-card').first();await card.hover();
    await page.waitForTimeout(260);assert.notEqual(await card.evaluate(el=>getComputedStyle(el).transform),'none');
    await page.mouse.move(0,0);await page.screenshot({path:'test-results/glass-connections-desktop.png',animations:'disabled'});
    await page.evaluate(()=>I18n.set({motion:'reduce'}));await card.hover();assert.equal(await card.evaluate(el=>getComputedStyle(el).transform),'none');
    assert.equal(await card.evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await page.evaluate(()=>I18n.set({motion:'system'}));await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await card.evaluate(el=>getComputedStyle(el).transform),'none');await page.emulateMedia({reducedMotion:'no-preference'});
    for(const width of [390,360]){
      await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.equal(await page.locator('.capability-grid').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),1);
      await page.screenshot({path:`test-results/glass-connections-${width}.png`,animations:'disabled'});
      await page.locator('.mobile-nav [data-action=toggle-ai]').click();await page.locator('.chat-page').waitFor();
      await page.getByRole('button',{name:'打开导航',exact:true}).click();await page.waitForTimeout(260);
      assert.equal(await page.locator('.sidebar [data-page=settings]').evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));}),true);
      await page.locator('.sidebar [data-page=connections]').click();
    }
    await page.setViewportSize({width:1440,height:1000});await page.locator('.sidebar [data-page=settings]').click();await page.locator('input[name=theme][value=fluent]').check();
    await page.waitForFunction(()=>!document.querySelector('[data-liquid-defs]'));
    assert.equal(await page.locator('[data-liquid-surface]').count(),0);
    assert.equal(await page.locator('.shell').evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    await page.locator('input[name=theme][value=classic]').check();assert.equal(await page.locator('html').getAttribute('data-theme'),'classic');assert.deepEqual(errors,[]);
    const fallback=await browser.newPage({userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'});
    await fallback.addInitScript(()=>localStorage.setItem('hermes.appearance.v1',JSON.stringify({theme:'glass'})));
    await fallback.context().request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'glass-fallback',password:'test-password'}});
    await fallback.goto(config.origin);await fallback.locator('.sidebar').waitFor();
    assert.equal(await fallback.locator('[data-liquid-defs]').count(),0);
    assert.match(await fallback.locator('.global-search').evaluate(el=>getComputedStyle(el).backdropFilter),/blur/);await fallback.close();
    console.log('PASS: glass pixels, bounded filters, fallback gate, forced colors, persistence, motion, mobile navigation and theme cleanup');
  }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
