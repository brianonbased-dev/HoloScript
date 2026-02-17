import { describe, it, expect, beforeEach } from 'vitest';
import { destructionHandler } from '../DestructionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('DestructionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = { mode: 'voronoi' as const, fragment_count: 4, impact_threshold: 5, damage_threshold: 0, fragment_lifetime: 2, explosion_force: 5, chain_reaction: false, debris_physics: true, fade_fragments: true };

  beforeEach(() => {
    node = createMockNode('dest');
    (node as any).position = { x: 0, y: 0, z: 0 };
    (node as any).scale = { x: 1, y: 1, z: 1 };
    ctx = createMockContext();
    attachTrait(destructionHandler, node, cfg, ctx);
  });

  it('initializes with health', () => {
    const s = (node as any).__destructionState;
    expect(s).toBeDefined();
    expect(s.isDestroyed).toBe(false);
    expect(s.currentHealth).toBe(100);
  });

  it('accumulates damage from damage event', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 30, impactPoint: { x: 0, y: 0, z: 0 } });
    const s = (node as any).__destructionState;
    expect(s.accumulatedDamage).toBe(30);
    expect(s.currentHealth).toBe(70);
  });

  it('destroys when health <= threshold', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'damage', amount: 200, impactPoint: { x: 0, y: 0, z: 0 } });
    const s = (node as any).__destructionState;
    expect(s.isDestroyed).toBe(true);
    expect(s.fragments.length).toBe(4);
    expect(getEventCount(ctx, 'on_destruction')).toBe(1);
  });

  it('destroy event bypasses health check', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    expect((node as any).__destructionState.isDestroyed).toBe(true);
  });

  it('updates fragment positions', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy', impactPoint: { x: 0, y: 0, z: 0 } });
    const frag = (node as any).__destructionState.fragments[0];
    const old = { ...frag.position };
    updateTrait(destructionHandler, node, cfg, ctx, 0.1);
    expect(frag.position.x !== old.x || frag.position.y !== old.y).toBe(true);
  });

  it('removes expired fragments', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    for (let i = 0; i < 30; i++) updateTrait(destructionHandler, node, cfg, ctx, 0.1);
    expect((node as any).__destructionState.fragments.length).toBe(0);
  });

  it('emits on_destruction_complete when fragments are gone', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    ctx.clearEvents();
    for (let i = 0; i < 30; i++) updateTrait(destructionHandler, node, cfg, ctx, 0.1);
    expect(getEventCount(ctx, 'on_destruction_complete')).toBe(1);
  });

  it('repair restores health and clears destruction', () => {
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'destroy' });
    sendEvent(destructionHandler, node, cfg, ctx, { type: 'repair' });
    const s = (node as any).__destructionState;
    expect(s.isDestroyed).toBe(false);
    expect(s.currentHealth).toBe(100);
    expect(s.accumulatedDamage).toBe(0);
    expect(s.fragments.length).toBe(0);
    expect(getEventCount(ctx, 'on_repaired')).toBe(1);
  });

  it('cleans up on detach', () => {
    destructionHandler.onDetach?.(node as any, destructionHandler.defaultConfig, ctx as any);
    expect((node as any).__destructionState).toBeUndefined();
  });
});
