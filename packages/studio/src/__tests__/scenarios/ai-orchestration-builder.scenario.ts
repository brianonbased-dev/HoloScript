/**
 * ai-orchestration-builder.scenario.ts — LIVING-SPEC: AI Orchestration Builder
 * (with behavior tree DSL + agent registry)
 *
 * Persona: Maya — AI researcher building autonomous agent behaviors in HoloScript Studio.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAgentRegistryStore } from '@/lib/agentRegistryStore';
import {
  bt, runTree, serializeTree, countNodes,
  SequenceNode, SelectorNode, ParallelNode,
  ActionNode, ConditionNode, InverterNode, RepeatNode, GuardNode,
  type BehaviorContext, type BehaviorStatus,
} from '@/lib/behaviorTree';

// ═══════════════════════════════════════════════════════════════════
// 1. Agent Registry Store
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: AI Orchestration — Agent Registry', () => {
  beforeEach(() => {
    useAgentRegistryStore.setState({ agents: [] });
  });

  it('starts with an empty registry', () =>
    expect(useAgentRegistryStore.getState().agents).toHaveLength(0));

  it('registerAgent() adds an agent', () => {
    useAgentRegistryStore.getState().registerAgent({ id: 'guard-01', name: 'Guard Bot', type: 'patrol', status: 'idle', config: {} });
    expect(useAgentRegistryStore.getState().agents).toHaveLength(1);
  });

  it('registerAgent() stores name, type, status', () => {
    useAgentRegistryStore.getState().registerAgent({ id: 'a1', name: 'Sentinel', type: 'patrol', status: 'idle', config: {} });
    const agent = useAgentRegistryStore.getState().agents[0]!;
    expect(agent.name).toBe('Sentinel');
    expect(agent.type).toBe('patrol');
    expect(agent.status).toBe('idle');
  });

  it('unregisterAgent() removes it from the registry', () => {
    useAgentRegistryStore.getState().registerAgent({ id: 'a1', name: 'Guard', type: 'patrol', status: 'idle', config: {} });
    useAgentRegistryStore.getState().unregisterAgent('a1');
    expect(useAgentRegistryStore.getState().agents).toHaveLength(0);
  });

  it('setAgentStatus() updates just the status', () => {
    useAgentRegistryStore.getState().registerAgent({ id: 'a1', name: 'Scout', type: 'recon', status: 'idle', config: {} });
    useAgentRegistryStore.getState().setAgentStatus('a1', 'running');
    expect(useAgentRegistryStore.getState().agents[0]!.status).toBe('running');
  });

  it('supports multiple agent types', () => {
    for (const type of ['patrol','worker','recon','defender']) {
      useAgentRegistryStore.getState().registerAgent({ id: `a-${type}`, name: type, type, status: 'idle', config: {} });
    }
    expect(useAgentRegistryStore.getState().agents).toHaveLength(4);
  });

  it.todo('agent registry panel renders agents as cards in Studio sidebar');
  it.todo('spawn agent button opens agent config modal');
});

// ═══════════════════════════════════════════════════════════════════
// 2. Behavior Tree — Leaf Nodes
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: AI Orchestration — Behavior Tree Leaf Nodes', () => {
  it('bt.succeed always returns SUCCESS', () => {
    const ctx: BehaviorContext = { blackboard: {}, elapsed: 0, tick: 0 };
    expect(bt.succeed.execute(ctx)).toBe('SUCCESS');
  });

  it('bt.fail always returns FAILURE', () => {
    const ctx: BehaviorContext = { blackboard: {}, elapsed: 0, tick: 0 };
    expect(bt.fail.execute(ctx)).toBe('FAILURE');
  });

  it('bt.running always returns RUNNING', () => {
    const ctx: BehaviorContext = { blackboard: {}, elapsed: 0, tick: 0 };
    expect(bt.running.execute(ctx)).toBe('RUNNING');
  });

  it('bt.action() calls the provided function', () => {
    let called = false;
    const action = bt.action('TestAction', (ctx) => { called = true; return 'SUCCESS'; });
    const ctx: BehaviorContext = { blackboard: {}, elapsed: 0, tick: 0 };
    action.execute(ctx);
    expect(called).toBe(true);
  });

  it('bt.action() can write to blackboard', () => {
    const action = bt.action('Write', (ctx) => { ctx.blackboard['visited'] = true; return 'SUCCESS'; });
    const ctx: BehaviorContext = { blackboard: {}, elapsed: 0, tick: 0 };
    action.execute(ctx);
    expect(ctx.blackboard['visited']).toBe(true);
  });

  it('bt.condition() returns SUCCESS when predicate is true', () => {
    const cond = bt.condition('HasTarget', (ctx) => ctx.blackboard['hasTarget'] === true);
    const ctx: BehaviorContext = { blackboard: { hasTarget: true }, elapsed: 0, tick: 0 };
    expect(cond.execute(ctx)).toBe('SUCCESS');
  });

  it('bt.condition() returns FAILURE when predicate is false', () => {
    const cond = bt.condition('HasTarget', (ctx) => ctx.blackboard['hasTarget'] === true);
    const ctx: BehaviorContext = { blackboard: { hasTarget: false }, elapsed: 0, tick: 0 };
    expect(cond.execute(ctx)).toBe('FAILURE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Behavior Tree — Composite Nodes
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: AI Orchestration — Behavior Tree Composites', () => {
  it('Sequence: all-SUCCESS → SUCCESS', () => {
    const tree = bt.sequence('S', bt.succeed, bt.succeed, bt.succeed);
    const { status } = runTree(tree);
    expect(status).toBe('SUCCESS');
  });

  it('Sequence: first-FAILURE → FAILURE (short-circuit)', () => {
    let secondCalled = false;
    const tree = bt.sequence('S', bt.fail, bt.action('B', () => { secondCalled = true; return 'SUCCESS'; }));
    runTree(tree);
    expect(secondCalled).toBe(false);
  });

  it('Sequence: RUNNING in middle → RUNNING', () => {
    const tree = bt.sequence('S', bt.succeed, bt.running, bt.succeed);
    expect(runTree(tree).status).toBe('RUNNING');
  });

  it('Selector: first-SUCCESS → SUCCESS (short-circuit)', () => {
    let secondCalled = false;
    const tree = bt.selector('S', bt.succeed, bt.action('B', () => { secondCalled = true; return 'SUCCESS'; }));
    runTree(tree);
    expect(secondCalled).toBe(false);
  });

  it('Selector: all-FAILURE → FAILURE', () => {
    const tree = bt.selector('S', bt.fail, bt.fail, bt.fail);
    expect(runTree(tree).status).toBe('FAILURE');
  });

  it('Selector: RUNNING after failures → RUNNING', () => {
    const tree = bt.selector('S', bt.fail, bt.running, bt.succeed);
    expect(runTree(tree).status).toBe('RUNNING');
  });

  it('Parallel require-all: all SUCCESS → SUCCESS', () => {
    const tree = bt.parallel('P', 'require-all', bt.succeed, bt.succeed);
    expect(runTree(tree).status).toBe('SUCCESS');
  });

  it('Parallel require-all: one FAILURE → FAILURE', () => {
    const tree = bt.parallel('P', 'require-all', bt.succeed, bt.fail);
    expect(runTree(tree).status).toBe('FAILURE');
  });

  it('Parallel require-one: one SUCCESS → SUCCESS', () => {
    const tree = bt.parallel('P', 'require-one', bt.fail, bt.succeed);
    expect(runTree(tree).status).toBe('SUCCESS');
  });

  it('Parallel require-one: all FAILURE → FAILURE', () => {
    const tree = bt.parallel('P', 'require-one', bt.fail, bt.fail);
    expect(runTree(tree).status).toBe('FAILURE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 4. Behavior Tree — Decorators
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: AI Orchestration — Behavior Tree Decorators', () => {
  it('Inverter: SUCCESS → FAILURE', () => {
    expect(runTree(bt.invert(bt.succeed)).status).toBe('FAILURE');
  });

  it('Inverter: FAILURE → SUCCESS', () => {
    expect(runTree(bt.invert(bt.fail)).status).toBe('SUCCESS');
  });

  it('Inverter: RUNNING → RUNNING', () => {
    expect(runTree(bt.invert(bt.running)).status).toBe('RUNNING');
  });

  it('Repeat × 3 calls child 3 times on success', () => {
    let count = 0;
    const action = bt.action('Count', () => { count++; return 'SUCCESS'; });
    runTree(bt.repeat(3, action));
    expect(count).toBe(3);
  });

  it('Repeat stops early on child FAILURE', () => {
    let count = 0;
    const action = bt.action('Fail2nd', () => { count++; return count < 2 ? 'SUCCESS' : 'FAILURE'; });
    const { status } = runTree(bt.repeat(5, action));
    expect(count).toBe(2);
    expect(status).toBe('FAILURE');
  });

  it('Guard: passes through when condition is true', () => {
    const tree = bt.guard((ctx) => ctx.blackboard['key'] === 'ok', bt.succeed, 'Guard');
    expect(runTree(tree, { key: 'ok' }).status).toBe('SUCCESS');
  });

  it('Guard: returns FAILURE when condition is false', () => {
    const tree = bt.guard((ctx) => false, bt.succeed, 'Guard');
    expect(runTree(tree).status).toBe('FAILURE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Tree Utilities
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: AI Orchestration — Tree Utilities', () => {
  it('runTree() multi-tick advances tick counter', () => {
    const { ticks } = runTree(bt.running, {}, 5);
    expect(ticks).toBe(5);
  });

  it('runTree() stops on SUCCESS before maxTicks', () => {
    // succeed on first tick
    const { ticks } = runTree(bt.succeed, {}, 10);
    expect(ticks).toBe(1);
  });

  it('countNodes() counts leaf nodes', () => {
    expect(countNodes(bt.succeed)).toBe(1);
  });

  it('countNodes() counts composite tree correctly', () => {
    const tree = bt.sequence('Root', bt.succeed, bt.sequence('Inner', bt.fail, bt.succeed));
    expect(countNodes(tree)).toBe(5); // Root + Inner + 3 leaves
  });

  it('serializeTree() produces correct type for sequence', () => {
    const serialized = serializeTree(bt.sequence('Patrol', bt.succeed, bt.fail));
    expect(serialized.type).toBe('sequence');
    expect(serialized.children).toHaveLength(2);
  });

  it('serializeTree() includes label', () => {
    const serialized = serializeTree(bt.action('Patrol', () => 'SUCCESS'));
    expect(serialized.label).toBe('Patrol');
  });

  it('serializeTree() includes repeat times', () => {
    const serialized = serializeTree(bt.repeat(7, bt.succeed));
    expect(serialized.times).toBe(7);
  });

  it('serializeTree() includes parallel policy', () => {
    const serialized = serializeTree(bt.parallel('P', 'require-one', bt.succeed));
    expect(serialized.policy).toBe('require-one');
  });

  it('serializeTree() is JSON-serializable (no circular refs)', () => {
    const tree = bt.sequence('Root',
      bt.selector('Sub', bt.succeed, bt.fail),
      bt.invert(bt.succeed),
    );
    expect(() => JSON.stringify(serializeTree(tree))).not.toThrow();
  });

  it.todo('agent behavior tree editor (visual canvas nodes)');
  it.todo('play behavior tree in real-time inside HoloScript scene');
  it.todo('BT import/export as .bt.json file');
  it.todo('Blackboard Inspector panel shows live key-value state during play');
});

// ═══════════════════════════════════════════════════════════════════
// 6. Agent Config Persistence
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: AI Orchestration — Real-World Agent Behaviors', () => {
  it.todo('patrol agent follows waypoints in sequence using waypoint list');
  it.todo('worker agent picks up item → carries → deposits (3-step sequence)');
  it.todo('defender agent detects enemy (condition) → attack (action)');
  it.todo('HoloScript @agent { behavior: "patrol" } trait wires to BT runtime');
  it.todo('publish agent logic to HoloScript marketplace as a package');
});
