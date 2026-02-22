/**
 * BehaviorTreeTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { behaviorTreeHandler } from '../BehaviorTreeTrait';

function makeNode(props: any = {}) { return { id: 'bt_node', ...props }; }
function makeCtx(extras: any = {}) { return { emit: vi.fn(), ...extras }; }
function attach(cfg: any = {}, nodeProps: any = {}) {
  const node = makeNode(nodeProps);
  const ctx = makeCtx();
  const config = { ...behaviorTreeHandler.defaultConfig!, ...cfg };
  behaviorTreeHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('behaviorTreeHandler.defaultConfig', () => {
  const d = behaviorTreeHandler.defaultConfig!;
  it('root is sequence with no children', () => {
    expect(d.root.type).toBe('sequence');
    expect(d.root.children).toEqual([]);
  });
  it('tick_rate=10', () => expect(d.tick_rate).toBe(10));
  it('debug_visualization=false', () => expect(d.debug_visualization).toBe(false));
  it('blackboard={}', () => expect(d.blackboard).toEqual({}));
  it('restart_on_complete=true', () => expect(d.restart_on_complete).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('behaviorTreeHandler.onAttach', () => {
  it('creates __behaviorTreeState', () => expect(attach().node.__behaviorTreeState).toBeDefined());
  it('status=running', () => expect(attach().node.__behaviorTreeState.status).toBe('running'));
  it('isRunning=true', () => expect(attach().node.__behaviorTreeState.isRunning).toBe(true));
  it('tickAccumulator=0', () => expect(attach().node.__behaviorTreeState.tickAccumulator).toBe(0));
  it('blackboard cloned from config', () => {
    const { node } = attach({ blackboard: { hp: 100 } });
    expect(node.__behaviorTreeState.blackboard.hp).toBe(100);
  });
  it('emits bt_started', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('bt_started', expect.anything());
  });
  it('nodeStates is a Map', () => {
    const { node } = attach();
    expect(node.__behaviorTreeState.nodeStates).toBeInstanceOf(Map);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('behaviorTreeHandler.onDetach', () => {
  it('removes __behaviorTreeState', () => {
    const { node, config, ctx } = attach();
    behaviorTreeHandler.onDetach!(node, config, ctx);
    expect(node.__behaviorTreeState).toBeUndefined();
  });
});

// ─── onUpdate — tick accumulation ─────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — tick accumulation', () => {
  it('accumulates delta before ticking (tick_rate=10 → interval=0.1s)', () => {
    const root = { type: 'sequence' as const, children: [] };
    const { node, config, ctx } = attach({ root, tick_rate: 10 });
    ctx.emit.mockClear();
    // 0.05s < 0.1s interval — no tick yet
    behaviorTreeHandler.onUpdate!(node, config, ctx, 0.05);
    expect(ctx.emit).not.toHaveBeenCalledWith('bt_complete', expect.anything());
    expect(node.__behaviorTreeState.tickAccumulator).toBeCloseTo(0.05);
  });

  it('ticks when accumulator reaches interval', () => {
    const root = { type: 'sequence' as const, children: [] };
    const { node, config, ctx } = attach({ root, tick_rate: 10 });
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).toHaveBeenCalledWith('bt_complete', expect.anything());
  });

  it('no-op when isRunning=false', () => {
    const root = { type: 'sequence' as const, children: [] };
    const { node, config, ctx } = attach({ root, tick_rate: 10 });
    node.__behaviorTreeState.isRunning = false;
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — sequence node ─────────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — sequence', () => {
  it('sequence with all-success children → success → bt_complete', () => {
    const ctx = makeCtx({ executeAction: () => true });
    const node = makeNode();
    const root = {
      type: 'sequence' as const,
      children: [
        { type: 'action' as const, action: 'doA' },
        { type: 'action' as const, action: 'doB' },
      ],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call).toBeDefined();
    expect(call![1].status).toBe('success');
  });

  it('sequence fails on first failing child', () => {
    let callCount = 0;
    const ctx = makeCtx({ executeAction: () => { callCount++; return false; } });
    const node = makeNode();
    const root = {
      type: 'sequence' as const,
      children: [
        { type: 'action' as const, action: 'fail' },
        { type: 'action' as const, action: 'shouldNotRun' },
      ],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('failure');
    expect(callCount).toBe(1); // Only first child ran
  });
});

// ─── onUpdate — selector node ─────────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — selector', () => {
  it('selector succeeds on first succeeding child', () => {
    const ctx = makeCtx({ executeAction: () => true });
    const node = makeNode();
    const root = {
      type: 'selector' as const,
      children: [
        { type: 'action' as const, action: 'tryA' },
        { type: 'action' as const, action: 'tryB' },
      ],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('success');
  });

  it('selector fails when all children fail', () => {
    const ctx = makeCtx({ executeAction: () => false });
    const node = makeNode();
    const root = {
      type: 'selector' as const,
      children: [
        { type: 'action' as const, action: 'a' },
        { type: 'action' as const, action: 'b' },
      ],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('failure');
  });
});

// ─── onUpdate — inverter node ─────────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — inverter', () => {
  it('inverts success to failure', () => {
    const ctx = makeCtx({ executeAction: () => true });
    const node = makeNode();
    const root = {
      type: 'inverter' as const,
      children: [{ type: 'action' as const, action: 'succeed' }],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('failure');
  });

  it('inverts failure to success', () => {
    const ctx = makeCtx({ executeAction: () => false });
    const node = makeNode();
    const root = {
      type: 'inverter' as const,
      children: [{ type: 'action' as const, action: 'fail' }],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('success');
  });
});

// ─── onUpdate — condition node ─────────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — condition', () => {
  it('truthy blackboard key → success', () => {
    const root = { type: 'condition' as const, condition: 'hasTarget' };
    const { node, config, ctx } = attach({ root, tick_rate: 1, blackboard: { hasTarget: true } });
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('bt_complete', expect.objectContaining({ status: 'success' }));
  });

  it('falsy blackboard key → failure', () => {
    const root = { type: 'condition' as const, condition: 'hasTarget' };
    const { node, config, ctx } = attach({ root, tick_rate: 1, blackboard: { hasTarget: false } });
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('bt_complete', expect.objectContaining({ status: 'failure' }));
  });

  it('negation with ! prefix', () => {
    const root = { type: 'condition' as const, condition: '!isEnemy' };
    const { node, config, ctx } = attach({ root, tick_rate: 1, blackboard: { isEnemy: false } });
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('bt_complete', expect.objectContaining({ status: 'success' }));
  });

  it('greater-than expression: hp>50 with hp=80 → success', () => {
    const root = { type: 'condition' as const, condition: 'hp>50' };
    const { node, config, ctx } = attach({ root, tick_rate: 1, blackboard: { hp: 80 } });
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('bt_complete', expect.objectContaining({ status: 'success' }));
  });

  it('greater-than expression: hp>50 with hp=30 → failure', () => {
    const root = { type: 'condition' as const, condition: 'hp>50' };
    const { node, config, ctx } = attach({ root, tick_rate: 1, blackboard: { hp: 30 } });
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('bt_complete', expect.objectContaining({ status: 'failure' }));
  });
});

// ─── onUpdate — wait node ─────────────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — wait', () => {
  it('wait returns running before duration', () => {
    const root = { type: 'wait' as const, duration: 1 };
    const { node, config, ctx } = attach({ root, tick_rate: 100 });
    // tick at 0.01s (< 1s duration)
    behaviorTreeHandler.onUpdate!(node, config, ctx, 0.01);
    expect(ctx.emit).not.toHaveBeenCalledWith('bt_complete', expect.anything());
  });

  it('wait returns success after duration accumulated', () => {
    const root = { type: 'wait' as const, duration: 0.5 };
    const { node, config, ctx } = attach({ root, tick_rate: 1 });
    // Tick once at 1s delta → accumulator hits interval, wait accumulates 1s > 0.5s duration
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call).toBeDefined();
    expect(call![1].status).toBe('success');
  });
});

// ─── onUpdate — action set: prefix ────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — action set:', () => {
  it('set:key:true sets blackboard key to true → success', () => {
    const root = { type: 'action' as const, action: 'set:isReady:true' };
    const { node, config, ctx } = attach({ root, tick_rate: 1 });
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__behaviorTreeState.blackboard.isReady).toBe(true);
  });

  it('set:key:false sets blackboard key to false', () => {
    const root = { type: 'action' as const, action: 'set:active:false' };
    const { node, config, ctx } = attach({ root, tick_rate: 1 });
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__behaviorTreeState.blackboard.active).toBe(false);
  });
});

// ─── onUpdate — restart_on_complete ───────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — restart_on_complete', () => {
  it('when restart_on_complete=true: stays running after completion', () => {
    const root = { type: 'sequence' as const, children: [] };
    const { node, config, ctx } = attach({ root, tick_rate: 1, restart_on_complete: true });
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__behaviorTreeState.isRunning).toBe(true);
  });

  it('when restart_on_complete=false: stops after completion', () => {
    const root = { type: 'sequence' as const, children: [] };
    const { node, config, ctx } = attach({ root, tick_rate: 1, restart_on_complete: false });
    behaviorTreeHandler.onUpdate!(node, config, ctx, 1);
    expect(node.__behaviorTreeState.isRunning).toBe(false);
  });
});

// ─── onUpdate — parallel node ─────────────────────────────────────────────────

describe('behaviorTreeHandler.onUpdate — parallel', () => {
  it('parallel succeeds when all children succeed (full threshold)', () => {
    const ctx = makeCtx({ executeAction: () => true });
    const node = makeNode();
    const root = {
      type: 'parallel' as const,
      children: [
        { type: 'action' as const, action: 'a' },
        { type: 'action' as const, action: 'b' },
      ],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('success');
  });

  it('parallel succeeds with successThreshold=1 when one succeeds', () => {
    let n = 0;
    const ctx = makeCtx({ executeAction: () => { return n++ === 0; } });
    const node = makeNode();
    const root = {
      type: 'parallel' as const,
      successThreshold: 1,
      children: [
        { type: 'action' as const, action: 'a' },
        { type: 'action' as const, action: 'b' },
      ],
    };
    const config: any = { ...behaviorTreeHandler.defaultConfig!, root, tick_rate: 1 };
    behaviorTreeHandler.onAttach!(node, config, ctx);
    ctx.emit.mockClear();
    behaviorTreeHandler.onUpdate!(node as any, config, ctx, 1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'bt_complete');
    expect(call![1].status).toBe('success');
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('behaviorTreeHandler.onEvent — bt_set_blackboard', () => {
  it('merges values into blackboard', () => {
    const { node, config, ctx } = attach({ blackboard: { hp: 100 } });
    behaviorTreeHandler.onEvent!(node, config, ctx, { type: 'bt_set_blackboard', values: { hp: 50, mana: 30 } });
    expect(node.__behaviorTreeState.blackboard.hp).toBe(50);
    expect(node.__behaviorTreeState.blackboard.mana).toBe(30);
  });
});

describe('behaviorTreeHandler.onEvent — bt_pause / bt_resume', () => {
  it('bt_pause sets isRunning=false', () => {
    const { node, config, ctx } = attach();
    behaviorTreeHandler.onEvent!(node, config, ctx, { type: 'bt_pause' });
    expect(node.__behaviorTreeState.isRunning).toBe(false);
  });
  it('bt_resume sets isRunning=true', () => {
    const { node, config, ctx } = attach();
    node.__behaviorTreeState.isRunning = false;
    behaviorTreeHandler.onEvent!(node, config, ctx, { type: 'bt_resume' });
    expect(node.__behaviorTreeState.isRunning).toBe(true);
  });
});

describe('behaviorTreeHandler.onEvent — bt_reset', () => {
  it('clears nodeStates, resets status+isRunning', () => {
    const { node, config, ctx } = attach();
    node.__behaviorTreeState.isRunning = false;
    node.__behaviorTreeState.status = 'failure' as any;
    (node.__behaviorTreeState.nodeStates as Map<any, any>).set({}, {});
    behaviorTreeHandler.onEvent!(node, config, ctx, { type: 'bt_reset' });
    expect(node.__behaviorTreeState.status).toBe('running');
    expect(node.__behaviorTreeState.isRunning).toBe(true);
    expect(node.__behaviorTreeState.nodeStates.size).toBe(0);
  });
});
