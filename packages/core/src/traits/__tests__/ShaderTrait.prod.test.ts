/**
 * ShaderTrait — Production Tests
 *
 * Tests: constructor init, setUniform/getUniform/getUniforms, getVertexSource /
 * getFragmentSource (GLSL precision header + uniform declarations + includes + source),
 * validate: success for valid shader, errors for missing main(), unbalanced braces/parens,
 * compile: resolves defines into output, returns validation errors on failure,
 * toThreeJSConfig: uniform object format, depthTest, depthWrite, transparent, cullFace→side,
 * SHADER_CHUNKS accessible, SHADER_PRESETS hologram/forceField/dissolve have required fields.
 */
import { describe, it, expect } from 'vitest';
import { ShaderTrait, SHADER_CHUNKS, SHADER_PRESETS } from '../ShaderTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────────

const VALID_VERT = 'void main() { gl_Position = vec4(0.0); }';
const VALID_FRAG = 'void main() { gl_FragColor = vec4(1.0); }';

function mkShader(
  overrides: ConstructorParameters<typeof ShaderTrait>[0] = {
    source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
  }
) {
  return new ShaderTrait(overrides);
}

// ─── Constructor / defaults ──────────────────────────────────────────────────────

describe('ShaderTrait — constructor', () => {
  it('creates with provided source', () => {
    const s = mkShader();
    expect(s.getConfig().source?.language).toBe('glsl');
  });

  it('uniforms are initialised from config defaults', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      uniforms: {
        time: { type: 'float', value: 0.5 },
        opacity: { type: 'float', value: 0.8 },
      },
    });
    expect(s.getUniform('time')).toBe(0.5);
    expect(s.getUniform('opacity')).toBe(0.8);
  });

  it('getUniform returns undefined for unknown uniform', () => {
    const s = mkShader();
    expect(s.getUniform('ghost')).toBeUndefined();
  });
});

// ─── setUniform / getUniform / getUniforms ────────────────────────────────────────

describe('ShaderTrait — uniforms', () => {
  it('setUniform stores a float value', () => {
    const s = mkShader();
    s.setUniform('time', 1.5);
    expect(s.getUniform('time')).toBe(1.5);
  });

  it('setUniform stores an array value', () => {
    const s = mkShader();
    s.setUniform('color', [0.2, 0.5, 1.0]);
    expect(s.getUniform('color')).toEqual([0.2, 0.5, 1.0]);
  });

  it('setUniform stores a boolean', () => {
    const s = mkShader();
    s.setUniform('flag', true);
    expect(s.getUniform('flag')).toBe(true);
  });

  it('getUniforms returns a copy of all uniform values', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      uniforms: { a: { type: 'float', value: 1 }, b: { type: 'float', value: 2 } },
    });
    const uniforms = s.getUniforms();
    expect(uniforms.get('a')).toBe(1);
    expect(uniforms.get('b')).toBe(2);
    // Should be a copy — mutations don't affect internal state
    uniforms.set('a', 999);
    expect(s.getUniform('a')).toBe(1);
  });
});

// ─── getVertexSource / getFragmentSource ─────────────────────────────────────────

describe('ShaderTrait — source assembly', () => {
  it('getVertexSource includes precision header for GLSL', () => {
    const s = mkShader();
    expect(s.getVertexSource()).toContain('precision highp float');
  });

  it('getFragmentSource includes precision header for GLSL', () => {
    const s = mkShader();
    expect(s.getFragmentSource()).toContain('precision highp float');
  });

  it('getVertexSource injects uniform declarations', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      uniforms: { time: { type: 'float', value: 0 } },
    });
    expect(s.getVertexSource()).toContain('uniform float time;');
  });

  it('getVertexSource appends the user source code', () => {
    const s = mkShader();
    expect(s.getVertexSource()).toContain(VALID_VERT);
  });

  it('getVertexSource includes SHADER_CHUNKS content when include path matches', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      includes: [{ path: 'noise' }],
    });
    expect(s.getVertexSource()).toContain('snoise');
  });

  it('getVertexSource returns empty string when no vertex source', () => {
    const s = new ShaderTrait({ source: { language: 'glsl' } });
    expect(s.getVertexSource()).toBe('');
  });

  it('getFragmentSource returns empty string when no fragment source', () => {
    const s = new ShaderTrait({ source: { language: 'glsl' } });
    expect(s.getFragmentSource()).toBe('');
  });
});

// ─── validate ────────────────────────────────────────────────────────────────────

describe('ShaderTrait — validate', () => {
  it('valid shader returns success=true with no errors', () => {
    const s = mkShader();
    const result = s.validate();
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('missing void main() in vertex produces E001 error', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: '// no main here', fragment: VALID_FRAG },
    });
    const result = s.validate();
    expect(result.success).toBe(false);
    const err = result.errors.find((e) => e.code === 'E001');
    expect(err).toBeDefined();
    expect(err?.stage).toBe('vertex');
  });

  it('missing void main() in fragment produces E002 error', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: '// no main' },
    });
    const result = s.validate();
    expect(result.success).toBe(false);
    const err = result.errors.find((e) => e.code === 'E002');
    expect(err).toBeDefined();
    expect(err?.stage).toBe('fragment');
  });

  it('unbalanced braces in vertex produces E003 error', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: 'void main() { {', fragment: VALID_FRAG },
    });
    const result = s.validate();
    const err = result.errors.find((e) => e.code === 'E003');
    expect(err).toBeDefined();
  });

  it('unbalanced parentheses in vertex produces E004 error', () => {
    const s = new ShaderTrait({
      source: {
        language: 'glsl',
        vertex: 'void main() { float x = sin(1.0; }',
        fragment: VALID_FRAG,
      },
    });
    const result = s.validate();
    const err = result.errors.find((e) => e.code === 'E004');
    expect(err).toBeDefined();
  });

  it('validate with no source set returns success=true (nothing to validate)', () => {
    const s = new ShaderTrait({ source: { language: 'glsl' } });
    const result = s.validate();
    expect(result.success).toBe(true);
  });
});

// ─── compile ─────────────────────────────────────────────────────────────────────

describe('ShaderTrait — compile', () => {
  it('compile returns success=true for valid shader', () => {
    const s = mkShader();
    const result = s.compile();
    expect(result.success).toBe(true);
    expect(result.compiledCode?.vertex).toBeDefined();
    expect(result.compiledCode?.fragment).toBeDefined();
  });

  it('compile injects #define into compiled output', () => {
    const s = mkShader();
    const result = s.compile({ defines: { MY_CONSTANT: 42, DEBUG: true } });
    expect(result.compiledCode?.vertex).toContain('#define MY_CONSTANT 42');
    expect(result.compiledCode?.vertex).toContain('#define DEBUG true');
    expect(result.compiledCode?.fragment).toContain('#define MY_CONSTANT 42');
  });

  it('compile short-circuits and returns errors for invalid shader', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: '// no main', fragment: VALID_FRAG },
    });
    const result = s.compile();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.compiledCode).toBeUndefined();
  });
});

// ─── toThreeJSConfig ─────────────────────────────────────────────────────────────

describe('ShaderTrait — toThreeJSConfig', () => {
  it('returns vertexShader and fragmentShader strings', () => {
    const s = mkShader();
    const cfg = s.toThreeJSConfig();
    expect(typeof cfg.vertexShader).toBe('string');
    expect(typeof cfg.fragmentShader).toBe('string');
  });

  it('uniforms are formatted as { value: ... } objects', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      uniforms: { time: { type: 'float', value: 2.5 } },
    });
    const cfg = s.toThreeJSConfig() as any;
    expect(cfg.uniforms.time.value).toBe(2.5);
  });

  it('transparent=false for opaque blend mode', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      blendMode: 'opaque',
    });
    expect(s.toThreeJSConfig().transparent).toBe(false);
  });

  it('transparent=true for non-opaque blend mode', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      blendMode: 'blend',
    });
    expect(s.toThreeJSConfig().transparent).toBe(true);
  });

  it('depthTest defaults to true', () => {
    const s = mkShader();
    expect(s.toThreeJSConfig().depthTest).toBe(true);
  });

  it('depthWrite defaults to true', () => {
    const s = mkShader();
    expect(s.toThreeJSConfig().depthWrite).toBe(true);
  });

  it('cullFace=none → side=2 (DoubleSide)', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      cullFace: 'none',
    });
    expect(s.toThreeJSConfig().side).toBe(2);
  });

  it('cullFace=front → side=1 (BackSide)', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      cullFace: 'front',
    });
    expect(s.toThreeJSConfig().side).toBe(1);
  });

  it('cullFace=back → side=0 (FrontSide)', () => {
    const s = new ShaderTrait({
      source: { language: 'glsl', vertex: VALID_VERT, fragment: VALID_FRAG },
      cullFace: 'back',
    });
    expect(s.toThreeJSConfig().side).toBe(0);
  });
});

// ─── SHADER_CHUNKS ───────────────────────────────────────────────────────────────

describe('SHADER_CHUNKS', () => {
  it('exports noise chunk with snoise function', () => {
    expect(SHADER_CHUNKS.noise).toContain('snoise');
  });

  it('exports hologram chunk with hologramScanline', () => {
    expect(SHADER_CHUNKS.hologram).toContain('hologramScanline');
  });

  it('exports fresnel chunk with fresnelSchlick', () => {
    expect(SHADER_CHUNKS.fresnel).toContain('fresnelSchlick');
  });

  it('exports pbr chunk with distributionGGX', () => {
    expect(SHADER_CHUNKS.pbr).toContain('distributionGGX');
  });

  it('exports uv chunk with rotateUV', () => {
    expect(SHADER_CHUNKS.uv).toContain('rotateUV');
  });
});

// ─── SHADER_PRESETS ──────────────────────────────────────────────────────────────

describe('SHADER_PRESETS', () => {
  it('hologram preset has time and color uniforms', () => {
    expect(SHADER_PRESETS.hologram.uniforms.time).toBeDefined();
    expect(SHADER_PRESETS.hologram.uniforms.color).toBeDefined();
  });

  it('hologram preset uses blend mode', () => {
    expect(SHADER_PRESETS.hologram.blendMode).toBe('blend');
  });

  it('forceField preset has pulseSpeed and hexScale uniforms', () => {
    expect(SHADER_PRESETS.forceField.uniforms.pulseSpeed).toBeDefined();
    expect(SHADER_PRESETS.forceField.uniforms.hexScale).toBeDefined();
  });

  it('forceField uses additive blend mode', () => {
    expect(SHADER_PRESETS.forceField.blendMode).toBe('additive');
  });

  it('dissolve preset has progress and edgeColor uniforms', () => {
    expect(SHADER_PRESETS.dissolve.uniforms.progress).toBeDefined();
    expect(SHADER_PRESETS.dissolve.uniforms.edgeColor).toBeDefined();
  });

  it('all presets have valid source.language = glsl', () => {
    for (const preset of Object.values(SHADER_PRESETS)) {
      expect(preset.source.language).toBe('glsl');
    }
  });
});
