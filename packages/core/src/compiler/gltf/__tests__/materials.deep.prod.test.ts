/**
 * glTF Materials — Production Test Suite
 *
 * Covers: color parsing (named, hex, RGB, HSL), sRGB↔linear conversion,
 * material presets, PBR material creation, alpha modes, double-sided.
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
} from '../materials.js';

describe('glTF Materials — Production', () => {
  // ─── Named Colors ─────────────────────────────────────────────────
  it('NAMED_COLORS has standard palette entries', () => {
    expect(NAMED_COLORS['red']).toEqual([1, 0, 0]);
    expect(NAMED_COLORS['white']).toBeDefined();
    expect(NAMED_COLORS['black']).toBeDefined();
    expect(Object.keys(NAMED_COLORS).length).toBeGreaterThan(10);
  });

  // ─── parseColor ───────────────────────────────────────────────────
  it('parseColor resolves named color string', () => {
    const [r, g, b] = parseColor('red');
    expect(r).toBe(1);
    expect(g).toBe(0);
    expect(b).toBe(0);
  });

  it('parseColor resolves hex string', () => {
    const [r, g, b] = parseColor('#ff0000');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('parseColor resolves array input', () => {
    const [r, g, b] = parseColor([0.5, 0.6, 0.7]);
    expect(r).toBeCloseTo(0.5);
    expect(g).toBeCloseTo(0.6);
    expect(b).toBeCloseTo(0.7);
  });

  // ─── parseHexColor ────────────────────────────────────────────────
  it('parseHexColor handles 6-digit hex', () => {
    const [r, g, b] = parseHexColor('#00ff00');
    expect(r).toBeCloseTo(0, 1);
    expect(g).toBeCloseTo(1, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  it('parseHexColor handles 3-digit shorthand', () => {
    const [r, g, b] = parseHexColor('#fff');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(1, 1);
    expect(b).toBeCloseTo(1, 1);
  });

  // ─── parseRGBString ───────────────────────────────────────────────
  it('parseRGBString parses rgb(255, 128, 0)', () => {
    const [r, g, b] = parseRGBString('rgb(255, 128, 0)');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0.5, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  // ─── parseHSLString ───────────────────────────────────────────────
  it('parseHSLString parses hsl(0, 100%, 50%)', () => {
    const [r, g, b] = parseHSLString('hsl(0, 100%, 50%)');
    expect(r).toBeCloseTo(1, 1);
    expect(g).toBeCloseTo(0, 1);
    expect(b).toBeCloseTo(0, 1);
  });

  // ─── hslToRgb ────────────────────────────────────────────────────
  it('hslToRgb converts pure red', () => {
    const [r, g, b] = hslToRgb(0, 1, 0.5);
    expect(r).toBeCloseTo(1, 2);
    expect(g).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(0, 2);
  });

  it('hslToRgb converts achromatic (gray)', () => {
    const [r, g, b] = hslToRgb(0, 0, 0.5);
    expect(r).toBeCloseTo(0.5, 2);
    expect(g).toBeCloseTo(0.5, 2);
    expect(b).toBeCloseTo(0.5, 2);
  });

  // ─── sRGB ↔ Linear ───────────────────────────────────────────────
  it('sRGBToLinear and linearToSRGB are inverse', () => {
    const val = 0.5;
    const linear = sRGBToLinear(val);
    const back = linearToSRGB(linear);
    expect(back).toBeCloseTo(val, 2);
  });

  it('sRGBToLinear of 0 is 0', () => {
    expect(sRGBToLinear(0)).toBe(0);
  });

  it('sRGBToLinear of 1 is 1', () => {
    expect(sRGBToLinear(1)).toBeCloseTo(1, 5);
  });

  // ─── Material Presets ─────────────────────────────────────────────
  it('MATERIAL_PRESETS has common presets', () => {
    expect(MATERIAL_PRESETS['default']).toBeDefined();
    expect(MATERIAL_PRESETS['metal']).toBeDefined();
    expect(MATERIAL_PRESETS['glass']).toBeDefined();
  });

  it('applyPreset merges defaults with overrides', () => {
    const config = applyPreset('metal', { roughness: 0.9 });
    expect(config.metallic).toBe(1); // from preset
    expect(config.roughness).toBe(0.9); // override
  });

  it('applyPreset uses "default" for unknown preset', () => {
    const config = applyPreset('nonexistent_preset_xyz');
    expect(config.metallic).toBeDefined();
    expect(config.roughness).toBeDefined();
  });

  // ─── createMaterial ───────────────────────────────────────────────
  it('createMaterial generates valid glTF material output', () => {
    const mat = createMaterial('TestMat', {
      baseColor: [1, 0, 0, 1],
      metallic: 0.5,
      roughness: 0.3,
      emissive: [0, 0, 0],
      alphaMode: 'OPAQUE',
      doubleSided: false,
    });
    expect(mat.name).toBe('TestMat');
    expect(mat.pbrMetallicRoughness.metallicFactor).toBe(0.5);
    expect(mat.pbrMetallicRoughness.roughnessFactor).toBe(0.3);
  });

  it('createMaterial sets BLEND alpha mode', () => {
    const mat = createMaterial('Glass', {
      baseColor: [1, 1, 1, 0.5],
      metallic: 0,
      roughness: 0.1,
      emissive: [0, 0, 0],
      alphaMode: 'BLEND',
      doubleSided: true,
    });
    expect(mat.alphaMode).toBe('BLEND');
    expect(mat.doubleSided).toBe(true);
  });

  it('createMaterial adds unlit extension when flagged', () => {
    const mat = createMaterial('Flat', {
      baseColor: [1, 1, 1, 1],
      metallic: 0,
      roughness: 1,
      emissive: [0, 0, 0],
      alphaMode: 'OPAQUE',
      doubleSided: false,
      unlit: true,
    });
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions!['KHR_materials_unlit']).toBeDefined();
  });
});
