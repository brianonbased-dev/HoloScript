/**
 * NavigationEngine Tests
 *
 * Tests the NavigationEngine registry functions and interface contracts:
 * - registerNavigationEngine / getNavigationEngine
 * - navigationEngineRegistry Map behavior
 * - Mock engine creation and method validation
 * - Edge cases (overwrite, missing, dispose)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  navigationEngineRegistry,
  registerNavigationEngine,
  getNavigationEngine,
} from '../NavigationEngine';
import type { NavigationEngine, NavigationConfig, NavDestination } from '../NavigationEngine';
import type { Vector3 } from '../../types/HoloScriptPlus';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockNavigationEngine(overrides?: Partial<NavigationEngine>): NavigationEngine {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    updateFlowField: vi.fn().mockResolvedValue(undefined),
    sampleDirection: vi.fn().mockReturnValue({ x: 1, y: 0, z: 0 }),
    updateObstacle: vi.fn(),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createDefaultConfig(): NavigationConfig {
  return {
    backend: 'gpu_flowfield',
    gridSize: [100, 10, 100],
    resolution: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

describe('NavigationEngine — registry', () => {
  beforeEach(() => {
    navigationEngineRegistry.clear();
  });

  it('navigationEngineRegistry starts empty (after clear)', () => {
    expect(navigationEngineRegistry.size).toBe(0);
  });

  it('registerNavigationEngine adds engine to registry', () => {
    const engine = createMockNavigationEngine();
    registerNavigationEngine('gpu_flowfield', engine);
    expect(navigationEngineRegistry.has('gpu_flowfield')).toBe(true);
  });

  it('getNavigationEngine retrieves a registered engine', () => {
    const engine = createMockNavigationEngine();
    registerNavigationEngine('recast', engine);
    expect(getNavigationEngine('recast')).toBe(engine);
  });

  it('getNavigationEngine returns undefined for unregistered name', () => {
    expect(getNavigationEngine('nonexistent')).toBeUndefined();
  });

  it('registering with same name overwrites the previous engine', () => {
    const engine1 = createMockNavigationEngine();
    const engine2 = createMockNavigationEngine();
    registerNavigationEngine('shared', engine1);
    registerNavigationEngine('shared', engine2);
    expect(getNavigationEngine('shared')).toBe(engine2);
    expect(getNavigationEngine('shared')).not.toBe(engine1);
  });

  it('multiple engines can be registered independently', () => {
    const gpu = createMockNavigationEngine();
    const recast = createMockNavigationEngine();
    const custom = createMockNavigationEngine();
    registerNavigationEngine('gpu_flowfield', gpu);
    registerNavigationEngine('recast', recast);
    registerNavigationEngine('custom', custom);

    expect(getNavigationEngine('gpu_flowfield')).toBe(gpu);
    expect(getNavigationEngine('recast')).toBe(recast);
    expect(getNavigationEngine('custom')).toBe(custom);
    expect(navigationEngineRegistry.size).toBe(3);
  });

  it('navigationEngineRegistry is a standard Map', () => {
    expect(navigationEngineRegistry).toBeInstanceOf(Map);
  });
});

// ---------------------------------------------------------------------------
// Mock engine — initialize
// ---------------------------------------------------------------------------

describe('NavigationEngine — initialize', () => {
  it('initialize is called with config', async () => {
    const engine = createMockNavigationEngine();
    const config = createDefaultConfig();
    await engine.initialize(config);
    expect(engine.initialize).toHaveBeenCalledWith(config);
  });

  it('initialize resolves successfully', async () => {
    const engine = createMockNavigationEngine();
    await expect(engine.initialize(createDefaultConfig())).resolves.toBeUndefined();
  });

  it('initialize with optional floorY', async () => {
    const engine = createMockNavigationEngine();
    const config: NavigationConfig = {
      backend: 'gpu_flowfield',
      gridSize: [200, 20, 200],
      resolution: 1.0,
      floorY: 0.5,
    };
    await engine.initialize(config);
    expect(engine.initialize).toHaveBeenCalledWith(expect.objectContaining({ floorY: 0.5 }));
  });
});

// ---------------------------------------------------------------------------
// Mock engine — flow field
// ---------------------------------------------------------------------------

describe('NavigationEngine — flow field', () => {
  it('updateFlowField with destination', async () => {
    const engine = createMockNavigationEngine();
    const dest: NavDestination = {
      id: 'goal-1',
      position: { x: 50, y: 0, z: 50 },
    };
    await engine.updateFlowField(dest);
    expect(engine.updateFlowField).toHaveBeenCalledWith(dest);
  });

  it('updateFlowField with optional radius', async () => {
    const engine = createMockNavigationEngine();
    const dest: NavDestination = {
      id: 'goal-2',
      position: [10, 0, 20],
      radius: 5.0,
    };
    await engine.updateFlowField(dest);
    expect(engine.updateFlowField).toHaveBeenCalledWith(expect.objectContaining({ radius: 5.0 }));
  });

  it('updateFlowField resolves successfully', async () => {
    const engine = createMockNavigationEngine();
    const dest: NavDestination = {
      id: 'goal',
      position: { x: 0, y: 0, z: 0 },
    };
    await expect(engine.updateFlowField(dest)).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Mock engine — direction sampling
// ---------------------------------------------------------------------------

describe('NavigationEngine — sampleDirection', () => {
  it('sampleDirection returns a direction vector', () => {
    const engine = createMockNavigationEngine({
      sampleDirection: vi.fn().mockReturnValue({ x: 0, y: 0, z: 1 }),
    });
    const dir = engine.sampleDirection('goal-1', { x: 10, y: 0, z: 10 });
    expect(dir).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('sampleDirection is called with correct arguments', () => {
    const engine = createMockNavigationEngine();
    const pos: Vector3 = [5, 0, 5];
    engine.sampleDirection('dest-1', pos);
    expect(engine.sampleDirection).toHaveBeenCalledWith('dest-1', [5, 0, 5]);
  });

  it('sampleDirection with tuple position', () => {
    const engine = createMockNavigationEngine({
      sampleDirection: vi.fn().mockReturnValue([1, 0, 0]),
    });
    const dir = engine.sampleDirection('goal', [0, 0, 0]);
    expect(dir).toEqual([1, 0, 0]);
  });

  it('sampleDirection can return zero vector (at destination)', () => {
    const engine = createMockNavigationEngine({
      sampleDirection: vi.fn().mockReturnValue({ x: 0, y: 0, z: 0 }),
    });
    const dir = engine.sampleDirection('goal', { x: 50, y: 0, z: 50 });
    expect(dir).toEqual({ x: 0, y: 0, z: 0 });
  });
});

// ---------------------------------------------------------------------------
// Mock engine — obstacles
// ---------------------------------------------------------------------------

describe('NavigationEngine — obstacles', () => {
  it('updateObstacle adds an active obstacle', () => {
    const engine = createMockNavigationEngine();
    engine.updateObstacle('wall-1', { x: 10, y: 0, z: 10 }, { x: 5, y: 3, z: 1 }, true);
    expect(engine.updateObstacle).toHaveBeenCalledWith(
      'wall-1',
      { x: 10, y: 0, z: 10 },
      { x: 5, y: 3, z: 1 },
      true
    );
  });

  it('updateObstacle deactivates an obstacle', () => {
    const engine = createMockNavigationEngine();
    engine.updateObstacle('wall-1', { x: 10, y: 0, z: 10 }, { x: 5, y: 3, z: 1 }, false);
    expect(engine.updateObstacle).toHaveBeenCalledWith(
      'wall-1',
      expect.anything(),
      expect.anything(),
      false
    );
  });

  it('updateObstacle with tuple vectors', () => {
    const engine = createMockNavigationEngine();
    engine.updateObstacle('box', [0, 0, 0], [2, 2, 2], true);
    expect(engine.updateObstacle).toHaveBeenCalledWith('box', [0, 0, 0], [2, 2, 2], true);
  });
});

// ---------------------------------------------------------------------------
// Mock engine — dispose
// ---------------------------------------------------------------------------

describe('NavigationEngine — dispose', () => {
  it('dispose is callable', () => {
    const engine = createMockNavigationEngine();
    engine.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(1);
  });

  it('dispose can be called multiple times', () => {
    const engine = createMockNavigationEngine();
    engine.dispose();
    engine.dispose();
    expect(engine.dispose).toHaveBeenCalledTimes(2);
  });
});
