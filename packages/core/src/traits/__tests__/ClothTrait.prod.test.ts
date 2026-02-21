/**
 * ClothTrait — Production Tests (TraitHandler pattern)
 *
 * Tests the clothHandler by invoking handler methods directly against a mock node.
 * Also tests initializeClothMesh behaviour observable through onAttach, and
 * vertex/constraint state mutations via onEvent.
 */
import { describe, it, expect, vi } from 'vitest';
import { clothHandler } from '../ClothTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

type ClothConfig = NonNullable<Parameters<typeof clothHandler.onAttach>[1]>;

function mkNode(): Record<string, any> {
  return {};
}

function mkCtx() {
  const ctx = {
    emitted: [] as Array<{ type: string; payload: any }>,
    emit: vi.fn(),
  };
  ctx.emit = vi.fn((type: string, payload: any) => {
    ctx.emitted.push({ type, payload });
  }) as any;
  return ctx;
}

function mkConfig(overrides: Partial<ClothConfig> = {}): ClothConfig {
  return { ...clothHandler.defaultConfig!, ...overrides };
}

function attachNode(config: ClothConfig = mkConfig(), node = mkNode(), ctx = mkCtx()) {
  clothHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────────

describe('clothHandler — defaultConfig', () => {
  it('resolution defaults to 32', () => {
    expect(clothHandler.defaultConfig?.resolution).toBe(32);
  });

  it('stiffness defaults to 0.8', () => {
    expect(clothHandler.defaultConfig?.stiffness).toBeCloseTo(0.8);
  });

  it('tearable defaults to false', () => {
    expect(clothHandler.defaultConfig?.tearable).toBe(false);
  });

  it('self_collision defaults to false', () => {
    expect(clothHandler.defaultConfig?.self_collision).toBe(false);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────────

describe('clothHandler — onAttach', () => {
  it('sets isSimulating = true on node state', () => {
    const { node } = attachNode();
    expect((node as any).__clothState.isSimulating).toBe(true);
  });

  it('isTorn = false initially', () => {
    const { node } = attachNode();
    expect((node as any).__clothState.isTorn).toBe(false);
  });

  it('emits cloth_create event', () => {
    const config = mkConfig({ resolution: 4 });
    const { ctx } = attachNode(config);
    const ev = ctx.emitted.find((e) => e.type === 'cloth_create');
    expect(ev).toBeDefined();
    expect(ev?.payload.resolution).toBe(4);
    expect(ev?.payload.stiffness).toBeCloseTo(0.8);
  });

  it('initialises vertices grid at resolution x resolution', () => {
    const config = mkConfig({ resolution: 4 });
    const { node } = attachNode(config);
    const state = (node as any).__clothState;
    expect(state.vertices.length).toBe(4);
    expect(state.vertices[0].length).toBe(4);
  });

  it('pinned vertices are marked isPinned=true', () => {
    const config = mkConfig({ resolution: 4, pin_vertices: [[0, 0], [0, 3]] });
    const { node } = attachNode(config);
    const state = (node as any).__clothState;
    expect(state.vertices[0][0].isPinned).toBe(true);
    expect(state.vertices[0][3].isPinned).toBe(true);
    expect(state.vertices[1][0].isPinned).toBe(false);
  });

  it('non-pinned vertices have isPinned=false', () => {
    const config = mkConfig({ resolution: 3, pin_vertices: [] });
    const { node } = attachNode(config);
    const state = (node as any).__clothState;
    for (const row of state.vertices) {
      for (const v of row) {
        expect(v.isPinned).toBe(false);
      }
    }
  });

  it('constraint count: (res-1)*res*2 for grid (horizontal + vertical)', () => {
    // resolution=3: 3 rows, 2 horizontal constraints per row = 6, 2 vertical per col = 6 → 12
    const config = mkConfig({ resolution: 3 });
    const { node } = attachNode(config);
    const state = (node as any).__clothState;
    // (3-1)*3 horizontal + (3-1)*3 vertical = 6 + 6 = 12
    expect(state.constraints.length).toBe(12);
  });

  it('all constraints start as not broken', () => {
    const config = mkConfig({ resolution: 3 });
    const { node } = attachNode(config);
    const state = (node as any).__clothState;
    expect(state.constraints.every((c: any) => !c.broken)).toBe(true);
  });

  it('vertex mass = total mass / (res*res)', () => {
    const config = mkConfig({ resolution: 2, mass: 4.0 });
    const { node } = attachNode(config);
    const state = (node as any).__clothState;
    expect(state.vertices[0][0].mass).toBeCloseTo(4.0 / 4);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────────

describe('clothHandler — onDetach', () => {
  it('removes __clothState from node', () => {
    const config = mkConfig({ resolution: 2 });
    const { node, ctx } = attachNode(config);
    clothHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__clothState).toBeUndefined();
  });

  it('emits cloth_destroy when was simulating', () => {
    const config = mkConfig({ resolution: 2 });
    const { node, ctx } = attachNode(config);
    clothHandler.onDetach!(node as any, config, ctx as any);
    const ev = ctx.emitted.find((e) => e.type === 'cloth_destroy');
    expect(ev).toBeDefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────────

describe('clothHandler — onUpdate', () => {
  it('emits cloth_step with deltaTime', () => {
    const config = mkConfig({ resolution: 2, wind_response: 0 });
    const { node, ctx } = attachNode(config);
    clothHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const ev = ctx.emitted.find((e) => e.type === 'cloth_step');
    expect(ev?.payload.deltaTime).toBeCloseTo(0.016);
  });

  it('emits cloth_apply_force when wind_response > 0', () => {
    const config = mkConfig({ resolution: 2, wind_response: 0.5 });
    const node = mkNode();
    const ctx = mkCtx();
    clothHandler.onAttach!(node as any, config, ctx as any);
    (node as any).__clothState.windForce = { x: 1, y: 0, z: 0 };
    ctx.emitted.length = 0;
    clothHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const ev = ctx.emitted.find((e) => e.type === 'cloth_apply_force');
    expect(ev).toBeDefined();
    expect(ev?.payload.force.x).toBeCloseTo(0.5); // 1 * 0.5
  });

  it('does not emit cloth_apply_force when wind_response = 0', () => {
    const config = mkConfig({ resolution: 2, wind_response: 0 });
    const { node, ctx } = attachNode(config);
    (node as any).__clothState.windForce = { x: 5, y: 0, z: 0 };
    ctx.emitted.length = 0;
    clothHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emitted.find((e) => e.type === 'cloth_apply_force')).toBeUndefined();
  });

  it('no-ops when isSimulating=false', () => {
    const config = mkConfig({ resolution: 2 });
    const { node, ctx } = attachNode(config);
    (node as any).__clothState.isSimulating = false;
    ctx.emitted.length = 0;
    clothHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emitted).toHaveLength(0);
  });
});

// ─── onEvent ─────────────────────────────────────────────────────────────────────

describe('clothHandler — onEvent', () => {
  it('wind_update sets windForce on state', () => {
    const config = mkConfig({ resolution: 2 });
    const { node, ctx } = attachNode(config);
    clothHandler.onEvent!(node as any, config, ctx as any, {
      type: 'wind_update',
      direction: { x: 2, y: 0, z: -1 },
    } as any);
    expect((node as any).__clothState.windForce).toEqual({ x: 2, y: 0, z: -1 });
  });

  it('cloth_pin_vertex marks vertex as pinned and emits cloth_update_pin', () => {
    const config = mkConfig({ resolution: 3 });
    const { node, ctx } = attachNode(config);
    ctx.emitted.length = 0;
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_pin_vertex', x: 1, y: 1 } as any);
    expect((node as any).__clothState.vertices[1][1].isPinned).toBe(true);
    const ev = ctx.emitted.find((e) => e.type === 'cloth_update_pin');
    expect(ev?.payload.pinned).toBe(true);
    expect(ev?.payload.vertex).toEqual([1, 1]);
  });

  it('cloth_unpin_vertex marks vertex as unpinned', () => {
    const config = mkConfig({ resolution: 3, pin_vertices: [[0, 0]] });
    const { node, ctx } = attachNode(config);
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_unpin_vertex', x: 0, y: 0 } as any);
    expect((node as any).__clothState.vertices[0][0].isPinned).toBe(false);
  });

  it('cloth_pause sets isSimulating=false', () => {
    const config = mkConfig({ resolution: 2 });
    const { node, ctx } = attachNode(config);
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_pause' } as any);
    expect((node as any).__clothState.isSimulating).toBe(false);
  });

  it('cloth_resume sets isSimulating=true', () => {
    const config = mkConfig({ resolution: 2 });
    const { node, ctx } = attachNode(config);
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_pause' } as any);
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_resume' } as any);
    expect((node as any).__clothState.isSimulating).toBe(true);
  });

  it('cloth_constraint_break sets constraint.broken=true and isTorn=true when tearable', () => {
    const config = mkConfig({ resolution: 2, tearable: true });
    const { node, ctx } = attachNode(config);
    ctx.emitted.length = 0;
    clothHandler.onEvent!(node as any, config, ctx as any, {
      type: 'cloth_constraint_break',
      constraintIndex: 0,
    } as any);
    const state = (node as any).__clothState;
    expect(state.constraints[0].broken).toBe(true);
    expect(state.isTorn).toBe(true);
    expect(ctx.emitted.find((e) => e.type === 'on_cloth_tear')).toBeDefined();
  });

  it('cloth_constraint_break is ignored when tearable=false', () => {
    const config = mkConfig({ resolution: 2, tearable: false });
    const { node, ctx } = attachNode(config);
    clothHandler.onEvent!(node as any, config, ctx as any, {
      type: 'cloth_constraint_break',
      constraintIndex: 0,
    } as any);
    const state = (node as any).__clothState;
    expect(state.constraints[0].broken).toBe(false);
    expect(state.isTorn).toBe(false);
  });

  it('cloth_reset re-initialises mesh and sets isTorn=false', () => {
    const config = mkConfig({ resolution: 2, tearable: true });
    const { node, ctx } = attachNode(config);
    // Break a constraint to set isTorn=true
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_constraint_break', constraintIndex: 0 } as any);
    expect((node as any).__clothState.isTorn).toBe(true);
    // Reset
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_reset' } as any);
    expect((node as any).__clothState.isTorn).toBe(false);
    expect((node as any).__clothState.constraints.every((c: any) => !c.broken)).toBe(true);
  });

  it('cloth_query emits cloth_info with correct fields', () => {
    const config = mkConfig({ resolution: 3 });
    const { node, ctx } = attachNode(config);
    ctx.emitted.length = 0;
    clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_query', queryId: 'q1' } as any);
    const ev = ctx.emitted.find((e) => e.type === 'cloth_info');
    expect(ev).toBeDefined();
    expect(ev?.payload.queryId).toBe('q1');
    expect(ev?.payload.vertexCount).toBe(9); // 3*3
    expect(ev?.payload.isSimulating).toBe(true);
    expect(ev?.payload.brokenConstraints).toBe(0);
  });

  it('onEvent no-ops when node has no __clothState', () => {
    const config = mkConfig({ resolution: 2 });
    const node = mkNode(); // no state attached
    const ctx = mkCtx();
    expect(() =>
      clothHandler.onEvent!(node as any, config, ctx as any, { type: 'cloth_pause' } as any)
    ).not.toThrow();
  });
});
