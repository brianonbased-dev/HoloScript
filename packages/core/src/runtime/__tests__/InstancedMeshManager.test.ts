/**
 * Tests for InstancedMeshManager
 *
 * Verifies GPU instancing system for massive object rendering
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstancedMeshManager, type InstancedObjectData, type InstanceBatchConfig } from '../InstancedMeshManager';
import * as THREE from 'three';

describe('InstancedMeshManager', () => {
  let manager: InstancedMeshManager;

  beforeEach(() => {
    manager = new InstancedMeshManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  describe('Instance Management', () => {
    it('should add instances', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      const instance: InstancedObjectData = {
        id: 'test_1',
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      };

      const success = manager.addInstance(instance, config);
      expect(success).toBe(true);

      const stats = manager.getStats();
      expect(stats.totalInstances).toBe(1);
      expect(stats.totalBatches).toBe(1);
    });

    it('should add multiple instances to same batch', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      for (let i = 0; i < 100; i++) {
        manager.addInstance(
          {
            id: `instance_${i}`,
            position: [i, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          config
        );
      }

      const stats = manager.getStats();
      expect(stats.totalInstances).toBe(100);
      expect(stats.totalBatches).toBe(1); // All in one batch
    });

    it('should create separate batches for different geometries', () => {
      const boxConfig: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      const sphereConfig: InstanceBatchConfig = {
        geometryType: 'sphere',
        geometryParams: { radius: 1, segments: 16 },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      manager.addInstance(
        { id: 'box_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        boxConfig
      );

      manager.addInstance(
        { id: 'sphere_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        sphereConfig
      );

      const stats = manager.getStats();
      expect(stats.totalBatches).toBe(2); // Separate batches
      expect(stats.totalInstances).toBe(2);
    });

    it('should create separate batches for different materials', () => {
      const redConfig: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      const blueConfig: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#0000ff' },
        maxInstances: 1000,
      };

      manager.addInstance(
        { id: 'red_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        redConfig
      );

      manager.addInstance(
        { id: 'blue_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        blueConfig
      );

      const stats = manager.getStats();
      expect(stats.totalBatches).toBe(2); // Different materials = different batches
    });

    it('should update instance transform', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const success = manager.updateInstance('test_1', {
        position: [10, 20, 30],
        rotation: [Math.PI / 4, 0, 0],
        scale: [2, 2, 2],
      });

      expect(success).toBe(true);
    });

    it('should update instance color', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const success = manager.updateInstance('test_1', {
        color: '#00ff00',
      });

      expect(success).toBe(true);
    });

    it('should remove instances', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      let stats = manager.getStats();
      expect(stats.totalInstances).toBe(1);

      const success = manager.removeInstance('test_1');
      expect(success).toBe(true);

      stats = manager.getStats();
      expect(stats.totalInstances).toBe(0);
    });

    it('should handle removing non-existent instance', () => {
      const success = manager.removeInstance('non_existent');
      expect(success).toBe(false);
    });

    it('should handle updating non-existent instance', () => {
      const success = manager.updateInstance('non_existent', { position: [0, 0, 0] });
      expect(success).toBe(false);
    });
  });

  describe('Performance & Scalability', () => {
    it('should handle 10,000 instances efficiently', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [0.5, 0.5, 0.5] },
        material: { type: 'standard', color: '#808080', roughness: 0.7 },
        maxInstances: 10000,
      };

      const startTime = performance.now();

      for (let i = 0; i < 10000; i++) {
        manager.addInstance(
          {
            id: `fragment_${i}`,
            position: [
              (i % 100) * 2,
              Math.floor(i / 100) * 2,
              0
            ],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
          },
          config
        );
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(1000); // Should complete in under 1 second

      const stats = manager.getStats();
      expect(stats.totalInstances).toBe(10000);
      expect(stats.totalBatches).toBe(1); // All in one batch for efficiency
    });

    it('should reuse freed instance slots', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 100,
      };

      // Add 50 instances
      for (let i = 0; i < 50; i++) {
        manager.addInstance(
          { id: `test_${i}`, position: [i, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          config
        );
      }

      // Remove 25 instances
      for (let i = 0; i < 25; i++) {
        manager.removeInstance(`test_${i}`);
      }

      // Add 25 more (should reuse freed slots)
      for (let i = 50; i < 75; i++) {
        const success = manager.addInstance(
          { id: `test_${i}`, position: [i, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          config
        );
        expect(success).toBe(true);
      }

      const stats = manager.getStats();
      expect(stats.totalInstances).toBe(50); // 25 remaining + 25 new
    });

    it('should handle batch capacity limits', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 10, // Small capacity
      };

      // Fill batch to capacity
      for (let i = 0; i < 10; i++) {
        const success = manager.addInstance(
          { id: `test_${i}`, position: [i, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          config
        );
        expect(success).toBe(true);
      }

      // Try to add one more (should fail)
      const overflow = manager.addInstance(
        { id: 'overflow', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      expect(overflow).toBe(false); // Batch is full
    });
  });

  describe('Geometry Types', () => {
    it('should create box geometry', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [2, 3, 4] },
        material: { type: 'standard' },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'box_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const meshes = manager.getMeshes();
      expect(meshes.length).toBe(1);
      expect(meshes[0].geometry).toBeInstanceOf(THREE.BufferGeometry);
    });

    it('should create sphere geometry', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'sphere',
        geometryParams: { radius: 2, segments: 32 },
        material: { type: 'standard' },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'sphere_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const meshes = manager.getMeshes();
      expect(meshes.length).toBe(1);
      expect(meshes[0].geometry).toBeInstanceOf(THREE.BufferGeometry);
    });

    it('should create cylinder geometry', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'cylinder',
        geometryParams: { radiusTop: 1, radiusBottom: 2, height: 5 },
        material: { type: 'standard' },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'cylinder_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const meshes = manager.getMeshes();
      expect(meshes.length).toBe(1);
      expect(meshes[0].geometry).toBeInstanceOf(THREE.BufferGeometry);
    });
  });

  describe('Material Types', () => {
    it('should create standard material', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        material: {
          type: 'standard',
          color: '#ff0000',
          metalness: 0.5,
          roughness: 0.7,
        },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const meshes = manager.getMeshes();
      expect(meshes[0].material).toBeInstanceOf(THREE.MeshStandardMaterial);
    });

    it('should create physical material', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        material: {
          type: 'physical',
          color: '#00ff00',
        },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const meshes = manager.getMeshes();
      expect(meshes[0].material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
    });

    it('should create basic material', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        material: {
          type: 'basic',
          color: '#0000ff',
        },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      const meshes = manager.getMeshes();
      expect(meshes[0].material).toBeInstanceOf(THREE.MeshBasicMaterial);
    });
  });

  describe('Statistics', () => {
    it('should provide accurate statistics', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        geometryParams: { size: [1, 1, 1] },
        material: { type: 'standard', color: '#ff0000' },
        maxInstances: 1000,
      };

      for (let i = 0; i < 250; i++) {
        manager.addInstance(
          { id: `test_${i}`, position: [i, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          config
        );
      }

      const stats = manager.getStats();
      expect(stats.totalBatches).toBe(1);
      expect(stats.totalInstances).toBe(250);

      const batchStats = Array.from(stats.batches.values())[0];
      expect(batchStats.activeCount).toBe(250);
      expect(batchStats.maxInstances).toBe(1000);
      expect(batchStats.utilization).toBe(25); // 25% utilization
    });
  });

  describe('Cleanup', () => {
    it('should clear all instances', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        material: { type: 'standard' },
        maxInstances: 100,
      };

      for (let i = 0; i < 10; i++) {
        manager.addInstance(
          { id: `test_${i}`, position: [i, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          config
        );
      }

      manager.clear();

      const stats = manager.getStats();
      expect(stats.totalInstances).toBe(0);
      expect(stats.totalBatches).toBe(0);
    });

    it('should dispose resources', () => {
      const config: InstanceBatchConfig = {
        geometryType: 'box',
        material: { type: 'standard' },
        maxInstances: 100,
      };

      manager.addInstance(
        { id: 'test_1', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        config
      );

      expect(() => manager.dispose()).not.toThrow();
    });
  });
});
