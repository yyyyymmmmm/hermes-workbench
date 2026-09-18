import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { backupWorkspace,verifyBackup } from '../backup.mjs';
import { database } from '../store.mjs';
import { vault } from '../core.mjs';

test('online backup includes WAL data and vault key, and detects corruption',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'hermes-backup-'));
  const secrets=vault(directory),store=database(directory);
  try {
    const user=store.user({username:'backup-user',name:'Backup'}),cipher=secrets.seal(user.id,'private-cookie');
    const path=await backupWorkspace(directory);
    assert.equal((await verifyBackup(path)).verified,true);
    const restored=database(path);
    assert.equal(restored.one('SELECT username FROM users WHERE id=?',user.id).username,'backup-user');restored.db.close();
    assert.equal(vault(path).open(user.id,cipher),'private-cookie');
    appendFileSync(join(path,'vault.key'),'corruption');
    await assert.rejects(()=>verifyBackup(path),/checksum mismatch/);
  }finally{store.db.close();rmSync(directory,{recursive:true,force:true});}
});
