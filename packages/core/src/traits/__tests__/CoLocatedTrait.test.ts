import { describe, it, expect, beforeEach } from 'vitest';
import { coLocatedHandler } from '../CoLocatedTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('CoLocatedTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    shared_anchor_id: 'shared1',
    alignment_method: 'cloud_anchor' as const,
    alignment_timeout: 30000,
    visual_indicator: true,
    max_participants: 10,
    auto_align: true,
    realignment_threshold: 0.5,
  };

  beforeEach(() => {
    node = createMockNode('coloc');
    ctx = createMockContext();
    attachTrait(coLocatedHandler, node, cfg, ctx);
  });

  it('initializes and starts alignment', () => {
    const s = (node as any).__coLocatedState;
    expect(s.state).toBe('aligning');
    expect(getEventCount(ctx, 'co_located_start_alignment')).toBe(1);
    expect(getEventCount(ctx, 'co_located_show_indicator')).toBe(1);
  });

  it('aligned event sets aligned state', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_aligned',
      anchorId: 'a1',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1 ] },
      quality: 0.95,
    });
    const s = (node as any).__coLocatedState;
    expect(s.state).toBe('aligned');
    expect(s.isAligned).toBe(true);
    expect(getEventCount(ctx, 'on_co_presence_aligned')).toBe(1);
  });

  it('alignment_failed sets lost state', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_alignment_failed',
      reason: 'timeout',
    });
    expect((node as any).__coLocatedState.state).toBe('lost');
    expect(getEventCount(ctx, 'on_co_located_failed')).toBe(1);
  });

  it('participant_joined adds participant', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    expect((node as any).__coLocatedState.participants.size).toBe(1);
    expect(getEventCount(ctx, 'on_co_presence_joined')).toBe(1);
  });

  it('participant_aligned marks participant aligned', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_participant_aligned',
      userId: 'u1',
      position: [1, 0, 0],
    });
    expect((node as any).__coLocatedState.participants.get('u1').isAligned).toBe(true);
  });

  it('participant_left removes participant', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u2',
    });
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_participant_left',
      userId: 'u2',
    });
    expect((node as any).__coLocatedState.participants.size).toBe(0);
  });

  it('quality_update below 0.3 sets lost', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_aligned',
      anchorId: 'a1',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1 ] },
    });
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_quality_update',
      quality: 0.1,
    });
    expect((node as any).__coLocatedState.state).toBe('lost');
  });

  it('query returns info', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, { type: 'co_located_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'co_located_info') as any;
    expect(r.queryId).toBe('q1');
    expect(r.state).toBe('aligning');
  });

  it('cleans up on detach', () => {
    sendEvent(coLocatedHandler, node, cfg, ctx, {
      type: 'co_located_aligned',
      anchorId: 'a1',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1 ] },
    });
    coLocatedHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__coLocatedState).toBeUndefined();
    expect(getEventCount(ctx, 'co_located_leave')).toBe(1);
  });
});
