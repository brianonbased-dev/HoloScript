import { describe, it, expect, vi } from 'vitest';
import { World } from '../ecs/World';
import { EventBus } from '../events/EventBus';
import { TraitBinder } from '../runtime/TraitBinder';
import { SceneRunner } from '../runtime/SceneRunner';
import { RuntimeBridge } from '../runtime/RuntimeBridge';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// Helper to create a minimal HSPlusNode
function makeNode(overrides: Partial<HSPlusNode> = {}): HSPlusNode {
  return {
    type: 'entity',
    id: 'test-node',
    properties: {},
    ...overrides,
  } as HSPlusNode;
}

describe('SceneRunner & Execution Bridge', () => {
  describe('TraitBinder', () => {
    it('Registers and resolves handlers', () => {
      const binder = new TraitBinder();
      const handler = { name: 'grabbable' as any, defaultConfig: { mass: 1 } };
      binder.register('grabbable', handler);
      expect(binder.has('grabbable')).toBe(true);
      expect(binder.resolve('grabbable')).toBe(handler);
    });

    it('Merges config with defaults', () => {
      const binder = new TraitBinder();
      binder.register('audio', { name: 'audio' as any, defaultConfig: { volume: 1, loop: false } });
      const merged = binder.mergeConfig('audio', { volume: 0.5 });
      expect(merged).toEqual({ volume: 0.5, loop: false });
    });

    it('Lists registered traits', () => {
      const binder = new TraitBinder();
      binder.registerAll([
        ['a', { name: 'a' as any, defaultConfig: {} }],
        ['b', { name: 'b' as any, defaultConfig: {} }],
      ]);
      expect(binder.listTraits()).toEqual(['a', 'b']);
      expect(binder.count).toBe(2);
    });
  });

  describe('SceneRunner', () => {
    it('Instantiates a node as an ECS entity', () => {
      const world = new World();
      const bus = new EventBus();
      const binder = new TraitBinder();
      const runner = new SceneRunner({ world, traitBinder: binder, eventBus: bus });

      const entity = runner.run(makeNode({ id: 'box', type: 'box', name: 'myBox' }));

      expect(world.hasEntity(entity)).toBe(true);
      expect(world.hasComponent(entity, 'transform')).toBe(true);
      expect(world.hasComponent(entity, 'renderable')).toBe(true);
      expect(world.hasTag(entity, 'type:box')).toBe(true);
      expect(world.hasTag(entity, 'name:myBox')).toBe(true);
    });

    it('Recurses into children', () => {
      const world = new World();
      const bus = new EventBus();
      const binder = new TraitBinder();
      const runner = new SceneRunner({ world, traitBinder: binder, eventBus: bus });

      runner.run(
        makeNode({
          id: 'root',
          type: 'group',
          children: [
            makeNode({ id: 'child1', type: 'box' }),
            makeNode({ id: 'child2', type: 'sphere' }),
          ],
        })
      );

      expect(runner.spawnedCount).toBe(3);
      expect(world.entityCount).toBe(3);
    });

    it('Binds traits from directives', () => {
      const world = new World();
      const bus = new EventBus();
      const binder = new TraitBinder();
      binder.register('grabbable', { name: 'grabbable' as any, defaultConfig: { mass: 1 } });

      const runner = new SceneRunner({ world, traitBinder: binder, eventBus: bus });
      const node = makeNode({
        id: 'item',
        type: 'box',
        directives: [{ name: 'grabbable', args: { mass: 5 } } as any],
      });

      const entity = runner.run(node);
      const traitComp = world.getComponent(entity, 'trait:grabbable');
      expect(traitComp).toEqual({ mass: 5 });
    });

    it('Emits events on instantiation', () => {
      const world = new World();
      const bus = new EventBus();
      const binder = new TraitBinder();
      const runner = new SceneRunner({ world, traitBinder: binder, eventBus: bus });

      const events: any[] = [];
      bus.on('node:instantiated', (data) => events.push(data));

      runner.run(makeNode({ id: 'ev-node', type: 'panel' }));

      expect(events).toHaveLength(1);
      expect(events[0].nodeId).toBe('ev-node');
    });

    it('Despawns all entities', () => {
      const world = new World();
      const bus = new EventBus();
      const binder = new TraitBinder();
      const runner = new SceneRunner({ world, traitBinder: binder, eventBus: bus });

      runner.run(makeNode({ id: 'a', children: [makeNode({ id: 'b' })] }));
      expect(world.entityCount).toBe(2);

      runner.despawnAll();
      expect(world.entityCount).toBe(0);
      expect(runner.spawnedCount).toBe(0);
    });

    it('Extracts position from properties', () => {
      const world = new World();
      const bus = new EventBus();
      const binder = new TraitBinder();
      const runner = new SceneRunner({ world, traitBinder: binder, eventBus: bus });

      const entity = runner.run(
        makeNode({
          id: 'pos-node',
          properties: { position: { x: 1, y: 2, z: 3 } },
        })
      );

      const transform = world.getComponent<any>(entity, 'transform');
      expect(transform.position).toEqual({ x: 1, y: 2, z: 3 });
    });
  });

  describe('RuntimeBridge', () => {
    it('Creates with all subsystems', () => {
      const rt = new RuntimeBridge();
      expect(rt.world).toBeDefined();
      expect(rt.eventBus).toBeDefined();
      expect(rt.themeEngine).toBeDefined();
      expect(rt.sceneRunner).toBeDefined();
      expect(rt.systemScheduler).toBeDefined();
    });

    it('Loads a scene from AST', () => {
      const rt = new RuntimeBridge();
      const rootEntity = rt.loadScene(
        makeNode({
          id: 'scene',
          type: 'scene',
          children: [makeNode({ id: 'obj1', type: 'box' })],
        })
      );

      expect(rt.world.hasEntity(rootEntity)).toBe(true);
      expect(rt.sceneRunner.spawnedCount).toBe(2);
    });

    it('Starts and stops', () => {
      const rt = new RuntimeBridge();
      expect(rt.isRunning()).toBe(false);
      rt.start();
      expect(rt.isRunning()).toBe(true);
      rt.stop();
      expect(rt.isRunning()).toBe(false);
    });

    it('Runs frame updates when started', () => {
      const rt = new RuntimeBridge({
        systems: [
          {
            name: 'test',
            priority: 0,
            enabled: true,
            requiredComponents: [],
            update: vi.fn(),
          },
        ],
      });

      rt.start();
      rt.update(0.016);
      expect(rt.getTotalTime()).toBeCloseTo(0.016);
    });

    it('Unloads scene and resets', () => {
      const rt = new RuntimeBridge();
      rt.loadScene(makeNode({ id: 'scene', type: 'scene' }));
      expect(rt.world.entityCount).toBe(1);

      rt.unloadScene();
      expect(rt.world.entityCount).toBe(0);
    });

    it('Emits scene lifecycle events', () => {
      const rt = new RuntimeBridge();
      const events: string[] = [];
      rt.eventBus.on('scene:loading', () => events.push('loading'));
      rt.eventBus.on('scene:loaded', () => events.push('loaded'));

      rt.loadScene(makeNode({ id: 'scene', type: 'scene' }));
      expect(events).toEqual(['loading', 'loaded']);
    });
  });
});
