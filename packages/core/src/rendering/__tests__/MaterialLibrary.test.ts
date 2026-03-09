import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialLibrary, MATERIAL_PRESETS } from '../MaterialLibrary';

describe('MaterialLibrary', () => {
  let ml: MaterialLibrary;

  beforeEach(() => {
    ml = new MaterialLibrary();
  });

  // Default registration
  it('starts with default material', () => {
    expect(ml.getMaterialCount()).toBe(1);
    expect(ml.getMaterial('default')).toBeDefined();
  });

  // Registration
  it('register adds material', () => {
    ml.register({
      id: 'custom',
      name: 'Custom',
      albedo: { r: 1, g: 0, b: 0, a: 1 },
      metallic: 0,
      roughness: 0.5,
      emission: { r: 0, g: 0, b: 0 },
      emissionStrength: 0,
      normalScale: 1,
      aoStrength: 1,
      blendMode: 'opaque',
      cullMode: 'back',
      depthWrite: true,
      depthTest: true,
      doubleSided: false,
    });
    expect(ml.getMaterialCount()).toBe(2);
  });

  it('registerPreset creates from preset', () => {
    const mat = ml.registerPreset('metal', 'my_metal');
    expect(mat).not.toBeNull();
    expect(mat!.id).toBe('my_metal');
    expect(mat!.metallic).toBe(0.9);
    expect(ml.getMaterial('my_metal')).toBeDefined();
  });

  it('registerPreset returns null for unknown preset', () => {
    expect(ml.registerPreset('nonexistent')).toBeNull();
  });

  it('registerPreset uses preset name as id if not specified', () => {
    ml.registerPreset('wood');
    expect(ml.getMaterial('wood')).toBeDefined();
  });

  // Unregister
  it('unregister removes material and instances', () => {
    ml.registerPreset('glass', 'g');
    ml.createInstance('g');
    ml.unregister('g');
    expect(ml.getMaterial('g')).toBeUndefined();
    expect(ml.getInstanceCount()).toBe(0);
  });

  // Queries
  it('getAllMaterials returns all', () => {
    ml.registerPreset('metal');
    expect(ml.getAllMaterials().length).toBe(2);
  });

  // Instancing
  it('createInstance returns instance', () => {
    const inst = ml.createInstance('default', { roughness: 0.9 });
    expect(inst).not.toBeNull();
    expect(inst!.baseMaterialId).toBe('default');
    expect(inst!.overrides.roughness).toBe(0.9);
    expect(ml.getInstanceCount()).toBe(1);
  });

  it('createInstance returns null for unknown base', () => {
    expect(ml.createInstance('nope')).toBeNull();
  });

  it('resolveInstance merges base + overrides', () => {
    const inst = ml.createInstance('default', { roughness: 0.1 });
    const resolved = ml.resolveInstance(inst!.id);
    expect(resolved).not.toBeNull();
    expect(resolved!.roughness).toBe(0.1);
    expect(resolved!.metallic).toBe(0); // from default
  });

  it('resolveInstance returns null for unknown', () => {
    expect(ml.resolveInstance('nope')).toBeNull();
  });

  it('getInstance retrieves by id', () => {
    const inst = ml.createInstance('default');
    expect(ml.getInstance(inst!.id)).toBeDefined();
    expect(ml.getInstance('nope')).toBeUndefined();
  });

  // Texture slots
  it('setTexture assigns texture slot', () => {
    expect(ml.setTexture('default', 'albedoMap', 'tex_diffuse')).toBe(true);
    const mat = ml.getMaterial('default')!;
    expect(mat.albedoMap).toBeDefined();
    expect(mat.albedoMap!.textureId).toBe('tex_diffuse');
    expect(mat.albedoMap!.tiling).toEqual({ x: 1, y: 1 });
  });

  it('setTexture returns false for unknown material', () => {
    expect(ml.setTexture('nope', 'normalMap', 'tex')).toBe(false);
  });

  // MATERIAL_PRESETS
  it('MATERIAL_PRESETS has expected keys', () => {
    expect(Object.keys(MATERIAL_PRESETS)).toEqual(
      expect.arrayContaining(['metal', 'wood', 'glass', 'plastic', 'emissive', 'ground'])
    );
  });

  it('glass preset is transparent double-sided', () => {
    expect(MATERIAL_PRESETS.glass.blendMode).toBe('transparent');
    expect(MATERIAL_PRESETS.glass.doubleSided).toBe(true);
  });
});
