import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
function setup(){
 const calls=[],listeners={};const context={URL,Headers,Response,Uint8Array,crypto:webcrypto,DOMException,AbortController,atob,setTimeout,clearTimeout,location:{href:'https://appassets.androidplatform.net/',protocol:'https:',host:'appassets.androidplatform.net'},addEventListener:(name,fn)=>listeners[name]=fn,HermesHTTP:{postMessage:message=>calls.push(JSON.parse(message))}};
 context.window=context;vm.runInNewContext(readFileSync(new URL('../../mobile/native-transport.js',import.meta.url),'utf8'),context);return {context,calls,listeners};
}
test('native transport limits requests to local API and does not expose cookies',async()=>{
 const {context,calls}=setup();
 await assert.rejects(context.fetch('https://other.example/api/me'));
 await assert.rejects(context.fetch('/index.html'));
 const result=context.fetch('/api/me');const id=calls[0].id;
 context.HermesHTTP.onmessage({data:JSON.stringify({id,status:200,contentType:'application/json',body:Buffer.from('{"ok":true}').toString('base64'),headers:{'set-cookie':'secret'}})});
 const response=await result;assert.deepEqual(await response.json(),{ok:true});assert.equal(response.headers.get('set-cookie'),null);
});
test('aborted native requests discard later responses and never retry writes',async()=>{
 const {context,calls}=setup(),controller=new AbortController();
 const result=context.fetch('/api/tasks',{method:'POST',body:'{}',signal:controller.signal});controller.abort();await assert.rejects(result,{name:'AbortError'});
 context.HermesHTTP.onmessage({data:JSON.stringify({id:calls[0].id,status:200,body:Buffer.from('{}').toString('base64')})});assert.equal(calls.length,1);
});
test('mobile incremental events preserve cursor and stop after close',async()=>{
 const {context,calls}=setup(),received=[];const source=new context.EventSource('/api/runs/example/events?after=4');
 source.onmessage=message=>{received.push(JSON.parse(message.data).seq);source.close();};
 await new Promise(resolve=>setTimeout(resolve,10));assert.equal(calls[0].path,'/api/runs/example/event-batch?after=4');
 context.HermesHTTP.onmessage({data:JSON.stringify({id:calls[0].id,status:200,body:Buffer.from(JSON.stringify({events:[{seq:5,type:'delta',text:'Hello'},{seq:6,type:'delta',text:'ignored'}]})).toString('base64')})});
 await new Promise(resolve=>setTimeout(resolve,10));assert.deepEqual(received,[5]);assert.equal(source.readyState,2);assert.equal(calls.length,1);
});
