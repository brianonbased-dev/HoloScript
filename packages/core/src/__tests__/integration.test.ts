import { describe, it, expect, vi } from 'vitest';
import { World } from '../ecs/World';
import { SystemScheduler } from '../ecs/SystemScheduler';
import { EventBus } from '../events/EventBus';
import { TraitBinder } from '../runtime/TraitBinder';
import { DirectiveProcessor } from '../runtime/DirectiveProcessor';
import { createIntegrationSystems, registerIntegrationSystems } from '../runtime/SystemIntegrator';

describe('Runtime Integration', () => {
  describe('SystemIntegrator', () => {
    it('Creates 6 built-in integration systems', () => {
      const bus = new EventBus();
      const systems = createIntegrationSystems(bus);
      expect(systems).toHaveLength(6);
      expect(systems.map((s) => s.name)).toContain('transform_propagation');
      expect(systems.map((s) => s.name)).toContain('animation_integration');
      expect(systems.map((s) => s.name)).toContain('state_machine_integration');
    });

    it('Systems are ordered by priority', () => {
      const bus = new EventBus();
      const systems = createIntegrationSystems(bus);
      for (let i = 1; i < systems.length; i++) {
        expect(systems[i].priority).toBeGreaterThanOrEqual(systems[i - 1].priority);
      }
    });

    it('Registers all systems with scheduler', () => {
      const bus = new EventBus();
      const scheduler = new SystemScheduler();
      registerIntegrationSystems(scheduler, bus);
      expect(scheduler.systemCount).toBe(6);
    });

    it('Transform propagation computes world positions', () => {
      const world = new World();
      const bus = new EventBus();
      const systems = createIntegrationSystems(bus);
      const transformSys = systems.find((s) => s.name === 'transform_propagation')!;

      const parent = world.createEntity();
      const child = world.createEntity();

      world.addComponent(parent, 'transform', { position: { x: 10, y: 0, z: 0 } });
      world.addComponent(child, 'transform', { position: { x: 5, y: 0, z: 0 } });
      world.addComponent(child, 'parent', { parentEntity: parent });

      transformSys.update(world, [child], 0.016);

      const childTransform = world.getComponent<any>(child, 'transform');
      expect(childTransform._worldX).toBe(15);
    });

    it('Render stats system emits visible count', () => {
      const world = new World();
      const bus = new EventBus();
      const systems = createIntegrationSystems(bus);
      const renderSys = systems.find((s) => s.name === 'renderable_cull')!;

      const e1 = world.createEntity();
      const e2 = world.createEntity();
      world.addComponent(e1, 'renderable', { visible: true });
      world.addComponent(e1, 'transform', {});
      world.addComponent(e2, 'renderable', { visible: false });
      world.addComponent(e2, 'transform', {});

      const handler = vi.fn();
      bus.on('render:stats', handler);

      renderSys.update(world, [e1, e2], 0.016);
      expect(handler).toHaveBeenCalledWith({ visibleCount: 1, totalCount: 2 });
    });
  });

  describe('DirectiveProcessor', () => {
    it('Categorizes trait directives', () => {
      const binder = new TraitBinder();
      binder.register('grabbable', { name: 'grabbable' as any, defaultConfig: {} });
      const processor = new DirectiveProcessor(binder);

      const result = processor.process([{ name: 'grabbable', args: { mass: 1 } }]);
      expect(result.traits).toHaveLength(1);
      expect(result.traits[0].category).toBe('trait');
    });

    it('Categorizes metadata directives', () => {
      const processor = new DirectiveProcessor(new TraitBinder());
      const result = processor.process([
        { name: 'version', args: { value: '1.0' } },
        { name: 'author', args: { value: 'brian' } },
      ]);
      expect(result.metadata).toHaveLength(2);
    });

    it('Categorizes control directives', () => {
      const processor = new DirectiveProcessor(new TraitBinder());
      const result = processor.process([{ name: 'if', args: { condition: 'isVR' } }]);
      expect(result.controls).toHaveLength(1);
    });

    it('Categorizes hook directives', () => {
      const processor = new DirectiveProcessor(new TraitBinder());
      const result = processor.process([{ name: 'on', args: { event: 'click' } }]);
      expect(result.hooks).toHaveLength(1);
    });

    it('Flags unknown directives as errors', () => {
      const processor = new DirectiveProcessor(new TraitBinder());
      const result = processor.process([{ name: 'nonexistent' }]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].valid).toBe(false);
    });

    it('Validates and returns error messages', () => {
      const processor = new DirectiveProcessor(new TraitBinder());
      const errors = processor.validate([
        { name: 'version' }, // valid
        { name: 'bogus' }, // invalid
      ]);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('@bogus');
    });
  });
});
