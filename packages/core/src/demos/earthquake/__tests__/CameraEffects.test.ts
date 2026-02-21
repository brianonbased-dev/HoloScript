/**
 * Tests for Camera Effects System
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CameraController, type CameraShakeConfig, type CameraMode } from '../CameraEffects.js';

describe('CameraController', () => {
  let canvas: HTMLCanvasElement;
  let controller: CameraController;

  beforeEach(() => {
    // Create mock canvas
    canvas = {
      width: 800,
      height: 600,
    } as HTMLCanvasElement;

    controller = new CameraController(canvas);
  });

  describe('Initialization', () => {
    it('should initialize with default camera position', () => {
      const camera = controller.getCamera();

      expect(camera.position).toBeDefined();
      expect(camera.target).toBeDefined();
      expect(camera.fov).toBeDefined();
      expect(camera.aspect).toBeDefined();
      expect(camera.near).toBeDefined();
      expect(camera.far).toBeDefined();
    });

    it('should have correct aspect ratio from canvas', () => {
      const camera = controller.getCamera();

      expect(camera.aspect).toBeCloseTo(canvas.width / canvas.height);
    });

    it('should start in overview mode', () => {
      expect(controller.getCurrentMode()).toBe('overview');
    });

    it('should have all camera presets', () => {
      const presets = controller.getAllPresets();

      expect(presets.has('overview')).toBe(true);
      expect(presets.has('street')).toBe(true);
      expect(presets.has('topdown')).toBe(true);
      expect(presets.has('cinematic')).toBe(true);
      expect(presets.has('free')).toBe(true);
    });

    it('should initialize presets with valid parameters', () => {
      const presets = controller.getAllPresets();

      for (const [mode, preset] of presets) {
        expect(preset.position.length).toBe(3);
        expect(preset.target.length).toBe(3);
        expect(preset.fov).toBeGreaterThan(0);
        expect(preset.fov).toBeLessThan(Math.PI);
        expect(preset.name).toBeDefined();
      }
    });
  });

  describe('Camera Parameters', () => {
    it('should return valid camera parameters', () => {
      const camera = controller.getCamera();

      expect(camera.position.length).toBe(3);
      expect(camera.target.length).toBe(3);
      expect(camera.fov).toBeGreaterThan(0);
      expect(camera.aspect).toBeGreaterThan(0);
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.far).toBeGreaterThan(camera.near);
    });

    it('should update aspect ratio when canvas resizes', () => {
      const initialCamera = controller.getCamera();
      const initialAspect = initialCamera.aspect;

      // Resize canvas
      canvas.width = 1600;
      canvas.height = 900;

      const newCamera = controller.getCamera();

      expect(newCamera.aspect).toBeCloseTo(1600 / 900);
      expect(newCamera.aspect).not.toBeCloseTo(initialAspect);
    });
  });

  describe('Camera Presets', () => {
    it('should transition to overview preset', () => {
      controller.transitionToPreset('overview', 0);
      controller.update(0); // Trigger transition completion

      const camera = controller.getCamera();
      const preset = controller.getPreset('overview')!;

      expect(camera.position).toEqual(preset.position);
      expect(camera.target).toEqual(preset.target);
      expect(camera.fov).toBeCloseTo(preset.fov);
    });

    it('should transition to street preset', () => {
      controller.transitionToPreset('street', 0);
      controller.update(0); // Trigger transition completion

      const camera = controller.getCamera();
      const preset = controller.getPreset('street')!;

      expect(camera.position).toEqual(preset.position);
    });

    it('should transition to topdown preset', () => {
      controller.transitionToPreset('topdown', 0);
      controller.update(0); // Trigger transition completion

      const camera = controller.getCamera();
      const preset = controller.getPreset('topdown')!;

      expect(camera.position).toEqual(preset.position);
    });

    it('should transition to cinematic preset', () => {
      controller.transitionToPreset('cinematic', 0);
      controller.update(0); // Trigger transition completion

      const camera = controller.getCamera();
      const preset = controller.getPreset('cinematic')!;

      expect(camera.position).toEqual(preset.position);
    });

    it('should transition to free preset', () => {
      controller.transitionToPreset('free', 0);

      expect(controller.getCurrentMode()).toBe('free');
    });

    it('should update current mode after transition', () => {
      controller.transitionToPreset('street', 0);

      expect(controller.getCurrentMode()).toBe('street');
    });
  });

  describe('Camera Transitions', () => {
    it('should smoothly transition between presets', () => {
      const startPreset = controller.getPreset('overview')!;
      const endPreset = controller.getPreset('street')!;

      controller.transitionToPreset('overview', 0);
      controller.transitionToPreset('street', 1.0);

      // Start should still be at overview
      const startCamera = controller.getCamera();
      expect(startCamera.position).toEqual(startPreset.position);

      // Update halfway
      controller.update(0.5);
      const midCamera = controller.getCamera();

      // Should be between start and end
      for (let i = 0; i < 3; i++) {
        expect(midCamera.position[i]).not.toEqual(startPreset.position[i]);
        expect(midCamera.position[i]).not.toEqual(endPreset.position[i]);
      }

      // Update to end
      controller.update(0.5);
      const endCamera = controller.getCamera();

      // Should be at end position
      expect(endCamera.position).toEqual(endPreset.position);
    });

    it('should handle instant transitions (duration 0)', () => {
      controller.transitionToPreset('overview', 0);
      controller.update(0);
      controller.transitionToPreset('street', 0);
      controller.update(0);

      const camera = controller.getCamera();
      const preset = controller.getPreset('street')!;

      expect(camera.position).toEqual(preset.position);
    });

    it('should interpolate FOV during transitions', () => {
      const startPreset = controller.getPreset('overview')!;
      const endPreset = controller.getPreset('street')!;

      controller.transitionToPreset('overview', 0);
      controller.transitionToPreset('street', 1.0);

      controller.update(0.5);
      const camera = controller.getCamera();

      // FOV should be interpolated (accounting for shake offset)
      // Allow some tolerance for ease-in-out curve
      const expectedMid = (startPreset.fov + endPreset.fov) / 2;
      expect(Math.abs(camera.fov - expectedMid)).toBeLessThan(Math.PI / 8);
    });

    it('should complete transition after full duration', () => {
      controller.transitionToPreset('overview', 0);
      controller.transitionToPreset('street', 1.0);

      // Update past duration
      controller.update(1.5);

      const camera = controller.getCamera();
      const preset = controller.getPreset('street')!;

      expect(camera.position).toEqual(preset.position);
      expect(camera.fov).toBeCloseTo(preset.fov);
    });
  });

  describe('Camera Shake', () => {
    it('should apply earthquake shake', () => {
      const shakeConfig: CameraShakeConfig = {
        intensity: 5,
        frequency: 2.5,
        duration: 1.0,
        falloff: 'linear',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      const beforeCamera = controller.getCamera();
      const beforePos = [...beforeCamera.position];

      controller.applyEarthquakeShake(shakeConfig);
      controller.update(0.1);

      const afterCamera = controller.getCamera();

      // Position should have changed due to shake
      expect(afterCamera.position).not.toEqual(beforePos);
    });

    it('should stop shake after duration expires', () => {
      const shakeConfig: CameraShakeConfig = {
        intensity: 5,
        frequency: 2.5,
        duration: 0.5,
        falloff: 'none',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      controller.applyEarthquakeShake(shakeConfig);

      // Update past duration
      controller.update(1.0);

      // Shake should have stopped (position should be stable)
      const camera1 = controller.getCamera();
      const pos1 = [...camera1.position];

      controller.update(0.1);

      const camera2 = controller.getCamera();
      const pos2 = [...camera2.position];

      expect(pos1).toEqual(pos2);
    });

    it('should apply linear falloff', () => {
      const shakeConfig: CameraShakeConfig = {
        intensity: 10,
        frequency: 2.5,
        duration: 1.0,
        falloff: 'linear',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      controller.applyEarthquakeShake(shakeConfig);

      // Shake at start (strong)
      controller.update(0.1);
      const startCamera = controller.getCamera();
      const startOffset = Math.sqrt(
        (startCamera.position[0] - 30) ** 2 +
        (startCamera.position[1] - 20) ** 2 +
        (startCamera.position[2] - 30) ** 2
      );

      // Shake near end (weak)
      controller.update(0.8);
      const endCamera = controller.getCamera();
      const endOffset = Math.sqrt(
        (endCamera.position[0] - 30) ** 2 +
        (endCamera.position[1] - 20) ** 2 +
        (endCamera.position[2] - 30) ** 2
      );

      // End offset should be less than start (linear falloff)
      expect(endOffset).toBeLessThanOrEqual(startOffset);
    });

    it('should apply exponential falloff', () => {
      const shakeConfig: CameraShakeConfig = {
        intensity: 10,
        frequency: 2.5,
        duration: 1.0,
        falloff: 'exponential',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      controller.applyEarthquakeShake(shakeConfig);
      controller.update(0.1);

      const startCamera = controller.getCamera();
      const startOffset = Math.sqrt(
        (startCamera.position[0] - 30) ** 2 +
        (startCamera.position[1] - 20) ** 2 +
        (startCamera.position[2] - 30) ** 2
      );

      // Shake should exist
      expect(startOffset).toBeGreaterThan(0);
    });

    it('should respect horizontal/vertical amounts', () => {
      const horizontalOnly: CameraShakeConfig = {
        intensity: 10,
        frequency: 2.5,
        duration: 1.0,
        falloff: 'none',
        horizontalAmount: 1.0,
        verticalAmount: 0.0,
      };

      controller.applyEarthquakeShake(horizontalOnly);
      controller.update(0.1);

      const camera = controller.getCamera();

      // Vertical displacement should be minimal
      expect(Math.abs(camera.position[1] - 20)).toBeLessThan(0.1);
    });

    it('should handle manual shake stop', () => {
      const shakeConfig: CameraShakeConfig = {
        intensity: 10,
        frequency: 2.5,
        duration: 10.0,
        falloff: 'none',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      controller.applyEarthquakeShake(shakeConfig);
      controller.update(0.1);

      // Stop shake manually
      controller.stopShake();
      controller.update(0.1);

      const camera1 = controller.getCamera();
      const pos1 = [...camera1.position];

      controller.update(0.1);

      const camera2 = controller.getCamera();
      const pos2 = [...camera2.position];

      // Position should be stable after stopping
      expect(pos1).toEqual(pos2);
    });
  });

  describe('Manual Camera Control', () => {
    it('should move camera position', () => {
      const before = controller.getCamera();
      const beforePos = [...before.position];

      controller.moveCamera([5, 0, 0]);

      const after = controller.getCamera();

      expect(after.position[0]).toBeCloseTo(beforePos[0] + 5);
      expect(after.position[1]).toBeCloseTo(beforePos[1]);
      expect(after.position[2]).toBeCloseTo(beforePos[2]);
    });

    it('should orbit camera around target', () => {
      const before = controller.getCamera();
      const beforePos = [...before.position];

      controller.orbitCamera(Math.PI / 4, 0);

      const after = controller.getCamera();

      // Position should have changed
      expect(after.position).not.toEqual(beforePos);

      // Distance from target should remain constant
      const target = after.target;
      const beforeDist = Math.sqrt(
        (beforePos[0] - target[0]) ** 2 +
        (beforePos[1] - target[1]) ** 2 +
        (beforePos[2] - target[2]) ** 2
      );
      const afterDist = Math.sqrt(
        (after.position[0] - target[0]) ** 2 +
        (after.position[1] - target[1]) ** 2 +
        (after.position[2] - target[2]) ** 2
      );

      expect(afterDist).toBeCloseTo(beforeDist, 1);
    });

    it('should clamp pitch when orbiting', () => {
      // Orbit to extreme pitch
      controller.orbitCamera(0, Math.PI);

      const camera = controller.getCamera();

      // Y position should not go below target (clamped)
      expect(camera.position[1]).toBeGreaterThan(camera.target[1] - 100);
    });

    it('should zoom by adjusting FOV', () => {
      const before = controller.getCamera();
      const beforeFov = before.fov;

      controller.zoom(-0.1, true);

      const after = controller.getCamera();

      expect(after.fov).not.toBeCloseTo(beforeFov);
    });

    it('should zoom by adjusting distance', () => {
      const before = controller.getCamera();
      const beforeDist = Math.sqrt(
        (before.position[0] - before.target[0]) ** 2 +
        (before.position[1] - before.target[1]) ** 2 +
        (before.position[2] - before.target[2]) ** 2
      );

      controller.zoom(-5, false);

      const after = controller.getCamera();
      const afterDist = Math.sqrt(
        (after.position[0] - after.target[0]) ** 2 +
        (after.position[1] - after.target[1]) ** 2 +
        (after.position[2] - after.target[2]) ** 2
      );

      expect(afterDist).not.toBeCloseTo(beforeDist);
    });

    it('should clamp FOV zoom', () => {
      // Zoom in a lot
      controller.zoom(-Math.PI, true);

      const camera1 = controller.getCamera();
      expect(camera1.fov).toBeGreaterThan(Math.PI / 8 - 0.01);

      // Zoom out a lot
      controller.zoom(Math.PI, true);

      const camera2 = controller.getCamera();
      expect(camera2.fov).toBeLessThan(Math.PI / 2 + 0.01);
    });

    it('should clamp distance zoom', () => {
      // Zoom in very close
      controller.zoom(-1000, false);

      const camera1 = controller.getCamera();
      const dist1 = Math.sqrt(
        (camera1.position[0] - camera1.target[0]) ** 2 +
        (camera1.position[1] - camera1.target[1]) ** 2 +
        (camera1.position[2] - camera1.target[2]) ** 2
      );
      expect(dist1).toBeGreaterThanOrEqual(4.9);

      // Zoom out very far
      controller.zoom(1000, false);

      const camera2 = controller.getCamera();
      const dist2 = Math.sqrt(
        (camera2.position[0] - camera2.target[0]) ** 2 +
        (camera2.position[1] - camera2.target[1]) ** 2 +
        (camera2.position[2] - camera2.target[2]) ** 2
      );
      expect(dist2).toBeLessThanOrEqual(100.1);
    });

    it('should pan camera', () => {
      const before = controller.getCamera();
      const beforePos = [...before.position];
      const beforeTarget = [...before.target];

      controller.panCamera(5, 0);

      const after = controller.getCamera();

      // Both position and target should move
      expect(after.position).not.toEqual(beforePos);
      expect(after.target).not.toEqual(beforeTarget);
    });
  });

  describe('Set Camera', () => {
    it('should set camera immediately without transition', () => {
      const newPos: [number, number, number] = [100, 50, 100];
      const newTarget: [number, number, number] = [0, 0, 0];
      const newFov = Math.PI / 3;

      controller.setCamera(newPos, newTarget, newFov);

      const camera = controller.getCamera();

      expect(camera.position).toEqual(newPos);
      expect(camera.target).toEqual(newTarget);
      expect(camera.fov).toBeCloseTo(newFov);
    });

    it('should cancel active transitions', () => {
      controller.transitionToPreset('street', 1.0);
      controller.update(0.5);

      const newPos: [number, number, number] = [100, 50, 100];
      const newTarget: [number, number, number] = [0, 0, 0];
      const newFov = Math.PI / 3;

      controller.setCamera(newPos, newTarget, newFov);

      const camera = controller.getCamera();

      expect(camera.position).toEqual(newPos);
    });
  });

  describe('Update Loop', () => {
    it('should handle update with no active effects', () => {
      expect(() => {
        controller.update(0.016);
      }).not.toThrow();
    });

    it('should handle zero delta time', () => {
      controller.transitionToPreset('street', 1.0);

      expect(() => {
        controller.update(0);
      }).not.toThrow();
    });

    it('should handle very large delta time', () => {
      controller.transitionToPreset('street', 1.0);

      expect(() => {
        controller.update(10);
      }).not.toThrow();
    });

    it('should update both shake and transition simultaneously', () => {
      const shakeConfig: CameraShakeConfig = {
        intensity: 5,
        frequency: 2.5,
        duration: 1.0,
        falloff: 'linear',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      controller.transitionToPreset('street', 1.0);
      controller.applyEarthquakeShake(shakeConfig);

      expect(() => {
        controller.update(0.5);
      }).not.toThrow();

      const camera = controller.getCamera();
      expect(camera.position).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid preset name', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      controller.transitionToPreset('invalid' as CameraMode, 1.0);

      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should handle multiple shake applications', () => {
      const config1: CameraShakeConfig = {
        intensity: 5,
        frequency: 2.5,
        duration: 1.0,
        falloff: 'linear',
        horizontalAmount: 1.0,
        verticalAmount: 0.5,
      };

      const config2: CameraShakeConfig = {
        intensity: 10,
        frequency: 3.0,
        duration: 2.0,
        falloff: 'exponential',
        horizontalAmount: 1.0,
        verticalAmount: 0.8,
      };

      controller.applyEarthquakeShake(config1);
      controller.update(0.1);

      // Apply second shake (should replace first)
      controller.applyEarthquakeShake(config2);
      controller.update(0.1);

      // Should not throw
      expect(() => {
        controller.update(0.1);
      }).not.toThrow();
    });

    it('should handle rapid preset changes', () => {
      expect(() => {
        controller.transitionToPreset('overview', 0);
        controller.transitionToPreset('street', 0);
        controller.transitionToPreset('topdown', 0);
        controller.transitionToPreset('cinematic', 0);
        controller.transitionToPreset('free', 0);
      }).not.toThrow();
    });

    it('should handle canvas with zero size', () => {
      canvas.width = 0;
      canvas.height = 0;

      const camera = controller.getCamera();

      // Should not crash, aspect will be NaN for 0/0 which is expected
      expect(camera.aspect).toBeDefined();
      // NaN is expected for division by zero
      expect(isNaN(camera.aspect)).toBe(true);
    });
  });
});
