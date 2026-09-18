import { DatabaseSync, backup } from 'node:sqlite';
import { createReadStream, copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';

async function digest(path) {
  const hash=createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
export async function backupWorkspace(directory) {
  const source=resolve(directory), key=readFileSync(join(source,'vault.key'));
  if(key.length!==32)throw new Error('Vault key is missing or invalid');
  const root=join(source,'backups');mkdirSync(root,{recursive:true});
  const destination=mkdtempSync(join(root,'snapshot-'));
  const db=new DatabaseSync(join(source,'workbench.sqlite'),{readOnly:true});
  let schema;
  try { schema=db.prepare('PRAGMA user_version').get().user_version;await backup(db,join(destination,'workbench.sqlite')); }
  finally { db.close(); }
  copyFileSync(join(source,'vault.key'),join(destination,'vault.key'));
  const manifest={format:1,schema,createdAt:new Date().toISOString(),files:{}};
  for(const file of ['workbench.sqlite','vault.key'])manifest.files[file]=await digest(join(destination,file));
  writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{flag:'wx',mode:0o600});
  return destination;
}
export async function verifyBackup(directory) {
  const path=resolve(directory),manifest=JSON.parse(readFileSync(join(path,'manifest.json'),'utf8'));
  if(manifest.format!==1||!Number.isInteger(manifest.schema))throw new Error('Unsupported backup format');
  for(const file of ['workbench.sqlite','vault.key'])if(await digest(join(path,file))!==manifest.files?.[file])throw new Error(`Backup checksum mismatch: ${file}`);
  const db=new DatabaseSync(join(path,'workbench.sqlite'),{readOnly:true});
  try {
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup database integrity check failed');
    if(db.prepare('PRAGMA user_version').get().user_version!==manifest.schema)throw new Error('Backup schema mismatch');
  }finally{db.close();}
  return {verified:true,schema:manifest.schema,createdAt:manifest.createdAt};
}
