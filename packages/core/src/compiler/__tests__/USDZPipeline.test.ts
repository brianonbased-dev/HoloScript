import { describe, it, expect, beforeEach } from 'vitest';
import { USDZPipeline, generateUSDA, generateUSDZ, getUSDZConversionCommand } from '../USDZPipeline';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makePresetObject(name: string, preset: string, extraProps: Array<{ key: string; value: any }> = []) {
  return {
    name,
    properties: [
      { key: 'material', value: preset },
      ...extraProps,
    ],
    traits: [],
  } as any;
}

function makeFakePNG(): Uint8Array {
  // PNG magic bytes + minimal valid-ish data
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
}

describe('USDZPipeline', () => {
  let pipeline: USDZPipeline;

  beforeEach(() => {
    pipeline = new USDZPipeline();
  });

  // =========== Constructor ===========

  it('instantiates with default options', () => {
    expect(pipeline).toBeDefined();
  });

  // =========== USDA output ===========

  it('generates USDA string', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('#usda');
    expect(usda).toContain('TestScene');
  });

  it('includes upAxis metadata', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('upAxis');
  });

  it('includes metersPerUnit', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('metersPerUnit');
  });

  // =========== Options ===========

  it('respects Y upAxis (default)', () => {
    const usda = pipeline.generateUSDA(makeComposition());
    expect(usda).toContain('"Y"');
  });

  it('respects Z upAxis', () => {
    const p = new USDZPipeline({ upAxis: 'Z' });
    const usda = p.generateUSDA(makeComposition());
    expect(usda).toContain('"Z"');
  });

  // =========== Objects → prims ===========

  it('compiles objects to USD Xform prims', () => {
    const comp = makeComposition({
      objects: [
        { name: 'cube', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Xform');
    expect(usda).toContain('cube');
  });

  // =========== Sphere geometry ===========

  it('compiles sphere geometry', () => {
    const comp = makeComposition({
      objects: [
        { name: 'ball', properties: [{ key: 'type', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Sphere');
  });

  // =========== Materials ===========

  it('generates materials for objects with color', () => {
    const comp = makeComposition({
      objects: [
        { name: 'redcube', properties: [{ key: 'geometry', value: 'box' }, { key: 'color', value: '#ff0000' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Material');
  });

  // =========== Multiple objects ===========

  it('compiles multiple objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'obj_a', properties: [{ key: 'geometry', value: 'box' }], traits: [] },
        { name: 'obj_b', properties: [{ key: 'geometry', value: 'sphere' }], traits: [] },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('obj_a');
    expect(usda).toContain('obj_b');
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'grp',
          objects: [{ name: 'child', properties: [{ key: 'geometry', value: 'box' }], traits: [] }],
          properties: [],
        },
      ] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('grp');
  });

  // =========== Convenience functions ===========

  it('exports generateUSDA convenience function', () => {
    expect(generateUSDA).toBeTypeOf('function');
    const usda = generateUSDA(makeComposition());
    expect(usda).toContain('#usda');
  });

  it('exports getUSDZConversionCommand', () => {
    const cmd = getUSDZConversionCommand('input.usda', 'output.usdz');
    expect(cmd).toContain('input.usda');
    expect(cmd).toContain('output.usdz');
  });

  // =========== MATERIAL_PRESETS integration ===========

  it('resolves glass preset with transmission and ior', () => {
    const comp = makeComposition({
      objects: [makePresetObject('window', 'glass')],
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('inputs:ior');
    expect(usda).toContain('HoloScript:transmission');
    expect(usda).toContain('opacityThreshold');
  });

  it('resolves obsidian preset with clearcoat', () => {
    const comp = makeComposition({
      objects: [makePresetObject('gem', 'obsidian')],
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('inputs:clearcoat = 0.9');
    expect(usda).toContain('inputs:clearcoatRoughness');
  });

  it('resolves silk preset with anisotropy metadata', () => {
    const comp = makeComposition({
      objects: [makePresetObject('cloth', 'silk')],
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('HoloScript:anisotropy = 0.8');
    expect(usda).toContain('HoloScript:sheen');
  });

  it('resolves crystal preset with iridescence metadata', () => {
    const comp = makeComposition({
      objects: [makePresetObject('prism', 'crystal')],
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('HoloScript:iridescence');
    expect(usda).toContain('HoloScript:iridescenceIOR');
  });

  it('resolves skin preset with attenuation metadata', () => {
    const comp = makeComposition({
      objects: [makePresetObject('face', 'skin')],
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('HoloScript:attenuationColor');
    expect(usda).toContain('HoloScript:attenuationDistance');
  });

  it('allows color override on preset', () => {
    const comp = makeComposition({
      objects: [makePresetObject('custom_gold', 'gold', [{ key: 'color', value: '#ff0000' }])],
    });
    const usda = pipeline.generateUSDA(comp);
    // Red override, not gold's default #ffd700
    expect(usda).toContain('inputs:diffuseColor');
    expect(usda).toContain('1,');  // red channel = 1
    // Still has gold's metallic
    expect(usda).toContain('inputs:metallic = 1');
  });

  it('generates distinct materials for multiple presets', () => {
    const comp = makeComposition({
      objects: [
        makePresetObject('obj_metal', 'metal'),
        makePresetObject('obj_glass', 'glass'),
      ],
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('Material_obj_metal');
    expect(usda).toContain('Material_obj_glass');
  });

  // =========== Texture map references ===========

  it('generates UsdUVTexture reader for texture maps', () => {
    const comp = makeComposition({
      objects: [{
        name: 'textured_box',
        properties: [
          { key: 'material', value: 'metal' },
          { key: 'normalMap', value: 'metal_normal.png' },
        ],
        traits: [],
      }] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('UsdUVTexture');
    expect(usda).toContain('UsdPrimvarReader_float2');
    expect(usda).toContain('metal_normal.png');
    expect(usda).toContain('normalTexture');
  });

  it('maps all 7 texture channels correctly', () => {
    const comp = makeComposition({
      objects: [{
        name: 'full_tex',
        properties: [
          { key: 'material', value: 'plastic' },
          { key: 'albedo_map', value: 'albedo.png' },
          { key: 'normal_map', value: 'normal.png' },
          { key: 'roughness_map', value: 'rough.png' },
          { key: 'metallic_map', value: 'metal.png' },
          { key: 'ao_map', value: 'ao.png' },
          { key: 'emission_map', value: 'emissive.png' },
          { key: 'displacement_map', value: 'disp.png' },
        ],
        traits: [],
      }] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('diffuseColorTexture');
    expect(usda).toContain('normalTexture');
    expect(usda).toContain('roughnessTexture');
    expect(usda).toContain('metallicTexture');
    expect(usda).toContain('occlusionTexture');
    expect(usda).toContain('emissiveColorTexture');
    expect(usda).toContain('displacementTexture');
  });

  it('connects texture outputs to PBRShader inputs', () => {
    const comp = makeComposition({
      objects: [{
        name: 'connected',
        properties: [
          { key: 'material', value: 'plastic' },
          { key: 'albedo_map', value: 'color.png' },
        ],
        traits: [],
      }] as any,
    });
    const usda = pipeline.generateUSDA(comp);
    expect(usda).toContain('inputs:diffuseColor.connect');
    expect(usda).toContain('diffuseColorTexture.outputs:rgb');
  });

  // =========== Binary USDZ packaging ===========

  it('generates USDZ with ZIP magic bytes', () => {
    const comp = makeComposition();
    const usdz = pipeline.generateUSDZ(comp);
    expect(usdz).toBeInstanceOf(Uint8Array);
    // ZIP magic bytes: PK\x03\x04
    expect(usdz[0]).toBe(0x50); // P
    expect(usdz[1]).toBe(0x4B); // K
    expect(usdz[2]).toBe(0x03);
    expect(usdz[3]).toBe(0x04);
  });

  it('USDZ contains USDA file entry', () => {
    const comp = makeComposition();
    const usdz = pipeline.generateUSDZ(comp);
    const text = new TextDecoder().decode(usdz);
    expect(text).toContain('TestScene.usda');
    expect(text).toContain('#usda');
  });

  it('USDZ includes texture file entries when textureData provided', () => {
    const p = new USDZPipeline({
      textureData: { 'albedo.png': makeFakePNG() },
    });
    const comp = makeComposition({
      objects: [{
        name: 'tex_obj',
        properties: [
          { key: 'material', value: 'plastic' },
          { key: 'albedo_map', value: 'albedo.png' },
        ],
        traits: [],
      }] as any,
    });
    const usdz = p.generateUSDZ(comp);
    const text = new TextDecoder().decode(usdz);
    expect(text).toContain('textures/albedo.png');
  });

  it('USDZ without textures contains only USDA entry', () => {
    const usdz = pipeline.generateUSDZ(makeComposition());
    const text = new TextDecoder().decode(usdz);
    expect(text).toContain('.usda');
    expect(text).not.toContain('textures/');
  });

  it('USDZ file data starts at 64-byte aligned offset', () => {
    const comp = makeComposition();
    const usdz = pipeline.generateUSDZ(comp);
    // First local file header starts at offset 0
    // File name is "TestScene.usda" (14 bytes)
    // Header = 30 bytes, name = 14 bytes → header end = 44
    // 64-byte alignment → data starts at 64
    // The extra field length encodes the padding
    const view = new DataView(usdz.buffer, usdz.byteOffset, usdz.byteLength);
    const nameLen = view.getUint16(26, true);
    const extraLen = view.getUint16(28, true);
    const dataStart = 30 + nameLen + extraLen;
    expect(dataStart % 64).toBe(0);
  });

  it('exports generateUSDZ convenience function', () => {
    expect(generateUSDZ).toBeTypeOf('function');
    const usdz = generateUSDZ(makeComposition());
    expect(usdz).toBeInstanceOf(Uint8Array);
    expect(usdz[0]).toBe(0x50);
  });
});
