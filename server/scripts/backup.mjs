import { resolve } from 'node:path';
import { backupWorkspace,verifyBackup } from '../backup.mjs';

try {
  const path=await backupWorkspace(resolve(process.env.DATA_DIR||'.runtime'));
  const result=await verifyBackup(path);
  console.log(JSON.stringify({path,...result}));
}catch{console.error('Backup failed; incomplete snapshots without a verified manifest must not be used.');process.exitCode=1;}
