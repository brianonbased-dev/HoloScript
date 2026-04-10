import { describe, it, expect, vi } from 'vitest';
import {
  LODManager,
  createLODManager,
  createVRLODManager,
  createMobileLODManager,
} from '../LODManager';

const lodConfig = {
  levels: [
    { level: 0, distance: 0, polygonRatio: 1.0, textureScale: 1.0, disabledFeatures: [] },
    { level: 1, distance: 50, polygonRatio: 0.5, textureScale: 0.5, disabledFeatures: [] },
    { level: 2, distance: 100, polygonRatio: 0.25, textureScale: 0.25, disabledFeatures: [] },
  ],
  strategy: 'distance' as const,
  hysteresis: 0.05,
  transition: 'instant' as const,
  transitionDuration: 0.5,
  enabled: true,
  bias: 0,
  fadeEnabled: false,
};

describe('LODManager', () => {
  it('creates with default options', () => {
    const mgr = createLODManager();
    const opts = mgr.getOptions();
    expect(opts.targetFrameRate).toBe(60);
    expect(opts.autoUpdate).toBe(true);
  });

  it('register and unregister objects', () => {
    const mgr = createLODManager();
    mgr.register('box', lodConfig, [0, 0, 0]);
    expect(mgr.getRegisteredObjects()).toContain('box');
    mgr.unregister('box');
    expect(mgr.getRegisteredObjects()).not.toContain('box');
  });

  it('getCurrentLevel defaults to 0', () => {
    const mgr = createLODManager();
    mgr.register('box', lodConfig, [0, 0, 0]);
    expect(mgr.getCurrentLevel('box')).toBe(0);
  });

  it('update changes LOD based on distance', () => {
    const mgr = createLODManager();
    mgr.register('box', lodConfig, [0, 0, 0]);
    mgr.setCameraPosition([0, 0, 200]); // 200 units away → LOD2
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('box')).toBeGreaterThanOrEqual(1);
  });

  it('setForcedLevel overrides selection', () => {
    const mgr = createLODManager();
    mgr.register('box', lodConfig, [0, 0, 0]);
    mgr.setForcedLevel('box', 2);
    mgr.setCameraPosition([0, 0, 0]); // close, normally LOD0
    mgr.update(0.016);
    expect(mgr.getCurrentLevel('box')).toBe(2);
  });

  it('group management', () => {
    const mgr = createLODManager();
    mgr.register('a', lodConfig, [0, 0, 0]);
    mgr.register('b', lodConfig, [0, 0, 0]);
    mgr.createGroup({
      id: 'trees',
      objectIds: ['a', 'b'],
      config: lodConfig,
      boundingCenter: [0, 0, 0],
      boundingRadius: 10,
      currentLevel: 0,
    });
    expect(mgr.getGroups()).toContain('trees');
    expect(mgr.getGroup('trees')!.objectIds).toEqual(['a', 'b']);
    mgr.removeGroup('trees');
    expect(mgr.getGroups()).not.toContain('trees');
  });

  it('addToGroup and removeFromGroup', () => {
    const mgr = createLODManager();
    mgr.createGroup({
      id: 'g1',
      objectIds: [],
      config: lodConfig,
      boundingCenter: [0, 0, 0],
      boundingRadius: 5,
      currentLevel: 0,
    });
    mgr.addToGroup('g1', 'obj1');
    expect(mgr.getGroup('g1')!.objectIds).toContain('obj1');
    mgr.removeFromGroup('g1', 'obj1');
    expect(mgr.getGroup('g1')!.objectIds).not.toContain('obj1');
  });

  it('on event fires on level change', () => {
    const mgr = createLODManager();
    mgr.register('box', lodConfig, [0, 0, 0]);
    const cb = vi.fn();
    mgr.on('levelChanged', cb);
    mgr.setCameraPosition([0, 0, 200]);
    mgr.update(0.016);
    expect(cb).toHaveBeenCalled();
  });

  it('on returns unsubscribe function', () => {
    const mgr = createLODManager();
    mgr.register('box', lodConfig, [0, 0, 0]);
    const cb = vi.fn();
    const unsub = mgr.on('levelChanged', cb);
    unsub();
    mgr.setCameraPosition([0, 0, 80]);
    mgr.update(0.016);
    expect(cb).not.toHaveBeenCalled();
  });

  it('start/stop/isRunning lifecycle', () => {
    const mgr = createLODManager();
    expect(mgr.isRunning()).toBe(false);
    mgr.start();
    expect(mgr.isRunning()).toBe(true);
    mgr.stop();
    expect(mgr.isRunning()).toBe(false);
  });

  it('clear removes all objects and groups', () => {
    const mgr = createLODManager();
    mgr.register('a', lodConfig);
    mgr.register('b', lodConfig);
    mgr.clear();
    expect(mgr.getRegisteredObjects().length).toBe(0);
  });

  it('createVRLODManager has 90fps target', () => {
    const mgr = createVRLODManager();
    expect(mgr.getOptions().targetFrameRate).toBe(90);
  });

  it('createMobileLODManager has 30fps target', () => {
    const mgr = createMobileLODManager();
    expect(mgr.getOptions().targetFrameRate).toBe(30);
    expect(mgr.getOptions().collectMetrics).toBe(false);
  });

  it('getMetrics returns stats', () => {
    const mgr = createLODManager();
    mgr.register('a', lodConfig, [0, 0, 0]);
    mgr.update(0.016);
    const metrics = mgr.getMetrics();
    expect(metrics.totalObjects).toBe(1);
  });
});
