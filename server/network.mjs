import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { Fault } from './core.mjs';

export function allowedAddress(address, allowPrivate = false) {
  let ip;
  try { ip = ipaddr.process(address); } catch { return false; }
  const range = ip.range();
  return range === 'unicast' || (allowPrivate && ['private', 'uniqueLocal', 'loopback'].includes(range));
}
function privateAllowed(url, hosts) {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return hosts.includes(host) || hosts.includes(url.host.toLowerCase());
}
export function hermesUrl(input, privateHosts = []) {
  let url;
  try { url = new URL(input); } catch { throw new Fault(400, 'INVALID_SERVER', 'Hermes server URL is invalid'); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      !['https:', 'http:'].includes(url.protocol) || (url.protocol === 'http:' && !privateAllowed(url, privateHosts))) {
    throw new Fault(400, 'UNSAFE_SERVER', 'Use an HTTPS server origin; LAN HTTP requires an administrator allowlist');
  }
  return url.origin;
}
// Resolve once per request and pin the selected address, including TLS requests.
export async function resolveTarget(urlInput, { privateHosts = [], trustedAuth = false } = {}) {
  const url = new URL(urlInput), host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const addresses = await lookup(host, { all: true }).catch(() => { throw new Fault(502, 'DNS_FAILED', 'Server hostname could not be resolved'); });
  // Local proxy software can resolve fixed, operator-configured services to RFC 2544 fake IPs.
  // User-provided Hermes URLs never receive this exception.
  if (!addresses.length || addresses.some(a => !allowedAddress(a.address, privateAllowed(url, privateHosts)) &&
      !(trustedAuth && ipaddr.process(a.address).kind() === 'ipv4' && ipaddr.process(a.address).match(ipaddr.parseCIDR('198.18.0.0/15'))))) throw new Fault(400, 'BLOCKED_ADDRESS', 'Server address is not permitted');
  const pinned = addresses[0];
  return (_name, opts, done) => opts.all ? done(null, [pinned]) : done(null, pinned.address, pinned.family);
}
export async function request(urlInput, { method = 'GET', headers = {}, body, privateHosts = [], trustedAuth = false } = {}) {
  const url = new URL(urlInput);
  const lookup = await resolveTarget(url, { privateHosts, trustedAuth });
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(url, { method, headers, agent: false,
      lookup }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) req.destroy(new Fault(502, 'RESPONSE_TOO_LARGE', 'Remote response exceeds size limit'));
        else chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
    });
    const timer = setTimeout(() => req.destroy(new Fault(504, 'UPSTREAM_TIMEOUT', 'Remote server timed out')), 15000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', e => reject(e instanceof Fault ? e : new Fault(502, 'UPSTREAM_UNAVAILABLE', 'Could not connect to remote server')));
    req.end(body);
  });
}
export function jsonResponse(response) {
  try { return JSON.parse(response.text); } catch { throw new Fault(502, 'INVALID_UPSTREAM_RESPONSE', 'Remote server did not return JSON'); }
}
