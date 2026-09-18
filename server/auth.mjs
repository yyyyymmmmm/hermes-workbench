import { token, md5, equal, Fault } from './core.mjs';
import { request, jsonResponse } from './network.mjs';

const excluded = new Set(['sign', 'app', 'api', 'value', 'PHPSESSID', 'sec_defend', 'sidenav-state']);
export function sign(fields, secret) {
  return md5(Object.entries(fields).filter(([key]) => !excluded.has(key)).map(([key, value]) => `${key}=${value}&`).join('') + secret);
}
export function verify(response, nonce, config) {
  if (!Number.isInteger(response.time) || Math.abs(Date.now() / 1000 - response.time) > config.tolerance ||
      typeof response.check !== 'string' || !equal(response.check, md5(`${response.time}${config.secret}${nonce}`))) {
    throw new Fault(502, 'AUTH_INTEGRITY_FAILED', 'Authentication response verification failed');
  }
  return response;
}
export function authAdapter(config, transport = request) {
  async function call(api, fields = {}) {
    const nonce = token();
    const values = { ...fields, t: Math.floor(Date.now() / 1000), value: nonce };
    values.sign = sign(values, config.secret);
    const url = new URL(config.authUrl); url.searchParams.set('api', api); url.searchParams.set('app', config.appId);
    const response = await transport(url, { method: 'POST', trustedAuth: true, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(values).toString() });
    if (response.status !== 200) throw new Fault(502, 'AUTH_UNAVAILABLE', 'Authentication service is unavailable');
    return verify(jsonResponse(response), nonce, config);
  }
  return {
    probe: () => call('ini'),
    async register(input) {
      const data = await call('userreg', { name: input.name, user: input.username, password: input.password, qq: input.qq });
      const code = Number(data.code);
      if (code === 200) return { registered: true };
      if (code === 115 || code === 174) throw new Fault(409, 'REGISTRATION_CONFLICT', 'Account or contact is already registered');
      if (code === 117) throw new Fault(429, 'REGISTRATION_IP_LIMIT', 'Authentication service limits registration from this IP');
      if ([109, 110, 111, 116, 119].includes(code)) throw new Fault(400, 'REGISTRATION_INVALID', 'Registration fields were rejected by the authentication service');
      throw new Fault(502, 'REGISTRATION_REJECTED', 'Authentication service did not complete registration');
    },
    async login(user, password) {
      const data = await call('userlogon', { user, password });
      if (Number(data.code) !== 200) throw new Fault(401, 'INVALID_CREDENTIALS', 'Account or password is invalid, or the account is unavailable');
      if (!data.msg || typeof data.msg.user !== 'string' || data.msg.user !== user) throw new Fault(502, 'AUTH_IDENTITY_MISMATCH', 'Authentication identity did not match');
      return { username: data.msg.user, name: typeof data.msg.name === 'string' ? data.msg.name.slice(0, 100) : user };
    }
  };
}
