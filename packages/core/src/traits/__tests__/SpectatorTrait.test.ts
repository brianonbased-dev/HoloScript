import { describe, it, expect, beforeEach } from 'vitest';
import { spectatorHandler } from '../SpectatorTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('SpectatorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    camera_mode: 'free' as const,
    follow_target: '',
    can_interact: false,
    visible_to_participants: false,
    max_spectators: 50,
    delay: 0,
    allowed_camera_modes: ['free', 'follow', 'orbit'] as Array<'free' | 'follow' | 'orbit'>,
    broadcast_events: true,
  };

  beforeEach(() => {
    node = createMockNode('spec');
    ctx = createMockContext();
    attachTrait(spectatorHandler, node, cfg, ctx);
  });

  it('initializes and emits spectator_init', () => {
    expect((node as any).__spectatorState.spectatorCount).toBe(0);
    expect(getEventCount(ctx, 'spectator_init')).toBe(1);
  });

  it('spectator join adds spectator', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_join', spectatorId: 's1' });
    expect((node as any).__spectatorState.spectatorCount).toBe(1);
    expect(getEventCount(ctx, 'spectator_setup')).toBe(1);
    expect(getEventCount(ctx, 'on_spectator_join')).toBe(1);
  });

  it('spectator leave removes spectator', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_join', spectatorId: 's1' });
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_leave', spectatorId: 's1' });
    expect((node as any).__spectatorState.spectatorCount).toBe(0);
    expect(getEventCount(ctx, 'on_spectator_leave')).toBe(1);
  });

  it('rejects join at max capacity', () => {
    const smallCfg = { ...cfg, max_spectators: 1 };
    const n2 = createMockNode('cap');
    const c2 = createMockContext();
    attachTrait(spectatorHandler, n2, smallCfg, c2);
    sendEvent(spectatorHandler, n2, smallCfg, c2, { type: 'spectator_join', spectatorId: 's1' });
    sendEvent(spectatorHandler, n2, smallCfg, c2, { type: 'spectator_join', spectatorId: 's2' });
    expect(getEventCount(c2, 'spectator_rejected')).toBe(1);
  });

  it('set_camera changes camera mode for spectator', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_join', spectatorId: 's1' });
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_set_camera', spectatorId: 's1', mode: 'follow' });
    expect(getEventCount(ctx, 'spectator_camera_change')).toBe(1);
  });

  it('disallowed camera mode is rejected silently', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_join', spectatorId: 's1' });
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_set_camera', spectatorId: 's1', mode: 'cinematic' });
    expect(getEventCount(ctx, 'spectator_camera_change')).toBe(0);
  });

  it('set_follow updates follow target', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_set_follow', targetId: 'player1' });
    expect((node as any).__spectatorState.followTarget).toBe('player1');
  });

  it('broadcast emits event to spectators', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_broadcast', data: { msg: 'hi' } });
    expect(getEventCount(ctx, 'spectator_event_broadcast')).toBe(1);
  });

  it('query returns spectator info', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_join', spectatorId: 's1' });
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'spectator_info') as any;
    expect(r.spectatorCount).toBe(1);
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach with active spectators', () => {
    sendEvent(spectatorHandler, node, cfg, ctx, { type: 'spectator_join', spectatorId: 's1' });
    spectatorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__spectatorState).toBeUndefined();
    expect(getEventCount(ctx, 'spectator_end_all')).toBe(1);
  });
});
