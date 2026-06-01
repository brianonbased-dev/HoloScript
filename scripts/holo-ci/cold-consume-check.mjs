#!/usr/bin/env node
/**
 * cold-consume-check.mjs — generic cold-install falsifier for any @holoscript/* package.
 *
 * The W.667 regression (core's `.` barrel eager-importing an OPTIONAL peer, breaking a
 * peerless `npm install`) is a SHAPE, not a one-off: core / mesh / platform each declare
 * @holoscript/{engine,mesh,...30 plugins} as OPTIONAL peers, and any eager value-import of
 * one onto the public barrel re-breaks the cold on-ramp. It regressed 3× on core alone
 * (W.673/W.675/W.681) and was fenced for core only. This generalizes the fence:
 *
 *   For a given package, PACK it, cold-install the tarball into a clean dir with NO optional
 *   peers, then assert (a) the main barrel imports and exports > 0 symbols (loads without
 *   crashing), and (b) EVERY optional @holoscript/* peer it declares is ABSENT (rejects on
 *   import) — i.e. nothing eager-pulled an optional peer at module-load.
 *
 * Self-configuring: it reads the package's own peerDependenciesMeta{optional} ∪
 * optionalDependencies, so new optional peers are covered automatically — no per-package list
 * to keep in sync (architecture-beats-alignment, the founder ruling that drove core@8.0.0).
 *
 * Usage:  node scripts/holo-ci/cold-consume-check.mjs <pkgDir> <pkgName>
 *   pkgDir  : workspace package dir relative to repo root, e.g. packages/core
 *   pkgName : published name to import, e.g. @holoscript/core
 *
 * Requires the package built first (its dist/ present). Exit 0 iff cold-consumable.
 * Mirrors ai-ecosystem/scripts/holo-ci/cold-repro-onramp.mjs (which packs a single pkg);
 * this one is peer-aware and assertion-deep so the gate can't false-green on parseHolo alone.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.env.HOLO_ROOT || process.cwd();
const RAW_DIR = process.argv[2];
const PKG_NAME = process.argv[3];
if (!RAW_DIR || !PKG_NAME) {
  console.error('usage: cold-consume-check.mjs <pkgDir> <pkgName>');
  process.exit(2);
}
const PKG_DIR = path.isAbsolute(RAW_DIR) ? RAW_DIR : path.join(ROOT, RAW_DIR);

let pkgJson;
try {
  pkgJson = JSON.parse(fs.readFileSync(path.join(PKG_DIR, 'package.json'), 'utf8'));
} catch (e) {
  console.error(`[cold-consume] cannot read ${PKG_DIR}/package.json: ${e.message}`);
  process.exit(2);
}

// Optional @holoscript peers this package declares — the absence-set we falsify against.
const meta = pkgJson.peerDependenciesMeta || {};
const optionalPeers = [
  ...new Set([
    ...Object.keys(meta).filter((k) => meta[k] && meta[k].optional),
    ...Object.keys(pkgJson.optionalDependencies || {}),
  ]),
].filter((p) => /^@holoscript\//.test(p));

console.log(`\n[cold-consume] ${PKG_NAME}: pack + cold-install (no optional peers) + assert barrel loads + ${optionalPeers.length} optional peer(s) absent`);

if (!fs.existsSync(path.join(PKG_DIR, 'dist'))) {
  console.error(`  [FAIL] ${PKG_DIR}/dist missing — build the package first`);
  process.exit(1);
}

const sh = (cmd, cwd, t = 240000) =>
  execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: t });

const DIR = path.join(os.tmpdir(), `cold-consume-${process.pid}-${path.basename(PKG_DIR)}`);

// pnpm pack rewrites workspace:* specs to concrete ranges (simulates the publish rewrite);
// npm pack would leave workspace:* and die on install. (W.669)
let tgz;
try {
  const out = sh('pnpm pack', PKG_DIR).trim().split('\n').filter(Boolean);
  tgz = path.join(PKG_DIR, out[out.length - 1].trim());
  if (!fs.existsSync(tgz)) throw new Error(`tarball not found: ${tgz}`);
} catch (e) {
  console.error(`  [FAIL] pnpm pack — ${String(e.stdout || e.stderr || e.message).slice(0, 200)}`);
  process.exit(1);
}

fs.rmSync(DIR, { recursive: true, force: true });
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(
  path.join(DIR, 'package.json'),
  JSON.stringify({ name: 'cold-consume', version: '1.0.0', private: true }, null, 2)
);

let ok = true;
try {
  sh(`npm install "${tgz}" --no-audit --no-fund`, DIR);
} catch (e) {
  console.error(
    `  [FAIL] cold npm install — ${String(e.stdout || e.stderr || e.message).split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 220)}`
  );
  fs.rmSync(tgz, { force: true });
  fs.rmSync(DIR, { recursive: true, force: true });
  process.exit(1);
}

const consume = `
try {
  const m = await import(${JSON.stringify(PKG_NAME)});
  const n = Object.keys(m).length;
  if (n === 0) throw new Error('cold barrel exported 0 symbols — failed to load');
  const leaked = [];
  for (const peer of ${JSON.stringify(optionalPeers)}) {
    try { await import(peer); leaked.push(peer); } catch { /* absent — good */ }
  }
  if (leaked.length) throw new Error('optional peer(s) RESOLVED on cold install (barrel leak): ' + leaked.join(', '));
  process.stdout.write('COLD-CONSUMABLE exports=' + n + ' optional-peers-absent=' + ${optionalPeers.length});
} catch (e) {
  process.stdout.write('COLD_FAIL ' + (e && e.message ? e.message : String(e)).split('\\n')[0]);
  process.exit(2);
}
`;
fs.writeFileSync(path.join(DIR, 'consume.mjs'), consume);

let detail = '';
try {
  detail = sh('node consume.mjs', DIR, 60000).trim();
} catch (e) {
  const out = String(e.stdout || e.stderr || e.message).split('\n').filter(Boolean);
  detail = out.find((l) => l.startsWith('COLD_FAIL')) || out.slice(-1)[0] || 'unknown failure';
  ok = false;
}

fs.rmSync(tgz, { force: true });
fs.rmSync(DIR, { recursive: true, force: true });

console.log(`  ${ok ? '[ok]  ' : '[FAIL]'} ${detail}`);
console.log(`\nRESULT: ${ok ? `COLD-CONSUMABLE — ${PKG_NAME} installs + imports clean with no optional peers` : `BROKEN — ${PKG_NAME} is not cold-consumable (fix before publishing)`}`);
process.exit(ok ? 0 : 1);
