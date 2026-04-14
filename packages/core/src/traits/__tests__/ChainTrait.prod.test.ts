/**
 * ChainTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { chainHandler } from '../ChainTrait';

function makeNode() {
  return { id: 'chain_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...chainHandler.defaultConfig!, ...cfg };
  chainHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('chainHandler.defaultConfig', () => {
  const d = chainHandler.defaultConfig!;
  it('links=10', () => expect(d.links).toBe(10));
  it('link_length=0.1', () => expect(d.link_length).toBe(0.1));
  it('link_mass=0.5', () => expect(d.link_mass).toBe(0.5));
  it('stiffness=1.0', () => expect(d.stiffness).toBe(1.0));
  it('damping=0.1', () => expect(d.damping).toBe(0.1));
  it('attach_start=""', () => expect(d.attach_start).toBe(''));
  it('attach_end=""', () => expect(d.attach_end).toBe(''));
  it('collision_between_links=true', () => expect(d.collision_between_links).toBe(true));
  it('breakable=false', () => expect(d.breakable).toBe(false));
  it('break_force=500', () => expect(d.break_force).toBe(500));
  it('link_geometry=capsule', () => expect(d.link_geometry).toBe('capsule'));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('chainHandler.onAttach', () => {
  it('creates __chainState', () => expect(attach().node.__chainState).toBeDefined());
  it('isSimulating=true after attach', () =>
    expect(attach().node.__chainState.isSimulating).toBe(true));
  it('isBroken=false', () => expect(attach().node.__chainState.isBroken).toBe(false));
  it('breakPoint=null', () => expect(attach().node.__chainState.breakPoint).toBeNull());
  it('totalLength = links * link_length', () => {
    const { node } = attach({ links: 5, link_length: 0.2 });
    expect(node.__chainState.totalLength).toBeCloseTo(1.0);
  });
  it('creates correct number of links', () => {
    const { node } = attach({ links: 3 });
    expect(node.__chainState.links).toHaveLength(3);
  });
  it('links are spaced vertically by link_length', () => {
    const { node } = attach({ links: 3, link_length: 0.5 });
    expect(node.__chainState.links[0].position[1]).toBeCloseTo(0);
    expect(node.__chainState.links[1].position[1]).toBeCloseTo(-0.5);
    expect(node.__chainState.links[2].position[1]).toBeCloseTo(-1.0);
  });
  it('emits chain_create with linkCount and linkLength', () => {
    const { ctx } = attach({ links: 4, link_length: 0.25 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_create',
      expect.objectContaining({ linkCount: 4, linkLength: 0.25 })
    );
  });
  it('emits chain_attach start when attach_start is set', () => {
    const { ctx } = attach({ attach_start: 'hook_node' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_attach',
      expect.objectContaining({ endpoint: 'start', targetNodeId: 'hook_node' })
    );
  });
  it('emits chain_attach end when attach_end is set', () => {
    const { ctx } = attach({ attach_end: 'weight_node' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_attach',
      expect.objectContaining({ endpoint: 'end', targetNodeId: 'weight_node' })
    );
  });
  it('no extra chain_attach when attach endpoints are empty', () => {
    const { ctx } = attach({ attach_start: '', attach_end: '' });
    const calls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'chain_attach');
    expect(calls).toHaveLength(0);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('chainHandler.onDetach', () => {
  it('removes __chainState', () => {
    const { node, config, ctx } = attach();
    chainHandler.onDetach!(node, config, ctx);
    expect(node.__chainState).toBeUndefined();
  });
  it('emits chain_destroy when isSimulating=true', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    chainHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('chain_destroy', expect.anything());
  });
  it('no chain_destroy when isSimulating=false', () => {
    const { node, config, ctx } = attach();
    node.__chainState.isSimulating = false;
    ctx.emit.mockClear();
    chainHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('chain_destroy', expect.anything());
  });
});

// ─── onEvent — chain_link_update ──────────────────────────────────────────────

describe('chainHandler.onEvent — chain_link_update', () => {
  const pos = [1, -0.1, 0 ];
  const rot = [0, 0, 0, 1 ];
  it('updates link position', () => {
    const { node, ctx, config } = attach({ links: 5 });
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_link_update',
      linkIndex: 2,
      position: pos,
      rotation: rot,
    });
    expect(node.__chainState.links[2].position).toBe(pos);
  });
  it('updates link rotation', () => {
    const { node, ctx, config } = attach({ links: 5 });
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_link_update',
      linkIndex: 2,
      position: pos,
      rotation: rot,
    });
    expect(node.__chainState.links[2].rotation).toBe(rot);
  });
  it('emits chain_mesh_update', () => {
    const { node, ctx, config } = attach({ links: 5 });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_link_update',
      linkIndex: 0,
      position: pos,
      rotation: rot,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_mesh_update',
      expect.objectContaining({ linkIndex: 0 })
    );
  });
  it('out-of-bounds linkIndex is safely ignored', () => {
    const { node, ctx, config } = attach({ links: 3 });
    expect(() =>
      chainHandler.onEvent!(node, config, ctx, {
        type: 'chain_link_update',
        linkIndex: 99,
        position: pos,
        rotation: rot,
      })
    ).not.toThrow();
  });
});

// ─── onEvent — chain_full_update ──────────────────────────────────────────────

describe('chainHandler.onEvent — chain_full_update', () => {
  it('updates all link positions in batch', () => {
    const { node, ctx, config } = attach({ links: 3 });
    const positions = [
      [1, 0, 0 ],
      [2, 0, 0 ],
      [3, 0, 0 ],
    ];
    const rots = [
      [0, 0, 0, 1 ],
      [0, 0, 0, 1 ],
      [0, 0, 0, 1 ],
    ];
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_full_update',
      positions,
      rotations: rots,
    });
    expect(node.__chainState.links[0].position[0]).toBe(1);
    expect(node.__chainState.links[2].position[0]).toBe(3);
  });
  it('emits chain_full_mesh_update', () => {
    const { node, ctx, config } = attach({ links: 2 });
    const positions = [
      [0, 0, 0 ],
      [0, -0.1, 0 ],
    ];
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_full_update',
      positions,
      rotations: [],
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_full_mesh_update',
      expect.objectContaining({ links: expect.any(Array) })
    );
  });
  it('handles fewer positions than links gracefully', () => {
    const { node, ctx, config } = attach({ links: 5 });
    const positions = [[1, 0, 0 ]];
    expect(() =>
      chainHandler.onEvent!(node, config, ctx, {
        type: 'chain_full_update',
        positions,
        rotations: [],
      })
    ).not.toThrow();
    expect(node.__chainState.links[0].position[0]).toBe(1);
  });
});

// ─── onEvent — chain_attach + chain_detach ────────────────────────────────────

describe('chainHandler.onEvent — chain_attach', () => {
  it('emits chain_create_attachment for start', () => {
    const { node, ctx, config } = attach({ links: 4 });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_attach',
      endpoint: 'start',
      targetNodeId: 'hook',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_create_attachment',
      expect.objectContaining({ endpoint: 'start', linkIndex: 0 })
    );
  });
  it('uses last link for end attachment', () => {
    const { node, ctx, config } = attach({ links: 4 });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, {
      type: 'chain_attach',
      endpoint: 'end',
      targetNodeId: 'weight',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_create_attachment',
      expect.objectContaining({ linkIndex: 3 })
    );
  });
});

describe('chainHandler.onEvent — chain_detach', () => {
  it('clears startAttachment and emits chain_remove_attachment', () => {
    const { node, ctx, config } = attach();
    node.__chainState.startAttachment = { handle: 1 };
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_detach', endpoint: 'start' });
    expect(node.__chainState.startAttachment).toBeNull();
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_remove_attachment',
      expect.objectContaining({ endpoint: 'start' })
    );
  });
  it('clears endAttachment', () => {
    const { node, ctx, config } = attach();
    node.__chainState.endAttachment = { handle: 2 };
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_detach', endpoint: 'end' });
    expect(node.__chainState.endAttachment).toBeNull();
  });
});

// ─── onEvent — chain_break + chain_repair ────────────────────────────────────

describe('chainHandler.onEvent — chain_break', () => {
  it('breaks at specified linkIndex when breakable=true', () => {
    const { node, ctx, config } = attach({ breakable: true, links: 10 });
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_break', linkIndex: 3 });
    expect(node.__chainState.isBroken).toBe(true);
    expect(node.__chainState.breakPoint).toBe(3);
  });
  it('breaks at midpoint when linkIndex not specified', () => {
    const { node, ctx, config } = attach({ breakable: true, links: 10 });
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_break' });
    expect(node.__chainState.breakPoint).toBe(5); // floor(10/2)
  });
  it('emits chain_break_at and on_chain_break', () => {
    const { node, ctx, config } = attach({ breakable: true, links: 6 });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_break', linkIndex: 2 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_break_at',
      expect.objectContaining({ linkIndex: 2 })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_chain_break',
      expect.objectContaining({ breakPoint: 2 })
    );
  });
  it('does not break when breakable=false and no force flag', () => {
    const { node, ctx, config } = attach({ breakable: false });
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_break' });
    expect(node.__chainState.isBroken).toBe(false);
  });
  it('breaks when force=true even if breakable=false', () => {
    const { node, ctx, config } = attach({ breakable: false, links: 4 });
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_break', force: true });
    expect(node.__chainState.isBroken).toBe(true);
  });
});

describe('chainHandler.onEvent — chain_repair', () => {
  it('repairs broken chain', () => {
    const { node, ctx, config } = attach({ breakable: true });
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_break' });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_repair' });
    expect(node.__chainState.isBroken).toBe(false);
    expect(node.__chainState.breakPoint).toBeNull();
    expect(ctx.emit).toHaveBeenCalledWith('chain_reconnect', expect.anything());
  });
  it('no effect when chain is not broken', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_repair' });
    expect(ctx.emit).not.toHaveBeenCalledWith('chain_reconnect', expect.anything());
  });
});

// ─── onEvent — force, pause, resume, query ────────────────────────────────────

describe('chainHandler.onEvent — misc events', () => {
  it('chain_apply_force emits chain_external_force', () => {
    const { node, ctx, config } = attach();
    const force = [0, -9.8, 0 ];
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_apply_force', linkIndex: 1, force });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_external_force',
      expect.objectContaining({ linkIndex: 1, force })
    );
  });
  it('chain_pause sets isSimulating=false and emits chain_sleep', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_pause' });
    expect(node.__chainState.isSimulating).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('chain_sleep', expect.anything());
  });
  it('chain_resume sets isSimulating=true and emits chain_wake', () => {
    const { node, ctx, config } = attach();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_pause' });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_resume' });
    expect(node.__chainState.isSimulating).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('chain_wake', expect.anything());
  });
  it('chain_query emits chain_info with state summary', () => {
    const { node, ctx, config } = attach({ links: 5, link_length: 0.2 });
    ctx.emit.mockClear();
    chainHandler.onEvent!(node, config, ctx, { type: 'chain_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'chain_info',
      expect.objectContaining({
        queryId: 'q1',
        linkCount: 5,
        isSimulating: true,
        isBroken: false,
      })
    );
  });
});
