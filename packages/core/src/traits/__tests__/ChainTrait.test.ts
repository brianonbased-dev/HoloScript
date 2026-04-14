import { describe, it, expect, beforeEach } from 'vitest';
import { chainHandler } from '../ChainTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('ChainTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    links: 5,
    link_length: 0.2,
    link_mass: 0.5,
    stiffness: 1.0,
    damping: 0.1,
    attach_start: 'anchor1',
    attach_end: '',
    collision_between_links: true,
    breakable: true,
    break_force: 500,
    link_geometry: 'capsule' as const,
  };

  beforeEach(() => {
    node = createMockNode('chain');
    ctx = createMockContext();
    attachTrait(chainHandler, node, cfg, ctx);
  });

  it('initializes with correct link count', () => {
    const s = (node as any).__chainState;
    expect(s.links.length).toBe(5);
    expect(s.isSimulating).toBe(true);
    expect(s.totalLength).toBe(1.0);
  });

  it('emits chain_create on attach', () => {
    expect(getEventCount(ctx, 'chain_create')).toBe(1);
  });

  it('emits chain_attach for start attachment', () => {
    expect(getEventCount(ctx, 'chain_attach')).toBe(1);
  });

  it('updates single link position', () => {
    sendEvent(chainHandler, node, cfg, ctx, {
      type: 'chain_link_update',
      linkIndex: 2,
      position: [1, 2, 3],
      rotation: [0, 0, 0, 1 ],
    });
    expect((node as any).__chainState.links[2].position).toEqual([1, 2, 3 ]);
  });

  it('updates all links via chain_full_update', () => {
    const positions = Array.from({ length: 5 }, (_, i) => ([i, 0, 0 ]));
    sendEvent(chainHandler, node, cfg, ctx, {
      type: 'chain_full_update',
      positions,
      rotations: [],
    });
    expect((node as any).__chainState.links[3].position).toEqual([3, 0, 0 ]);
  });

  it('breaks chain when breakable', () => {
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_break', linkIndex: 2 });
    const s = (node as any).__chainState;
    expect(s.isBroken).toBe(true);
    expect(s.breakPoint).toBe(2);
    expect(getEventCount(ctx, 'on_chain_break')).toBe(1);
  });

  it('repairs broken chain', () => {
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_break', linkIndex: 1 });
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_repair' });
    expect((node as any).__chainState.isBroken).toBe(false);
    expect(getEventCount(ctx, 'chain_reconnect')).toBe(1);
  });

  it('pauses and resumes simulation', () => {
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_pause' });
    expect((node as any).__chainState.isSimulating).toBe(false);
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_resume' });
    expect((node as any).__chainState.isSimulating).toBe(true);
  });

  it('detaches endpoint', () => {
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_detach', endpoint: 'start' });
    expect((node as any).__chainState.startAttachment).toBeNull();
    expect(getEventCount(ctx, 'chain_remove_attachment')).toBe(1);
  });

  it('chain_query returns info', () => {
    sendEvent(chainHandler, node, cfg, ctx, { type: 'chain_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'chain_info') as any;
    expect(r.linkCount).toBe(5);
    expect(r.totalLength).toBe(1.0);
    expect(r.isBroken).toBe(false);
  });

  it('cleans up on detach', () => {
    chainHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__chainState).toBeUndefined();
    expect(getEventCount(ctx, 'chain_destroy')).toBe(1);
  });
});
