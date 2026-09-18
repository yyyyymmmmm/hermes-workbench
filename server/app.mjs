import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import { createReadStream } from 'node:fs';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Fault, token, hash, equal, vault } from './core.mjs';
import { database } from './store.mjs';
import { authAdapter } from './auth.mjs';
import { hermesAdapter } from './hermes.mjs';
import { runService } from './runs.mjs';
import { attachmentSchema } from './attachments.mjs';
import { documentService } from './documents.mjs';
import {projectService} from './projects.mjs';
import {taskImportService} from './task-imports.mjs';
import { localizedSource } from './localize.mjs';
import {profileName,profileInput} from './profiles.mjs';
import {projectChat,accessSchema} from './project-chat.mjs';
import {workbenchActions} from './workbench-actions.mjs';

const credentials = z.object({ username: z.string().trim().min(1).max(100), password: z.string().min(1).max(256), device: z.string().trim().min(1).max(80).default('Browser') }).strict();
const registration = z.object({ username: z.string().regex(/^[A-Za-z0-9_]{5,11}$/), password: z.string().regex(/^[A-Za-z0-9.*_-]{6,18}$/),
  confirmPassword: z.string(), name: z.string().trim().regex(/^[\p{L}\p{N} _.-]{1,40}$/u), qq: z.string().regex(/^[1-9][0-9]{4,11}$/) }).strict()
  .refine(input => input.password === input.confirmPassword);
const taskSchema = z.object({ id: z.uuid(), version: z.number().int().min(0), title: z.string().trim().min(1).max(300),
  scheduledAt: z.iso.datetime({ offset: true }).nullable(), minutes: z.number().int().min(5).max(1440),
  timeZone: z.string().max(100).refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }),
  completed: z.boolean(), deleted: z.boolean().default(false),linkProject:z.uuid().optional() }).strict();
export async function createApp(config, adapters = {}) {
  const secrets = vault(config.dataDir), store = database(config.dataDir);
  const auth = adapters.auth || authAdapter(config), hermes = hermesAdapter(config, store, secrets, adapters.hermesTransport);
  const runs = runService(config, store, hermes, adapters.gateway);
  const documents = documentService(store);
  const projects=projectService(store);
  const taskImports=taskImportService(store);
  const projectChats=projectChat(store),actions=workbenchActions(store);
  const app = Fastify({ logger: false, bodyLimit: 32768, trustProxy: false });
  const streams = new Set();
  await app.register(cookie);
  await app.register(rateLimit, { max: 240, timeWindow: '1 minute' });
  const cookieOptions = { path: '/', httpOnly: true, sameSite: 'strict', secure: config.secure };
  app.addHook('onClose', async () => { runs.close(); store.db.close(); });
  app.addHook('preClose', async () => { for (const stream of streams) stream.end(); streams.clear(); });
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff').header('Referrer-Policy', 'no-referrer')
      .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
      .header('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    if (!req.routeOptions.url?.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (mutation && req.headers.origin !== config.origin) throw new Fault(403, 'INVALID_ORIGIN', 'Request origin is not permitted');
    if (['/api/auth/login', '/api/auth/register', '/api/auth/capabilities'].includes(req.routeOptions.url)) return;
    const raw = req.cookies.hermes_session;
    const session = raw && store.one('SELECT sessions.*, users.username, users.name FROM sessions JOIN users ON users.id=sessions.owner WHERE token=? AND expires>?', hash(raw), Date.now());
    if (!session) throw new Fault(401, 'AUTH_REQUIRED', 'Please sign in');
    if (req.headers['x-workspace-user'] && req.headers['x-workspace-user'] !== session.owner) throw new Fault(409, 'ACCOUNT_CHANGED', 'Account changed in another window');
    req.session = session;
    if (mutation && !equal(req.headers['x-csrf-token'] || '', session.csrf)) throw new Fault(403, 'INVALID_CSRF', 'Session security token is invalid');
  });
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'Input validation failed' } });
    const status = error instanceof Fault ? error.status : error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;
    reply.code(status).send({ error: { code: error instanceof Fault ? error.code : status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED', message: error instanceof Fault ? error.message : 'Request could not be completed' } });
  });
  app.post('/api/auth/login', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async (req, reply) => {
    const input = credentials.parse(req.body), identity = await auth.login(input.username, input.password);
    const user = store.user(identity), raw = token(), csrf = token(), id = randomUUID(), now = Date.now();
    store.run('DELETE FROM sessions WHERE expires<=?', now);
    if (req.cookies.hermes_session) store.run('DELETE FROM sessions WHERE token=?', hash(req.cookies.hermes_session));
    store.run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?)', id, user.id, hash(raw), csrf, input.device, now, now + config.ttl * 1000);
    reply.setCookie('hermes_session', raw, { ...cookieOptions, maxAge: config.ttl });
    return { user, csrf, sessionId: id };
  });
  app.get('/api/auth/capabilities', async () => ({ registration: true, passwordRecovery: false, recoveryReason: 'APP_USER_RECOVERY_UNAVAILABLE' }));
  app.post('/api/auth/register', { config: { rateLimit: { max: 4, timeWindow: '10 minutes' } } }, async req => {
    const { confirmPassword: _confirmation, ...input } = registration.parse(req.body);
    return auth.register(input);
  });
  app.get('/api/me', async req => ({ user: { id: req.session.owner, username: req.session.username, name: req.session.name }, csrf: req.session.csrf, sessionId: req.session.id }));
  app.post('/api/auth/logout', async (req, reply) => {
    store.run('DELETE FROM sessions WHERE id=? AND owner=?', req.session.id, req.session.owner);
    reply.clearCookie('hermes_session', cookieOptions); return { ok: true };
  });
  app.get('/api/devices', async req => ({ devices: store.all('SELECT id,device,created,expires FROM sessions WHERE owner=? AND expires>? ORDER BY created DESC', req.session.owner, Date.now()).map(d => ({ ...d, current: d.id === req.session.id })) }));
  app.patch('/api/devices/:id', async req => {
    const id=z.uuid().parse(req.params.id),input=z.object({device:z.string().trim().min(1).max(80)}).strict().parse(req.body);
    const result=store.run('UPDATE sessions SET device=? WHERE id=? AND owner=? AND expires>?',input.device,id,req.session.owner,Date.now());
    if(!result.changes)throw new Fault(404,'DEVICE_UNAVAILABLE','Device session unavailable');
    return {ok:true};
  });
  app.post('/api/devices/revoke-others',async req=>{
    z.object({confirm:z.literal(true)}).strict().parse(req.body);
    const result=store.run('DELETE FROM sessions WHERE owner=? AND id<>?',req.session.owner,req.session.id);
    return {ok:true,revoked:Number(result.changes)};
  });
  app.delete('/api/devices/:id', async (req, reply) => {
    const id = z.uuid().parse(req.params.id);
    store.run('DELETE FROM sessions WHERE id=? AND owner=?', id, req.session.owner);
    if (id === req.session.id) reply.clearCookie('hermes_session', cookieOptions);
    return { ok: true };
  });
  app.get('/api/tasks', async req => ({ tasks: store.tasks(req.session.owner), cursor: store.one('SELECT value FROM revisions WHERE owner=?', req.session.owner)?.value || 0 }));
  app.get('/api/projects',async req=>projects.list(req.session.owner));
  app.post('/api/projects',async req=>projects.save(req.session.owner,req.body));
  app.post('/api/projects/:id/links',async req=>projects.link(req.session.owner,z.uuid().parse(req.params.id),req.body));
  app.post('/api/tasks', async req => {
    const key = z.uuid().parse(req.headers['idempotency-key']);
    return { task: store.mutate(req.session.owner, key, taskSchema.parse(req.body)) };
  });
  app.get('/api/sync', async req => {
    const cursor = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(req.query.cursor || 0);
    const rows = store.all('SELECT body,revision FROM tasks WHERE owner=? AND revision>? ORDER BY revision LIMIT 201', req.session.owner, cursor);
    const page = rows.slice(0, 200);
    return { changes: page.map(r => JSON.parse(r.body)), cursor: page.at(-1)?.revision || cursor, hasMore: rows.length > 200 };
  });
  app.get('/api/hermes', async req => hermes.info(req.session.owner));
  app.get('/api/hermes/external-agents',async req=>hermes.externalAgents(req.session.owner));
  app.get('/api/hermes/profiles',async req=>hermes.profiles(req.session.owner,'list'));
  app.get('/api/hermes/profiles/:name',async req=>hermes.profiles(req.session.owner,'detail',{name:profileName.parse(req.params.name)}));
  app.post('/api/hermes/profiles',async req=>hermes.profiles(req.session.owner,'write',profileInput.parse(req.body)));
  app.post('/api/hermes/skills-hub/:action',{config:{rateLimit:{max:20,timeWindow:'1 minute'}}},async req=>{
    const action=z.enum(['search','review','install']).parse(req.params.action);
    if(action==='install'&&runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run before installing');
    return hermes.skillsHub(req.session.owner,action,req.body);
  });
  app.post('/api/hermes/speak',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async req=>hermes.speak(req.session.owner,z.object({text:z.string().trim().min(1).max(8000)}).strict().parse(req.body).text));
  app.get('/api/hermes/capabilities/:section',async req=>hermes.inspect(req.session.owner,z.enum(['tools','skills','mcp','schedules','memory','voice','catalog']).parse(req.params.section),profileName.parse(req.query.profile||'default')));
  app.post('/api/hermes/install-mcp',async req=>{
    if(runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run first');
    const input=z.object({name:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),confirm:z.literal(true)}).strict().parse(req.body);
    return hermes.installMcp(req.session.owner,input.name);
  });
  app.post('/api/hermes/mcp-action',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async req=>{
    if(runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run first');
    const input=z.object({name:z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),action:z.enum(['authorize','status','cancel','verify','remove']),flow:z.uuid().optional(),confirm:z.literal(true)}).strict().parse(req.body);
    return hermes.mcpAction(req.session.owner,input);
  });
  app.post('/api/hermes/mcp-external',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},async req=>{
    if(runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run first');
    return hermes.addExternalMcp(req.session.owner,req.body);
  });
  app.post('/api/hermes/config',async req=>{
    if(runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run first');
    return hermes.saveConfig(req.session.owner,req.body);
  });
  app.post('/api/hermes/manage',async req=>{
    if(runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run first');
    const input=z.discriminatedUnion('section',[
      z.object({section:z.literal('skills'),id:z.string().min(1).max(200),enabled:z.boolean(),confirm:z.literal(true)}).strict(),
      z.object({section:z.literal('mcp'),id:z.string().min(1).max(200),enabled:z.boolean(),confirm:z.literal(true)}).strict(),
      z.object({section:z.literal('schedules'),id:z.string().min(1).max(200),action:z.enum(['pause','resume']),confirm:z.literal(true)}).strict()
    ]).parse(req.body);
    if(['.','..'].includes(input.id)||/[\x00-\x1f/\\]/.test(input.id))throw new Fault(400,'INVALID_INPUT','Invalid resource identifier');
    return hermes.manage(req.session.owner,input);
  });
  app.get('/api/documents',async req=>documents.list(req.session.owner));
  app.get('/api/documents/:id',async req=>documents.get(req.session.owner,z.uuid().parse(req.params.id)));
  app.get('/api/documents/:id/versions',async req=>documents.versions(req.session.owner,z.uuid().parse(req.params.id)));
  app.get('/api/documents/:id/versions/:version',async req=>documents.get(req.session.owner,z.uuid().parse(req.params.id),z.coerce.number().int().positive().parse(req.params.version)));
  app.post('/api/documents',{bodyLimit:512*1024},async req=>documents.save(req.session.owner,z.uuid().parse(req.headers['idempotency-key']),req.body));
  app.delete('/api/documents/:id',async req=>{
    const input=z.object({version:z.number().int().positive(),confirm:z.literal(true)}).strict().parse(req.body);
    return documents.purge(req.session.owner,z.uuid().parse(req.params.id),input.version);
  });
  app.post('/api/hermes/connect', { config: { rateLimit: { max: 8, timeWindow: '1 minute' } } }, async req => {
    const input = credentials.omit({ device: true }).extend({ origin: z.string().max(2048) }).strict().parse(req.body);
    const active = runs.active(req.session.owner);
    if (active) {
      let origin; try { origin=new URL(input.origin).origin; } catch { throw new Fault(400,'INVALID_SERVER','Invalid server URL'); }
      const existing=hermes.info(req.session.owner);
      if(active.status!=='unknown'||existing.origin!==origin||existing.username!==input.username)throw new Fault(409,'RUN_ACTIVE','Resolve the active run before changing connections');
    }
    return hermes.connect(req.session.owner, input);
  });
  app.delete('/api/hermes', async req => {
    if (runs.active(req.session.owner)) throw new Fault(409, 'RUN_ACTIVE', 'Resolve the active run before disconnecting');
    return hermes.disconnect(req.session.owner);
  });
  app.post('/api/hermes/models/refresh', async req => hermes.models(req.session.owner,profileName.parse(req.body?.profile||'default')));
  app.post('/api/hermes/model',async req=>{
    if(runs.active(req.session.owner))throw new Fault(409,'RUN_ACTIVE','Resolve the active run before changing the model');
    const input=z.object({profile:profileName.optional(),model:z.string().min(1).max(300),provider:z.string().min(1).max(100),expected:z.object({model:z.string().nullable(),provider:z.string().nullable()}).strict(),confirm:z.literal(true),confirmExpensive:z.boolean().default(false)}).strict().parse(req.body);
    return hermes.applyModel(req.session.owner,input);
  });
  app.put('/api/hermes/model-preference', async req => hermes.preference(req.session.owner, z.object({ model: z.string().max(300), provider: z.string().max(100) }).strict().parse(req.body)));
  app.get('/api/runs', async req => runs.list(req.session.owner));
  app.get('/api/projects/:id/chat-policy',async req=>projectChats.policy(req.session.owner,z.uuid().parse(req.params.id)));
  app.post('/api/projects/:id/chat-policy',async req=>projectChats.setPolicy(req.session.owner,z.uuid().parse(req.params.id),req.body));
  app.post('/api/projects/:id/context-preview',async req=>projectChats.snapshot(req.session.owner,z.uuid().parse(req.params.id),req.body));
  app.get('/api/runs/:id/actions',async req=>actions.get(req.session.owner,z.uuid().parse(req.params.id)));
  app.post('/api/runs/:id/actions/:action',async req=>{z.object({confirm:z.literal(true)}).strict().parse(req.body);const action=z.enum(['apply','dismiss','undo']).parse(req.params.action);return actions[action](req.session.owner,z.uuid().parse(req.params.id));});
  app.get('/api/runs/:id/task-plan',async req=>taskImports.list(req.session.owner,z.uuid().parse(req.params.id)));
  app.post('/api/runs/:id/task-plan',async req=>taskImports.apply(req.session.owner,z.uuid().parse(req.params.id),z.uuid().parse(req.headers['idempotency-key']),req.body));
  app.get('/api/runs/:id', async req => runs.get(req.session.owner,z.uuid().parse(req.params.id)));
  app.post('/api/runs', {bodyLimit:1024*1024}, async (req,reply) => {
    if(hermes.isBusy(req.session.owner))throw new Fault(409,'CONNECTION_BUSY','Wait for the Hermes configuration operation');
    const input = z.object({text:z.string().trim().min(1).max(6000),agentProfile:profileName.optional(),agentMode:z.boolean().optional(),conversationId:z.uuid().optional(),projectId:z.uuid().optional(),projectAccess:accessSchema.optional(),projectConsent:z.literal(true).optional(),executionConsent:z.literal(true).optional(),attachments:z.array(attachmentSchema).max(5).optional()}).strict().parse(req.body);
    reply.code(202);
    return runs.submit(req.session.owner,z.uuid().parse(req.headers['idempotency-key']),input);
  });
  app.post('/api/runs/:id/interrupt', async req => runs.interrupt(req.session.owner,z.uuid().parse(req.params.id)));
  app.get('/api/conversations/:id/messages',async req=>runs.messages(req.session.owner,z.uuid().parse(req.params.id),req.query.before?z.uuid().parse(req.query.before):undefined));
  app.patch('/api/conversations/:id',async req=>{
    const id=z.uuid().parse(req.params.id),owner=req.session.owner;
    const input=z.object({title:z.string().trim().min(1).max(120),category:z.string().trim().max(40),version:z.number().int().nonnegative()}).strict().parse(req.body);
    if(!store.one('SELECT id FROM conversations WHERE owner=? AND id=?',owner,id))throw new Fault(404,'CONVERSATION_NOT_FOUND','Conversation was not found');
    const result=store.run('UPDATE conversations SET title=?,category=?,metadata_version=metadata_version+1 WHERE owner=? AND id=? AND metadata_version=?',input.title,input.category,owner,id,input.version);
    if(!result.changes)throw new Fault(409,'CONVERSATION_CONFLICT','Conversation metadata changed; refresh before editing');
    return store.one('SELECT id,title,category,metadata_version AS version FROM conversations WHERE owner=? AND id=?',owner,id);
  });
  app.get('/api/conversations/search',async req=>{
    const q=z.string().trim().min(1).max(200).parse(req.query.q),offset=z.coerce.number().int().min(0).max(1000000).parse(req.query.offset||0);
    const items=store.all(`SELECT c.id,c.title,c.category,c.metadata_version AS version,c.created FROM conversations c WHERE c.owner=? AND
      (instr(lower(c.title),lower(?))>0 OR EXISTS(SELECT 1 FROM runs r WHERE r.conversation_id=c.id AND r.owner=c.owner AND (instr(lower(r.prompt),lower(?))>0 OR instr(lower(r.output),lower(?))>0)))
      ORDER BY c.created DESC,c.id DESC LIMIT 21 OFFSET ?`,req.session.owner,q,q,q,offset);
    return {items:items.slice(0,20),hasMore:items.length>20,offset};
  });
  app.post('/api/conversations/:id/revoke',async req=>runs.revoke(req.session.owner,z.uuid().parse(req.params.id)));
  app.get('/api/runs/:id/attachments/:index',async req=>runs.attachment(req.session.owner,z.uuid().parse(req.params.id),z.coerce.number().int().min(0).max(4).parse(req.params.index)));
  app.post('/api/runs/:id/reconcile', async req => runs.reconcile(req.session.owner,z.uuid().parse(req.params.id)));
  app.post('/api/runs/:id/abandon', async req => {
    z.object({acknowledgeRemoteMayContinue:z.literal(true)}).strict().parse(req.body);
    return runs.abandon(req.session.owner,z.uuid().parse(req.params.id));
  });
  app.post('/api/runs/:id/requests/:requestId', async req => runs.answer(req.session.owner,z.uuid().parse(req.params.id),z.uuid().parse(req.params.requestId),z.object({answer:z.string().trim().min(1).max(4000)}).strict().parse(req.body).answer));
  app.get('/api/runs/:id/events', async (req,reply) => {
    const id = z.uuid().parse(req.params.id), owner = req.session.owner;
    runs.get(owner,id);
    if([...streams].filter(stream=>stream.workspaceOwner===owner).length>=6)throw new Fault(429,'STREAM_LIMIT','Too many live streams');
    let cursor = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).parse(req.headers['last-event-id'] || req.query.after || 0);
    reply.hijack();
    streams.add(reply.raw);
    reply.raw.workspaceOwner=owner;
    reply.raw.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no','X-Content-Type-Options':'nosniff'});
    let ticks = 0;
    const timer = setInterval(() => {
      if (reply.raw.destroyed) { clearInterval(timer); return; }
      if (!store.one('SELECT id FROM sessions WHERE id=? AND owner=? AND expires>?',req.session.id,owner,Date.now()) || reply.raw.writableLength > 512*1024) { clearInterval(timer); reply.raw.end(); return; }
      const events = runs.events(owner,id,cursor);
      for (const item of events) { cursor=item.seq; reply.raw.write(`id: ${cursor}\ndata: ${JSON.stringify(item)}\n\n`); }
      if (++ticks % 30 === 0) reply.raw.write(': heartbeat\n\n');
    },300);
    reply.raw.write(': connected\n\n');
    reply.raw.on('close',()=>{ clearInterval(timer); streams.delete(reply.raw); });
  });
  // An explicit asset map keeps source code, runtime data and deployment secrets unreachable.
  const assets = {
    '/': ['../web/index.html', 'text/html; charset=utf-8'],
    '/app.js': ['../web/app.js', 'application/javascript; charset=utf-8'],
    '/styles.css': ['../web/styles.css', 'text/css; charset=utf-8'],
    '/live.css': ['../web/live.css', 'text/css; charset=utf-8'],
    '/original-ui.js': ['../web/original-ui.js', 'application/javascript; charset=utf-8'],
    '/chat.js': ['../web/chat.js', 'application/javascript; charset=utf-8'],
    '/documents.js': ['../web/documents.js', 'application/javascript; charset=utf-8'],
    '/projects.js': ['../web/projects.js', 'application/javascript; charset=utf-8'],
    '/projects.css': ['../web/projects.css', 'text/css; charset=utf-8'],
    '/task-plan.js': ['../web/task-plan.js', 'application/javascript; charset=utf-8'],
    '/task-plan.css': ['../web/task-plan.css', 'text/css; charset=utf-8'],
    '/skills-hub.js': ['../web/skills-hub.js', 'application/javascript; charset=utf-8'],
    '/skills-hub.css': ['../web/skills-hub.css', 'text/css; charset=utf-8'],
    '/chat-workspace.css': ['../web/chat-workspace.css', 'text/css; charset=utf-8'],
    '/design-system.css': ['../web/design-system.css', 'text/css; charset=utf-8'],
    '/experience.js': ['../web/experience.js', 'text/javascript; charset=utf-8'],
    '/project-chat.js': ['../web/project-chat.js', 'text/javascript; charset=utf-8'],
    '/chat-models.js': ['../web/chat-models.js', 'text/javascript; charset=utf-8'],
    '/profiles.js': ['../web/profiles.js', 'text/javascript; charset=utf-8'],
    '/external-agents.js': ['../web/external-agents.js', 'text/javascript; charset=utf-8'],
    '/documents.css': ['../web/documents.css', 'text/css; charset=utf-8'],
    '/themes.css': ['../web/themes.css', 'text/css; charset=utf-8'],
    '/settings.js': ['../web/settings.js', 'application/javascript; charset=utf-8'],
    '/device-data.js': ['../web/device-data.js', 'application/javascript; charset=utf-8'],
    '/agent.js': ['../web/agent.js', 'application/javascript; charset=utf-8'],
    '/english.js': ['../web/english.js', 'application/javascript; charset=utf-8'],
    '/i18n.js': ['../web/i18n.js', 'application/javascript; charset=utf-8'],
    '/assets/marked.js': ['../node_modules/marked/lib/marked.umd.js', 'application/javascript; charset=utf-8'],
    '/assets/purify.js': ['../node_modules/dompurify/dist/purify.min.js', 'application/javascript; charset=utf-8'],
    '/terminal/styles.css': ['../ui/terminal/styles.css', 'text/css; charset=utf-8'],
    '/terminal/views.js': ['../ui/terminal/views.js', 'application/javascript; charset=utf-8'],
    '/assets/lucide.min.js': ['../ui/assets/lucide.min.js', 'application/javascript; charset=utf-8'],
    '/assets/avatar.jpg': ['../ui/assets/avatar.jpg', 'image/jpeg']
  };
  for (const [route, [file, type]] of Object.entries(assets)) {
    const path=fileURLToPath(new URL(file,import.meta.url));
    const compiled=['/app.js','/original-ui.js','/chat.js','/project-chat.js','/chat-models.js','/profiles.js','/external-agents.js','/documents.js','/settings.js','/terminal/views.js','/agent.js','/projects.js','/task-plan.js','/skills-hub.js'].includes(route)?localizedSource(path):null;
    app.get(route, async (_req, reply) => reply.type(type).header('Cache-Control', 'no-cache').send(compiled??createReadStream(path)));
  }
  return app;
}
