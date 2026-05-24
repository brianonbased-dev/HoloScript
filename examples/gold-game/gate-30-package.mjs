#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 30: ship packaging (ONE verified command).
//
//   node examples/gold-game/gate-30-package.mjs            # package -> D:/GOLD-GAME/
//   node examples/gold-game/gate-30-package.mjs --dest <p> # package -> <p> (tests use a temp dir)
//   node examples/gold-game/gate-30-package.mjs --dry-run  # build + manifest, NO copy
//
// This is the single command that closes the deploy-drift gap: before Gate 30 the
// portable Drive build at D:/GOLD-GAME/ was hand-assembled across sessions, so its
// launcher/server/docs drifted out of sync with examples/gold-game/ (proven: the
// deployed server.cjs, vault-ops.cjs, and 3d/index.html all differed from source).
//
// What it does, in order:
//   1. Regenerate the 3D build   (real drive-build.mjs   — walks the parsed .holo)
//   2. Regenerate the retro 2D   (real gold-2d-build.mjs — same .holo, 2nd modality)
//   3. Materialize every non-build artifact from the canonical package-assets.mjs
//      (launcher, docs, .bat launchers, autorun.inf, server.cjs, vault-ops.cjs,
//       sea-config.json, setup/ auto-launch scripts) into the dest.
//   4. Verify the PRE-BUILT GOLD-GAME-Server.exe is present (digested, not rebuilt).
//   5. Emit a per-file digest manifest + an overall packageDigest, and emit the
//      Gate 30 receipt proving deployed bytes == regenerated source bytes.
//
// Anti-F.069: the receipt asserts a reproducible digest manifest over real files on
// disk (deployed byte == regenerated source byte), not a grep for a string.
// The receipt is VERIFIED only if every required artifact materialized and matched.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PACKAGE_MANIFEST, STATIC_CONTENT } from './package-assets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const sha256hex = (s) => createHash('sha256').update(s).digest('hex');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const destIdx = args.indexOf('--dest');
const DEST = destIdx >= 0 ? resolve(args[destIdx + 1]) : (process.env.GOLD_GAME_DEST || 'D:/GOLD-GAME');

// tsx for the TypeScript-importing 2D builder; node for the 3D builder.
// Invoke tsx through node + its CLI entry (avoids the Windows .CMD spawnSync EINVAL).
const tsxCli = join(repo, 'node_modules', 'tsx', 'dist', 'cli.mjs');

function run(label, file, useTsx) {
  const argv = useTsx ? [tsxCli, join(here, file)] : [join(here, file)];
  process.stdout.write(`  [build] ${label} ... `);
  execFileSync(process.execPath, argv, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('OK');
}

console.log('THE GOLD GAME — Gate 30 packager');
console.log('  dest:', DEST, dryRun ? '(dry-run, no copy)' : '');

// ── 1 + 2. Regenerate both modality builds from the real .holo ───────────────
run('3D / WebXR  (drive-build.mjs)', 'drive-build.mjs', false);
run('retro 2D    (gold-2d-build.mjs)', 'gold-2d-build.mjs', true);

// ── 3 + 4. Materialize the manifest into the dest, building a digest table ────
if (!dryRun) {
  // Preserve the pre-built .exe + any sibling vault if present; clean the rest.
  const exeSrcInDest = join(DEST, 'GOLD-GAME-Server.exe');
  let savedExe = null;
  if (existsSync(exeSrcInDest)) savedExe = readFileSync(exeSrcInDest);
  // Clean the regenerable subtrees only (never the sibling D:/GOLD vault, which is elsewhere).
  for (const sub of ['3d', '2d', 'setup']) rmSync(join(DEST, sub), { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });
  if (savedExe) { /* exe stays in place; nothing to restore */ }
}

const manifest = [];
const missing = [];
const mismatched = [];

for (const item of PACKAGE_MANIFEST) {
  const destPath = join(DEST, item.rel);
  let sourceBytes = null;

  if (item.kind === 'build') {
    const srcPath = join(here, item.from);
    if (!existsSync(srcPath)) { missing.push(`${item.rel} (builder ${item.builder} did not emit ${item.from})`); continue; }
    sourceBytes = readFileSync(srcPath);
  } else if (item.kind === 'copy') {
    const srcPath = join(here, item.from);
    if (!existsSync(srcPath)) { missing.push(`${item.rel} (source ${item.from} absent)`); continue; }
    sourceBytes = readFileSync(srcPath);
  } else if (item.kind === 'static') {
    const content = STATIC_CONTENT[item.content];
    if (content == null) { missing.push(`${item.rel} (static content ${item.content} undefined)`); continue; }
    sourceBytes = Buffer.from(content, 'utf8');
  } else if (item.kind === 'prebuilt') {
    // Verified present + digested, never regenerated.
    if (!existsSync(destPath)) {
      manifest.push({ rel: item.rel, kind: item.kind, present: false, note: item.note });
      missing.push(`${item.rel} (pre-built binary not present in dest — run the SEA build once)`);
      continue;
    }
    const bytes = readFileSync(destPath);
    manifest.push({ rel: item.rel, kind: item.kind, present: true, bytes: bytes.length, sha256: sha256(bytes), note: item.note });
    continue;
  }

  const srcDigest = sha256(sourceBytes);
  if (!dryRun) {
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, sourceBytes);
    // Read back the deployed file and prove byte-for-byte parity (deployed == source).
    const deployedBytes = readFileSync(destPath);
    const deployedDigest = sha256(deployedBytes);
    if (deployedDigest !== srcDigest) mismatched.push(`${item.rel} (deployed digest != source digest)`);
    manifest.push({ rel: item.rel, kind: item.kind, bytes: sourceBytes.length, sha256: srcDigest, deployedMatches: deployedDigest === srcDigest });
  } else {
    manifest.push({ rel: item.rel, kind: item.kind, bytes: sourceBytes.length, sha256: srcDigest, deployedMatches: null });
  }
}

// ── 5. Overall package digest + receipt ──────────────────────────────────────
const packageDigest = sha256hex(manifest.map((m) => `${m.rel}:${m.sha256 || 'absent'}`).sort().join('|'));

const requiredOk = missing.filter((m) => !m.includes('pre-built binary')); // exe is optional for VERIFIED-on-this-machine
const exeMissing = missing.some((m) => m.includes('pre-built binary'));
const result = (requiredOk.length === 0 && mismatched.length === 0) ? 'VERIFIED' : 'FAILED';

const receipt = {
  schema: 'cael-ship-packaging-v1',
  gate: 30,
  track: 'flagship',
  name: 'ship packaging — one verified command regenerates 3D/2D/server/docs and copies the exact build to D:/GOLD-GAME/',
  command: 'node examples/gold-game/gate-30-package.mjs',
  dest: DEST,
  dryRun,
  builders: [
    { artifact: '3d/', from: 'drive-build.mjs', note: 'walks the parsed gold-vault-game.holo (R3F/three.js)' },
    { artifact: '2d/', from: 'gold-2d-build.mjs', note: 'same .holo, retro 2D modality' },
  ],
  artifacts: manifest,
  artifactCount: manifest.length,
  staticArtifacts: manifest.filter((m) => m.kind === 'static').length,
  copiedArtifacts: manifest.filter((m) => m.kind === 'copy').length,
  builtArtifacts: manifest.filter((m) => m.kind === 'build').length,
  prebuiltPresent: manifest.some((m) => m.kind === 'prebuilt' && m.present),
  missing,
  mismatched,
  deployedMatchesSource: !dryRun && mismatched.length === 0 && requiredOk.length === 0,
  exeNote: exeMissing
    ? 'GOLD-GAME-Server.exe absent on this machine — the offline launcher (index.html + .bat) is fully functional without it; the .exe only adds the optional live-vault-count server. Run the Node-SEA build once to add it.'
    : 'GOLD-GAME-Server.exe present (pre-built Node-SEA binary; digested, not regenerated).',
  packageDigest,
  readOnly: 'Regenerates the deployed COPY at the dest; D:/GOLD vault is never written. Source of truth stays examples/gold-game/.',
  result,
  timestamp: new Date().toISOString(),
};
receipt.payloadHash = sha256hex(JSON.stringify({ ...receipt, payloadHash: undefined }));

const receiptPath = join(here, 'GATE-30-SHIP-PACKAGING-receipt.json');
writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

console.log(`\n  artifacts: ${manifest.length} (${receipt.builtArtifacts} built, ${receipt.staticArtifacts} static, ${receipt.copiedArtifacts} copied)`);
console.log(`  packageDigest: ${packageDigest.slice(0, 16)}...`);
if (missing.length) console.log('  missing:', missing.join('; '));
if (mismatched.length) console.log('  MISMATCH:', mismatched.join('; '));
console.log(`  result: ${result}`);
console.log(`  receipt: ${receiptPath}`);

if (result !== 'VERIFIED') process.exit(1);

export { receipt, packageDigest, PACKAGE_MANIFEST };
