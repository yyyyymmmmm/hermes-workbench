import {test} from 'node:test';
import assert from 'node:assert/strict';
import {localizedSource} from '../localize.mjs';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
test('localization translates static labels but never dynamic user content',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hermes-locale-'));
 try{
  const file=join(dir,'test.js');writeFileSync(file,'const label="设置"; const html=`<h1>新建任务</h1><p>${user}</p>`; result={label,html};');
  const sandbox={user:'设置',I18n:{t:s=>({设置:'Settings'}[s]||s),html:(parts,...values)=>parts.map((p,i)=>p.replace('新建任务','New task')+(values[i]||'')).join('')}};
  vm.runInNewContext(localizedSource(file),sandbox);assert.equal(sandbox.result.label,'Settings');assert.equal(sandbox.result.html,'<h1>New task</h1><p>设置</p>');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('all live UI source strings have English catalog coverage',()=>{
 const sandbox={window:{}};vm.runInNewContext(readFileSync(new URL('../../web/english.js',import.meta.url),'utf8'),sandbox);const catalog=sandbox.window.HermesEnglish,values=new Set();
 for(const file of ['app','original-ui','chat','project-chat','chat-models','profiles','external-agents','documents','settings','agent','projects','task-plan','skills-hub'])localizedSource(new URL(`../../web/${file}.js`,import.meta.url),values);
 const translate=s=>catalog[s]??catalog[s.trim()]??s.replace(/[\u3400-\u9fff][\u3400-\u9fff，。！？；：、（）…· ]*/g,p=>catalog[p]??catalog[p.trim()]??p);
 assert.deepEqual([...values].filter(s=>/[\u3400-\u9fff]/.test(translate(s))),[]);
});
