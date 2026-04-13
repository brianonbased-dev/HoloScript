/**
 * SpatiotemporalTraits Tests
 *
 * Tests for the runtime trait handlers:
 * - spatialTemporalAdjacentHandler  (duration-constrained adjacency)
 * - spatialTemporalReachableHandler (velocity-predicted reachability)
 * - spatialTrajectoryHandler        (path-based trajectory constraints)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  spatialTemporalAdjacentHandler,
  spatialTemporalReachableHandler,
  spatialTrajectoryHandler,
  predictPosition,
  closestPointOnSegment,
  distanceToPath,
} from '../SpatiotemporalTraits';

// =============================================================================
// Test helpers
// =============================================================================

function createMockNode(overrides: Record<string, any> = {}) {
  return {
    id: 'test-node',
    position: [0, 0, 0],
    ...overrides,
  };
}

function createMockContext(stateOverrides: Record<string, any> = {}) {
  const state: Record<string, any> = { ...stateOverrides };
  const emitted: any[] = [];

  return {
    vr: {
      hands: { left: null, right: null },
      headset: {
        position: [0, 0, 0],
        rotation: { x: 0, y: 0, z: 0 },
      },
      getPointerRay: () => null,
      getDominantHand: () => null,
    },
    physics: {
      applyVelocity: vi.fn(),
      applyAngularVelocity: vi.fn(),
      setKinematic: vi.fn(),
      raycast: vi.fn().mockReturnValue(null),
      getBodyPosition: vi.fn(),
      getBodyVelocity: vi.fn(),
    },
    audio: { playSound: vi.fn() },
    haptics: { pulse: vi.fn(), rumble: vi.fn() },
    emit: vi.fn((eventName: string, payload: any) => {
      emitted.push({ eventName, payload });
    }),
    getState: () => state,
    setState: (updates: Record<string, any>) => {
      Object.assign(state, updates);
    },
    getScaleMultiplier: () => 1,
    setScaleContext: vi.fn(),
    // Test-only access
    _emitted: emitted,
    _state: state,
  };
}

// =============================================================================
// Utility function tests
// =============================================================================

describe('utility functions', () => {
  describe('predictPosition', () => {
    it('should predict linear position at t=0', () => {
      const pos = { x: 1, y: 2, z: 3 };
      const vel = { x: 10, y: 0, z: 0 };
      const result = predictPosition(pos, vel, 0);
      expect(result).toEqual({ x: 1, y: 2, z: 3 });
    });

    it('should predict linear position at t=1', () => {
      const pos = { x: 0, y: 0, z: 0 };
      const vel = { x: 5, y: 3, z: -2 };
      const result = predictPosition(pos, vel, 1);
      expect(result).toEqual({ x: 5, y: 3, z: -2 });
    });

    it('should predict linear position at t=2.5', () => {
      const pos = { x: 1, y: 0, z: 0 };
      const vel = { x: 2, y: 0, z: 0 };
      const result = predictPosition(pos, vel, 2.5);
      expect(result.x).toBeCloseTo(6);
    });

    it('should predict quadratic position with acceleration', () => {
      const pos = { x: 0, y: 0, z: 0 };
      const vel = { x: 0, y: 0, z: 0 };
      const acc = { x: 2, y: 0, z: 0 };
      const result = predictPosition(pos, vel, 2, acc);
      // x = 0 + 0*2 + 0.5*2*4 = 4
      expect(result.x).toBeCloseTo(4);
    });

    it('should handle combined velocity and acceleration', () => {
      const pos = { x: 10, y: 0, z: 0 };
      const vel = { x: 5, y: 0, z: 0 };
      const acc = { x: -1, y: 0, z: 0 };
      const result = predictPosition(pos, vel, 3, acc);
      // x = 10 + 5*3 + 0.5*(-1)*9 = 10 + 15 - 4.5 = 20.5
      expect(result.x).toBeCloseTo(20.5);
    });
  });

  describe('closestPointOnSegment', () => {
    it('should return point A when projection is before segment', () => {
      const result = closestPointOnSegment(
        { x: -5, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );
      expect(result.x).toBeCloseTo(0);
    });

    it('should return point B when projection is beyond segment', () => {
      const result = closestPointOnSegment(
        { x: 15, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );
      expect(result.x).toBeCloseTo(10);
    });

    it('should return midpoint for perpendicular point', () => {
      const result = closestPointOnSegment(
        { x: 5, y: 5, z: 0 },
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 }
      );
      expect(result.x).toBeCloseTo(5);
      expect(result.y).toBeCloseTo(0);
    });

    it('should handle degenerate segment (point)', () => {
      const result = closestPointOnSegment(
        { x: 5, y: 5, z: 0 },
        { x: 3, y: 3, z: 0 },
        { x: 3, y: 3, z: 0 }
      );
      expect(result.x).toBeCloseTo(3);
      expect(result.y).toBeCloseTo(3);
    });
  });

  describe('distanceToPath', () => {
    it('should return Infinity for empty path', () => {
      expect(distanceToPath({ x: 0, y: 0, z: 0 }, [])).toBe(Infinity);
    });

    it('should compute distance to single-point path', () => {
      const dist = distanceToPath({ x: 3, y: 4, z: 0 }, [{ x: 0, y: 0, z: 0 }]);
      expect(dist).toBeCloseTo(5);
    });

    it('should find minimum distance to multi-segment path', () => {
      const path = [
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        { x: 10, y: 10, z: 0 },
      ];
      // Point is 2 units above the first segment
      const dist = distanceToPath({ x: 5, y: 2, z: 0 }, path);
      expect(dist).toBeCloseTo(2);
    });
  });
});

// =============================================================================
// spatialTemporalAdjacentHandler
// =============================================================================

describe('spatialTemporalAdjacentHandler', () => {
  it('should have the correct name', () => {
    expect(spatialTemporalAdjacentHandler.name).toBe('spatial_temporal_adjacent');
  });

  it('should have sensible default config', () => {
    const dc = spatialTemporalAdjacentHandler.defaultConfig;
    expect(dc.maxDistance).toBe(5.0);
    expect(dc.minDuration).toBe(0);
    expect(dc.gracePeriod).toBe(0);
    expect(dc.axis).toBe('xyz');
    expect(dc.enforcement).toBe('warn');
  });

  it('should initialize state on attach', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalAdjacentHandler.defaultConfig, target: 'other' };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    const state = context._state.spatialTemporalAdjacent;
    expect(state).toBeDefined();
    expect(state.isWithinRange).toBe(false);
    expect(state.durationHeld).toBe(0);
    expect(state.durationSatisfied).toBe(false);
    expect(state.violated).toBe(false);
    expect(state.targetPosition).toBeNull();
  });

  it('should not update when no target is configured', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalAdjacentHandler.defaultConfig, target: '' };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);
    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context.emit).not.toHaveBeenCalled();
  });

  it('should track target position via events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalAdjacentHandler.defaultConfig, target: 'other' };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [1, 0, 0],
      } as any
    );

    const state = context._state.spatialTemporalAdjacent;
    expect(state.targetPosition).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('should accumulate duration while in range', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 5.0,
      minDuration: 3.0,
    };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    // Set target within range
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [2, 0, 0],
      } as any
    );

    // Simulate several update ticks
    for (let i = 0; i < 10; i++) {
      spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.5);
    }

    const state = context._state.spatialTemporalAdjacent;
    expect(state.isWithinRange).toBe(true);
    expect(state.durationHeld).toBeGreaterThanOrEqual(4.5); // 10 * 0.5 - first tick
    expect(state.durationSatisfied).toBe(true);
  });

  it('should emit violation after grace period when leaving range', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
      minDuration: 1.0,
      gracePeriod: 0.5,
    };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    // Start within range
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [1, 0, 0],
      } as any
    );

    // Tick for a bit to establish adjacency
    for (let i = 0; i < 5; i++) {
      spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.5);
    }

    // Move target out of range
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );

    // First update after leaving - within grace period, no violation yet
    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.2);
    let state = context._state.spatialTemporalAdjacent;
    expect(state.violated).toBe(false);

    // More ticks past grace period
    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.5);
    state = context._state.spatialTemporalAdjacent;
    expect(state.violated).toBe(true);

    // Verify violation event was emitted
    expect(context.emit).toHaveBeenCalledWith(
      'spatial_constraint_violation',
      expect.objectContaining({
        type: 'spatial_constraint_violation',
        constraintKind: 'spatial_temporal_adjacent',
      })
    );
  });

  it('should emit resolved when returning to range and satisfying duration', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
      minDuration: 0.5,
      gracePeriod: 0,
    };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    // Start out of range (violation immediate since gracePeriod=0)
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );

    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.1);
    let state = context._state.spatialTemporalAdjacent;
    expect(state.violated).toBe(true);

    // Move back into range
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [1, 0, 0],
      } as any
    );

    // Tick enough to satisfy minDuration
    for (let i = 0; i < 5; i++) {
      spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.2);
    }

    state = context._state.spatialTemporalAdjacent;
    expect(state.violated).toBe(false);
    expect(state.durationSatisfied).toBe(true);

    expect(context.emit).toHaveBeenCalledWith(
      'spatial_constraint_resolved',
      expect.objectContaining({
        type: 'spatial_constraint_resolved',
        constraintKind: 'spatial_temporal_adjacent',
      })
    );
  });

  it('should reset duration when adjacency breaks', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
      minDuration: 5.0,
      gracePeriod: 0,
    };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    // Within range
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [1, 0, 0],
      } as any
    );

    // Accumulate 2 seconds (not enough for 5s threshold)
    for (let i = 0; i < 4; i++) {
      spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.5);
    }

    let state = context._state.spatialTemporalAdjacent;
    expect(state.durationHeld).toBeGreaterThan(1.0);
    expect(state.durationSatisfied).toBe(false);

    // Break adjacency
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );

    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.1);

    state = context._state.spatialTemporalAdjacent;
    expect(state.durationHeld).toBe(0);
    expect(state.isWithinRange).toBe(false);
  });

  it('should correct position when enforcement is correct', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
      minDuration: 0,
      gracePeriod: 0,
      enforcement: 'correct' as const,
    };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    // Out of range
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );

    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    // Should snap back toward target
    expect(node.position.x).toBeCloseTo(7, 0);
  });

  it('should respect minDistance constraint', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 10.0,
      minDistance: 2.0,
      minDuration: 0,
      gracePeriod: 0,
    };

    spatialTemporalAdjacentHandler.onAttach!(node as any, config, context as any);

    // Target too close (within minDistance)
    spatialTemporalAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [0.5, 0, 0],
      } as any
    );

    spatialTemporalAdjacentHandler.onUpdate!(node as any, config, context as any, 0.1);

    const state = context._state.spatialTemporalAdjacent;
    expect(state.isWithinRange).toBe(false);
  });
});

// =============================================================================
// spatialTemporalReachableHandler
// =============================================================================

describe('spatialTemporalReachableHandler', () => {
  it('should have the correct name', () => {
    expect(spatialTemporalReachableHandler.name).toBe('spatial_temporal_reachable');
  });

  it('should have sensible default config', () => {
    const dc = spatialTemporalReachableHandler.defaultConfig;
    expect(dc.predictionHorizon).toBe(3.0);
    expect(dc.safetyMargin).toBe(0.5);
    expect(dc.algorithm).toBe('line_of_sight');
    expect(dc.agentRadius).toBe(0.5);
    expect(dc.enforcement).toBe('warn');
  });

  it('should initialize state on attach', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalReachableHandler.defaultConfig, target: 'pad' };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    const state = context._state.spatialTemporalReachable;
    expect(state).toBeDefined();
    expect(state.isReachable).toBe(true);
    expect(state.violated).toBe(false);
    expect(state.predictedCollisionTime).toBeNull();
  });

  it('should track target position via events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalReachableHandler.defaultConfig, target: 'pad' };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'pad',
        position: [20, 0, 0],
      } as any
    );

    const state = context._state.spatialTemporalReachable;
    expect(state.targetPosition).toEqual({ x: 20, y: 0, z: 0 });
  });

  it('should track moving obstacles via events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalReachableHandler.defaultConfig, target: 'pad' };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'moving_obstacle_update',
        obstacleId: 'car_1',
        position: [10, 0, 0],
        velocity: { x: -2, y: 0, z: 0 },
        radius: 1.0,
      } as any
    );

    const state = context._state.spatialTemporalReachable;
    expect(state.movingObstacles.size).toBe(1);
    expect(state.movingObstacles.get('car_1')).toBeDefined();
    expect(state.movingObstacles.get('car_1').velocity).toEqual({ x: -2, y: 0, z: 0 });
  });

  it('should remove obstacles when despawned', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTemporalReachableHandler.defaultConfig, target: 'pad' };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'moving_obstacle_update',
        obstacleId: 'car_1',
        position: [10, 0, 0],
        velocity: { x: 0, y: 0, z: 0 },
        radius: 1.0,
      } as any
    );

    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'obstacle_removed',
        obstacleId: 'car_1',
      } as any
    );

    const state = context._state.spatialTemporalReachable;
    expect(state.movingObstacles.size).toBe(0);
  });

  it('should detect when max path length is exceeded', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalReachableHandler.defaultConfig,
      target: 'pad',
      maxPathLength: 5.0,
    };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'pad',
        position: [20, 0, 0],
      } as any
    );

    // Force immediate check by setting lastCheckTime to 0
    (context._state.spatialTemporalReachable as any).lastCheckTime = 0;

    spatialTemporalReachableHandler.onUpdate!(node as any, config, context as any, 0.016);

    const state = context._state.spatialTemporalReachable;
    expect(state.isReachable).toBe(false);
    expect(state.violated).toBe(true);
  });

  it('should detect moving obstacle predicted to block path', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalReachableHandler.defaultConfig,
      target: 'pad',
      predictionHorizon: 5.0,
      safetyMargin: 0.5,
      agentRadius: 0.5,
    };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    // Set target position
    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'pad',
        position: [20, 0, 0],
      } as any
    );

    // Add moving obstacle that will cross the path
    // Obstacle starts at (10, 5, 0) moving toward (10, -5, 0) at velocity (0, -2, 0)
    // At t=2.5, it will be at (10, 0, 0) - right on the path
    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'moving_obstacle_update',
        obstacleId: 'vehicle_1',
        position: [10, 5, 0],
        velocity: { x: 0, y: -2, z: 0 },
        radius: 1.0,
      } as any
    );

    // Force immediate check
    (context._state.spatialTemporalReachable as any).lastCheckTime = 0;

    spatialTemporalReachableHandler.onUpdate!(node as any, config, context as any, 0.016);

    const state = context._state.spatialTemporalReachable;
    expect(state.isReachable).toBe(false);
    expect(state.violated).toBe(true);
    expect(state.predictedCollisionTime).not.toBeNull();

    expect(context.emit).toHaveBeenCalledWith(
      'spatial_constraint_violation',
      expect.objectContaining({
        constraintKind: 'spatial_temporal_reachable',
        message: expect.stringContaining('Velocity-predicted'),
      })
    );
  });

  it('should not violate when obstacle moves away from path', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalReachableHandler.defaultConfig,
      target: 'pad',
      predictionHorizon: 3.0,
      safetyMargin: 0.5,
      agentRadius: 0.5,
    };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'pad',
        position: [20, 0, 0],
      } as any
    );

    // Obstacle moving away from the path (starts near but going away)
    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'moving_obstacle_update',
        obstacleId: 'vehicle_1',
        position: [10, 5, 0],
        velocity: { x: 0, y: 5, z: 0 }, // Moving away from path
        radius: 0.5,
      } as any
    );

    (context._state.spatialTemporalReachable as any).lastCheckTime = 0;

    spatialTemporalReachableHandler.onUpdate!(node as any, config, context as any, 0.016);

    const state = context._state.spatialTemporalReachable;
    expect(state.isReachable).toBe(true);
    expect(state.violated).toBe(false);
  });

  it('should emit resolved when path clears', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialTemporalReachableHandler.defaultConfig,
      target: 'pad',
      maxPathLength: 5.0,
    };

    spatialTemporalReachableHandler.onAttach!(node as any, config, context as any);

    // Initially too far
    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'pad',
        position: [20, 0, 0],
      } as any
    );

    (context._state.spatialTemporalReachable as any).lastCheckTime = 0;
    spatialTemporalReachableHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context._state.spatialTemporalReachable.violated).toBe(true);

    // Move target closer
    spatialTemporalReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'pad',
        position: [3, 0, 0],
      } as any
    );

    (context._state.spatialTemporalReachable as any).lastCheckTime = 0;
    spatialTemporalReachableHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context._state.spatialTemporalReachable.violated).toBe(false);

    expect(context.emit).toHaveBeenCalledWith(
      'spatial_constraint_resolved',
      expect.objectContaining({
        constraintKind: 'spatial_temporal_reachable',
      })
    );
  });
});

// =============================================================================
// spatialTrajectoryHandler
// =============================================================================

describe('spatialTrajectoryHandler', () => {
  it('should have the correct name', () => {
    expect(spatialTrajectoryHandler.name).toBe('spatial_trajectory');
  });

  it('should have sensible default config', () => {
    const dc = spatialTrajectoryHandler.defaultConfig;
    expect(dc.mode).toBe('keep_in');
    expect(dc.horizon).toBe(3.0);
    expect(dc.sampleCount).toBe(10);
    expect(dc.maxDeviation).toBe(1.0);
    expect(dc.enforcement).toBe('warn');
  });

  it('should initialize state on attach', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTrajectoryHandler.defaultConfig };

    spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

    const state = context._state.spatialTrajectory;
    expect(state).toBeDefined();
    expect(state.violated).toBe(false);
    expect(state.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(state.lastTrajectory).toEqual([]);
  });

  it('should update velocity from events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTrajectoryHandler.defaultConfig };

    spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

    spatialTrajectoryHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'velocity_update',
        velocity: { x: 5, y: 0, z: 0 },
      } as any
    );

    const state = context._state.spatialTrajectory;
    expect(state.velocity).toEqual({ x: 5, y: 0, z: 0 });
  });

  it('should update acceleration from events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTrajectoryHandler.defaultConfig, useAcceleration: true };

    spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

    spatialTrajectoryHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'velocity_update',
        velocity: { x: 5, y: 0, z: 0 },
        acceleration: { x: -1, y: 0, z: 0 },
      } as any
    );

    const state = context._state.spatialTrajectory;
    expect(state.acceleration).toEqual({ x: -1, y: 0, z: 0 });
  });

  it('should update region bounds from events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialTrajectoryHandler.defaultConfig, regionId: 'zone1' };

    spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

    spatialTrajectoryHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'region_bounds_update',
        regionId: 'zone1',
        bounds: {
          min: { x: -10, y: -10, z: -10 },
          max: { x: 10, y: 10, z: 10 },
        },
      } as any
    );

    const state = context._state.spatialTrajectory;
    expect(state.regionBounds).toBeDefined();
  });

  // --- keep_in mode ---

  describe('keep_in mode', () => {
    it('should not violate when trajectory stays inside box region', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_in' as const,
        regionId: 'safe_zone',
        horizon: 5.0,
        sampleCount: 10,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Set region bounds
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'safe_zone',
          bounds: {
            min: { x: -20, y: -20, z: -20 },
            max: { x: 20, y: 20, z: 20 },
          },
        } as any
      );

      // Set velocity (slow, stays inside)
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 1, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(false);
      expect(state.lastTrajectory.length).toBe(11); // sampleCount + 1
    });

    it('should violate when trajectory leaves box region', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_in' as const,
        regionId: 'safe_zone',
        horizon: 5.0,
        sampleCount: 10,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Small region
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'safe_zone',
          bounds: {
            min: { x: -3, y: -3, z: -3 },
            max: { x: 3, y: 3, z: 3 },
          },
        } as any
      );

      // Fast velocity that will leave the region
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 5, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(true);
      expect(state.violatingIndices.length).toBeGreaterThan(0);

      expect(context.emit).toHaveBeenCalledWith(
        'spatial_constraint_violation',
        expect.objectContaining({
          constraintKind: 'spatial_trajectory',
          message: expect.stringContaining('predicted to leave region'),
        })
      );
    });

    it('should handle spherical region bounds', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_in' as const,
        regionId: 'sphere_zone',
        horizon: 3.0,
        sampleCount: 5,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'sphere_zone',
          bounds: {
            center: { x: 0, y: 0, z: 0 },
            radius: 5,
          },
        } as any
      );

      // Velocity that goes beyond sphere in 3 seconds
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 3, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(true);
    });
  });

  // --- keep_out mode ---

  describe('keep_out mode', () => {
    it('should not violate when trajectory avoids forbidden region', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_out' as const,
        regionId: 'danger_zone',
        horizon: 3.0,
        sampleCount: 10,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Danger zone is far away
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'danger_zone',
          bounds: {
            min: { x: 50, y: -5, z: -5 },
            max: { x: 60, y: 5, z: 5 },
          },
        } as any
      );

      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 1, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      expect(context._state.spatialTrajectory.violated).toBe(false);
    });

    it('should violate when trajectory enters forbidden region', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_out' as const,
        regionId: 'danger_zone',
        horizon: 5.0,
        sampleCount: 10,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Danger zone ahead
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'danger_zone',
          bounds: {
            min: { x: 8, y: -5, z: -5 },
            max: { x: 15, y: 5, z: 5 },
          },
        } as any
      );

      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 5, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(true);

      expect(context.emit).toHaveBeenCalledWith(
        'spatial_constraint_violation',
        expect.objectContaining({
          constraintKind: 'spatial_trajectory',
          message: expect.stringContaining('predicted to enter forbidden region'),
        })
      );
    });
  });

  // --- follow mode ---

  describe('follow mode', () => {
    it('should not violate when trajectory follows reference path', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'follow' as const,
        horizon: 3.0,
        sampleCount: 10,
        maxDeviation: 2.0,
        referencePath: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
          { x: 20, y: 0, z: 0 },
        ],
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Moving along the reference path with slight offset
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 3, y: 0.5, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(false);
    });

    it('should violate when trajectory deviates beyond maxDeviation', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'follow' as const,
        horizon: 5.0,
        sampleCount: 10,
        maxDeviation: 1.0,
        referencePath: [
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
        ],
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Moving perpendicular to reference path
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 0, y: 5, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(true);

      expect(context.emit).toHaveBeenCalledWith(
        'spatial_constraint_violation',
        expect.objectContaining({
          constraintKind: 'spatial_trajectory',
          message: expect.stringContaining('predicted to deviate'),
        })
      );
    });
  });

  // --- waypoint mode ---

  describe('waypoint mode', () => {
    it('should not violate when trajectory passes through all waypoints', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'waypoint' as const,
        horizon: 10.0,
        sampleCount: 20,
        waypoints: [
          { position: [5, 0, 0], radius: 2.0 },
          { position: [10, 0, 0], radius: 2.0 },
        ],
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Moving along x-axis, will pass through both waypoints
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 2, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(false);
      expect(state.waypointsReached[0]).toBe(true);
      expect(state.waypointsReached[1]).toBe(true);
    });

    it('should violate when trajectory misses a waypoint', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'waypoint' as const,
        horizon: 5.0,
        sampleCount: 10,
        waypoints: [
          { position: [5, 0, 0], radius: 1.0, label: 'checkpoint_1' },
          { position: [5, 20, 0], radius: 1.0, label: 'checkpoint_2' },
        ],
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Moving along x-axis only - will reach first but miss second
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 3, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      expect(state.violated).toBe(true);
      expect(state.waypointsReached[0]).toBe(true);
      expect(state.waypointsReached[1]).toBe(false);

      expect(context.emit).toHaveBeenCalledWith(
        'spatial_constraint_violation',
        expect.objectContaining({
          constraintKind: 'spatial_trajectory',
          message: expect.stringContaining('predicted to miss waypoints'),
        })
      );
    });
  });

  // --- Acceleration support ---

  describe('acceleration prediction', () => {
    it('should use quadratic prediction when useAcceleration is true', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_in' as const,
        regionId: 'zone',
        horizon: 4.0,
        sampleCount: 10,
        useAcceleration: true,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      // Large bounding region
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'zone',
          bounds: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
        } as any
      );

      // Low velocity but high acceleration will eventually leave
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 0, y: 0, z: 0 },
          acceleration: { x: 5, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);

      const state = context._state.spatialTrajectory;
      // At t=4, x = 0.5 * 5 * 16 = 40, which is well beyond x=5
      expect(state.violated).toBe(true);

      // Verify the trajectory points include acceleration effect
      const lastPoint = state.lastTrajectory[state.lastTrajectory.length - 1];
      expect(lastPoint.x).toBeGreaterThan(5);
    });
  });

  // --- Resolution events ---

  describe('violation resolution', () => {
    it('should emit resolved when constraint is re-satisfied', () => {
      const node = createMockNode({ position: [0, 0, 0] });
      const context = createMockContext();
      const config = {
        ...spatialTrajectoryHandler.defaultConfig,
        mode: 'keep_in' as const,
        regionId: 'zone',
        horizon: 3.0,
        sampleCount: 5,
      };

      spatialTrajectoryHandler.onAttach!(node as any, config, context as any);

      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'region_bounds_update',
          regionId: 'zone',
          bounds: {
            min: { x: -3, y: -3, z: -3 },
            max: { x: 3, y: 3, z: 3 },
          },
        } as any
      );

      // Fast velocity -> violation
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 10, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);
      expect(context._state.spatialTrajectory.violated).toBe(true);

      // Slow down -> resolution
      spatialTrajectoryHandler.onEvent!(
        node as any,
        config,
        context as any,
        {
          type: 'velocity_update',
          velocity: { x: 0.1, y: 0, z: 0 },
        } as any
      );

      (context._state.spatialTrajectory as any).lastCheckTime = 0;
      spatialTrajectoryHandler.onUpdate!(node as any, config, context as any, 0.016);
      expect(context._state.spatialTrajectory.violated).toBe(false);

      expect(context.emit).toHaveBeenCalledWith(
        'spatial_constraint_resolved',
        expect.objectContaining({
          constraintKind: 'spatial_trajectory',
        })
      );
    });
  });
});
