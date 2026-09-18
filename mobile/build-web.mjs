import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {localizedSource} from '../server/localize.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),out=join(root,'mobile/www');
const compiled=new Set(['app','original-ui','chat','project-chat','chat-models','profiles','external-agents','documents','settings','agent','projects','task-plan','skills-hub']);
const assets=new Map();
for(const name of readdirSync(join(root,'web')))if(/\.(js|css)$/.test(name))assets.set(name,compiled.has(name.replace(/\.js$/,''))?localizedSource(join(root,'web',name)):readFileSync(join(root,'web',name)));
for(const [target,source] of Object.entries({'terminal/styles.css':'ui/terminal/styles.css','terminal/views.js':'ui/terminal/views.js','assets/lucide.min.js':'ui/assets/lucide.min.js','assets/lucide-LICENSE':'ui/assets/lucide-LICENSE','assets/avatar.jpg':'ui/assets/avatar.jpg','assets/marked.js':'node_modules/marked/lib/marked.umd.js','assets/purify.js':'node_modules/dompurify/dist/purify.min.js'}))assets.set(target,target==='terminal/views.js'?localizedSource(join(root,source)):readFileSync(join(root,source)));
assets.set('native-transport.js',readFileSync(join(root,'mobile/native-transport.js')));
const csp="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'";
assets.set('index.html',readFileSync(join(root,'web/index.html'),'utf8').replace('<head>',`<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">\n<script src="/native-transport.js"></script>`));
const manifest={version:JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version,files:{}};
for(const [name,data]of assets){mkdirSync(dirname(join(out,name)),{recursive:true});writeFileSync(join(out,name),data);manifest.files[name]=createHash('sha256').update(data).digest('hex');}
writeFileSync(join(out,'bundle-manifest.json'),JSON.stringify(manifest,null,2));
console.log(`Bundled ${assets.size} local assets; no server address or credentials included.`);
