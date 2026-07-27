import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

describe('@holoscript/std native source tracer', () => {
  it('ships compiler-visible sources and executable numeric ABIs under an explicit boundary', () => {
    expect(packageJson.files).toEqual(
      expect.arrayContaining([
        'src/math.hsplus',
        'src/collections.hsplus',
        'src/abi/scalar-v1.hs',
        'src/abi/scalar-f64-v1.hs',
        'src/abi/vector-v1.hs',
      ])
    );
    expect(packageJson.exports['./native/math.hsplus']).toBe('./src/math.hsplus');
    expect(packageJson.exports['./native/collections.hsplus']).toBe('./src/collections.hsplus');
    expect(packageJson.exports['./native/abi/scalar-v1.hs']).toBe('./src/abi/scalar-v1.hs');
    expect(packageJson.exports['./native/abi/scalar-f64-v1.hs']).toBe(
      './src/abi/scalar-f64-v1.hs'
    );
    expect(packageJson.exports['./native/abi/vector-v1.hs']).toBe('./src/abi/vector-v1.hs');
    expect(packageJson.holoscript).toMatchObject({
      artifact: 'library',
      supportTier: 'experimental',
      entrypoint: './src/math.hsplus',
      exports: {
        './math': './src/math.hsplus',
        './collections': './src/collections.hsplus',
        './abi/scalar-v1': './src/abi/scalar-v1.hs',
        './abi/scalar-f64-v1': './src/abi/scalar-f64-v1.hs',
        './abi/vector-v1': './src/abi/vector-v1.hs',
      },
      abi: {
        id: 'hs.std.scalar.i32.v1',
        functions: ['std_math_clamp_i32', 'std_math_sign_i32', 'std_math_step_i32'],
        provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
      },
    });
    expect(packageJson.holoscript.abis).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'hs.std.vector.i32.v1',
          functions: [
            'std_math_vec3_dot_i32',
            'std_math_vec3_cross_x_i32',
            'std_math_vec3_cross_y_i32',
            'std_math_vec3_cross_z_i32',
            'std_math_vec3_length_sq_i32',
          ],
          provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
        }),
        expect.objectContaining({
          id: 'hs.std.scalar.f64.v1',
          functions: [
            'std_math_clamp_f64',
            'std_math_lerp_f64',
            'std_math_inverse_lerp_f64',
            'std_math_remap_f64',
          ],
          provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
        }),
      ])
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain('finite scalar f64');
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'Non-finite floating-point edge semantics'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain('collections parity remain preview');
  });

  it.each([
    ['math', 'std_math', '@on_vec3_cross'],
    ['collections', 'std_list', '@on_union'],
  ])('keeps %s native source non-empty and trait-addressable', (name, trait, operation) => {
    const source = readFileSync(join(packageRoot, 'src', `${name}.hsplus`), 'utf8');
    expect(source).toContain(`@trait ${trait}`);
    expect(source).toContain(operation);
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });

  it('keeps the scalar ABI target-neutral and fail-closed at its declared subset', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'scalar-v1.hs'), 'utf8');
    expect(source).toContain('export function std_math_clamp_i32');
    expect(source).toContain('export function std_math_sign_i32');
    expect(source).toContain('export function std_math_step_i32');
    expect(source).not.toContain('get_std_math_lib');
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });

  it('keeps the vector ABI component-based, target-neutral, and explicit', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'vector-v1.hs'), 'utf8');
    expect(source).toContain('export function std_math_vec3_dot_i32');
    expect(source).toContain('export function std_math_vec3_cross_x_i32');
    expect(source).toContain('export function std_math_vec3_cross_y_i32');
    expect(source).toContain('export function std_math_vec3_cross_z_i32');
    expect(source).toContain('export function std_math_vec3_length_sq_i32');
    expect(source).not.toMatch(/\bf32\b|\bf64\b/);
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });

  it('keeps the f64 ABI finite, target-neutral, and explicit about excluded edges', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'scalar-f64-v1.hs'), 'utf8');
    expect(source).toContain('export function std_math_clamp_f64');
    expect(source).toContain('export function std_math_lerp_f64');
    expect(source).toContain('export function std_math_inverse_lerp_f64');
    expect(source).toContain('export function std_math_remap_f64');
    expect(source).toContain('NaN, infinity, signed-zero');
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });
});
