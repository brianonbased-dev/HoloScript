/**
 * Scenario: Shader Compiler Utils — Transpilation & Validation
 *
 * Tests for all pure shader helper functions:
 * - GLSL → WGSL transpilation
 * - GLSL → HLSL transpilation
 * - GLSL validation (main, fragColor, uniforms, varyings, samplers)
 * - WGSL validation
 * - HLSL validation
 */

import { describe, it, expect } from 'vitest';
import {
  glslToWgsl,
  glslToHlsl,
  hasGlslMain,
  hasFragColor,
  extractUniforms,
  extractVaryings,
  extractSamplers,
  hasWgslFragment,
  isValidWgslTypes,
  hasHlslPixelOutput,
  isValidHlslTypes,
} from '../../lib/shaderCompilerUtils';

// ── Sample GLSL ─────────────────────────────────────────────────────────────

const SAMPLE_GLSL = `
precision mediump float;
varying vec2 vUv;
varying vec3 vNormal;
uniform float uTime;
uniform sampler2D uTexture0;

void main() {
  vec4 tex = texture2D(uTexture0, vUv);
  gl_FragColor = vec4(vec3(tex.r), 1.0);
}
`;

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Shader Utils — GLSL Validation', () => {
  it('hasGlslMain detects void main()', () => {
    expect(hasGlslMain(SAMPLE_GLSL)).toBe(true);
  });

  it('hasGlslMain rejects code without main', () => {
    expect(hasGlslMain('uniform float uTime;')).toBe(false);
  });

  it('hasFragColor detects gl_FragColor assignment', () => {
    expect(hasFragColor(SAMPLE_GLSL)).toBe(true);
  });

  it('hasFragColor rejects code without gl_FragColor', () => {
    expect(hasFragColor('void main() { }')).toBe(false);
  });

  it('extractUniforms finds all uniform names', () => {
    const uniforms = extractUniforms(SAMPLE_GLSL);
    expect(uniforms).toContain('uTime');
    expect(uniforms).toContain('uTexture0');
  });

  it('extractVaryings finds all varying names', () => {
    const varyings = extractVaryings(SAMPLE_GLSL);
    expect(varyings).toContain('vUv');
    expect(varyings).toContain('vNormal');
  });

  it('extractSamplers finds sampler2D uniforms', () => {
    const samplers = extractSamplers(SAMPLE_GLSL);
    expect(samplers).toContain('uTexture0');
    expect(samplers).not.toContain('uTime');
  });

  it('extractUniforms returns empty for no uniforms', () => {
    expect(extractUniforms('void main() {}')).toEqual([]);
  });
});

describe('Scenario: Shader Utils — GLSL → WGSL Transpilation', () => {
  it('converts void main() to @fragment fn main()', () => {
    const wgsl = glslToWgsl(SAMPLE_GLSL);
    expect(wgsl).toContain('@fragment fn main()');
    expect(wgsl).not.toContain('void main()');
  });

  it('replaces vec2/vec3/vec4 with vec2f/vec3f/vec4f', () => {
    const wgsl = glslToWgsl('vec3(1.0, 0.0, 0.0)');
    expect(wgsl).toContain('vec3f(');
    expect(wgsl).not.toContain('vec3(');
  });

  it('removes precision declaration', () => {
    const wgsl = glslToWgsl(SAMPLE_GLSL);
    expect(wgsl).not.toContain('precision');
  });

  it('converts uniform float to WGSL binding', () => {
    const wgsl = glslToWgsl(SAMPLE_GLSL);
    expect(wgsl).toContain('@group(0)');
    expect(wgsl).toContain('f32');
  });

  it('replaces gl_FragColor with return', () => {
    const wgsl = glslToWgsl(SAMPLE_GLSL);
    expect(wgsl).toContain('return');
    expect(wgsl).not.toContain('gl_FragColor');
  });
});

describe('Scenario: Shader Utils — WGSL Validation', () => {
  it('hasWgslFragment detects @fragment fn', () => {
    const wgsl = glslToWgsl(SAMPLE_GLSL);
    expect(hasWgslFragment(wgsl)).toBe(true);
  });

  it('isValidWgslTypes passes for converted WGSL', () => {
    const wgsl = glslToWgsl(SAMPLE_GLSL);
    expect(isValidWgslTypes(wgsl)).toBe(true);
  });

  it('isValidWgslTypes fails for raw GLSL', () => {
    expect(isValidWgslTypes('vec3(1.0, 0.0, 0.0)')).toBe(false);
  });
});

describe('Scenario: Shader Utils — GLSL → HLSL Transpilation', () => {
  it('converts void main() to SV_Target function', () => {
    const hlsl = glslToHlsl(SAMPLE_GLSL);
    expect(hlsl).toContain('SV_Target');
    expect(hlsl).not.toContain('void main()');
  });

  it('replaces vec types with float types', () => {
    const hlsl = glslToHlsl('vec3(1.0, 0.0, 0.0)');
    expect(hlsl).toContain('float3(');
  });

  it('converts uniform to cbuffer', () => {
    const hlsl = glslToHlsl(SAMPLE_GLSL);
    expect(hlsl).toContain('cbuffer');
  });

  it('replaces gl_FragColor with return', () => {
    const hlsl = glslToHlsl(SAMPLE_GLSL);
    expect(hlsl).toContain('return');
  });
});

describe('Scenario: Shader Utils — HLSL Validation', () => {
  it('hasHlslPixelOutput detects SV_Target', () => {
    const hlsl = glslToHlsl(SAMPLE_GLSL);
    expect(hasHlslPixelOutput(hlsl)).toBe(true);
  });

  it('isValidHlslTypes passes for converted HLSL', () => {
    const hlsl = glslToHlsl(SAMPLE_GLSL);
    expect(isValidHlslTypes(hlsl)).toBe(true);
  });

  it('isValidHlslTypes fails for raw GLSL', () => {
    expect(isValidHlslTypes('vec4(1.0)')).toBe(false);
  });
});
