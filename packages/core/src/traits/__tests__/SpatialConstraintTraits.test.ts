/**
 * SpatialConstraintTraits Tests
 *
 * Tests for the runtime trait handlers:
 * - spatialAdjacentHandler
 * - spatialContainsHandler
 * - spatialReachableHandler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  spatialAdjacentHandler,
  spatialContainsHandler,
  spatialReachableHandler,
} from '../SpatialConstraintTraits';

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
      headset: { position: [0, 0, 0], rotation: { x: 0, y: 0, z: 0 } },
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
    // Test-only: access to emitted events
    _emitted: emitted,
    _state: state,
  };
}

// =============================================================================
// spatialAdjacentHandler
// =============================================================================

describe('spatialAdjacentHandler', () => {
  it('should have the correct name', () => {
    expect(spatialAdjacentHandler.name).toBe('spatial_adjacent');
  });

  it('should have sensible default config', () => {
    expect(spatialAdjacentHandler.defaultConfig.maxDistance).toBe(5.0);
    expect(spatialAdjacentHandler.defaultConfig.axis).toBe('xyz');
    expect(spatialAdjacentHandler.defaultConfig.bidirectional).toBe(true);
    expect(spatialAdjacentHandler.defaultConfig.enforcement).toBe('warn');
  });

  it('should initialize state on attach', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialAdjacentHandler.defaultConfig, target: 'other' };

    spatialAdjacentHandler.onAttach!(node as any, config, context as any);

    const state = context._state.spatialAdjacent;
    expect(state).toBeDefined();
    expect(state.violation.violated).toBe(false);
    expect(state.targetPosition).toBeNull();
  });

  it('should not update when no target is configured', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialAdjacentHandler.defaultConfig, target: '' };

    spatialAdjacentHandler.onAttach!(node as any, config, context as any);
    spatialAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context.emit).not.toHaveBeenCalled();
  });

  it('should not update when enforcement is none', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = {
      ...spatialAdjacentHandler.defaultConfig,
      target: 'other',
      enforcement: 'none' as const,
    };

    spatialAdjacentHandler.onAttach!(node as any, config, context as any);
    spatialAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context.emit).not.toHaveBeenCalled();
  });

  it('should emit violation when distance exceeds maxDistance', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
    };

    spatialAdjacentHandler.onAttach!(node as any, config, context as any);

    // Set target position via event
    spatialAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );

    spatialAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context.emit).toHaveBeenCalledWith(
      'spatial_constraint_violation',
      expect.objectContaining({
        type: 'spatial_constraint_violation',
        constraintKind: 'spatial_adjacent',
      })
    );
  });

  it('should emit resolved when violation clears', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
    };

    spatialAdjacentHandler.onAttach!(node as any, config, context as any);

    // First: set far target (violation)
    spatialAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );
    spatialAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    // Then: move target close (resolve)
    spatialAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [1, 0, 0],
      } as any
    );
    spatialAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    expect(context.emit).toHaveBeenCalledWith(
      'spatial_constraint_resolved',
      expect.objectContaining({
        type: 'spatial_constraint_resolved',
        constraintKind: 'spatial_adjacent',
      })
    );
  });

  it('should correct position when enforcement is correct', () => {
    const node = createMockNode({ position: [0, 0, 0] });
    const context = createMockContext();
    const config = {
      ...spatialAdjacentHandler.defaultConfig,
      target: 'other',
      maxDistance: 3.0,
      enforcement: 'correct' as const,
    };

    spatialAdjacentHandler.onAttach!(node as any, config, context as any);

    spatialAdjacentHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'other',
        position: [10, 0, 0],
      } as any
    );

    spatialAdjacentHandler.onUpdate!(node as any, config, context as any, 0.016);

    // Node should be snapped toward target at maxDistance
    expect(node.position.x).toBeCloseTo(7, 0); // 10 - 3 = 7 (along x axis)
  });
});

// =============================================================================
// spatialContainsHandler
// =============================================================================

describe('spatialContainsHandler', () => {
  it('should have the correct name', () => {
    expect(spatialContainsHandler.name).toBe('spatial_contains');
  });

  it('should have sensible default config', () => {
    expect(spatialContainsHandler.defaultConfig.margin).toBe(0);
    expect(spatialContainsHandler.defaultConfig.strict).toBe(false);
    expect(spatialContainsHandler.defaultConfig.recursive).toBe(false);
    expect(spatialContainsHandler.defaultConfig.enforcement).toBe('warn');
  });

  it('should initialize state on attach', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialContainsHandler.defaultConfig, target: 'child' };

    spatialContainsHandler.onAttach!(node as any, config, context as any);

    const state = context._state.spatialContains;
    expect(state).toBeDefined();
    expect(state.violation.violated).toBe(false);
    expect(state.containedEntities).toEqual([]);
  });

  it('should track registered entities via events', () => {
    const node = createMockNode({ id: 'container' });
    const context = createMockContext();
    const config = { ...spatialContainsHandler.defaultConfig, target: 'furniture' };

    spatialContainsHandler.onAttach!(node as any, config, context as any);

    // Register a contained entity
    spatialContainsHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_entity_registered',
        entityId: 'chair_1',
        entityType: 'furniture',
      } as any
    );

    const state = context._state.spatialContains;
    expect(state.containedEntities).toContain('chair_1');
  });

  it('should not duplicate registered entities', () => {
    const node = createMockNode({ id: 'container' });
    const context = createMockContext();
    const config = { ...spatialContainsHandler.defaultConfig, target: 'furniture' };

    spatialContainsHandler.onAttach!(node as any, config, context as any);

    // Register same entity twice
    spatialContainsHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_entity_registered',
        entityId: 'chair_1',
        entityType: 'furniture',
      } as any
    );
    spatialContainsHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_entity_registered',
        entityId: 'chair_1',
        entityType: 'furniture',
      } as any
    );

    const state = context._state.spatialContains;
    expect(state.containedEntities.length).toBe(1);
  });
});

// =============================================================================
// spatialReachableHandler
// =============================================================================

describe('spatialReachableHandler', () => {
  it('should have the correct name', () => {
    expect(spatialReachableHandler.name).toBe('spatial_reachable');
  });

  it('should have sensible default config', () => {
    expect(spatialReachableHandler.defaultConfig.algorithm).toBe('line_of_sight');
    expect(spatialReachableHandler.defaultConfig.agentRadius).toBe(0.5);
    expect(spatialReachableHandler.defaultConfig.bidirectional).toBe(true);
    expect(spatialReachableHandler.defaultConfig.enforcement).toBe('warn');
  });

  it('should initialize state on attach', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialReachableHandler.defaultConfig, target: 'exit' };

    spatialReachableHandler.onAttach!(node as any, config, context as any);

    const state = context._state.spatialReachable;
    expect(state).toBeDefined();
    expect(state.isReachable).toBe(true);
    expect(state.pathLength).toBe(0);
  });

  it('should track target position via events', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = { ...spatialReachableHandler.defaultConfig, target: 'exit' };

    spatialReachableHandler.onAttach!(node as any, config, context as any);

    spatialReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'spatial_target_update',
        targetId: 'exit',
        position: [10, 0, 0],
      } as any
    );

    expect(context._state['reachable_target_exit']).toEqual({
      x: 10,
      y: 0,
      z: 0,
    });
  });

  it('should accept external pathfinding results', () => {
    const node = createMockNode();
    const context = createMockContext();
    const config = {
      ...spatialReachableHandler.defaultConfig,
      target: 'exit',
      algorithm: 'navmesh' as const,
    };

    spatialReachableHandler.onAttach!(node as any, config, context as any);

    spatialReachableHandler.onEvent!(
      node as any,
      config,
      context as any,
      {
        type: 'pathfinding_result',
        targetId: 'exit',
        pathFound: false,
        pathLength: 0,
      } as any
    );

    const state = context._state.spatialReachable;
    expect(state.isReachable).toBe(false);
    expect(state.violation.violated).toBe(true);
  });
});
