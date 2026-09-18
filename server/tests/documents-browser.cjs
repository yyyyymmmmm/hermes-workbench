const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const {mkdtempSync,mkdirSync,rmSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
(async()=>{
  const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes,mockGateway}=await import('./fixtures.mjs');
  const dir=mkdtempSync(join(tmpdir(),'hermes-doc-browser-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway:mockGateway});
  let browser;
  try{
    await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
    browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));mkdirSync('test-results',{recursive:true});
    const go=async p=>{if(p.viewportSize().width<=760)await p.getByRole('button',{name:'打开导航',exact:true}).click();await p.locator('.sidebar [data-page=workspace]').click();await p.locator('[data-workspace-view=documents]').click();};
    const saved=async(p,version)=>p.locator('#document-save-state').filter({hasText:`已保存 · v${version}`}).waitFor();
    await page.goto(config.origin);await page.getByLabel('账号',{exact:true}).fill('doc-user');await page.getByLabel('密码',{exact:true}).fill('test-password');await page.getByRole('button',{name:'登录',exact:true}).click();
    await page.getByRole('heading',{name:'你好，doc-user'}).waitFor();await go(page);
    await page.locator('.page-header [data-doc-action=new]').click();await page.getByLabel('文档名称',{exact:true}).fill('项目计划.md');
    await page.getByLabel('文档内容',{exact:true}).fill('# 产品计划\n\n- 完成工作空间\n- 对接 Hermes\n\n**版本一**');
    let failedReply=false;
    await page.route('**/api/documents',async route=>{if(route.request().method()==='POST'&&!failedReply){failedReply=true;await route.fetch();await route.abort('failed');}else await route.continue();});
    await page.getByRole('button',{name:'保存文档',exact:true}).click();
    await page.locator('#notice').filter({hasText:'网络连接中断'}).waitFor();
    assert.ok((await page.getByLabel('文档内容',{exact:true}).inputValue()).includes('版本一'));
    await page.getByRole('button',{name:'保存文档',exact:true}).click();await saved(page,1);
    await page.unroute('**/api/documents');
    await page.getByRole('button',{name:'预览',exact:true}).click();await page.locator('.document-inline-preview h1').filter({hasText:'产品计划'}).waitFor();
    await page.screenshot({path:'test-results/documents-desktop.png',fullPage:true});
    await page.getByRole('button',{name:'编辑',exact:true}).click();
    const second=await context.newPage();second.on('pageerror',error=>errors.push(error.message));await second.goto(config.origin);await second.getByRole('heading',{name:'你好，doc-user'}).waitFor();await go(second);await second.locator('[data-doc-open]').click();
    await second.getByLabel('文档内容',{exact:true}).fill('# 来自第二个窗口');await second.getByRole('button',{name:'保存文档',exact:true}).click();await saved(second,2);
    await page.getByLabel('文档内容',{exact:true}).fill('# 不应被覆盖的本地草稿');await page.getByRole('button',{name:'保存文档',exact:true}).click();await page.locator('.document-conflict').waitFor();
    assert.equal(await page.getByLabel('文档内容',{exact:true}).inputValue(),'# 不应被覆盖的本地草稿');
    await page.getByRole('button',{name:'查看服务器版本',exact:true}).click();await page.locator('#document-preview h1').filter({hasText:'来自第二个窗口'}).waitFor();await page.getByRole('button',{name:'关闭预览',exact:true}).click();
    await page.screenshot({path:'test-results/documents-conflict.png',fullPage:true});
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'载入服务器版本',exact:true}).click();await saved(page,2);
    await page.getByRole('button',{name:'版本',exact:true}).click();await page.getByRole('button',{name:'载入版本 1',exact:true}).click();
    assert.ok((await page.getByLabel('文档内容',{exact:true}).inputValue()).includes('版本一'));await page.getByRole('button',{name:'保存文档',exact:true}).click();await saved(page,3);
    await page.getByRole('button',{name:'附加给 Hermes',exact:true}).click();await page.locator('[data-pending-preview]').filter({hasText:'项目计划.md'}).waitFor();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.locator('[data-doc-filter=trash]').click();await page.locator('[data-doc-open]').click();await page.getByRole('button',{name:'恢复文档',exact:true}).click();await saved(page,5);
    for(const width of [390,360]){
      await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:`test-results/documents-mobile-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:1440,height:1000});page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'移入回收站',exact:true}).click();await page.locator('[data-doc-filter=trash]').click();await page.locator('[data-doc-open]').click();
    page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'彻底删除文档',exact:true}).click();await page.locator('.document-empty').waitFor();assert.equal(await page.locator('[data-doc-open]').count(),0);
    await page.locator('#document-import').setInputFiles({name:'import.md',mimeType:'text/markdown',buffer:Buffer.from('# Imported')});await page.getByRole('button',{name:'保存文档',exact:true}).click();await saved(page,1);
    await page.reload();await page.getByRole('heading',{name:'你好，doc-user'}).waitFor();await go(page);await page.locator('[data-doc-open]').click();assert.equal(await page.getByLabel('文档内容',{exact:true}).inputValue(),'# Imported');
    assert.deepEqual(errors,[]);console.log('PASS: document create/edit/preview, cross-window conflict, history restore, attachment, trash/restore/purge, import/reload, desktop/mobile');
  }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
