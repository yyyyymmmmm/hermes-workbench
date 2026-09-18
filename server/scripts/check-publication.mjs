import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';

const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const forbidden=/(^|\/)(api|\.runtime|node_modules|test-results|screenshots|dist|\.ssh)(\/|$)|(^|\/)\.env(?!\.example$)|\.(?:sqlite(?:-.*)?|db|pem|key|p12|pfx|jks|keystore|mobileprovision)$/i;
const patterns=[/-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bgithub_pat_[A-Za-z0-9_]{30,}\b/,/\bAKIA[A-Z0-9]{16}\b/];
const known=Object.entries(process.env).filter(([k,v])=>/(SECRET|PASSWORD|TOKEN|PRIVATE_KEY)$/.test(k)&&v.length>=12).map(([,v])=>v);
const failures=[];
for(const file of files){
 if(forbidden.test(file)){failures.push({file,reason:'excluded path'});continue;}
 if(['.png','.jpg','.ico'].includes(extname(file)))continue;
 const text=readFileSync(file,'utf8');
 if(patterns.some(p=>p.test(text))||known.some(value=>text.includes(value)))failures.push({file,reason:'possible credential'});
}
if(!files.length)throw new Error('No tracked files to inspect');
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1;}
else console.log(`Publication checks passed for ${files.length} tracked files. Manual review still required.`);
