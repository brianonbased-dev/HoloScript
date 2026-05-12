/**
 * GaussianSplattingCompiler — multi-user shared-sort emit branch (P.043)
 *
 * Tests the compile-time detection of co-occurring `@gaussian_splat` +
 * `@multiplayer` traits and the extended compile result that carries the
 * shared-sort emit flag to the WebGPU runtime.
 *
 * G.GOLD.013 discipline: every TRUE assertion has a paired FALSE assertion
 * for the same dimension. The detector is computed (boolean returned from
 * tree-walk over trait arrays), so the FALSE case must be tested as
 * deliberately as the TRUE case — a constant `return false` would pass the
 * "neither trait" check but silently break the entire feature.
 *
 * @see GaussianSplattingCompiler.ts::detectMultiUserSharedSort
 * @see packages/engine/src/gpu/shaders/splat-shared-sort.wgsl
 * @see docs/archive/P043_MULTIVIEW_FOVEATED_GS_PAPER.md §5
 */

import { describe, it, expect } from 'vitest';
import {
  GaussianSplattingCompiler,
  detectMultiUserSharedSort,
  SHARED_SORT_SHADER_PATH,
} from '../GaussianSplattingCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
} from '../../parser/HoloCompositionTypes';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

function makeTrait(name: string, config: Record<string, unknown> = {}): HoloObjectTrait {
  return {
    type: 'ObjectTrait',
    name,
    config,
  };
}

function makeObject(name: string, traits: HoloObjectTrait[]): HoloObjectDecl {
  return {
    type: 'Object',
    name,
    properties: [],
    traits,
  };
}

function makeComposition(objects: HoloObjectDecl[]): HoloComposition {
  return {
    type: 'Composition',
    name: 'SharedSortTest',
    templates: [],
    objects,
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
  };
}

/** Minimal gaussian_splat trait config that satisfies the existing data
 *  extractor (so compileExtended() also produces a real glTF body). */
const MINIMAL_SPLAT_CONFIG = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0]),
  scales: new Float32Array([0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
  rotations: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1]),
  colors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]),
  opacities: new Float32Array([1, 1]),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('detectMultiUserSharedSort — co-occurrence detection (P.043)', () => {
  // FALSE cases (G.GOLD.013) ─────────────────────────────────────────────────

  it('FALSE: object with only @gaussian_splat → false', () => {
    const comp = makeComposition([
      makeObject('Solo', [makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG)]),
    ]);
    expect(detectMultiUserSharedSort(comp)).toBe(false);
  });

  it('FALSE: object with only @multiplayer → false', () => {
    const comp = makeComposition([makeObject('Mp', [makeTrait('multiplayer')])]);
    expect(detectMultiUserSharedSort(comp)).toBe(false);
  });

  it('FALSE: composition with neither trait → false', () => {
    const comp = makeComposition([
      makeObject('Plain', [makeTrait('mesh')]),
      makeObject('Other', [makeTrait('audio'), makeTrait('physics')]),
    ]);
    expect(detectMultiUserSharedSort(comp)).toBe(false);
  });

  it('FALSE: traits split across SIBLING objects (not same object) → false', () => {
    // Critical: sibling co-occurrence MUST NOT trigger shared-sort. Sibling
    // objects do not share a sort buffer at runtime — the only co-occurrence
    // that matters is on a single object.
    const comp = makeComposition([
      makeObject('SplatSibling', [makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG)]),
      makeObject('NetSibling', [makeTrait('multiplayer')]),
    ]);
    expect(detectMultiUserSharedSort(comp)).toBe(false);
  });

  it('FALSE: empty composition (no objects) → false', () => {
    const comp = makeComposition([]);
    expect(detectMultiUserSharedSort(comp)).toBe(false);
  });

  it('FALSE: object with empty traits array → false', () => {
    const comp = makeComposition([makeObject('Empty', [])]);
    expect(detectMultiUserSharedSort(comp)).toBe(false);
  });

  // TRUE cases (G.GOLD.013) ─────────────────────────────────────────────────

  it('TRUE: single object with BOTH @gaussian_splat AND @multiplayer → true', () => {
    const comp = makeComposition([
      makeObject('SharedSplat', [
        makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG),
        makeTrait('multiplayer'),
      ]),
    ]);
    expect(detectMultiUserSharedSort(comp)).toBe(true);
  });

  it('TRUE: both traits in reverse order on same object → true', () => {
    // Order-independence guard — the detector loop must not be order-sensitive.
    const comp = makeComposition([
      makeObject('Reverse', [
        makeTrait('multiplayer'),
        makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG),
      ]),
    ]);
    expect(detectMultiUserSharedSort(comp)).toBe(true);
  });

  it('TRUE: nested child has both traits → true', () => {
    // Coverage for compositions where the splat+multiplayer object lives
    // inside a parent container (e.g. group / scene / world).
    const child = makeObject('NestedShared', [
      makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG),
      makeTrait('multiplayer'),
    ]);
    const parent: HoloObjectDecl & { children: HoloObjectDecl[] } = {
      ...makeObject('Parent', [makeTrait('mesh')]),
      children: [child],
    };
    const comp = makeComposition([parent as HoloObjectDecl]);
    expect(detectMultiUserSharedSort(comp)).toBe(true);
  });

  it('TRUE: many objects, one has both → true', () => {
    // Verifies the walk does not short-circuit on the first object's traits.
    const comp = makeComposition([
      makeObject('A', [makeTrait('mesh')]),
      makeObject('B', [makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG)]),
      makeObject('C', [makeTrait('multiplayer')]),
      makeObject('D', [
        makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG),
        makeTrait('multiplayer'),
      ]),
      makeObject('E', [makeTrait('audio')]),
    ]);
    expect(detectMultiUserSharedSort(comp)).toBe(true);
  });
});

describe('GaussianSplattingCompiler.compileExtended — emit branch wiring', () => {
  // FALSE case ───────────────────────────────────────────────────────────────

  it('FALSE: solo @gaussian_splat → multiUserSharedSort=false, no shader path', () => {
    const compiler = new GaussianSplattingCompiler();
    const comp = makeComposition([
      makeObject('Solo', [makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG)]),
    ]);
    const result = compiler.compileExtended(comp);

    expect(result.multiUserSharedSort).toBe(false);
    expect(result.sharedSortShaderPath).toBeUndefined();
    // Standard glTF path remains unchanged — caller can still consume the
    // KHR_gaussian_splatting export.
    expect(result.gltf.binary).toBeDefined();
    expect(result.gltf.stats.totalVertices).toBe(2);
  });

  // TRUE case ────────────────────────────────────────────────────────────────

  it('TRUE: co-occurring traits → multiUserSharedSort=true, shader path emitted', () => {
    const compiler = new GaussianSplattingCompiler();
    const comp = makeComposition([
      makeObject('SharedSplat', [
        makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG),
        makeTrait('multiplayer'),
      ]),
    ]);
    const result = compiler.compileExtended(comp);

    expect(result.multiUserSharedSort).toBe(true);
    expect(result.sharedSortShaderPath).toBe(SHARED_SORT_SHADER_PATH);
    expect(result.sharedSortShaderPath).toMatch(/splat-shared-sort\.wgsl$/);
    // Standard glTF export still produced — the extended path is additive,
    // not a replacement.
    expect(result.gltf.binary).toBeDefined();
    expect(result.gltf.stats.totalVertices).toBe(2);
  });

  it('instance method detectMultiUserSharedSort mirrors the standalone fn', () => {
    const compiler = new GaussianSplattingCompiler();
    const trueComp = makeComposition([
      makeObject('Both', [
        makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG),
        makeTrait('multiplayer'),
      ]),
    ]);
    const falseComp = makeComposition([
      makeObject('Solo', [makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG)]),
    ]);
    expect(compiler.detectMultiUserSharedSort(trueComp)).toBe(true);
    expect(compiler.detectMultiUserSharedSort(falseComp)).toBe(false);
  });

  it('legacy compile() API unchanged — does not return extended fields', () => {
    // Regression guard: existing call sites (MCP compile_to_3dgs, ExportManager)
    // must keep their GLTFExportResult contract.
    const compiler = new GaussianSplattingCompiler();
    const comp = makeComposition([
      makeObject('Solo', [makeTrait('gaussian_splat', MINIMAL_SPLAT_CONFIG)]),
    ]);
    const result = compiler.compile(comp);
    expect(result.binary).toBeDefined();
    // No extended fields leaked onto the basic result.
    expect((result as unknown as { multiUserSharedSort?: boolean }).multiUserSharedSort)
      .toBeUndefined();
  });
});
