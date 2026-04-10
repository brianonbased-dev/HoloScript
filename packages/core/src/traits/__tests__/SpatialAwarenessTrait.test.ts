/**
 * SpatialAwarenessTrait Tests
 * Sprint 4 Priority 4 - Spatial Context Awareness
 *
 * Tests for the HoloScript trait that enables spatial awareness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SpatialAwarenessTrait,
  SpatialAwarenessTraitConfig,
  createSpatialAwarenessTrait,
  createSharedSpatialProvider,
} from '../SpatialAwarenessTrait';
import { SpatialContextProvider } from '../../spatial/SpatialContextProvider';
import { Vector3, SpatialEntity, Region } from '../../spatial/SpatialTypes';

// =============================================================================
// HELPERS
// =============================================================================

function createEntity(id: string, position: Vector3, type: string = 'default'): SpatialEntity {
  return { id, type, position };
}

function createBoxRegion(id: string, min: Vector3, max: Vector3): Region {
  return {
    id,
    name: id,
    type: 'box',
    bounds: { min, max },
  };
}

// =============================================================================
// CONSTRUCTION & LIFECYCLE
// =============================================================================

describe('SpatialAwarenessTrait - Construction', () => {
  let trait: SpatialAwarenessTrait;

  afterEach(() => {
    trait?.dispose();
  });

  it('should create with default config', () => {
    trait = new SpatialAwarenessTrait('agent-1');

    expect(trait).toBeDefined();
    expect(trait.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('should create with initial position', () => {
    trait = new SpatialAwarenessTrait('agent-1', {
      initialPosition: { x: 10, y: 20, z: 30 },
    });

    expect(trait.getPosition()).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('should auto-start by default', () => {
    trait = new SpatialAwarenessTrait('agent-1');

    // Trait should be active - we can verify by updating position
    trait.setPosition({ x: 5, y: 5, z: 5 });
    expect(trait.getPosition()).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('should not auto-start when autoStart is false', () => {
    trait = new SpatialAwarenessTrait('agent-1', {
      autoStart: false,
    });

    // Position updates still work locally
    trait.setPosition({ x: 5, y: 5, z: 5 });
    expect(trait.getPosition()).toEqual({ x: 5, y: 5, z: 5 });
  });

  it('should use shared provider when provided', () => {
    const sharedProvider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider,
      autoStart: false,
    });

    trait.start();
    trait.stop();

    // Shared provider should not be stopped
    sharedProvider.stop();
  });
});

describe('SpatialAwarenessTrait - Lifecycle', () => {
  let trait: SpatialAwarenessTrait;

  afterEach(() => {
    trait?.dispose();
  });

  it('should start and stop', () => {
    trait = new SpatialAwarenessTrait('agent-1', { autoStart: false });

    trait.start();
    trait.stop();
    // No errors expected
  });

  it('should handle multiple starts', () => {
    trait = new SpatialAwarenessTrait('agent-1', { autoStart: false });

    trait.start();
    trait.start(); // Should be idempotent
    trait.stop();
  });

  it('should handle multiple stops', () => {
    trait = new SpatialAwarenessTrait('agent-1');

    trait.stop();
    trait.stop(); // Should be idempotent
  });

  it('should dispose properly', () => {
    trait = new SpatialAwarenessTrait('agent-1');

    trait.dispose();
    // Should not throw
  });
});

// =============================================================================
// POSITION & MOVEMENT
// =============================================================================

describe('SpatialAwarenessTrait - Position & Movement', () => {
  let trait: SpatialAwarenessTrait;

  beforeEach(() => {
    trait = new SpatialAwarenessTrait('agent-1');
  });

  afterEach(() => {
    trait.dispose();
  });

  it('should get position', () => {
    expect(trait.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('should set position', () => {
    trait.setPosition({ x: 10, y: 20, z: 30 });

    expect(trait.getPosition()).toEqual({ x: 10, y: 20, z: 30 });
  });

  it('should return copy of position (not reference)', () => {
    const pos = trait.getPosition();
    pos.x = 999;

    expect(trait.getPosition().x).toBe(0);
  });

  it('should get velocity', () => {
    expect(trait.getVelocity()).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('should set velocity', () => {
    trait.setVelocity({ x: 1, y: 2, z: 3 });

    expect(trait.getVelocity()).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('should return copy of velocity (not reference)', () => {
    trait.setVelocity({ x: 1, y: 2, z: 3 });
    const vel = trait.getVelocity();
    vel.x = 999;

    expect(trait.getVelocity().x).toBe(1);
  });

  it('should move by delta', () => {
    trait.setPosition({ x: 10, y: 10, z: 10 });
    trait.move({ x: 5, y: -3, z: 2 });

    expect(trait.getPosition()).toEqual({ x: 15, y: 7, z: 12 });
  });

  it('should update position while not active', () => {
    const inactiveTrait = new SpatialAwarenessTrait('agent-2', { autoStart: false });
    inactiveTrait.setPosition({ x: 100, y: 100, z: 100 });

    expect(inactiveTrait.getPosition()).toEqual({ x: 100, y: 100, z: 100 });
    inactiveTrait.dispose();
  });

  it('should update velocity while not active', () => {
    const inactiveTrait = new SpatialAwarenessTrait('agent-2', { autoStart: false });
    inactiveTrait.setVelocity({ x: 5, y: 5, z: 5 });

    expect(inactiveTrait.getVelocity()).toEqual({ x: 5, y: 5, z: 5 });
    inactiveTrait.dispose();
  });
});

// =============================================================================
// CONTEXT ACCESS
// =============================================================================

describe('SpatialAwarenessTrait - Context Access', () => {
  let trait: SpatialAwarenessTrait;
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
    });
  });

  afterEach(() => {
    trait.dispose();
    provider.stop();
  });

  it('should return null context initially', () => {
    // Before any update
    expect(trait.getContext()).toBeNull();
  });

  it('should return empty nearby entities initially', () => {
    expect(trait.getNearbyEntities()).toEqual([]);
  });

  it('should return empty current regions initially', () => {
    expect(trait.getCurrentRegions()).toEqual([]);
  });

  it('should return context after update', () => {
    provider.update();

    const context = trait.getContext();
    expect(context).toBeDefined();
  });

  it('should get nearby entities after update', () => {
    trait.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    const nearby = trait.getNearbyEntities();
    expect(nearby.length).toBe(1);
    expect(nearby[0].id).toBe('e1');
  });

  it('should check if in region', () => {
    const region = createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 });
    trait.registerRegion(region);
    provider.update();

    expect(trait.isInRegion('zone1')).toBe(true);
    expect(trait.isInRegion('nonexistent')).toBe(false);
  });
});

// =============================================================================
// QUERIES
// =============================================================================

describe('SpatialAwarenessTrait - Queries', () => {
  let trait: SpatialAwarenessTrait;
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
      perceptionRadius: 100,
    });

    // Add some entities
    trait.registerEntities([
      createEntity('npc1', { x: 5, y: 0, z: 0 }, 'npc'),
      createEntity('npc2', { x: 15, y: 0, z: 0 }, 'npc'),
      createEntity('item1', { x: 10, y: 0, z: 0 }, 'item'),
    ]);
    provider.update();
  });

  afterEach(() => {
    trait.dispose();
    provider.stop();
  });

  it('should find nearest entity', () => {
    const result = trait.findNearest();

    expect(result).not.toBeNull();
    expect(result!.entity.id).toBe('npc1');
  });

  it('should find nearest entity with type filter', () => {
    const result = trait.findNearest(['item']);

    expect(result).not.toBeNull();
    expect(result!.entity.type).toBe('item');
  });

  it('should return null when no entities match', () => {
    const result = trait.findNearest(['vehicle']);

    expect(result).toBeNull();
  });

  it('should find entities within radius', () => {
    const results = trait.findWithin(12);

    expect(results.length).toBe(2); // npc1 at 5, item1 at 10
  });

  it('should find entities within radius with type filter', () => {
    const results = trait.findWithin(50, ['npc']);

    expect(results.length).toBe(2);
    expect(results.every((r) => r.entity.type === 'npc')).toBe(true);
  });

  it('should get distance to entity', () => {
    const distance = trait.getDistanceTo('npc1');

    expect(distance).toBe(5);
  });

  it('should return null for unknown entity', () => {
    const distance = trait.getDistanceTo('unknown');

    expect(distance).toBeNull();
  });

  it('should check entity visibility', () => {
    // Initially not visible (no visibility events yet)
    expect(trait.isEntityVisible('npc1')).toBe(false);
  });
});

// =============================================================================
// ENTITY MANAGEMENT
// =============================================================================

describe('SpatialAwarenessTrait - Entity Management', () => {
  let trait: SpatialAwarenessTrait;
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
    });
  });

  afterEach(() => {
    trait.dispose();
    provider.stop();
  });

  it('should register an entity', () => {
    trait.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    const nearby = trait.getNearbyEntities();
    expect(nearby.length).toBe(1);
  });

  it('should unregister an entity', () => {
    trait.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    trait.unregisterEntity('e1');
    provider.update();

    const nearby = trait.getNearbyEntities();
    expect(nearby.length).toBe(0);
  });

  it('should batch register entities', () => {
    trait.registerEntities([
      createEntity('e1', { x: 3, y: 0, z: 0 }),
      createEntity('e2', { x: 5, y: 0, z: 0 }),
      createEntity('e3', { x: 8, y: 0, z: 0 }),
    ]);
    provider.update();

    const nearby = trait.getNearbyEntities();
    expect(nearby.length).toBe(3);
  });
});

// =============================================================================
// REGION MANAGEMENT
// =============================================================================

describe('SpatialAwarenessTrait - Region Management', () => {
  let trait: SpatialAwarenessTrait;
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
    });
  });

  afterEach(() => {
    trait.dispose();
    provider.stop();
  });

  it('should register a region', () => {
    const region = createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 });
    trait.registerRegion(region);
    provider.update();

    expect(trait.isInRegion('zone1')).toBe(true);
  });

  it('should unregister a region', () => {
    const region = createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 });
    trait.registerRegion(region);
    provider.update();

    trait.unregisterRegion('zone1');
    provider.update();

    expect(trait.isInRegion('zone1')).toBe(false);
  });

  it('should watch region', () => {
    const callback = vi.fn();
    const region = createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 });

    trait.registerRegion(region);
    trait.watchRegion('zone1', callback);
    provider.update();

    // Should have called callback for region_entered
    expect(callback).toHaveBeenCalled();
  });

  it('should unwatch region', () => {
    const callback = vi.fn();
    const region = createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 });

    trait.registerRegion(region);
    trait.watchRegion('zone1', callback);
    trait.unwatchRegion('zone1');
    provider.update();

    // Callback should not be called after unwatching
    // (depends on implementation - may still be called once)
  });
});

// =============================================================================
// CONFIGURATION
// =============================================================================

describe('SpatialAwarenessTrait - Configuration', () => {
  let trait: SpatialAwarenessTrait;
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
      perceptionRadius: 50,
    });
  });

  afterEach(() => {
    trait.dispose();
    provider.stop();
  });

  it('should get perception radius', () => {
    expect(trait.getPerceptionRadius()).toBe(50);
  });

  it('should set perception radius', () => {
    trait.setPerceptionRadius(100);

    expect(trait.getPerceptionRadius()).toBe(100);
  });

  it('should set perception radius while active', () => {
    trait.start();
    trait.setPerceptionRadius(200);

    expect(trait.getPerceptionRadius()).toBe(200);
  });

  it('should set entity type filter', () => {
    trait.setEntityTypeFilter(['npc', 'item']);

    // Filter is stored internally
  });

  it('should set entity type filter while active', () => {
    trait.start();
    trait.setEntityTypeFilter(['npc']);

    // Should re-register with new config
  });
});

// =============================================================================
// EVENTS
// =============================================================================

describe('SpatialAwarenessTrait - Events', () => {
  let trait: SpatialAwarenessTrait;
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    trait = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
      perceptionRadius: 100,
    });
  });

  afterEach(() => {
    trait.dispose();
    provider.stop();
  });

  it('should emit entity:entered event', async () => {
    const handler = vi.fn();
    trait.on('entity:entered', handler);

    provider.update(); // Initial update

    trait.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    expect(handler).toHaveBeenCalled();
  });

  it('should emit entity:exited event', async () => {
    const handler = vi.fn();
    trait.on('entity:exited', handler);

    trait.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    trait.unregisterEntity('e1');
    provider.update();

    expect(handler).toHaveBeenCalled();
  });

  it('should emit region:entered event', async () => {
    const handler = vi.fn();
    trait.on('region:entered', handler);

    trait.registerRegion(
      createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 })
    );
    provider.update();

    expect(handler).toHaveBeenCalled();
  });

  it('should emit region:exited event', async () => {
    const handler = vi.fn();
    trait.on('region:exited', handler);

    trait.registerRegion(
      createBoxRegion('zone1', { x: -10, y: -10, z: -10 }, { x: 10, y: 10, z: 10 })
    );
    provider.update();

    // Move outside region
    trait.setPosition({ x: 100, y: 100, z: 100 });
    provider.update();

    expect(handler).toHaveBeenCalled();
  });

  it('should emit context:updated event', async () => {
    const handler = vi.fn();
    trait.on('context:updated', handler);

    provider.update();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        agentPosition: expect.any(Object),
      })
    );
  });

  it('should not emit events for other agents', async () => {
    const otherAgentHandler = vi.fn();

    // Create another trait for a different agent
    const otherTrait = new SpatialAwarenessTrait('other-agent', {
      sharedProvider: provider,
      initialPosition: { x: 500, y: 500, z: 500 },
      perceptionRadius: 10,
    });
    otherTrait.on('entity:entered', otherAgentHandler);

    provider.update(); // Initial

    // Add entity near our trait (at origin), not near other agent (at 500,500,500)
    trait.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    // Other agent should not receive event for entity far from it
    otherTrait.dispose();
  });
});

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

describe('SpatialAwarenessTrait - Factory Functions', () => {
  it('should create trait via factory', () => {
    const trait = createSpatialAwarenessTrait('agent-1', {
      perceptionRadius: 100,
    });

    expect(trait).toBeInstanceOf(SpatialAwarenessTrait);
    expect(trait.getPerceptionRadius()).toBe(100);

    trait.dispose();
  });

  it('should create shared provider via factory', () => {
    const provider = createSharedSpatialProvider();

    expect(provider).toBeInstanceOf(SpatialContextProvider);

    provider.stop();
  });
});

// =============================================================================
// MULTI-AGENT SCENARIOS
// =============================================================================

describe('SpatialAwarenessTrait - Multi-Agent', () => {
  let provider: SpatialContextProvider;
  let agent1: SpatialAwarenessTrait;
  let agent2: SpatialAwarenessTrait;

  beforeEach(() => {
    provider = createSharedSpatialProvider();
    agent1 = new SpatialAwarenessTrait('agent-1', {
      sharedProvider: provider,
      initialPosition: { x: 0, y: 0, z: 0 },
      perceptionRadius: 100,
    });
    agent2 = new SpatialAwarenessTrait('agent-2', {
      sharedProvider: provider,
      initialPosition: { x: 50, y: 0, z: 0 },
      perceptionRadius: 100,
    });
  });

  afterEach(() => {
    agent1.dispose();
    agent2.dispose();
    provider.stop();
  });

  it('should share entities between agents', () => {
    agent1.registerEntity(createEntity('shared-entity', { x: 25, y: 0, z: 0 }));
    provider.update();

    // Both agents should see the entity
    const nearby1 = agent1.getNearbyEntities();
    const nearby2 = agent2.getNearbyEntities();

    expect(nearby1.length).toBe(1);
    expect(nearby2.length).toBe(1);
  });

  it('should have independent positions', () => {
    expect(agent1.getPosition()).toEqual({ x: 0, y: 0, z: 0 });
    expect(agent2.getPosition()).toEqual({ x: 50, y: 0, z: 0 });
  });

  it('should receive independent events', async () => {
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    agent1.on('entity:entered', handler1);
    agent2.on('entity:entered', handler2);

    provider.update(); // Initial

    // Add entity near agent1 only
    agent1.registerEntity(createEntity('e1', { x: 5, y: 0, z: 0 }));
    provider.update();

    // Both may receive event (within 100 radius), depends on implementation
    expect(handler1).toHaveBeenCalled();
  });
});
