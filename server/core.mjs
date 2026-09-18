import { randomBytes, createHash, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class Fault extends Error {
  constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
export const token = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export const md5 = value => createHash('md5').update(value).digest('hex');
export function equal(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
export function configuration(env = process.env) {
  const origin = env.PUBLIC_ORIGIN || 'http://127.0.0.1:4317';
  const authUrl = new URL(env.AUTH_BASE_URL || 'https://api.didichou.site/api.php');
  if (authUrl.protocol !== 'https:' || authUrl.username || authUrl.password) throw new Error('AUTH_BASE_URL must use HTTPS');
  if (!env.AUTH_APP_SECRET) throw new Error('AUTH_APP_SECRET is required');
  if (env.AUTH_ENCODING && env.AUTH_ENCODING !== 'plain') throw new Error('Only plain auth encoding is supported');
  const secure = env.SECURE_COOKIES === 'true';
  const publicUrl = new URL(origin);
  if (publicUrl.origin !== origin) throw new Error('PUBLIC_ORIGIN must be an origin');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname) && (!secure || publicUrl.protocol !== 'https:')) throw new Error('Remote deployments require HTTPS and secure cookies');
  return { host: env.HOST || '127.0.0.1', port: Number(env.PORT || 4317), origin, secure,
    authUrl: authUrl.href, appId: env.AUTH_APP_ID || '10016', secret: env.AUTH_APP_SECRET,
    tolerance: Number(env.AUTH_RESPONSE_CLOCK_TOLERANCE_SECONDS || 300), ttl: Number(env.SESSION_TTL_SECONDS || 28800),
    dataDir: resolve(env.DATA_DIR || '.runtime'), privateHosts: (env.HERMES_PRIVATE_HOSTS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean) };
}
export function vault(directory) {
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, 'vault.key');
  try { writeFileSync(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const key = readFileSync(path);
  if (key.length !== 32) throw new Error('Invalid vault key');
  return {
    seal(owner, value) {
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(owner));
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
    },
    open(owner, value) {
      const bytes = Buffer.from(value, 'base64'), cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAAD(Buffer.from(owner)); cipher.setAuthTag(bytes.subarray(12, 28));
      return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8');
    }
  };
}
