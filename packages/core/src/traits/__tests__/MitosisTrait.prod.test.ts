/**
 * MitosisTrait — Production Test Suite
 *
 * mitosisHandler is self-contained with no external dependencies.
 *
 * Key behaviours:
 * 1. defaultConfig — 3 fields
 * 2. onAttach — creates __mitosisState; emits mitosis_init with nodeId+strategy+parent_id
 * 3. onDetach(auto_cleanup=true) — emits mitosis_despawn_child for each active child
 * 4. onDetach(auto_cleanup=false) — no despawn emits
 * 5. onEvent 'mitosis_spawned' (parentId === node.id) — pushes childId, increments tasks_delegated, emits on_mitosis_spawned
 * 6. onEvent 'mitosis_spawned' (parentId !== node.id) — no-op
 * 7. onEvent 'mitosis_child_complete' — increments completed_tasks, updates last_sync_time, emits mitosis_synced
 *   - collaborative strategy: merges result into node.properties
 * 8. onEvent 'mitosis_child_complete' (non-collaborative) — does NOT merge into properties
 * 9. onEvent 'mitosis_child_failed' — emits on_mitosis_error
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mitosisHandler } from '../MitosisTrait';

let _nodeId = 0;
function makeNode(properties: any = {}) {
  return { id: `mitosis_${++_nodeId}`, properties };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...mitosisHandler.defaultConfig!, ...o };
}
function attach(o: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = makeConfig(o);
  mitosisHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) {
  return (node as any).__mitosisState;
}

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('mitosisHandler.defaultConfig', () => {
  const d = mitosisHandler.defaultConfig!;
  it('strategy = collaborative', () => expect(d.strategy).toBe('collaborative'));
  it('max_children = 5', () => expect(d.max_children).toBe(5));
  it('auto_cleanup = true', () => expect(d.auto_cleanup).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('mitosisHandler.onAttach', () => {
  it('creates __mitosisState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('active_children starts empty', () => {
    const { node } = attach();
    expect(getState(node).active_children).toEqual([]);
  });
  it('tasks_delegated = 0, completed_tasks = 0', () => {
    const { node } = attach();
    const s = getState(node);
    expect(s.tasks_delegated).toBe(0);
    expect(s.completed_tasks).toBe(0);
  });
  it('parent_id from config', () => {
    const { node } = attach({ parent_id: 'pNode_1' });
    expect(getState(node).parent_id).toBe('pNode_1');
  });
  it('parent_id = null when not provided', () => {
    const { node } = attach();
    expect(getState(node).parent_id).toBeNull();
  });
  it('emits mitosis_init with nodeId + strategy + parent_id', () => {
    const { node, ctx } = attach({ strategy: 'swarm' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'mitosis_init',
      expect.objectContaining({
        nodeId: node.id,
        strategy: 'swarm',
        parent_id: null,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('mitosisHandler.onDetach', () => {
  it('removes __mitosisState', () => {
    const { node, ctx, config } = attach();
    mitosisHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });

  it('emits mitosis_despawn_child for each child when auto_cleanup=true', () => {
    const { node, ctx, config } = attach({ auto_cleanup: true });
    const state = getState(node);
    state.active_children.push('child_a', 'child_b');
    ctx.emit.mockClear();
    mitosisHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('mitosis_despawn_child', { childId: 'child_a' });
    expect(ctx.emit).toHaveBeenCalledWith('mitosis_despawn_child', { childId: 'child_b' });
    expect(ctx.emit).toHaveBeenCalledTimes(2);
  });

  it('does NOT emit despawn when auto_cleanup=false', () => {
    const { node, ctx, config } = attach({ auto_cleanup: false });
    getState(node).active_children.push('child_x');
    ctx.emit.mockClear();
    mitosisHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent 'mitosis_spawned' ────────────────────────────────────────────────
describe("mitosisHandler.onEvent 'mitosis_spawned'", () => {
  it('registers child and increments tasks_delegated when parentId === node.id', () => {
    const { node, ctx, config } = attach();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_spawned',
      childId: 'child1',
      parentId: node.id,
    });
    const s = getState(node);
    expect(s.active_children).toContain('child1');
    expect(s.tasks_delegated).toBe(1);
  });

  it('emits on_mitosis_spawned with childId and parentId', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_spawned',
      childId: 'child1',
      parentId: node.id,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_mitosis_spawned',
      expect.objectContaining({ childId: 'child1', parentId: node.id })
    );
  });

  it('no-op when parentId !== node.id', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    const stateSnapshot = { ...getState(node) };
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_spawned',
      childId: 'child1',
      parentId: 'other_node',
    });
    expect(ctx.emit).toHaveBeenCalledTimes(0);
    expect(getState(node).active_children.length).toBe(0);
  });
});

// ─── onEvent 'mitosis_child_complete' ─────────────────────────────────────────
describe("mitosisHandler.onEvent 'mitosis_child_complete'", () => {
  it('increments completed_tasks and emits mitosis_synced', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_child_complete',
      childId: 'c1',
      parentId: node.id,
      result: { score: 10 },
    });
    expect(getState(node).completed_tasks).toBe(1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'mitosis_synced',
      expect.objectContaining({
        parentId: node.id,
        childId: 'c1',
        result: { score: 10 },
      })
    );
  });

  it('collaborative: merges result object into node.properties', () => {
    const node = makeNode({ existingProp: 'keep' });
    const ctx = makeCtx();
    const config = makeConfig({ strategy: 'collaborative' });
    mitosisHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_child_complete',
      childId: 'c1',
      parentId: node.id,
      result: { newProp: 42 },
    });
    expect((node.properties as any).newProp).toBe(42);
    expect((node.properties as any).existingProp).toBe('keep');
  });

  it('non-collaborative: does NOT merge result into node.properties', () => {
    const node = makeNode({});
    const ctx = makeCtx();
    const config = makeConfig({ strategy: 'autonomous' });
    mitosisHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_child_complete',
      childId: 'c1',
      parentId: node.id,
      result: { injected: true },
    });
    expect((node.properties as any).injected).toBeUndefined();
  });

  it('no-op when parentId !== node.id', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_child_complete',
      childId: 'c1',
      parentId: 'other_node',
      result: {},
    });
    expect(getState(node).completed_tasks).toBe(0);
    expect(ctx.emit).toHaveBeenCalledTimes(0);
  });

  it('null result: does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      mitosisHandler.onEvent!(node as any, config, ctx as any, {
        type: 'mitosis_child_complete',
        childId: 'c1',
        parentId: node.id,
        result: null,
      })
    ).not.toThrow();
  });
});

// ─── onEvent 'mitosis_child_failed' ───────────────────────────────────────────
describe("mitosisHandler.onEvent 'mitosis_child_failed'", () => {
  it('emits on_mitosis_error with parentId, childId, error', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    mitosisHandler.onEvent!(node as any, config, ctx as any, {
      type: 'mitosis_child_failed',
      childId: 'c1',
      error: 'timeout',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_mitosis_error',
      expect.objectContaining({
        parentId: node.id,
        childId: 'c1',
        error: 'timeout',
      })
    );
  });
});
