import { describe, it, expect, vi } from 'vitest';
import { aiCompanionHandler } from '../AICompanionTrait';
type Config = NonNullable<Parameters<typeof aiCompanionHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...aiCompanionHandler.defaultConfig!, ...o };
}
function mkNode(id = 'companion-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  aiCompanionHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('aiCompanionHandler — defaultConfig', () => {
  it('personality = friendly', () =>
    expect(aiCompanionHandler.defaultConfig?.personality).toBe('friendly'));
  it('interaction_range = 10', () =>
    expect(aiCompanionHandler.defaultConfig?.interaction_range).toBe(10));
  it('memory_capacity = 100', () =>
    expect(aiCompanionHandler.defaultConfig?.memory_capacity).toBe(100));
});

describe('aiCompanionHandler — onAttach', () => {
  it('creates __aiCompanionState', () => {
    const { node } = attach();
    expect((node as any).__aiCompanionState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__aiCompanionState.active).toBe(true);
  });
  it('emits ai_companion_create with personality and config', () => {
    const node = mkNode();
    const ctx = mkCtx();
    aiCompanionHandler.onAttach!(
      node,
      mkCfg({ personality: 'curious', idle_behavior: 'patrol' }),
      ctx as any
    );
    const ev = ctx.emitted.find((e: any) => e.type === 'ai_companion_create');
    expect(ev?.payload.personality).toBe('curious');
    expect(ev?.payload.idleBehavior).toBe('patrol');
  });
  it('emotion initialized with happiness = 0.5', () => {
    const { node } = attach();
    expect((node as any).__aiCompanionState.emotion.happiness).toBe(0.5);
  });
  it('currentAction starts as idle', () => {
    const { node } = attach();
    expect((node as any).__aiCompanionState.currentAction).toBe('idle');
  });
});

describe('aiCompanionHandler — onDetach', () => {
  it('emits ai_companion_destroy', () => {
    const { node, ctx, cfg } = attach();
    aiCompanionHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'ai_companion_destroy')).toBe(true);
  });
  it('removes __aiCompanionState', () => {
    const { node, ctx, cfg } = attach();
    aiCompanionHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__aiCompanionState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => aiCompanionHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('aiCompanionHandler — onUpdate', () => {
  it('emits ai_companion_update with emotion state', () => {
    const { node, ctx, cfg } = attach();
    aiCompanionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const ev = ctx.emitted.find((e: any) => e.type === 'ai_companion_update');
    expect(ev?.payload.emotion).toBeDefined();
    expect(ev?.payload.currentAction).toBe('idle');
  });
  it('no-op when not active', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__aiCompanionState.active = false;
    aiCompanionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.some((e: any) => e.type === 'ai_companion_update')).toBe(false);
  });
});

describe('aiCompanionHandler — onEvent', () => {
  it('ai_companion_interact sets interactingWith and boosts curiosity', () => {
    const { node, ctx, cfg } = attach();
    const prevCuriosity = (node as any).__aiCompanionState.emotion.curiosity;
    aiCompanionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'ai_companion_interact',
        playerId: 'player1',
        message: 'Hello!',
      } as any
    );
    expect((node as any).__aiCompanionState.interactingWith).toBe('player1');
    expect((node as any).__aiCompanionState.currentAction).toBe('interacting');
    expect((node as any).__aiCompanionState.emotion.curiosity).toBeGreaterThan(prevCuriosity);
    expect(ctx.emitted.some((e: any) => e.type === 'ai_companion_response_start')).toBe(true);
  });
  it('ai_companion_response increments memoryCount and emits speak', () => {
    const { node, ctx, cfg } = attach();
    aiCompanionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'ai_companion_response',
        text: 'Hi there!',
      } as any
    );
    expect((node as any).__aiCompanionState.memoryCount).toBe(1);
    const ev = ctx.emitted.find((e: any) => e.type === 'on_ai_companion_speak');
    expect(ev?.payload.text).toBe('Hi there!');
  });
  it('ai_companion_response clamps memoryCount to capacity', () => {
    const { node, ctx, cfg } = attach(mkCfg({ memory_capacity: 2 }));
    (node as any).__aiCompanionState.memoryCount = 2;
    aiCompanionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'ai_companion_response', text: 'test' } as any
    );
    expect((node as any).__aiCompanionState.memoryCount).toBe(2);
  });
  it('ai_companion_end_interaction resets to idle behavior', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__aiCompanionState.interactingWith = 'player1';
    (node as any).__aiCompanionState.currentAction = 'interacting';
    aiCompanionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      { type: 'ai_companion_end_interaction' } as any
    );
    expect((node as any).__aiCompanionState.interactingWith).toBeNull();
    expect((node as any).__aiCompanionState.currentAction).toBe('wander');
  });
  it('ai_companion_set_action changes currentAction', () => {
    const { node, ctx, cfg } = attach();
    aiCompanionHandler.onEvent!(
      node,
      cfg,
      ctx as any,
      {
        type: 'ai_companion_set_action',
        action: 'patrol',
      } as any
    );
    expect((node as any).__aiCompanionState.currentAction).toBe('patrol');
  });
  it('no-op when no state', () => {
    expect(() =>
      aiCompanionHandler.onEvent!(
        mkNode() as any,
        mkCfg(),
        mkCtx() as any,
        { type: 'ai_companion_interact' } as any
      )
    ).not.toThrow();
  });
});
