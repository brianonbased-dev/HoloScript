import { describe, it, expect } from 'vitest';
import { createIntegrationSystems } from '../SystemIntegrator';
import { EventBus } from '../../events/EventBus';

describe('SystemIntegrator', () => {
  // ---- createIntegrationSystems ----

  it('returns array of ECS systems', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    expect(Array.isArray(systems)).toBe(true);
    expect(systems.length).toBeGreaterThan(0);
  });

  it('systems have expected names', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    const names = systems.map(s => s.name);
    expect(names).toContain('transform_propagation');
    expect(names).toContain('animation_integration');
    expect(names).toContain('state_machine_integration');
    expect(names).toContain('particle_integration');
    expect(names).toContain('network_sync_integration');
    expect(names).toContain('renderable_cull');
  });

  it('systems have update functions', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    for (const sys of systems) {
      expect(typeof sys.update).toBe('function');
    }
  });

  it('systems have priority ordering', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    const transform = systems.find(s => s.name === 'transform_propagation')!;
    const renderable = systems.find(s => s.name === 'renderable_cull')!;
    expect(transform.priority).toBeLessThan(renderable.priority);
  });

  it('all systems are enabled', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    for (const sys of systems) {
      expect(sys.enabled).toBe(true);
    }
  });

  it('systems have requiredComponents', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    const transform = systems.find(s => s.name === 'transform_propagation')!;
    expect(transform.requiredComponents).toContain('transform');
    expect(transform.requiredComponents).toContain('parent');
  });

  it('network sync integration emits events', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    const netSync = systems.find(s => s.name === 'network_sync_integration')!;
    expect(netSync).toBeDefined();
    expect(netSync.requiredComponents).toContain('trait:sync');
  });

  it('renderable cull emits render:stats', () => {
    const eventBus = new EventBus();
    const systems = createIntegrationSystems(eventBus);
    const cull = systems.find(s => s.name === 'renderable_cull')!;
    expect(cull.requiredComponents).toContain('renderable');
    expect(cull.requiredComponents).toContain('transform');
  });
});
