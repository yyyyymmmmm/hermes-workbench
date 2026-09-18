const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/Administrator/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const {writeFileSync}=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:256,height:256}});
  await page.setContent('<style>body{margin:0;background:transparent}.brand{width:256px;height:256px;background:#242424;border-radius:48px;display:grid;place-items:center;color:#fff}.brand svg{width:176px;height:176px;stroke-width:2}</style><div class="brand"><i data-lucide="asterisk"></i></div>');
  await page.addScriptTag({path:'ui/assets/lucide.min.js'});await page.evaluate(()=>lucide.createIcons());
  const png=await page.screenshot({path:'desktop/icon.png',omitBackground:true});
  const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
  writeFileSync('desktop/icon.ico',Buffer.concat([header,png]));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
