import { describe, it, expect, beforeEach } from 'vitest';
import {
  MaterialTrait,
  createMaterialTrait,
  MATERIAL_PRESETS,
  type MaterialConfig,
  // type PBRMaterial,
} from '../traits/MaterialTrait';

describe('MaterialTrait', () => {
  let material: MaterialTrait;

  beforeEach(() => {
    const config: MaterialConfig = {
      type: 'pbr',
      pbr: {
        baseColor: { r: 1, g: 1, b: 1 },
        metallic: 0,
        roughness: 0.5,
      },
    };
    material = new MaterialTrait(config);
  });

  describe('initialization', () => {
    it('should create material with default PBR type', () => {
      const result = material.getMaterial();
      expect(result.type).toBe('pbr');
    });

    it('should initialize with provided configuration', () => {
      const config: MaterialConfig = {
        type: 'pbr',
        name: 'my-material',
        pbr: {
          baseColor: { r: 0.5, g: 0.5, b: 0.5 },
          metallic: 0.8,
          roughness: 0.2,
        },
      };
      const mat = new MaterialTrait(config);
      const result = mat.getMaterial();
      expect(result.name).toBe('my-material');
      expect(result.pbr?.metallic).toBe(0.8);
    });
  });

  describe('getPBRProperties', () => {
    it('should return PBR material properties', () => {
      const pbr = material.getPBRProperties();
      expect(pbr).toBeDefined();
      expect(pbr?.baseColor).toEqual({ r: 1, g: 1, b: 1 });
      expect(pbr?.metallic).toBe(0);
      expect(pbr?.roughness).toBe(0.5);
    });

    it('should return undefined for non-PBR material types', () => {
      const unlit = new MaterialTrait({ type: 'unlit' });
      expect(unlit.getPBRProperties()).toBeUndefined();
    });
  });

  describe('setProperty', () => {
    it('should update material property', () => {
      material.setProperty('type', 'transparent');
      const result = material.getMaterial();
      expect(result.type).toBe('transparent');
    });

    it('should update blend mode', () => {
      material.setProperty('blendMode', 'additive');
      const result = material.getMaterial();
      expect(result.blendMode).toBe('additive');
    });

    it('should toggle double-sided rendering', () => {
      material.setProperty('doubleSided', true);
      const result = material.getMaterial();
      expect(result.doubleSided).toBe(true);
    });
  });

  describe('updatePBR', () => {
    it('should update PBR material properties', () => {
      material.updatePBR({
        metallic: 1,
        roughness: 0.1,
      });
      const pbr = material.getPBRProperties();
      expect(pbr?.metallic).toBe(1);
      expect(pbr?.roughness).toBe(0.1);
    });

    it('should preserve existing properties when updating', () => {
      material.updatePBR({ metallic: 0.5 });
      const pbr = material.getPBRProperties();
      expect(pbr?.metallic).toBe(0.5);
      expect(pbr?.roughness).toBe(0.5); // Unchanged
    });

    it('should create default PBR if not exists', () => {
      const unlit = new MaterialTrait({ type: 'unlit' });
      unlit.updatePBR({ metallic: 0.7 });
      const pbr = unlit.getPBRProperties();
      expect(pbr).toBeDefined();
      expect(pbr?.metallic).toBe(0.7);
    });

    it('should support emission properties', () => {
      material.updatePBR({
        emission: {
          color: { r: 1, g: 0, b: 0 },
          intensity: 2.0,
        },
      });
      const pbr = material.getPBRProperties();
      expect(pbr?.emission?.color.r).toBe(1);
      expect(pbr?.emission?.intensity).toBe(2.0);
    });
  });

  describe('texture management', () => {
    it('should add texture map', () => {
      material.addTexture({
        path: '/textures/diffuse.png',
        channel: 'baseColor',
      });
      const textures = material.getTextures();
      expect(textures).toHaveLength(1);
      expect(textures[0].path).toBe('/textures/diffuse.png');
    });

    it('should support multiple textures', () => {
      material.addTexture({ path: '/t1.png', channel: 'baseColor' });
      material.addTexture({ path: '/t2.png', channel: 'normalMap' });
      material.addTexture({ path: '/t3.png', channel: 'roughnessMap' });
      expect(material.getTextures()).toHaveLength(3);
    });

    it('should preserve texture configuration', () => {
      material.addTexture({
        path: '/textures/normal.png',
        channel: 'normalMap',
        scale: { x: 2, y: 2 },
        filter: 'anisotropic',
        anisotropy: 16,
      });
      const textures = material.getTextures();
      expect(textures[0].scale).toEqual({ x: 2, y: 2 });
      expect(textures[0].filter).toBe('anisotropic');
      expect(textures[0].anisotropy).toBe(16);
    });

    it('should clear texture cache', () => {
      material.addTexture({ path: '/t1.png', channel: 'baseColor' });
      material.clearTextureCache();
      // Verify no error and textures still accessible
      expect(material.getTextures()).toHaveLength(1);
    });
  });

  describe('custom shaders', () => {
    it('should set custom shader code', () => {
      const shader = {
        fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        shaderLanguage: 'glsl' as const,
      };
      material.setCustomShader(shader);
      const result = material.getCustomShader();
      expect(result?.fragment).toBe(shader.fragment);
      expect(result?.shaderLanguage).toBe('glsl');
    });

    it('should support vertex and fragment shaders', () => {
      const shader = {
        vertex: 'void main() { gl_Position = vec4(1.0); }',
        fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        shaderLanguage: 'glsl' as const,
      };
      material.setCustomShader(shader);
      const result = material.getCustomShader();
      expect(result?.vertex).toBeDefined();
      expect(result?.fragment).toBeDefined();
    });
  });

  describe('optimization hints', () => {
    it('should enable texture streaming', () => {
      material.setTextureStreaming(true);
      const result = material.getMaterial();
      expect(result.optimization?.streamTextures).toBe(true);
    });

    it('should set texture compression', () => {
      material.setCompression('astc');
      const result = material.getMaterial();
      expect(result.optimization?.compression).toBe('astc');
    });

    it('should enable material instancing', () => {
      material.setInstanced(true);
      const result = material.getMaterial();
      expect(result.optimization?.instanced).toBe(true);
    });

    it('should get optimization configuration', () => {
      material.setTextureStreaming(true);
      material.setCompression('dxt');
      const opt = material.getOptimization();
      expect(opt?.streamTextures).toBe(true);
      expect(opt?.compression).toBe('dxt');
    });
  });

  describe('material presets', () => {
    it('should create chrome material', () => {
      const chrome = MATERIAL_PRESETS.chrome();
      expect(chrome.pbr?.metallic).toBe(1.0);
      expect(chrome.pbr?.roughness).toBe(0.1);
    });

    it('should create plastic material', () => {
      const plastic = MATERIAL_PRESETS.plastic();
      expect(plastic.pbr?.metallic).toBe(0);
      expect(plastic.pbr?.roughness).toBe(0.8);
    });

    it('should create wood material', () => {
      const wood = MATERIAL_PRESETS.wood();
      expect(wood.pbr?.baseColor.r).toBe(0.6);
      expect(wood.pbr?.roughness).toBe(0.4);
    });

    it('should create glass material', () => {
      const glass = MATERIAL_PRESETS.glass();
      expect(glass.type).toBe('transparent');
      expect(glass.blendMode).toBe('blend');
      expect(glass.pbr?.transmission).toBe(0.9);
    });

    it('should create emissive material', () => {
      const emissive = MATERIAL_PRESETS.emissive();
      expect(emissive.pbr?.emission).toBeDefined();
      expect(emissive.pbr?.emission?.intensity).toBe(2.0);
    });

    it('should create skin material', () => {
      const skin = MATERIAL_PRESETS.skin();
      expect(skin.pbr?.roughness).toBe(0.5);
      expect(skin.pbr?.ambientOcclusion).toBe(0.8);
    });
  });

  describe('factory function', () => {
    it('should create material via factory', () => {
      const config: MaterialConfig = {
        type: 'pbr',
        pbr: {
          baseColor: { r: 0.8, g: 0.8, b: 0.8 },
          metallic: 0.5,
          roughness: 0.5,
        },
      };
      const mat = createMaterialTrait(config);
      expect(mat.getMaterial().type).toBe('pbr');
    });
  });

  describe('disposal', () => {
    it('should dispose and cleanup', () => {
      material.addTexture({ path: '/t.png', channel: 'baseColor' });
      material.dispose();
      // Verify no error after disposal
      expect(() => material.clearTextureCache()).not.toThrow();
    });
  });

  describe('material copying', () => {
    it('should create independent material copy', () => {
      const original = material.getMaterial();
      const copy = new MaterialTrait(original);

      copy.updatePBR({ metallic: 0.9 });
      const originalAfter = material.getMaterial();

      expect(originalAfter.pbr?.metallic).toBe(0); // Unchanged
      expect(copy.getPBRProperties()?.metallic).toBe(0.9);
    });
  });

  describe('complex material setup', () => {
    it('should configure full PBR material with all properties', () => {
      const config: MaterialConfig = {
        type: 'pbr',
        name: 'realistic-paint',
        pbr: {
          baseColor: { r: 0.8, g: 0.2, b: 0.2, a: 1 },
          metallic: 0.1,
          roughness: 0.6,
          ambientOcclusion: 0.9,
          emission: { color: { r: 0, g: 0, b: 0 }, intensity: 0 },
          normalStrength: 1.0,
          parallaxHeight: 0.02,
          ior: 1.5,
        },
        textures: [
          { path: '/diffuse.png', channel: 'baseColor' },
          { path: '/normal.png', channel: 'normalMap' },
          { path: '/roughness.png', channel: 'roughnessMap' },
        ],
        doubleSided: false,
        blendMode: 'opaque',
        optimization: {
          compression: 'dxt',
          instanced: true,
          lodBias: 0.5,
        },
      };

      const mat = new MaterialTrait(config);
      const result = mat.getMaterial();

      expect(result.name).toBe('realistic-paint');
      expect(result.pbr?.baseColor.r).toBe(0.8);
      expect(result.textures).toHaveLength(3);
      expect(result.optimization?.compression).toBe('dxt');
    });
  });
});
