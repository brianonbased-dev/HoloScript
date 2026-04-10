import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderTrait, SHADER_PRESETS, SHADER_CHUNKS } from '../ShaderTrait';

describe('ShaderTrait', () => {
  let shader: ShaderTrait;

  beforeEach(() => {
    shader = new ShaderTrait({
      source: {
        language: 'glsl',
        vertex: 'void main() { gl_Position = vec4(0.0); }',
        fragment: 'void main() { gl_FragColor = vec4(1.0); }',
      },
      uniforms: {
        time: { type: 'float', value: 0.0 },
        color: { type: 'vec3', value: [1.0, 0.0, 0.0] },
      },
      blendMode: 'opaque',
      depthTest: true,
      depthWrite: true,
      cullFace: 'back',
    });
  });

  it('initializes with config', () => {
    const cfg = shader.getConfig();
    expect(cfg.source!.language).toBe('glsl');
    expect(cfg.blendMode).toBe('opaque');
  });

  it('uniform values initialized from defaults', () => {
    expect(shader.getUniform('time')).toBe(0.0);
    expect(shader.getUniform('color')).toEqual([1.0, 0.0, 0.0]);
  });

  it('setUniform updates value', () => {
    shader.setUniform('time', 5.0);
    expect(shader.getUniform('time')).toBe(5.0);
  });

  it('getUniforms returns all', () => {
    const u = shader.getUniforms();
    expect(u.size).toBe(2);
    expect(u.has('time')).toBe(true);
  });

  it('getVertexSource includes precision and uniforms', () => {
    const src = shader.getVertexSource();
    expect(src).toContain('precision highp float');
    expect(src).toContain('uniform float time');
    expect(src).toContain('uniform vec3 color');
    expect(src).toContain('void main');
  });

  it('getFragmentSource assembles correctly', () => {
    const src = shader.getFragmentSource();
    expect(src).toContain('gl_FragColor');
  });

  it('validate passes for valid shader', () => {
    const result = shader.validate();
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when missing main()', () => {
    const bad = new ShaderTrait({
      source: { language: 'glsl', vertex: 'float x = 1.0;', fragment: 'float y = 2.0;' },
    });
    const result = bad.validate();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2); // missing main in both
  });

  it('validate catches unbalanced braces', () => {
    const bad = new ShaderTrait({
      source: {
        language: 'glsl',
        vertex: 'void main() {',
        fragment: 'void main() { gl_FragColor = vec4(1.0); }',
      },
    });
    const result = bad.validate();
    expect(result.errors.some((e) => e.code === 'E003')).toBe(true);
  });

  it('compile produces compiled code on success', () => {
    const result = shader.compile();
    expect(result.success).toBe(true);
    expect(result.compiledCode!.vertex).toBeDefined();
    expect(result.compiledCode!.fragment).toBeDefined();
  });

  it('compile with defines prepends them', () => {
    const result = shader.compile({ defines: { QUALITY: 'HIGH' } });
    expect(result.compiledCode!.vertex).toContain('#define QUALITY HIGH');
  });

  it('toThreeJSConfig produces valid config', () => {
    const cfg = shader.toThreeJSConfig();
    expect(cfg.vertexShader).toBeDefined();
    expect(cfg.fragmentShader).toBeDefined();
    expect(cfg.transparent).toBe(false);
    expect((cfg.uniforms as any).time.value).toBe(0.0);
  });

  it('includes add shader chunks', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: 'void main() {}', fragment: 'void main() {}' },
      includes: [{ path: 'noise' }],
    });
    const src = s.getVertexSource();
    expect(src).toContain('snoise');
  });

  it('SHADER_PRESETS.hologram has required fields', () => {
    expect(SHADER_PRESETS.hologram.name).toBe('hologram');
    expect(SHADER_PRESETS.hologram.uniforms.time).toBeDefined();
  });

  it('SHADER_CHUNKS has noise, hologram, fresnel, pbr', () => {
    expect(SHADER_CHUNKS.noise).toContain('snoise');
    expect(SHADER_CHUNKS.hologram).toContain('hologramScanline');
    expect(SHADER_CHUNKS.fresnel).toContain('fresnel');
    expect(SHADER_CHUNKS.pbr).toContain('distributionGGX');
  });
});
