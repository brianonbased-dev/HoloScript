/**
 * SceneInspector.test.ts
 *
 * Tests for scene debugging and inspection system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SceneInspector, type InspectorConfig } from '../SceneInspector';
import * as THREE from 'three';

describe('SceneInspector', () => {
  let inspector: SceneInspector;

  afterEach(() => {
    if (inspector) {
      inspector.dispose();
    }
  });

  describe('Construction', () => {
    it('should create inspector with default configuration', () => {
      inspector = new SceneInspector();
      expect(inspector).toBeDefined();

      const config = inspector.getConfig();
      expect(config.showFPS).toBe(true);
      expect(config.showMemory).toBe(true);
      expect(config.showAxes).toBe(true);
      expect(config.showGrid).toBe(true);
    });

    it('should create inspector with custom configuration', () => {
      const config: InspectorConfig = {
        showFPS: false,
        showMemory: false,
        showBoundingBoxes: true,
      };

      inspector = new SceneInspector(config);
      expect(inspector).toBeDefined();

      const actualConfig = inspector.getConfig();
      expect(actualConfig.showFPS).toBe(false);
      expect(actualConfig.showMemory).toBe(false);
      expect(actualConfig.showBoundingBoxes).toBe(true);
    });

    it('should create inspector with all features enabled', () => {
      const config: InspectorConfig = {
        showFPS: true,
        showMemory: true,
        showDrawCalls: true,
        showHierarchy: true,
        showBoundingBoxes: true,
        showWireframe: true,
        showNormals: true,
        showCameraFrustum: true,
        showAxes: true,
        showGrid: true,
      };

      inspector = new SceneInspector(config);
      expect(inspector).toBeDefined();
    });

    it('should create inspector with all features disabled', () => {
      const config: InspectorConfig = {
        showFPS: false,
        showMemory: false,
        showDrawCalls: false,
        showHierarchy: false,
        showBoundingBoxes: false,
        showWireframe: false,
        showNormals: false,
        showCameraFrustum: false,
        showAxes: false,
        showGrid: false,
      };

      inspector = new SceneInspector(config);

      const actualConfig = inspector.getConfig();
      expect(actualConfig.showFPS).toBe(false);
      expect(actualConfig.showAxes).toBe(false);
      expect(actualConfig.showGrid).toBe(false);
    });
  });

  describe('Configuration Management', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should get current configuration', () => {
      const config = inspector.getConfig();

      expect(config).toHaveProperty('showFPS');
      expect(config).toHaveProperty('showMemory');
      expect(config).toHaveProperty('showAxes');
      expect(config).toHaveProperty('showGrid');
    });

    it('should update configuration', () => {
      inspector.setConfig({
        showFPS: false,
        showBoundingBoxes: true,
      });

      const config = inspector.getConfig();
      expect(config.showFPS).toBe(false);
      expect(config.showBoundingBoxes).toBe(true);
    });

    it('should partially update configuration', () => {
      const originalConfig = inspector.getConfig();

      inspector.setConfig({ showFPS: false });

      const newConfig = inspector.getConfig();
      expect(newConfig.showFPS).toBe(false);
      expect(newConfig.showMemory).toBe(originalConfig.showMemory);
    });

    it('should handle multiple configuration updates', () => {
      inspector.setConfig({ showFPS: false });
      inspector.setConfig({ showMemory: false });
      inspector.setConfig({ showAxes: false });

      const config = inspector.getConfig();
      expect(config.showFPS).toBe(false);
      expect(config.showMemory).toBe(false);
      expect(config.showAxes).toBe(false);
    });
  });

  describe('Feature Toggles', () => {
    beforeEach(() => {
      inspector = new SceneInspector({ showAxes: true, showGrid: true });
    });

    it('should toggle features', () => {
      inspector.toggleFeature('showFPS');
      const config1 = inspector.getConfig();

      inspector.toggleFeature('showFPS');
      const config2 = inspector.getConfig();

      expect(config1.showFPS).not.toBe(config2.showFPS);
    });

    it('should set feature to specific value', () => {
      inspector.toggleFeature('showBoundingBoxes', true);
      expect(inspector.getConfig().showBoundingBoxes).toBe(true);

      inspector.toggleFeature('showBoundingBoxes', false);
      expect(inspector.getConfig().showBoundingBoxes).toBe(false);
    });

    it('should toggle all features', () => {
      const features: (keyof InspectorConfig)[] = [
        'showFPS',
        'showMemory',
        'showDrawCalls',
        'showBoundingBoxes',
        'showNormals',
        'showAxes',
        'showGrid',
      ];

      features.forEach((feature) => {
        expect(() => inspector.toggleFeature(feature)).not.toThrow();
      });
    });

    it('should handle axes toggle', () => {
      inspector.toggleFeature('showAxes', false);
      expect(inspector.getConfig().showAxes).toBe(false);

      inspector.toggleFeature('showAxes', true);
      expect(inspector.getConfig().showAxes).toBe(true);
    });

    it('should handle grid toggle', () => {
      inspector.toggleFeature('showGrid', false);
      expect(inspector.getConfig().showGrid).toBe(false);

      inspector.toggleFeature('showGrid', true);
      expect(inspector.getConfig().showGrid).toBe(true);
    });
  });

  describe('Object Inspection', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should get object information', () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      mesh.name = 'TestMesh';
      mesh.position.set(5, 10, 15);

      const info = inspector.getObjectInfo(mesh);

      expect(info.name).toBe('TestMesh');
      expect(info.type).toBe('Mesh');
      expect(info.position.x).toBe(5);
      expect(info.position.y).toBe(10);
      expect(info.position.z).toBe(15);
      expect(info.visible).toBe(true);
    });

    it('should handle objects without names', () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

      const info = inspector.getObjectInfo(mesh);
      expect(info.name).toBe('Unnamed');
    });

    it('should handle invisible objects', () => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      mesh.visible = false;

      const info = inspector.getObjectInfo(mesh);
      expect(info.visible).toBe(false);
    });

    it('should count triangles in mesh', () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry);

      const info = inspector.getObjectInfo(mesh);
      expect(info.triangles).toBeGreaterThan(0);
    });

    it('should handle objects with children', () => {
      const parent = new THREE.Object3D();
      const child1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
      const child2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));

      parent.add(child1, child2);

      const info = inspector.getObjectInfo(parent);
      expect(info.children).toBe(2);
    });
  });

  describe('Statistics Before Attachment', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should provide empty stats before attachment', () => {
      const stats = inspector.getStats();

      expect(stats.fps).toBe(0);
      expect(stats.frameTime).toBe(0);
      expect(stats.objectCount).toBe(0);
      expect(stats.triangleCount).toBe(0);
      expect(stats.drawCalls).toBe(0);
    });

    it('should provide empty hierarchy before attachment', () => {
      const hierarchy = inspector.getSceneHierarchy();
      expect(hierarchy).toHaveLength(0);
    });

    it('should handle findObject before attachment', () => {
      const found = inspector.findObject('test-uuid');
      expect(found).toBeNull();
    });

    it('should handle findObjectsByName before attachment', () => {
      const found = inspector.findObjectsByName('Test');
      expect(found).toHaveLength(0);
    });

    it('should handle findObjectsByType before attachment', () => {
      const found = inspector.findObjectsByType('Mesh');
      expect(found).toHaveLength(0);
    });
  });

  describe('Update Without Attachment', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should handle update without errors', () => {
      expect(() => inspector.update()).not.toThrow();
    });

    it('should handle multiple updates', () => {
      expect(() => {
        inspector.update();
        inspector.update();
        inspector.update();
      }).not.toThrow();
    });
  });

  describe('Detachment', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should handle detach without attach', () => {
      expect(() => inspector.detach()).not.toThrow();
    });

    it('should handle multiple detach calls', () => {
      inspector.detach();
      expect(() => inspector.detach()).not.toThrow();
    });
  });

  describe('Export', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should export statistics as JSON', () => {
      const exported = inspector.exportStats();

      expect(exported).toBeDefined();
      expect(typeof exported).toBe('string');
    });

    it('should export valid JSON', () => {
      const exported = inspector.exportStats();

      expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('should include required fields in export', () => {
      const exported = inspector.exportStats();
      const parsed = JSON.parse(exported);

      expect(parsed).toHaveProperty('stats');
      expect(parsed).toHaveProperty('hierarchy');
      expect(parsed).toHaveProperty('timestamp');
    });

    it('should include stats structure in export', () => {
      const exported = inspector.exportStats();
      const parsed = JSON.parse(exported);

      expect(parsed.stats).toHaveProperty('fps');
      expect(parsed.stats).toHaveProperty('frameTime');
      expect(parsed.stats).toHaveProperty('objectCount');
    });
  });

  describe('Resource Management', () => {
    it('should dispose inspector', () => {
      inspector = new SceneInspector();

      expect(() => inspector.dispose()).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
      inspector = new SceneInspector();

      inspector.dispose();
      expect(() => inspector.dispose()).not.toThrow();
    });

    it('should handle dispose without attachment', () => {
      inspector = new SceneInspector();

      expect(() => inspector.dispose()).not.toThrow();
    });

    it('should return empty stats after dispose', () => {
      inspector = new SceneInspector();

      inspector.dispose();

      const stats = inspector.getStats();
      expect(stats.objectCount).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should handle empty configuration object', () => {
      inspector.setConfig({});

      expect(inspector.getConfig()).toBeDefined();
    });

    it('should handle rapid configuration changes', () => {
      for (let i = 0; i < 10; i++) {
        inspector.toggleFeature('showFPS');
      }

      expect(inspector.getConfig()).toBeDefined();
    });

    it('should handle all features toggled simultaneously', () => {
      inspector.setConfig({
        showFPS: true,
        showMemory: true,
        showDrawCalls: true,
        showBoundingBoxes: true,
        showNormals: true,
        showAxes: true,
        showGrid: true,
      });

      expect(inspector.getConfig().showFPS).toBe(true);
      expect(inspector.getConfig().showAxes).toBe(true);
    });

    it('should handle object info for various object types', () => {
      const objects = [
        new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)),
        new THREE.Group(),
        new THREE.Object3D(),
        new THREE.DirectionalLight(),
        new THREE.PerspectiveCamera(),
      ];

      objects.forEach((obj) => {
        const info = inspector.getObjectInfo(obj);
        expect(info).toBeDefined();
        expect(info.type).toBeDefined();
        expect(info.uuid).toBeDefined();
      });
    });
  });

  describe('Configuration Validation', () => {
    it('should accept partial configuration', () => {
      inspector = new SceneInspector({ showFPS: false });

      expect(inspector.getConfig().showFPS).toBe(false);
      expect(inspector.getConfig().showMemory).toBe(true); // Default
    });

    it('should override defaults with provided config', () => {
      inspector = new SceneInspector({
        showAxes: false,
        showGrid: false,
      });

      expect(inspector.getConfig().showAxes).toBe(false);
      expect(inspector.getConfig().showGrid).toBe(false);
    });

    it('should handle all boolean configurations', () => {
      const allTrue: InspectorConfig = {
        showFPS: true,
        showMemory: true,
        showDrawCalls: true,
        showHierarchy: true,
        showBoundingBoxes: true,
        showWireframe: true,
        showNormals: true,
        showCameraFrustum: true,
        showAxes: true,
        showGrid: true,
      };

      inspector = new SceneInspector(allTrue);

      Object.values(inspector.getConfig()).forEach((value) => {
        expect(value).toBe(true);
      });
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(() => {
      inspector = new SceneInspector();
    });

    it('should initialize with zero FPS', () => {
      const stats = inspector.getStats();
      expect(stats.fps).toBe(0);
    });

    it('should update stats on update call', () => {
      inspector.update();
      const stats = inspector.getStats();

      expect(stats).toBeDefined();
      expect(stats.fps).toBeGreaterThanOrEqual(0);
    });

    it('should track multiple update calls', () => {
      for (let i = 0; i < 5; i++) {
        inspector.update();
      }

      const stats = inspector.getStats();
      expect(stats.fps).toBeGreaterThanOrEqual(0);
    });
  });
});
