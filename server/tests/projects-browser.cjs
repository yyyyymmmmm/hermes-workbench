const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),{randomUUID}=require('node:crypto');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-project-ui-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1600,height:1050}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const login=await context.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'project-user',password:'test-password'}}),session=await login.json(),headers={origin:config.origin,'x-csrf-token':session.csrf,'idempotency-key':randomUUID()};
  const doc=await context.request.post(config.origin+'/api/documents',{headers,data:{id:randomUUID(),version:0,name:'Launch brief.md',content:'# Launch brief\n\nRelease readiness and acceptance criteria.',deleted:false}});assert.equal(doc.status(),200);const docId=(await doc.json()).id;
  await page.goto(config.origin);await page.locator('.sidebar [data-page=workspace]').click();await page.locator('.page-header [data-project-action=new]').click();await page.getByLabel('项目名称',{exact:true}).fill('个人工作台发布');await page.getByLabel('项目说明',{exact:true}).fill('让任务、时间和资料围绕同一件事协作。');await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.getByRole('heading',{name:'个人工作台发布',exact:true}).waitFor();
  await page.getByRole('button',{name:'新建任务',exact:true}).click();await page.getByLabel('任务名称',{exact:true}).fill('完成发布验收');await page.getByLabel('日历时间',{exact:true}).fill('2026-09-20T10:00');await page.getByRole('button',{name:'保存',exact:true}).click();await page.locator('.project-task strong').filter({hasText:'完成发布验收'}).waitFor();
  assert.equal((await (await context.request.get(config.origin+'/api/tasks')).json()).tasks.length,1);
  await page.getByRole('button',{name:'关联文档',exact:true}).click();await page.locator('#project-resource').selectOption(docId);await page.getByRole('button',{name:'关联',exact:true}).click();await page.locator('[data-project-document]').waitFor();
  await page.locator('[data-complete]').check();await page.waitForFunction(()=>document.querySelector('.project-progress progress')?.value===100);
  await page.locator('[data-project-document]').click();await page.getByLabel('文档名称',{exact:true}).waitFor();assert.equal(await page.getByLabel('文档名称',{exact:true}).inputValue(),'Launch brief.md');await page.locator('[data-workspace-view=projects]').click();
  await page.locator('.project-layout[aria-busy=false]').waitFor();await page.getByRole('button',{name:'编辑项目',exact:true}).click();assert.deepEqual(errors,[]);await page.getByLabel('项目说明',{exact:true}).fill('本地保留的修改');
  const project=(await (await context.request.get(config.origin+'/api/projects')).json()).projects[0];
  const remote=await context.request.post(config.origin+'/api/projects',{headers,data:{id:project.id,version:project.version,name:project.name,description:'另一台设备的修改',archived:false}});assert.equal(remote.status(),200);
  await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.locator('.project-conflict').waitFor();assert.equal(await page.getByLabel('项目说明',{exact:true}).inputValue(),'本地保留的修改');assert.match(await page.locator('.project-conflict').innerText(),/另一台设备的修改/);
  await page.getByRole('button',{name:'保留我的文字修改',exact:true}).click();await page.getByRole('button',{name:'保存项目',exact:true}).click();await page.getByRole('heading',{name:'个人工作台发布',exact:true}).waitFor();
  assert.equal((await (await context.request.get(config.origin+'/api/projects')).json()).projects[0].description,'本地保留的修改');
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/projects-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'附加项目上下文',exact:true}).click();await page.locator('[data-pending-preview]').filter({hasText:'project-context.json'}).waitFor();
  for(const width of [390,360]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`test-results/projects-${width}.png`,fullPage:true});}
  await page.setViewportSize({width:1600,height:1050});await page.getByRole('button',{name:'归档项目',exact:true}).click();await page.getByRole('button',{name:'恢复项目',exact:true}).waitFor();assert.equal((await (await context.request.get(config.origin+'/api/tasks')).json()).tasks.length,1);
  await page.reload();await page.locator('.sidebar [data-page=workspace]').click();await page.locator('[data-project-filter=archived]').click();await page.getByRole('heading',{name:'个人工作台发布',exact:true}).waitFor();assert.deepEqual(errors,[]);
  console.log('PASS: project creation, atomic task linking, shared completion/schedule, document navigation, context attachment, archive/reload and mobile');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
