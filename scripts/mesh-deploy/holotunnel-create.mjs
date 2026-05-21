#!/usr/bin/env node
/**
 * holotunnel-create.mjs — thin wrapper that invokes holo_tunnel_create
 * via the @holoscript/mcp-server REST API and prints JSON to stdout.
 *
 * Used by vast-launch-paper-26.ps1 and vast-reconnect-paper-26.ps1 so they
 * can create a HoloTunnel without knowing MCP internals.
 *
 * Usage:
 *   node scripts/mesh-deploy/holotunnel-create.mjs \
 *     --port 4426 \
 *     --session-name "paper26-sim"
 *
 * Output (stdout):
 *   { "url": "https://...", "liveUrl": "...", "tunnelId": "...", "sharePacket": {...} }
 *
 * On failure exits 1 and prints error to stderr.
 *
 * Environment:
 *   HOLOSCRIPT_API_KEY — required for MCP auth
 *   MCP_BASE_URL       — optional, defaults to https://mcp.holoscript.net
 */

import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Args
// ─────────────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  allowPositionals: false,
  options: {
    port:           { type: 'string', default: '4426' },
    'session-name': { type: 'string', default: 'paper26-sim' },
    'local-host':   { type: 'string', default: 'localhost' },
    'expires-at':   { type: 'string', default: '' },
  },
});

const port        = parseInt(values['port'], 10);
const sessionName = values['session-name'];
const localHost   = values['local-host'];
const expiresAt   = values['expires-at'] || undefined;

// ─────────────────────────────────────────────────────────────────────────────
// Load env (try .env in repo root)
// ─────────────────────────────────────────────────────────────────────────────

function loadEnv() {
  const roots = [
    join(__dirname, '../../.env'),    // HoloScript/.env
    join(__dirname, '../../../.env'), // parent
  ];
  for (const envPath of roots) {
    try {
      const text = readFileSync(envPath, 'utf8');
      for (const line of text.split('\n')) {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
        }
      }
      break;
    } catch { /* not found */ }
  }
}

loadEnv();

const apiKey  = process.env.HOLOSCRIPT_API_KEY;
const mcpBase = process.env.MCP_BASE_URL || 'https://mcp.holoscript.net';

if (!apiKey) {
  process.stderr.write('ERROR: HOLOSCRIPT_API_KEY not set\n');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Call holo_tunnel_create via MCP JSON-RPC POST /mcp
// ─────────────────────────────────────────────────────────────────────────────

const body = JSON.stringify({
  jsonrpc: '2.0',
  id:      1,
  method:  'tools/call',
  params:  {
    name:      'holo_tunnel_create',
    arguments: {
      port,
      localHost,
      sessionName,
      createdBy: 'agent',
      ...(expiresAt ? { expiresAt } : {}),
    },
  },
});

try {
  const resp = await fetch(`${mcpBase}/mcp`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'x-mcp-api-key': apiKey,
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    process.stderr.write(`ERROR: MCP returned ${resp.status}: ${text}\n`);
    process.exit(1);
  }

  const rpc = await resp.json();
  if (rpc.error) {
    process.stderr.write(`ERROR: MCP error: ${JSON.stringify(rpc.error)}\n`);
    process.exit(1);
  }

  // The MCP tool returns content[0].text as a JSON string
  const content = rpc.result?.content;
  const rawText = Array.isArray(content) ? content[0]?.text : null;
  if (!rawText) {
    process.stderr.write(`ERROR: Unexpected MCP response shape: ${JSON.stringify(rpc)}\n`);
    process.exit(1);
  }

  const result = JSON.parse(rawText);
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(0);

} catch (err) {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.exit(1);
}
