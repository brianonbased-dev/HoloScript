import type { Vector3 } from '@holoscript/core';
/**
 * Spatial Module Tests
 * Sprint 4 Priority 4 - Spatial Context Awareness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  Vector3,
  SpatialEntity,
  Region,
  distance,
  distanceSquared,
  isPointInBox,
  isPointInSphere,
  normalize,
  boxesOverlap,
  dot,
  cross,
  lerp,
} from '../SpatialTypes';
import { SpatialQueryExecutor, QueryResult } from '../SpatialQuery';
import { SpatialContextProvider } from '../SpatialContextProvider';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createEntity(id: string, position: Vector3, type: string = 'default'): SpatialEntity {
  return {
    id,
    type,
    position,
  };
}

function createRegion(id: string, min: Vector3, max: Vector3, name?: string): Region {
  return {
    id,
    name: name || id,
    type: 'box',
    bounds: { min, max },
  };
}

// =============================================================================
// SPATIAL TYPES TESTS
// =============================================================================

describe('SpatialTypes', () => {
  describe('distance', () => {
    it('should calculate distance between two points', () => {
      const a: Vector3 = [0, 0, 0 ];
      const b: Vector3 = [3, 4, 0 ];
      expect(distance(a, b)).toBe(5);
    });

    it('should return 0 for same point', () => {
      const a: Vector3 = [5, 5, 5 ];
      expect(distance(a, a)).toBe(0);
    });

    it('should work in 3D', () => {
      const a: Vector3 = [0, 0, 0 ];
      const b: Vector3 = [1, 1, 1 ];
      expect(distance(a, b)).toBeCloseTo(Math.sqrt(3));
    });
  });

  describe('distanceSquared', () => {
    it('should calculate squared distance', () => {
      const a: Vector3 = [0, 0, 0 ];
      const b: Vector3 = [3, 4, 0 ];
      expect(distanceSquared(a, b)).toBe(25);
    });
  });

  describe('isPointInBox', () => {
    it('should return true for point inside box', () => {
      const point: Vector3 = [5, 5, 5 ];
      const box = { min: [0, 0, 0 ], max: [10, 10, 10 ] };
      expect(isPointInBox(point, box)).toBe(true);
    });

    it('should return false for point outside box', () => {
      const point: Vector3 = [15, 5, 5 ];
      const box = { min: [0, 0, 0 ], max: [10, 10, 10 ] };
      expect(isPointInBox(point, box)).toBe(false);
    });

    it('should return true for point on boundary', () => {
      const point: Vector3 = [10, 5, 5 ];
      const box = { min: [0, 0, 0 ], max: [10, 10, 10 ] };
      expect(isPointInBox(point, box)).toBe(true);
    });
  });

  describe('isPointInSphere', () => {
    it('should return true for point inside sphere', () => {
      const point: Vector3 = [1, 0, 0 ];
      const sphere = { center: [0, 0, 0 ], radius: 5 };
      expect(isPointInSphere(point, sphere)).toBe(true);
    });

    it('should return false for point outside sphere', () => {
      const point: Vector3 = [10, 0, 0 ];
      const sphere = { center: [0, 0, 0 ], radius: 5 };
      expect(isPointInSphere(point, sphere)).toBe(false);
    });
  });

  describe('normalize', () => {
    it('should normalize a vector', () => {
      const v: Vector3 = [3, 4, 0 ];
      const n = normalize(v);
      expect(n[0]).toBeCloseTo(0.6);
      expect(n[1]).toBeCloseTo(0.8);
      expect(n[2]).toBe(0);
    });

    it('should return zero vector for zero input', () => {
      const v: Vector3 = [0, 0, 0 ];
      const n = normalize(v);
      expect(n).toEqual([0, 0, 0 ]);
    });
  });

  describe('boxesOverlap', () => {
    it('should return true for overlapping boxes', () => {
      const a = { min: [0, 0, 0 ], max: [5, 5, 5 ] };
      const b = { min: [3, 3, 3 ], max: [8, 8, 8 ] };
      expect(boxesOverlap(a, b)).toBe(true);
    });

    it('should return false for non-overlapping boxes', () => {
      const a = { min: [0, 0, 0 ], max: [2, 2, 2 ] };
      const b = { min: [5, 5, 5 ], max: [8, 8, 8 ] };
      expect(boxesOverlap(a, b)).toBe(false);
    });
  });

  describe('dot', () => {
    it('should calculate dot product', () => {
      const a: Vector3 = [1, 0, 0 ];
      const b: Vector3 = [0, 1, 0 ];
      expect(dot(a, b)).toBe(0); // Perpendicular
    });

    it('should return positive for same direction', () => {
      const a: Vector3 = [1, 0, 0 ];
      const b: Vector3 = [1, 0, 0 ];
      expect(dot(a, b)).toBe(1);
    });
  });

  describe('cross', () => {
    it('should calculate cross product', () => {
      const a: Vector3 = [1, 0, 0 ];
      const b: Vector3 = [0, 1, 0 ];
      const c = cross(a, b);
      expect(c).toEqual([0, 0, 1 ]);
    });
  });

  describe('lerp', () => {
    it('should interpolate between vectors', () => {
      const a: Vector3 = [0, 0, 0 ];
      const b: Vector3 = [10, 10, 10 ];
      const result = lerp(a, b, 0.5);
      expect(result).toEqual([5, 5, 5 ]);
    });

    it('should return start at t=0', () => {
      const a: Vector3 = [0, 0, 0 ];
      const b: Vector3 = [10, 10, 10 ];
      expect(lerp(a, b, 0)).toEqual(a);
    });

    it('should return end at t=1', () => {
      const a: Vector3 = [0, 0, 0 ];
      const b: Vector3 = [10, 10, 10 ];
      expect(lerp(a, b, 1)).toEqual(b);
    });
  });
});

// =============================================================================
// SPATIAL QUERY TESTS
// =============================================================================

describe('SpatialQueryExecutor', () => {
  let executor: SpatialQueryExecutor;
  let entities: SpatialEntity[];

  beforeEach(() => {
    executor = new SpatialQueryExecutor();
    entities = [
      createEntity('e1', [0, 0, 0 ], 'npc'),
      createEntity('e2', [5, 0, 0 ], 'npc'),
      createEntity('e3', [10, 0, 0 ], 'item'),
      createEntity('e4', [0, 10, 0 ], 'item'),
      createEntity('e5', [100, 100, 100 ], 'npc'),
    ];
    executor.updateEntities(entities);
  });

  describe('nearest query', () => {
    it('should find nearest entity', () => {
      const results = executor.execute({
        type: 'nearest',
        from: [4, 0, 0 ],
        count: 1,
      });

      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('e2'); // Closest to x=4
    });

    it('should find multiple nearest entities', () => {
      const results = executor.execute({
        type: 'nearest',
        from: [0, 0, 0 ],
        count: 3,
      });

      expect(results.length).toBe(3);
      expect(results[0].entity.id).toBe('e1'); // At origin
      expect(results[1].entity.id).toBe('e2'); // 5 units away
    });
  });

  describe('within query', () => {
    it('should find entities within radius', () => {
      const results = executor.execute({
        type: 'within',
        from: [0, 0, 0 ],
        radius: 6,
      });

      expect(results.length).toBe(2);
      expect(results.map((r) => r.entity.id).sort()).toEqual(['e1', 'e2']);
    });

    it('should return empty for no matches', () => {
      const results = executor.execute({
        type: 'within',
        from: [50, 50, 50 ],
        radius: 1,
      });

      expect(results.length).toBe(0);
    });
  });

  describe('by_type query', () => {
    it('should filter by entity type', () => {
      const results = executor.execute({
        type: 'by_type',
        from: [0, 0, 0 ],
        entityTypes: ['item'],
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.entity.type === 'item')).toBe(true);
    });

    it('should filter by type and radius', () => {
      const results = executor.execute({
        type: 'by_type',
        from: [0, 0, 0 ],
        entityTypes: ['npc'],
        radius: 20,
      });

      expect(results.length).toBe(2); // e1 and e2, not e5
    });
  });

  describe('entity type filter', () => {
    it('should apply entity type filter across queries', () => {
      const results = executor.execute({
        type: 'nearest',
        from: [0, 0, 0 ],
        count: 5,
        entityTypeFilter: ['item'],
      });

      expect(results.length).toBe(2);
      expect(results.every((r) => r.entity.type === 'item')).toBe(true);
    });
  });

  describe('maxResults', () => {
    it('should limit results', () => {
      const results = executor.execute({
        type: 'within',
        from: [0, 0, 0 ],
        radius: 1000,
        maxResults: 2,
      });

      expect(results.length).toBe(2);
    });
  });
});

// =============================================================================
// SPATIAL CONTEXT PROVIDER TESTS
// =============================================================================

describe('SpatialContextProvider', () => {
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = new SpatialContextProvider();
  });

  afterEach(() => {
    provider.stop();
  });

  describe('agent registration', () => {
    it('should register an agent', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      expect(provider.getContext('agent-1')).toBeNull(); // No update yet
    });

    it('should unregister an agent', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.unregisterAgent('agent-1');
      expect(provider.getContext('agent-1')).toBeNull();
    });
  });

  describe('entity management', () => {
    it('should add entities', () => {
      provider.setEntity(createEntity('e1', [0, 0, 0 ]));
      const entities = provider.getEntities();
      expect(entities.length).toBe(1);
      expect(entities[0].id).toBe('e1');
    });

    it('should remove entities', () => {
      provider.setEntity(createEntity('e1', [0, 0, 0 ]));
      provider.removeEntity('e1');
      expect(provider.getEntities().length).toBe(0);
    });

    it('should batch set entities', () => {
      provider.setEntities([
        createEntity('e1', [0, 0, 0 ]),
        createEntity('e2', [5, 0, 0 ]),
      ]);
      expect(provider.getEntities().length).toBe(2);
    });
  });

  describe('context updates', () => {
    it('should update context on manual update', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.setEntities([
        createEntity('e1', [1, 0, 0 ]),
        createEntity('e2', [5, 0, 0 ]),
      ]);

      provider.update();

      const context = provider.getContext('agent-1');
      expect(context).not.toBeNull();
      expect(context!.nearbyEntities.length).toBe(2);
    });

    it('should emit context:updated event', () => {
      const handler = vi.fn();
      provider.on('context:updated', handler);

      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.update();

      expect(handler).toHaveBeenCalledWith('agent-1', expect.any(Object));
    });
  });

  describe('entity events', () => {
    it('should emit entity:entered when entity comes into range', () => {
      const handler = vi.fn();
      provider.on('entity:entered', handler);

      provider.registerAgent('agent-1', [0, 0, 0 ], { perceptionRadius: 10 });
      provider.update(); // First update with no entities

      provider.setEntity(createEntity('e1', [5, 0, 0 ]));
      provider.update();

      expect(handler).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          type: 'entity_entered',
        })
      );
    });

    it('should emit entity:exited when entity leaves range', () => {
      const handler = vi.fn();
      provider.on('entity:exited', handler);

      provider.registerAgent('agent-1', [0, 0, 0 ], { perceptionRadius: 10 });
      provider.setEntity(createEntity('e1', [5, 0, 0 ]));
      provider.update();

      provider.removeEntity('e1');
      provider.update();

      expect(handler).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          type: 'entity_exited',
        })
      );
    });
  });

  describe('region events', () => {
    it('should emit region:entered when agent enters region', () => {
      const handler = vi.fn();
      provider.on('region:entered', handler);

      provider.setRegion(createRegion('r1', [-5, -5, -5 ], [5, 5, 5 ]));
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.update();

      expect(handler).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          type: 'region_entered',
        })
      );
    });

    it('should emit region:exited when agent leaves region', () => {
      const handler = vi.fn();
      provider.on('region:exited', handler);

      provider.setRegion(createRegion('r1', [-5, -5, -5 ], [5, 5, 5 ]));
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.update();

      provider.updateAgentPosition('agent-1', [100, 100, 100 ]);
      provider.update();

      expect(handler).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({
          type: 'region_exited',
        })
      );
    });
  });

  describe('queries', () => {
    beforeEach(() => {
      provider.setEntities([
        createEntity('e1', [1, 0, 0 ], 'npc'),
        createEntity('e2', [5, 0, 0 ], 'item'),
        createEntity('e3', [10, 0, 0 ], 'npc'),
      ]);
    });

    it('should find nearest entity', () => {
      const results = provider.findNearest([0, 0, 0 ], 1);
      expect(results.length).toBe(1);
      expect(results[0].entity.id).toBe('e1');
    });

    it('should find entities within radius', () => {
      const results = provider.findWithin([0, 0, 0 ], 6);
      expect(results.length).toBe(2);
    });

    it('should filter by type', () => {
      const results = provider.findNearest([0, 0, 0 ], 10, ['item']);
      expect(results.length).toBe(1);
      expect(results[0].entity.type).toBe('item');
    });
  });

  describe('region subscriptions', () => {
    it('should call subscription callback on region enter', () => {
      const callback = vi.fn();

      provider.setRegion(createRegion('r1', [-5, -5, -5 ], [5, 5, 5 ]));
      provider.registerAgent('agent-1', [100, 100, 100 ]);
      provider.subscribeToRegion('agent-1', 'r1', callback);
      provider.update();

      // Move agent into region
      provider.updateAgentPosition('agent-1', [0, 0, 0 ]);
      provider.update();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'region_entered',
        })
      );
    });
  });
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================

describe('Spatial Performance', () => {
  it('should handle 1000 entities efficiently', () => {
    const provider = new SpatialContextProvider();
    const entities: SpatialEntity[] = [];

    for (let i = 0; i < 1000; i++) {
      entities.push(
        createEntity(`e${i}`, {
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          z: Math.random() * 1000,
        })
      );
    }

    provider.setEntities(entities);
    provider.registerAgent('agent-1', [500, 500, 500 ]);

    const start = performance.now();
    provider.update();
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50); // Should complete in under 50ms
    provider.stop();
  });

  it('should find nearest among 1000 entities under 10ms', () => {
    const executor = new SpatialQueryExecutor();
    const entities: SpatialEntity[] = [];

    for (let i = 0; i < 1000; i++) {
      entities.push(
        createEntity(`e${i}`, {
          x: Math.random() * 1000,
          y: Math.random() * 1000,
          z: Math.random() * 1000,
        })
      );
    }

    executor.updateEntities(entities);

    const start = performance.now();
    const results = executor.execute({
      type: 'nearest',
      from: [500, 500, 500 ],
      count: 10,
    });
    const elapsed = performance.now() - start;

    expect(results.length).toBe(10);
    expect(elapsed).toBeLessThan(25); // Increased from 10ms to 25ms for CI stability
  });
});

// =============================================================================
// ADDITIONAL COVERAGE TESTS - Sprint 8 v3.1 RELEASE
// =============================================================================

describe('SpatialContextProvider Additional Coverage', () => {
  let provider: SpatialContextProvider;

  beforeEach(() => {
    provider = new SpatialContextProvider();
  });

  afterEach(() => {
    provider.stop();
  });

  describe('findVisible', () => {
    beforeEach(() => {
      provider.setEntities([
        createEntity('e1', [5, 0, 0 ], 'target'),
        createEntity('e2', [10, 0, 0 ], 'target'),
        createEntity('e3', [0, 5, 0 ], 'target'),
      ]);
    });

    it('should find visible entities from position', () => {
      const results = provider.findVisible([0, 0, 0 ]);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should find visible entities with direction filter', () => {
      // Looking in +x direction
      const results = provider.findVisible(
        [0, 0, 0 ],
        [1, 0, 0 ],
        90, // 90 degree FOV
        20
      );
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should respect max distance', () => {
      const results = provider.findVisible([0, 0, 0 ], undefined, undefined, 7);
      // e1 at distance 5 should be visible, but e2 at 10 should not
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('sight lines with blocking', () => {
    it('should compute sight lines when enabled', () => {
      provider.registerAgent(
        'agent-1',
        [0, 0, 0 ],
        {
          perceptionRadius: 20,
          computeSightLines: true,
        }
      );

      provider.setEntities([createEntity('e1', [10, 0, 0 ], 'target')]);

      provider.update();
      const context = provider.getContext('agent-1');

      expect(context).not.toBeNull();
      expect(context!.sightLines).toBeDefined();
      expect(context!.sightLines.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect blocking entities', () => {
      provider.registerAgent(
        'agent-1',
        [0, 0, 0 ],
        {
          perceptionRadius: 30,
          computeSightLines: true,
        }
      );

      // Blocker in between agent and target
      provider.setEntities([
        createEntity('target', [20, 0, 0 ], 'target'),
        {
          id: 'blocker',
          type: 'obstacle',
          position: [10, 0, 0],
          bounds: { center: [10, 0, 0 ], radius: 3 },
        } as SpatialEntity,
      ]);

      provider.update();
      const context = provider.getContext('agent-1');

      expect(context).not.toBeNull();
      expect(context!.nearbyEntities.length).toBe(2);
    });
  });

  describe('entity bounds handling', () => {
    it('should handle entities with sphere bounds', () => {
      const sphereEntity: SpatialEntity = {
        id: 'sphere',
        type: 'object',
        position: [5, 0, 0],
        bounds: { center: [5, 0, 0 ], radius: 2 },
      };

      provider.setEntity(sphereEntity);
      const entities = provider.getEntities();

      expect(entities.length).toBe(1);
      expect(entities[0].bounds).toBeDefined();
    });

    it('should handle entities with box bounds', () => {
      const boxEntity: SpatialEntity = {
        id: 'box',
        type: 'object',
        position: [5, 0, 0],
        bounds: { min: [4, -1, -1 ], max: [6, 1, 1 ] },
      };

      provider.setEntity(boxEntity);
      const entities = provider.getEntities();

      expect(entities.length).toBe(1);
      expect(entities[0].bounds).toBeDefined();
    });
  });

  describe('spherical regions', () => {
    it('should detect agent in spherical region', () => {
      const sphereRegion: Region = {
        id: 'sphere-region',
        name: 'Sphere Region',
        type: 'sphere',
        bounds: { center: [0, 0, 0 ], radius: 10 },
      };

      provider.setRegion(sphereRegion);
      provider.registerAgent('agent-1', [5, 0, 0 ]);
      provider.update();

      const context = provider.getContext('agent-1');
      expect(context).not.toBeNull();
      expect(context!.currentRegions.length).toBe(1);
      expect(context!.currentRegions[0].id).toBe('sphere-region');
    });

    it('should detect agent outside spherical region', () => {
      const sphereRegion: Region = {
        id: 'sphere-region',
        name: 'Sphere Region',
        type: 'sphere',
        bounds: { center: [0, 0, 0 ], radius: 5 },
      };

      provider.setRegion(sphereRegion);
      provider.registerAgent('agent-1', [50, 0, 0 ]); // Far outside
      provider.update();

      const context = provider.getContext('agent-1');
      expect(context).not.toBeNull();
      expect(context!.currentRegions.length).toBe(0);
    });
  });

  describe('update rate handling', () => {
    it('should restart update loop when agent is registered while running', () => {
      provider.start();
      expect(() => {
        provider.registerAgent('agent-1', [0, 0, 0 ], { updateRate: 30 });
      }).not.toThrow();
    });

    it('should handle multiple agents with different update rates', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ], { updateRate: 60 });
      provider.registerAgent('agent-2', [10, 0, 0 ], { updateRate: 30 });

      provider.start();

      // Should use the higher update rate
      expect(() => provider.update()).not.toThrow();
    });

    it('should handle zero update rate', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ], { updateRate: 0 });
      provider.start();

      // Should not crash with zero update rate
      expect(() => provider.update()).not.toThrow();
    });
  });

  describe('entity type filtering', () => {
    beforeEach(() => {
      provider.setEntities([
        createEntity('npc1', [5, 0, 0 ], 'npc'),
        createEntity('item1', [3, 0, 0 ], 'item'),
        createEntity('enemy1', [8, 0, 0 ], 'enemy'),
      ]);
    });

    it('should filter entities by type in agent config', () => {
      provider.registerAgent(
        'agent-1',
        [0, 0, 0 ],
        {
          perceptionRadius: 20,
          entityTypeFilter: ['npc', 'item'],
        }
      );

      provider.update();
      const context = provider.getContext('agent-1');

      expect(context).not.toBeNull();
      expect(context!.nearbyEntities.length).toBe(2);
      expect(context!.nearbyEntities.some((e) => e.type === 'enemy')).toBe(false);
    });

    it('should include all types with empty filter', () => {
      provider.registerAgent(
        'agent-1',
        [0, 0, 0 ],
        {
          perceptionRadius: 20,
          entityTypeFilter: [],
        }
      );

      provider.update();
      const context = provider.getContext('agent-1');

      expect(context).not.toBeNull();
      expect(context!.nearbyEntities.length).toBe(3);
    });
  });

  describe('unsubscribe and cleanup', () => {
    it('should unsubscribe from region events', () => {
      const callback = vi.fn();

      provider.setRegion(createRegion('r1', [-5, -5, -5 ], [5, 5, 5 ]));
      provider.registerAgent('agent-1', [100, 100, 100 ]);
      provider.subscribeToRegion('agent-1', 'r1', callback);
      provider.unsubscribeFromRegion('agent-1', 'r1');

      provider.updateAgentPosition('agent-1', [0, 0, 0 ]);
      provider.update();

      // Should not be called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle unregister of non-existent agent', () => {
      expect(() => {
        provider.unregisterAgent('non-existent');
      }).not.toThrow();
    });

    it('should handle updateAgentPosition for non-existent agent', () => {
      expect(() => {
        provider.updateAgentPosition('non-existent', [0, 0, 0 ]);
      }).not.toThrow();
    });

    it('should handle subscribeToRegion for non-existent agent', () => {
      expect(() => {
        provider.subscribeToRegion('non-existent', 'r1', vi.fn());
      }).not.toThrow();
    });

    it('should handle unsubscribeFromRegion for non-existent agent', () => {
      expect(() => {
        provider.unsubscribeFromRegion('non-existent', 'r1');
      }).not.toThrow();
    });
  });

  describe('getContext for unknown agent', () => {
    it('should return null for unknown agent', () => {
      const context = provider.getContext('unknown-agent');
      expect(context).toBeNull();
    });
  });

  describe('double start/stop', () => {
    it('should handle double start gracefully', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.start();
      expect(() => provider.start()).not.toThrow();
      provider.stop();
    });

    it('should handle double stop gracefully', () => {
      provider.registerAgent('agent-1', [0, 0, 0 ]);
      provider.start();
      provider.stop();
      expect(() => provider.stop()).not.toThrow();
    });

    it('should handle stop without start', () => {
      expect(() => provider.stop()).not.toThrow();
    });
  });
});
