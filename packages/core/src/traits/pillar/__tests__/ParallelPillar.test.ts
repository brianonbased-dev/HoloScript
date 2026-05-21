/**
 * ParallelPillar — unit tests
 *
 * Validates:
 *   1. computeParallelBounds: bounding box arithmetic + agreement score
 *   2. makeParallelPillar: calls both hemispheres, assembles slice
 *   3. HEMISPHERE_MAP: all PillarDomain values are classified
 *   4. hemisphereFromMniX / mniXForHemisphere: MNI coordinate utilities
 *   5. Seed parallel pillars: register and generate_parallel via handler
 *   6. Agreement = 1 when both hemispheres produce identical slices
 *   7. Agreement < 1 when hemispheres diverge (box has non-zero area)
 *   8. List event returns all seed parallels
 *   9. Error on missing parallel_id
 *  10. Error on unknown parallel_id
 *  11. Custom parallel pillar can be registered and generated
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  parallelPillarHandler,
  computeParallelBounds,
  makeParallelPillar,
  hemisphereFromMniX,
  mniXForHemisphere,
  HEMISPHERE_MAP,
  SEED_PARALLEL_PILLARS,
  LEFT_PHYSICS_PILLAR,
  RIGHT_PHYSICS_PILLAR,
  type ParallelPillarSlice,
  type ParallelPillarSummary,
} from '../ParallelPillar';
import type { HSPlusNode, TraitContext } from '../../TraitTypes';
import type { PillarSlice } from '../../pillar/SemanticCollaborationContract';
import type { PillarContext } from '../PillarRegistry';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(): HSPlusNode {
  return {} as HSPlusNode;
}

function makeCtx() {
  const events: Array<{ name: string; payload: unknown }> = [];
  const ctx = {
    emit(name: string, payload: unknown) {
      events.push({ name, payload });
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;
  return { ctx, events };
}

const DEFAULT_CONFIG = {
  max_parallel_pillars: 256,
  emit_box_area: true,
};

const DEFAULT_CONTEXT: PillarContext = {
  layer: 'test',
  agent_id: 'test_agent',
  timestamp_ms: 0,
};

function makeSlice(pos_1: number, pos_2: number, pillar_id = 'test'): PillarSlice {
  return {
    axis_1_id: 'energy',
    axis_2_id: 'momentum',
    pos_1,
    pos_2,
    pillar_id,
    pillar_domain: 'physics',
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('computeParallelBounds', () => {
  it('produces correct box when left < right', () => {
    const left  = makeSlice(0.2, 0.1);
    const right = makeSlice(0.8, 0.9);
    const result = computeParallelBounds(left, right);

    expect(result.bounds.pos_1_min).toBeCloseTo(0.2);
    expect(result.bounds.pos_1_max).toBeCloseTo(0.8);
    expect(result.bounds.pos_2_min).toBeCloseTo(0.1);
    expect(result.bounds.pos_2_max).toBeCloseTo(0.9);

    // box_area = (0.8 - 0.2) × (0.9 - 0.1) = 0.6 × 0.8 = 0.48
    expect(result.box_area).toBeCloseTo(0.48);
    expect(result.hemisphere_agreement).toBeCloseTo(0.52);
  });

  it('produces correct box when right < left (symmetric)', () => {
    const left  = makeSlice(0.9, 0.8);
    const right = makeSlice(0.1, 0.2);
    const result = computeParallelBounds(left, right);

    expect(result.bounds.pos_1_min).toBeCloseTo(0.1);
    expect(result.bounds.pos_1_max).toBeCloseTo(0.9);
    expect(result.bounds.pos_2_min).toBeCloseTo(0.2);
    expect(result.bounds.pos_2_max).toBeCloseTo(0.8);
  });

  it('agreement = 1 when slices are identical', () => {
    const slice = makeSlice(0.5, 0.5);
    const result = computeParallelBounds(slice, slice);

    expect(result.box_area).toBeCloseTo(0);
    expect(result.hemisphere_agreement).toBeCloseTo(1);
  });

  it('box_area ∈ [0, 1]', () => {
    const left  = makeSlice(0.0, 0.0);
    const right = makeSlice(1.0, 1.0);
    const result = computeParallelBounds(left, right);

    expect(result.box_area).toBeCloseTo(1.0);
    expect(result.hemisphere_agreement).toBeCloseTo(0.0);
  });
});

describe('makeParallelPillar', () => {
  it('generates slice from both hemispheres', () => {
    const pp = makeParallelPillar('test_pp', LEFT_PHYSICS_PILLAR, RIGHT_PHYSICS_PILLAR);
    const slice = pp.generateParallel(DEFAULT_CONTEXT);

    expect(slice.parallel_id).toBe('test_pp');
    expect(slice.left.pillar_id).toBe('physics_conservation_left');
    expect(slice.right.pillar_id).toBe('physics_conservation_right');
    expect(typeof slice.bounds.pos_1_min).toBe('number');
    expect(typeof slice.box_area).toBe('number');
    expect(slice.box_area).toBeGreaterThanOrEqual(0);
    expect(slice.hemisphere_agreement).toBeGreaterThanOrEqual(0);
    expect(slice.hemisphere_agreement).toBeLessThanOrEqual(1);
  });
});

describe('HEMISPHERE_MAP', () => {
  it('classifies all expected left-hemisphere domains', () => {
    expect(HEMISPHERE_MAP['language']).toBe('left');
    expect(HEMISPHERE_MAP['compiler']).toBe('left');
    expect(HEMISPHERE_MAP['accuracy_speed']).toBe('left');
    expect(HEMISPHERE_MAP['economics']).toBe('left');
  });

  it('classifies all expected right-hemisphere domains', () => {
    expect(HEMISPHERE_MAP['physics']).toBe('right');
    expect(HEMISPHERE_MAP['rendering']).toBe('right');
    expect(HEMISPHERE_MAP['coordination']).toBe('right');
    expect(HEMISPHERE_MAP['truth_approval']).toBe('right');
    expect(HEMISPHERE_MAP['safety_exploration']).toBe('right');
  });

  it('classifies bilateral domains', () => {
    expect(HEMISPHERE_MAP['steady_state']).toBe('bilateral');
    expect(HEMISPHERE_MAP['solver']).toBe('bilateral');
    expect(HEMISPHERE_MAP['agent']).toBe('bilateral');
    expect(HEMISPHERE_MAP['storage']).toBe('bilateral');
  });
});

describe('hemisphereFromMniX / mniXForHemisphere', () => {
  it('positive MNI x → left', () => {
    expect(hemisphereFromMniX(45)).toBe('left');
    expect(hemisphereFromMniX(11)).toBe('left');
  });

  it('negative MNI x → right', () => {
    expect(hemisphereFromMniX(-45)).toBe('right');
    expect(hemisphereFromMniX(-11)).toBe('right');
  });

  it('midline MNI x → bilateral', () => {
    expect(hemisphereFromMniX(0)).toBe('bilateral');
    expect(hemisphereFromMniX(10)).toBe('bilateral');
    expect(hemisphereFromMniX(-10)).toBe('bilateral');
  });

  it('mniXForHemisphere returns canonical coordinates', () => {
    expect(mniXForHemisphere('left')).toBe(45);
    expect(mniXForHemisphere('right')).toBe(-45);
    expect(mniXForHemisphere('bilateral')).toBe(0);
  });

  it('round-trips left/right through mniX → hemisphere', () => {
    expect(hemisphereFromMniX(mniXForHemisphere('left'))).toBe('left');
    expect(hemisphereFromMniX(mniXForHemisphere('right'))).toBe('right');
    expect(hemisphereFromMniX(mniXForHemisphere('bilateral'))).toBe('bilateral');
  });
});

describe('parallelPillarHandler', () => {
  let node: HSPlusNode;
  let ctx: TraitContext;
  let events: Array<{ name: string; payload: unknown }>;

  beforeEach(() => {
    node = makeNode();
    const made = makeCtx();
    ctx = made.ctx;
    events = made.events;
    parallelPillarHandler.onAttach?.(node, DEFAULT_CONFIG, ctx);
    events.length = 0;
  });

  afterEach(() => {
    parallelPillarHandler.onDetach?.(node, DEFAULT_CONFIG, ctx);
  });

  it('list event returns all seed parallel pillars', () => {
    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:list_parallel',
    });

    const listEvent = events.find(e => e.name === 'pillar:parallel_registry');
    expect(listEvent).toBeDefined();
    const { parallels } = listEvent!.payload as { parallels: ParallelPillarSummary[] };
    expect(parallels.length).toBe(SEED_PARALLEL_PILLARS.length);
    const ids = parallels.map(p => p.id);
    expect(ids).toContain('energy_entropy_parallel');
    expect(ids).toContain('truth_physics_parallel');
    expect(ids).toContain('temporal_lateral_parallel');
  });

  it('generate_parallel emits pillar:parallel_slice for a seed parallel', () => {
    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
      parallel_id: 'energy_entropy_parallel',
      context: DEFAULT_CONTEXT,
    });

    const sliceEvent = events.find(e => e.name === 'pillar:parallel_slice');
    expect(sliceEvent).toBeDefined();
    const { slice } = sliceEvent!.payload as { slice: ParallelPillarSlice };
    expect(slice.parallel_id).toBe('energy_entropy_parallel');
    expect(slice.left.pillar_domain).toBe('physics');
    expect(slice.right.pillar_domain).toBe('physics');
    expect(slice.hemisphere_agreement).toBeGreaterThanOrEqual(0);
    expect(slice.hemisphere_agreement).toBeLessThanOrEqual(1);
  });

  it('truth_physics_parallel produces left=truth_approval, right=physics', () => {
    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
      parallel_id: 'truth_physics_parallel',
      context: DEFAULT_CONTEXT,
    });

    const { slice } = (events.find(e => e.name === 'pillar:parallel_slice')?.payload) as
      { slice: ParallelPillarSlice };
    expect(slice.left.pillar_domain).toBe('truth_approval');
    expect(slice.right.pillar_domain).toBe('physics');
  });

  it('temporal_lateral_parallel produces both steady_state domain slices', () => {
    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
      parallel_id: 'temporal_lateral_parallel',
      context: DEFAULT_CONTEXT,
    });

    const { slice } = (events.find(e => e.name === 'pillar:parallel_slice')?.payload) as
      { slice: ParallelPillarSlice };
    expect(slice.left.pillar_domain).toBe('steady_state');
    expect(slice.right.pillar_domain).toBe('steady_state');
  });

  it('emits pillar:parallel_error for missing parallel_id', () => {
    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
    });

    const err = events.find(e => e.name === 'pillar:parallel_error');
    expect(err).toBeDefined();
    expect((err!.payload as { code: string }).code).toBe('PARALLEL_NOT_FOUND');
  });

  it('emits pillar:parallel_error for unknown parallel_id', () => {
    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
      parallel_id: 'does_not_exist',
    });

    const err = events.find(e => e.name === 'pillar:parallel_error');
    expect(err).toBeDefined();
    expect((err!.payload as { code: string }).code).toBe('PARALLEL_NOT_FOUND');
  });

  it('custom ParallelPillar can be registered and generated', () => {
    // Register a custom parallel pair
    const customPP = makeParallelPillar(
      'custom_test_parallel',
      LEFT_PHYSICS_PILLAR,
      RIGHT_PHYSICS_PILLAR,
    );

    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:register_parallel',
      parallel: customPP,
    });

    const registered = events.find(e => e.name === 'pillar:parallel_registered');
    expect(registered).toBeDefined();
    expect((registered!.payload as { id: string }).id).toBe('custom_test_parallel');

    events.length = 0;

    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
      parallel_id: 'custom_test_parallel',
      context: DEFAULT_CONTEXT,
    });

    const sliceEvent = events.find(e => e.name === 'pillar:parallel_slice');
    expect(sliceEvent).toBeDefined();
  });

  it('hemisphere_agreement = 1 when both hemispheres produce same pos values', () => {
    // The default context has no metadata → both left and right physics pillars
    // return their defaults. Left returns (1.0, 0.0), right returns (0.5, 0.0).
    // They differ in pos_1, so agreement < 1.
    // For a perfect-agreement test, use metadata that forces both to produce the same values.
    const sameValCtx: PillarContext = {
      layer: 'test',
      agent_id: 'test',
      timestamp_ms: 0,
      metadata: {
        energy_conservation: 0.5,
        momentum_violation: 0.3,
        entropy_level: 0.5,
        angular_momentum_pressure: 0.3,
      },
    };

    parallelPillarHandler.onEvent?.(node, DEFAULT_CONFIG, ctx, {
      type: 'pillar:generate_parallel',
      parallel_id: 'energy_entropy_parallel',
      context: sameValCtx,
    });

    const { slice } = (events.find(e => e.name === 'pillar:parallel_slice')?.payload) as
      { slice: ParallelPillarSlice };

    // pos_1: left=0.5, right=0.5 → width=0
    // pos_2: left=0.3, right=0.3 → height=0 → box_area=0 → agreement=1
    expect(slice.left.pos_1).toBeCloseTo(0.5);
    expect(slice.right.pos_1).toBeCloseTo(0.5);
    expect(slice.left.pos_2).toBeCloseTo(0.3);
    expect(slice.right.pos_2).toBeCloseTo(0.3);
    expect(slice.box_area).toBeCloseTo(0);
    expect(slice.hemisphere_agreement).toBeCloseTo(1);
  });
});
