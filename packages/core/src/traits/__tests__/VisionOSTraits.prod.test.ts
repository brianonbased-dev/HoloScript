/**
 * visionOS Traits Production Tests
 *
 * SharePlayTrait + VolumetricWindowTrait + SpatialPersonaTrait
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sharePlayHandler } from '../SharePlayTrait';
import { volumetricWindowHandler } from '../VolumetricWindowTrait';
import { spatialPersonaHandler } from '../SpatialPersonaTrait';

// Shared mock context factory
function mockContext() {
  const stateStore: Record<string, any> = {};
  return {
    setState: (s: any) => Object.assign(stateStore, s),
    getState: () => stateStore,
    emit: vi.fn(),
    player: null as any,
  } as any;
}

const mockNode = { id: 'test-node' } as any;

// ─── SharePlay ────────────────────────────────────────────────────────────────

describe('SharePlayTrait — Production', () => {
  const handler = sharePlayHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets idle state and emits ready', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().sharePlay.sessionState).toBe('idle');
    expect(ctx.emit).toHaveBeenCalledWith('shareplay:ready', expect.any(Object));
  });

  it('start event activates session', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'shareplay:start',
      payload: { sessionId: 'sp1' },
    });
    expect(ctx.getState().sharePlay.sessionState).toBe('active');
    expect(ctx.getState().sharePlay.isHost).toBe(true);
  });

  it('join event joins as non-host', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'shareplay:join',
      payload: { sessionId: 'sp2' },
    });
    expect(ctx.getState().sharePlay.isHost).toBe(false);
    expect(ctx.getState().sharePlay.sessionState).toBe('active');
  });

  it('participant_joined adds up to max', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'shareplay:start', payload: {} });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'shareplay:participant_joined',
      payload: { id: 'p1', displayName: 'Alice', isHost: false, joinedAt: 1 },
    });
    expect(ctx.getState().sharePlay.participants.size).toBe(1);
  });

  it('participant_left removes', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'shareplay:start', payload: {} });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'shareplay:participant_joined',
      payload: { id: 'p1', displayName: 'A', isHost: false, joinedAt: 1 },
    });
    handler.onEvent!(mockNode, config, ctx, {
      type: 'shareplay:participant_left',
      payload: { id: 'p1' },
    });
    expect(ctx.getState().sharePlay.participants.size).toBe(0);
  });

  it('sync merges properties', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'shareplay:sync',
      payload: { properties: { score: 42 } },
    });
    expect(ctx.getState().sharePlay.syncedProperties.score).toBe(42);
  });

  it('end event clears participants', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'shareplay:start', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'shareplay:end', payload: {} });
    expect(ctx.getState().sharePlay.sessionState).toBe('ended');
    expect(ctx.getState().sharePlay.participants.size).toBe(0);
  });

  it('onDetach emits ended if active', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'shareplay:start', payload: {} });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('shareplay:ended', expect.any(Object));
  });
});

// ─── VolumetricWindow ────────────────────────────────────────────────────────

describe('VolumetricWindowTrait — Production', () => {
  const handler = volumetricWindowHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets initial dimensions', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    const s = ctx.getState().volumetricWindow;
    expect(s.currentWidth).toBe(0.6);
    expect(s.currentHeight).toBe(0.4);
    expect(s.currentDepth).toBe(0.3);
    expect(s.isOpen).toBe(false);
  });

  it('open event opens window', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'vWindow:open',
      payload: { position: [1, 2, 3] },
    });
    expect(ctx.getState().volumetricWindow.isOpen).toBe(true);
    expect(ctx.getState().volumetricWindow.placement).toEqual([1, 2, 3]);
  });

  it('close event closes', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'vWindow:open', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'vWindow:close', payload: {} });
    expect(ctx.getState().volumetricWindow.isOpen).toBe(false);
  });

  it('resize updates dimensions', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'vWindow:resize',
      payload: { width: 1.0, height: 0.8 },
    });
    expect(ctx.getState().volumetricWindow.currentWidth).toBe(1.0);
    expect(ctx.getState().volumetricWindow.currentHeight).toBe(0.8);
  });

  it('resize ignored if not resizable', () => {
    const ctx = mockContext();
    const fixed = { ...config, resizable: false };
    handler.onAttach!(mockNode, fixed, ctx);
    handler.onEvent!(mockNode, fixed, ctx, { type: 'vWindow:resize', payload: { width: 2.0 } });
    expect(ctx.getState().volumetricWindow.currentWidth).toBe(0.6); // unchanged
  });

  it('scale clamps to min/max', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'vWindow:scale', payload: { scale: 999 } });
    expect(ctx.getState().volumetricWindow.currentScale).toBe(10.0);
  });

  it('immersion_change sets progress', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'vWindow:immersion_change',
      payload: { progress: 0.5 },
    });
    expect(ctx.getState().volumetricWindow.immersionProgress).toBe(0.5);
    expect(ctx.getState().volumetricWindow.isImmersive).toBe(false);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'vWindow:immersion_change',
      payload: { progress: 1.0 },
    });
    expect(ctx.getState().volumetricWindow.isImmersive).toBe(true);
  });

  it('immersive window type starts isImmersive', () => {
    const ctx = mockContext();
    const immConfig = { ...config, window_type: 'immersive' as const };
    handler.onAttach!(mockNode, immConfig, ctx);
    expect(ctx.getState().volumetricWindow.isImmersive).toBe(true);
    expect(ctx.getState().volumetricWindow.immersionProgress).toBe(1);
  });

  it('onDetach emits closed if open', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'vWindow:open', payload: {} });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('vWindow:closed');
  });
});

// ─── SpatialPersona ──────────────────────────────────────────────────────────

describe('SpatialPersonaTrait — Production', () => {
  const handler = spatialPersonaHandler;
  const config = { ...handler.defaultConfig };

  it('onAttach sets neutral state', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    expect(ctx.getState().spatialPersona.expressionState).toBe('neutral');
    expect(ctx.getState().spatialPersona.isActive).toBe(false);
  });

  it('activate event sets active', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'persona:activate',
      payload: { personaId: 'p1' },
    });
    expect(ctx.getState().spatialPersona.isActive).toBe(true);
    expect(ctx.getState().spatialPersona.personaId).toBe('p1');
  });

  it('deactivate event clears active', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'persona:activate', payload: {} });
    handler.onEvent!(mockNode, config, ctx, { type: 'persona:deactivate', payload: {} });
    expect(ctx.getState().spatialPersona.isActive).toBe(false);
  });

  it('position_update updates coords', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'persona:position_update',
      payload: { position: [1, 2, 3], orientation: [0, 0, 0, 1] },
    });
    expect(ctx.getState().spatialPersona.position).toEqual([1, 2, 3]);
    expect(ctx.getState().spatialPersona.orientation).toEqual([0, 0, 0, 1]);
  });

  it('expression sets isSpeaking for talking', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'persona:expression',
      payload: { expression: 'talking' },
    });
    expect(ctx.getState().spatialPersona.isSpeaking).toBe(true);
    expect(ctx.getState().spatialPersona.expressionState).toBe('talking');
  });

  it('participant visibility tracking', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'persona:participant_visible',
      payload: { participantId: 'u1' },
    });
    expect(ctx.getState().spatialPersona.visibleTo.has('u1')).toBe(true);
    handler.onEvent!(mockNode, config, ctx, {
      type: 'persona:participant_hidden',
      payload: { participantId: 'u1' },
    });
    expect(ctx.getState().spatialPersona.visibleTo.has('u1')).toBe(false);
  });

  it('onDetach emits deactivated if active', () => {
    const ctx = mockContext();
    handler.onAttach!(mockNode, config, ctx);
    handler.onEvent!(mockNode, config, ctx, { type: 'persona:activate', payload: {} });
    handler.onDetach!(mockNode, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', expect.any(Object));
  });
});
