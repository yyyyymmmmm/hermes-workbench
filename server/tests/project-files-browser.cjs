const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os'),{randomUUID}=require('node:crypto');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'project-files-ui-')),config=testConfig(dir);
 const output='```hermes-files\n'+JSON.stringify({version:1,files:[{name:'report.md',content:'# Report\n<script>throw Error("unsafe")</script>\n'+'Long content '.repeat(300)}]})+'\n```\n\n```hermes-actions\n'+JSON.stringify({version:1,operations:[{op:'create',title:'Review report',scheduledAt:null,minutes:30,timeZone:'UTC'}]})+'\n```';
 const gateway=async(_t,_h,receive)=>({async rpc(method){if(method.startsWith('session.'))return {session_id:'files',running:false};if(method==='prompt.submit'){receive({method:'event',params:{session_id:'files',type:'message.start'}});receive({method:'event',params:{session_id:'files',type:'message.complete',payload:{text:output,status:'complete'}}});}return {};},close(){}});
 const app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway});let browser;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
  browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}}),page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await ctx.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'files-user',password:'test-password'}}),session=await login.json();
  const post=(path,data)=>ctx.request.post(config.origin+path,{headers:{origin:config.origin,'x-csrf-token':session.csrf,'idempotency-key':randomUUID()},data});
  await post('/api/hermes/connect',{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'});
  const projectId=randomUUID();await post('/api/projects',{id:projectId,version:0,name:'Reports',description:'',archived:false});
  const run=await post('/api/runs',{text:'Create project report',projectId,projectAccess:{tasks:true,documents:[]},projectConsent:true,executionConsent:true});assert.equal(run.status(),202);
  await page.goto(config.origin);
  await page.locator('[data-project-files]').click();await page.locator('[data-project-file-save]').waitFor();
  assert.ok((await page.locator('.project-context-preview').innerText()).includes('<script>'));
  await page.locator('[data-project-file-save]').click();await page.locator('[data-project-file-save]:disabled').filter({hasText:'已归档'}).waitFor();
  const projects=await (await ctx.request.get(config.origin+'/api/projects')).json();assert.equal(projects.projects[0].documents.length,1);
  mkdirSync('test-results',{recursive:true});
  for(const width of [1440,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`test-results/project-files-${width}.png`});}
  await page.locator('.project-chat-dialog [data-project-chat-close]').last().click();assert.equal(await page.locator('.project-chat-dialog').count(),0);
  await page.setViewportSize({width:1440,height:900});await page.locator('[data-project-files]').click();await page.locator('[data-project-file-save]:disabled').waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.project-chat-dialog').count(),0);
  page.on('dialog',d=>d.accept());await page.locator('[data-project-actions]').click();await page.locator('[data-project-operation=apply]').click();await page.locator('.action-status').filter({hasText:'已同步到待办'}).waitFor();await page.locator('[data-project-chat-close]').click();assert.equal(await page.locator('.project-chat-dialog').count(),0);
  assert.equal((await (await ctx.request.get(config.origin+'/api/tasks')).json()).tasks.length,1);
  assert.deepEqual(errors,[]);console.log('PASS file preview, safe text, project archive, mobile layout, reopen/close and task approval return');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
