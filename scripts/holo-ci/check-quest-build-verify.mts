#!/usr/bin/env tsx
// Build-verify gate for compile_to_quest — proves the FRESHLY EMITTED Quest app BUILDS.
//
// The golden-diff gate (check-quest-mr-emit-matches-reference.mts) proves the emit byte-matches the
// committed reference (apps/quest-universal-qr-scanner/android-mr). This gate goes the step the
// compiler farm has been missing (F.126: validation IS construction; W.810 — golden-diff is
// internal-only, blind to whether the output compiles): it takes the freshly emitted QuestCompiler
// output (scanner + worlds), writes it over a throwaway copy of the committed Meta Spatial SDK gradle
// skeleton, and runs the real `gradlew assembleDebug`. Unlike compile_to_android_xr (still codegen-red),
// the Quest app is device-proven (serial 2G0YC5ZG03033W, 2026-06-19) and is expected to PASS.
//
// On-device install/launch/logcat verification is a SEPARATE on-demand runner (scripts/adb-quest-
// build-verify.ps1) so it never interrupts the founder's VR session. This gate is host-only (compile).
//
// Degrades gracefully: with no JDK on PATH it reports SKIPPED (exit 0) after a clean dry write-over —
// so it does not slow local commits. CI / a scheduled fleet job sets --require-toolchain.
//
//   npx tsx scripts/holo-ci/check-quest-build-verify.mts                    # skip if no toolchain
//   npx tsx scripts/holo-ci/check-quest-build-verify.mts --require-toolchain # CI/scheduled: mandatory
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { QuestCompiler } from '../../packages/core/src/compiler/QuestCompiler';
import {
  emitWorldSceneKt,
  emitWorldsRegistryKt,
} from '../../packages/core/src/compiler/quest-world-emit';
import { runBuildVerifyGate } from './build-verify/build-verify.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'quest-universal-qr-scanner');
const srcRel = 'app/src/main/java/net/holoscript/qrscanner';

import { readFileSync } from 'node:fs';
function parse(file: string, label: string) {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`✗ ${label} failed to parse:`, r.errors);
    process.exit(1);
  }
  return r.ast;
}

// Assemble the full emitted Quest app (scanner.holo via QuestCompiler + worlds/*.holo), mirroring
// check-quest-mr-emit-matches-reference.mts so build-verify and golden-diff stay in lockstep.
const emitted: Record<string, string> = new QuestCompiler().compile(
  parse(join(appDir, 'scanner.holo'), 'scanner.holo'),
  ''
);
const worldsDir = join(appDir, 'worlds');
if (existsSync(worldsDir)) {
  const worldFiles = readdirSync(worldsDir)
    .filter((f) => f.endsWith('.holo'))
    .sort();
  const worldIds: string[] = [];
  for (const wf of worldFiles) {
    const id = basename(wf, '.holo');
    worldIds.push(id);
    emitted[`${srcRel}/World_${id.replace(/[^a-zA-Z0-9]+/g, '_')}.kt`] = emitWorldSceneKt(
      parse(join(worldsDir, wf), wf),
      id
    );
  }
  emitted[`${srcRel}/WorldsRegistry.kt`] = emitWorldsRegistryKt(worldIds);
}

runBuildVerifyGate({
  target: 'quest',
  emitted,
  skeletonDir: join(appDir, 'android-mr'),
  buildCommand: ['./gradlew', 'assembleDebug', '--no-daemon', '--console=plain'],
  // gradle needs a JDK; without one this SKIPs (so it never slows a local commit).
  toolchainProbe: { command: ['java', '-version'] },
  expectArtifacts: ['app/build/outputs/apk/debug'],
  requireToolchain: process.argv.includes('--require-toolchain'),
});
