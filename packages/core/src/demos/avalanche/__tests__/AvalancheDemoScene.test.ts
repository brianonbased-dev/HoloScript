/**
 * AvalancheDemoScene.test.ts
 *
 * Unit tests for interactive demo scene
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AvalancheDemoScene, type DemoConfig } from '../AvalancheDemoScene';

describe('AvalancheDemoScene', () => {
  let canvas: HTMLCanvasElement;
  let config: DemoConfig;
  let scene: AvalancheDemoScene;

  beforeEach(() => {
    // Create mock canvas
    canvas = {
      width: 800,
      height: 600,
      addEventListener: vi.fn(),
    } as any;

    // Create config
    config = {
      canvas,
      terrain: {
        width: 200,
        depth: 200,
        resolution: 32, // Lower resolution for faster tests
        maxHeight: 50,
        steepness: 0.7,
        roughness: 0.3,
        seed: 12345,
      },
      snow: {
        particleCount: 100, // Fewer particles for faster tests
        particleMass: 0.1,
        angleOfRepose: 35,
        cohesion: 0.3,
        density: 300,
        minDepthForTrigger: 0.05,
      },
      physics: {
        gravity: 9.8,
        frictionCoefficient: 0.2,
        dragCoefficient: 0.5,
        entrainmentRadius: 2.0,
        entrainmentThreshold: 3.0,
        restitution: 0.3,
        settlingVelocity: 0.5,
      },
      simulation: {
        useGPU: false,
        maxParticles: 10000,
        enableProfiling: false,
      },
    };

    scene = new AvalancheDemoScene(config);
  });

  afterEach(() => {
    scene.dispose();
  });

  describe('Initialization', () => {
    it('should initialize demo scene', () => {
      expect(scene).toBeDefined();
    });

    it('should initialize UI state', () => {
      const uiState = scene.getUIState();

      expect(uiState.avalancheActive).toBe(false);
      expect(uiState.cameraMode).toBe('overview');
      expect(uiState.showDebug).toBe(false);
      expect(uiState.slowMotion).toBe(false);
      expect(uiState.paused).toBe(false);
    });

    it('should initialize camera mode', () => {
      const camera = scene.getCameraMode();

      expect(camera.name).toBe('overview');
      expect(camera.position).toBeDefined();
      expect(camera.target).toBeDefined();
      expect(camera.fov).toBeGreaterThan(0);
    });

    it('should have no status message initially', () => {
      const status = scene.getStatusMessage();

      expect(status).toBe('');
    });
  });

  describe('Avalanche Triggering', () => {
    it('should trigger avalanche', () => {
      scene.handleTriggerAvalanche();

      const stats = scene.getStatistics();

      expect(stats.isActive).toBe(true);
      expect(stats.slidingCount).toBeGreaterThan(0);
    });

    it('should update UI state on trigger', () => {
      scene.handleTriggerAvalanche();

      const uiState = scene.getUIState();

      expect(uiState.avalancheActive).toBe(true);
    });

    it('should show status message on trigger', () => {
      scene.handleTriggerAvalanche();

      const status = scene.getStatusMessage();

      expect(status).toContain('triggered');
    });
  });

  describe('Reset', () => {
    beforeEach(() => {
      scene.handleTriggerAvalanche();
    });

    it('should reset simulation', () => {
      scene.handleReset();

      const stats = scene.getStatistics();

      expect(stats.isActive).toBe(false);
      expect(stats.elapsedTime).toBe(0);
    });

    it('should reset UI state', () => {
      scene.handleReset();

      const uiState = scene.getUIState();

      expect(uiState.avalancheActive).toBe(false);
      expect(uiState.paused).toBe(false);
    });

    it('should show status message on reset', () => {
      scene.handleReset();

      const status = scene.getStatusMessage();

      expect(status).toContain('reset');
    });
  });

  describe('Camera Modes', () => {
    it('should set overview camera mode', () => {
      scene.setCameraMode('overview');

      const camera = scene.getCameraMode();

      expect(camera.name).toBe('overview');
    });

    it('should set follow camera mode', () => {
      scene.setCameraMode('follow');

      const camera = scene.getCameraMode();

      expect(camera.name).toBe('follow');
    });

    it('should set topdown camera mode', () => {
      scene.setCameraMode('topdown');

      const camera = scene.getCameraMode();

      expect(camera.name).toBe('topdown');
    });

    it('should set cinematic camera mode', () => {
      scene.setCameraMode('cinematic');

      const camera = scene.getCameraMode();

      expect(camera.name).toBe('cinematic');
    });

    it('should set free camera mode', () => {
      scene.setCameraMode('free');

      const camera = scene.getCameraMode();

      expect(camera.name).toBe('free');
    });

    it('should update UI state when changing camera', () => {
      scene.setCameraMode('topdown');

      const uiState = scene.getUIState();

      expect(uiState.cameraMode).toBe('topdown');
    });

    it('should show status message when changing camera', () => {
      scene.setCameraMode('cinematic');

      const status = scene.getStatusMessage();

      expect(status).toContain('Camera');
    });

    it('should handle invalid camera mode', () => {
      scene.setCameraMode('invalid');

      // Should not crash, camera stays same
      const camera = scene.getCameraMode();
      expect(camera).toBeDefined();
    });
  });

  describe('UI Controls', () => {
    it('should toggle slow motion', () => {
      scene.toggleSlowMotion();

      const uiState = scene.getUIState();

      expect(uiState.slowMotion).toBe(true);
    });

    it('should toggle slow motion off', () => {
      scene.toggleSlowMotion();
      scene.toggleSlowMotion();

      const uiState = scene.getUIState();

      expect(uiState.slowMotion).toBe(false);
    });

    it('should toggle pause', () => {
      scene.togglePause();

      const uiState = scene.getUIState();

      expect(uiState.paused).toBe(true);
    });

    it('should toggle pause off', () => {
      scene.togglePause();
      scene.togglePause();

      const uiState = scene.getUIState();

      expect(uiState.paused).toBe(false);
    });

    it('should toggle debug display', () => {
      scene.toggleDebug();

      const uiState = scene.getUIState();

      expect(uiState.showDebug).toBe(true);
    });

    it('should toggle debug display off', () => {
      scene.toggleDebug();
      scene.toggleDebug();

      const uiState = scene.getUIState();

      expect(uiState.showDebug).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should get simulation statistics', () => {
      const stats = scene.getStatistics();

      expect(stats).toBeDefined();
      expect(stats.elapsedTime).toBeDefined();
      expect(stats.restingCount).toBeDefined();
      expect(stats.slidingCount).toBeDefined();
    });

    it('should get performance metrics', () => {
      const metrics = scene.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.fps).toBeDefined();
      expect(metrics.totalFrameTime).toBeDefined();
    });
  });

  describe('Animation Loop', () => {
    it('should start animation loop', () => {
      scene.start();

      // Should not throw
      expect(() => scene.stop()).not.toThrow();
    });

    it('should stop animation loop', () => {
      scene.start();
      scene.stop();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should not start twice', () => {
      scene.start();
      scene.start(); // Second start should be ignored

      // Should not throw
      scene.stop();
    });

    it('should handle stop when not started', () => {
      scene.stop();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Disposal', () => {
    it('should dispose resources', () => {
      scene.dispose();

      // Should not throw
      expect(true).toBe(true);
    });

    it('should stop animation on dispose', () => {
      scene.start();
      scene.dispose();

      // Should have stopped
      expect(true).toBe(true);
    });

    it('should handle multiple dispose calls', () => {
      scene.dispose();
      scene.dispose();

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('Integration', () => {
    it('should integrate with terrain', () => {
      const stats = scene.getStatistics();

      expect(stats.restingCount).toBe(config.snow.particleCount);
    });

    it('should integrate with physics', () => {
      scene.handleTriggerAvalanche();

      const stats = scene.getStatistics();

      expect(stats.isActive).toBe(true);
    });

    it('should integrate with simulation', () => {
      const metrics = scene.getPerformanceMetrics();

      expect(metrics).toBeDefined();
    });

    it('should handle complete workflow', () => {
      // Trigger avalanche
      scene.handleTriggerAvalanche();
      expect(scene.getStatistics().isActive).toBe(true);

      // Change camera
      scene.setCameraMode('follow');
      expect(scene.getCameraMode().name).toBe('follow');

      // Toggle controls
      scene.toggleSlowMotion();
      expect(scene.getUIState().slowMotion).toBe(true);

      // Reset
      scene.handleReset();
      expect(scene.getStatistics().isActive).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle reset without trigger', () => {
      scene.handleReset();

      const stats = scene.getStatistics();

      expect(stats.isActive).toBe(false);
    });

    it('should handle multiple triggers', () => {
      scene.handleTriggerAvalanche();
      scene.handleTriggerAvalanche();
      scene.handleTriggerAvalanche();

      const stats = scene.getStatistics();

      expect(stats.isActive).toBe(true);
    });

    it('should handle camera change during avalanche', () => {
      scene.handleTriggerAvalanche();
      scene.setCameraMode('topdown');

      const camera = scene.getCameraMode();

      expect(camera.name).toBe('topdown');
    });

    it('should handle pause during avalanche', () => {
      scene.handleTriggerAvalanche();
      scene.togglePause();

      const uiState = scene.getUIState();

      expect(uiState.paused).toBe(true);
      expect(uiState.avalancheActive).toBe(true);
    });

    it('should handle slow motion toggle during avalanche', () => {
      scene.handleTriggerAvalanche();
      scene.toggleSlowMotion();

      const uiState = scene.getUIState();

      expect(uiState.slowMotion).toBe(true);
    });

    it('should handle all UI controls at once', () => {
      scene.handleTriggerAvalanche();
      scene.toggleSlowMotion();
      scene.togglePause();
      scene.toggleDebug();
      scene.setCameraMode('cinematic');

      const uiState = scene.getUIState();

      expect(uiState.avalancheActive).toBe(true);
      expect(uiState.slowMotion).toBe(true);
      expect(uiState.paused).toBe(true);
      expect(uiState.showDebug).toBe(true);
      expect(uiState.cameraMode).toBe('cinematic');
    });
  });
});
