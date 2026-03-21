import { describe, it, expect, vi } from 'vitest';
import { moderationHandler } from '../ModerationTrait';
type Config = NonNullable<Parameters<typeof moderationHandler.onAttach>[1]>;
function mkCfg(o: Partial<Config> = {}): Config {
  return { ...moderationHandler.defaultConfig!, ...o };
}
function mkNode(id = 'mod-node') {
  return { id } as any;
}
function mkCtx() {
  const e: any[] = [];
  return { emitted: e, emit: vi.fn((t: string, p: any) => e.push({ type: t, payload: p })) as any };
}
function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  moderationHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

describe('moderationHandler — defaultConfig', () => {
  it('sensitivity = medium', () => expect(moderationHandler.defaultConfig?.sensitivity).toBe('medium'));
  it('action = warn', () => expect(moderationHandler.defaultConfig?.action).toBe('warn'));
  it('escalation_threshold = 3', () => expect(moderationHandler.defaultConfig?.escalation_threshold).toBe(3));
});

describe('moderationHandler — onAttach', () => {
  it('creates __moderationState', () => {
    const { node } = attach();
    expect((node as any).__moderationState).toBeDefined();
  });
  it('active = true after attach', () => {
    const { node } = attach();
    expect((node as any).__moderationState.active).toBe(true);
  });
  it('emits moderation_create with config', () => {
    const node = mkNode();
    const ctx = mkCtx();
    moderationHandler.onAttach!(node, mkCfg({ sensitivity: 'strict', moderate_voice: true }), ctx as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'moderation_create');
    expect(ev?.payload.sensitivity).toBe('strict');
    expect(ev?.payload.moderateVoice).toBe(true);
  });
  it('violations map starts empty', () => {
    const { node } = attach();
    expect((node as any).__moderationState.violations.size).toBe(0);
  });
});

describe('moderationHandler — onDetach', () => {
  it('emits moderation_destroy', () => {
    const { node, ctx, cfg } = attach();
    moderationHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emitted.some((e: any) => e.type === 'moderation_destroy')).toBe(true);
  });
  it('removes __moderationState', () => {
    const { node, ctx, cfg } = attach();
    moderationHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__moderationState).toBeUndefined();
  });
  it('no-op when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() => moderationHandler.onDetach!(node, mkCfg(), ctx as any)).not.toThrow();
  });
});

describe('moderationHandler — onEvent: moderation_check', () => {
  it('emits moderation_analyze for normal check', () => {
    const { node, ctx, cfg } = attach();
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_check',
      userId: 'user1',
      content: 'hello world',
      contentType: 'text',
    } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'moderation_analyze');
    expect(ev?.payload.userId).toBe('user1');
    expect(ev?.payload.content).toBe('hello world');
    expect(ev?.payload.sensitivity).toBe('medium');
  });
  it('blocks user on cooldown', () => {
    const { node, ctx, cfg } = attach();
    // Manually set a cooldown far in the future
    (node as any).__moderationState.cooldowns.set('user2', Date.now() + 60000);
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_check',
      userId: 'user2',
      content: 'test',
    } as any);
    const ev = ctx.emitted.find((e: any) => e.type === 'moderation_blocked');
    expect(ev?.payload.userId).toBe('user2');
    expect(ev?.payload.reason).toBe('cooldown');
  });
});

describe('moderationHandler — onEvent: moderation_violation', () => {
  it('increments violation count and emits action', () => {
    const { node, ctx, cfg } = attach();
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_violation',
      userId: 'baduser',
      category: 'spam',
    } as any);
    expect((node as any).__moderationState.violations.get('baduser')).toBe(1);
    expect((node as any).__moderationState.totalBlocked).toBe(1);
    const actionEv = ctx.emitted.find((e: any) => e.type === 'moderation_action');
    expect(actionEv?.payload.action).toBe('warn');
    expect(ctx.emitted.some((e: any) => e.type === 'on_moderation_violation')).toBe(true);
  });
  it('escalates action after threshold violations', () => {
    const { node, ctx, cfg } = attach(mkCfg({ escalation_threshold: 2, action: 'warn' }));
    // First violation
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_violation',
      userId: 'repeat',
    } as any);
    // Second violation (reaches threshold)
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_violation',
      userId: 'repeat',
    } as any);
    const actions = ctx.emitted.filter((e: any) => e.type === 'moderation_action');
    const lastAction = actions[actions.length - 1];
    expect(lastAction?.payload.action).toBe('mute');
  });
});

describe('moderationHandler — onEvent: moderation_clear_violations', () => {
  it('clears specific user violations', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__moderationState.violations.set('user1', 5);
    (node as any).__moderationState.cooldowns.set('user1', Date.now() + 10000);
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_clear_violations',
      userId: 'user1',
    } as any);
    expect((node as any).__moderationState.violations.has('user1')).toBe(false);
    expect((node as any).__moderationState.cooldowns.has('user1')).toBe(false);
  });
  it('clears all violations when no userId', () => {
    const { node, ctx, cfg } = attach();
    (node as any).__moderationState.violations.set('a', 1);
    (node as any).__moderationState.violations.set('b', 2);
    moderationHandler.onEvent!(node, cfg, ctx as any, {
      type: 'moderation_clear_violations',
    } as any);
    expect((node as any).__moderationState.violations.size).toBe(0);
    expect((node as any).__moderationState.cooldowns.size).toBe(0);
  });
  it('no-op when no state', () => {
    expect(() =>
      moderationHandler.onEvent!(mkNode() as any, mkCfg(), mkCtx() as any, { type: 'moderation_check' } as any)
    ).not.toThrow();
  });
});
