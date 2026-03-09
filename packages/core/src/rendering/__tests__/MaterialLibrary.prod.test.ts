/**
 * MaterialLibrary — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialLibrary, MATERIAL_PRESETS, type MaterialDef } from '../MaterialLibrary';

function makeLib() {
  return new MaterialLibrary();
}
function makeMat(id: string, name = id): MaterialDef {
  return {
    id,
    name,
    albedo: { r: 1, g: 1, b: 1, a: 1 },
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
  };
}

describe('MaterialLibrary — construction', () => {
  it('starts with 1 material (default)', () => {
    expect(makeLib().getMaterialCount()).toBe(1);
  });
  it('default material id is "default"', () => {
    expect(makeLib().getMaterial('default')!.id).toBe('default');
  });
  it('default metallic=0, roughness=0.5', () => {
    const m = makeLib().getMaterial('default')!;
    expect(m.metallic).toBe(0);
    expect(m.roughness).toBe(0.5);
  });
});

describe('MaterialLibrary — register / getMaterial / unregister / getAllMaterials', () => {
  it('register adds a material', () => {
    const lib = makeLib();
    lib.register(makeMat('brick'));
    expect(lib.getMaterial('brick')).toBeDefined();
  });
  it('getMaterial returns undefined for unknown id', () => {
    expect(makeLib().getMaterial('nope')).toBeUndefined();
  });
  it('register overwrites same id', () => {
    const lib = makeLib();
    lib.register(makeMat('m', 'First'));
    lib.register(makeMat('m', 'Second'));
    expect(lib.getMaterial('m')!.name).toBe('Second');
  });
  it('unregister removes material', () => {
    const lib = makeLib();
    lib.register(makeMat('temp'));
    lib.unregister('temp');
    expect(lib.getMaterial('temp')).toBeUndefined();
  });
  it('unregister removes instances referencing that material', () => {
    const lib = makeLib();
    lib.register(makeMat('base'));
    const inst = lib.createInstance('base')!;
    lib.unregister('base');
    expect(lib.getInstance(inst.id)).toBeUndefined();
  });
  it('getMaterialCount reflects register/unregister', () => {
    const lib = makeLib();
    lib.register(makeMat('a'));
    lib.register(makeMat('b'));
    expect(lib.getMaterialCount()).toBe(3);
    lib.unregister('a');
    expect(lib.getMaterialCount()).toBe(2);
  });
  it('getAllMaterials returns all ids', () => {
    const lib = makeLib();
    lib.register(makeMat('a'));
    const ids = lib.getAllMaterials().map((m) => m.id);
    expect(ids).toContain('default');
    expect(ids).toContain('a');
  });
});

describe('MaterialLibrary — MATERIAL_PRESETS and registerPreset', () => {
  it('MATERIAL_PRESETS has metal/glass/wood', () => {
    expect(Object.keys(MATERIAL_PRESETS)).toContain('metal');
    expect(Object.keys(MATERIAL_PRESETS)).toContain('glass');
    expect(Object.keys(MATERIAL_PRESETS)).toContain('wood');
  });
  it('registerPreset returns a MaterialDef', () => {
    const mat = makeLib().registerPreset('metal');
    expect(mat).not.toBeNull();
    expect(mat!.metallic).toBeCloseTo(0.9);
  });
  it('registerPreset uses presetName as id by default', () => {
    const lib = makeLib();
    const mat = lib.registerPreset('wood')!;
    expect(mat.id).toBe('wood');
    expect(lib.getMaterial('wood')).toBeDefined();
  });
  it('registerPreset with custom id', () => {
    const lib = makeLib();
    lib.registerPreset('glass', 'my-glass');
    expect(lib.getMaterial('my-glass')).toBeDefined();
    expect(lib.getMaterial('glass')).toBeUndefined();
  });
  it('registerPreset returns null for unknown preset', () => {
    expect(makeLib().registerPreset('unobtanium')).toBeNull();
  });
  it('glass preset has blendMode=transparent', () => {
    expect(makeLib().registerPreset('glass')!.blendMode).toBe('transparent');
  });
  it('emissive preset has emissionStrength > 0', () => {
    expect(makeLib().registerPreset('emissive')!.emissionStrength).toBeGreaterThan(0);
  });
});

describe('MaterialLibrary — createInstance / resolveInstance', () => {
  it('createInstance returns null for unknown base', () => {
    expect(makeLib().createInstance('ghost')).toBeNull();
  });
  it('createInstance baseMaterialId is correct', () => {
    expect(makeLib().createInstance('default')!.baseMaterialId).toBe('default');
  });
  it('instance ids are unique', () => {
    const lib = makeLib();
    expect(lib.createInstance('default')!.id).not.toBe(lib.createInstance('default')!.id);
  });
  it('getInstanceCount increments', () => {
    const lib = makeLib();
    lib.createInstance('default');
    lib.createInstance('default');
    expect(lib.getInstanceCount()).toBe(2);
  });
  it('resolveInstance returns null for unknown id', () => {
    expect(makeLib().resolveInstance('nope')).toBeNull();
  });
  it('resolveInstance merges base + overrides', () => {
    const lib = makeLib();
    const inst = lib.createInstance('default', { metallic: 0.99 })!;
    expect(lib.resolveInstance(inst.id)!.metallic).toBeCloseTo(0.99);
  });
  it('resolveInstance id matches instance id', () => {
    const lib = makeLib();
    const inst = lib.createInstance('default')!;
    expect(lib.resolveInstance(inst.id)!.id).toBe(inst.id);
  });
  it('getInstance retrieves raw instance overrides', () => {
    const lib = makeLib();
    const inst = lib.createInstance('default', { metallic: 0.5 })!;
    expect(lib.getInstance(inst.id)!.overrides.metallic).toBe(0.5);
  });
});

describe('MaterialLibrary — setTexture', () => {
  it('returns false for unknown material', () => {
    expect(makeLib().setTexture('ghost', 'albedoMap', 't')).toBe(false);
  });
  it('returns true for known material', () => {
    expect(makeLib().setTexture('default', 'albedoMap', 't')).toBe(true);
  });
  it('sets textureId on the material slot', () => {
    const lib = makeLib();
    lib.setTexture('default', 'normalMap', 'norm');
    expect(lib.getMaterial('default')!.normalMap!.textureId).toBe('norm');
  });
  it('slot has default uvChannel=0, tiling (1,1), offset (0,0)', () => {
    const lib = makeLib();
    lib.setTexture('default', 'aoMap', 'ao');
    const slot = lib.getMaterial('default')!.aoMap!;
    expect(slot.uvChannel).toBe(0);
    expect(slot.tiling).toEqual({ x: 1, y: 1 });
    expect(slot.offset).toEqual({ x: 0, y: 0 });
  });
  it('can set all 5 texture slots', () => {
    const lib = makeLib();
    const slots = [
      'albedoMap',
      'normalMap',
      'metallicRoughnessMap',
      'emissionMap',
      'aoMap',
    ] as const;
    for (const s of slots) lib.setTexture('default', s, `tex-${s}`);
    const mat = lib.getMaterial('default')!;
    for (const s of slots) expect(mat[s]).toBeDefined();
  });
});
