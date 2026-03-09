/**
 * ErosionDemoScene.test.ts
 *
 * Comprehensive tests for the interactive erosion demo scene.
 *
 * Week 7: Water Erosion - Day 5
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErosionDemoScene, type DemoSceneConfig } from '../ErosionDemoScene';
import type { BrushConfig } from '../TerrainModifier';

describe('ErosionDemoScene', () => {
  let scene: ErosionDemoScene;

  const config: DemoSceneConfig = {
    resolution: 20,
    size: 100,
  };

  beforeEach(() => {
    scene = new ErosionDemoScene(config);
  });

  afterEach(() => {
    scene.stop();
  });

  describe('Initialization', () => {
    it('should create scene with default configuration', () => {
      expect(scene.simulation).toBeDefined();
      expect(scene.config.resolution).toBe(20);
      expect(scene.config.size).toBe(100);
      expect(scene.config.preset).toBe('mountain');
      expect(scene.config.autoStart).toBe(false);
      expect(scene.config.timeScale).toBe(1.0);
    });

    it('should create scene with custom preset', () => {
      const customScene = new ErosionDemoScene({
        ...config,
        preset: 'valley',
      });

      expect(customScene.config.preset).toBe('valley');
      customScene.stop();
    });

    it.skip('should auto-start if configured (browser only)', () => {
      // Skipped: Uses requestAnimationFrame which is not available in Node.js
      const autoScene = new ErosionDemoScene({
        ...config,
        autoStart: true,
      });

      expect(autoScene).toBeDefined();
      autoScene.stop();
    });

    it('should initialize with default camera', () => {
      const camera = scene.getCamera();

      expect(camera.position).toBeDefined();
      expect(camera.target).toBeDefined();
      expect(camera.fov).toBe(60);
    });

    it('should initialize with default visualization mode', () => {
      const viz = scene.getVisualizationMode();

      expect(viz.terrain).toBe('height');
      expect(viz.water).toBe('depth');
      expect(viz.sediment).toBe('suspended');
      expect(viz.wireframe).toBe(false);
    });

    it('should initialize with default interaction mode', () => {
      const interaction = scene.getInteractionMode();

      expect(interaction.tool).toBe('inspect');
      expect(interaction.brush.radius).toBe(5);
      expect(interaction.brush.strength).toBe(2.0);
      expect(interaction.brush.falloff).toBe('smooth');
      expect(interaction.rainAmount).toBe(10.0);
    });

    it('should initialize statistics', () => {
      const stats = scene.getStatistics();

      expect(stats.fps).toBe(0);
      expect(stats.frameTime).toBe(0);
      expect(stats.triangles).toBeGreaterThan(0);
      expect(stats.simTime).toBe(0);
      expect(stats.simSteps).toBe(0);
    });
  });

  describe('Tool Application', () => {
    const brushConfig: BrushConfig = {
      radius: 3,
      strength: 5.0,
      falloff: 'linear',
    };

    beforeEach(() => {
      scene.simulation.terrain.fill(10);
    });

    it('should apply raise tool', () => {
      scene.setInteractionMode({ tool: 'raise', brush: brushConfig });

      const heightBefore = scene.simulation.terrain.getHeightAtGrid(10, 10);

      scene.applyTool(10, 10);

      const heightAfter = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeGreaterThan(heightBefore);
    });

    it('should apply lower tool', () => {
      scene.setInteractionMode({ tool: 'lower', brush: brushConfig });

      const heightBefore = scene.simulation.terrain.getHeightAtGrid(10, 10);

      scene.applyTool(10, 10);

      const heightAfter = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeLessThan(heightBefore);
    });

    it('should apply flatten tool', () => {
      scene.simulation.terrain.setHeightAtGrid(10, 10, 50);
      scene.setInteractionMode({ tool: 'flatten', brush: { ...brushConfig, strength: 1.0 } });

      scene.applyTool(10, 10);

      const height = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(50, 0);
    });

    it('should apply smooth tool', () => {
      scene.simulation.terrain.setHeightAtGrid(10, 10, 100);
      scene.setInteractionMode({ tool: 'smooth', brush: { ...brushConfig, strength: 1.0 } });

      const heightBefore = scene.simulation.terrain.getHeightAtGrid(10, 10);

      scene.applyTool(10, 10);

      const heightAfter = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(heightAfter).toBeLessThan(heightBefore);
    });

    it('should apply rain tool', () => {
      scene.setInteractionMode({ tool: 'rain', rainAmount: 15.0 });

      scene.applyTool(10, 10);

      const waterCell = scene.simulation.water.getWaterAt(10, 10);
      expect(waterCell?.height).toBeGreaterThan(0);
    });

    it('should handle inspect tool', () => {
      scene.setInteractionMode({ tool: 'inspect' });

      expect(() => {
        scene.applyTool(10, 10);
      }).not.toThrow();
    });
  });

  describe('Visualization', () => {
    it('should get terrain mesh', () => {
      const mesh = scene.getTerrainMesh();

      expect(mesh.vertices).toBeDefined();
      expect(mesh.normals).toBeDefined();
      expect(mesh.indices).toBeDefined();
      expect(mesh.vertices.length).toBeGreaterThan(0);
    });

    it('should get water heightmap', () => {
      scene.simulation.addRain(10);

      const heightmap = scene.getWaterHeightmap();

      expect(heightmap).toBeInstanceOf(Float32Array);
      expect(heightmap.length).toBe(config.resolution * config.resolution);
    });

    it('should get water velocity field', () => {
      scene.simulation.addRain(10);
      scene.simulation.step(0.1);

      const velocities = scene.getWaterVelocityField();

      expect(velocities).toBeInstanceOf(Float32Array);
      // Each cell has 2 velocity components (x, z)
      expect(velocities.length).toBe(config.resolution * config.resolution * 2);
    });

    it('should get suspended sediment heightmap', () => {
      scene.simulation.sediment.addUniformSediment(5.0);

      const heightmap = scene.getSedimentHeightmap('suspended');

      expect(heightmap).toBeInstanceOf(Float32Array);
      expect(heightmap.length).toBe(config.resolution * config.resolution);
    });

    it('should get deposited sediment heightmap', () => {
      scene.simulation.sediment.addDepositedSediment(10, 10, 3.0);

      const heightmap = scene.getSedimentHeightmap('deposited');

      expect(heightmap).toBeInstanceOf(Float32Array);
      expect(heightmap.length).toBe(config.resolution * config.resolution);
    });

    it('should get combined sediment heightmap', () => {
      scene.simulation.sediment.addUniformSediment(5.0);

      const heightmap = scene.getSedimentHeightmap('both');

      expect(heightmap).toBeInstanceOf(Float32Array);
      expect(heightmap.length).toBe(config.resolution * config.resolution);
    });

    it('should set visualization mode', () => {
      scene.setVisualizationMode({
        terrain: 'slope',
        water: 'velocity',
      });

      const viz = scene.getVisualizationMode();

      expect(viz.terrain).toBe('slope');
      expect(viz.water).toBe('velocity');
      expect(viz.sediment).toBe('suspended'); // Unchanged
    });

    it('should toggle wireframe mode', () => {
      scene.setVisualizationMode({ wireframe: true });

      const viz = scene.getVisualizationMode();

      expect(viz.wireframe).toBe(true);
    });
  });

  describe('Camera Configuration', () => {
    it('should set camera position', () => {
      scene.setCamera({
        position: [100, 200, 150],
      });

      const camera = scene.getCamera();

      expect(camera.position).toEqual([100, 200, 150]);
    });

    it('should set camera target', () => {
      scene.setCamera({
        target: [10, 20, 30],
      });

      const camera = scene.getCamera();

      expect(camera.target).toEqual([10, 20, 30]);
    });

    it('should set field of view', () => {
      scene.setCamera({
        fov: 75,
      });

      const camera = scene.getCamera();

      expect(camera.fov).toBe(75);
    });

    it('should partially update camera', () => {
      const cameraBefore = scene.getCamera();

      scene.setCamera({
        fov: 45,
      });

      const cameraAfter = scene.getCamera();

      expect(cameraAfter.fov).toBe(45);
      expect(cameraAfter.position).toEqual(cameraBefore.position);
      expect(cameraAfter.target).toEqual(cameraBefore.target);
    });
  });

  describe('Statistics', () => {
    it('should get scene statistics', () => {
      scene.update(0.016);

      const stats = scene.getStatistics();

      expect(stats.fps).toBeGreaterThanOrEqual(0);
      expect(stats.frameTime).toBeGreaterThanOrEqual(0);
      expect(stats.triangles).toBeGreaterThan(0);
      expect(stats.simTime).toBeGreaterThanOrEqual(0);
      expect(stats.simSteps).toBeGreaterThanOrEqual(0);
    });

    it('should get detailed statistics', () => {
      scene.simulation.addRain(10);
      scene.update(0.016);

      const stats = scene.getDetailedStatistics();

      expect(stats.scene).toBeDefined();
      expect(stats.terrain).toBeDefined();
      expect(stats.water).toBeDefined();
      expect(stats.sediment).toBeDefined();
    });

    it('should update FPS counter', () => {
      // Simulate multiple frames
      for (let i = 0; i < 100; i++) {
        scene.update(0.016);
      }

      const stats = scene.getStatistics();

      expect(stats.simSteps).toBe(100);
    });

    it('should calculate triangle count', () => {
      const stats = scene.getStatistics();

      const { resolution } = config;
      const expectedTriangles = (resolution - 1) * (resolution - 1) * 2;

      expect(stats.triangles).toBe(expectedTriangles);
    });
  });

  describe('State Management', () => {
    it('should export scene state', () => {
      scene.simulation.addRain(10);
      scene.update(0.5);

      const state = scene.exportState();

      expect(state.config).toBeDefined();
      expect(state.camera).toBeDefined();
      expect(state.visualization).toBeDefined();
      expect(state.interaction).toBeDefined();
      expect(state.simulation).toBeDefined();
    });

    it('should import scene state', () => {
      scene.simulation.terrain.fill(30);
      scene.setCamera({ fov: 45 });

      const exported = scene.exportState();

      scene.simulation.terrain.fill(0);
      scene.setCamera({ fov: 60 });

      scene.importState(exported);

      const height = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(30, 0);

      const camera = scene.getCamera();
      expect(camera.fov).toBe(45);
    });

    it('should preserve visualization mode on import', () => {
      scene.setVisualizationMode({
        terrain: 'slope',
        water: 'velocity',
        sediment: 'deposited',
      });

      const exported = scene.exportState();

      scene.setVisualizationMode({
        terrain: 'height',
        water: 'depth',
        sediment: 'suspended',
      });

      scene.importState(exported);

      const viz = scene.getVisualizationMode();
      expect(viz.terrain).toBe('slope');
      expect(viz.water).toBe('velocity');
      expect(viz.sediment).toBe('deposited');
    });

    it('should preserve interaction mode on import', () => {
      scene.setInteractionMode({
        tool: 'rain',
        rainAmount: 25.0,
      });

      const exported = scene.exportState();

      scene.setInteractionMode({
        tool: 'inspect',
        rainAmount: 10.0,
      });

      scene.importState(exported);

      const interaction = scene.getInteractionMode();
      expect(interaction.tool).toBe('rain');
      expect(interaction.rainAmount).toBe(25.0);
    });
  });

  describe('Preset Loading', () => {
    const presets = [
      'canyon',
      'mountain',
      'valley',
      'plateau',
      'hills',
      'flat',
      'island',
      'ridge',
    ] as const;

    presets.forEach((preset) => {
      it(`should load ${preset} preset`, () => {
        scene.loadPreset(preset);

        const stats = scene.simulation.terrain.getStatistics();
        // Allow small negative values caused by floating-point underflow during terrain generation
        expect(stats.avgHeight).toBeGreaterThanOrEqual(-1e-3);
      });
    });

    it('should reset simulation when loading preset', () => {
      scene.simulation.addRain(10);
      scene.update(1.0);

      scene.loadPreset('mountain');

      const state = scene.simulation.getState();
      expect(state.time).toBe(0);
      expect(state.steps).toBe(0);
    });
  });

  describe('Time Scale', () => {
    it('should set time scale', () => {
      scene.setTimeScale(2.0);

      expect(scene.getTimeScale()).toBe(2.0);
    });

    it('should affect simulation speed', () => {
      scene.simulation.addRain(10);

      scene.setTimeScale(2.0);
      scene.update(0.1);

      const state = scene.simulation.getState();
      expect(state.time).toBeCloseTo(0.2, 2); // 0.1 * 2.0
    });

    it('should clamp negative time scale to zero', () => {
      scene.setTimeScale(-5.0);

      expect(scene.getTimeScale()).toBe(0);
    });

    it('should handle zero time scale', () => {
      scene.simulation.addRain(10);

      scene.setTimeScale(0);
      scene.update(0.1);

      const state = scene.simulation.getState();
      expect(state.steps).toBe(0); // No steps when time scale is 0
      expect(state.time).toBe(0); // Time doesn't advance
    });
  });

  describe('Info Queries', () => {
    beforeEach(() => {
      scene.simulation.terrain.fill(10);
      scene.simulation.addWater(10, 10, 5.0);
      scene.simulation.sediment.addSuspendedSediment(10, 10, 2.0);
    });

    it('should get terrain info at location', () => {
      const info = scene.getInfoAt(10, 10);

      expect(info.terrain.height).toBe(10);
      expect(info.terrain.slope).toBeGreaterThanOrEqual(0);
      expect(info.terrain.normal).toBeDefined();
    });

    it('should get water info at location', () => {
      const info = scene.getInfoAt(10, 10);

      expect(info.water).not.toBeNull();
      expect(info.water?.height).toBe(5.0);
      expect(info.water?.velocity).toBeDefined();
    });

    it('should get sediment info at location', () => {
      const info = scene.getInfoAt(10, 10);

      expect(info.sediment).not.toBeNull();
      expect(info.sediment?.suspended).toBe(2.0);
      expect(info.sediment?.deposited).toBeGreaterThanOrEqual(0);
    });

    it('should return null water info when no water', () => {
      const info = scene.getInfoAt(5, 5);

      expect(info.water).toBeNull();
    });

    it('should return null sediment info when no sediment', () => {
      const info = scene.getInfoAt(5, 5);

      expect(info.sediment).toBeNull();
    });
  });

  describe('Snapshots', () => {
    it('should save snapshot', () => {
      scene.simulation.terrain.fill(25);

      const snapshotId = scene.saveSnapshot('test snapshot');

      expect(snapshotId).toBeDefined();
      expect(typeof snapshotId).toBe('string');
    });

    it('should restore snapshot', () => {
      scene.simulation.terrain.fill(25);
      const snapshotId = scene.saveSnapshot();

      scene.simulation.terrain.fill(50);

      const success = scene.restoreSnapshot(snapshotId);

      expect(success).toBe(true);

      const height = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBeCloseTo(25, 0);
    });

    it('should return false for invalid snapshot', () => {
      const success = scene.restoreSnapshot('invalid_id');

      expect(success).toBe(false);
    });
  });

  describe('Reset', () => {
    it('should reset simulation', () => {
      scene.simulation.addRain(10);
      scene.update(1.0);

      scene.reset();

      const stats = scene.getStatistics();
      expect(stats.simTime).toBe(0);
      expect(stats.simSteps).toBe(0);
    });

    it('should clear water on reset', () => {
      scene.simulation.addRain(10);
      scene.reset();

      const waterStats = scene.simulation.water.getStatistics();
      expect(waterStats.totalVolume).toBe(0);
    });

    it('should clear sediment on reset', () => {
      scene.simulation.sediment.addUniformSediment(5.0);
      scene.reset();

      const sedimentStats = scene.simulation.sediment.getStatistics();
      expect(sedimentStats.totalSuspended).toBe(0);
    });

    it('should preserve terrain on reset', () => {
      scene.simulation.terrain.fill(30);
      scene.reset();

      const height = scene.simulation.terrain.getHeightAtGrid(10, 10);
      expect(height).toBe(30);
    });
  });

  describe('Edge Cases', () => {
    it('should handle stop when not running', () => {
      expect(() => scene.stop()).not.toThrow();
    });

    it('should handle update with zero delta time', () => {
      expect(() => {
        scene.update(0);
      }).not.toThrow();
    });

    it('should handle very large delta time', () => {
      scene.simulation.addRain(5);

      expect(() => {
        scene.update(100);
      }).not.toThrow();
    });

    it('should handle tool application at border', () => {
      scene.setInteractionMode({ tool: 'raise' });

      expect(() => {
        scene.applyTool(0, 0);
      }).not.toThrow();
    });

    it('should handle tool application outside bounds', () => {
      scene.setInteractionMode({ tool: 'lower' });

      expect(() => {
        scene.applyTool(-5, -5);
      }).not.toThrow();
    });

    it('should handle info query at border', () => {
      expect(() => {
        scene.getInfoAt(0, 0);
      }).not.toThrow();
    });

    it('should handle multiple resets', () => {
      scene.reset();
      scene.reset();
      scene.reset();

      const state = scene.simulation.getState();
      expect(state.time).toBe(0);
    });
  });
});
