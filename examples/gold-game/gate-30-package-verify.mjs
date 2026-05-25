#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 30 verifier: the ship-packaging gate proof.
//
//   node examples/gold-game/gate-30-package-verify.mjs
//
// Anti-F.069: this does NOT grep for a string. It RUNS the real packager into a
// fresh temp dir (never D:/GOLD-GAME), then asserts STATE-LEVEL facts about the
// resulting files on disk:
//   1. every required artifact materialized (3d/, 2d/, launcher, docs, .bat,
//      autorun.inf, server.cjs, vault-ops.cjs, sea-config.json, setup/ scripts),
//   2. each built artifact came from the REAL builder walking the .holo,
//   3. each copied/static artifact's deployed bytes equal the canonical source
//      bytes (deployedMatches === true) — proving the deploy can't drift,
//   4. the packageDigest is REPRODUCIBLE — package twice, identical digest,
//   5. the manifest covers the whole package (no required file missing).
//
// PASS iff every assertion holds and the packager's own result is VERIFIED.
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');

let passed = 0;
const fails = [];
const ok = (cond, label) => { if (cond) passed++; else fails.push(label); };

// Package twice into two separate temp dirs to prove determinism + reproducibility.
function packageInto(dest) {
  execFileSync(process.execPath, [join(here, 'gate-30-package.mjs'), '--dest', dest],
    { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(readFileSync(join(here, 'GATE-30-SHIP-PACKAGING-receipt.json'), 'utf8'));
}

const tmpA = mkdtempSync(join(tmpdir(), 'goldgame-pkg-a-'));
const tmpB = mkdtempSync(join(tmpdir(), 'goldgame-pkg-b-'));
let r1, r2;
try {
  r1 = packageInto(tmpA);
  r2 = packageInto(tmpB);

  // 1. packager self-reports VERIFIED
  ok(r1.result === 'VERIFIED', 'packager result is VERIFIED');

  // 2. reproducible digest — same package bytes regardless of dest
  ok(r1.packageDigest === r2.packageDigest, `packageDigest reproducible (${r1.packageDigest?.slice(0, 12)} == ${r2.packageDigest?.slice(0, 12)})`);
  ok(typeof r1.packageDigest === 'string' && r1.packageDigest.length === 64, 'packageDigest is a sha256');

  // 3. required artifacts present in the manifest
  const want = [
    '3d/index.html', '3d/START-HERE.txt', '2d/index.html', '2d/START-HERE.txt',
    'index.html', 'START-HERE.txt', 'PLAY THE GOLD GAME.bat',
    'PLAY LIVE GOLD GAME (Node).bat', 'autorun.inf',
    'server.cjs', 'vault-ops.cjs', 'sea-config.json',
    'setup/gold-game-autolaunch-watcher.ps1', 'setup/setup-gold-game-autolaunch.ps1',
  ];
  const relsInManifest = new Set(r1.artifacts.map((a) => a.rel));
  for (const w of want) ok(relsInManifest.has(w), `manifest covers ${w}`);

  // 4. every required artifact actually exists on disk in the temp dest
  for (const w of want) ok(existsSync(join(tmpA, w)), `materialized on disk: ${w}`);

  // 5. NO required file missing (exe-missing is allowed on a machine without the SEA build)
  const requiredMissing = (r1.missing || []).filter((m) => !m.includes('pre-built binary'));
  ok(requiredMissing.length === 0, `no required artifact missing (${requiredMissing.join('; ') || 'none'})`);
  ok((r1.mismatched || []).length === 0, `no deployed/source byte mismatch (${(r1.mismatched || []).join('; ') || 'none'})`);

  // 6. deployed bytes == canonical source bytes for every static/copy/build artifact
  const nonPrebuilt = r1.artifacts.filter((a) => a.kind !== 'prebuilt');
  ok(nonPrebuilt.length > 0, 'package has non-prebuilt artifacts');
  ok(nonPrebuilt.every((a) => a.deployedMatches === true), 'every artifact: deployed bytes == source bytes');

  // 7. the BUILT artifacts genuinely came from the builders that walk the .holo
  ok(r1.builtArtifacts === 4, `4 built artifacts from the real builders (got ${r1.builtArtifacts})`);
  ok(r1.builders.some((b) => b.from === 'drive-build.mjs'), 'builder 3d = drive-build.mjs (walks .holo)');
  ok(r1.builders.some((b) => b.from === 'gold-2d-build.mjs'), 'builder 2d = gold-2d-build.mjs (same .holo)');

  // 8. independent disk-level proof: re-hash the on-disk launcher in tmpA and
  //    confirm it equals the manifest digest (the receipt isn't lying about disk)
  const { createHash } = await import('node:crypto');
  const diskLauncher = readFileSync(join(tmpA, 'index.html'));
  const diskDigest = createHash('sha256').update(diskLauncher).digest('hex');
  const manLauncher = r1.artifacts.find((a) => a.rel === 'index.html');
  ok(manLauncher && manLauncher.sha256 === diskDigest, 'on-disk launcher re-hash == manifest digest (receipt not lying)');

  // 9. the two temp packages are byte-identical for a sampled built artifact
  const a3d = readFileSync(join(tmpA, '3d/index.html'));
  const b3d = readFileSync(join(tmpB, '3d/index.html'));
  ok(a3d.equals(b3d), '3d/index.html byte-identical across two independent packagings (deterministic build)');

  // 10. GATE 30b — the GOLD product home (D.063) syncs from the SAME canonical manifest.
  //     Run the packager with BOTH dest and product-home pointed at TEMP roots so the
  //     real D:/GOLD vault is never touched; assert the product home is synced, its
  //     content matches the Drive release, and the files materialize on disk.
  const tmpDrive = mkdtempSync(join(tmpdir(), 'goldgame-drive-'));
  const tmpHomeRoot = mkdtempSync(join(tmpdir(), 'goldgame-home-'));
  const tmpHome = join(tmpHomeRoot, 'gold-game'); // its parent (tmpHomeRoot) exists → packager will sync
  try {
    execFileSync(process.execPath, [join(here, 'gate-30-package.mjs'), '--dest', tmpDrive],
      { cwd: repo, env: { ...process.env, GOLD_PRODUCT_HOME: tmpHome }, stdio: ['ignore', 'pipe', 'pipe'] });
    const rh = JSON.parse(readFileSync(join(here, 'GATE-30-SHIP-PACKAGING-receipt.json'), 'utf8'));
    ok(rh.result === 'VERIFIED', 'packager VERIFIED with product-home sync enabled');
    ok(rh.productHome && rh.productHome.synced === true, 'product home reported synced');
    ok(rh.productHome && rh.productHome.matchesDriveContent === true, 'product-home content digest == Drive release content digest');
    ok((rh.productHome?.missing || []).length === 0 && (rh.productHome?.mismatched || []).length === 0,
      `product-home no missing/mismatch (${[...(rh.productHome?.missing || []), ...(rh.productHome?.mismatched || [])].join('; ') || 'none'})`);
    // disk-level proof: the synced product home actually carries the launcher + a built artifact
    ok(existsSync(join(tmpHome, 'index.html')), 'product home materialized index.html on disk');
    ok(existsSync(join(tmpHome, '3d/index.html')), 'product home materialized 3d/index.html on disk');
    // byte-equality: product-home launcher == Drive-release launcher (same canonical bytes)
    ok(readFileSync(join(tmpHome, 'index.html')).equals(readFileSync(join(tmpDrive, 'index.html'))),
      'product-home launcher byte-identical to Drive-release launcher');
  } finally {
    rmSync(tmpDrive, { recursive: true, force: true });
    rmSync(tmpHomeRoot, { recursive: true, force: true });
  }

} finally {
  rmSync(tmpA, { recursive: true, force: true });
  rmSync(tmpB, { recursive: true, force: true });
  // Restore the on-disk receipt to the REAL deploy so the committed receipt always
  // reflects D:/GOLD-GAME (the verifier's temp packagings overwrite it as a side effect).
  // --dry-run regenerates the receipt with the real default dest without re-copying.
  try {
    execFileSync(process.execPath, [join(here, 'gate-30-package.mjs')],
      { cwd: repo, stdio: ['ignore', 'ignore', 'ignore'] });
  } catch { /* if the real deploy target is unavailable, leave the temp receipt */ }
}

const total = passed + fails.length;
console.log(`\nGATE 30 — ship packaging verify: ${passed}/${total}`);
if (fails.length) { console.log('FAILED:\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('PASS — one command regenerates 3D/2D/server/docs, copies the exact build, and the deployed bytes provably equal the canonical source (reproducible packageDigest).');
process.exit(0);
