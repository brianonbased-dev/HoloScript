/**
 * ProjectManager Unit Tests
 *
 * Tests project lifecycle: scenes, assets, build config,
 * settings, serialization, and dependency tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectManager } from '../ProjectManager';

describe('ProjectManager', () => {
  let pm: ProjectManager;

  beforeEach(() => {
    pm = new ProjectManager('TestProject', '2.0.0');
  });

  describe('construction', () => {
    it('should create project with name and version', () => {
      const pf = pm.getProjectFile();
      expect(pf.name).toBe('TestProject');
      expect(pf.version).toBe('2.0.0');
    });

    it('should default version to 1.0.0', () => {
      const p = new ProjectManager('Minimal');
      expect(p.getProjectFile().version).toBe('1.0.0');
    });

    it('should default build config to development', () => {
      expect(pm.getBuildConfig().target).toBe('development');
    });
  });

  describe('scene management', () => {
    it('should add and retrieve scenes', () => {
      pm.addScene({ id: 's1', name: 'Main', path: '/main.hs', isStartScene: true });
      expect(pm.getScenes().length).toBe(1);
      expect(pm.getScene('s1')?.name).toBe('Main');
    });

    it('should remove scenes', () => {
      pm.addScene({ id: 's1', name: 'Main', path: '/main.hs', isStartScene: false });
      expect(pm.removeScene('s1')).toBe(true);
      expect(pm.getScenes().length).toBe(0);
    });

    it('should return false for non-existent scene removal', () => {
      expect(pm.removeScene('nope')).toBe(false);
    });

    it('should track start scene', () => {
      pm.addScene({ id: 's1', name: 'A', path: '/a', isStartScene: true });
      pm.addScene({ id: 's2', name: 'B', path: '/b', isStartScene: false });
      expect(pm.getStartScene()?.id).toBe('s1');
    });

    it('should switch start scene', () => {
      pm.addScene({ id: 's1', name: 'A', path: '/a', isStartScene: true });
      pm.addScene({ id: 's2', name: 'B', path: '/b', isStartScene: false });
      pm.setStartScene('s2');
      expect(pm.getStartScene()?.id).toBe('s2');
    });

    it('should clean asset references when removing scene', () => {
      pm.addScene({ id: 's1', name: 'A', path: '/a', isStartScene: false });
      pm.addAsset({
        id: 'a1',
        type: 'texture',
        path: '/t.png',
        usedByScenes: ['s1'],
        sizeBytes: 1024,
      });
      pm.removeScene('s1');
      expect(pm.getAsset('a1')!.usedByScenes).not.toContain('s1');
    });
  });

  describe('asset management', () => {
    it('should add and retrieve assets', () => {
      pm.addAsset({ id: 'a1', type: 'model', path: '/m.glb', usedByScenes: [], sizeBytes: 2048 });
      expect(pm.getAssets().length).toBe(1);
      expect(pm.getAsset('a1')?.type).toBe('model');
    });

    it('should remove assets', () => {
      pm.addAsset({ id: 'a1', type: 'model', path: '/m.glb', usedByScenes: [], sizeBytes: 2048 });
      expect(pm.removeAsset('a1')).toBe(true);
      expect(pm.getAssets().length).toBe(0);
    });

    it('should find unused assets', () => {
      pm.addAsset({
        id: 'a1',
        type: 'texture',
        path: '/t.png',
        usedByScenes: ['s1'],
        sizeBytes: 1024,
      });
      pm.addAsset({ id: 'a2', type: 'audio', path: '/s.wav', usedByScenes: [], sizeBytes: 4096 });
      const unused = pm.findUnusedAssets();
      expect(unused.length).toBe(1);
      expect(unused[0].id).toBe('a2');
    });

    it('should calculate total asset size', () => {
      pm.addAsset({ id: 'a1', type: 'x', path: '/a', usedByScenes: [], sizeBytes: 100 });
      pm.addAsset({ id: 'a2', type: 'x', path: '/b', usedByScenes: [], sizeBytes: 200 });
      expect(pm.getTotalAssetSize()).toBe(300);
    });
  });

  describe('build config', () => {
    it('should update partial build config', () => {
      pm.setBuildConfig({ target: 'production', minifyScripts: true });
      const cfg = pm.getBuildConfig();
      expect(cfg.target).toBe('production');
      expect(cfg.minifyScripts).toBe(true);
      expect(cfg.outputDir).toBe('./dist');
    });
  });

  describe('settings', () => {
    it('should set and get arbitrary settings', () => {
      pm.setSetting('gravity', 9.81);
      expect(pm.getSetting<number>('gravity')).toBe(9.81);
    });

    it('should return undefined for missing setting', () => {
      expect(pm.getSetting('nope')).toBeUndefined();
    });
  });

  describe('serialization', () => {
    it('should round-trip via serialize/deserialize', () => {
      pm.addScene({ id: 's1', name: 'Main', path: '/m', isStartScene: true });
      pm.setSetting('foo', 'bar');
      const json = pm.serialize();
      const restored = ProjectManager.deserialize(json);
      expect(restored.getProjectFile().name).toBe('TestProject');
      expect(restored.getScenes().length).toBe(1);
      expect(restored.getSetting('foo')).toBe('bar');
    });
  });
});
