/**
 * BehaviorTreeTrait — Production Tests
 * Tests the pure BT execution engine: sequence, selector, parallel,
 * inverter, repeater, condition, action, wait, plus handler lifecycle.
 */
import { describe, it, expect, vi } from 'vitest';
import { behaviorTreeHandler } from '../BehaviorTreeTrait';

type BTConfig = NonNullable<Parameters<typeof behaviorTreeHandler.onAttach>[1]>;
type BTNode = BTConfig['root'];

function mkCtx() {
  const ctx = { emitted: [] as any[], emit: vi.fn() };
  ctx.emit = vi.fn((type: string, payload: any) => ctx.emitted.push({ type, payload })) as any;
  return ctx;
}
function mkNode(id = 'n1') { return { id } as any; }
function mkCfg(root: BTNode, overrides: Partial<BTConfig> = {}): BTConfig {
  return { ...behaviorTreeHandler.defaultConfig!, root, ...overrides };
}

function attachNode(root: BTNode, overrides: Partial<BTConfig> = {}) {
  const node = mkNode();
  const ctx = mkCtx();
  const cfg = mkCfg(root, overrides);
  behaviorTreeHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

function tick(node: any, cfg: BTConfig, ctx: any, delta = 1.0) {
  // tick_rate=1 → tickInterval=1 → one update fires per tick(delta=1)
  behaviorTreeHandler.onUpdate!(node, cfg, ctx as any, delta);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('behaviorTreeHandler — defaultConfig', () => {
  it('tick_rate = 10', () => expect(behaviorTreeHandler.defaultConfig?.tick_rate).toBe(10));
  it('restart_on_complete = true', () => expect(behaviorTreeHandler.defaultConfig?.restart_on_complete).toBe(true));
  it('debug_visualization = false', () => expect(behaviorTreeHandler.defaultConfig?.debug_visualization).toBe(false));
  it('root is empty sequence', () => {
    expect(behaviorTreeHandler.defaultConfig?.root.type).toBe('sequence');
    expect(behaviorTreeHandler.defaultConfig?.root.children).toHaveLength(0);
  });
});

// ─── onAttach / onDetach ──────────────────────────────────────────────────────
describe('behaviorTreeHandler — attach/detach', () => {
  it('creates __behaviorTreeState on attach', () => {
    const { node, ctx, cfg } = attachNode({ type: 'sequence', children: [] });
    expect((node as any).__behaviorTreeState).toBeDefined();
  });
  it('emits bt_started on attach', () => {
    const node = mkNode();
    const ctx = mkCtx();
    const cfg = mkCfg({ type: 'sequence', children: [] });
    behaviorTreeHandler.onAttach!(node, cfg, ctx as any);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_started')).toBeDefined();
  });
  it('isRunning = true after attach', () => {
    const { node } = attachNode({ type: 'sequence', children: [] });
    expect((node as any).__behaviorTreeState.isRunning).toBe(true);
  });
  it('removes __behaviorTreeState on detach', () => {
    const { node, ctx, cfg } = attachNode({ type: 'sequence', children: [] });
    behaviorTreeHandler.onDetach!(node, cfg, ctx as any);
    expect((node as any).__behaviorTreeState).toBeUndefined();
  });
});

// ─── Sequence Node ────────────────────────────────────────────────────────────
describe('BehaviorTree — Sequence', () => {
  function makeSuccessAction(name: string) {
    return { type: 'action' as const, name, action: `set:${name}:true` };
  }

  it('succeeds when all children succeed', () => {
    const root: BTNode = {
      type: 'sequence',
      children: [
        { type: 'action', action: 'set:a:true' },
        { type: 'action', action: 'set:b:true' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('fails on first failure', () => {
    // condition key 'never_true' not in blackboard → failure
    const root: BTNode = {
      type: 'sequence',
      children: [
        { type: 'condition', condition: 'never_true' },
        { type: 'action', action: 'set:x:true' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('failure');
  });

  it('restarts on complete when restart_on_complete=true', () => {
    const root: BTNode = { type: 'sequence', children: [{ type: 'action', action: 'set:a:true' }] };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: true });
    tick(node, cfg, ctx);
    // bt_complete is emitted but isRunning stays true
    expect((node as any).__behaviorTreeState.isRunning).toBe(true);
  });

  it('stops running when restart_on_complete=false', () => {
    const root: BTNode = { type: 'sequence', children: [{ type: 'action', action: 'set:a:true' }] };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect((node as any).__behaviorTreeState.isRunning).toBe(false);
  });
});

// ─── Selector Node ────────────────────────────────────────────────────────────
describe('BehaviorTree — Selector', () => {
  it('succeeds on first child success', () => {
    const root: BTNode = {
      type: 'selector',
      children: [
        { type: 'action', action: 'set:good:true' },
        { type: 'condition', condition: 'never_true' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('fails when all children fail', () => {
    const root: BTNode = {
      type: 'selector',
      children: [
        { type: 'condition', condition: 'nope1' },
        { type: 'condition', condition: 'nope2' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('failure');
  });

  it('skips first failing child, uses second succeeding child', () => {
    const root: BTNode = {
      type: 'selector',
      children: [
        { type: 'condition', condition: 'nope' },
        { type: 'action', action: 'set:ok:true' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });
});

// ─── Parallel Node ────────────────────────────────────────────────────────────
describe('BehaviorTree — Parallel', () => {
  it('succeeds when all children succeed (default threshold = all)', () => {
    const root: BTNode = {
      type: 'parallel',
      children: [
        { type: 'action', action: 'set:a:true' },
        { type: 'action', action: 'set:b:true' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('succeeds when successThreshold children succeed', () => {
    const root: BTNode = {
      type: 'parallel',
      successThreshold: 1,
      children: [
        { type: 'action', action: 'set:a:true' },
        { type: 'condition', condition: 'nope' },
      ],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });
});

// ─── Inverter ─────────────────────────────────────────────────────────────────
describe('BehaviorTree — Inverter', () => {
  it('inverts success → failure', () => {
    const root: BTNode = {
      type: 'inverter',
      children: [{ type: 'action', action: 'set:x:true' }],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('failure');
  });

  it('inverts failure → success', () => {
    const root: BTNode = {
      type: 'inverter',
      children: [{ type: 'condition', condition: 'nope' }],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('returns failure when no child', () => {
    // inverter with no children → failure (per tickInverter)
    const root: BTNode = { type: 'inverter' };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('failure');
  });
});

// ─── Repeater ─────────────────────────────────────────────────────────────────
describe('BehaviorTree — Repeater', () => {
  it('runs child count times then succeeds', () => {
    // Repeater with count=2 → runs child 2 times → success
    const root: BTNode = {
      type: 'repeater',
      count: 2,
      children: [{ type: 'action', action: 'set:x:true' }],
    };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    // First tick: child runs once (count=1) → still running
    tick(node, cfg, ctx);
    // Not completed yet (running), re-tick in next frame…
    tick(node, cfg, ctx);
    const complete = ctx.emitted.find((e: any) => e.type === 'bt_complete');
    expect(complete?.payload.status).toBe('success');
  });
});

// ─── Condition Node ───────────────────────────────────────────────────────────
describe('BehaviorTree — Condition', () => {
  it('succeeds when blackboard key is truthy', () => {
    const root: BTNode = { type: 'condition', condition: 'flag' };
    const { node, ctx, cfg } = attachNode(root, {
      tick_rate: 1,
      restart_on_complete: false,
      blackboard: { flag: true },
    });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('fails when blackboard key is falsy', () => {
    const root: BTNode = { type: 'condition', condition: 'flag' };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false, blackboard: { flag: false } });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('failure');
  });

  it('inverted condition: !flag succeeds when flag=false', () => {
    const root: BTNode = { type: 'condition', condition: '!flag' };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false, blackboard: { flag: false } });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('expression condition: "health>50" succeeds when health=80', () => {
    const root: BTNode = { type: 'condition', condition: 'health>50' };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false, blackboard: { health: 80 } });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });

  it('expression condition: "health>50" fails when health=30', () => {
    const root: BTNode = { type: 'condition', condition: 'health>50' };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false, blackboard: { health: 30 } });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('failure');
  });
});

// ─── Action Node ──────────────────────────────────────────────────────────────
describe('BehaviorTree — Action', () => {
  it('set: action writes to blackboard and returns success', () => {
    const root: BTNode = { type: 'action', action: 'set:myKey:true' };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect((node as any).__behaviorTreeState.blackboard.myKey).toBe(true);
  });

  it('unknown action emits bt_action', () => {
    const root: BTNode = { type: 'action', action: 'attack', params: { target: 'enemy' } };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_action')?.payload.action).toBe('attack');
  });
});

// ─── Wait Node ────────────────────────────────────────────────────────────────
describe('BehaviorTree — Wait', () => {
  it('returns running while waiting', () => {
    const root: BTNode = { type: 'wait', duration: 2 };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx, 1.0); // only 1s out of 2s done
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')).toBeUndefined();
  });

  it('succeeds after duration elapsed', () => {
    const root: BTNode = { type: 'wait', duration: 1 };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 1, restart_on_complete: false });
    tick(node, cfg, ctx, 1.5);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')?.payload.status).toBe('success');
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────
describe('behaviorTreeHandler — onEvent', () => {
  it('bt_set_blackboard updates blackboard', () => {
    const { node, ctx, cfg } = attachNode({ type: 'sequence', children: [] });
    behaviorTreeHandler.onEvent!(node, cfg, ctx as any, { type: 'bt_set_blackboard', values: { hp: 99 } } as any);
    expect((node as any).__behaviorTreeState.blackboard.hp).toBe(99);
  });

  it('bt_pause sets isRunning = false', () => {
    const { node, ctx, cfg } = attachNode({ type: 'sequence', children: [] });
    behaviorTreeHandler.onEvent!(node, cfg, ctx as any, { type: 'bt_pause' } as any);
    expect((node as any).__behaviorTreeState.isRunning).toBe(false);
  });

  it('bt_resume sets isRunning = true', () => {
    const { node, ctx, cfg } = attachNode({ type: 'sequence', children: [] });
    behaviorTreeHandler.onEvent!(node, cfg, ctx as any, { type: 'bt_pause' } as any);
    behaviorTreeHandler.onEvent!(node, cfg, ctx as any, { type: 'bt_resume' } as any);
    expect((node as any).__behaviorTreeState.isRunning).toBe(true);
  });

  it('bt_reset clears nodeStates and sets status=running', () => {
    const { node, ctx, cfg } = attachNode({ type: 'sequence', children: [] });
    behaviorTreeHandler.onEvent!(node, cfg, ctx as any, { type: 'bt_reset' } as any);
    expect((node as any).__behaviorTreeState.status).toBe('running');
    expect((node as any).__behaviorTreeState.isRunning).toBe(true);
  });

  it('no-op when no state on node', () => {
    expect(() => behaviorTreeHandler.onEvent!(mkNode() as any, behaviorTreeHandler.defaultConfig!, mkCtx() as any, { type: 'bt_pause' } as any)).not.toThrow();
  });
});

// ─── tick rate throttling ─────────────────────────────────────────────────────
describe('behaviorTreeHandler — tick rate throttling', () => {
  it('does not tick when delta < tickInterval', () => {
    const root: BTNode = { type: 'sequence', children: [{ type: 'action', action: 'set:x:true' }] };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 10, restart_on_complete: false });
    // tickInterval = 1/10 = 0.1. delta=0.05 → no tick fired
    tick(node, cfg, ctx, 0.05);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')).toBeUndefined();
  });

  it('ticks when delta >= tickInterval', () => {
    const root: BTNode = { type: 'sequence', children: [{ type: 'action', action: 'set:x:true' }] };
    const { node, ctx, cfg } = attachNode(root, { tick_rate: 10, restart_on_complete: false });
    tick(node, cfg, ctx, 0.15);
    expect(ctx.emitted.find((e: any) => e.type === 'bt_complete')).toBeDefined();
  });
});
