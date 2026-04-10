import { describe, it, expect } from 'vitest';
import { MATERIAL_PRESETS, createPBRMaterial } from '../materials.js';
import type { PBRMaterial } from '../materials.js';

describe('MATERIAL_PRESETS', () => {
  it('should have at least 10 presets', () => {
    expect(Object.keys(MATERIAL_PRESETS).length).toBeGreaterThanOrEqual(10);
  });

  it('metal preset should be highly metallic', () => {
    expect(MATERIAL_PRESETS.metal.metallic).toBe(1.0);
    expect(MATERIAL_PRESETS.metal.roughness).toBeLessThan(0.5);
  });

  it('wood preset should not be metallic', () => {
    expect(MATERIAL_PRESETS.wood.metallic).toBe(0.0);
    expect(MATERIAL_PRESETS.wood.roughness).toBeGreaterThan(0.7);
  });

  it('glass preset should have low roughness and ior', () => {
    expect(MATERIAL_PRESETS.glass.roughness).toBeLessThan(0.2);
    expect(MATERIAL_PRESETS.glass.ior).toBeCloseTo(1.5);
    expect(MATERIAL_PRESETS.glass.opacity).toBeLessThan(1.0);
  });

  it('water preset should have correct ior', () => {
    expect(MATERIAL_PRESETS.water.ior).toBeCloseTo(1.33);
  });

  it('chrome preset should be fully metallic with low roughness', () => {
    expect(MATERIAL_PRESETS.chrome.metallic).toBe(1.0);
    expect(MATERIAL_PRESETS.chrome.roughness).toBeLessThan(0.1);
  });

  it('skin preset should have subsurface scattering', () => {
    expect(MATERIAL_PRESETS.skin.subsurface).toBeGreaterThan(0);
  });

  it('all presets should have roughness defined', () => {
    for (const [name, preset] of Object.entries(MATERIAL_PRESETS)) {
      expect(preset.roughness, `${name} missing roughness`).toBeDefined();
    }
  });

  it('all presets should have metallic defined', () => {
    for (const [name, preset] of Object.entries(MATERIAL_PRESETS)) {
      expect(preset.metallic, `${name} missing metallic`).toBeDefined();
    }
  });
});

describe('createPBRMaterial', () => {
  it('creates material with defaults', () => {
    const mat = createPBRMaterial('Test');
    expect(mat.name).toBe('Test');
    expect(mat.baseColor).toBe('#ffffff');
    expect(mat.roughness).toBe(0.5);
    expect(mat.metallic).toBe(0.0);
  });

  it('applies preset', () => {
    const mat = createPBRMaterial('Steel', 'metal');
    expect(mat.metallic).toBe(1.0);
    expect(mat.roughness).toBe(0.2);
  });

  it('overrides preset values', () => {
    const mat = createPBRMaterial('CustomMetal', 'metal', { roughness: 0.8 });
    expect(mat.metallic).toBe(1.0);
    expect(mat.roughness).toBe(0.8);
  });

  it('creates material without preset', () => {
    const mat = createPBRMaterial('Plain', undefined, { baseColor: '#ff0000' });
    expect(mat.baseColor).toBe('#ff0000');
    expect(mat.roughness).toBe(0.5);
  });

  it('preserves name through preset', () => {
    const mat = createPBRMaterial('Gold', 'gold');
    expect(mat.name).toBe('Gold');
    expect(mat.baseColor).toBe('#ffd700');
  });
});
