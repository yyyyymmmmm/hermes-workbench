const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),{mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{testConfig,mockAuth,mockHermes}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-chat-ux-')),config=testConfig(dir);let emit,submitted=0,browser;
 const gateway=async(_ticket,_hosts,receive)=>({async rpc(method){if(method==='session.create'||method==='session.resume')return {session_id:'ux',stored_session_id:'stored-ux',running:false};if(method==='prompt.submit'){submitted++;emit=(type,payload={})=>receive({method:'event',params:{type,session_id:'ux',payload}});emit('message.start');}return {ok:true};},close(){}});
 const app=await createApp(config,{auth:mockAuth,hermesTransport:mockHermes,gateway});
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;browser=await chromium.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const login=await context.request.post(config.origin+'/api/auth/login',{headers:{origin:config.origin},data:{username:'chat-user',password:'test-password'}}),session=await login.json();await context.request.post(config.origin+'/api/hermes/connect',{headers:{origin:config.origin,'x-csrf-token':session.csrf},data:{origin:'https://hermes.example.test',username:'remote-user',password:'hermes-test-password'}});
  await page.goto(config.origin);await page.getByRole('button',{name:'展开对话',exact:true}).click();const input=page.getByLabel('发送给 Hermes 的消息');
  assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isDisabled(),true);
  await input.fill('帮我整理本周的发布计划');await input.press('Shift+Enter');assert.equal(submitted,0);assert.ok((await input.inputValue()).includes('\n'));
  await input.dispatchEvent('keydown',{key:'Enter',isComposing:true,keyCode:229});assert.equal(submitted,0);
  await input.press('Enter');await page.locator('.live-run-status').filter({hasText:'正在执行'}).waitFor();assert.equal(submitted,1);
  const output='# 发布计划\n\n先确定**验收范围**，再安排时间。\n\n| 事项 | 状态 |\n| --- | --- |\n| 桌面交互 | 待验收 |\n| 移动布局 | 待验收 |\n\n```js\nconst ready = true;\n```\n\n'+Array.from({length:25},(_,i)=>`### ${i+1}. 检查项目\n\n核对任务、时间安排与关联文档。\n\n`).join('');
  emit('message.delta',{text:output});await page.locator('.chat-output h1').waitFor();assert.equal(await page.locator('.chat-output table').count(),1);
  await input.fill('下一步还要检查附件预览。\n请保留所有已完成的工作。');await page.locator('.live-chat-log').evaluate(el=>el.scrollTop=0);await page.getByRole('button',{name:'回到最新消息',exact:true}).waitFor();
  emit('message.delta',{text:'\n最新进展。'});await page.waitForFunction(()=>document.querySelector('.chat-output').textContent.includes('最新进展'));assert.equal(await page.locator('.live-chat-log').evaluate(el=>el.scrollTop),0);
  assert.equal(await input.isDisabled(),false);assert.equal(await page.getByRole('button',{name:'中断执行',exact:true}).isVisible(),true);
  await page.getByRole('button',{name:'回到最新消息',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-chat-action=latest]').hidden);
  emit('message.complete',{text:output+'\n最新进展。',status:'complete'});await page.locator('.live-run-status').filter({hasText:'已完成'}).waitFor();assert.ok((await input.inputValue()).startsWith('下一步'));assert.equal(await page.getByRole('button',{name:'发送',exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:'历史会话',exact:true}).click();await page.locator('.chat-session-drawer').waitFor();await page.getByRole('button',{name:'关闭历史',exact:true}).click();assert.ok((await input.inputValue()).startsWith('下一步'));
  await page.locator('.live-chat-log').evaluate(el=>el.scrollTop=0);mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/chat-ux-desktop.png'});
  for(const width of [390,360]){await page.setViewportSize({width,height:844});await page.getByRole('button',{name:'切换 Hermes 面板',exact:true}).click();await page.locator('.assistant.drawer').waitFor();const box=await page.locator('#live-chat-form').boundingBox();assert.ok(box.y+box.height<=781);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`test-results/chat-ux-${width}.png`});await page.getByRole('button',{name:'收起助手',exact:true}).click();}
  assert.deepEqual(errors,[]);console.log('PASS: Enter/Shift+Enter, empty send, live Markdown, drafting during reply, scroll anchoring/jump, history and responsive composer');
 }finally{await browser?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
