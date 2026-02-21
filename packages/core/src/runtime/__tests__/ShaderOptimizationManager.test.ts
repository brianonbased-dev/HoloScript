/**
 * ShaderOptimizationManager.test.ts
 *
 * Tests for shader-based performance optimizations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ShaderOptimizationManager, type ShaderOptimizationConfig } from '../ShaderOptimizationManager';
import * as THREE from 'three';

describe('ShaderOptimizationManager', () => {
  let manager: ShaderOptimizationManager;

  afterEach(() => {
    if (manager) {
      manager.dispose();
    }
  });

  describe('Construction', () => {
    it('should create manager with default configuration', () => {
      manager = new ShaderOptimizationManager();
      expect(manager).toBeDefined();

      const stats = manager.getStats();
      expect(stats.shadersActive).toBe(0);
    });

    it('should create manager with custom configuration', () => {
      const config: ShaderOptimizationConfig = {
        useOptimizedParticles: true,
        useOptimizedDebris: true,
        useBatchedMeshes: false,
      };

      manager = new ShaderOptimizationManager(config);
      expect(manager).toBeDefined();
    });

    it('should create manager with all optimizations disabled', () => {
      const config: ShaderOptimizationConfig = {
        useOptimizedParticles: false,
        useOptimizedDebris: false,
        useBatchedMeshes: false,
        useFluidShader: false,
        useTerrainDeformation: false,
      };

      manager = new ShaderOptimizationManager(config);
      expect(manager).toBeDefined();
    });

    it('should create manager with all optimizations enabled', () => {
      const config: ShaderOptimizationConfig = {
        useOptimizedParticles: true,
        useOptimizedDebris: true,
        useBatchedMeshes: true,
        useFluidShader: true,
        useTerrainDeformation: true,
      };

      manager = new ShaderOptimizationManager(config);
      expect(manager).toBeDefined();
    });
  });

  describe('Particle Material', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should create optimized particle material', () => {
      const material = manager.createParticleMaterial();

      expect(material).toBeDefined();
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
    });

    it('should create particle material with custom parameters', () => {
      const material = manager.createParticleMaterial({
        pointSize: 5.0,
        fadeDistance: 200.0,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.pointSize.value).toBe(5.0);
      expect(material.uniforms.fadeDistance.value).toBe(200.0);
    });

    it('should create multiple particle materials', () => {
      const material1 = manager.createParticleMaterial({ pointSize: 2.0 });
      const material2 = manager.createParticleMaterial({ pointSize: 4.0 });

      expect(material1).toBeDefined();
      expect(material2).toBeDefined();
      expect(material1.uniforms.pointSize.value).toBe(2.0);
      expect(material2.uniforms.pointSize.value).toBe(4.0);
    });

    it('should have required uniforms', () => {
      const material = manager.createParticleMaterial();

      expect(material.uniforms).toHaveProperty('time');
      expect(material.uniforms).toHaveProperty('pointSize');
      expect(material.uniforms).toHaveProperty('cameraPosition');
      expect(material.uniforms).toHaveProperty('fadeDistance');
    });

    it('should have vertex colors enabled', () => {
      const material = manager.createParticleMaterial();

      expect(material.vertexColors).toBe(true);
    });
  });

  describe('Debris Material', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should create optimized debris material', () => {
      const material = manager.createDebrisMaterial();

      expect(material).toBeDefined();
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    });

    it('should create debris material with custom parameters', () => {
      const lightPos = new THREE.Vector3(20, 30, 40);
      const material = manager.createDebrisMaterial({
        lightPosition: lightPos,
        ambientIntensity: 0.5,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.lightPosition.value).toBe(lightPos);
      expect(material.uniforms.ambientIntensity.value).toBe(0.5);
    });

    it('should have required uniforms', () => {
      const material = manager.createDebrisMaterial();

      expect(material.uniforms).toHaveProperty('time');
      expect(material.uniforms).toHaveProperty('lightPosition');
      expect(material.uniforms).toHaveProperty('lightColor');
      expect(material.uniforms).toHaveProperty('ambientIntensity');
    });

    it('should have double-sided rendering', () => {
      const material = manager.createDebrisMaterial();

      expect(material.side).toBe(THREE.DoubleSide);
    });
  });

  describe('Batched Mesh Material', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should create batched mesh material', () => {
      const material = manager.createBatchedMeshMaterial();

      expect(material).toBeDefined();
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    });

    it('should create batched material with texture', () => {
      const texture = new THREE.Texture();
      const material = manager.createBatchedMeshMaterial({
        diffuseMap: texture,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.diffuseMap.value).toBe(texture);
    });

    it('should create batched material with tint color', () => {
      const tintColor = new THREE.Color(0xff0000);
      const material = manager.createBatchedMeshMaterial({
        tintColor,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.tintColor.value).toBe(tintColor);
    });

    it('should have required uniforms', () => {
      const material = manager.createBatchedMeshMaterial();

      expect(material.uniforms).toHaveProperty('diffuseMap');
      expect(material.uniforms).toHaveProperty('lightPosition');
      expect(material.uniforms).toHaveProperty('tintColor');
    });
  });

  describe('Fluid Material', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should create fluid shader material', () => {
      const material = manager.createFluidMaterial();

      expect(material).toBeDefined();
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
      expect(material.transparent).toBe(true);
    });

    it('should create fluid material with custom parameters', () => {
      const waterColor = new THREE.Color(0x0066ff);
      const material = manager.createFluidMaterial({
        flowSpeed: 2.0,
        waveHeight: 1.0,
        waterColor,
        opacity: 0.5,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.flowSpeed.value).toBe(2.0);
      expect(material.uniforms.waveHeight.value).toBe(1.0);
      expect(material.uniforms.waterColor.value).toBe(waterColor);
      expect(material.uniforms.opacity.value).toBe(0.5);
    });

    it('should have required uniforms', () => {
      const material = manager.createFluidMaterial();

      expect(material.uniforms).toHaveProperty('time');
      expect(material.uniforms).toHaveProperty('flowSpeed');
      expect(material.uniforms).toHaveProperty('waveHeight');
      expect(material.uniforms).toHaveProperty('waterColor');
      expect(material.uniforms).toHaveProperty('opacity');
    });

    it('should be double-sided for water simulation', () => {
      const material = manager.createFluidMaterial();

      expect(material.side).toBe(THREE.DoubleSide);
    });
  });

  describe('Terrain Material', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should create terrain deformation material', () => {
      const material = manager.createTerrainMaterial();

      expect(material).toBeDefined();
      expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    });

    it('should create terrain material with deformation map', () => {
      const deformationMap = new THREE.Texture();
      const material = manager.createTerrainMaterial({
        deformationMap,
        heightScale: 5.0,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.deformationMap.value).toBe(deformationMap);
      expect(material.uniforms.heightScale.value).toBe(5.0);
    });

    it('should create terrain material with custom colors', () => {
      const baseColor = new THREE.Color(0x8b7355);
      const material = manager.createTerrainMaterial({
        baseColor,
      });

      expect(material).toBeDefined();
      expect(material.uniforms.baseColor.value).toBe(baseColor);
    });

    it('should have required uniforms', () => {
      const material = manager.createTerrainMaterial();

      expect(material.uniforms).toHaveProperty('deformationMap');
      expect(material.uniforms).toHaveProperty('heightScale');
      expect(material.uniforms).toHaveProperty('baseColor');
      expect(material.uniforms).toHaveProperty('grassColor');
      expect(material.uniforms).toHaveProperty('rockColor');
    });
  });

  describe('Update and Time Management', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should update shader uniforms', () => {
      const material = manager.createParticleMaterial();
      const initialTime = material.uniforms.time.value;

      manager.update(0.016);

      const updatedTime = material.uniforms.time.value;
      expect(updatedTime).toBeGreaterThanOrEqual(initialTime);
    });

    it('should update multiple materials', () => {
      manager.createParticleMaterial();
      manager.createFluidMaterial();
      manager.createDebrisMaterial();

      expect(() => manager.update(0.016)).not.toThrow();
    });

    it('should handle update with different deltaTime values', () => {
      manager.createParticleMaterial();

      expect(() => manager.update(0.008)).not.toThrow();
      expect(() => manager.update(0.016)).not.toThrow();
      expect(() => manager.update(0.033)).not.toThrow();
    });

    it('should handle update before any materials created', () => {
      expect(() => manager.update(0.016)).not.toThrow();
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should provide accurate statistics', () => {
      const stats = manager.getStats();

      expect(stats).toHaveProperty('shadersActive');
      expect(stats).toHaveProperty('drawCalls');
      expect(stats).toHaveProperty('triangles');
      expect(stats).toHaveProperty('shaderCompileTime');
    });

    it('should track number of active shaders', () => {
      expect(manager.getStats().shadersActive).toBe(0);

      manager.createParticleMaterial();
      expect(manager.getStats().shadersActive).toBe(1);

      manager.createFluidMaterial();
      expect(manager.getStats().shadersActive).toBe(2);

      manager.createDebrisMaterial();
      expect(manager.getStats().shadersActive).toBe(3);
    });

    it('should track shader compile time', () => {
      const initialStats = manager.getStats();
      expect(initialStats.shaderCompileTime).toBe(0);

      manager.createParticleMaterial();

      const updatedStats = manager.getStats();
      expect(updatedStats.shaderCompileTime).toBeGreaterThanOrEqual(0);
    });

    it('should accumulate compile time across multiple shaders', () => {
      manager.createParticleMaterial();
      const stats1 = manager.getStats();

      manager.createFluidMaterial();
      const stats2 = manager.getStats();

      expect(stats2.shaderCompileTime).toBeGreaterThanOrEqual(stats1.shaderCompileTime);
    });
  });

  describe('Resource Management', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should dispose all materials', () => {
      manager.createParticleMaterial();
      manager.createFluidMaterial();
      manager.createDebrisMaterial();

      expect(manager.getStats().shadersActive).toBe(3);

      manager.dispose();

      expect(manager.getStats().shadersActive).toBe(0);
    });

    it('should handle dispose without materials', () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should handle multiple dispose calls', () => {
      manager.createParticleMaterial();

      manager.dispose();
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should dispose all material types', () => {
      manager.createParticleMaterial();
      manager.createDebrisMaterial();
      manager.createBatchedMeshMaterial();
      manager.createFluidMaterial();
      manager.createTerrainMaterial();

      expect(manager.getStats().shadersActive).toBe(5);

      manager.dispose();

      expect(manager.getStats().shadersActive).toBe(0);
    });
  });

  describe('Configuration Options', () => {
    it('should respect useOptimizedParticles configuration', () => {
      const config: ShaderOptimizationConfig = {
        useOptimizedParticles: true,
      };

      manager = new ShaderOptimizationManager(config);
      const material = manager.createParticleMaterial();

      expect(material).toBeDefined();
      expect(material.vertexColors).toBe(true);
    });

    it('should create materials with disabled optimizations', () => {
      const config: ShaderOptimizationConfig = {
        useOptimizedParticles: false,
      };

      manager = new ShaderOptimizationManager(config);
      const material = manager.createParticleMaterial();

      // Should still create a material, just without optimizations
      expect(material).toBeDefined();
    });

    it('should handle mixed configuration', () => {
      const config: ShaderOptimizationConfig = {
        useOptimizedParticles: true,
        useOptimizedDebris: false,
        useBatchedMeshes: true,
        useFluidShader: false,
        useTerrainDeformation: true,
      };

      manager = new ShaderOptimizationManager(config);

      expect(() => {
        manager.createParticleMaterial();
        manager.createDebrisMaterial();
        manager.createBatchedMeshMaterial();
        manager.createFluidMaterial();
        manager.createTerrainMaterial();
      }).not.toThrow();
    });
  });

  describe('Material Properties', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should create particle material with additive blending', () => {
      const material = manager.createParticleMaterial();

      expect(material.blending).toBe(THREE.AdditiveBlending);
    });

    it('should create transparent fluid material', () => {
      const material = manager.createFluidMaterial();

      expect(material.transparent).toBe(true);
    });

    it('should create materials with shaders', () => {
      const particleMaterial = manager.createParticleMaterial();
      const debrisMaterial = manager.createDebrisMaterial();
      const fluidMaterial = manager.createFluidMaterial();

      expect(particleMaterial.vertexShader).toBeDefined();
      expect(particleMaterial.fragmentShader).toBeDefined();

      expect(debrisMaterial.vertexShader).toBeDefined();
      expect(debrisMaterial.fragmentShader).toBeDefined();

      expect(fluidMaterial.vertexShader).toBeDefined();
      expect(fluidMaterial.fragmentShader).toBeDefined();
    });

    it('should create materials with valid shader code', () => {
      const material = manager.createParticleMaterial();

      // Check that shaders contain expected GLSL keywords
      expect(material.vertexShader).toContain('void main()');
      expect(material.fragmentShader).toContain('void main()');
      expect(material.fragmentShader).toContain('gl_FragColor');
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      manager = new ShaderOptimizationManager();
    });

    it('should handle creating same material type multiple times', () => {
      const material1 = manager.createParticleMaterial({ pointSize: 2.0 });
      const material2 = manager.createParticleMaterial({ pointSize: 4.0 });
      const material3 = manager.createParticleMaterial({ pointSize: 6.0 });

      // Each should be independent
      expect(material1.uniforms.pointSize.value).toBe(2.0);
      expect(material2.uniforms.pointSize.value).toBe(4.0);
      expect(material3.uniforms.pointSize.value).toBe(6.0);
    });

    it('should handle update with zero deltaTime', () => {
      manager.createParticleMaterial();

      expect(() => manager.update(0)).not.toThrow();
    });

    it('should handle update with negative deltaTime', () => {
      manager.createParticleMaterial();

      expect(() => manager.update(-0.016)).not.toThrow();
    });

    it('should handle update with very large deltaTime', () => {
      manager.createParticleMaterial();

      expect(() => manager.update(1000)).not.toThrow();
    });

    it('should handle creating all material types', () => {
      expect(() => {
        manager.createParticleMaterial();
        manager.createDebrisMaterial();
        manager.createBatchedMeshMaterial();
        manager.createFluidMaterial();
        manager.createTerrainMaterial();
      }).not.toThrow();

      expect(manager.getStats().shadersActive).toBe(5);
    });
  });
});
