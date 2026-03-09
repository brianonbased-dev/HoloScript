import { describe, it, expect, beforeEach } from 'vitest';
import { SceneRunner } from '../SceneRunner';
import { World } from '../../ecs/World';
import { TraitBinder } from '../TraitBinder';
import { EventBus } from '../../events/EventBus';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

function makeNode(overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    type: 'entity',
    name: overrides.name ?? 'test_node',
    id: overrides.id ?? 'n1',
    properties: overrides.properties ?? {},
    directives: overrides.directives ?? [],
    children: overrides.children ?? [],
    ...(overrides as any),
  };
}

describe('SceneRunner', () => {
  let world: World;
  let binder: TraitBinder;
  let eventBus: EventBus;
  let runner: SceneRunner;

  beforeEach(() => {
    world = new World();
    binder = new TraitBinder();
    eventBus = new EventBus();
    runner = new SceneRunner({ world, traitBinder: binder, eventBus });
  });

  // ---- Basic Run ----

  it('run returns root entity', () => {
    const entity = runner.run(makeNode());
    expect(entity).toBeDefined();
    expect(typeof entity).toBe('number');
  });

  it('spawnedCount reflects instantiated nodes', () => {
    runner.run(makeNode());
    expect(runner.spawnedCount).toBe(1);
  });

  it('getEntity returns entity for node ID', () => {
    runner.run(makeNode({ id: 'root' }));
    expect(runner.getEntity('root')).toBeDefined();
  });

  // ---- Children ----

  it('instantiates children recursively', () => {
    const root = makeNode({
      id: 'root',
      children: [makeNode({ id: 'child1', name: 'c1' }), makeNode({ id: 'child2', name: 'c2' })],
    });
    runner.run(root);
    expect(runner.spawnedCount).toBe(3);
    expect(runner.getEntity('child1')).toBeDefined();
    expect(runner.getEntity('child2')).toBeDefined();
  });

  // ---- Transform ----

  it('attaches transform from position property', () => {
    const root = makeNode({
      properties: { position: { x: 10, y: 20, z: 30 } },
    });
    const entity = runner.run(root);
    const transform = world.getComponent<any>(entity, 'transform');
    expect(transform.position).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('fallback transform when no properties', () => {
    const entity = runner.run(makeNode());
    const transform = world.getComponent<any>(entity, 'transform');
    expect(transform.position).toEqual({ x: 0, y: 0, z: 0 });
  });

  // ---- Trait Binding ----

  it('binds traits from directives', () => {
    binder.register('audio', {
      name: 'audio',
      defaultConfig: { volume: 1 },
      attach: () => {},
      detach: () => {},
    });
    const root = makeNode({
      directives: [{ name: 'audio', args: { volume: 0.5 } }],
    });
    const entity = runner.run(root);
    const traitComp = world.getComponent<any>(entity, 'trait:audio');
    expect(traitComp).toBeDefined();
    expect(traitComp.volume).toBe(0.5);
  });

  // ---- Spawned Info ----

  it('getSpawned returns entity info', () => {
    runner.run(makeNode({ id: 'root', type: 'mesh' }));
    const spawned = runner.getSpawned('root');
    expect(spawned).toBeDefined();
    expect(spawned!.nodeType).toBe('mesh');
  });

  it('getAllSpawned returns all', () => {
    runner.run(
      makeNode({
        children: [makeNode({ id: 'c1', name: 'child' })],
      })
    );
    expect(runner.getAllSpawned().length).toBe(2);
  });

  // ---- Despawn ----

  it('despawnAll clears everything', () => {
    runner.run(makeNode({ children: [makeNode({ id: 'c', name: 'c' })] }));
    expect(runner.spawnedCount).toBe(2);
    runner.despawnAll();
    expect(runner.spawnedCount).toBe(0);
    expect(runner.getEntity('n1')).toBeUndefined();
  });

  // ---- Events ----

  it('emits node:instantiated event', () => {
    let emitted = false;
    eventBus.on('node:instantiated', () => {
      emitted = true;
    });
    runner.run(makeNode());
    expect(emitted).toBe(true);
  });
});
