/**
 * MaterialTrait — Production Tests
 *
 * Tests: constructor init, getMaterial, setProperty, getPBRProperties, updatePBR,
 * addTexture / getTextures (copy guard), setCustomShader / getCustomShader,
 * setTextureStreaming, setCompression, setInstanced (optimization block lazily created),
 * getOptimization, dispose, createMaterialTrait factory, MATERIAL_PRESETS roundtrip.
 */
import { describe, it, expect } from 'vitest';
import { MaterialTrait, createMaterialTrait, MATERIAL_PRESETS } from '../MaterialTrait';
import type { MaterialConfig, TextureMap } from '../MaterialTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function pbrConfig(overrides: Partial<MaterialConfig> = {}): MaterialConfig {
  return {
    type: 'pbr',
    pbr: { baseColor: { r: 1, g: 1, b: 1 }, metallic: 0, roughness: 0.5 },
    ...overrides,
  };
}

function tex(path: string, channel: TextureMap['channel'] = 'baseColor'): TextureMap {
  return { path, channel };
}

// ─── Constructor / getMaterial ────────────────────────────────────────────────────

describe('MaterialTrait — constructor', () => {
  it('createMaterialTrait factory returns MaterialTrait', () => {
    expect(createMaterialTrait(pbrConfig())).toBeInstanceOf(MaterialTrait);
  });

  it('getMaterial returns the configured type', () => {
    const m = new MaterialTrait(pbrConfig({ type: 'unlit' }));
    expect(m.getMaterial().type).toBe('unlit');
  });

  it('getMaterial returns a shallow copy (not the internal reference)', () => {
    const m = new MaterialTrait(pbrConfig());
    const a = m.getMaterial();
    const b = m.getMaterial();
    expect(a).not.toBe(b);
  });
});

// ─── setProperty ─────────────────────────────────────────────────────────────────

describe('MaterialTrait — setProperty', () => {
  it('setProperty updates type', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setProperty('type', 'transparent');
    expect(m.getMaterial().type).toBe('transparent');
  });

  it('setProperty updates blendMode', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setProperty('blendMode', 'additive');
    expect(m.getMaterial().blendMode).toBe('additive');
  });

  it('setProperty updates name', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setProperty('name', 'my_mat');
    expect(m.getMaterial().name).toBe('my_mat');
  });

  it('setProperty updates doubleSided', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setProperty('doubleSided', true);
    expect(m.getMaterial().doubleSided).toBe(true);
  });
});

// ─── PBR ─────────────────────────────────────────────────────────────────────────

describe('MaterialTrait — PBR', () => {
  it('getPBRProperties returns PBR config', () => {
    const m = new MaterialTrait(pbrConfig());
    const pbr = m.getPBRProperties();
    expect(pbr?.metallic).toBe(0);
    expect(pbr?.roughness).toBeCloseTo(0.5);
  });

  it('getPBRProperties returns undefined when no PBR set', () => {
    const m = new MaterialTrait({ type: 'custom' });
    expect(m.getPBRProperties()).toBeUndefined();
  });

  it('updatePBR merges changes into existing PBR', () => {
    const m = new MaterialTrait(pbrConfig());
    m.updatePBR({ metallic: 0.9 });
    expect(m.getPBRProperties()?.metallic).toBeCloseTo(0.9);
    expect(m.getPBRProperties()?.roughness).toBeCloseTo(0.5); // unchanged
  });

  it('updatePBR creates default PBR when none exists', () => {
    const m = new MaterialTrait({ type: 'custom' });
    m.updatePBR({ metallic: 0.5 });
    expect(m.getPBRProperties()?.metallic).toBeCloseTo(0.5);
    expect(m.getPBRProperties()?.baseColor).toEqual({ r: 1, g: 1, b: 1 });
  });

  it('updatePBR can set emission', () => {
    const m = new MaterialTrait(pbrConfig());
    m.updatePBR({ emission: { color: { r: 0, g: 1, b: 0 }, intensity: 2 } });
    expect(m.getPBRProperties()?.emission?.intensity).toBe(2);
  });

  it('updatePBR can set advanced PBR: clearcoat', () => {
    const m = new MaterialTrait(pbrConfig());
    m.updatePBR({ clearcoat: { intensity: 0.8, roughness: 0.1 } });
    expect(m.getPBRProperties()?.clearcoat?.intensity).toBeCloseTo(0.8);
  });

  it('updatePBR can set sheen', () => {
    const m = new MaterialTrait(pbrConfig());
    m.updatePBR({ sheen: { intensity: 0.5, color: { r: 1, g: 0.9, b: 0.8 }, roughness: 0.3 } });
    expect(m.getPBRProperties()?.sheen?.intensity).toBeCloseTo(0.5);
  });

  it('updatePBR can set iridescence', () => {
    const m = new MaterialTrait(pbrConfig());
    m.updatePBR({ iridescence: { intensity: 0.7, ior: 1.4 } });
    expect(m.getPBRProperties()?.iridescence?.ior).toBe(1.4);
  });

  it('updatePBR can set weathering', () => {
    const m = new MaterialTrait(pbrConfig());
    m.updatePBR({ weathering: { type: 'rust', progress: 0.3 } });
    expect(m.getPBRProperties()?.weathering?.type).toBe('rust');
    expect(m.getPBRProperties()?.weathering?.progress).toBeCloseTo(0.3);
  });
});

// ─── Textures ────────────────────────────────────────────────────────────────────

describe('MaterialTrait — textures', () => {
  it('addTexture appends to texture list', () => {
    const m = new MaterialTrait(pbrConfig());
    m.addTexture(tex('diffuse.png', 'baseColor'));
    expect(m.getTextures()).toHaveLength(1);
    expect(m.getTextures()[0].path).toBe('diffuse.png');
  });

  it('can add multiple textures to different channels', () => {
    const m = new MaterialTrait(pbrConfig());
    m.addTexture(tex('albedo.png', 'baseColor'));
    m.addTexture(tex('normal.png', 'normalMap'));
    m.addTexture(tex('rough.png', 'roughnessMap'));
    expect(m.getTextures()).toHaveLength(3);
    expect(m.getTextures()[1].channel).toBe('normalMap');
  });

  it('getTextures returns a copy — mutations do not affect internal state', () => {
    const m = new MaterialTrait(pbrConfig());
    m.addTexture(tex('x.png'));
    const list = m.getTextures();
    list.push(tex('injected.png'));
    expect(m.getTextures()).toHaveLength(1); // original unchanged
  });

  it('addTexture lazy-initialises textures array', () => {
    const m = new MaterialTrait({ type: 'pbr' }); // no textures initially
    m.addTexture(tex('new.png'));
    expect(m.getTextures()).toHaveLength(1);
  });

  it('initialises textures from config', () => {
    const m = new MaterialTrait(
      pbrConfig({
        textures: [tex('a.png', 'roughnessMap'), tex('b.png', 'metallicMap')],
      })
    );
    expect(m.getTextures()).toHaveLength(2);
  });
});

// ─── Custom shader ───────────────────────────────────────────────────────────────

describe('MaterialTrait — customShader', () => {
  it('setCustomShader sets the custom shader', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setCustomShader({ vertex: 'void main() {}', shaderLanguage: 'glsl' });
    expect(m.getCustomShader()?.vertex).toBe('void main() {}');
  });

  it('getCustomShader returns undefined when not set', () => {
    const m = new MaterialTrait(pbrConfig());
    expect(m.getCustomShader()).toBeUndefined();
  });

  it('setCustomShader from constructor config', () => {
    const m = new MaterialTrait({
      type: 'custom',
      customShader: {
        fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        shaderLanguage: 'glsl',
      },
    });
    expect(m.getCustomShader()?.shaderLanguage).toBe('glsl');
  });
});

// ─── Optimization ────────────────────────────────────────────────────────────────

describe('MaterialTrait — optimization', () => {
  it('setTextureStreaming(true) enables stream textures', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setTextureStreaming(true);
    expect(m.getOptimization()?.streamTextures).toBe(true);
  });

  it('setTextureStreaming lazily creates optimization block', () => {
    const m = new MaterialTrait({ type: 'pbr' }); // no optimization
    m.setTextureStreaming(false);
    expect(m.getOptimization()?.streamTextures).toBe(false);
  });

  it('setCompression sets compression mode', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setCompression('astc');
    expect(m.getOptimization()?.compression).toBe('astc');
  });

  it('setCompression options: none, dxt, astc, basis', () => {
    const m = new MaterialTrait(pbrConfig());
    for (const mode of ['none', 'dxt', 'astc', 'basis'] as const) {
      m.setCompression(mode);
      expect(m.getOptimization()?.compression).toBe(mode);
    }
  });

  it('setInstanced(true) enables instancing', () => {
    const m = new MaterialTrait(pbrConfig());
    m.setInstanced(true);
    expect(m.getOptimization()?.instanced).toBe(true);
  });

  it('getOptimization returns undefined when none set', () => {
    const m = new MaterialTrait({ type: 'pbr' });
    expect(m.getOptimization()).toBeUndefined();
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────────

describe('MaterialTrait — dispose', () => {
  it('dispose does not throw', () => {
    const m = new MaterialTrait(pbrConfig());
    expect(() => m.dispose()).not.toThrow();
  });
});

// ─── MATERIAL_PRESETS ─────────────────────────────────────────────────────────────

describe('MATERIAL_PRESETS', () => {
  it('chrome: metallic=1, roughness=0.1', () => {
    const cfg = MATERIAL_PRESETS.chrome();
    expect(cfg.pbr?.metallic).toBe(1.0);
    expect(cfg.pbr?.roughness).toBe(0.1);
  });

  it('plastic: metallic=0, roughness=0.8', () => {
    const cfg = MATERIAL_PRESETS.plastic();
    expect(cfg.pbr?.metallic).toBe(0);
    expect(cfg.pbr?.roughness).toBe(0.8);
  });

  it('glass: type=transparent, ior=1.5, transmission=0.9', () => {
    const cfg = MATERIAL_PRESETS.glass();
    expect(cfg.type).toBe('transparent');
    expect(cfg.pbr?.ior).toBe(1.5);
    expect(cfg.pbr?.transmission).toBe(0.9);
  });

  it('emissive: has emission with intensity=2', () => {
    const cfg = MATERIAL_PRESETS.emissive();
    expect(cfg.pbr?.emission?.intensity).toBe(2);
  });

  it('skin: roughness=0.5, ambientOcclusion=0.8', () => {
    const cfg = MATERIAL_PRESETS.skin();
    expect(cfg.pbr?.roughness).toBe(0.5);
    expect(cfg.pbr?.ambientOcclusion).toBe(0.8);
  });

  it('wood: non-metallic', () => {
    const cfg = MATERIAL_PRESETS.wood();
    expect(cfg.pbr?.metallic).toBe(0);
  });

  it('all presets return type pbr or transparent', () => {
    for (const [name, factory] of Object.entries(MATERIAL_PRESETS)) {
      const cfg = factory();
      expect(['pbr', 'transparent']).toContain(cfg.type);
    }
  });

  it('presets can be used as MaterialTrait config', () => {
    for (const factory of Object.values(MATERIAL_PRESETS)) {
      expect(() => new MaterialTrait(factory())).not.toThrow();
    }
  });
});
