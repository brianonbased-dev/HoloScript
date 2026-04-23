/**
 * IOSCompiler — Characterization Tests (W4-T3 pre-split lock)
 *
 * **Purpose**: Lock current iOS codegen output hashes so the Wave-1
 * split (W1-T1: split 6,031 LOC into IOSCodegen / IOSManifest /
 * IOSResource / IOSBuildOrchestrator) can ship safely. Any behavior
 * change during the split breaks a hash here, not just a behavior
 * assertion.
 *
 * **Discipline**: lock tests, not behavior tests. Failing hash =
 * either (a) regression to fix, or (b) intentional change to re-lock
 * in the same commit, explicitly called out in the commit message.
 *
 * **Scope**: covers the four split concerns —
 *   - Codegen (viewFile / sceneFile / stateFile)
 *   - Manifest (infoPlist)
 *   - Resource (per-trait files: roomPlanFile, lidarScannerFile,
 *     npuSceneFile, handTrackingFile, portalARFile, faceTrackingFile,
 *     objectCaptureFile, sharePlayFile, uwbPositioningFile,
 *     spatialAudioFile)
 *   - Build orchestrator (composite end-to-end)
 *
 * Each trait family has its own dedicated lock so the split can
 * isolate regressions to a specific emission path.
 *
 * **See**: ai-ecosystem research/2026-04-21_audit-mode-backlog.md §W4-T3 / W1-T1
 *         packages/core/src/compiler/IOSCompiler.ts (6,031 LOC target)
 *         packages/core/src/compiler/IOSCompiler.test.ts (existing behavior tests)
 *         packages/core/src/HoloScriptRuntime.characterization.test.ts (sister lock file)
 *         packages/core/src/parser/HoloCompositionParser.characterization.test.ts (sister lock file)
 */

import { createHash } from 'crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { IOSCompiler } from './IOSCompiler';
import type { HoloComposition, HoloObjectDecl } from '../parser/HoloCompositionTypes';

// Mirror the existing IOSCompiler.test.ts pattern — instantiate directly
// and call compile() without an agentToken. The CompilerBase RBAC
// validator treats an absent token as a dev-mode bypass; the literal
// 'test-token' string is treated as a real token and fails verification
// (compileToIOS helper falls into that second path and errors).
let compiler: IOSCompiler;
beforeEach(() => {
  compiler = new IOSCompiler();
});
function compile(composition: HoloComposition) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (compiler as any).compile(composition);
}

// Fields stripped as non-deterministic. iOS codegen is expected to
// be deterministic given a fixed composition; this defends against
// future drift (e.g., if codegen adds a generation-timestamp comment).
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

// Regex for embedded timestamp/date strings in generated source.
// Matches ISO-8601 dates and Unix ms timestamps > 2020. Replaces with
// stable sentinel so codegen timestamp comments don't break the lock.
const EMBEDDED_TIMESTAMP_RE = /(\d{13,})|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/g;

function canonicalizeString(s: string): string {
  // Replace embedded timestamps with sentinel before hashing
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

// ── Composition builders (mirror existing IOSCompiler.test.ts helpers) ────

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
  return {
    name,
    properties: [],
    traits: [],
    ...overrides,
  } as HoloObjectDecl;
}

function objectWithTrait(name: string, traitName: string): HoloObjectDecl {
  return createObject(name, {
    traits: [{ name: traitName, config: [] }],
  } as unknown as Partial<HoloObjectDecl>);
}

describe('IOSCompiler characterization (W4-T3 pre-split lock for W1-T1)', () => {
  describe('Codegen concern (view / scene / state files)', () => {
    it('[I1] empty composition locks baseline codegen', () => {
      const result = compile(createComposition());
      expect(hashResult(result)).toMatchSnapshot('I1-empty');
    });

    it('[I2] composition with single object locks codegen', () => {
      const result = compile(
        createComposition({ objects: [createObject('Cube')] }),
      );
      expect(hashResult(result)).toMatchSnapshot('I2-singleObject');
    });

    it('[I3] composition with multiple objects locks codegen', () => {
      const result = compile(
        createComposition({
          objects: [
            createObject('Cube'),
            createObject('Sphere'),
            createObject('Plane'),
          ],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I3-multiObject');
    });
  });

  describe('Manifest concern (infoPlist)', () => {
    it('[I4] minimal infoPlist locks manifest', () => {
      const result = compile(createComposition());
      // Focus the lock specifically on the manifest field
      expect(hashResult({ infoPlist: result.infoPlist })).toMatchSnapshot('I4-infoPlistMinimal');
    });

    it('[I5] infoPlist with scene-tagged composition locks manifest', () => {
      const result = compile(
        createComposition({
          name: 'WorldScene',
          objects: [createObject('Anchor')],
        }),
      );
      expect(hashResult({ infoPlist: result.infoPlist })).toMatchSnapshot('I5-infoPlistWithScene');
    });
  });

  describe('Resource concern (per-trait file emission)', () => {
    it('[I6] lidar_* trait triggers lidarScannerFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Scanner', 'lidar_capture')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I6-lidar');
    });

    it('[I7] face_* trait triggers faceTrackingFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Avatar', 'face_tracking')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I7-faceTracking');
    });

    it('[I8] camera_hand_* trait triggers handTrackingFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Hand', 'camera_hand_tracking')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I8-handTracking');
    });

    it('[I9] roomplan_scan trait triggers roomPlanFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Room', 'roomplan_scan')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I9-roomPlan');
    });

    it('[I10] portal_* trait triggers portalARFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Portal', 'portal_ar')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I10-portal');
    });

    it('[I11] spatial_audio trait triggers spatialAudioFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('AudioSource', 'spatial_audio')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I11-spatialAudio');
    });

    it('[I12] object_capture trait triggers objectCaptureFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Capturable', 'object_capture')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I12-objectCapture');
    });

    it('[I13] shareplay_* trait triggers sharePlayFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Shared', 'shareplay_session')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I13-sharePlay');
    });

    it('[I14] uwb_* trait triggers uwbPositioningFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Beacon', 'uwb_positioning')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I14-uwb');
    });

    it('[I15] npu_* trait triggers npuSceneFile — locks output', () => {
      const result = compile(
        createComposition({
          objects: [objectWithTrait('Scene', 'npu_scene_understanding')],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I15-npu');
    });
  });

  describe('Build-orchestrator concern (composite end-to-end)', () => {
    it('[I16] multi-trait composite exercises all concerns + their interactions', () => {
      // Stress case: multiple objects, multiple trait families,
      // full codegen + manifest + resource emission in one compile.
      // The W1-T1 split must preserve this end-to-end.
      const result = compile(
        createComposition({
          name: 'FullScene',
          objects: [
            objectWithTrait('A', 'lidar_capture'),
            objectWithTrait('B', 'face_tracking'),
            objectWithTrait('C', 'spatial_audio'),
            createObject('PlainObj'),
          ],
        }),
      );
      expect(hashResult(result)).toMatchSnapshot('I16-composite');
    });
  });
});
