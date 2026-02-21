/**
 * DestructionTrait — Production Tests (TraitHandler pattern)
 */
import { describe, it, expect, vi } from 'vitest';
import { destructionHandler } from '../DestructionTrait';

type DestructionConfig = NonNullable<Parameters<typeof destructionHandler.onAttach>[1]>;

function mkConfig(o: Partial<DestructionConfig> = {}): DestructionConfig {
  return { ...destructionHandler.defaultConfig!, ...o };
}
function mkNode() {
  return { position: { x: 0, y: 5, z: 0 }, scale: { x: 1, y: 1, z: 1 } } as Record<string, any>;
}
function mkCtx() {
  const ctx = { emitted: [] as Array<{ type: string; payload: any }>, emit: vi.fn() };
  ctx.emit = vi.fn((type: string, payload: any) => { ctx.emitted.push({ type, payload }); }) as any;
  return ctx;
}
function attach(cfg = mkConfig(), node = mkNode(), ctx = mkCtx()) {
  destructionHandler.onAttach!(node as any, cfg, ctx as any);
  return { node, ctx, cfg };
}

// defaultConfig
describe('destructionHandler — defaultConfig', () => {
  it('mode = voronoi', () => expect(destructionHandler.defaultConfig?.mode).toBe('voronoi'));
  it('fragment_count = 8', () => expect(destructionHandler.defaultConfig?.fragment_count).toBe(8));
  it('damage_threshold = 0', () => expect(destructionHandler.defaultConfig?.damage_threshold).toBe(0));
  it('impact_threshold = 10', () => expect(destructionHandler.defaultConfig?.impact_threshold).toBe(10));
  it('fragment_lifetime = 5', () => expect(destructionHandler.defaultConfig?.fragment_lifetime).toBe(5));
  it('chain_reaction = false', () => expect(destructionHandler.defaultConfig?.chain_reaction).toBe(false));
  it('debris_physics = true', () => expect(destructionHandler.defaultConfig?.debris_physics).toBe(true));
});

// onAttach
describe('destructionHandler — onAttach', () => {
  it('creates __destructionState', () => { const { node } = attach(); expect((node as any).__destructionState).toBeDefined(); });
  it('currentHealth = 100', () => { const { node } = attach(); expect((node as any).__destructionState.currentHealth).toBe(100); });
  it('maxHealth = 100', () => { const { node } = attach(); expect((node as any).__destructionState.maxHealth).toBe(100); });
  it('isDestroyed = false', () => { const { node } = attach(); expect((node as any).__destructionState.isDestroyed).toBe(false); });
  it('fragments empty', () => { const { node } = attach(); expect((node as any).__destructionState.fragments).toHaveLength(0); });
  it('emits subscribe_collision', () => { const { ctx } = attach(); expect(ctx.emitted.find(e => e.type === 'subscribe_collision')).toBeDefined(); });
});

// onDetach
describe('destructionHandler — onDetach', () => {
  it('removes __destructionState', () => {
    const { node, ctx, cfg } = attach();
    destructionHandler.onDetach!(node as any, cfg, ctx as any);
    expect((node as any).__destructionState).toBeUndefined();
  });
});

// onEvent 'damage'
describe('destructionHandler — onEvent damage', () => {
  it('reduces currentHealth', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'damage', amount: 30 } as any);
    expect((node as any).__destructionState.currentHealth).toBe(70);
  });
  it('accumulates damage', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'damage', amount: 20 } as any);
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'damage', amount: 30 } as any);
    expect((node as any).__destructionState.accumulatedDamage).toBe(50);
  });
  it('default amount = 10', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'damage' } as any);
    expect((node as any).__destructionState.currentHealth).toBe(90);
  });
  it('triggers destruction when health reaches 0', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig({ damage_threshold: 0 }), ctx as any, { type: 'damage', amount: 100 } as any);
    expect((node as any).__destructionState.isDestroyed).toBe(true);
  });
  it('emits on_destruction on threshold crossed', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig({ damage_threshold: 0 }), ctx as any, { type: 'damage', amount: 100 } as any);
    expect(ctx.emitted.find(e => e.type === 'on_destruction')).toBeDefined();
  });
  it('no destruction when health above threshold', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig({ damage_threshold: 0 }), ctx as any, { type: 'damage', amount: 50 } as any);
    expect((node as any).__destructionState.isDestroyed).toBe(false);
  });
});

// onEvent 'destroy'
describe('destructionHandler — onEvent destroy', () => {
  it('sets isDestroyed = true', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'destroy' } as any);
    expect((node as any).__destructionState.isDestroyed).toBe(true);
  });
  it('generates fragment_count fragments', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig({ fragment_count: 6 }), ctx as any, { type: 'destroy' } as any);
    expect((node as any).__destructionState.fragments).toHaveLength(6);
  });
  it('emits on_destruction with fragment count', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig({ fragment_count: 5 }), ctx as any, { type: 'destroy' } as any);
    expect(ctx.emitted.find(e => e.type === 'on_destruction')?.payload.fragments).toBe(5);
  });
  it('each fragment has correct lifetime', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig({ fragment_count: 2, fragment_lifetime: 3 }), ctx as any, { type: 'destroy' } as any);
    const frags: any[] = (node as any).__destructionState.fragments;
    expect(frags.every((f: any) => f.lifetime === 3)).toBe(true);
  });
  it('idempotent — second destroy is no-op', () => {
    const { node, ctx } = attach();
    const cfg = mkConfig({ fragment_count: 3 });
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    ctx.emitted.length = 0;
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    expect(ctx.emitted.find(e => e.type === 'on_destruction')).toBeUndefined();
  });
});

// onEvent 'repair'
describe('destructionHandler — onEvent repair', () => {
  it('resets health to maxHealth', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'damage', amount: 80 } as any);
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'repair' } as any);
    expect((node as any).__destructionState.currentHealth).toBe(100);
  });
  it('clears accumulatedDamage', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'damage', amount: 40 } as any);
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'repair' } as any);
    expect((node as any).__destructionState.accumulatedDamage).toBe(0);
  });
  it('clears isDestroyed', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'destroy' } as any);
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'repair' } as any);
    expect((node as any).__destructionState.isDestroyed).toBe(false);
  });
  it('emits on_repaired after destroy+repair', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'destroy' } as any);
    ctx.emitted.length = 0;
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'repair' } as any);
    expect(ctx.emitted.find(e => e.type === 'on_repaired')).toBeDefined();
  });
  it('emits set_visible=true after repair', () => {
    const { node, ctx } = attach();
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'destroy' } as any);
    ctx.emitted.length = 0;
    destructionHandler.onEvent!(node as any, mkConfig(), ctx as any, { type: 'repair' } as any);
    expect(ctx.emitted.find(e => e.type === 'set_visible')?.payload.visible).toBe(true);
  });
});

// onUpdate fragment physics
describe('destructionHandler — onUpdate fragment physics', () => {
  it('gravity reduces velocity.y', () => {
    const { node, ctx } = attach();
    const cfg = mkConfig({ fragment_count: 1, fragment_lifetime: 10 });
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    const frag = (node as any).__destructionState.fragments[0];
    frag.velocity = { x: 0, y: 5, z: 0 };
    destructionHandler.onUpdate!(node as any, cfg, ctx as any, 0.1);
    expect((node as any).__destructionState.fragments[0].velocity.y).toBeLessThan(5);
  });
  it('position advances with velocity', () => {
    const { node, ctx } = attach();
    const cfg = mkConfig({ fragment_count: 1, fragment_lifetime: 10 });
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    const frag = (node as any).__destructionState.fragments[0];
    frag.velocity = { x: 1, y: 0, z: 0 };
    frag.position = { x: 0, y: 1, z: 0 };
    destructionHandler.onUpdate!(node as any, cfg, ctx as any, 1.0);
    expect((node as any).__destructionState.fragments[0].position.x).toBeCloseTo(1, 1);
  });
  it('lifetime decreases per update', () => {
    const { node, ctx } = attach();
    const cfg = mkConfig({ fragment_count: 1, fragment_lifetime: 5 });
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    const before = (node as any).__destructionState.fragments[0].lifetime;
    destructionHandler.onUpdate!(node as any, cfg, ctx as any, 0.5);
    expect((node as any).__destructionState.fragments[0].lifetime).toBeCloseTo(before - 0.5, 2);
  });
  it('fragments removed when lifetime expires', () => {
    const { node, ctx } = attach();
    const cfg = mkConfig({ fragment_count: 1, fragment_lifetime: 0.01 });
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    destructionHandler.onUpdate!(node as any, cfg, ctx as any, 5.0);
    expect((node as any).__destructionState.fragments).toHaveLength(0);
  });
  it('emits on_destruction_complete when all expired', () => {
    const { node, ctx } = attach();
    const cfg = mkConfig({ fragment_count: 2, fragment_lifetime: 0.01 });
    destructionHandler.onEvent!(node as any, cfg, ctx as any, { type: 'destroy' } as any);
    ctx.emitted.length = 0;
    destructionHandler.onUpdate!(node as any, cfg, ctx as any, 5.0);
    expect(ctx.emitted.find(e => e.type === 'on_destruction_complete')).toBeDefined();
  });
  it('no-op when not destroyed', () => {
    const { node, ctx } = attach();
    destructionHandler.onUpdate!(node as any, mkConfig(), ctx as any, 1.0);
    expect(ctx.emitted.find(e => e.type === 'on_destruction_complete')).toBeUndefined();
  });
  it('no-op when no state on node', () => {
    expect(() => destructionHandler.onUpdate!(mkNode() as any, mkConfig(), mkCtx() as any, 0.016)).not.toThrow();
  });
});

// edge cases
describe('destructionHandler — edge cases', () => {
  it('onEvent no-op when no state on node', () => {
    expect(() => destructionHandler.onEvent!(mkNode() as any, mkConfig(), mkCtx() as any, { type: 'destroy' } as any)).not.toThrow();
  });
});
