import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { sign, verify, authAdapter } from '../auth.mjs';
import { md5, vault } from '../core.mjs';
import { allowedAddress, hermesUrl, request } from '../network.mjs';
import { normalizeModels } from '../hermes.mjs';
import { createApp } from '../app.mjs';
import { mockAuth, mockHermes, testConfig } from './fixtures.mjs';

test('legacy auth signature preserves insertion order and excludes protocol fields', () => {
  assert.equal(sign({ user: 'alice', password: 'pass', t: 123, value: 'nonce', app: 10016 }, 'key'), md5('user=alice&password=pass&t=123&key'));
  assert.notEqual(sign({ password: 'pass', user: 'alice', t: 123 }, 'key'), sign({ user: 'alice', password: 'pass', t: 123 }, 'key'));
});
test('auth rejects unsigned, forged, replayed and mismatched responses', async () => {
  const config = testConfig('unused'), nonce = 'random', time = Math.floor(Date.now() / 1000);
  assert.equal(verify({ time, check: md5(`${time}${config.secret}${nonce}`) }, nonce, config).time, time);
  for (const response of [{ time }, { time, check: 'forged' }, { time: time - 600, check: md5(`${time - 600}${config.secret}${nonce}`) }]) assert.throws(() => verify(response, nonce, config), { code: 'AUTH_INTEGRITY_FAILED' });
  const auth = authAdapter(config, async (_url, options) => {
    const body = new URLSearchParams(options.body);
    assert.equal(body.get('user'), 'alice');
    return { status: 200, text: JSON.stringify({ code: 200, msg: { user: 'mallory' }, time, check: md5(`${time}${config.secret}${body.get('value')}`) }) };
  });
  await assert.rejects(() => auth.login('alice', 'pass'), { code: 'AUTH_IDENTITY_MISMATCH' });
});
test('registration uses the signed application user API and never treats an error as success', async () => {
  const config = testConfig('unused'); let code = 200;
  const adapter = authAdapter(config, async (url, options) => {
    assert.equal(new URL(url).searchParams.get('api'), 'userreg');
    const fields = Object.fromEntries(new URLSearchParams(options.body));
    assert.equal(fields.sign, sign(fields, config.secret));
    assert.equal(fields.qq, '12345678');
    const time = Math.floor(Date.now() / 1000);
    return { status: 200, text: JSON.stringify({ code, time, check: md5(`${time}${config.secret}${fields.value}`) }) };
  });
  const input = { username: 'alice1', name: 'Alice', password: 'test-password', qq: '12345678' };
  assert.deepEqual(await adapter.register(input), { registered: true });
  code = 115; await assert.rejects(() => adapter.register(input), { code: 'REGISTRATION_CONFLICT' });
  code = 117; await assert.rejects(() => adapter.register(input), { code: 'REGISTRATION_IP_LIMIT' });
});
test('SSRF policy blocks metadata, private, fake IP, mapped loopback and unsafe URL syntax', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', '0.0.0.0', '224.0.0.1', '198.18.1.49', 'fd00::1', 'fe80::1']) assert.equal(allowedAddress(ip), false, ip);
  assert.equal(allowedAddress('8.8.8.8'), true);
  assert.equal(allowedAddress('127.0.0.1', true), true);
  assert.equal(allowedAddress('169.254.169.254', true), false);
  for (const url of ['http://example.com', 'https://user:pass@example.com', 'https://example.com/path', 'https://example.com?foo=1', 'https://example.com#x', 'file:///etc/passwd']) assert.throws(() => hermesUrl(url));
  assert.equal(hermesUrl('http://localhost:8123', ['localhost']), 'http://localhost:8123');
  assert.equal(hermesUrl('http://192.168.31.173:9119', ['192.168.31.173:9119']), 'http://192.168.31.173:9119');
  assert.throws(() => hermesUrl('http://192.168.31.173:9120', ['192.168.31.173:9119']), { code: 'UNSAFE_SERVER' });
  await assert.rejects(() => request('http://127.0.0.1:9120', { privateHosts: ['127.0.0.1:9119'] }), { code: 'BLOCKED_ADDRESS' });
  await assert.rejects(() => request('https://127.0.0.1/api/status'), { code: 'BLOCKED_ADDRESS' });
});
test('model normalization handles wrappers, deduplicates, and excludes unauthenticated providers', () => {
  const result = normalizeModels({ data: { providers: [{ slug: 'p', models: ['one', 'one', { model: 'two' }] }, { slug: 'x', authenticated: false, models: ['hidden'] }] } });
  assert.deepEqual(result.models.map(m => m.id), ['one', 'two']);
  assert.throws(() => normalizeModels({ error: 'bad' }));
  assert.throws(() => normalizeModels({ models: ['unsupported'] }));
  assert.deepEqual(normalizeModels({ providers: [], model: 'live-model', provider: 'live-provider' }).current, { model: 'live-model', provider: 'live-provider' });
});
test('vault persists its key and binds ciphertext to its owner', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hermes-vault-'));
  try {
    const value = vault(dir).seal('alice', 'remote-cookie-secret');
    assert.equal(vault(dir).open('alice', value), 'remote-cookie-secret');
    assert.throws(() => vault(dir).open('bob', value));
    assert.equal(value.includes('remote-cookie-secret'), false);
    assert.equal(readFileSync(join(dir, 'vault.key')).length, 32);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real API: isolation, CSRF, idempotency, conflicts, tombstones, device revocation and Hermes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hermes-api-')), config = testConfig(directory);
  const app = await createApp(config, { auth: mockAuth, hermesTransport: mockHermes });
  const login = async username => {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: config.origin }, payload: { username, password: 'test-password', device: 'Test browser' } });
    assert.equal(response.statusCode, 200, response.body);
    return { ...response.json(), cookie: response.headers['set-cookie'].split(';')[0] };
  };
  const call = (session, method, url, payload, extra = {}) => app.inject({ method, url, payload, headers: { origin: config.origin, cookie: session.cookie, 'x-csrf-token': session.csrf, ...extra } });
  try {
    assert.equal((await app.inject('/api/tasks')).statusCode, 401);
    assert.deepEqual((await app.inject('/api/auth/capabilities')).json(), { registration: true, passwordRecovery: false, recoveryReason: 'APP_USER_RECOVERY_UNAVAILABLE' });
    const registration = { username: 'alice1', name: 'Alice', password: 'test-password', confirmPassword: 'test-password', qq: '12345678' };
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/register', payload: registration })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin: config.origin }, payload: { ...registration, confirmPassword: 'mismatch' } })).statusCode, 400);
    const registered = await app.inject({ method: 'POST', url: '/api/auth/register', headers: { origin: config.origin }, payload: registration });
    assert.equal(registered.statusCode, 200); assert.equal(registered.headers['set-cookie'], undefined);
    assert.equal((await app.inject({ method: 'POST', url: '/api/auth/login', payload: {} })).statusCode, 403);
    const alice = await login('alice'), bob = await login('bob');
    assert.notEqual(alice.user.id, bob.user.id);
    assert.equal((await call(alice, 'GET', '/api/tasks', undefined, { 'x-workspace-user': bob.user.id })).statusCode, 409);
    const task = { id: randomUUID(), title: 'Write release notes', scheduledAt: '2026-09-18T09:00:00+08:00', timeZone: 'Asia/Shanghai', minutes: 30, version: 0, completed: false, deleted: false };
    const key = randomUUID();
    assert.equal((await call(alice, 'POST', '/api/tasks', task, { 'idempotency-key': key, 'x-csrf-token': 'wrong' })).statusCode, 403);
    const created = await call(alice, 'POST', '/api/tasks', task, { 'idempotency-key': key });
    assert.equal(created.statusCode, 200, created.body);
    assert.equal(created.json().task.version, 1);
    assert.deepEqual((await call(alice, 'POST', '/api/tasks', task, { 'idempotency-key': key })).json(), created.json());
    assert.equal((await call(alice, 'POST', '/api/tasks', { ...task, title: 'different' }, { 'idempotency-key': key })).statusCode, 409);
    assert.equal((await call(bob, 'GET', '/api/tasks')).json().tasks.length, 0);
    assert.equal((await call(bob, 'GET', '/api/sync?cursor=0')).json().changes.length, 0);
    const edited = { ...task, version: 1, completed: true };
    assert.equal((await call(alice, 'POST', '/api/tasks', edited, { 'idempotency-key': randomUUID() })).statusCode, 200);
    assert.equal((await call(alice, 'POST', '/api/tasks', edited, { 'idempotency-key': randomUUID() })).statusCode, 409);
    const synced = (await call(alice, 'GET', '/api/sync?cursor=1')).json();
    assert.equal(synced.changes[0].completed, true); assert.equal(synced.cursor, 2);
    assert.equal((await call(alice, 'POST', '/api/tasks', { ...edited, version: 2, deleted: true }, { 'idempotency-key': randomUUID() })).statusCode, 200);
    assert.equal((await call(alice, 'GET', '/api/tasks')).json().tasks.length, 0);
    assert.equal((await call(alice, 'GET', '/api/sync?cursor=2')).json().changes[0].deleted, true);
    const second = await login('alice');
    await call(bob, 'DELETE', `/api/devices/${second.sessionId}`);
    assert.equal((await call(second, 'GET', '/api/me')).statusCode, 200);
    await call(alice, 'DELETE', `/api/devices/${second.sessionId}`);
    assert.equal((await call(second, 'GET', '/api/me')).statusCode, 401);
    const connect = await call(alice, 'POST', '/api/hermes/connect', { origin: 'https://hermes.example.test', username: 'remote-user', password: 'hermes-test-password' });
    assert.equal(connect.statusCode, 200, connect.body);
    assert.equal(connect.body.includes('secret-cookie'), false); assert.equal(connect.body.includes('hermes-test-password'), false);
    assert.equal((await call(bob, 'GET', '/api/hermes')).json().connected, false);
    assert.equal((await call(bob, 'POST', '/api/hermes/models/refresh')).statusCode, 409);
    const models = await call(alice, 'POST', '/api/hermes/models/refresh');
    assert.equal(models.json().models.length, 2, models.body);
    assert.equal((await call(alice, 'PUT', '/api/hermes/model-preference', { model: 'invented', provider: 'p' })).statusCode, 400);
    const preference = await call(alice, 'PUT', '/api/hermes/model-preference', { model: 'fixture-model-b', provider: 'test-provider' });
    assert.equal(preference.json().applied, false);
    assert.equal((await call(alice, 'DELETE', '/api/hermes')).json().upstreamRevoked, true);
    for (const path of ['/.env.local', '/server/core.mjs', '/api.php', '/.runtime/vault.key', '/assets/../.env.local']) assert.notEqual((await app.inject(path)).statusCode, 200, path);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('restart preserves tasks and encrypted Hermes credentials; expired sessions are rejected', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hermes-restart-')), config = testConfig(directory);
  let app = await createApp(config, { auth: mockAuth, hermesTransport: mockHermes });
  try {
    const response = await app.inject({ method: 'POST', url: '/api/auth/login', headers: { origin: config.origin }, payload: { username: 'alice', password: 'test-password' } });
    const identity = response.json();
    const headers = { origin: config.origin, cookie: response.headers['set-cookie'].split(';')[0], 'x-csrf-token': identity.csrf };
    await app.inject({ method: 'POST', url: '/api/tasks', headers: { ...headers, 'idempotency-key': randomUUID() }, payload: { id: randomUUID(), version: 0, title: 'Survive restart', scheduledAt: null, minutes: 30, timeZone: 'UTC', completed: false } });
    await app.inject({ method: 'POST', url: '/api/hermes/connect', headers, payload: { origin: 'https://hermes.example.test', username: 'remote-user', password: 'hermes-test-password' } });
    await app.close();
    app = await createApp(config, { auth: mockAuth, hermesTransport: mockHermes });
    assert.equal((await app.inject({ url: '/api/tasks', headers })).json().tasks[0].title, 'Survive restart');
    assert.equal((await app.inject({ method: 'POST', url: '/api/hermes/models/refresh', headers })).json().models.length, 2);
    await app.close();
    const db = new DatabaseSync(join(directory, 'workbench.sqlite'));
    const row = db.prepare('SELECT * FROM connections').get();
    assert.equal(row.jar.includes('secret-cookie'), false);
    assert.equal(JSON.stringify(row).includes('hermes-test-password'), false);
    assert.equal(db.prepare('SELECT token FROM sessions').get().token.includes(headers.cookie.split('=')[1]), false);
    db.prepare('UPDATE sessions SET expires=0').run(); db.close();
    app = await createApp(config, { auth: mockAuth, hermesTransport: mockHermes });
    assert.equal((await app.inject({ url: '/api/me', headers })).statusCode, 401);
  } finally { await app.close(); rmSync(directory, { recursive: true, force: true }); }
});
