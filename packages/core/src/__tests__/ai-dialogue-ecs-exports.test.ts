/**
 * @fileoverview Tests for AI, Dialogue, and ECS barrel exports
 */
import { describe, it, expect } from 'vitest';
import {
  // AI
  BehaviorTree,
  Blackboard,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  RepeaterNode,
  GuardNode,
  ActionNode,
  ConditionNode,
  WaitNode,
  // Dialogue
  DialogueGraph,
  DialogueRunner,
  // ECS
  ECSWorld,
  ComponentType,
} from '../index';

describe('AI: Behavior Tree exports', () => {
  it('BehaviorTree creates and ticks trees', () => {
    const bt = new BehaviorTree();
    const root = new SequenceNode('root', [new ActionNode('act', () => 'success')]);
    const tree = bt.createTree('test', root, 'npc');
    expect(tree.id).toBe('test');
    expect(tree.status).toBe('ready');

    const status = bt.tick('test', 0.016);
    expect(status).toBe('success');
  });

  it('Blackboard stores and retrieves values', () => {
    const bb = new Blackboard();
    bb.set('health', 100);
    expect(bb.get('health')).toBe(100);
  });

  it('SelectorNode picks first success', () => {
    const sel = new SelectorNode('sel', [
      new ActionNode('fail', () => 'failure'),
      new ActionNode('win', () => 'success'),
    ]);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0, entity: 'e' };
    expect(sel.tick(ctx)).toBe('success');
  });

  it('ParallelNode runs all children', () => {
    const par = new ParallelNode('par', [
      new ActionNode('a', () => 'success'),
      new ActionNode('b', () => 'success'),
    ]);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0, entity: 'e' };
    expect(par.tick(ctx)).toBe('success');
  });

  it('InverterNode flips result', () => {
    const inv = new InverterNode('inv', new ActionNode('a', () => 'success'));
    const ctx = { blackboard: new Blackboard(), deltaTime: 0, entity: 'e' };
    expect(inv.tick(ctx)).toBe('failure');
  });

  it('ConditionNode checks boolean', () => {
    const cond = new ConditionNode('cond', () => true);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0, entity: 'e' };
    expect(cond.tick(ctx)).toBe('success');
  });

  it('WaitNode waits for duration', () => {
    const wait = new WaitNode('wait', 1);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0.5, entity: 'e' };
    expect(wait.tick(ctx)).toBe('running');
    expect(wait.tick(ctx)).toBe('success');
  });

  it('GuardNode blocks on false condition', () => {
    const guard = new GuardNode('guard', () => false, new ActionNode('a', () => 'success'));
    const ctx = { blackboard: new Blackboard(), deltaTime: 0, entity: 'e' };
    expect(guard.tick(ctx)).toBe('failure');
  });

  it('RepeaterNode repeats N times', () => {
    const rep = new RepeaterNode('rep', new ActionNode('a', () => 'success'), 2);
    const ctx = { blackboard: new Blackboard(), deltaTime: 0, entity: 'e' };
    expect(rep.tick(ctx)).toBe('running'); // 1st
    expect(rep.tick(ctx)).toBe('success'); // 2nd
  });

  it('debug tracing works', () => {
    const bt = new BehaviorTree();
    bt.enableTracing();
    const root = new ActionNode('traced', () => 'success');
    bt.createTree('t', root, 'e');
    bt.tick('t', 0.016);
    const trace = bt.getTrace();
    expect(trace.length).toBeGreaterThan(0);
    expect(trace[0].node).toBe('traced');
  });
});

describe('Dialogue exports', () => {
  it('DialogueGraph builds and runs dialogue', () => {
    const g = new DialogueGraph();
    g.addTextNode('start', 'NPC', 'Hello!', 'end');
    g.addEndNode('end');
    g.setStart('start');

    const node = g.start();
    expect(node).not.toBeNull();
    expect(node!.speaker).toBe('NPC');
    expect(node!.text).toBe('Hello!');
    expect(g.getNodeCount()).toBe(2);
  });

  it('DialogueGraph handles choices', () => {
    const g = new DialogueGraph();
    g.addChoiceNode('ask', 'NPC', 'What do you want?', [
      { text: 'Gold', nextId: 'gold' },
      { text: 'Info', nextId: 'info' },
    ]);
    g.addTextNode('gold', 'NPC', 'Here is gold.', 'end');
    g.addTextNode('info', 'NPC', 'Here is info.', 'end');
    g.addEndNode('end');
    g.setStart('ask');
    g.start();

    const choices = g.getAvailableChoices();
    expect(choices.length).toBe(2);

    const next = g.advance(0);
    expect(next).not.toBeNull();
    expect(next!.text).toBe('Here is gold.');
  });

  it('DialogueGraph interpolates variables', () => {
    const g = new DialogueGraph();
    g.setVariable('name', 'Player');
    const result = g.interpolateText('Hello {name}!');
    expect(result).toBe('Hello Player!');
  });

  it('DialogueRunner runs through nodes', () => {
    const r = new DialogueRunner();
    r.loadNodes([
      { id: 'a', type: 'text', speaker: 'NPC', text: 'Hi', nextId: 'b' },
      { id: 'b', type: 'text', speaker: 'NPC', text: 'Bye' },
    ]);
    const first = r.start('a');
    expect(first).not.toBeNull();
    expect(first!.text).toBe('Hi');

    const second = r.advance();
    expect(second).not.toBeNull();
    expect(second!.text).toBe('Bye');
  });

  it('DialogueRunner resolves text variables', () => {
    const r = new DialogueRunner();
    r.setVariable('gold', 42);
    expect(r.resolveText('You have {gold} gold.')).toBe('You have 42 gold.');
  });
});

describe('ECS exports', () => {
  it('ECSWorld creates and queries entities', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 1, y: 2, z: 3, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });

    const found = world.query(ComponentType.Transform);
    expect(found).toContain(id);
    expect(world.getTransform(id)[0]).toBe(1);
  });

  it('ECSWorld destroys entities', () => {
    const world = new ECSWorld();
    const id = world.createEntity();
    world.addTransform(id, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    expect(world.entityCount()).toBe(1);
    world.destroyEntity(id);
    expect(world.entityCount()).toBe(0);
  });

  it('ECSWorld bitmask queries work', () => {
    const world = new ECSWorld();
    const a = world.createEntity();
    world.addTransform(a, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });
    world.addVelocity(a, { vx: 1, vy: 0, vz: 0, angularX: 0, angularY: 0, angularZ: 0 });

    const b = world.createEntity();
    world.addTransform(b, { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, sx: 1, sy: 1, sz: 1 });

    const moving = world.query(ComponentType.Transform | ComponentType.Velocity);
    expect(moving.length).toBe(1);
    expect(moving[0]).toBe(a);
  });

  it('ECSWorld tick runs systems and reports stats', () => {
    const world = new ECSWorld();
    let ran = false;
    world.addSystem(() => {
      ran = true;
    });
    world.tick(0.016);
    expect(ran).toBe(true);
    expect(world.getStats().totalFrames).toBe(1);
  });

  it('ECSWorld reset clears all', () => {
    const world = new ECSWorld();
    world.createEntity();
    world.createEntity();
    expect(world.entityCount()).toBe(2);
    world.reset();
    expect(world.entityCount()).toBe(0);
  });
});
