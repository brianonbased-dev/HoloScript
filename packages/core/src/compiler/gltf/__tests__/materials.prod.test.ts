/**
 * glTF Materials Production Tests
 *
 * Tests color parsing (hex, RGB, HSL, named), HSL-to-RGB conversion,
 * sRGB/linear conversion, PBR material creation, and material presets.
 */

import { describe, it, expect } from 'vitest';
import {
  NAMED_COLORS,
  MATERIAL_PRESETS,
  parseColor,
  parseHexColor,
  parseRGBString,
  parseHSLString,
  hslToRgb,
  sRGBToLinear,
  linearToSRGB,
  createMaterial,
  applyPreset,
} from '@holoscript/engine/materials';
import type { PBRMaterialConfig } from '@holoscript/engine/materials';

describe('glTF Materials — Production', () => {
  // ─── Constants ─────────────────────────────────────────────────────────────

  it('NAMED_COLORS has common colors', () => {
    expect(NAMED_COLORS.red).toEqual([1, 0, 0]);
    expect(NAMED_COLORS.white).toEqual([1, 1, 1]);
    expect(NAMED_COLORS.black).toEqual([0, 0, 0]);
  });

  it('MATERIAL_PRESETS has standard presets', () => {
    expect(MATERIAL_PRESETS.metal).toBeDefined();
    expect(MATERIAL_PRESETS.metal!.metallic).toBe(1);
    expect(MATERIAL_PRESETS.plastic!.metallic).toBe(0);
  });

  // ─── Color Parsing ────────────────────────────────────────────────────────

  it('parseHexColor #RRGGBB', () => {
    const [r, g, b] = parseHexColor('#ff0000');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('parseHexColor #RGB shorthand', () => {
    const [r, g, b] = parseHexColor('#f00');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0, 1);
  });

  it('parseRGBString', () => {
    const [r, g, b] = parseRGBString('rgb(255, 128, 0)');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0.5, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('parseHSLString', () => {
    const [r, g, b] = parseHSLString('hsl(0, 100%, 50%)');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('parseColor named color', () => {
    const [r, g, b] = parseColor('red');
    expect(r).toBeCloseTo(1, 1);
  });

  it('parseColor hex string', () => {
    const result = parseColor('#00ff00');
    expect(result[1]).toBeCloseTo(1, 1);
  });

  it('parseColor array passthrough', () => {
    const result = parseColor([0.5, 0.5, 0.5]);
    expect(result).toEqual([0.5, 0.5, 0.5]);
  });

  // ─── Color Space ──────────────────────────────────────────────────────────

  it('hslToRgb red', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('hslToRgb white (sat=0)', () => {
    const [r, g, b] = hslToRgb(0, 0, 1);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(1, 2);
  });

  it('sRGBToLinear and back roundtrip', () => {
    const val = 0.5;
    const linear = sRGBToLinear(val);
    const back = linearToSRGB(linear);
    expect(back).toBeCloseTo(val, 2);
  });

  it('sRGBToLinear 0 stays 0', () => {
    expect(sRGBToLinear(0)).toBe(0);
  });

  it('sRGBToLinear 1 stays 1', () => {
    expect(sRGBToLinear(1)).toBeCloseTo(1, 5);
  });

  // ─── Material Creation ────────────────────────────────────────────────────

  it('createMaterial produces valid glTF material', () => {
    const config: PBRMaterialConfig = {
      baseColor: [1, 0, 0, 1],
      metallic: 0.5,
      roughness: 0.5,
      emissive: [0, 0, 0],
      alphaMode: 'OPAQUE',
      doubleSided: false,
    };
    const mat = createMaterial('RedMetal', config);
    expect(mat.name).toBe('RedMetal');
    expect(mat.pbrMetallicRoughness.baseColorFactor).toEqual([1, 0, 0, 1]);
    expect(mat.pbrMetallicRoughness.metallicFactor).toBe(0.5);
    expect(mat.pbrMetallicRoughness.roughnessFactor).toBe(0.5);
  });

  it('createMaterial with BLEND alpha mode', () => {
    const config: PBRMaterialConfig = {
      baseColor: [1, 1, 1, 0.5],
      metallic: 0,
      roughness: 1,
      emissive: [0, 0, 0],
      alphaMode: 'BLEND',
      doubleSided: true,
    };
    const mat = createMaterial('Glass', config);
    expect(mat.alphaMode).toBe('BLEND');
    expect(mat.doubleSided).toBe(true);
  });

  it('createMaterial with unlit', () => {
    const config: PBRMaterialConfig = {
      baseColor: [1, 1, 1, 1],
      metallic: 0,
      roughness: 1,
      emissive: [0, 0, 0],
      alphaMode: 'OPAQUE',
      doubleSided: false,
      unlit: true,
    };
    const mat = createMaterial('Flat', config);
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions!.KHR_materials_unlit).toBeDefined();
  });

  // ─── Presets ──────────────────────────────────────────────────────────────

  it('applyPreset returns full config', () => {
    const config = applyPreset('metal');
    expect(config.metallic).toBe(1);
    expect(config.baseColor).toBeDefined();
    expect(config.alphaMode).toBeDefined();
  });

  it('applyPreset with overrides', () => {
    const config = applyPreset('plastic', { roughness: 0.9 });
    expect(config.metallic).toBe(0);
    expect(config.roughness).toBe(0.9);
  });

  it('applyPreset unknown falls back to default', () => {
    const config = applyPreset('nonexistent');
    expect(config.metallic).toBeDefined();
  });
});
