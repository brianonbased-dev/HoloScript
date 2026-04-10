/**
 * ShaderTrait Tests
 *
 * Tests for custom GLSL shader authoring with inline code support.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderTrait, createShaderTrait, SHADER_PRESETS, SHADER_CHUNKS } from './ShaderTrait';

describe('ShaderTrait', () => {
  let trait: ShaderTrait;

  beforeEach(() => {
    trait = createShaderTrait();
  });

  describe('factory function', () => {
    it('should create shader trait with factory', () => {
      expect(trait).toBeInstanceOf(ShaderTrait);
    });

    it('should create with custom config', () => {
      const custom = createShaderTrait({
        name: 'myShader',
        blendMode: 'blend',
      });
      expect(custom.getConfig().name).toBe('myShader');
      expect(custom.getConfig().blendMode).toBe('blend');
    });
  });

  describe('configuration', () => {
    it('should get configuration', () => {
      const config = trait.getConfig();
      expect(config).toBeDefined();
      expect(config.source).toBeDefined();
    });

    it('should have default blend mode', () => {
      const config = trait.getConfig();
      expect(config.blendMode).toBe('opaque');
    });
  });

  describe('shader sources', () => {
    it('should get vertex source', () => {
      const vertex = trait.getVertexSource();
      expect(typeof vertex).toBe('string');
    });

    it('should get fragment source', () => {
      const fragment = trait.getFragmentSource();
      expect(typeof fragment).toBe('string');
    });

    it('should create shader with inline sources', () => {
      const shader = new ShaderTrait({
        name: 'test',
        source: {
          language: 'glsl',
          vertex: 'void main() { gl_Position = vec4(0.0); }',
          fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        },
        uniforms: {},
      });

      expect(shader.getVertexSource()).toContain('gl_Position');
      expect(shader.getFragmentSource()).toContain('gl_FragColor');
    });
  });

  describe('uniforms', () => {
    it('should set and get uniform value', () => {
      const shader = new ShaderTrait({
        name: 'test',
        source: { language: 'glsl', vertex: '', fragment: '' },
        uniforms: {
          uTime: { type: 'float', value: 0.0 } as any,
        },
      });

      shader.setUniform('uTime', 1.5);
      expect(shader.getUniform('uTime')).toBe(1.5);
    });

    it('should get all uniforms', () => {
      const shader = new ShaderTrait({
        name: 'test',
        source: { language: 'glsl', vertex: '', fragment: '' },
        uniforms: {
          uTime: { type: 'float', value: 0.0 } as any,
          uColor: { type: 'vec3', value: [1, 0, 0] } as any,
        },
      });

      const uniforms = shader.getUniforms();
      expect(uniforms.size).toBe(2);
    });
  });

  describe('shader presets', () => {
    it('should have hologram preset', () => {
      expect(SHADER_PRESETS.hologram).toBeDefined();
      expect(SHADER_PRESETS.hologram.name).toBe('hologram');
      expect(SHADER_PRESETS.hologram.source.vertex).toContain('void main');
    });

    it('should have forceField preset', () => {
      expect(SHADER_PRESETS.forceField).toBeDefined();
      expect(SHADER_PRESETS.forceField.name).toBe('forceField');
    });

    it('should have dissolve preset', () => {
      expect(SHADER_PRESETS.dissolve).toBeDefined();
      expect(SHADER_PRESETS.dissolve.name).toBe('dissolve');
    });

    it('should create ShaderTrait from preset', () => {
      const hologramShader = new ShaderTrait(SHADER_PRESETS.hologram as any);
      expect(hologramShader.getConfig().name).toBe('hologram');
    });
  });

  describe('shader chunks', () => {
    it('should have noise chunk', () => {
      expect(SHADER_CHUNKS).toBeDefined();
      expect(SHADER_CHUNKS.noise).toBeDefined();
    });

    it('should have hologram chunk', () => {
      expect(SHADER_CHUNKS.hologram).toBeDefined();
    });

    it('should have fresnel chunk', () => {
      expect(SHADER_CHUNKS.fresnel).toBeDefined();
    });

    it('should have pbr chunk', () => {
      expect(SHADER_CHUNKS.pbr).toBeDefined();
    });

    it('should have uv chunk', () => {
      expect(SHADER_CHUNKS.uv).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should validate shader', () => {
      const result = trait.validate();
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should validate shader with vertex source', () => {
      const shader = new ShaderTrait({
        name: 'valid',
        source: {
          language: 'glsl',
          vertex: 'void main() { gl_Position = vec4(0.0); }',
          fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        },
        uniforms: {},
      });

      const result = shader.validate();
      expect(result.success).toBe(true);
    });
  });

  describe('compilation', () => {
    it('should compile shader', () => {
      const shader = new ShaderTrait({
        name: 'compile-test',
        source: {
          language: 'glsl',
          vertex: 'void main() { gl_Position = vec4(0.0); }',
          fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        },
        uniforms: {},
      });

      const result = shader.compile();
      expect(result.success).toBe(true);
    });
  });

  describe('Three.js integration', () => {
    it('should generate Three.js shader config', () => {
      const shader = new ShaderTrait({
        name: 'three-test',
        source: {
          language: 'glsl',
          vertex: 'void main() { gl_Position = vec4(0.0); }',
          fragment: 'void main() { gl_FragColor = vec4(1.0); }',
        },
        uniforms: {
          uTime: { type: 'float', value: 0.0 },
        },
      });

      const threeConfig = shader.toThreeJSConfig();
      expect(threeConfig.vertexShader).toBeDefined();
      expect(threeConfig.fragmentShader).toBeDefined();
      expect(threeConfig.uniforms).toBeDefined();
    });

    it('should respect transparency setting', () => {
      const opaqueShader = createShaderTrait({ blendMode: 'opaque' });
      expect(opaqueShader.toThreeJSConfig().transparent).toBe(false);

      const blendShader = createShaderTrait({ blendMode: 'blend' });
      expect(blendShader.toThreeJSConfig().transparent).toBe(true);
    });
  });
});
