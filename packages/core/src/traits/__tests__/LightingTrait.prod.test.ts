/**
 * LightingTrait — Production Test Suite
 */
import { describe, it, expect } from 'vitest';
import {
  LightingTrait,
  createLightingTrait,
  LIGHTING_PRESETS,
} from '../LightingTrait';

const WHITE = { r: 1, g: 1, b: 1 };
const POS = { x: 0, y: 10, z: 0 };
const DIR = { x: 0, y: -1, z: 0 };

// ─── Constructor / GI defaults ────────────────────────────────────────────────

describe('LightingTrait constructor GI defaults', () => {
  const lt = new LightingTrait();
  const gi = lt.getGlobalIllumination();
  it('enabled=true', () => expect(gi.enabled).toBe(true));
  it('intensity=1.0', () => expect(gi.intensity).toBe(1.0));
  it('skyColor set', () => expect(gi.skyColor).toMatchObject({ r: 0.5, g: 0.7, b: 1.0 }));
  it('skyIntensity=1.0', () => expect(gi.skyIntensity).toBe(1.0));
  it('groundColor set', () => expect(gi.groundColor).toBeDefined());
  it('groundIntensity=0.5', () => expect(gi.groundIntensity).toBe(0.5));
  it('probes=true', () => expect(gi.probes).toBe(true));
  it('indirectDiffuse=1.0', () => expect(gi.indirectDiffuse).toBe(1.0));
  it('indirectSpecular=1.0', () => expect(gi.indirectSpecular).toBe(1.0));
  it('aoIntensity=1.0', () => expect(gi.aoIntensity).toBe(1.0));
  it('screenSpaceAO=true', () => expect(gi.screenSpaceAO).toBe(true));
  it('constructor config spreads over defaults', () => {
    const lt2 = new LightingTrait({ enabled: false, intensity: 0.3 });
    expect(lt2.getGlobalIllumination().enabled).toBe(false);
    expect(lt2.getGlobalIllumination().intensity).toBe(0.3);
  });
  it('createLightingTrait factory returns instance', () => expect(createLightingTrait()).toBeInstanceOf(LightingTrait));
});

// ─── addLight / getLight / getLights ─────────────────────────────────────────

describe('LightingTrait.addLight / getLight / getLights', () => {
  it('addLight with name uses name as ID', () => {
    const lt = new LightingTrait();
    const id = lt.addLight({ type: 'point', name: 'lamp', color: WHITE, intensity: 1 });
    expect(id).toBe('lamp');
  });
  it('addLight without name generates ID', () => {
    const lt = new LightingTrait();
    const id = lt.addLight({ type: 'point', color: WHITE, intensity: 1 });
    expect(id).toMatch(/^light_/);
  });
  it('getLight returns added light', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'lamp', color: WHITE, intensity: 1 });
    expect(lt.getLight('lamp')?.type).toBe('point');
  });
  it('getLight returns undefined for unknown', () => {
    expect(new LightingTrait().getLight('nope')).toBeUndefined();
  });
  it('getLights returns all', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'a', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'spot', name: 'b', color: WHITE, intensity: 1, range: 5 });
    expect(lt.getLights()).toHaveLength(2);
  });
  it('getLightsByType filters correctly', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'p1', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'point', name: 'p2', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'spot', name: 's1', color: WHITE, intensity: 1, range: 3 });
    expect(lt.getLightsByType('point')).toHaveLength(2);
    expect(lt.getLightsByType('spot')).toHaveLength(1);
    expect(lt.getLightsByType('area')).toHaveLength(0);
  });
});

// ─── updateLight / removeLight / clearLights ──────────────────────────────────

describe('LightingTrait.updateLight / removeLight / clearLights', () => {
  it('updateLight returns true on success', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'x', color: WHITE, intensity: 1 });
    expect(lt.updateLight('x', { intensity: 2 })).toBe(true);
    expect(lt.getLight('x')!.intensity).toBe(2);
  });
  it('updateLight returns false for unknown ID', () => {
    expect(new LightingTrait().updateLight('ghost', { intensity: 1 })).toBe(false);
  });
  it('removeLight deletes light', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'x', color: WHITE, intensity: 1 });
    expect(lt.removeLight('x')).toBe(true);
    expect(lt.getLight('x')).toBeUndefined();
  });
  it('removeLight returns false for unknown', () => {
    expect(new LightingTrait().removeLight('ghost')).toBe(false);
  });
  it('clearLights empties all', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'a', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'spot', name: 'b', color: WHITE, intensity: 1, range: 2 });
    lt.clearLights();
    expect(lt.getLights()).toHaveLength(0);
  });
});

// ─── GI control ───────────────────────────────────────────────────────────────

describe('LightingTrait GI control', () => {
  it('updateGlobalIllumination merges', () => {
    const lt = new LightingTrait();
    lt.updateGlobalIllumination({ intensity: 0.5, screenSpaceAO: false });
    const gi = lt.getGlobalIllumination();
    expect(gi.intensity).toBe(0.5);
    expect(gi.screenSpaceAO).toBe(false);
    expect(gi.enabled).toBe(true); // not overwritten
  });
  it('setGIEnabled=false', () => {
    const lt = new LightingTrait();
    lt.setGIEnabled(false);
    expect(lt.getGlobalIllumination().enabled).toBe(false);
  });
  it('setAmbientLight sets sky+ground', () => {
    const lt = new LightingTrait();
    const sky = { r: 0.9, g: 0.9, b: 1.0 };
    const ground = { r: 0.2, g: 0.2, b: 0.2 };
    lt.setAmbientLight(sky, ground, 0.8);
    const gi = lt.getGlobalIllumination();
    expect(gi.skyColor).toEqual(sky);
    expect(gi.groundColor).toEqual(ground);
    expect(gi.skyIntensity).toBe(0.8);
    expect(gi.groundIntensity).toBeCloseTo(0.4);
  });
  it('setScreenSpaceAO updates ao fields', () => {
    const lt = new LightingTrait();
    lt.setScreenSpaceAO(false, 0.5);
    const gi = lt.getGlobalIllumination();
    expect(gi.screenSpaceAO).toBe(false);
    expect(gi.aoIntensity).toBe(0.5);
  });
});

// ─── Factory helpers ──────────────────────────────────────────────────────────

describe('LightingTrait factory helpers', () => {
  it('createDirectionalLight returns ID starting with sun_', () => {
    const lt = new LightingTrait();
    const id = lt.createDirectionalLight(DIR, WHITE);
    expect(id).toMatch(/^sun_/);
    const l = lt.getLight(id)!;
    expect(l.type).toBe('directional');
    expect(l.shadow).toBeDefined();
    expect(l.shadow!.type).toBe('soft');
    expect(l.volumetric).toBe(true);
  });
  it('createDirectionalLight no shadow when castShadows=false', () => {
    const lt = new LightingTrait();
    const id = lt.createDirectionalLight(DIR, WHITE, 0.8, false);
    expect(lt.getLight(id)!.shadow).toBeUndefined();
  });
  it('createPointLight returns ID starting with point_', () => {
    const lt = new LightingTrait();
    const id = lt.createPointLight(POS, WHITE, 2, 10);
    expect(id).toMatch(/^point_/);
    const l = lt.getLight(id)!;
    expect(l.type).toBe('point');
    expect(l.range).toBe(10);
    expect(l.shadow).toBeUndefined(); // castShadows defaults false
  });
  it('createPointLight with shadow', () => {
    const lt = new LightingTrait();
    const id = lt.createPointLight(POS, WHITE, 2, 10, true);
    expect(lt.getLight(id)!.shadow).toBeDefined();
  });
  it('createSpotLight returns ID starting with spot_', () => {
    const lt = new LightingTrait();
    const id = lt.createSpotLight(POS, DIR, WHITE, 3, 8);
    const l = lt.getLight(id)!;
    expect(l.type).toBe('spot');
    expect(l.spotAngle).toBe(45);
    expect(l.innerSpotAngle).toBe(22.5);
    expect(l.shadow).toBeDefined();
  });
  it('createSpotLight custom angle', () => {
    const lt = new LightingTrait();
    const id = lt.createSpotLight(POS, DIR, WHITE, 3, 8, 60);
    const l = lt.getLight(id)!;
    expect(l.spotAngle).toBe(60);
    expect(l.innerSpotAngle).toBe(30);
  });
  it('createAreaLight returns ID starting with area_', () => {
    const lt = new LightingTrait();
    const id = lt.createAreaLight(POS, WHITE, 1, 3, 4);
    const l = lt.getLight(id)!;
    expect(l.type).toBe('area');
    expect(l.range).toBe(8); // max(3,4)*2
  });
});

// ─── getShadowCastingLights ───────────────────────────────────────────────────

describe('LightingTrait.getShadowCastingLights', () => {
  it('filters to lights with shadow', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'no', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'directional', name: 'yes', color: WHITE, intensity: 1, shadow: { type: 'soft' } });
    expect(lt.getShadowCastingLights()).toHaveLength(1);
    expect(lt.getShadowCastingLights()[0].name).toBe('yes');
  });
  it('excludes shadow.type=none', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'none', color: WHITE, intensity: 1, shadow: { type: 'none' } });
    expect(lt.getShadowCastingLights()).toHaveLength(0);
  });
});

// ─── getLightCount ────────────────────────────────────────────────────────────

describe('LightingTrait.getLightCount', () => {
  it('counts by type correctly', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'p', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'directional', name: 'd', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'directional', name: 'd2', color: WHITE, intensity: 1 });
    const c = lt.getLightCount();
    expect(c.point).toBe(1);
    expect(c.directional).toBe(2);
    expect(c.spot).toBe(0);
    expect(c.area).toBe(0);
    expect(c.probe).toBe(0);
  });
  it('empty scene all zeros', () => {
    const counts = new LightingTrait().getLightCount();
    expect(Object.values(counts).every((v) => v === 0)).toBe(true);
  });
});

// ─── getPerformanceImpact ─────────────────────────────────────────────────────

describe('LightingTrait.getPerformanceImpact', () => {
  it('low with few lights no shadows', () => {
    const lt = new LightingTrait();
    for (let i = 0; i < 4; i++) lt.addLight({ type: 'point', name: `p${i}`, color: WHITE, intensity: 1 });
    expect(lt.getPerformanceImpact().estimatedGPUCost).toBe('low');
  });
  it('medium when 9-16 lights', () => {
    const lt = new LightingTrait();
    for (let i = 0; i < 10; i++) lt.addLight({ type: 'point', name: `p${i}`, color: WHITE, intensity: 1 });
    expect(lt.getPerformanceImpact().estimatedGPUCost).toBe('medium');
  });
  it('high when >16 lights', () => {
    const lt = new LightingTrait();
    for (let i = 0; i < 17; i++) lt.addLight({ type: 'point', name: `p${i}`, color: WHITE, intensity: 1 });
    expect(lt.getPerformanceImpact().estimatedGPUCost).toBe('high');
  });
  it('high when >4 shadow casters even with few lights', () => {
    const lt = new LightingTrait();
    for (let i = 0; i < 5; i++) {
      lt.addLight({ type: 'spot', name: `s${i}`, color: WHITE, intensity: 1, range: 5, shadow: { type: 'soft' } });
    }
    expect(lt.getPerformanceImpact().estimatedGPUCost).toBe('high');
    expect(lt.getPerformanceImpact().shadowCasters).toBe(5);
  });
  it('medium with 3 shadow casters', () => {
    const lt = new LightingTrait();
    for (let i = 0; i < 3; i++) {
      lt.addLight({ type: 'spot', name: `s${i}`, color: WHITE, intensity: 1, range: 5, shadow: { type: 'soft' } });
    }
    expect(lt.getPerformanceImpact().estimatedGPUCost).toBe('medium');
  });
  it('totalLights counted correctly', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'a', color: WHITE, intensity: 1 });
    lt.addLight({ type: 'point', name: 'b', color: WHITE, intensity: 1 });
    expect(lt.getPerformanceImpact().totalLights).toBe(2);
  });
});

// ─── getSceneInfo ─────────────────────────────────────────────────────────────

describe('LightingTrait.getSceneInfo', () => {
  it('returns string with dir/point/spot counts', () => {
    const lt = new LightingTrait();
    lt.createDirectionalLight(DIR, WHITE);
    lt.createPointLight(POS, WHITE, 1, 5);
    const info = lt.getSceneInfo();
    expect(info).toContain('1 dir');
    expect(info).toContain('1 point');
    expect(info).toMatch(/GPU:/);
  });
  it('empty scene still returns string', () => {
    expect(new LightingTrait().getSceneInfo()).toContain('Lighting:');
  });
});

// ─── dispose ──────────────────────────────────────────────────────────────────

describe('LightingTrait.dispose', () => {
  it('clears all lights', () => {
    const lt = new LightingTrait();
    lt.addLight({ type: 'point', name: 'x', color: WHITE, intensity: 1 });
    lt.dispose();
    expect(lt.getLights()).toHaveLength(0);
  });
});

// ─── LIGHTING_PRESETS ─────────────────────────────────────────────────────────

describe('LIGHTING_PRESETS', () => {
  it('studio preset has enabled=true', () => expect(LIGHTING_PRESETS.studio().enabled).toBe(true));
  it('outdoor preset intensity > 1', () => expect(LIGHTING_PRESETS.outdoor().intensity!).toBeGreaterThan(1));
  it('interior preset intensity < 1', () => expect(LIGHTING_PRESETS.interior().intensity!).toBeLessThan(1));
  it('night preset skyIntensity very low', () => expect(LIGHTING_PRESETS.night().skyIntensity!).toBeLessThan(0.2));
  it('sunset preset skyColor is warm (r > b)', () => {
    const sky = LIGHTING_PRESETS.sunset().skyColor!;
    expect(sky.r).toBeGreaterThan(sky.b);
  });
  it('all presets have skyColor', () => {
    Object.values(LIGHTING_PRESETS).forEach((p) => expect(p().skyColor).toBeDefined());
  });
});
