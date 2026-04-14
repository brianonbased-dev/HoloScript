import { describe, it, expect, beforeEach } from 'vitest';
import { LightingTrait, createLightingTrait, LIGHTING_PRESETS } from '../LightingTrait';

describe('LightingTrait', () => {
  let lighting: LightingTrait;

  beforeEach(() => {
    lighting = createLightingTrait();
  });

  it('initializes with default GI', () => {
    const gi = lighting.getGlobalIllumination();
    expect(gi.enabled).toBe(true);
    expect(gi.intensity).toBe(1.0);
    expect(gi.screenSpaceAO).toBe(true);
  });

  it('addLight returns id and stores light', () => {
    const id = lighting.addLight({ type: 'point', color: { r: 1, g: 1, b: 1 }, intensity: 1 });
    expect(id).toBeDefined();
    expect(lighting.getLight(id)).toBeDefined();
    expect(lighting.getLights()).toHaveLength(1);
  });

  it('addLight uses name as id when provided', () => {
    const id = lighting.addLight({
      type: 'spot',
      name: 'mySpot',
      color: { r: 1, g: 0, b: 0 },
      intensity: 0.5,
    });
    expect(id).toBe('mySpot');
  });

  it('createDirectionalLight creates sun with shadows', () => {
    const id = lighting.createDirectionalLight([0, -1, 0 ], { r: 1, g: 1, b: 0.9 });
    const light = lighting.getLight(id);
    expect(light).toBeDefined();
    expect(light!.type).toBe('directional');
    expect(light!.shadow).toBeDefined();
    expect(light!.shadow!.type).toBe('soft');
  });

  it('createPointLight creates point light', () => {
    const id = lighting.createPointLight([0, 3, 0 ], { r: 1, g: 1, b: 1 }, 2, 10);
    const light = lighting.getLight(id);
    expect(light!.type).toBe('point');
    expect(light!.range).toBe(10);
  });

  it('createSpotLight creates spot with shadow', () => {
    const id = lighting.createSpotLight(
      [0, 5, 0 ],
      [0, -1, 0 ],
      { r: 1, g: 1, b: 1 },
      3,
      15,
      30
    );
    const light = lighting.getLight(id);
    expect(light!.type).toBe('spot');
    expect(light!.spotAngle).toBe(30);
  });

  it('updateLight modifies properties', () => {
    const id = lighting.addLight({ type: 'point', color: { r: 1, g: 1, b: 1 }, intensity: 1 });
    const ok = lighting.updateLight(id, { intensity: 0.5 });
    expect(ok).toBe(true);
    expect(lighting.getLight(id)!.intensity).toBe(0.5);
  });

  it('updateLight returns false for missing id', () => {
    expect(lighting.updateLight('noexist', { intensity: 0 })).toBe(false);
  });

  it('removeLight removes', () => {
    const id = lighting.addLight({ type: 'point', color: { r: 0, g: 0, b: 0 }, intensity: 0 });
    expect(lighting.removeLight(id)).toBe(true);
    expect(lighting.getLight(id)).toBeUndefined();
  });

  it('getLightsByType filters', () => {
    lighting.createDirectionalLight([0, -1, 0 ], { r: 1, g: 1, b: 1 });
    lighting.createPointLight([0, 0, 0 ], { r: 1, g: 0, b: 0 }, 1, 5);
    expect(lighting.getLightsByType('directional')).toHaveLength(1);
    expect(lighting.getLightsByType('point')).toHaveLength(1);
  });

  it('getShadowCastingLights returns only shadow lights', () => {
    lighting.createDirectionalLight([0, -1, 0 ], { r: 1, g: 1, b: 1 }, 1, true);
    lighting.createPointLight([0, 0, 0 ], { r: 1, g: 0, b: 0 }, 1, 5, false);
    expect(lighting.getShadowCastingLights()).toHaveLength(1);
  });

  it('getLightCount returns per-type totals', () => {
    lighting.createDirectionalLight([0, -1, 0 ], { r: 1, g: 1, b: 1 });
    lighting.createPointLight([0, 0, 0 ], { r: 1, g: 0, b: 0 }, 1, 5);
    const counts = lighting.getLightCount();
    expect(counts.directional).toBe(1);
    expect(counts.point).toBe(1);
  });

  it('getPerformanceImpact returns low for few lights', () => {
    lighting.createPointLight([0, 0, 0 ], { r: 1, g: 1, b: 1 }, 1, 5);
    expect(lighting.getPerformanceImpact().estimatedGPUCost).toBe('low');
  });

  it('clearLights removes all', () => {
    lighting.createDirectionalLight([0, -1, 0 ], { r: 1, g: 1, b: 1 });
    lighting.clearLights();
    expect(lighting.getLights()).toHaveLength(0);
  });

  it('updateGI changes settings', () => {
    lighting.updateGlobalIllumination({ intensity: 2.0 });
    expect(lighting.getGlobalIllumination().intensity).toBe(2.0);
  });

  it('setAmbientLight changes sky and ground', () => {
    lighting.setAmbientLight({ r: 1, g: 0, b: 0 }, { r: 0, g: 1, b: 0 }, 0.8);
    const gi = lighting.getGlobalIllumination();
    expect(gi.skyColor!.r).toBe(1);
    expect(gi.groundColor!.g).toBe(1);
    expect(gi.skyIntensity).toBe(0.8);
  });

  it('LIGHTING_PRESETS are callable', () => {
    const studio = LIGHTING_PRESETS.studio();
    expect(studio.enabled).toBe(true);
    expect(studio.intensity).toBe(1.0);
    const night = LIGHTING_PRESETS.night();
    expect(night.intensity).toBe(0.3);
  });

  it('dispose cleans up', () => {
    lighting.createPointLight([0, 0, 0 ], { r: 1, g: 1, b: 1 }, 1, 5);
    lighting.dispose();
    expect(lighting.getLights()).toHaveLength(0);
  });
});
