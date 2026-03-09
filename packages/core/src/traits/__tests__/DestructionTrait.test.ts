import { describe, it, expect, beforeEach } from 'vitest';
import { destructionHandler } from '../DestructionTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('DestructionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'voronoi' as const,
    fragment_count: 10,
    impact_threshold: 5,
    damage_threshold: 0,
    fragment_lifetime: 5,
    explosion_force: 5,
    chain_reaction: false, // disable chain to avoid setTimeout issues
    chain_radius: 3,
    chain_delay: 0.1,
    debris_physics: true,
    sound_on_break: 'break.wav',
    effect_on_break: 'sparks',
    fade_fragments: true,
  };

  beforeEach(() => {
    node = createMockNode('destr');
    (node as any).position = { x: 0, y: 0, z: 0 };
    (node as any).scale = { x: 1, y: 1, z: 1 };
    ctx = createMockContext();
    attachTrait(destructionHandler, node, cfg, ctx);
  });

  it('initializes with full health', () => {
    const state = (node as any).__destructionState;
    expect(state).toBeDefined();
    expect(state.isDestroyed).toBe(false);
    expect(state.currentHealth).toBe(100);
  });

  it('damage event reduces health', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 30 });
    expect((node as any).__destructionState.currentHealth).toBe(70);
  });

  it('damage below zero triggers destruction', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 150 });
    const state = (node as any).__destructionState;
    expect(state.isDestroyed).toBe(true);
    expect(getEventCount(ctx, 'on_destruction')).toBe(1);
  });

  it('fragments are generated on destruction', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 200 });
    expect((node as any).__destructionState.fragments.length).toBeGreaterThan(0);
  });

  it('destroy event triggers destruction directly', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    expect((node as any).__destructionState.isDestroyed).toBe(true);
  });

  it('repair restores to max health', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 50 });
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'repair' });
    expect((node as any).__destructionState.currentHealth).toBe(100);
  });

  it('repair restores destroyed state', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'repair' });
    const state = (node as any).__destructionState;
    expect(state.isDestroyed).toBe(false);
    expect(state.fragments.length).toBe(0);
  });

  it('accumulated damage tracking', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 10 });
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 20 });
    expect((node as any).__destructionState.accumulatedDamage).toBe(30);
  });

  it('update advances fragment physics', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    const fragsBefore = (node as any).__destructionState.fragments.length;
    updateTrait(destructionHandler, node, cfg, ctx, 0.016);
    // Fragments should still exist (lifetime not expired)
    expect((node as any).__destructionState.fragments.length).toBe(fragsBefore);
  });

  it('detach cleans up state', () => {
    destructionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__destructionState).toBeUndefined();
  });
});
