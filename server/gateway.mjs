import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';
import { Fault } from './core.mjs';
import { resolveTarget } from './network.mjs';

export async function openGateway(ticket, privateHosts, receive, closed) {
  const lookup = await resolveTarget(ticket.url, { privateHosts });
  const socket = new WebSocket(ticket.url, { lookup, followRedirects: false, maxPayload: 1024 * 1024,
    handshakeTimeout: 15000, perMessageDeflate: false, headers: ticket.cookie ? { cookie: ticket.cookie } : {} });
  const pending = new Map(); let ready = false, intentional = false;
  const client = {
    rpc(method, params, timeout = 20000) {
      if (socket.readyState !== WebSocket.OPEN) return Promise.reject(new Fault(502, 'GATEWAY_CLOSED', 'Gateway connection closed'));
      const id = randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Fault(504, 'GATEWAY_TIMEOUT', 'Gateway request timed out')); }, timeout);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }), error => {
          if (error) { clearTimeout(timer); pending.delete(id); reject(new Fault(502, 'GATEWAY_SEND_FAILED', 'Gateway send failed')); }
        });
      });
    },
    respond(id, result) {
      return new Promise((resolve, reject) => {
        if (socket.readyState !== WebSocket.OPEN) return reject(new Fault(502, 'GATEWAY_CLOSED', 'Gateway connection closed'));
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, result }), error => error ? reject(new Fault(502, 'GATEWAY_SEND_FAILED', 'Gateway send failed')) : resolve());
      });
    },
    close() { intentional = true; socket.terminate(); }
  };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.close(); reject(new Fault(504, 'GATEWAY_NOT_READY', 'Gateway ready event timed out')); }, 15000);
    socket.on('message', bytes => {
      let frame;
      try { frame = JSON.parse(bytes.toString()); } catch { client.close(); reject(new Fault(502, 'GATEWAY_BAD_FRAME', 'Invalid gateway frame')); if (ready) closed(); return; }
      if (!frame || typeof frame !== 'object' || Array.isArray(frame) || frame.jsonrpc !== '2.0') return;
      if (!frame.method && pending.has(frame.id)) {
        const call = pending.get(frame.id); pending.delete(frame.id); clearTimeout(call.timer);
        if (frame.error || frame.result?.ok === false || frame.result?.success === false || frame.result?.accepted === false) call.reject(new Fault(502, 'GATEWAY_REJECTED', 'Gateway rejected the command'));
        else call.resolve(frame.result || {});
      } else if (frame.method === 'event' && frame.params?.type === 'gateway.ready') {
        clearTimeout(timer); ready = true; resolve(client);
      } else if (ready) receive(frame);
    });
    socket.on('error', () => { if (!ready) { clearTimeout(timer); reject(new Fault(502, 'GATEWAY_UNAVAILABLE', 'Could not open gateway WebSocket')); } });
    socket.on('close', () => {
      clearTimeout(timer);
      for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Fault(502, 'GATEWAY_CLOSED', 'Gateway connection closed')); }
      pending.clear();
      if (!ready) reject(new Fault(502, 'GATEWAY_CLOSED', 'Gateway closed before ready'));
      else if (!intentional) closed();
    });
  });
}
