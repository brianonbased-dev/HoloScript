/**
 * AndroidCompiler golden-output test — production-side drift guard for `compile_to_android`.
 *
 * Parses apps/android-reference/scene.holo through the REAL HoloCompositionParser and asserts the
 * in-core AndroidCompiler emits BYTE-FOR-BYTE the committed reference app at
 * apps/android-reference/android. This is the CI twin of the pre-commit gate
 * scripts/holo-ci/check-android-emit-matches-reference.mts — both anchor to the SAME reference, so
 * the emitter cannot silently drift (the pre-commit hook bypasses for agent/automation envs; this
 * test runs in `pnpm test`, so CI still catches drift). Line endings are normalised (CRLF→LF).
 *
 * The reference is the CURRENT emitter output and it `gradle assembleDebug` builds GREEN: the
 * compile_to_android target was retargeted off the EOL Sceneform fork onto SceneView 4.18.0
 * (Apache 2.0, Compose-native ARScene). Proven end-to-end — golden-diff (this gate) + real gradle
 * build (scripts/holo-ci/check-android-build-verify.mts) + a live ARCore session on a Galaxy S23.
 * When the reference changes intentionally, edit apps/android-reference/scene.holo and re-run
 * apps/android-reference/generate-native.mts so the emitter output matches again — never edit one
 * side to match a drifted other.
 *
 * A byte-match only proves the emitter still writes what it wrote before, so two more checks guard
 * what it writes: the reference must use every node kind the emitter can produce (a kind it skips
 * is a kind the gradle build never compiles), and every argument name must exist in the pinned
 * SceneView release. Both run in `pnpm test`, with no Android toolchain needed.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidCompiler } from '../AndroidCompiler';
import { SCENEVIEW_NODE_COMPOSABLES } from '../AndroidARGenerators';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

// packages/core/src/compiler/__tests__ → repo root (5 levels up)
const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(testDir, '..', '..', '..', '..', '..');
const appDir = join(repoRoot, 'apps', 'android-reference');
const refDir = join(appDir, 'android');

// Keep in sync with apps/android-reference/compile-config.mts (a .mts import would break vitest's
// CJS test transform, so the two constants are duplicated here intentionally).
const PACKAGE = 'net.holoscript.android';
const CLASS = 'GeneratedARScene';
const ACTIVITY = `app/src/main/java/${PACKAGE.replace(/\./g, '/')}/${CLASS}Activity.kt`;

// Parameters of the SceneView node composables called inside ARScene { } (SceneScope.CubeNode /
// CylinderNode / SphereNode), read from the pinned release itself: `javap -p -l` on
// io/github/sceneview/SceneScope.class in sceneview-4.18.0.aar, LocalVariableTable argument slots.
// Re-derive this table whenever the emitted arsceneview version changes (asserted below).
const SCENEVIEW_VERSION = '4.18.0';
const SCENEVIEW_PARAMS: Record<string, readonly string[]> = {
  CubeNode: [
    'size',
    'center',
    'materialInstance',
    'position',
    'rotation',
    'scale',
    'apply',
    'content',
  ],
  CylinderNode: [
    'radius',
    'height',
    'center',
    'sideCount',
    'materialInstance',
    'position',
    'rotation',
    'scale',
    'apply',
    'content',
  ],
  SphereNode: [
    'radius',
    'center',
    'stacks',
    'slices',
    'materialInstance',
    'position',
    'rotation',
    'scale',
    'apply',
    'content',
  ],
};

const norm = (s: string) => s.replace(/\r\n/g, '\n');

describe('AndroidCompiler → golden reference app', () => {
  const parsed = new HoloCompositionParser().parse(
    readFileSync(join(appDir, 'scene.holo'), 'utf8')
  );
  const compiler = new AndroidCompiler({ packageName: PACKAGE, className: CLASS });

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

  it('the reference uses every node kind the emitter can produce', () => {
    // A kind scene.holo skips is a kind the real gradle build never compiles — that is how
    // CylinderNode shipped a `length` argument SceneView does not have.
    const activity = norm(compiler.compileToFiles(parsed.ast!, '')[ACTIVITY]!);
    const missing = Object.values(SCENEVIEW_NODE_COMPOSABLES).filter(
      (node) => !new RegExp(`^[ \\t]*${node}\\($`, 'm').test(activity)
    );
    expect(missing).toEqual([]);
  });

  it(`every node argument is a real SceneView ${SCENEVIEW_VERSION} parameter`, () => {
    const emitted = compiler.compileToFiles(parsed.ast!, '');
    expect(emitted['app/build.gradle.kts']).toContain(
      `io.github.sceneview:arsceneview:${SCENEVIEW_VERSION}`
    );

    // Each node call is emitted as `XNode(`, then one `name = value,` per line, then `)`.
    const wrong: string[] = [];
    const checked = new Set<string>();
    const calls = norm(emitted[ACTIVITY]!).matchAll(/^[ \t]*(\w+Node)\(\n([\s\S]*?)^[ \t]*\)$/gm);
    for (const [, node, body] of calls) {
      checked.add(node);
      const params = SCENEVIEW_PARAMS[node];
      if (!params) {
        wrong.push(`${node}: no recorded SceneView signature — add it to SCENEVIEW_PARAMS`);
        continue;
      }
      for (const [, arg] of body.matchAll(/^[ \t]*(\w+)[ \t]*=/gm)) {
        if (!params.includes(arg)) wrong.push(`${node}(${arg} = …): SceneView has no "${arg}"`);
      }
    }
    expect(wrong).toEqual([]);
    // Not vacuous: every kind in the emitter's repertoire was actually parsed and checked.
    expect([...checked].sort()).toEqual(Object.values(SCENEVIEW_NODE_COMPOSABLES).sort());
  });
});
