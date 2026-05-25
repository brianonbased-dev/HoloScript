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

// Gate 30b — the GOLD product home (D.063: GOLD owns the product, HoloScript is the
// engine the game consumes). The portable Drive release at DEST is one consumer; the
// canonical product home is D:/GOLD/assets/game/gold-game/. GATES.md (line ~113) named
// "sync the GOLD product home first, then emit the portable release" as the open
// packaging correction — this closes it: the SAME canonical manifest materializes into
// the product home and is proven byte-equal there too. It is a GOLD *project* dir
// (F.078: full agent r/w), NOT a governed wisdom-vault tier — syncing the build copy is
// authorized; the vault content under D:/GOLD/wisdom/etc is never touched.
// Set GOLD_PRODUCT_HOME='' (or --no-product-home) to skip on machines without the D: vault.
const noProductHome = args.includes('--no-product-home');
const PRODUCT_HOME = noProductHome
  ? null
  : (process.env.GOLD_PRODUCT_HOME ?? 'D:/GOLD/assets/game/gold-game');

// Gate 40 sync — keep the drive's plug-in fleet-boot ignition in sync with the
// gated repo source (examples/gold-game/fleet-boot). Code files (gold-fleet-boot.mjs,
// PLUG-IN-START.bat) are byte-proven; fleet-manifest.json is SEEDED ONLY IF ABSENT so
// a user's customized cloud budget cap / tier toggles are never clobbered.
// Set GOLD_FLEET_BOOT_HOME='' (or --no-fleet-boot) to skip.
const noFleetBoot = args.includes('--no-fleet-boot');
const FLEET_BOOT_HOME = noFleetBoot ? null : (process.env.GOLD_FLEET_BOOT_HOME ?? 'D:/GOLD/fleet-boot');

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

// ── 3 + 4. Materialize the manifest into a target, building a digest table ────
// Reusable so the SAME canonical manifest materializes (and proves byte-parity) into
// every target: the portable Drive release (DEST) and the GOLD product home (D.063).
function materializeTo(targetDir, label) {
  if (!dryRun) {
    // Clean the regenerable subtrees only (never a sibling D:/GOLD vault dir).
    for (const sub of ['3d', '2d', 'setup']) rmSync(join(targetDir, sub), { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
  }
  const m = [];
  const miss = [];
  const mism = [];

  for (const item of PACKAGE_MANIFEST) {
    const destPath = join(targetDir, item.rel);
    let sourceBytes = null;

    if (item.kind === 'build') {
      const srcPath = join(here, item.from);
      if (!existsSync(srcPath)) { miss.push(`${item.rel} (builder ${item.builder} did not emit ${item.from})`); continue; }
      sourceBytes = readFileSync(srcPath);
    } else if (item.kind === 'copy') {
      const srcPath = join(here, item.from);
      if (!existsSync(srcPath)) { miss.push(`${item.rel} (source ${item.from} absent)`); continue; }
      sourceBytes = readFileSync(srcPath);
    } else if (item.kind === 'static') {
      const content = STATIC_CONTENT[item.content];
      if (content == null) { miss.push(`${item.rel} (static content ${item.content} undefined)`); continue; }
      sourceBytes = Buffer.from(content, 'utf8');
    } else if (item.kind === 'prebuilt') {
      // Verified present + digested, never regenerated.
      if (!existsSync(destPath)) {
        m.push({ rel: item.rel, kind: item.kind, present: false, note: item.note });
        miss.push(`${item.rel} (pre-built binary not present in ${label} — run the SEA build once)`);
        continue;
      }
      const bytes = readFileSync(destPath);
      m.push({ rel: item.rel, kind: item.kind, present: true, bytes: bytes.length, sha256: sha256(bytes), note: item.note });
      continue;
    }

    const srcDigest = sha256(sourceBytes);
    if (!dryRun) {
      mkdirSync(dirname(destPath), { recursive: true });
      writeFileSync(destPath, sourceBytes);
      // Read back the deployed file and prove byte-for-byte parity (deployed == source).
      const deployedBytes = readFileSync(destPath);
      const deployedDigest = sha256(deployedBytes);
      if (deployedDigest !== srcDigest) mism.push(`${item.rel} (deployed digest != source digest)`);
      m.push({ rel: item.rel, kind: item.kind, bytes: sourceBytes.length, sha256: srcDigest, deployedMatches: deployedDigest === srcDigest });
    } else {
      m.push({ rel: item.rel, kind: item.kind, bytes: sourceBytes.length, sha256: srcDigest, deployedMatches: null });
    }
  }
  const digest = sha256hex(m.map((x) => `${x.rel}:${x.sha256 || 'absent'}`).sort().join('|'));
  return { manifest: m, missing: miss, mismatched: mism, packageDigest: digest, dir: targetDir, label };
}

// Primary target: the portable Drive release.
const primary = materializeTo(DEST, 'Drive release');
const manifest = primary.manifest;
const missing = primary.missing;
const mismatched = primary.mismatched;
const packageDigest = primary.packageDigest;

// Gate 30b: sync the GOLD product home FIRST-class — same manifest, byte-proven.
// Skipped (not failed) when the D: product-home root is absent (e.g. CI / no D: drive),
// so the gate stays runnable everywhere; reported in the receipt either way.
let productHome = null;
if (PRODUCT_HOME && existsSync(dirname(PRODUCT_HOME))) {
  productHome = materializeTo(PRODUCT_HOME, 'GOLD product home');
  // Parity across targets: the product home must reproduce the SAME packageDigest as
  // the Drive release (identical canonical bytes, modulo the optional prebuilt .exe
  // which lives only on the Drive). Compare the non-prebuilt digest.
  const nonExeDigest = (mf) => sha256hex(
    mf.manifest.filter((x) => x.kind !== 'prebuilt').map((x) => `${x.rel}:${x.sha256 || 'absent'}`).sort().join('|'),
  );
  productHome.contentDigest = nonExeDigest(productHome);
  productHome.matchesDriveContent = nonExeDigest(primary) === productHome.contentDigest;
} else if (PRODUCT_HOME) {
  productHome = { skipped: true, dir: PRODUCT_HOME, reason: `product-home root ${dirname(PRODUCT_HOME)} absent (no D: vault on this machine)` };
}

// Gate 40 — sync the plug-in fleet-boot ignition to the drive (code byte-proven;
// manifest preserved if the user customized it).
let fleetBoot = null;
if (FLEET_BOOT_HOME && existsSync(dirname(resolve(FLEET_BOOT_HOME)))) {
  const src = join(here, 'fleet-boot');
  const codeFiles = ['gold-fleet-boot.mjs', 'PLUG-IN-START.bat'];
  const synced = []; const fbMiss = []; const fbMism = [];
  if (!dryRun) mkdirSync(FLEET_BOOT_HOME, { recursive: true });
  for (const f of codeFiles) {
    const sp = join(src, f);
    if (!existsSync(sp)) { fbMiss.push(`${f} (source absent)`); continue; }
    const bytes = readFileSync(sp);
    if (!dryRun) {
      const dp = join(FLEET_BOOT_HOME, f);
      writeFileSync(dp, bytes);
      const ok = sha256(readFileSync(dp)) === sha256(bytes);
      if (!ok) fbMism.push(f);
      synced.push({ file: f, bytes: bytes.length, deployedMatches: ok });
    } else synced.push({ file: f, bytes: bytes.length, deployedMatches: null });
  }
  // seed manifest only if absent — never overwrite a user-customized budget cap
  const manDst = join(FLEET_BOOT_HOME, 'fleet-manifest.json');
  let manifestAction = 'preserved (user copy kept)';
  if (!existsSync(manDst)) {
    if (!dryRun) writeFileSync(manDst, readFileSync(join(src, 'fleet-manifest.json')));
    manifestAction = dryRun ? 'would seed (absent)' : 'seeded (was absent)';
  }
  fleetBoot = { dir: FLEET_BOOT_HOME, synced, manifest: manifestAction, missing: fbMiss, mismatched: fbMism };
} else if (FLEET_BOOT_HOME) {
  fleetBoot = { skipped: true, dir: FLEET_BOOT_HOME, reason: `drive root ${dirname(resolve(FLEET_BOOT_HOME))} absent` };
}
const fbMismatch = fleetBoot && !fleetBoot.skipped ? fleetBoot.mismatched : [];
const fbMissing = fleetBoot && !fleetBoot.skipped ? fleetBoot.missing : [];

// ── 5. Overall result + receipt ───────────────────────────────────────────────
const phMismatch = productHome && !productHome.skipped
  ? [...productHome.mismatched, ...(productHome.matchesDriveContent ? [] : ['product-home content digest != Drive release content digest'])]
  : [];
const phMissing = productHome && !productHome.skipped
  ? productHome.missing.filter((m) => !m.includes('pre-built binary'))
  : [];

const requiredOk = missing.filter((m) => !m.includes('pre-built binary')); // exe is optional for VERIFIED-on-this-machine
const exeMissing = missing.some((m) => m.includes('pre-built binary'));
const result = (requiredOk.length === 0 && mismatched.length === 0 && phMissing.length === 0 && phMismatch.length === 0
  && fbMissing.length === 0 && fbMismatch.length === 0)
  ? 'VERIFIED'
  : 'FAILED';

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
  productHome: productHome
    ? (productHome.skipped
        ? { synced: false, dir: productHome.dir, skipped: true, reason: productHome.reason }
        : {
            synced: !dryRun,
            dir: productHome.dir,
            note: 'D.063 GOLD product home — GOLD owns the product, HoloScript is the engine. Synced from the same canonical manifest; a GOLD project dir (F.078), not a governed wisdom tier.',
            artifactCount: productHome.manifest.length,
            contentDigest: productHome.contentDigest,
            matchesDriveContent: productHome.matchesDriveContent,
            missing: phMissing,
            mismatched: phMismatch,
          })
    : { synced: false, dir: null, skipped: true, reason: '--no-product-home / GOLD_PRODUCT_HOME empty' },
  fleetBoot: fleetBoot
    ? (fleetBoot.skipped
        ? { synced: false, dir: fleetBoot.dir, skipped: true, reason: fleetBoot.reason }
        : {
            synced: !dryRun,
            dir: fleetBoot.dir,
            note: 'Gate 40 plug-in ignition kept in sync with the gated source; code byte-proven, fleet-manifest.json seeded only if absent (user budget-cap config preserved).',
            codeFiles: fleetBoot.synced,
            manifest: fleetBoot.manifest,
            missing: fbMissing,
            mismatched: fbMismatch,
          })
    : { synced: false, dir: null, skipped: true, reason: '--no-fleet-boot / GOLD_FLEET_BOOT_HOME empty' },
  deployedMatchesSource: !dryRun && mismatched.length === 0 && requiredOk.length === 0
    && phMissing.length === 0 && phMismatch.length === 0 && fbMissing.length === 0 && fbMismatch.length === 0,
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
if (productHome) {
  if (productHome.skipped) console.log(`  product home: SKIPPED (${productHome.reason})`);
  else console.log(`  product home: ${dryRun ? 'WOULD SYNC' : 'SYNCED'} ${productHome.dir} (content ${productHome.matchesDriveContent ? 'MATCHES' : 'DIFFERS FROM'} Drive release)`);
  if (phMissing.length) console.log('  product-home missing:', phMissing.join('; '));
  if (phMismatch.length) console.log('  product-home MISMATCH:', phMismatch.join('; '));
}
if (fleetBoot) {
  if (fleetBoot.skipped) console.log(`  fleet-boot: SKIPPED (${fleetBoot.reason})`);
  else console.log(`  fleet-boot: ${dryRun ? 'WOULD SYNC' : 'SYNCED'} ${fleetBoot.dir} (code byte-proven; manifest ${fleetBoot.manifest})`);
  if (fbMissing.length) console.log('  fleet-boot missing:', fbMissing.join('; '));
  if (fbMismatch.length) console.log('  fleet-boot MISMATCH:', fbMismatch.join('; '));
}
console.log(`  result: ${result}`);
console.log(`  receipt: ${receiptPath}`);

if (result !== 'VERIFIED') process.exit(1);

export { receipt, packageDigest, PACKAGE_MANIFEST };
