#!/usr/bin/env tsx
// Golden gate for compile_to_android_xr (Jetpack XR / headset) — NATIVE compiler path.
//
// Parses apps/android-xr-reference/scene.holo through the REAL HoloCompositionParser and compiles it
// through the in-core AndroidXRCompiler (compileToFiles → path-keyed Android project layout). FAILS on
// any drift between the emitted files and the committed reference app (apps/android-xr-reference/
// android-xr). This is what enforces "edit the spec, not the generated Kotlin": hand-edit a generated
// .kt instead of scene.holo (or edit scene.holo without re-running generate-native.mts) and this goes
// red. CRLF is normalised so git autocrlf can't cause false drift.
//
// Mirrors scripts/holo-ci/check-quest-mr-emit-matches-reference.mts, and ADDS a negative self-test
// (--self-test) that proves the detector goes red on drift — a gap the Quest gate left open (W.783).
//
//   npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts            # real gate
//   npx tsx scripts/holo-ci/check-android-xr-emit-matches-reference.mts --self-test # prove it detects drift
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import { AndroidXRCompiler } from '../../packages/core/src/compiler/AndroidXRCompiler';
import {
  ANDROID_XR_PACKAGE,
  ANDROID_XR_ACTIVITY,
} from '../../apps/android-xr-reference/compile-config.mts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appDir = join(repoRoot, 'apps', 'android-xr-reference');
const specPath = join(appDir, 'scene.holo');
const refDir = join(appDir, 'android-xr');

const norm = (s: string) => s.replace(/\r\n/g, '\n');

function parseOrDie(file: string, label: string) {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`✗ ${label} failed to parse:`, r.errors);
    process.exit(1);
  }
  return r.ast;
}

function emit(): Record<string, string> {
  const compiler = new AndroidXRCompiler({
    packageName: ANDROID_XR_PACKAGE,
    activityName: ANDROID_XR_ACTIVITY,
  });
  return compiler.compileToFiles(parseOrDie(specPath, 'scene.holo'), '');
}

/**
 * Compare emitted files to a reference resolver. Returns the number of drift/missing failures.
 * `readRef` returns the reference content for a path, or null if it is missing.
 */
function compare(
  emitted: Record<string, string>,
  readRef: (rel: string) => string | null,
  log = true
): number {
  let failures = 0;
  for (const rel of Object.keys(emitted)) {
    const ref = readRef(rel);
    if (ref === null) {
      if (log) console.error(`✗ MISSING reference file: ${rel}`);
      failures++;
      continue;
    }
    if (norm(emitted[rel]) !== norm(ref)) {
      if (log) {
        console.error(`✗ DRIFT: emitted output != reference for ${rel}`);
        const a = norm(emitted[rel]).split('\n');
        const b = norm(ref).split('\n');
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) {
            console.error(`    first diff at line ${i + 1}:`);
            console.error(`      emitted  : ${JSON.stringify(a[i])}`);
            console.error(`      reference: ${JSON.stringify(b[i])}`);
            break;
          }
        }
      }
      failures++;
    }
  }
  return failures;
}

// ── Negative self-test: prove the detector goes red on a single-byte drift ──
if (process.argv.includes('--self-test')) {
  const emitted = emit();
  const firstKey = Object.keys(emitted)[0];
  // Reference == emitted EXCEPT one corrupted file → the gate MUST report exactly one failure.
  const corrupted = compare(
    emitted,
    (rel) => (rel === firstKey ? emitted[rel] + '\n// DRIFT-INJECTED' : emitted[rel]),
    false
  );
  const cleanPass = compare(emitted, (rel) => emitted[rel], false);
  if (corrupted >= 1 && cleanPass === 0) {
    console.log(
      `✅ self-test: detector flags injected drift (${corrupted} failure) and passes a clean match (0). Gate is live.`
    );
    process.exit(0);
  }
  console.error(
    `❌ self-test FAILED: corrupted=${corrupted} (want >=1), clean=${cleanPass} (want 0) — the gate is not actually detecting drift.`
  );
  process.exit(1);
}

// ── Real gate ──
const emitted = emit();
const failures = compare(emitted, (rel) => {
  try {
    return readFileSync(join(refDir, rel), 'utf8');
  } catch {
    return null;
  }
});

console.log(
  `\nandroid-xr emit: ${Object.keys(emitted).length} emitted file(s) checked vs android-xr (native compiler path)`
);
if (failures) {
  console.error(
    `\n❌ ${failures} drift/missing failure(s) — edit scene.holo (not the generated Kotlin) and re-run apps/android-xr-reference/generate-native.mts.`
  );
  process.exit(1);
}
console.log('✅ emitted Android XR file(s) byte-match the reference; no drift.');
