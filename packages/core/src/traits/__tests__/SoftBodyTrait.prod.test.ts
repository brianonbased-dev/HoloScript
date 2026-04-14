/**
 * SoftBodyTrait — Production Tests (TraitHandler pattern)
 *
 * SoftBodyTrait imports SoftBodySolver. We test purely via onAttach / onDetach
 * / onEvent handlers. onAttach builds a SoftBodySolver internally — that path
 * executes against the real solver (with a fallback 2-particle chain when no
 * meshData is present). We focus on:
 *
 * - defaultConfig values
 * - onAttach: state created, isSimulating=true, solver instantiated
 * - onDetach: emits soft_body_destroy if simulating, clears __softBodyState
 * - onEvent 'soft_body_vertex_update': vertices updated, deformation computed,
 *   mesh_update emitted, on_soft_body_deform emitted when deformed
 * - onEvent 'soft_body_vertex_update': reset clears deformation
 * - onEvent 'soft_body_apply_force': emits soft_body_external_force
 * - onEvent 'soft_body_poke': emits soft_body_impulse with scaled force vector
 * - onEvent 'soft_body_set_anchor': emits soft_body_anchor_vertex
 * - onEvent 'soft_body_release_anchor': emits soft_body_unanchor_vertex
 * - onEvent 'soft_body_grab_start': emits soft_body_grab_begin
 * - onEvent 'soft_body_grab_update': emits soft_body_grab_move
 * - onEvent 'soft_body_grab_end': emits soft_body_grab_release
 * - onEvent 'soft_body_reset': vertices back to rest, isDeformed=false
 * - onEvent 'soft_body_pause': isSimulating=false
 * - onEvent 'soft_body_resume': isSimulating=true
 * - onEvent 'soft_body_query': emits soft_body_info
 * - onEvent: no-op when no state on node
 */
import { describe, it, expect, vi } from 'vitest';
import { softBodyHandler } from '../SoftBodyTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

type SoftBodyConfig = NonNullable<Parameters<typeof softBodyHandler.onAttach>[1]>;

function mkConfig(o: Partial<SoftBodyConfig> = {}): SoftBodyConfig {
  return { ...softBodyHandler.defaultConfig!, ...o };
}

function mkNode() {
  // no meshData → fallback 2-particle solver
  return {} as Record<string, any>;
}

function mkCtx() {
  const ctx = { emitted: [] as Array<{ type: string; payload: any }>, emit: vi.fn() };
  ctx.emit = vi.fn((type: string, payload: any) => {
    ctx.emitted.push({ type, payload });
  }) as any;
  return ctx;
}

function attach(cfg = mkConfig(), node = mkNode(), ctx = mkCtx()) {
  softBodyHandler.onAttach!(node as any, cfg, ctx as any);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────────

describe('softBodyHandler — defaultConfig', () => {
  it('stiffness = 0.5', () => expect(softBodyHandler.defaultConfig?.stiffness).toBeCloseTo(0.5));
  it('damping = 0.05', () => expect(softBodyHandler.defaultConfig?.damping).toBeCloseTo(0.05));
  it('mass = 1.0', () => expect(softBodyHandler.defaultConfig?.mass).toBeCloseTo(1.0));
  it('pressure = 1.0', () => expect(softBodyHandler.defaultConfig?.pressure).toBeCloseTo(1.0));
  it('volume_conservation = 0.9', () =>
    expect(softBodyHandler.defaultConfig?.volume_conservation).toBeCloseTo(0.9));
  it('solver_iterations = 10', () =>
    expect(softBodyHandler.defaultConfig?.solver_iterations).toBe(10));
  it('tetrahedral = false', () => expect(softBodyHandler.defaultConfig?.tetrahedral).toBe(false));
  it('surface_stiffness = 0.5', () =>
    expect(softBodyHandler.defaultConfig?.surface_stiffness).toBeCloseTo(0.5));
  it('bending_stiffness = 0.3', () =>
    expect(softBodyHandler.defaultConfig?.bending_stiffness).toBeCloseTo(0.3));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────────

describe('softBodyHandler — onAttach', () => {
  it('creates __softBodyState', () => {
    const { node } = attach();
    expect((node as any).__softBodyState).toBeDefined();
  });
  it('isSimulating = true', () => {
    const { node } = attach();
    expect((node as any).__softBodyState.isSimulating).toBe(true);
  });
  it('isDeformed = false initially', () => {
    const { node } = attach();
    expect((node as any).__softBodyState.isDeformed).toBe(false);
  });
  it('deformationAmount = 0 initially', () => {
    const { node } = attach();
    expect((node as any).__softBodyState.deformationAmount).toBe(0);
  });
  it('solver is not null (fallback 2-particle created)', () => {
    const { node } = attach();
    expect((node as any).__softBodyState.solver).not.toBeNull();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────────

describe('softBodyHandler — onDetach', () => {
  it('emits soft_body_destroy when simulating', () => {
    const { node, ctx, cfg } = attach();
    softBodyHandler.onDetach!(node as any, cfg, ctx as any);
    expect(ctx.emitted.find((e) => e.type === 'soft_body_destroy')).toBeDefined();
  });
  it('removes __softBodyState', () => {
    const { node, ctx, cfg } = attach();
    softBodyHandler.onDetach!(node as any, cfg, ctx as any);
    expect((node as any).__softBodyState).toBeUndefined();
  });
  it('no soft_body_destroy when paused first', () => {
    const { node, ctx, cfg } = attach();
    softBodyHandler.onEvent!(node as any, cfg, ctx as any, { type: 'soft_body_pause' } as any);
    ctx.emitted.length = 0;
    softBodyHandler.onDetach!(node as any, cfg, ctx as any);
    expect(ctx.emitted.find((e) => e.type === 'soft_body_destroy')).toBeUndefined();
  });
});

// ─── onEvent 'soft_body_vertex_update' ───────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_vertex_update', () => {
  it('stores vertices from positions array', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0.5, 0, 0 ]],
        normals: [],
      } as any
    );
    expect((node as any).__softBodyState.vertices[0].position).toEqual([0.5, 0, 0 ]);
  });
  it('emits soft_body_mesh_update', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0, 0, 0 ]],
        normals: [],
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_mesh_update')).toBeDefined();
  });
  it('isDeformed = true when positions differ from restPositions', () => {
    const { node, ctx } = attach();
    // First set rest via vertex_update (positions become restPosition for new vertices)
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0, 0, 0 ]],
        normals: [],
      } as any
    );
    // Now move it > 0.01 away from rest
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[1, 0, 0 ]],
        normals: [],
      } as any
    );
    expect((node as any).__softBodyState.isDeformed).toBe(true);
  });
  it('emits on_soft_body_deform when deformed', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0, 0, 0 ]],
      } as any
    );
    ctx.emitted.length = 0;
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[1, 0, 0 ]],
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'on_soft_body_deform')).toBeDefined();
  });
  it('updates currentVolume from event', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0, 0, 0 ]],
        volume: 2.5,
      } as any
    );
    expect((node as any).__softBodyState.currentVolume).toBeCloseTo(2.5);
  });
});

// ─── onEvent 'soft_body_apply_force' ─────────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_apply_force', () => {
  it('emits soft_body_external_force', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_apply_force',
        force: [1, 2, 3 ],
        position: [0, 0, 0],
        radius: 0.2,
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_external_force')).toBeDefined();
  });
  it('includes force in payload', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_apply_force',
        force: [5, 0, 0 ],
      } as any
    );
    const ev = ctx.emitted.find((e) => e.type === 'soft_body_external_force');
    expect(ev?.payload.force).toEqual([5, 0, 0 ]);
  });
  it('default radius = 0.1 when not provided', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_apply_force',
        force: [0, 0, 1 ],
      } as any
    );
    expect(
      ctx.emitted.find((e) => e.type === 'soft_body_external_force')?.payload.radius
    ).toBeCloseTo(0.1);
  });
});

// ─── onEvent 'soft_body_poke' ─────────────────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_poke', () => {
  it('emits soft_body_impulse', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_poke',
        position: [0, 0, 0],
        force: 5,
        direction: [0, -1, 0 ],
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_impulse')).toBeDefined();
  });
  it('impulse force scaled by force magnitude', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_poke',
        position: [0, 0, 0],
        force: 10,
        direction: [0, -1, 0 ],
      } as any
    );
    const ev = ctx.emitted.find((e) => e.type === 'soft_body_impulse');
    expect(ev?.payload.force[1]).toBeCloseTo(-10);
  });
  it('default force = 10 and direction = {0,-1,0}', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_poke',
        position: [0, 0, 0],
      } as any
    );
    const ev = ctx.emitted.find((e) => e.type === 'soft_body_impulse');
    expect(ev?.payload.force[1]).toBeCloseTo(-10);
  });
});

// ─── onEvent 'soft_body_set_anchor' ──────────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_set_anchor', () => {
  it('emits soft_body_anchor_vertex', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_set_anchor',
        vertexIndex: 2,
        targetPosition: [1, 0, 0 ],
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_anchor_vertex')).toBeDefined();
  });
  it('includes vertexIndex in payload', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_set_anchor',
        vertexIndex: 5,
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_anchor_vertex')?.payload.vertexIndex).toBe(
      5
    );
  });
});

// ─── onEvent 'soft_body_release_anchor' ──────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_release_anchor', () => {
  it('emits soft_body_unanchor_vertex', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_release_anchor',
        vertexIndex: 2,
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_unanchor_vertex')).toBeDefined();
  });
  it('includes vertexIndex in payload', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_release_anchor',
        vertexIndex: 7,
      } as any
    );
    expect(
      ctx.emitted.find((e) => e.type === 'soft_body_unanchor_vertex')?.payload.vertexIndex
    ).toBe(7);
  });
});

// ─── onEvent grab ─────────────────────────────────────────────────────────────────

describe('softBodyHandler — onEvent grab', () => {
  it('soft_body_grab_start emits soft_body_grab_begin', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_grab_start',
        handId: 'right',
        handPosition: [0, 1, 0 ],
        grabRadius: 0.2,
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_grab_begin')).toBeDefined();
  });
  it('soft_body_grab_update emits soft_body_grab_move', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_grab_update',
        handId: 'right',
        handPosition: [1, 1, 0 ],
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_grab_move')).toBeDefined();
  });
  it('soft_body_grab_end emits soft_body_grab_release', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_grab_end',
        handId: 'right',
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_grab_release')).toBeDefined();
  });
  it('grab handId defaults to "default"', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_grab_start',
        handPosition: [0, 0, 0 ],
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_grab_begin')?.payload.handId).toBe(
      'default'
    );
  });
});

// ─── onEvent 'soft_body_reset' ────────────────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_reset', () => {
  it('emits soft_body_reset_shape', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_reset' } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_reset_shape')).toBeDefined();
  });
  it('clears isDeformed', () => {
    const { node, ctx } = attach();
    // Deform first
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0, 0, 0 ]],
      } as any
    );
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[2, 0, 0 ]],
      } as any
    );
    expect((node as any).__softBodyState.isDeformed).toBe(true);
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_reset' } as any
    );
    expect((node as any).__softBodyState.isDeformed).toBe(false);
  });
  it('deformationAmount = 0 after reset', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_reset' } as any
    );
    expect((node as any).__softBodyState.deformationAmount).toBe(0);
  });
  it('currentVolume reset to restVolume', () => {
    const { node, ctx } = attach();
    // Change currentVolume
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_vertex_update',
        positions: [[0, 0, 0 ]],
        volume: 2.0,
      } as any
    );
    const rest = (node as any).__softBodyState.restVolume;
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_reset' } as any
    );
    expect((node as any).__softBodyState.currentVolume).toBeCloseTo(rest);
  });
});

// ─── onEvent pause / resume ───────────────────────────────────────────────────────

describe('softBodyHandler — onEvent pause / resume', () => {
  it('soft_body_pause sets isSimulating = false', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_pause' } as any
    );
    expect((node as any).__softBodyState.isSimulating).toBe(false);
  });
  it('soft_body_resume sets isSimulating = true', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_pause' } as any
    );
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_resume' } as any
    );
    expect((node as any).__softBodyState.isSimulating).toBe(true);
  });
});

// ─── onEvent 'soft_body_query' ────────────────────────────────────────────────────

describe('softBodyHandler — onEvent soft_body_query', () => {
  it('emits soft_body_info', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      {
        type: 'soft_body_query',
        queryId: 'q1',
      } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_info')).toBeDefined();
  });
  it('info includes isSimulating', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_query', queryId: 'q1' } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_info')?.payload.isSimulating).toBe(true);
  });
  it('info includes queryId', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_query', queryId: 'abc' } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_info')?.payload.queryId).toBe('abc');
  });
  it('volumeRatio = 1 initially (currentVolume/restVolume)', () => {
    const { node, ctx } = attach();
    softBodyHandler.onEvent!(
      node as any,
      mkConfig(),
      ctx as any,
      { type: 'soft_body_query', queryId: 'q1' } as any
    );
    expect(ctx.emitted.find((e) => e.type === 'soft_body_info')?.payload.volumeRatio).toBeCloseTo(
      1.0
    );
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────────

describe('softBodyHandler — edge cases', () => {
  it('onEvent no-op when no state on node', () => {
    expect(() =>
      softBodyHandler.onEvent!(
        mkNode() as any,
        mkConfig(),
        mkCtx() as any,
        { type: 'soft_body_poke', position: [0, 0, 0] } as any
      )
    ).not.toThrow();
  });
});
