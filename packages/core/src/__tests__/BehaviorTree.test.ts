import { describe, it, expect } from 'vitest';
import { BehaviorTree } from '../ai/BehaviorTree';
import {
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  GuardNode,
  RepeaterNode,
  ActionNode,
  ConditionNode,
  WaitNode,
} from '../ai/BTNodes';
import { Blackboard } from '../ai/Blackboard';

describe('Cycle 126: AI Behavior Trees', () => {
  // -------------------------------------------------------------------------
  // BTNodes — Composite
  // -------------------------------------------------------------------------

  it('sequence should succeed only if all children succeed', () => {
    const seq = new SequenceNode('seq', [
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'success'),
      new ActionNode('c', () => 'success'),
    ]);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0.016, entity: 'npc' };
    expect(seq.tick(ctx)).toBe('success');
  });

  it('selector should succeed if any child succeeds', () => {
    const sel = new SelectorNode('sel', [
      new ActionNode('fail', () => 'failure'),
      new ActionNode('pass', () => 'success'),
      new ActionNode('never', () => 'failure'),
    ]);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0.016, entity: 'npc' };
    expect(sel.tick(ctx)).toBe('success');
  });

  it('parallel should require N successes', () => {
    const par = new ParallelNode(
      'par',
      [
        new ActionNode('a', () => 'success'),
        new ActionNode('b', () => 'running'),
        new ActionNode('c', () => 'success'),
      ],
      2
    );
    const ctx = { blackboard: new Blackboard(), deltaTime: 0.016, entity: 'npc' };
    expect(par.tick(ctx)).toBe('success');
  });

  // -------------------------------------------------------------------------
  // BTNodes — Decorators
  // -------------------------------------------------------------------------

  it('inverter should flip success/failure', () => {
    const inv = new InverterNode('inv', new ActionNode('fail', () => 'failure'));
    const ctx = { blackboard: new Blackboard(), deltaTime: 0.016, entity: 'npc' };
    expect(inv.tick(ctx)).toBe('success');
  });

  it('guard should block if condition false', () => {
    const bb = new Blackboard();
    bb.set('hasAmmo', false);
    const guard = new GuardNode(
      'checkAmmo',
      (ctx) => ctx.blackboard.get('hasAmmo') === true,
      new ActionNode('shoot', () => 'success')
    );
    const ctx = { blackboard: bb, deltaTime: 0.016, entity: 'npc' };
    expect(guard.tick(ctx)).toBe('failure');

    bb.set('hasAmmo', true);
    expect(guard.tick(ctx)).toBe('success');
  });

  // -------------------------------------------------------------------------
  // BTNodes — Leaves
  // -------------------------------------------------------------------------

  it('wait node should run for duration', () => {
    const wait = new WaitNode('pause', 0.5);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0.2, entity: 'npc' };
    expect(wait.tick(ctx)).toBe('running');
    expect(wait.tick(ctx)).toBe('running');
    expect(wait.tick(ctx)).toBe('success'); // 0.6s > 0.5s
  });

  // -------------------------------------------------------------------------
  // BehaviorTree runner
  // -------------------------------------------------------------------------

  it('should tick a tree and track status', () => {
    const bt = new BehaviorTree();
    const root = new SequenceNode('root', [
      new ConditionNode('alive', () => true),
      new ActionNode('patrol', () => 'success'),
    ]);
    bt.createTree('guard1', root, 'npc_guard');
    const status = bt.tick('guard1', 0.016);
    expect(status).toBe('success');
    expect(bt.getTree('guard1')!.tickCount).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Blackboard
  // -------------------------------------------------------------------------

  it('should store scoped data with observers', () => {
    const bb = new Blackboard();
    const changes: unknown[] = [];
    bb.observe('health', (_k, v) => changes.push(v));

    bb.set('health', 100, 'combat');
    bb.set('health', 80, 'combat');
    bb.set('target', 'player', 'perception');

    expect(bb.get<number>('health')).toBe(80);
    expect(changes).toEqual([100, 80]);
    expect(bb.getByScope('combat').size).toBe(1);
    expect(bb.getByScope('perception').size).toBe(1);
  });

  it('should serialize and deserialize', () => {
    const bb = new Blackboard();
    bb.set('score', 42);
    bb.set('name', 'hero');

    const json = bb.toJSON();
    const bb2 = new Blackboard();
    bb2.fromJSON(json);

    expect(bb2.get('score')).toBe(42);
    expect(bb2.get('name')).toBe('hero');
    expect(bb2.getEntryCount()).toBe(2);
  });
});
