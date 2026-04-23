/**
 * Android compiler trio — Characterization Tests (W4-T3 pre-split lock)
 *
 * **Purpose**: Lock current Android codegen output hashes so the
 * Wave-1 split (W1-T3: split the Android trio — AndroidCompiler +
 * AndroidXRCompiler + AndroidXRTraitMap, 9,481 LOC combined — by
 * extracting shared concerns with the trait-map becoming a registry)
 * can ship safely.
 *
 * **Discipline**: lock tests, not behavior tests. Failing hash =
 * either (a) regression to fix, or (b) intentional change to re-lock
 * in the same commit, explicitly called out in the commit message.
 *
 * **Scope**: covers both compilers of the trio
 *   - AndroidCompiler (phone/tablet ARCore): activity / state /
 *     nodeFactory / manifest / buildGradle + per-trait resource
 *     files (NPU, authoring, haptic, nearby, foldable, DeX, lens,
 *     WebXR)
 *   - AndroidXRCompiler (glasses XR): activity / state /
 *     nodeFactory / manifest / buildGradle + Glimmer composables
 *
 * AndroidXRTraitMap is exercised implicitly through XR compiler
 * invocations (it's the registry the XR compiler queries).
 *
 * **See**: ai-ecosystem research/2026-04-21_audit-mode-backlog.md §W4-T3 / W1-T3
 *         packages/core/src/compiler/AndroidCompiler.ts (3,551 LOC)
 *         packages/core/src/compiler/AndroidXRCompiler.ts
 *         packages/core/src/compiler/AndroidXRTraitMap.ts (3,701 LOC)
 *         packages/core/src/compiler/AndroidCompiler.test.ts (existing behavior tests)
 *         Sister lock files: HoloScriptRuntime, HoloCompositionParser, IOSCompiler
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { AndroidCompiler } from './AndroidCompiler';
import { AndroidXRCompiler } from './AndroidXRCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

// Instantiate directly and call compile() without agentToken (dev-mode
// bypass, matching existing AndroidCompiler.test.ts pattern — the
// token-required path fails RBAC in local test env).
let android: AndroidCompiler;
let androidXR: AndroidXRCompiler;
beforeEach(() => {
  android = new AndroidCompiler();
  androidXR = new AndroidXRCompiler();
});

function compileAndroid(composition: HoloComposition) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (android as any).compile(composition);
}

function compileAndroidXR(composition: HoloComposition) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (androidXR as any).compile(composition);
}

const NONDET_KEYS = new Set<string>([
  'timestamp',
  'runId',
  'created',
  'createdAt',
  'modifiedAt',
  'updatedAt',
  '_generated_at',
  'generatedAt',
  'compiledAt',
  'buildTimeMs',
]);

const EMBEDDED_TIMESTAMP_RE = /(\d{13,})|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/g;

function canonicalizeString(s: string): string {
  return s.replace(EMBEDDED_TIMESTAMP_RE, '<TIMESTAMP>');
}

function hashResult(result: unknown): string {
  const stripped = stripNondeterministic(result);
  return createHash('sha256').update(stableStringify(stripped)).digest('hex').slice(0, 16);
}

function stripNondeterministic(v: unknown): unknown {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'string') return canonicalizeString(v);
    return v;
  }
  if (Array.isArray(v)) return v.map(stripNondeterministic);
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(v as object)) {
    if (NONDET_KEYS.has(k)) continue;
    out[k] = stripNondeterministic((v as Record<string, unknown>)[k]);
  }
  return out;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v as object).sort();
  return (
    '{' +
    keys.map((k) => JSON.stringify(k) + ':' + stableStringify((v as Record<string, unknown>)[k])).join(',') +
    '}'
  );
}

function createComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    type: 'Composition',
    name: 'CharARScene',
    objects: [],
    templates: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  };
}

function createObject(name: string, overrides: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
  return { name, properties: [], traits: [], ...overrides } as HoloObjectDecl;
}

function objectWithTrait(name: string, traitName: string): HoloObjectDecl {
  return createObject(name, {
    traits: [{ name: traitName, config: [] }],
  } as unknown as Partial<HoloObjectDecl>);
}

describe('Android trio characterization (W4-T3 pre-split lock for W1-T3)', () => {
  describe('AndroidCompiler — Core codegen (activity/state/nodeFactory/manifest/buildGradle)', () => {
    it('[A1] empty composition locks baseline', () => {
      expect(hashResult(compileAndroid(createComposition()))).toMatchSnapshot('A1-empty');
    });

    it('[A2] composition with single object locks codegen', () => {
      expect(
        hashResult(compileAndroid(createComposition({ objects: [createObject('Cube')] }))),
      ).toMatchSnapshot('A2-singleObject');
    });

    it('[A3] composition with multiple objects locks codegen', () => {
      expect(
        hashResult(
          compileAndroid(
            createComposition({
              objects: [createObject('Cube'), createObject('Sphere'), createObject('Plane')],
            }),
          ),
        ),
      ).toMatchSnapshot('A3-multiObject');
    });

    it('[A4] manifestFile isolated lock', () => {
      const result = compileAndroid(createComposition({ name: 'NamedScene' }));
      expect(hashResult({ manifestFile: result.manifestFile })).toMatchSnapshot('A4-manifestIsolated');
    });

    it('[A5] buildGradle isolated lock', () => {
      const result = compileAndroid(createComposition());
      expect(hashResult({ buildGradle: result.buildGradle })).toMatchSnapshot('A5-buildGradleIsolated');
    });
  });

  describe('AndroidCompiler — Per-trait resource emission', () => {
    it('[A6] npu_* trait triggers npuSceneSetup', () => {
      expect(
        hashResult(
          compileAndroid(
            createComposition({ objects: [objectWithTrait('Scene', 'npu_scene_understanding')] }),
          ),
        ),
      ).toMatchSnapshot('A6-npu');
    });

    it('[A7] haptic_* trait triggers hapticSetup', () => {
      expect(
        hashResult(
          compileAndroid(
            createComposition({ objects: [objectWithTrait('Haptic', 'haptic_feedback')] }),
          ),
        ),
      ).toMatchSnapshot('A7-haptic');
    });

    it('[A8] nearby_* trait triggers nearbySetup', () => {
      expect(
        hashResult(
          compileAndroid(
            createComposition({ objects: [objectWithTrait('Beacon', 'nearby_connect')] }),
          ),
        ),
      ).toMatchSnapshot('A8-nearby');
    });

    it('[A9] foldable_* trait triggers foldableSetup', () => {
      expect(
        hashResult(
          compileAndroid(
            createComposition({ objects: [objectWithTrait('Display', 'foldable_hinge')] }),
          ),
        ),
      ).toMatchSnapshot('A9-foldable');
    });

    it('[A10] lens_* trait triggers lensSetup', () => {
      expect(
        hashResult(
          compileAndroid(
            createComposition({ objects: [objectWithTrait('Lens', 'lens_recognize')] }),
          ),
        ),
      ).toMatchSnapshot('A10-lens');
    });
  });

  describe('AndroidXRCompiler — Core codegen (XR glasses target)', () => {
    it('[A11] XR empty composition locks baseline', () => {
      expect(hashResult(compileAndroidXR(createComposition()))).toMatchSnapshot('A11-xrEmpty');
    });

    it('[A12] XR composition with single object locks codegen', () => {
      expect(
        hashResult(compileAndroidXR(createComposition({ objects: [createObject('Cube')] }))),
      ).toMatchSnapshot('A12-xrSingleObject');
    });

    it('[A13] XR composition activityFile isolated lock', () => {
      const result = compileAndroidXR(
        createComposition({ objects: [createObject('Spatial')] }),
      );
      expect(hashResult({ activityFile: result.activityFile })).toMatchSnapshot('A13-xrActivityIsolated');
    });

    it('[A14] XR manifestFile isolated lock', () => {
      const result = compileAndroidXR(createComposition());
      expect(hashResult({ manifestFile: result.manifestFile })).toMatchSnapshot('A14-xrManifestIsolated');
    });
  });

  describe('AndroidXRCompiler — Trait map (via XR compiler) + Glimmer composables', () => {
    it('[A15] XR composition with trait exercises AndroidXRTraitMap dispatch', () => {
      // AndroidXRTraitMap is a registry queried by the XR compiler.
      // Presence of a spatial trait exercises at least one dispatch path.
      expect(
        hashResult(
          compileAndroidXR(
            createComposition({ objects: [objectWithTrait('Panel', 'spatial_panel')] }),
          ),
        ),
      ).toMatchSnapshot('A15-xrTraitMap');
    });
  });

  describe('Cross-compiler composite', () => {
    it('[A16] same composition compiled to both targets — diff-lock across trio', () => {
      const comp = createComposition({
        name: 'DualTarget',
        objects: [
          createObject('Cube'),
          objectWithTrait('Audio', 'spatial_audio'),
          objectWithTrait('Input', 'haptic_feedback'),
        ],
      });
      const a = compileAndroid(comp);
      const xr = compileAndroidXR(comp);
      // Lock the diff-envelope: both outputs, canonicalized, hashed
      // together. Split must preserve the relationship between the
      // two compilers, not just each individually.
      expect(hashResult({ android: a, androidXR: xr })).toMatchSnapshot('A16-crossCompositeDiffLock');
    });
  });
});
