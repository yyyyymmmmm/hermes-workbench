const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),{randomUUID}=require('node:crypto');
(async()=>{
 const {createApp}=await import('../app.mjs'),{database}=await import('../store.mjs'),{testConfig,mockAuth}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-plan-ui-')),config=testConfig(dir),app=await createApp(config,{auth:mockAuth});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const login=await context.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'plan-user',password:'test-password'}}),session=await login.json(),headers={origin:config.origin,'x-csrf-token':session.csrf,'idempotency-key':randomUUID()},id=randomUUID(),conversation=randomUUID(),store=database(dir),project=randomUUID();
  store.run('INSERT INTO conversations(id,owner,connection_id,title,remote_id,created,execution_granted) VALUES(?,?,?,?,?,?,?)',conversation,session.user.id,randomUUID(),'发布计划',null,Date.now(),1);
  store.run('INSERT INTO runs(id,owner,conversation_id,request_key,fingerprint,prompt,status,output,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',id,session.user.id,conversation,randomUUID(),'test','整理发布计划','completed','## 发布清单\n- [ ] 检查发布说明\n- [ ] 完成多设备验收\n- [ ] 暂不安排的任务',Date.now(),Date.now());store.db.close();
  await context.request.post(config.origin+'/api/projects',{headers,data:{id:project,version:0,name:'发布计划',description:'',archived:false}});
  await page.goto(config.origin);await page.getByRole('button',{name:'安排为待办',exact:true}).click();await page.locator('#task-plan-form').waitFor();
  await page.locator('[data-plan-index="0"] [name=title]').fill('核对最终发布说明');await page.locator('[data-plan-index="0"] [name=scheduled]').fill('2026-09-20T10:00');await page.locator('[data-plan-index="2"] [name=selected]').uncheck();await page.locator('[name=project]').selectOption(project);
  mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/task-plan-desktop.png'});await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'test-results/task-plan-mobile.png'});
  await page.getByRole('button',{name:'确认添加',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.task-plan-dialog'));
  const tasks=(await (await context.request.get(config.origin+'/api/tasks')).json()).tasks;assert.equal(tasks.length,2);assert.ok(tasks.every(t=>t.sourceRunId===id));assert.ok(tasks.find(t=>t.title==='核对最终发布说明').scheduledAt);
  assert.equal((await (await context.request.get(config.origin+'/api/projects')).json()).projects[0].taskIds.length,2);
  await page.setViewportSize({width:1440,height:960});await page.locator('.sidebar [data-page=tasks]').click();await page.getByRole('button',{name:'查看来源对话',exact:true}).first().click();await page.locator(`[data-output="${id}"]`).waitFor();
  await page.getByRole('button',{name:'安排为待办',exact:true}).click();await page.locator('#task-plan-form').waitFor();assert.equal(await page.locator('[data-plan-index="0"] [name=selected]').isDisabled(),true);assert.equal(await page.locator('[data-plan-index="2"] [name=selected]').isChecked(),true);
  await page.locator('.task-plan-dialog [data-plan-close]').first().click();
  await page.locator('.sidebar [data-page=settings]').click();await page.locator('[name=theme][value=dark]').check();await page.locator('#display-language').selectOption('en');await page.waitForFunction(()=>document.documentElement.lang==='en');
  await page.getByRole('button',{name:'Review as tasks',exact:true}).click();await page.locator('#task-plan-form').waitFor();assert.equal(await page.getByRole('button',{name:'Confirm and add',exact:true}).isVisible(),true);assert.equal(await page.locator('.task-plan-dialog').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(32, 33, 36)');await page.screenshot({path:'test-results/task-plan-dark-english.png'});await page.locator('.task-plan-dialog [data-plan-close]').first().click();assert.deepEqual(errors,[]);
  console.log('PASS: reply review, edited/selected tasks, schedule, project association, provenance, duplicate protection and responsive dialog');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
