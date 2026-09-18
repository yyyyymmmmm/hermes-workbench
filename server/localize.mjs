import { parse } from 'acorn';
import { readFileSync } from 'node:fs';

// Only source-authored literals are translated. User input and remote content never enter this compiler.
export function localizedSource(path, collect = new Set()) {
  const source=readFileSync(path,'utf8'),edits=[];
  const visit=(node,parent)=>{
    if(!node||typeof node!=='object')return;
    if(node.type==='Literal'&&node.value==='zh-CN'&&parent?.arguments?.[0]===node&&['DateTimeFormat','toLocaleString','toLocaleDateString'].includes(parent.callee?.property?.name)){edits.push([node.start,node.end,'I18n.locale']);return;}
    if(node.type==='Literal'&&typeof node.value==='string'&&/[\u3400-\u9fff]/.test(node.value)&&!(parent?.type==='Property'&&parent.key===node&&!parent.computed)){
      collect.add(node.value);edits.push([node.start,node.end,`I18n.t(${JSON.stringify(node.value)})`]);return;
    }
    if(node.type==='TemplateLiteral'&&node.quasis.some(q=>/[\u3400-\u9fff]/.test(q.value.cooked))&&parent?.type!=='TaggedTemplateExpression'){
      edits.push([node.start,node.start,'I18n.html']);
      for(const q of node.quasis)for(const match of q.value.cooked.matchAll(/[\u3400-\u9fff][\u3400-\u9fff，。！？；：、（）…· ]*/g))collect.add(match[0]);
    }
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(n=>visit(n,node));else if(value&&typeof value==='object')visit(value,node);
  };
  visit(parse(source,{ecmaVersion:'latest',sourceType:'script'}));
  let output=source;
  for(const [start,end,text] of edits.sort((a,b)=>b[0]-a[0]))output=output.slice(0,start)+text+output.slice(end);
  return output;
}
