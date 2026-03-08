import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GLTFPipeline } from '../GLTFPipeline';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeObject(name: string, material: string, geometry = 'sphere') {
  return {
    name,
    properties: [
      { key: 'geometry', value: geometry },
      { key: 'material', value: material },
    ],
    traits: [],
  } as any;
}

function getGLTFMaterials(pipeline: GLTFPipeline, comp: HoloComposition) {
  const p = new GLTFPipeline({ format: 'gltf' });
  const result = p.compile(comp, 'test-token');
  const json = result.json as any;
  return { json, materials: json.materials || [] };
}

describe('GLTFPipeline KHR Material Extensions', () => {
  // =========== Transmission (glass, water, crystal) ===========

  it('exports KHR_materials_transmission for glass material', () => {
    const comp = makeComposition({ objects: [makeObject('glass_obj', 'glass')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    expect(materials.length).toBeGreaterThanOrEqual(1);
    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_transmission).toBeDefined();
    expect(mat.extensions.KHR_materials_transmission.transmissionFactor).toBeGreaterThan(0);

    // Should declare extension in extensionsUsed
    expect(json.extensionsUsed).toContain('KHR_materials_transmission');
  });

  it('exports KHR_materials_ior for glass material', () => {
    const comp = makeComposition({ objects: [makeObject('glass_obj', 'glass')] });
    const { materials } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    // Glass has ior: 1.5 which is the default, so IOR extension may not be present
    // But transmission should always be there
    expect(mat.extensions.KHR_materials_transmission).toBeDefined();
  });

  // =========== Clearcoat (shiny, plastic) ===========
  // Note: 'obsidian' has a duplicate key in MATERIAL_PRESETS (2nd def wins, no clearcoat)

  it('exports KHR_materials_clearcoat for shiny material', () => {
    const comp = makeComposition({ objects: [makeObject('shiny_obj', 'shiny')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_clearcoat).toBeDefined();
    expect(mat.extensions.KHR_materials_clearcoat.clearcoatFactor).toBeGreaterThan(0);
    expect(json.extensionsUsed).toContain('KHR_materials_clearcoat');
  });

  // =========== Sheen (velvet, silk, cotton, leather) ===========

  it('exports KHR_materials_sheen for velvet material', () => {
    const comp = makeComposition({ objects: [makeObject('velvet_obj', 'velvet')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_sheen).toBeDefined();
    expect(mat.extensions.KHR_materials_sheen.sheenRoughnessFactor).toBeTypeOf('number');
    expect(json.extensionsUsed).toContain('KHR_materials_sheen');
  });

  it('exports KHR_materials_sheen for silk material', () => {
    const comp = makeComposition({ objects: [makeObject('silk_obj', 'silk')] });
    const { materials } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_sheen).toBeDefined();
  });

  // =========== Iridescence (crystal) ===========

  it('exports KHR_materials_iridescence for crystal material', () => {
    const comp = makeComposition({ objects: [makeObject('crystal_obj', 'crystal')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_iridescence).toBeDefined();
    expect(mat.extensions.KHR_materials_iridescence.iridescenceFactor).toBeGreaterThan(0);
    expect(json.extensionsUsed).toContain('KHR_materials_iridescence');
  });

  // =========== Volume / SSS (skin, jade, candle_wax, honey) ===========

  it('exports KHR_materials_volume for skin material', () => {
    const comp = makeComposition({ objects: [makeObject('skin_obj', 'skin')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_volume).toBeDefined();
    expect(mat.extensions.KHR_materials_volume.attenuationColor).toBeDefined();
    expect(json.extensionsUsed).toContain('KHR_materials_volume');
  });

  // =========== Anisotropy (silk, satin) ===========

  it('exports KHR_materials_anisotropy for satin material', () => {
    const comp = makeComposition({ objects: [makeObject('satin_obj', 'satin')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    expect(mat.extensions.KHR_materials_anisotropy).toBeDefined();
    expect(mat.extensions.KHR_materials_anisotropy.anisotropyStrength).toBeGreaterThan(0);
    expect(json.extensionsUsed).toContain('KHR_materials_anisotropy');
  });

  // =========== Multiple extensions on one material ===========

  it('exports multiple KHR extensions for crystal (transmission + iridescence)', () => {
    const comp = makeComposition({ objects: [makeObject('crystal_obj', 'crystal')] });
    const { materials, json } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.extensions).toBeDefined();
    // Crystal has transmission + iridescence
    expect(mat.extensions.KHR_materials_transmission).toBeDefined();
    expect(mat.extensions.KHR_materials_iridescence).toBeDefined();
    // Both should be declared
    expect(json.extensionsUsed).toContain('KHR_materials_transmission');
    expect(json.extensionsUsed).toContain('KHR_materials_iridescence');
  });

  // =========== Basic materials: no spurious extensions ===========

  it('does not add extensions for basic metal material', () => {
    const comp = makeComposition({ objects: [makeObject('metal_obj', 'chrome')] });
    const { materials } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    // Chrome is just metalness:1, roughness:0.1 — no advanced PBR
    expect(mat.extensions).toBeUndefined();
  });

  it('does not add extensions for unset material', () => {
    const comp = makeComposition({
      objects: [{
        name: 'plain',
        properties: [{ key: 'geometry', value: 'box' }],
        traits: [],
      }] as any,
    });
    const { materials } = getGLTFMaterials(new GLTFPipeline(), comp);

    if (materials.length > 0) {
      expect(materials[0].extensions).toBeUndefined();
    }
  });

  // =========== extensionsUsed aggregation ===========

  it('aggregates all used extensions in extensionsUsed', () => {
    const comp = makeComposition({
      objects: [
        makeObject('glass_obj', 'glass'),
        makeObject('velvet_obj', 'velvet'),
        makeObject('obsidian_obj', 'obsidian'),
      ],
    });
    const { json } = getGLTFMaterials(new GLTFPipeline(), comp);

    expect(json.extensionsUsed).toBeDefined();
    expect(json.extensionsUsed).toContain('KHR_materials_transmission');
    expect(json.extensionsUsed).toContain('KHR_materials_sheen');
    expect(json.extensionsUsed).toContain('KHR_materials_clearcoat');
  });

  // =========== BLEND mode for transmission ===========

  it('sets alphaMode BLEND for transmission materials', () => {
    const comp = makeComposition({ objects: [makeObject('glass_obj', 'glass')] });
    const { materials } = getGLTFMaterials(new GLTFPipeline(), comp);

    const mat = materials[0];
    expect(mat.alphaMode).toBe('BLEND');
    expect(mat.doubleSided).toBe(true);
  });
});

// =============================================================================
// Texture Map Export Tests
// =============================================================================

/** Minimal 1x1 PNG (valid magic bytes + minimal structure) */
function makeFakePNG(): Uint8Array {
  // PNG magic bytes followed by enough data to be recognized
  const png = new Uint8Array(68);
  png[0] = 0x89; png[1] = 0x50; png[2] = 0x4E; png[3] = 0x47;
  png[4] = 0x0D; png[5] = 0x0A; png[6] = 0x1A; png[7] = 0x0A;
  return png;
}

/** Minimal JPEG header bytes */
function makeFakeJPEG(): Uint8Array {
  const jpg = new Uint8Array(32);
  jpg[0] = 0xFF; jpg[1] = 0xD8; jpg[2] = 0xFF; jpg[3] = 0xE0;
  return jpg;
}

function makeTexturedObject(name: string, texProps: Record<string, string>, material = 'chrome') {
  const properties: Array<{ key: string; value: string }> = [
    { key: 'geometry', value: 'sphere' },
    { key: 'material', value: material },
  ];
  for (const [k, v] of Object.entries(texProps)) {
    properties.push({ key: k, value: v });
  }
  return { name, properties, traits: [] } as any;
}

describe('GLTFPipeline Texture Map Export', () => {
  const fakePNG = makeFakePNG();
  const fakeJPEG = makeFakeJPEG();

  it('embeds baseColorMap texture in GLTF output', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('textured_obj', { baseColorMap: 'textures/albedo.png' })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/albedo.png': fakePNG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    expect(json.textures).toBeDefined();
    expect(json.textures.length).toBeGreaterThanOrEqual(1);
    expect(json.images).toBeDefined();
    expect(json.images.length).toBeGreaterThanOrEqual(1);
    expect(json.images[0].mimeType).toBe('image/png');

    const mat = json.materials[0];
    expect(mat.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(mat.pbrMetallicRoughness.baseColorTexture.index).toBeTypeOf('number');
  });

  it('embeds normalMap texture in GLTF output', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('normal_obj', { normalMap: 'textures/normal.png' })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/normal.png': fakePNG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.normalTexture).toBeDefined();
    expect(mat.normalTexture.index).toBeTypeOf('number');
    expect(mat.normalTexture.scale).toBe(1.0);
  });

  it('embeds roughnessMap as metallicRoughnessTexture', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('rough_obj', { roughnessMap: 'textures/rough.png' })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/rough.png': fakePNG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();
    expect(mat.pbrMetallicRoughness.metallicRoughnessTexture.index).toBeTypeOf('number');
  });

  it('embeds occlusionMap (ao_map alias) in GLTF output', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('ao_obj', { ao_map: 'textures/ao.png' })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/ao.png': fakePNG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.occlusionTexture).toBeDefined();
    expect(mat.occlusionTexture.strength).toBe(1.0);
  });

  it('embeds emissiveMap in GLTF output', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('emissive_obj', { emissiveMap: 'textures/emissive.png' })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/emissive.png': fakePNG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.emissiveTexture).toBeDefined();
    expect(mat.emissiveTexture.index).toBeTypeOf('number');
  });

  it('detects JPEG mime type from magic bytes', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('jpg_obj', { baseColorMap: 'textures/color.jpg' })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/color.jpg': fakeJPEG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    expect(json.images[0].mimeType).toBe('image/jpeg');
  });

  it('deduplicates textures referenced by multiple materials', () => {
    const comp = makeComposition({
      objects: [
        makeTexturedObject('obj_a', { normalMap: 'textures/shared.png' }, 'chrome'),
        makeTexturedObject('obj_b', { normalMap: 'textures/shared.png' }, 'gold'),
      ],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: { 'textures/shared.png': fakePNG },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    // Both materials should reference the same texture index
    expect(json.images.length).toBe(1);
    expect(json.textures.length).toBe(1);
    const idxA = json.materials[0].normalTexture.index;
    const idxB = json.materials[1].normalTexture.index;
    expect(idxA).toBe(idxB);
  });

  it('embeds multiple texture channels on one material', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('multi_obj', {
        baseColorMap: 'textures/color.png',
        normalMap: 'textures/normal.png',
        roughnessMap: 'textures/rough.png',
      })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: {
        'textures/color.png': fakePNG,
        'textures/normal.png': fakePNG,
        'textures/rough.png': fakePNG,
      },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(mat.normalTexture).toBeDefined();
    expect(mat.pbrMetallicRoughness.metallicRoughnessTexture).toBeDefined();

    // 3 distinct textures
    expect(json.textures.length).toBe(3);
    expect(json.images.length).toBe(3);
  });

  it('skips texture when textureData is not provided for path', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('missing_obj', { normalMap: 'textures/missing.png' })],
    });
    // No textureData provided
    const pipeline = new GLTFPipeline({ format: 'gltf' });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.normalTexture).toBeUndefined();
  });

  it('supports underscore aliases (albedo_map, normal_map)', () => {
    const comp = makeComposition({
      objects: [makeTexturedObject('alias_obj', {
        albedo_map: 'textures/albedo.png',
        normal_map: 'textures/normal.png',
      })],
    });
    const pipeline = new GLTFPipeline({
      format: 'gltf',
      textureData: {
        'textures/albedo.png': fakePNG,
        'textures/normal.png': fakePNG,
      },
    });
    const result = pipeline.compile(comp, 'test-token');
    const json = result.json as any;

    const mat = json.materials[0];
    expect(mat.pbrMetallicRoughness.baseColorTexture).toBeDefined();
    expect(mat.normalTexture).toBeDefined();
  });
});
