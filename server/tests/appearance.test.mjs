import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../web/i18n.js',import.meta.url),'utf8');
function boot(saved){
 const storage=new Map(saved===undefined?[]:[['hermes.appearance.v1',JSON.stringify(saved)]]);
 const root={dataset:{},style:{}};
 const ctx={window:{addEventListener(){}},document:{documentElement:root},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},location:{reload(){}}};
 runInNewContext(source,ctx);return {api:ctx.window.I18n,root,storage};
}
test('classic is the first-run default; existing explicit appearance choices survive',()=>{
 assert.equal(boot().root.dataset.theme,'classic');
 assert.equal(boot({theme:'unknown'}).api.prefs.theme,'classic');
 for(const theme of ['classic','minimal','dark','blue','red','pink']){
  const b=boot({theme,locale:'en',motion:'reduce'});assert.equal(b.root.dataset.theme,theme);assert.equal(b.root.lang,'en');assert.equal(b.root.dataset.motion,'reduce');
  b.api.set({theme:'classic'});assert.equal(b.root.dataset.theme,'classic');assert.equal(JSON.parse(b.storage.get('hermes.appearance.v1')).theme,'classic');
 }
});
