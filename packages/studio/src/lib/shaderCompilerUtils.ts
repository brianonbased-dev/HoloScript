/**
 * shaderCompilerUtils.ts — Shader Compilation Utilities
 *
 * Parse, validate, and optimize shader source code for the WebGPU pipeline.
 */

export interface ShaderSource {
  code: string;
  language: 'wgsl' | 'glsl' | 'hlsl';
  stage: 'vertex' | 'fragment' | 'compute';
  entryPoint: string;
}

export interface CompilationResult {
  success: boolean;
  errors: ShaderError[];
  warnings: ShaderError[];
  outputCode: string;
  uniformCount: number;
  textureBindings: number;
  estimatedInstructions: number;
}

export interface ShaderError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

/**
 * Validate WGSL shader source (basic syntax checks).
 */
export function validateWGSL(code: string): ShaderError[] {
  const errors: ShaderError[] = [];
  const lines = code.split('\n');

  let braceDepth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    if (braceDepth < 0) {
      errors.push({ line: i + 1, column: 0, message: 'Unexpected closing brace', severity: 'error' });
    }
  }
  if (braceDepth !== 0) {
    errors.push({ line: lines.length, column: 0, message: `Unmatched braces: ${braceDepth > 0 ? 'missing }' : 'extra }'}`, severity: 'error' });
  }

  // Check for required entry point annotations
  if (code.includes('@vertex') || code.includes('@fragment') || code.includes('@compute')) {
    // Has stage annotation — OK
  } else {
    errors.push({ line: 1, column: 0, message: 'Missing stage annotation (@vertex, @fragment, or @compute)', severity: 'warning' });
  }

  return errors;
}

/**
 * Count uniform bindings in WGSL source.
 */
export function countUniforms(code: string): number {
  const matches = code.match(/@binding\(\d+\)/g);
  return matches ? matches.length : 0;
}

/**
 * Count texture/sampler bindings.
 */
export function countTextureBindings(code: string): number {
  const textures = code.match(/texture_2d|texture_3d|texture_cube|sampler/g);
  return textures ? textures.length : 0;
}

/**
 * Estimate instruction count (very rough approximation).
 */
export function estimateInstructions(code: string): number {
  const lines = code.split('\n').filter(l => {
    const trimmed = l.trim();
    return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('/*');
  });
  return lines.length; // 1 instruction per non-comment line (rough)
}

/**
 * Strip comments from shader source.
 */
export function stripComments(code: string): string {
  return code
    .replace(/\/\/.*$/gm, '')         // Line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Block comments
    .replace(/\n\s*\n/g, '\n');       // Empty lines
}

/**
 * Extract entry point name from shader source.
 */
export function extractEntryPoint(code: string): string | null {
  const match = code.match(/@(?:vertex|fragment|compute)\s+fn\s+(\w+)/);
  return match ? match[1] : null;
}

/**
 * Compile (validate and analyze) a shader source.
 */
export function compileShader(source: ShaderSource): CompilationResult {
  const errors = source.language === 'wgsl' ? validateWGSL(source.code) : [];
  const actualErrors = errors.filter(e => e.severity === 'error');
  const warnings = errors.filter(e => e.severity === 'warning');

  return {
    success: actualErrors.length === 0,
    errors: actualErrors,
    warnings,
    outputCode: actualErrors.length === 0 ? stripComments(source.code) : '',
    uniformCount: countUniforms(source.code),
    textureBindings: countTextureBindings(source.code),
    estimatedInstructions: estimateInstructions(source.code),
  };
}
