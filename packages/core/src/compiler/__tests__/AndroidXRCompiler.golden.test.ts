/**
 * AndroidXRCompiler golden-output test — production-side drift guard for `compile_to_android_xr`.
 *
 * Parses apps/android-xr-reference/scene.holo through the REAL HoloCompositionParser and asserts the
 * in-core AndroidXRCompiler emits BYTE-FOR-BYTE the committed reference app at
 * apps/android-xr-reference/android-xr. This is the CI twin of the pre-commit gate
 * scripts/holo-ci/check-android-xr-emit-matches-reference.mts — both anchor to the SAME reference, so
 * the emitter cannot silently drift (the pre-commit hook bypasses for agent/automation envs; this
 * test runs in `pnpm test`, so CI still catches drift). Line endings are normalised (CRLF→LF).
 *
 * NOTE: the reference is the CURRENT emitter output. It does NOT yet `gradle assembleDebug` clean —
 * the AndroidXR codegen still emits Kotlin/coordinates that need correctness fixes (see
 * research/2026-06-20_android-xr-build-verify-gate.md). This gate LOCKS the output so those fixes are
 * drift-controlled (W.783: gate BEFORE fixing emit). When the reference changes intentionally, update
 * the emitter so output matches again — never edit one side to match a drifted other.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

// packages/core/src/compiler/__tests__ → repo root (5 levels up)
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const appDir = join(repoRoot, 'apps', 'android-xr-reference');
const refDir = join(appDir, 'android-xr');

// Keep in sync with apps/android-xr-reference/compile-config.mts (a .mts import would break vitest's
// CJS test transform, so the two constants are duplicated here intentionally).
const PACKAGE = 'net.holoscript.androidxr';
const ACTIVITY = 'GeneratedXRActivity';

const norm = (s: string) => s.replace(/\r\n/g, '\n');

describe('AndroidXRCompiler → golden reference app', () => {
  const parsed = new HoloCompositionParser().parse(readFileSync(join(appDir, 'scene.holo'), 'utf8'));
  const compiler = new AndroidXRCompiler({ packageName: PACKAGE, activityName: ACTIVITY });

  it('scene.holo parses through the real parser', () => {
    expect(parsed.success).toBe(true);
    expect(parsed.ast).toBeTruthy();
  });

  it('every emitted file byte-matches the committed reference', () => {
    const emitted = compiler.compileToFiles(parsed.ast!, '');
    const drift: string[] = [];
    for (const [relPath, got] of Object.entries(emitted)) {
      let ref: string;
      try {
        ref = readFileSync(join(refDir, relPath), 'utf8');
      } catch {
        drift.push(`MISSING reference file: ${relPath}`);
        continue;
      }
      if (norm(got!) !== norm(ref)) {
        const a = norm(got!).split('\n');
        const b = norm(ref).split('\n');
        let firstDiff = '';
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) {
            firstDiff = `line ${i + 1}: emitted=${JSON.stringify(a[i])} reference=${JSON.stringify(b[i])}`;
            break;
          }
        }
        drift.push(`DRIFT ${relPath} — ${firstDiff}`);
      }
    }
    expect(drift).toEqual([]);
  });
});
