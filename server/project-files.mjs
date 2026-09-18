import {createHash} from 'node:crypto';
import {marked} from 'marked';
import {z} from 'zod';
import {Fault} from './core.mjs';
import {validateAttachments} from './attachments.mjs';
import {documentService} from './documents.mjs';

export const filePrompt='\n\nWorkbench file delivery protocol: when the user requests a text, Markdown or source-code deliverable in this project, return its complete content in exactly one fenced hermes-files JSON block: {"version":1,"files":[{"name":"report.md","content":"full content"}]}. Maximum 5 files, 64000 UTF-8 bytes each, 192000 bytes total. Use supported text filenames without directory paths. NAS paths and download links are NOT workbench files. The user previews and confirms saving; never claim a file is in the workbench before confirmation. Do not emit example blocks or secrets. For an existing NAS file, read its actual content using authorized tools before returning it; do not invent content. Binary files and directory synchronization are not supported by this protocol.';
export function projectFiles(store){
 const documents=documentService(store);
 function read(owner,id){
  const row=store.one('SELECT r.output,r.status,c.project_id FROM runs r JOIN conversations c ON c.id=r.conversation_id AND c.owner=r.owner WHERE r.owner=? AND r.id=?',owner,id);
  if(!row)throw new Fault(404,'RUN_NOT_FOUND','Run not found');
  if(row.status!=='completed'||!row.project_id)return {projectId:null,files:[]};
  const blocks=marked.lexer(row.output).filter(t=>t.type==='code'&&t.lang==='hermes-files');
  if(!blocks.length)return {projectId:row.project_id,files:[]};
  try{
   if(blocks.length!==1)throw new Error();
   const data=z.object({version:z.literal(1),files:z.array(z.unknown()).min(1).max(5)}).strict().parse(JSON.parse(blocks[0].text));
   const files=validateAttachments(data.files);
   if(new Set(files.map(f=>f.name.toLowerCase())).size!==files.length)throw new Error();
   return {projectId:row.project_id,files:files.map((f,index)=>{
    const hex=createHash('sha256').update(JSON.stringify([owner,id,index])).digest('hex');
    const documentId=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
    const saved=Boolean(store.one('SELECT key FROM document_mutations WHERE owner=? AND key=?',owner,documentId));
    return {...f,index,documentId,saved,bytes:Buffer.byteLength(f.content,'utf8')};
   })};
  }catch{throw new Fault(422,'INVALID_FILE_DELIVERY','File delivery is invalid or exceeds text limits');}
 }
 return {list:read,save(owner,id,index){
  const {projectId,files}=read(owner,id),file=files[index];
  if(!file)throw new Fault(404,'FILE_DELIVERY_NOT_FOUND','File delivery not found');
  return documents.save(owner,file.documentId,{id:file.documentId,version:0,name:file.name,content:file.content,deleted:false},{projectId});
 }};
}
