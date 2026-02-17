import { describe, it, expect, beforeEach } from 'vitest';
import { LODManager } from '../LODManager';
import type { LODConfig, LODLevel } from '../LODTypes';

function makeLevel(level: number, distance: number): LODLevel {
  return {
    level,
    distance,
    polygonRatio: 1 / (level + 1),
    textureScale: 1 / (level + 1),
    disabledFeatures: [],
  };
}

function makeConfig(id: string, levels: LODLevel[]): LODConfig {
  return {
    id,
    strategy: 'distance',
    transition: 'instant',
    transitionDuration: 0,
    levels,
    hysteresis: 0,
    bias: 0,
    fadeEnabled: false,
    enabled: true,
  };
}

describe('LODManager', () => {
  let mgr: LODManager;

  beforeEach(() => { mgr = new LODManager(); });

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  it('registerConfig adds an object', () => {
    const cfg = makeConfig('obj1', [makeLevel(0, 0), makeLevel(1, 50)]);
    mgr.registerConfig('obj1', cfg);
    const state = mgr.getState('obj1');
    expect(state).toBeDefined();
    expect(state!.currentLevel).toBe(0);
  });

  it('unregisterConfig removes an object', () => {
    const cfg = makeConfig('obj2', [makeLevel(0, 0)]);
    mgr.registerConfig('obj2', cfg);
    mgr.unregisterConfig('obj2');
    expect(mgr.getState('obj2')).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // LOD Selection
  // ---------------------------------------------------------------------------

  it('selects correct LOD for near camera', () => {
    const cfg = makeConfig('a', [
      makeLevel(0, 0),
      makeLevel(1, 50),
      makeLevel(2, 100),
    ]);
    mgr.registerConfig('a', cfg);
    mgr.setObjectPosition('a', [0, 0, 0]);
    mgr.setCameraPosition([0, 0, 5]); // distance 5
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('a')).toBe(0);
  });

  it('selects higher LOD for far camera', () => {
    const cfg = makeConfig('b', [
      makeLevel(0, 0),
      makeLevel(1, 50),
      makeLevel(2, 100),
    ]);
    mgr.registerConfig('b', cfg);
    mgr.setObjectPosition('b', [0, 0, 0]);
    mgr.setCameraPosition([0, 0, 75]); // distance 75
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('b')).toBe(1);
  });

  it('selects max LOD for very far camera', () => {
    const cfg = makeConfig('c', [
      makeLevel(0, 0),
      makeLevel(1, 30),
      makeLevel(2, 60),
    ]);
    mgr.registerConfig('c', cfg);
    mgr.setObjectPosition('c', [0, 0, 0]);
    mgr.setCameraPosition([200, 0, 0]); // very far
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('c')).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Forced Level
  // ---------------------------------------------------------------------------

  it('forced level overrides distance calculation', () => {
    const cfg = makeConfig('f', [
      makeLevel(0, 0),
      makeLevel(1, 50),
    ]);
    mgr.registerConfig('f', cfg);
    mgr.setForcedLevel('f', 1);
    mgr.setCameraPosition([0, 0, 0]); // camera right on top
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('f')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Disabled
  // ---------------------------------------------------------------------------

  it('disabled config does not change level', () => {
    const cfg = makeConfig('d', [
      makeLevel(0, 0),
      makeLevel(1, 50),
    ]);
    cfg.enabled = false;
    mgr.registerConfig('d', cfg);
    mgr.setCameraPosition([0, 0, 100]);
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('d')).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  it('getMetrics returns stats', () => {
    const cfg = makeConfig('m', [makeLevel(0, 0)]);
    mgr.registerConfig('m', cfg);
    mgr.update(0.016);
    const metrics = mgr.getMetrics();
    expect(metrics).toBeDefined();
    expect(metrics.totalObjects).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Multiple Objects
  // ---------------------------------------------------------------------------

  it('handles multiple objects independently', () => {
    mgr.registerConfig('near', makeConfig('near', [makeLevel(0, 0), makeLevel(1, 20)]));
    mgr.registerConfig('far', makeConfig('far', [makeLevel(0, 0), makeLevel(1, 20)]));
    mgr.setObjectPosition('near', [0, 0, 0]);
    mgr.setObjectPosition('far', [100, 0, 0]);
    mgr.setCameraPosition([0, 0, 0]); // camera at origin
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('near')).toBe(0);
    expect(mgr.getCurrentLevel('far')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Position Update
  // ---------------------------------------------------------------------------

  it('setObjectPosition changes LOD selection', () => {
    mgr.registerConfig('p', makeConfig('p', [makeLevel(0, 0), makeLevel(1, 50)]));
    mgr.setObjectPosition('p', [0, 0, 0]);
    mgr.setCameraPosition([0, 0, 0]); // near
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('p')).toBe(0);
    mgr.setObjectPosition('p', [200, 0, 0]);
    mgr.update(0.016); // now far
    expect(mgr.getCurrentLevel('p')).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Registered Objects
  // ---------------------------------------------------------------------------

  it('getRegisteredObjects lists all object ids', () => {
    mgr.registerConfig('x', makeConfig('x', [makeLevel(0, 0)]));
    mgr.registerConfig('y', makeConfig('y', [makeLevel(0, 0)]));
    const ids = mgr.getRegisteredObjects();
    expect(ids).toContain('x');
    expect(ids).toContain('y');
  });
});
