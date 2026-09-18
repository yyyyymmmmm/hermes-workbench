import { packager } from '@electron/packager';
import { createRequire } from 'node:module';
import {writeFileSync} from 'node:fs';
import {clientService} from '../client-service.mjs';
writeFileSync('desktop/service-config.json',JSON.stringify(clientService()));
const require=createRequire(import.meta.url);
const output=await packager({dir:'desktop',out:'dist',name:'Hermes Workbench',icon:'desktop/icon.ico',extraResource:['ui/assets/lucide-LICENSE'],platform:'win32',arch:'x64',electronVersion:require('electron/package.json').version,asar:true,overwrite:true,prune:true,win32metadata:{CompanyName:'Hermes Workbench',FileDescription:'Hermes personal workspace',ProductName:'Hermes Workbench'}});
console.log(JSON.stringify({artifacts:output,signed:false}));
