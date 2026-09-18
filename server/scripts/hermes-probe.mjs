import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { vault } from '../core.mjs';
import { database } from '../store.mjs';
import { hermesAdapter } from '../hermes.mjs';
import { request } from '../network.mjs';
import { openGateway } from '../gateway.mjs';

const origin = process.argv[2], username = process.argv[3];
if (!origin || !username || !process.stdin.isTTY) throw new Error('Use an interactive terminal: node server/scripts/hermes-probe.mjs <origin> <username>');
const host = new URL(origin).host.toLowerCase();
process.stdout.write('Hermes password (hidden): ');
const password = await new Promise((resolve, reject) => {
  let value = '';
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8');
  const finish = () => { process.stdin.setRawMode(false); process.stdin.pause(); process.stdin.off('data', onData); process.stdout.write('\n'); };
  function onData(chunk) {
    for (const char of chunk) {
      if (char === '\u0003') { finish(); reject(new Error('Cancelled')); return; }
      if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
      if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
      else value += char;
    }
  }
  process.stdin.on('data', onData);
});
const root = resolve(tmpdir()), directory = mkdtempSync(join(root, 'hermes-live-probe-'));
const secrets = vault(directory), store = database(directory);
const user = store.user({ username: 'isolated-probe', name: 'Isolated Probe' });
const adapter = hermesAdapter({ privateHosts: [host] }, store, secrets, async (url, options) => {
  const response = await request(url, options);
  const path = new URL(url).pathname;
  if (path === '/api/model/options') {
    const data = JSON.parse(response.text);
    console.log(JSON.stringify({ catalogFields: Object.keys(data), currentFields: Object.keys(data.current || {}), mainFields: Object.keys(data.main || {}) }));
  }
  if (path === '/auth/logout') console.log(JSON.stringify({ logoutStatus: response.status, hasSetCookie: Boolean(response.headers['set-cookie']), emptyBody: !response.text }));
  return response;
});
let connected = false;
try {
  await adapter.connect(user.id, { origin, username, password }); connected = true;
  console.log(JSON.stringify({ login: 'verified', origin }));
  const catalog = await adapter.models(user.id);
  console.log(JSON.stringify({ modelCount: catalog.models.length, current: catalog.current,
    providers: [...new Set(catalog.models.map(m => m.providerName))], fetchedAt: catalog.fetchedAt }));
  if(process.argv.includes('--gateway')) {
    const ticket=await adapter.ticket(user.id);
    const client=await openGateway(ticket,[host],()=>{},()=>{});
    console.log(JSON.stringify({webSocket:'authenticated-and-ready',inferenceRequested:false}));
    client.close();
  }
} catch (error) {
  console.error(JSON.stringify({ login: connected ? 'verified' : 'not_verified', error: error.code || 'PROBE_FAILED' }));
  process.exitCode = 1;
} finally {
  if (connected) {
    const result = await adapter.disconnect(user.id);
    console.log(JSON.stringify({ temporarySessionRevoked: result.upstreamRevoked }));
  }
  store.db.close();
  if (!resolve(directory).startsWith(root + sep) || !directory.includes('hermes-live-probe-')) throw new Error('Unsafe cleanup path');
  rmSync(directory, { recursive: true, force: true });
}
