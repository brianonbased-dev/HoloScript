#!/usr/bin/env node
/**
 * holotunnel-client.mjs — HoloTunnel local bridge client.
 *
 * Connects to the HoloTunnel relay on Railway and forwards all incoming
 * HTTP requests to the local Next.js dev server (default: localhost:3101).
 *
 * Usage:
 *   node packages/studio/scripts/holotunnel-client.mjs
 *   node packages/studio/scripts/holotunnel-client.mjs --port 3101
 *   node packages/studio/scripts/holotunnel-client.mjs --relay wss://...
 *
 * The relay assigns a tunnel ID and prints a /live bookmark URL.
 * On Quest Browser, open: https://mcp-orchestrator-production-45f9.up.railway.app/live
 */

import { WebSocket } from 'ws';
import http from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_RELAY_URL = process.env.HOLOTUNNEL_RELAY ?? 'wss://mcp-orchestrator-production-45f9.up.railway.app/tunnel-ws';
const LOCAL_HOST = process.env.HOLOTUNNEL_HOST ?? 'localhost';
const DEFAULT_LOCAL_PORT = parseInt(process.env.HOLOTUNNEL_PORT ?? '3101', 10);
const PING_TIMEOUT_MS = 40_000; // disconnect if no ping in 40s
let localPort = DEFAULT_LOCAL_PORT;
let relayUrl = DEFAULT_RELAY_URL;
let clientToken = process.env.HOLOTUNNEL_CLIENT_TOKEN ?? '';
let worldId = process.env.HOLOTUNNEL_WORLD_ID ?? 'studio-local-preview';
let sessionName = process.env.HOLOTUNNEL_SESSION_NAME ?? 'HoloScript Studio Preview';
let sourceRef = process.env.HOLOTUNNEL_SOURCE_REF ?? '';
let expiresAt = process.env.HOLOTUNNEL_EXPIRES_AT ?? '';
let sharePacketPath = process.env.HOLOTUNNEL_SHARE_PACKET_PATH ?? '';

// Parse CLI args
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--port' && process.argv[i + 1]) {
    const port = parseInt(process.argv[i + 1], 10);
    if (!Number.isNaN(port)) localPort = port;
    i++;
  } else if (process.argv[i] === '--relay' && process.argv[i + 1]) {
    relayUrl = process.argv[i + 1];
    i++;
  } else if (process.argv[i] === '--token' && process.argv[i + 1]) {
    clientToken = process.argv[i + 1];
    i++;
  } else if (process.argv[i] === '--world-id' && process.argv[i + 1]) {
    worldId = process.argv[i + 1];
    i++;
  } else if (process.argv[i] === '--session-name' && process.argv[i + 1]) {
    sessionName = process.argv[i + 1];
    i++;
  } else if (process.argv[i] === '--source-ref' && process.argv[i + 1]) {
    sourceRef = process.argv[i + 1];
    i++;
  } else if (process.argv[i] === '--expires-at' && process.argv[i + 1]) {
    expiresAt = process.argv[i + 1];
    i++;
  } else if (process.argv[i] === '--share-packet' && process.argv[i + 1]) {
    sharePacketPath = process.argv[i + 1];
    i++;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(...args) {
  process.stdout.write(`[HoloTunnel] ${args.join(' ')}\n`);
}

function normalizeRelayBase(value) {
  const normalized = value
    .trim()
    .replace(/^wss:/, 'https:')
    .replace(/^ws:/, 'http:')
    .replace(/\/+$/, '');
  return normalized.endsWith('/tunnel-ws')
    ? normalized.slice(0, -'/tunnel-ws'.length)
    : normalized;
}

function buildSharePacket({ publicUrl }) {
  const relayBase = normalizeRelayBase(relayUrl);
  return {
    schemaVersion: 'holoscript.holotunnel.share-packet.v1',
    worldId,
    sessionName,
    stableUrl: `${relayBase}/live`,
    directUrl: publicUrl,
    ...(sourceRef ? { sourceRef } : {}),
    createdBy: 'studio',
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function persistSharePacket(packet) {
  if (!sharePacketPath) return;
  const resolved = path.resolve(sharePacketPath);
  mkdirSync(path.dirname(resolved), { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
  log(`share packet:      ${resolved}`);
}

/** Forward one HTTP request to the local dev server, return status+headers+body. */
function forwardRequest({ method, path, headers, body }) {
  return new Promise((resolve) => {
    const buf = body ? Buffer.from(body, 'base64') : Buffer.alloc(0);
    // Strip accept-encoding so the dev server returns plain (uncompressed) content.
    // The relay does HTML rewriting on the raw bytes — if the dev server sends
    // gzip/brotli the rewriting corrupts the body and the browser gets a blank page.
    // The relay's own compression middleware re-compresses the rewritten response.
    const forwardHeaders = { ...headers };
    delete forwardHeaders['accept-encoding'];
    delete forwardHeaders['accept-encoding'.toLowerCase()];

    const opts = {
      hostname: LOCAL_HOST,
      port: localPort,
      path,
      method,
      headers: {
        ...forwardHeaders,
        host: `${LOCAL_HOST}:${localPort}`,
        'content-length': String(buf.length),
      },
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks);
        const hdrs = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === 'string') hdrs[k] = v;
          else if (Array.isArray(v)) hdrs[k] = v.join(', ');
        }
        resolve({ status: res.statusCode ?? 502, headers: hdrs, body: raw.toString('base64') });
      });
    });

    req.on('error', (err) => {
      log(`⚠  local request failed: ${err.message}`);
      const body502 = Buffer.from(
        `<html><body style="font:14px monospace;padding:1rem;background:#1a0010;color:#f87;"><h2>HoloTunnel: Local Server Unreachable</h2>` +
        `<p>Cannot reach http://${LOCAL_HOST}:${localPort}${path}</p>` +
        `<p>Error: ${err.message}</p>` +
        `<p>Is the Next.js dev server running? → <code>pnpm dev</code> in packages/studio</p></body></html>`
      );
      resolve({
        status: 502,
        headers: { 'content-type': 'text/html; charset=utf-8' },
        body: body502.toString('base64'),
      });
    });

    if (buf.length > 0) req.write(buf);
    req.end();
  });
}

// ── Connection loop ───────────────────────────────────────────────────────────

let reconnectDelay = 1000;

function connect() {
  log(`connecting to relay: ${relayUrl}`);
  log(`forwarding to:       http://${LOCAL_HOST}:${localPort}`);
  if (clientToken) log('client auth:         token configured');

  const ws = clientToken
    ? new WebSocket(relayUrl, { headers: { 'x-holotunnel-token': clientToken } })
    : new WebSocket(relayUrl);
  let pingTimer = null;
  let tunnelId = null;

  const resetPingTimer = () => {
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => {
      log('⚠  ping timeout — relay silent. Reconnecting…');
      ws.terminate();
    }, PING_TIMEOUT_MS);
  };

  ws.on('open', () => {
    log('✓  connected to relay — waiting for tunnel ID…');
    reconnectDelay = 1000;
    resetPingTimer();
  });

  ws.on('message', async (raw) => {
    resetPingTimer();
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'hello') {
      tunnelId = msg.tunnelId;
      const sharePacket = buildSharePacket({ publicUrl: msg.publicUrl });
      persistSharePacket(sharePacket);
      log('');
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log(`  Tunnel ID : ${tunnelId}`);
      log(`  Public URL: ${msg.publicUrl}`);
      log('');
      log(`  📌 Bookmark (stable): ${sharePacket.stableUrl}`);
      log(`  HoloLand share packet:`);
      log(JSON.stringify(sharePacket));
      log(`     → Open this on Quest — it always redirects to the active tunnel`);
      log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      log('');
      return;
    }

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
      return;
    }

    if (msg.type === 'request') {
      const { reqId, method, path, headers, body } = msg;
      log(`→ ${method} ${path}`);
      const result = await forwardRequest({ method, path, headers, body });
      log(`← ${result.status} ${method} ${path}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'response', reqId, ...result }));
      }
    }
  });

  ws.on('close', (code, reason) => {
    clearTimeout(pingTimer);
    log(`disconnected (code=${code}${reason?.length ? ` reason=${reason}` : ''}) — reconnecting in ${reconnectDelay / 1000}s…`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
  });

  ws.on('error', (err) => {
    log(`ws error: ${err.message}`);
  });
}

// ── Start ─────────────────────────────────────────────────────────────────────

log('HoloTunnel Client v1.0');
log(`Local dev server: http://${LOCAL_HOST}:${localPort}`);
log('');
connect();

// Keep alive
process.on('SIGINT', () => {
  log('\nshutting down.');
  process.exit(0);
});
