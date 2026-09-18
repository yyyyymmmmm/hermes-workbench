import {test} from 'node:test';
import {readdirSync,readFileSync} from 'node:fs';
import vm from 'node:vm';
test('all shipped web scripts parse, including native device UI',()=>{
 const dir=new URL('../../web/',import.meta.url);
 for(const name of readdirSync(dir).filter(name=>name.endsWith('.js')))new vm.Script(readFileSync(new URL(name,dir),'utf8'),{filename:name});
});
