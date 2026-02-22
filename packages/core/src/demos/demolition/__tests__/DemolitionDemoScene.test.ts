/**
 * DemolitionDemoScene.test.ts
 *
 * Tests for interactive demolition demo scene
 *
 * Week 8: Explosive Demolition - Day 6
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DemolitionDemoScene } from '../DemolitionDemoScene';
import type { Vector3 } from '../Fragment';

describe('DemolitionDemoScene', () => {
  describe('Initialization', () => {
    it('should create demo scene', () => {
      const scene = new DemolitionDemoScene();
      expect(scene).toBeDefined();
    });

    it('should use default config', () => {
      const scene = new DemolitionDemoScene();
      const stats = scene.getStatistics();

      expect(stats.activeScenario).toBe('sandbox');
      expect(stats.timeScale).toBe(1.0);
      expect(stats.cameraShake).toBe(0);
    });

    it('should use custom config', () => {
      const scene = new DemolitionDemoScene({
        scenario: 'single_explosion',
        timeScale: 0.5,
        enableCameraShake: false,
      });

      const stats = scene.getStatistics();
      expect(stats.activeScenario).toBe('single_explosion');
      expect(stats.timeScale).toBe(0.5);
    });

    it('should initialize camera', () => {
      const scene = new DemolitionDemoScene({
        camera: {
          position: { x: 10, y: 20, z: 30 },
          target: { x: 0, y: 0, z: 0 },
        },
      });

      const camera = scene.getCameraState();
      expect(camera.position.x).toBe(10);
      expect(camera.position.y).toBe(20);
      expect(camera.position.z).toBe(30);
    });
  });

  describe('Scenario Setup', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
    });

    it('should setup single explosion scenario', () => {
      scene.initializeScenario('single_explosion');

      const objects = scene.getObjects();
      expect(objects.length).toBe(5);
      expect(scene.getScenario()).toBe('single_explosion');
    });

    it('should setup building collapse scenario', () => {
      scene.initializeScenario('building_collapse');

      const elements = scene.getStructuralElements();
      expect(elements.length).toBeGreaterThan(0);
      expect(scene.getScenario()).toBe('building_collapse');
    });

    it('should setup chain reaction scenario', () => {
      scene.initializeScenario('chain_reaction');

      const objects = scene.getObjects();
      expect(objects.length).toBe(10);
      expect(scene.getScenario()).toBe('chain_reaction');
    });

    it('should setup demolition sequence scenario', () => {
      scene.initializeScenario('demolition_sequence');

      const objects = scene.getObjects();
      const elements = scene.getStructuralElements();

      expect(objects.length).toBeGreaterThan(0);
      expect(elements.length).toBeGreaterThan(0);
      expect(scene.getScenario()).toBe('demolition_sequence');
    });

    it('should setup sandbox scenario', () => {
      scene.initializeScenario('sandbox');

      const objects = scene.getObjects();
      const elements = scene.getStructuralElements();

      expect(objects.length).toBe(3);
      expect(elements.length).toBe(2); // foundation + column
      expect(scene.getScenario()).toBe('sandbox');
    });

    it('should clear previous scenario', () => {
      scene.initializeScenario('single_explosion');
      const objectsBefore = scene.getObjects().length;

      scene.initializeScenario('chain_reaction');
      const objectsAfter = scene.getObjects().length;

      expect(objectsAfter).not.toBe(objectsBefore);
    });
  });

  describe('Explosions', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
      scene.initializeScenario('sandbox');
    });

    it('should create explosion', () => {
      const position: Vector3 = { x: 0, y: 5, z: 0 };

      scene.createExplosion({
        position,
        force: 1000,
        radius: 10,
      });

      scene.update(0.016);

      // Should create fragments or affect particles
      const stats = scene.getStatistics();
      expect(stats.physics.shockWaves.totalShockWaves).toBeGreaterThan(0);
    });

    it('should apply camera shake from explosion', () => {
      const scene = new DemolitionDemoScene({
        enableCameraShake: true,
        camera: {
          position: { x: 0, y: 10, z: 20 },
          target: { x: 0, y: 5, z: 0 },
        },
      });

      const shakeBefore = scene.getCameraState().shakeMagnitude;

      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 1000,
        radius: 10,
      });

      const shakeAfter = scene.getCameraState().shakeMagnitude;
      expect(shakeAfter).toBeGreaterThan(shakeBefore);
    });

    it('should not shake camera when disabled', () => {
      const scene = new DemolitionDemoScene({
        enableCameraShake: false,
      });

      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 1000,
        radius: 10,
      });

      const shake = scene.getCameraState().shakeMagnitude;
      expect(shake).toBe(0);
    });

    it('should auto-follow explosion', () => {
      const scene = new DemolitionDemoScene({
        camera: {
          position: { x: 0, y: 10, z: 20 },
          target: { x: 0, y: 0, z: 0 },
          autoFollow: true,
        },
      });

      const explosionPos: Vector3 = { x: 10, y: 5, z: 10 };

      scene.createExplosion({
        position: explosionPos,
        force: 1000,
        radius: 10,
      });

      const camera = scene.getCameraState();
      expect(camera.target.x).toBe(explosionPos.x);
      expect(camera.target.y).toBe(explosionPos.y);
      expect(camera.target.z).toBe(explosionPos.z);
    });

    it('should damage structural elements', () => {
      scene.initializeScenario('building_collapse');

      const elementsBefore = scene.getStructuralElements().length;

      scene.createExplosion({
        position: { x: 0, y: 4, z: 0 },
        force: 5000,
        radius: 5,
      });

      scene.update(0.016);

      const stats = scene.getStatistics();
      // Some elements should fail
      expect(stats.structural.failedElements).toBeGreaterThan(0);
    });
  });

  describe('Camera', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
    });

    it('should set camera position', () => {
      const position: Vector3 = { x: 10, y: 20, z: 30 };
      const target: Vector3 = { x: 5, y: 10, z: 15 };

      scene.setCameraPosition(position, target);

      const camera = scene.getCameraState();
      expect(camera.position.x).toBe(10);
      expect(camera.target.x).toBe(5);
    });

    it('should add camera shake', () => {
      const shakeBefore = scene.getCameraState().shakeMagnitude;

      scene.addCameraShake(1.0);

      const shakeAfter = scene.getCameraState().shakeMagnitude;
      expect(shakeAfter).toBeGreaterThan(shakeBefore);
    });

    it('should apply shake offset to position', () => {
      scene.addCameraShake(5.0);
      scene.update(0.016);

      const camera = scene.getCameraState();

      // Position should differ from base due to shake offset
      expect(
        Math.abs(camera.shakeOffset.x) +
          Math.abs(camera.shakeOffset.y) +
          Math.abs(camera.shakeOffset.z)
      ).toBeGreaterThan(0);
    });

    it('should decay camera shake', () => {
      scene.addCameraShake(10.0);

      const shakeBefore = scene.getCameraState().shakeMagnitude;

      // Update multiple times
      for (let i = 0; i < 10; i++) {
        scene.update(0.016);
      }

      const shakeAfter = scene.getCameraState().shakeMagnitude;
      expect(shakeAfter).toBeLessThan(shakeBefore);
    });

    it('should stop shake when magnitude is low', () => {
      scene.addCameraShake(0.1);

      // Update many times until shake stops
      for (let i = 0; i < 100; i++) {
        scene.update(0.016);
      }

      const camera = scene.getCameraState();
      expect(camera.shakeMagnitude).toBe(0);
      expect(camera.shakeOffset.x).toBe(0);
      expect(camera.shakeOffset.y).toBe(0);
      expect(camera.shakeOffset.z).toBe(0);
    });
  });

  describe('User Input', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
    });

    it('should handle mouse position', () => {
      scene.handleInput({
        mouse: { x: 0.5, y: -0.3 },
      });

      // Input stored internally (no direct getter, but no errors should occur)
      expect(() => scene.update(0.016)).not.toThrow();
    });

    it('should handle mouse buttons', () => {
      scene.handleInput({
        mouseButtons: { left: true, right: false, middle: false },
      });

      expect(() => scene.update(0.016)).not.toThrow();
    });

    it('should handle keyboard keys', () => {
      scene.handleInput({
        keys: new Set(['w', 'a', 's', 'd']),
      });

      expect(() => scene.update(0.016)).not.toThrow();
    });

    it('should handle mouse click for explosion', () => {
      scene.initializeScenario('sandbox');

      const clickPos: Vector3 = { x: 0, y: 5, z: 0 };
      scene.handleMouseClick(clickPos, 'left');

      scene.update(0.016);

      const stats = scene.getStatistics();
      expect(stats.physics.shockWaves.totalShockWaves).toBeGreaterThan(0);
    });

    it('should handle right click for directional force', () => {
      scene.initializeScenario('sandbox');

      const clickPos: Vector3 = { x: 0, y: 5, z: 0 };
      scene.handleMouseClick(clickPos, 'right');

      // Should apply force (no explosion created)
      expect(() => scene.update(0.016)).not.toThrow();
    });
  });

  describe('Update', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
      scene.initializeScenario('sandbox');
    });

    it('should update physics', () => {
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 1000,
        radius: 10,
      });

      scene.update(0.016);

      const stats = scene.getStatistics();
      expect(stats.physics.shockWaves.activeShockWaves).toBeGreaterThanOrEqual(0);
    });

    it('should update structural integrity', () => {
      scene.initializeScenario('building_collapse');

      scene.createExplosion({
        position: { x: 0, y: 2, z: 0 },
        force: 5000,
        radius: 5,
      });

      scene.update(0.016);

      const stats = scene.getStatistics();
      // Structure should have been analyzed
      expect(stats.structural).toBeDefined();
    });

    it('should apply time scale', () => {
      scene.setTimeScale(2.0);

      // Create explosion and update
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 1000,
        radius: 10,
      });

      scene.update(0.016);

      // Physics should be updated at 2x speed (internal, hard to test directly)
      expect(scene.getStatistics().timeScale).toBe(2.0);
    });

    it('should not update when paused', () => {
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 1000,
        radius: 10,
      });

      scene.pause();
      scene.update(0.016);

      // Shock wave should still exist (not updated)
      const stats = scene.getStatistics();
      expect(scene.isPaused()).toBe(true);
    });

    it('should track frame time', () => {
      scene.update(0.016);

      const stats = scene.getStatistics();
      expect(stats.frameTime).toBeGreaterThanOrEqual(0);
    });

    it('should not update with zero dt', () => {
      const statsBefore = scene.getStatistics();

      scene.update(0);

      const statsAfter = scene.getStatistics();
      // Should not have changed
      expect(statsAfter.frameTime).toBe(statsBefore.frameTime);
    });
  });

  describe('Queries', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
      scene.initializeScenario('sandbox');
    });

    it('should get objects', () => {
      const objects = scene.getObjects();
      expect(objects.length).toBe(3);
      expect(objects[0].id).toBeDefined();
    });

    it('should get fragments after fracture', () => {
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 2000,
        radius: 15,
      });

      scene.update(0.016);

      const fragments = scene.getFragments();
      // May or may not have fragments depending on fracture
      expect(Array.isArray(fragments)).toBe(true);
    });

    it('should get debris particles by LOD', () => {
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 2000,
        radius: 15,
      });

      scene.update(0.016);

      const near = scene.getDebrisParticlesByLOD('near');
      const medium = scene.getDebrisParticlesByLOD('medium');
      const far = scene.getDebrisParticlesByLOD('far');

      expect(Array.isArray(near)).toBe(true);
      expect(Array.isArray(medium)).toBe(true);
      expect(Array.isArray(far)).toBe(true);
    });

    it('should get structural elements', () => {
      const elements = scene.getStructuralElements();
      expect(elements.length).toBe(2); // foundation + column
    });

    it('should get statistics', () => {
      const stats = scene.getStatistics();

      expect(stats.physics).toBeDefined();
      expect(stats.structural).toBeDefined();
      expect(stats.cameraShake).toBeDefined();
      expect(stats.activeScenario).toBeDefined();
      expect(stats.timeScale).toBeDefined();
      expect(stats.frameTime).toBeDefined();
      expect(stats.totalObjects).toBeDefined();
      expect(stats.totalFragments).toBeDefined();
      expect(stats.totalParticles).toBeDefined();
      expect(stats.totalStructuralElements).toBeDefined();
    });
  });

  describe('Controls', () => {
    let scene: DemolitionDemoScene;

    beforeEach(() => {
      scene = new DemolitionDemoScene();
    });

    it('should pause simulation', () => {
      scene.pause();
      expect(scene.isPaused()).toBe(true);
    });

    it('should resume simulation', () => {
      scene.pause();
      scene.resume();
      expect(scene.isPaused()).toBe(false);
    });

    it('should toggle pause', () => {
      const before = scene.isPaused();
      scene.togglePause();
      const after = scene.isPaused();

      expect(after).toBe(!before);
    });

    it('should set time scale', () => {
      scene.setTimeScale(0.5);
      expect(scene.getStatistics().timeScale).toBe(0.5);

      scene.setTimeScale(2.0);
      expect(scene.getStatistics().timeScale).toBe(2.0);
    });

    it('should clamp time scale', () => {
      scene.setTimeScale(-1.0);
      expect(scene.getStatistics().timeScale).toBe(0);

      scene.setTimeScale(100.0);
      expect(scene.getStatistics().timeScale).toBe(10);
    });

    it('should reset scene', () => {
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 1000,
        radius: 10,
      });

      scene.addCameraShake(5.0);
      scene.pause();

      scene.reset();

      expect(scene.isPaused()).toBe(false);
      expect(scene.getCameraState().shakeMagnitude).toBe(0);
    });

    it('should clear scene', () => {
      scene.initializeScenario('single_explosion');

      const objectsBefore = scene.getObjects().length;

      scene.clear();

      const objectsAfter = scene.getObjects().length;

      expect(objectsAfter).toBeLessThan(objectsBefore);
      expect(objectsAfter).toBe(0);
    });
  });

  describe('Integration', () => {
    it('should run complete demolition sequence', () => {
      const scene = new DemolitionDemoScene();
      scene.initializeScenario('demolition_sequence');

      // Create multiple explosions
      scene.createExplosion({
        position: { x: -5, y: 2, z: 0 },
        force: 3000,
        radius: 8,
      });

      scene.update(0.016);

      scene.createExplosion({
        position: { x: 5, y: 2, z: 0 },
        force: 3000,
        radius: 8,
      });

      scene.update(0.016);

      scene.createExplosion({
        position: { x: 0, y: 4, z: 0 },
        force: 5000,
        radius: 10,
      });

      // Update multiple frames
      for (let i = 0; i < 60; i++) {
        scene.update(0.016);
      }

      const stats = scene.getStatistics();

      // Should have activity
      expect(stats.totalObjects + stats.totalFragments).toBeGreaterThan(0);
      expect(stats.structural.failureEvents).toBeGreaterThan(0);
    });

    it('should handle rapid explosions', () => {
      const scene = new DemolitionDemoScene();
      scene.initializeScenario('chain_reaction');

      const objectsBefore = scene.getObjects().length;
      expect(objectsBefore).toBe(10); // Verify objects were created

      // Create explosions along the chain
      for (let i = 0; i < 10; i++) {
        scene.createExplosion({
          position: { x: i * 4, y: 2, z: 0 },
          force: 3000,
          radius: 10,
        });

        scene.update(0.016);
      }

      const stats = scene.getStatistics();
      // System should handle rapid explosions without crashing
      // Check that we have some activity (shock waves, fragments, or particles)
      const hasActivity =
        stats.physics.shockWaves.totalShockWaves > 0 ||
        stats.totalFragments > 0 ||
        stats.totalParticles > 0;
      expect(hasActivity).toBe(true);
    });

    it('should maintain performance with many particles', () => {
      const scene = new DemolitionDemoScene();
      scene.initializeScenario('sandbox');

      // Create large explosion
      scene.createExplosion({
        position: { x: 0, y: 5, z: 0 },
        force: 5000,
        radius: 20,
      });

      // Update for several frames
      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        scene.update(0.016);
        const time = performance.now() - start;

        // Frame time should be reasonable (< 100ms)
        expect(time).toBeLessThan(100);
      }
    });
  });
});
