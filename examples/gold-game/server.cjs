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
const siblingVault = path.join(here, '..', 'GOLD');              // <drive>/GOLD (sibling, read-only)
const VAULT = process.env.GOLD_ROOT || (fs.existsSync(siblingVault) ? siblingVault : 'D:/GOLD');
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

function normalizeEntryId(raw) {
  return String(raw || '').trim().replace(/_/g, '.').replace(/-/g, '.').toUpperCase();
}

function entryStem(id) {
  return normalizeEntryId(id).toLowerCase().replace(/\./g, '_') + '.md';
}

function findEntryFile(id) {
  const wanted = entryStem(id);
  const roots = [
    'wisdom', 'patterns', 'gotchas', 'architectures', 'protocols',
    'bronze', 'silver', 'gold', 'platinum', 'diamond',
    'graduated',
  ];
  const seen = new Set();
  const walk = (dir) => {
    const resolved = path.resolve(dir);
    if (seen.has(resolved) || !resolved.startsWith(path.resolve(VAULT))) return null;
    seen.add(resolved);
    let items = [];
    try { items = fs.readdirSync(resolved, { withFileTypes: true }); } catch (_) { return null; }
    for (const item of items) {
      if (item.name === '.git') continue;
      const p = path.join(resolved, item.name);
      if (item.isFile() && item.name.toLowerCase() === wanted) return p;
      if (item.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      }
    }
    return null;
  };
  for (const root of roots) {
    const found = walk(path.join(VAULT, root));
    if (found) return found;
  }
  return null;
}

function parseFrontmatter(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  if (lines[0] !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const idx = lines[i].indexOf(':');
    if (idx > 0) out[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return out;
}

function vaultEntry(id) {
  const normalized = normalizeEntryId(id);
  if (!/^[A-Z0-9]+(\.[A-Z0-9]+)+$/.test(normalized)) {
    return { connected: fs.existsSync(VAULT), id: normalized, found: false, error: 'invalid id' };
  }
  const file = findEntryFile(normalized);
  if (!file) return { connected: fs.existsSync(VAULT), id: normalized, found: false };
  const content = fs.readFileSync(file, 'utf8');
  const rel = path.relative(VAULT, file).replace(/\\/g, '/');
  const metadata = parseFrontmatter(content);
  return {
    connected: true,
    found: true,
    id: normalized,
    vaultPath: VAULT,
    relativePath: rel,
    metadata,
    // Gate 28: lineage links + provenance/receipt history surfaced for the browser.
    lineage: vaultOps ? vaultOps.lineageOf(metadata) : [],
    provenance: vaultOps ? vaultOps.provenanceOf(metadata) : {},
    bytes: Buffer.byteLength(content),
    content,
  };
}

// Gate 28: full-vault catalog (every real entry) + server-side search/filter.
let _catalogCache = null;
function vaultCatalog() {
  if (!vaultOps) return { connected: fs.existsSync(VAULT), count: 0, entries: [], facets: {} };
  if (!_catalogCache) _catalogCache = vaultOps.readVaultCatalog(VAULT);
  return { connected: fs.existsSync(VAULT), vaultPath: VAULT, ..._catalogCache };
}

const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
  if (url === '/api/vault') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(vaultState())); return;
  }
  if (url === '/api/vault-entry') {
    const data = vaultEntry(reqUrl.searchParams.get('id'));
    res.writeHead(data.found ? 200 : 404, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data)); return;
  }
  if (url === '/api/vault-list') { // Gate 28: enumerate + search/filter every entry
    const cat = vaultCatalog();
    const q = reqUrl.searchParams.get('q');
    const tier = reqUrl.searchParams.get('tier');
    const type = reqUrl.searchParams.get('type');
    const domain = reqUrl.searchParams.get('domain');
    const filtered = (q || tier || type || domain) && vaultOps
      ? vaultOps.filterCatalog(cat, { q, tier, type, domain }) : cat.entries;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ connected: cat.connected, vaultPath: cat.vaultPath,
      count: cat.count, matched: filtered.length, facets: cat.facets, entries: filtered }));
    return;
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

if (require.main === module && process.argv.includes('--help')) {
  console.log('Usage: node server.cjs  # serves THE GOLD GAME on 127.0.0.1:8787');
  console.log('APIs: /api/vault, /api/vault-list?q=&tier=&type=&domain=, /api/vault-entry?id=W.GOLD.535, /api/vault-game, POST /api/graduate');
} else if (require.main === module) listen(8787, 12);

module.exports = { vaultState, vaultEntry, vaultCatalog, findEntryFile, normalizeEntryId };
