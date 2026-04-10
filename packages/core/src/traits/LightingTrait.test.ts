import { describe, it, expect, beforeEach } from 'vitest';
import {
  LightingTrait,
  createLightingTrait,
  LIGHTING_PRESETS,
  type GlobalIlluminationConfig,
  type Vector3,
  type Color,
} from '../traits/LightingTrait';

describe('LightingTrait', () => {
  let lighting: LightingTrait;

  beforeEach(() => {
    lighting = new LightingTrait();
  });

  describe('initialization', () => {
    it('should initialize with default GI settings', () => {
      const gi = lighting.getGlobalIllumination();
      expect(gi.enabled).toBe(true);
      expect(gi.intensity).toBe(1.0);
      expect(gi.probes).toBe(true);
    });

    it('should initialize with custom GI config', () => {
      const config: GlobalIlluminationConfig = {
        enabled: true,
        intensity: 2.0,
        skyColor: { r: 1, g: 1, b: 1 },
        probes: false,
      };
      const lig = new LightingTrait(config);
      const gi = lig.getGlobalIllumination();
      expect(gi.intensity).toBe(2.0);
      expect(gi.probes).toBe(false);
    });
  });

  describe('light management', () => {
    it('should add light and return ID', () => {
      const id = lighting.addLight({
        type: 'directional',
        direction: { x: 1, y: 1, z: 1 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 1.0,
      });
      expect(id).toBeDefined();
    });

    it('should retrieve added light by ID', () => {
      const lightId = lighting.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      const light = lighting.getLight(lightId);
      expect(light?.type).toBe('point');
      expect(light?.color.r).toBe(1);
    });

    it('should get all lights', () => {
      lighting.addLight({
        type: 'directional',
        direction: { x: 0, y: 1, z: 0 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 1.0,
      });
      lighting.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 0, g: 1, b: 0 },
        intensity: 0.8,
        range: 5,
      });
      const lights = lighting.getLights();
      expect(lights).toHaveLength(2);
    });

    it('should filter lights by type', () => {
      lighting.addLight({
        type: 'directional',
        direction: { x: 0, y: 1, z: 0 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 1.0,
      });
      lighting.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 0, g: 1, b: 0 },
        intensity: 0.8,
        range: 5,
      });
      lighting.addLight({
        type: 'point',
        position: { x: 5, y: 0, z: 0 },
        color: { r: 0, g: 0, b: 1 },
        intensity: 0.5,
        range: 3,
      });
      const points = lighting.getLightsByType('point');
      expect(points).toHaveLength(2);
    });
  });

  describe('light updates', () => {
    it('should update existing light', () => {
      const id = lighting.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      lighting.updateLight(id, { intensity: 0.5 });
      const light = lighting.getLight(id);
      expect(light?.intensity).toBe(0.5);
    });

    it('should return false for non-existent light', () => {
      const result = lighting.updateLight('non-existent', { intensity: 0.5 });
      expect(result).toBe(false);
    });

    it('should remove light', () => {
      const id = lighting.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      const result = lighting.removeLight(id);
      expect(result).toBe(true);
      expect(lighting.getLight(id)).toBeUndefined();
    });

    it('should clear all lights', () => {
      lighting.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      lighting.addLight({
        type: 'point',
        position: { x: 5, y: 0, z: 0 },
        color: { r: 0, g: 1, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      lighting.clearLights();
      expect(lighting.getLights()).toHaveLength(0);
    });
  });

  describe('global illumination', () => {
    it('should get GI configuration', () => {
      const gi = lighting.getGlobalIllumination();
      expect(gi).toBeDefined();
      expect(gi.skyColor).toBeDefined();
    });

    it('should update GI configuration', () => {
      lighting.updateGlobalIllumination({
        intensity: 1.5,
        skyIntensity: 2.0,
      });
      const gi = lighting.getGlobalIllumination();
      expect(gi.intensity).toBe(1.5);
      expect(gi.skyIntensity).toBe(2.0);
    });

    it('should enable/disable GI', () => {
      lighting.setGIEnabled(false);
      const gi = lighting.getGlobalIllumination();
      expect(gi.enabled).toBe(false);
    });

    it('should set ambient light colors', () => {
      const skyColor: Color = { r: 0.8, g: 0.8, b: 1.0 };
      const groundColor: Color = { r: 0.3, g: 0.3, b: 0.2 };
      lighting.setAmbientLight(skyColor, groundColor, 0.8);
      const gi = lighting.getGlobalIllumination();
      expect(gi.skyColor).toEqual(skyColor);
      expect(gi.groundColor).toEqual(groundColor);
      expect(gi.skyIntensity).toBe(0.8);
    });

    it('should enable screen-space AO', () => {
      lighting.setScreenSpaceAO(true, 1.5);
      const gi = lighting.getGlobalIllumination();
      expect(gi.screenSpaceAO).toBe(true);
      expect(gi.aoIntensity).toBe(1.5);
    });
  });

  describe('light creation helpers', () => {
    it('should create directional light (sun)', () => {
      const dir: Vector3 = { x: 1, y: 1, z: 1 };
      const color: Color = { r: 1, g: 1, b: 1 };
      const id = lighting.createDirectionalLight(dir, color, 1.0, true);
      const light = lighting.getLight(id);
      expect(light?.type).toBe('directional');
      expect(light?.shadow?.type).toBe('soft');
      expect(light?.shadow?.cascades).toBe(4);
    });

    it('should create point light', () => {
      const pos: Vector3 = { x: 0, y: 5, z: 0 };
      const color: Color = { r: 1, g: 0, b: 0 };
      const id = lighting.createPointLight(pos, color, 1.0, 20, false);
      const light = lighting.getLight(id);
      expect(light?.type).toBe('point');
      expect(light?.position).toEqual(pos);
      expect(light?.range).toBe(20);
      expect(light?.shadow).toBeUndefined();
    });

    it('should create spot light', () => {
      const pos: Vector3 = { x: 0, y: 10, z: 0 };
      const dir: Vector3 = { x: 0, y: -1, z: 0 };
      const color: Color = { r: 1, g: 1, b: 0 };
      const id = lighting.createSpotLight(pos, dir, color, 1.0, 30, 45, true);
      const light = lighting.getLight(id);
      expect(light?.type).toBe('spot');
      expect(light?.spotAngle).toBe(45);
      expect(light?.shadow?.type).toBe('soft');
    });

    it('should create area light', () => {
      const pos: Vector3 = { x: 0, y: 5, z: 0 };
      const color: Color = { r: 0, g: 1, b: 1 };
      const id = lighting.createAreaLight(pos, color, 0.8, 2, 2);
      const light = lighting.getLight(id);
      expect(light?.type).toBe('area');
      expect(light?.range).toBeDefined();
    });
  });

  describe('performance analysis', () => {
    it('should get shadow-casting lights', () => {
      const lig = new LightingTrait();
      lig.addLight({
        type: 'directional',
        direction: { x: 0, y: 1, z: 0 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 1.0,
        shadow: { type: 'soft' },
      });
      lig.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      const shadowCasters = lig.getShadowCastingLights();
      expect(shadowCasters).toHaveLength(1);
    });

    it('should count lights by type', () => {
      const lig = new LightingTrait();
      lig.addLight({
        type: 'directional',
        direction: { x: 0, y: 1, z: 0 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 1.0,
      });
      lig.addLight({
        type: 'point',
        position: { x: 0, y: 0, z: 0 },
        color: { r: 1, g: 0, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      lig.addLight({
        type: 'point',
        position: { x: 5, y: 0, z: 0 },
        color: { r: 0, g: 1, b: 0 },
        intensity: 1.0,
        range: 10,
      });
      lig.addLight({
        type: 'spot',
        position: { x: 0, y: 5, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
        color: { r: 0, g: 0, b: 1 },
        intensity: 1.0,
        range: 15,
        spotAngle: 45,
      });
      const counts = lig.getLightCount();
      expect(counts.directional).toBe(1);
      expect(counts.point).toBe(2);
      expect(counts.spot).toBe(1);
    });

    it('should estimate GPU performance impact', () => {
      const lig = new LightingTrait();
      for (let i = 0; i < 10; i++) {
        lig.addLight({
          type: 'point',
          position: { x: i, y: 0, z: 0 },
          color: { r: 1, g: 1, b: 1 },
          intensity: 0.5,
          range: 10,
        });
      }
      const impact = lig.getPerformanceImpact();
      expect(impact.totalLights).toBe(10);
      expect(['low', 'medium', 'high']).toContain(impact.estimatedGPUCost);
    });

    it('should estimate high cost with many shadow casters', () => {
      const lig = new LightingTrait();
      for (let i = 0; i < 5; i++) {
        lig.addLight({
          type: 'spot',
          position: { x: i, y: 0, z: 0 },
          direction: { x: 0, y: -1, z: 0 },
          color: { r: 1, g: 1, b: 1 },
          intensity: 0.5,
          range: 10,
          spotAngle: 45,
          shadow: { type: 'soft' },
        });
      }
      const impact = lig.getPerformanceImpact();
      expect(impact.shadowCasters).toBe(5);
      expect(impact.estimatedGPUCost).toBe('high');
    });

    it('should generate scene info string', () => {
      lighting.createDirectionalLight({ x: 0, y: 1, z: 0 }, { r: 1, g: 1, b: 1 }, 1.0, true);
      lighting.createPointLight({ x: 0, y: 0, z: 0 }, { r: 1, g: 0, b: 0 }, 1.0, 10, false);
      const info = lighting.getSceneInfo();
      expect(info).toContain('Lighting:');
      expect(info).toContain('Shadows:');
      expect(info).toContain('GPU:');
    });
  });

  describe('presets', () => {
    it('should create studio lighting', () => {
      const config = LIGHTING_PRESETS.studio();
      expect(config.enabled).toBe(true);
      expect(config.skyIntensity).toBe(0.5);
    });

    it('should create outdoor lighting', () => {
      const config = LIGHTING_PRESETS.outdoor();
      expect(config.intensity).toBe(1.2);
      expect(config.indirectDiffuse).toBe(1.2);
    });

    it('should create interior lighting', () => {
      const config = LIGHTING_PRESETS.interior();
      expect(config.intensity).toBe(0.6);
    });

    it('should create night lighting', () => {
      const config = LIGHTING_PRESETS.night();
      expect(config.intensity).toBe(0.3);
      expect(config.screenSpaceAO).toBe(false);
    });

    it('should create sunset lighting', () => {
      const config = LIGHTING_PRESETS.sunset();
      expect(config.skyColor?.r).toBe(1.0);
      expect(config.skyColor?.g).toBe(0.7);
    });
  });

  describe('factory function', () => {
    it('should create lighting via factory', () => {
      const lig = createLightingTrait();
      expect(lig.getGlobalIllumination().enabled).toBe(true);
    });

    it('should create lighting with config via factory', () => {
      const config: GlobalIlluminationConfig = {
        enabled: false,
        intensity: 0.5,
      };
      const lig = createLightingTrait(config);
      expect(lig.getGlobalIllumination().enabled).toBe(false);
      expect(lig.getGlobalIllumination().intensity).toBe(0.5);
    });
  });

  describe('complex lighting setup', () => {
    it('should setup complete scene lighting', () => {
      const lig = new LightingTrait();

      // Sun
      lig.addLight({
        type: 'directional',
        direction: { x: 0.5, y: 1, z: 0.5 },
        color: { r: 1, g: 0.95, b: 0.8 },
        intensity: 1.2,
        shadow: {
          type: 'soft',
          resolution: 2048,
          cascades: 4,
        },
      });

      // Ambient key light
      lig.addLight({
        type: 'point',
        position: { x: -5, y: 3, z: 0 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 0.6,
        range: 20,
      });

      // Fill light
      lig.addLight({
        type: 'point',
        position: { x: 5, y: 2, z: -5 },
        color: { r: 0.8, g: 0.8, b: 1 },
        intensity: 0.4,
        range: 15,
      });

      // Rim light
      lig.addLight({
        type: 'spot',
        position: { x: 0, y: 5, z: -10 },
        direction: { x: 0, y: -1, z: 0.5 },
        color: { r: 1, g: 1, b: 1 },
        intensity: 0.8,
        range: 30,
        spotAngle: 30,
      });

      // Setup GI
      lig.setAmbientLight({ r: 0.5, g: 0.7, b: 1 }, { r: 0.4, g: 0.4, b: 0.35 }, 1.0);
      lig.setScreenSpaceAO(true, 1.0);

      const lights = lig.getLights();
      expect(lights).toHaveLength(4);
      expect(lig.getPerformanceImpact().shadowCasters).toBe(1);
    });
  });

  describe('disposal', () => {
    it('should dispose and cleanup', () => {
      lighting.createDirectionalLight({ x: 0, y: 1, z: 0 }, { r: 1, g: 1, b: 1 }, 1.0, true);
      lighting.dispose();
      expect(lighting.getLights()).toHaveLength(0);
    });
  });
});
