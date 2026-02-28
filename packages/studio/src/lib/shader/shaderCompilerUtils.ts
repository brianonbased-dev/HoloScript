/**
 * shaderCompilerUtils.ts
 *
 * Exported pure functions for GLSL → WGSL and GLSL → HLSL transpilation,
 * and for offline graph compilation (no React hooks required).
 *
 * These are derived from useShaderCompilation.ts but are exported as
 * standalone pure functions for testing and tooling.
 */

// ── GLSL → WGSL ──────────────────────────────────────────────────────────────

/**
 * Basic GLSL → WGSL transpiler.
 * Replaces precision/varying/uniform declarations, type names,
 * and main() entry point with WGSL equivalents.
 */
export function glslToWgsl(glsl: string): string {
  return glsl
    .replace(/precision\s+\w+\s+float;/g, '')
    .replace(/varying\s+/g, '// varying ')
    .replace(/uniform\s+float\s+(\w+);/g, '@group(0) @binding(0) var<uniform> $1: f32;')
    .replace(/uniform\s+sampler2D\s+(\w+);/g, '@group(0) @binding(1) var $1: texture_2d<f32>;')
    .replace(/void main\(\)/g, '@fragment fn main()')
    .replace(/gl_FragColor/g, 'return')
    .replace(/\bvec2\(/g, 'vec2f(')
    .replace(/\bvec3\(/g, 'vec3f(')
    .replace(/\bvec4\(/g, 'vec4f(')
    .replace(/\bfloat\(/g, 'f32(')
    .replace(/\bfloat\b/g, 'f32')
    .replace(/texture2D\((\w+),\s*(\w+)\)/g, 'textureSample($1, $1_sampler, $2)')
    .trim();
}

// ── GLSL → HLSL ──────────────────────────────────────────────────────────────

/**
 * Basic GLSL → HLSL (DirectX) transpiler.
 */
export function glslToHlsl(glsl: string): string {
  return glsl
    .replace(/precision\s+\w+\s+float;/g, '')
    .replace(/varying\s+vec2\s+(\w+);/g, 'struct PS_Input { float2 $1 : TEXCOORD0; };')
    .replace(/uniform\s+float\s+(\w+);/g, 'cbuffer Constants : register(b0) { float $1; };')
    .replace(/void main\(\)/g, 'float4 main(PS_Input input) : SV_Target')
    .replace(/gl_FragColor\s*=/g, 'return')
    .replace(/\bvec2\(/g, 'float2(')
    .replace(/\bvec3\(/g, 'float3(')
    .replace(/\bvec4\(/g, 'float4(')
    .replace(/texture2D\((\w+),\s*(\w+)\)/g, '$1.Sample($1_sampler, $2)')
    .replace(/\bvUv\b/g, 'input.vUv')
    .trim();
}

// ── Validation helpers ────────────────────────────────────────────────────────

/** Returns true if a GLSL string has a void main() entry point. */
export function hasGlslMain(glsl: string): boolean {
  return /void\s+main\s*\(\s*\)/.test(glsl);
}

/** Returns true if a GLSL string has a gl_FragColor assignment. */
export function hasFragColor(glsl: string): boolean {
  return /gl_FragColor\s*=/.test(glsl);
}

/** Returns all uniform names declared in a GLSL string. */
export function extractUniforms(glsl: string): string[] {
  const matches = glsl.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g);
  return [...matches].map(m => m[1]!);
}

/** Returns all varying names declared in a GLSL string. */
export function extractVaryings(glsl: string): string[] {
  const matches = glsl.matchAll(/varying\s+\w+\s+(\w+)\s*;/g);
  return [...matches].map(m => m[1]!);
}

/** Returns all sampler2D uniform names in a GLSL string. */
export function extractSamplers(glsl: string): string[] {
  const matches = glsl.matchAll(/uniform\s+sampler2D\s+(\w+)\s*;/g);
  return [...matches].map(m => m[1]!);
}

// ── WGSL validation ───────────────────────────────────────────────────────────

/** Returns true if a WGSL string has a @fragment fn entry point. */
export function hasWgslFragment(wgsl: string): boolean {
  return /@fragment\s+fn/.test(wgsl);
}

/** Returns true if a WGSL string uses WGSL type names (no legacy GLSL types). */
export function isValidWgslTypes(wgsl: string): boolean {
  // Should not contain raw `vec2(`/`vec3(`/`vec4(` (GLSL-style)
  return !/\bvec[234]\(/.test(wgsl);
}

// ── HLSL validation ───────────────────────────────────────────────────────────

/** Returns true if HLSL has an SV_Target return semantic (pixel shader). */
export function hasHlslPixelOutput(hlsl: string): boolean {
  return /SV_Target/.test(hlsl);
}

/** Returns true if HLSL uses float2/float3/float4 instead of vec2/vec3/vec4. */
export function isValidHlslTypes(hlsl: string): boolean {
  return !/\bvec[234]\(/.test(hlsl);
}
