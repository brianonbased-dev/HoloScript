/**
 * ProjectManager — production test suite
 *
 * Tests: constructor defaults, addScene/removeScene/getScene/getScenes,
 * getStartScene/setStartScene, addAsset/removeAsset/getAsset/getAssets,
 * findUnusedAssets, getTotalAssetSize, setBuildConfig/getBuildConfig,
 * setSetting/getSetting, serialize/deserialize roundtrip, getProjectFile.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProjectManager } from '../ProjectManager';
import type { ProjectAssetRef } from '../ProjectManager';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene(id: string, name = 'Test Scene') {
  return { id, name, path: `/scenes/${id}.json`, isStartScene: false };
}

function makeAsset(id: string, usedByScenes: string[] = [], sizeBytes = 1024): ProjectAssetRef {
  return { id, type: 'texture', path: `/assets/${id}.png`, usedByScenes, sizeBytes };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('ProjectManager: production', () => {
  let pm: ProjectManager;

  beforeEach(() => {
    pm = new ProjectManager('My Project', '1.2.0');
  });

  // ─── constructor ──────────────────────────────────────────────────────────
  describe('constructor defaults', () => {
    it('sets the project name', () => {
      expect(pm.getProjectFile().name).toBe('My Project');
    });

    it('sets the project version', () => {
      expect(pm.getProjectFile().version).toBe('1.2.0');
    });

    it('starts with empty scenes', () => {
      expect(pm.getScenes()).toHaveLength(0);
    });

    it('starts with empty assets', () => {
      expect(pm.getAssets()).toHaveLength(0);
    });

    it('default build target is development', () => {
      expect(pm.getBuildConfig().target).toBe('development');
    });
  });

  // ─── scene management ─────────────────────────────────────────────────────
  describe('scene management', () => {
    it('addScene adds a scene', () => {
      pm.addScene(makeScene('s1'));
      expect(pm.getScenes()).toHaveLength(1);
    });

    it('getScene returns scene by id', () => {
      pm.addScene(makeScene('s1', 'Level 1'));
      expect(pm.getScene('s1')?.name).toBe('Level 1');
    });

    it('getScene returns undefined for unknown id', () => {
      expect(pm.getScene('ghost')).toBeUndefined();
    });

    it('removeScene removes the scene', () => {
      pm.addScene(makeScene('s1'));
      expect(pm.removeScene('s1')).toBe(true);
      expect(pm.getScenes()).toHaveLength(0);
    });

    it('removeScene returns false for unknown id', () => {
      expect(pm.removeScene('ghost')).toBe(false);
    });

    it('addScene stamps lastModified', () => {
      pm.addScene(makeScene('s1'));
      expect(pm.getScene('s1')!.lastModified).toBeGreaterThan(0);
    });

    it('removeScene cleans scene id from asset usedByScenes', () => {
      pm.addScene(makeScene('s1'));
      pm.addAsset(makeAsset('tex1', ['s1']));
      pm.removeScene('s1');
      expect(pm.getAsset('tex1')!.usedByScenes).toHaveLength(0);
    });
  });

  // ─── start scene ─────────────────────────────────────────────────────────
  describe('start scene', () => {
    it('no start scene by default', () => {
      pm.addScene(makeScene('s1'));
      expect(pm.getStartScene()).toBeUndefined();
    });

    it('setStartScene marks the scene as start', () => {
      pm.addScene(makeScene('s1'));
      pm.addScene(makeScene('s2'));
      pm.setStartScene('s1');
      expect(pm.getStartScene()?.id).toBe('s1');
    });

    it('setStartScene clears previous start scene', () => {
      pm.addScene(makeScene('s1'));
      pm.addScene(makeScene('s2'));
      pm.setStartScene('s1');
      pm.setStartScene('s2');
      const start = pm.getStartScene();
      expect(start?.id).toBe('s2');
      expect(pm.getScene('s1')?.isStartScene).toBe(false);
    });

    it('setStartScene returns false for unknown scene id', () => {
      expect(pm.setStartScene('ghost')).toBe(false);
    });
  });

  // ─── asset management ─────────────────────────────────────────────────────
  describe('asset management', () => {
    it('addAsset adds the asset', () => {
      pm.addAsset(makeAsset('tex1'));
      expect(pm.getAssets()).toHaveLength(1);
    });

    it('getAsset returns asset by id', () => {
      pm.addAsset(makeAsset('tex1'));
      expect(pm.getAsset('tex1')?.type).toBe('texture');
    });

    it('getAsset returns undefined for unknown id', () => {
      expect(pm.getAsset('ghost')).toBeUndefined();
    });

    it('removeAsset removes the asset', () => {
      pm.addAsset(makeAsset('tex1'));
      expect(pm.removeAsset('tex1')).toBe(true);
      expect(pm.getAssets()).toHaveLength(0);
    });

    it('removeAsset returns false for unknown id', () => {
      expect(pm.removeAsset('ghost')).toBe(false);
    });
  });

  // ─── findUnusedAssets ────────────────────────────────────────────────────
  describe('findUnusedAssets', () => {
    it('returns assets with no scene references', () => {
      pm.addAsset(makeAsset('unused', []));
      pm.addAsset(makeAsset('used', ['s1']));
      const unused = pm.findUnusedAssets();
      expect(unused.map(a => a.id)).toContain('unused');
      expect(unused.map(a => a.id)).not.toContain('used');
    });

    it('returns empty when all assets are used', () => {
      pm.addAsset(makeAsset('tex1', ['s1']));
      expect(pm.findUnusedAssets()).toHaveLength(0);
    });
  });

  // ─── getTotalAssetSize ────────────────────────────────────────────────────
  describe('getTotalAssetSize', () => {
    it('returns 0 with no assets', () => {
      expect(pm.getTotalAssetSize()).toBe(0);
    });

    it('sums asset sizes correctly', () => {
      pm.addAsset(makeAsset('a1', [], 500));
      pm.addAsset(makeAsset('a2', [], 1500));
      expect(pm.getTotalAssetSize()).toBe(2000);
    });
  });

  // ─── build config ─────────────────────────────────────────────────────────
  describe('build config', () => {
    it('setBuildConfig updates target', () => {
      pm.setBuildConfig({ target: 'production' });
      expect(pm.getBuildConfig().target).toBe('production');
    });

    it('setBuildConfig is partial (does not clear other fields)', () => {
      pm.setBuildConfig({ optimizeAssets: true });
      expect(pm.getBuildConfig().target).toBe('development'); // unchanged
    });

    it('setBuildConfig updates outputDir', () => {
      pm.setBuildConfig({ outputDir: './build' });
      expect(pm.getBuildConfig().outputDir).toBe('./build');
    });
  });

  // ─── settings ─────────────────────────────────────────────────────────────
  describe('settings', () => {
    it('setSetting / getSetting round-trips', () => {
      pm.setSetting('gravity', 9.8);
      expect(pm.getSetting<number>('gravity')).toBe(9.8);
    });

    it('getSetting returns undefined for unknown key', () => {
      expect(pm.getSetting('nope')).toBeUndefined();
    });

    it('can store complex values', () => {
      pm.setSetting('config', { debug: true });
      expect((pm.getSetting<any>('config')).debug).toBe(true);
    });
  });

  // ─── serialize / deserialize ──────────────────────────────────────────────
  describe('serialize / deserialize', () => {
    it('serialize returns valid JSON', () => {
      expect(() => JSON.parse(pm.serialize())).not.toThrow();
    });

    it('deserialize restores project name', () => {
      pm.addScene(makeScene('s1'));
      const json = pm.serialize();
      const restored = ProjectManager.deserialize(json);
      expect(restored.getProjectFile().name).toBe('My Project');
    });

    it('deserialize restores scenes', () => {
      pm.addScene(makeScene('s1', 'Level 1'));
      const restored = ProjectManager.deserialize(pm.serialize());
      expect(restored.getScene('s1')?.name).toBe('Level 1');
    });

    it('deserialize restores build config', () => {
      pm.setBuildConfig({ target: 'production' });
      const restored = ProjectManager.deserialize(pm.serialize());
      expect(restored.getBuildConfig().target).toBe('production');
    });
  });

  // ─── getProjectFile ───────────────────────────────────────────────────────
  describe('getProjectFile', () => {
    it('returns a ProjectFile object with correct structure', () => {
      pm.addScene(makeScene('s1'));
      const file = pm.getProjectFile();
      expect(file).toHaveProperty('name');
      expect(file).toHaveProperty('scenes');
      expect(file.scenes.length).toBe(1);
    });
  });
});
