#!/usr/bin/env node
// THE GOLD GAME — portable launcher server (CommonJS; SEA-compilable).
// Works two ways with no code change:
//   * `node server.cjs`                  (machines with Node)
//   * GOLD-GAME-Server.exe (Node SEA)    (any Windows machine, no Node install)
// Resolves the game files + the REAL GOLD vault relative to its own location on
// the drive, so it is drive-letter independent. Node built-ins only.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { exec } = require('node:child_process');

// When compiled with SEA, __dirname is virtual — resolve from the exe location.
let isSea = false;
try { isSea = require('node:sea').isSea(); } catch (_) { isSea = false; }
const here = isSea ? path.dirname(process.execPath) : __dirname; // <drive>/GOLD-GAME
const VAULT = path.join(here, '..', 'GOLD');                     // <drive>/GOLD (sibling, read-only)
// Gate-2 graduate verb operates on a WRITABLE SANDBOX vault (never the governed D:/GOLD).
let vaultOps = null;
try { vaultOps = require('./vault-ops.cjs'); } catch (_) { /* optional; absent in some bundles */ }
const SANDBOX = path.join(here, 'vault-sandbox');
function ensureSandbox() { if (vaultOps && !fs.existsSync(path.join(SANDBOX, 'bronze'))) vaultOps.buildSandbox(SANDBOX); }

function vaultState() {
  const tiers = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const counts = {};
  for (const t of tiers) {
    try { counts[t] = fs.existsSync(path.join(VAULT, t)) ? fs.readdirSync(path.join(VAULT, t)).filter((f) => f.endsWith('.md')).length : 0; }
    catch (_) { counts[t] = 0; }
  }
  let total = null, asOf = null;
  try {
    const idx = fs.readFileSync(path.join(VAULT, 'INDEX.md'), 'utf8');
    const m = idx.match(/\*\*([\d,]+)\s+entries\*\*/); if (m) total = m[1];
    const d = idx.match(/Last updated\*\*:\s*([\d-]+)/); if (d) asOf = d[1];
  } catch (_) { /* vault not on this machine */ }
  return { connected: fs.existsSync(VAULT), vaultPath: VAULT, total, asOf, tierDirCounts: counts };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain' };
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/api/vault') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(vaultState())); return;
  }
  if (url === '/api/vault-game') { // the playable sandbox vault state
    if (!vaultOps) { res.writeHead(503); res.end('{"error":"vault-ops unavailable"}'); return; }
    ensureSandbox();
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(vaultOps.readState(SANDBOX))); return;
  }
  if (url === '/api/graduate' && req.method === 'POST') { // THE VERB: a play-action -> a real (sandbox) vault op
    if (!vaultOps) { res.writeHead(503); res.end('{"ok":false,"error":"vault-ops unavailable"}'); return; }
    let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
      let p = {}; try { p = JSON.parse(body || '{}'); } catch (_) {}
      ensureSandbox();
      const r = vaultOps.graduate(SANDBOX, p.entry, p.by || 'curator');
      res.writeHead(r.ok ? 200 : 400, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r));
    }); return;
  }
  const file = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
  const p = path.join(here, file);
  if (!p.startsWith(here) || !fs.existsSync(p)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

function listen(port, tries) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries > 0) listen(port + 1, tries - 1);
    else { console.error('Could not start server:', e.message); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + port + '/';
    const v = vaultState();
    console.log('\n  THE GOLD GAME - server running');
    console.log('  ' + url);
    console.log('  vault: ' + (v.connected ? 'connected (' + v.vaultPath + ', ' + (v.total || '?') + ' entries)' : 'not found - using the embedded snapshot'));
    console.log('  (close this window to stop the game)\n');
    const cmd = process.platform === 'win32' ? 'start "" "' + url + '"'
      : process.platform === 'darwin' ? 'open "' + url + '"' : 'xdg-open "' + url + '"';
    exec(cmd, () => {});
  });
}
listen(8787, 12);
