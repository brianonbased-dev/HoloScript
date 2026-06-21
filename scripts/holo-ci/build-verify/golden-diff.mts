// Shared golden-diff gate logic for compile-target emit gates.
//
// Extracted from the byte-identical bodies of:
//   - scripts/holo-ci/check-android-emit-matches-reference.mts
//   - scripts/holo-ci/check-android-xr-emit-matches-reference.mts
//   - scripts/holo-ci/check-quest-mr-emit-matches-reference.mts
//
// Every compile-target "emit golden-diff" gate does the same three things:
//   1. parse a .holo spec through the REAL HoloCompositionParser (no regex),
//   2. compile it through the in-core target compiler to a path-keyed file map,
//   3. byte-compare each emitted file (CRLF-normalised) against a committed
//      reference app, reporting the first diff line for any drift.
//
// This module is the single source of truth for steps 2's comparison and the
// negative self-test that proves the detector goes red on drift (W.783). A
// target gate is now just: { parse spec -> emit files } config + one call to
// runGoldenDiffGate(). Edit the spec, not the generated source — these gates
// enforce that invariant (F.126: validation IS construction).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HoloCompositionParser } from '../../../packages/core/src/parser/HoloCompositionParser';
import type { HoloComposition } from '../../../packages/core/src/parser/HoloCompositionTypes';

/** Normalise CRLF so git autocrlf can't cause false drift. */
export const norm = (s: string): string => s.replace(/\r\n/g, '\n');

/**
 * Parse a .holo file through the real HoloCompositionParser, or exit(1) with the
 * parser's own error list. Shared by every emit gate and generate-native script.
 */
export function parseOrDie(file: string, label: string): HoloComposition {
  const r = new HoloCompositionParser().parse(readFileSync(file, 'utf8'));
  if (!r.success || !r.ast) {
    console.error(`✗ ${label} failed to parse:`, r.errors);
    process.exit(1);
  }
  return r.ast as HoloComposition;
}

/**
 * Compare an emitted path-keyed file map to a reference resolver. Returns the
 * number of drift/missing failures. `readRef` returns the reference content for
 * a relative path, or null if it is missing.
 */
export function compareEmitToReference(
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

/** A reference resolver that reads files under a directory, returning null on ENOENT. */
export function fsReferenceResolver(refDir: string): (rel: string) => string | null {
  return (rel: string) => {
    try {
      return readFileSync(join(refDir, rel), 'utf8');
    } catch {
      return null;
    }
  };
}

export interface GoldenDiffGateConfig {
  /** Short label for the target, e.g. 'android-xr', 'quest-mr'. Used in log lines. */
  target: string;
  /** Produces the path-keyed emit map. Called fresh for both the real gate and the self-test. */
  emit: () => Record<string, string>;
  /** Directory holding the committed reference app the emit must byte-match. */
  refDir: string;
  /** One-line fix instruction shown on failure (edit the spec, re-run generate-native). */
  fixHint: string;
}

/**
 * Run a target's emit golden-diff gate. Honours `--self-test` on argv: in
 * self-test mode it proves the detector flags an injected single-file drift AND
 * passes a clean match, then exits — without touching the reference dir. In real
 * mode it byte-compares the emit against `refDir` and exits non-zero on any drift
 * or missing file.
 *
 * This is the whole body of a per-target gate; a target script becomes:
 *   runGoldenDiffGate({ target, emit, refDir, fixHint });
 */
export function runGoldenDiffGate(config: GoldenDiffGateConfig): never {
  const { target, emit, refDir, fixHint } = config;

  // -- Negative self-test: prove the detector goes red on a single-byte drift --
  if (process.argv.includes('--self-test')) {
    const emitted = emit();
    const keys = Object.keys(emitted);
    if (keys.length === 0) {
      console.error(`❌ self-test FAILED: ${target} emitted 0 files — nothing to corrupt.`);
      process.exit(1);
    }
    const firstKey = keys[0];
    // Reference == emitted EXCEPT one corrupted file -> the gate MUST report >=1 failure.
    const corrupted = compareEmitToReference(
      emitted,
      (rel) => (rel === firstKey ? emitted[rel] + '\n// DRIFT-INJECTED' : emitted[rel]),
      false
    );
    const cleanPass = compareEmitToReference(emitted, (rel) => emitted[rel], false);
    if (corrupted >= 1 && cleanPass === 0) {
      console.log(
        `✅ self-test: detector flags injected drift (${corrupted} failure) and passes a clean match (0). ${target} gate is live.`
      );
      process.exit(0);
    }
    console.error(
      `❌ self-test FAILED: corrupted=${corrupted} (want >=1), clean=${cleanPass} (want 0) — the ${target} gate is not actually detecting drift.`
    );
    process.exit(1);
  }

  // -- Real gate --
  const emitted = emit();
  const failures = compareEmitToReference(emitted, fsReferenceResolver(refDir));

  console.log(
    `\n${target} emit: ${Object.keys(emitted).length} emitted file(s) checked vs reference (native compiler path)`
  );
  if (failures) {
    console.error(`\n❌ ${failures} drift/missing failure(s) — ${fixHint}`);
    process.exit(1);
  }
  console.log(`✅ emitted ${target} file(s) byte-match the reference; no drift.`);
  process.exit(0);
}
