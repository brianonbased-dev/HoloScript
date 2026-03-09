import { describe, it, expect, beforeEach } from 'vitest';
import { MaterialTrait, createMaterialTrait, MATERIAL_PRESETS } from '../MaterialTrait';

describe('MaterialTrait', () => {
  let mat: MaterialTrait;

  beforeEach(() => {
    mat = createMaterialTrait({
      type: 'pbr',
      pbr: { baseColor: { r: 1, g: 1, b: 1 }, metallic: 0.5, roughness: 0.3 },
    });
  });

  it('initializes with config', () => {
    const m = mat.getMaterial();
    expect(m.type).toBe('pbr');
    expect(m.pbr!.metallic).toBe(0.5);
    expect(m.pbr!.roughness).toBe(0.3);
  });

  it('setProperty changes material', () => {
    mat.setProperty('doubleSided', true);
    expect(mat.getMaterial().doubleSided).toBe(true);
  });

  it('getPBRProperties returns PBR', () => {
    const pbr = mat.getPBRProperties();
    expect(pbr).toBeDefined();
    expect(pbr!.baseColor.r).toBe(1);
  });

  it('updatePBR merges properties', () => {
    mat.updatePBR({ metallic: 1.0, emission: { color: { r: 0, g: 1, b: 0 }, intensity: 2 } });
    const pbr = mat.getPBRProperties()!;
    expect(pbr.metallic).toBe(1.0);
    expect(pbr.emission!.intensity).toBe(2);
    expect(pbr.roughness).toBe(0.3); // unchanged
  });

  it('updatePBR creates PBR if missing', () => {
    const unlit = createMaterialTrait({ type: 'unlit' });
    unlit.updatePBR({ metallic: 0.5 });
    expect(unlit.getPBRProperties()!.metallic).toBe(0.5);
  });

  it('addTexture stores textures', () => {
    mat.addTexture({ path: '/tex/diffuse.png', channel: 'baseColor' });
    mat.addTexture({ path: '/tex/normal.png', channel: 'normalMap' });
    expect(mat.getTextures()).toHaveLength(2);
  });

  it('getCustomShader and setCustomShader work', () => {
    expect(mat.getCustomShader()).toBeUndefined();
    mat.setCustomShader({
      vertex: 'void main(){}',
      fragment: 'void main(){}',
      shaderLanguage: 'glsl',
    });
    expect(mat.getCustomShader()!.shaderLanguage).toBe('glsl');
  });

  it('setTextureStreaming creates optimization config', () => {
    mat.setTextureStreaming(true);
    expect(mat.getOptimization()!.streamTextures).toBe(true);
  });

  it('setCompression sets compression type', () => {
    mat.setCompression('astc');
    expect(mat.getOptimization()!.compression).toBe('astc');
  });

  it('setInstanced sets instanced flag', () => {
    mat.setInstanced(true);
    expect(mat.getOptimization()!.instanced).toBe(true);
  });

  it('presets create valid configs', () => {
    const chrome = MATERIAL_PRESETS.chrome();
    expect(chrome.type).toBe('pbr');
    expect(chrome.pbr!.metallic).toBe(1.0);

    const glass = MATERIAL_PRESETS.glass();
    expect(glass.type).toBe('transparent');
    expect(glass.pbr!.transmission).toBe(0.9);
  });

  it('dispose clears cache', () => {
    mat.dispose();
    // No error thrown
  });
});
