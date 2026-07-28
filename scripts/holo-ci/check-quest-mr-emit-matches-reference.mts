#!/usr/bin/env tsx
// Golden gate for compile_to_quest (surface: immersive_mr) — NATIVE compiler path.
//
// Parses apps/quest-universal-qr-scanner/scanner.holo through the REAL HoloCompositionParser and
// compiles it through the in-core QuestCompiler (trait-dispatch). FAILS on any drift between the
// emitted files and the committed reference app (apps/quest-universal-qr-scanner/android-mr). This is
// what enforces "edit the spec, not the generated Kotlin": hand-edit a generated .kt instead of
// scanner.holo (or edit scanner.holo without re-running generate-native.mts) and this goes red.
// CRLF is normalised so git autocrlf can't cause false drift.
//
// All shared gate logic (parse, byte-compare, first-diff report, --self-test) lives in
// scripts/holo-ci/build-verify/golden-diff.mts; this file is config + the quest-specific worlds emit.
// Routing through the shared module also closes the --self-test gap the Quest gate left open (W.783).
//
//   npx tsx scripts/holo-ci/check-quest-mr-emit-matches-reference.mts            # real gate
//   npx tsx scripts/holo-ci/check-quest-mr-emit-matches-reference.mts --self-test # prove it detects drift
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestCompiler } from '../../packages/core/src/compiler/QuestCompiler';
import { compileHSPlusStateMachineToKotlin } from '../../packages/core/src/compiler/HSIIRKotlinStateMachineEmitter';
import {
  emitWorldSceneKt,
  emitWorldsRegistryKt,
} from '../../packages/core/src/compiler/quest-world-emit';
import { parseOrDie, runGoldenDiffGate } from './build-verify/golden-diff.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'quest-universal-qr-scanner');
const specPath = join(appDir, 'scanner.holo');
const lifecyclePath = join(appDir, 'scanner-lifecycle.hsplus');
const srcRel = 'app/src/main/java/net/holoscript/qrscanner';

function assertPrivacyBoundary(emitted: Record<string, string>): void {
  const forbidden: Array<[RegExp, string]> = [
    [/getExternalFilesDir/, 'external camera-frame storage'],
    [/writeBytes\s*\(\s*y\s*\)/, 'raw luminance-frame write'],
    [/frame_latest_/, 'raw frame debug artifact'],
    [/Log\.[A-Za-z]+\([^\n]*(?:\$decoded|\$text|\$url|\$link)/, 'decoded payload logging'],
    [/\.put\(\s*"payload"\s*,/, 'raw payload receipt field'],
  ];
  for (const [relativePath, content] of Object.entries(emitted)) {
    if (!relativePath.endsWith('.kt')) continue;
    for (const [pattern, claim] of forbidden) {
      if (pattern.test(content)) {
        throw new Error(`HoloQR privacy gate: ${claim} found in ${relativePath}`);
      }
    }
  }
}

/** Quest MR emit = scanner.holo (trait-dispatch) + worlds/*.holo → Meta Spatial SDK scene Kotlin. */
function emit(): Record<string, string> {
  const emitted: Record<string, string> = new QuestCompiler().compile(
    parseOrDie(specPath, 'scanner.holo'),
    ''
  );
  const lifecycleRel = `${srcRel}/ScannerLifecycleMachine.kt`;
  const lifecycle = compileHSPlusStateMachineToKotlin(readFileSync(lifecyclePath, 'utf8'), {
    machineName: 'ScannerLifecycle',
    className: 'ScannerLifecycleMachine',
    packageName: 'net.holoscript.qrscanner',
  });
  if (emitted[lifecycleRel] !== lifecycle.code) {
    throw new Error(
      'scanner-lifecycle.hsplus differs from the compiler-bundled HSI source; regenerate core templates'
    );
  }

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
        parseOrDie(join(worldsDir, wf), wf),
        id
      );
    }
    emitted[`${srcRel}/WorldsRegistry.kt`] = emitWorldsRegistryKt(worldIds);
  }
  assertPrivacyBoundary(emitted);
  return emitted;
}

runGoldenDiffGate({
  target: 'quest-mr',
  refDir: join(appDir, 'android-mr'),
  emit,
  fixHint:
    'edit apps/quest-universal-qr-scanner/scanner.holo (not the generated Kotlin) and re-run generate-native.mts.',
});
