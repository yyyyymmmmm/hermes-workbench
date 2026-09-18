const {_electron}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const {mkdtempSync,rmSync,mkdirSync}=require('node:fs'),{join,resolve}=require('node:path'),{tmpdir}=require('node:os');
(async()=>{
 const {createApp}=await import('../app.mjs'),{mockAuth,testConfig}=await import('./fixtures.mjs');
 const dir=mkdtempSync(join(tmpdir(),'hermes-desktop-test-')),config=testConfig(join(dir,'server')),app=await createApp(config,{auth:mockAuth});let desktop;
 try{
  await app.listen({host:'127.0.0.1',port:0});config.origin=`http://127.0.0.1:${app.server.address().port}`;
  const environment={...process.env};delete environment.ELECTRON_RUN_AS_NODE;
  const packaged=process.argv.includes('--packaged');
  desktop=await _electron.launch({executablePath:packaged?resolve('dist/Hermes Workbench-win32-x64/Hermes Workbench.exe'):require('electron'),args:[...(packaged?[]:[resolve('desktop')]),`--user-data-dir=${join(dir,'client')}`],env:environment});
  const setup=await desktop.firstWindow();await setup.locator('#origin').fill(config.origin);const ready=desktop.waitForEvent('window');await setup.locator('button').click();const page=await ready;
  await page.getByRole('heading',{name:'回到你的工作与生活'}).waitFor();
  assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>typeof window.workspaceSetup),'undefined');
  await page.getByLabel('账号',{exact:true}).fill('windows-user');await page.getByLabel('密码',{exact:true}).fill('test-password');await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('heading',{name:'你好，windows-user'}).waitFor();
  await page.locator('.sidebar [data-page=settings]').click();await page.locator('input[name=theme][value=dark]').check();mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/windows-desktop.png'});
  const another=desktop.waitForEvent('window');await page.getByRole('button',{name:'新建窗口',exact:true}).click();const second=await another;await second.getByRole('heading',{name:'你好，windows-user'}).waitFor();
  console.log('PASS: Electron setup, login, sandboxed renderer, isolated preload, persistent session across windows, dark theme');
 }finally{await desktop?.close();await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
