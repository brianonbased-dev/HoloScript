/**
 * CorticalDepthRouter — unit tests
 *
 * Acceptance criteria (task_1779336717743_27h5):
 *   ✓ raw slices → depth 4 (thalamo-cortical input)
 *   ✓ association slices → depth 3 (cortico-cortical / PillarJEPA)
 *   ✓ output slices → depth 5 (GRPO-ready, cortico-subcortical)
 *   ✓ monitoring slices → depth 1 (diffuse neuromodulation)
 *   ✓ shutdown slices → depth 6 (cortico-thalamic)
 *   ✓ enrichCoord() returns new object, does not mutate input
 *   ✓ enrichCoord() preserves original (x,y,z) and receipt integrity
 *   ✓ inferStage() inverts routeDepth() for primary stages
 *   ✓ corticalDepthRouterHandler emits cortical:routed event
 */

import { describe, it, expect, vi } from 'vitest';
import {
  routeDepth,
  enrichCoord,
  inferStage,
  corticalDepthRouterHandler,
  type SliceStage,
} from '../CorticalDepthRouter';
import type { BrainCoord } from '../SemanticCollaborationContract';
import type { HSPlusNode, TraitContext } from '../../TraitTypes';

const BASE_COORD: BrainCoord = {
  mni_x: 30,
  mni_y: -50,
  mni_z: 60,
  cortical_depth: 4,
  brodmann_area: 7,
  surface_type: 'gyrus',
};

function makeNode(): HSPlusNode {
  return { id: 'test-node', traits: [], metadata: {} } as unknown as HSPlusNode;
}

function makeCtx(): TraitContext & { emitted: Array<{ name: string; payload: unknown }> } {
  const emitted: Array<{ name: string; payload: unknown }> = [];
  return {
    emitted,
    emit(name: string, payload: unknown) { emitted.push({ name, payload }); },
  } as unknown as TraitContext & { emitted: typeof emitted };
}

describe('routeDepth()', () => {
  const cases: [SliceStage, number][] = [
    ['raw',         4],
    ['association', 3],
    ['output',      5],
    ['monitoring',  1],
    ['shutdown',    6],
  ];

  for (const [stage, expectedDepth] of cases) {
    it(`${stage} → depth ${expectedDepth}`, () => {
      expect(routeDepth(stage)).toBe(expectedDepth);
    });
  }
});

describe('enrichCoord()', () => {
  it('sets cortical_depth for raw stage', () => {
    const result = enrichCoord(BASE_COORD, 'raw');
    expect(result.cortical_depth).toBe(4);
  });

  it('sets cortical_depth for association stage', () => {
    const result = enrichCoord(BASE_COORD, 'association');
    expect(result.cortical_depth).toBe(3);
  });

  it('sets cortical_depth for output stage (GRPO-ready)', () => {
    const result = enrichCoord(BASE_COORD, 'output');
    expect(result.cortical_depth).toBe(5);
  });

  it('sets cortical_depth for monitoring stage', () => {
    const result = enrichCoord(BASE_COORD, 'monitoring');
    expect(result.cortical_depth).toBe(1);
  });

  it('sets cortical_depth for shutdown stage', () => {
    const result = enrichCoord(BASE_COORD, 'shutdown');
    expect(result.cortical_depth).toBe(6);
  });

  it('preserves original (x,y,z) coordinates unchanged', () => {
    const result = enrichCoord(BASE_COORD, 'output');
    expect(result.mni_x).toBe(BASE_COORD.mni_x);
    expect(result.mni_y).toBe(BASE_COORD.mni_y);
    expect(result.mni_z).toBe(BASE_COORD.mni_z);
  });

  it('preserves brodmann_area and surface_type', () => {
    const result = enrichCoord(BASE_COORD, 'association');
    expect(result.brodmann_area).toBe(7);
    expect(result.surface_type).toBe('gyrus');
  });

  it('does NOT mutate the input coord', () => {
    const originalDepth = BASE_COORD.cortical_depth;
    enrichCoord(BASE_COORD, 'shutdown');
    expect(BASE_COORD.cortical_depth).toBe(originalDepth);
  });

  it('returns a new object (not reference equality)', () => {
    const result = enrichCoord(BASE_COORD, 'raw');
    expect(result).not.toBe(BASE_COORD);
  });
});

describe('inferStage()', () => {
  it('depth 4 → raw', () => {
    expect(inferStage(4)).toBe('raw');
  });

  it('depth 3 → association', () => {
    expect(inferStage(3)).toBe('association');
  });

  it('depth 5 → output', () => {
    expect(inferStage(5)).toBe('output');
  });

  it('depth 1 → monitoring', () => {
    expect(inferStage(1)).toBe('monitoring');
  });

  it('depth 6 → shutdown', () => {
    expect(inferStage(6)).toBe('shutdown');
  });

  it('depth 2 falls back to raw (unassigned depth)', () => {
    // depth 2 is not assigned in the stage map → fallback 'raw'
    expect(inferStage(2)).toBe('raw');
  });
});

describe('corticalDepthRouterHandler (TraitHandler)', () => {
  it('emits cortical:routed with enriched coord', () => {
    const ctx = makeCtx();
    corticalDepthRouterHandler.onEvent?.(
      makeNode(),
      { emit_events: true },
      ctx,
      { type: 'cortical:route', stage: 'output', brain_coord: BASE_COORD } as never,
    );
    expect(ctx.emitted).toHaveLength(1);
    const ev = ctx.emitted[0]!;
    expect(ev.name).toBe('cortical:routed');
    const payload = ev.payload as { brain_coord: BrainCoord; stage: SliceStage; depth: number };
    expect(payload.stage).toBe('output');
    expect(payload.depth).toBe(5);
    expect(payload.brain_coord.cortical_depth).toBe(5);
    // x/y/z preserved
    expect(payload.brain_coord.mni_x).toBe(BASE_COORD.mni_x);
  });

  it('does NOT emit when emit_events=false', () => {
    const ctx = makeCtx();
    corticalDepthRouterHandler.onEvent?.(
      makeNode(),
      { emit_events: false },
      ctx,
      { type: 'cortical:route', stage: 'raw', brain_coord: BASE_COORD } as never,
    );
    expect(ctx.emitted).toHaveLength(0);
  });

  it('ignores unrelated event types', () => {
    const ctx = makeCtx();
    corticalDepthRouterHandler.onEvent?.(
      makeNode(),
      { emit_events: true },
      ctx,
      { type: 'some:other:event' } as never,
    );
    expect(ctx.emitted).toHaveLength(0);
  });

  it('does nothing when stage or brain_coord is missing', () => {
    const ctx = makeCtx();
    corticalDepthRouterHandler.onEvent?.(
      makeNode(),
      { emit_events: true },
      ctx,
      { type: 'cortical:route' } as never,
    );
    expect(ctx.emitted).toHaveLength(0);
  });

  it('defaultConfig returns emit_events: true', () => {
    const cfg = corticalDepthRouterHandler.defaultConfig?.() as { emit_events: boolean };
    expect(cfg.emit_events).toBe(true);
  });
});
