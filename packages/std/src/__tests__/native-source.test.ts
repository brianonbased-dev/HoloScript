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
        'src/abi/scalar-f32-v1.hs',
        'src/abi/scalar-f64-v1.hs',
        'src/abi/vector-v1.hs',
        'src/abi/collections-list3-v1.hs',
      ])
    );
    expect(packageJson.exports['./native/math.hsplus']).toBe('./src/math.hsplus');
    expect(packageJson.exports['./native/collections.hsplus']).toBe('./src/collections.hsplus');
    expect(packageJson.exports['./native/abi/scalar-v1.hs']).toBe('./src/abi/scalar-v1.hs');
    expect(packageJson.exports['./native/abi/scalar-f32-v1.hs']).toBe('./src/abi/scalar-f32-v1.hs');
    expect(packageJson.exports['./native/abi/scalar-f64-v1.hs']).toBe('./src/abi/scalar-f64-v1.hs');
    expect(packageJson.exports['./native/abi/vector-v1.hs']).toBe('./src/abi/vector-v1.hs');
    expect(packageJson.exports['./native/abi/collections-list3-v1.hs']).toBe(
      './src/abi/collections-list3-v1.hs'
    );
    expect(packageJson.holoscript).toMatchObject({
      artifact: 'library',
      supportTier: 'preview',
      entrypoint: './src/math.hsplus',
      exports: {
        './math': './src/math.hsplus',
        './collections': './src/collections.hsplus',
        './abi/scalar-v1': './src/abi/scalar-v1.hs',
        './abi/scalar-f32-v1': './src/abi/scalar-f32-v1.hs',
        './abi/scalar-f64-v1': './src/abi/scalar-f64-v1.hs',
        './abi/vector-v1': './src/abi/vector-v1.hs',
        './abi/collections-list3-v1': './src/abi/collections-list3-v1.hs',
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
          id: 'hs.std.vector.aggregate.i32.v1',
          functions: [
            'std_math_vec3_make_i32',
            'std_math_vec3_dot_value_i32',
            'std_math_vec3_cross_value_i32',
            'std_math_vec3_length_sq_value_i32',
          ],
          valueAbi: 'hs.aggregate.value.v1',
          layout: 'StdVec3I32{x:i32,y:i32,z:i32}',
          provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
        }),
        expect.objectContaining({
          id: 'hs.std.aabb3.aggregate.i32.v1',
          functions: [
            'std_math_aabb3_make_i32',
            'std_math_aabb3_size_value_i32',
            'std_math_aabb3_volume_value_i32',
          ],
          valueAbi: 'hs.aggregate.value.v2',
          layout:
            'StdAabb3I32{min:StdVec3I32{x:i32,y:i32,z:i32},max:StdVec3I32{x:i32,y:i32,z:i32}}',
          provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
        }),
        expect.objectContaining({
          id: 'hs.std.scalar.f32.v1',
          functions: [
            'std_math_clamp_f32',
            'std_math_lerp_f32',
            'std_math_inverse_lerp_f32',
            'std_math_remap_f32',
          ],
          failureContract: 'finite-input-and-result-or-fail-closed',
          provenFailures: ['non-finite input', 'division by zero', 'overflow result'],
          nodeReferenceFunctions: [
            'clampFiniteF32',
            'lerpFiniteF32',
            'inverseLerpFiniteF32',
            'remapFiniteF32',
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
          failureContract: 'finite-input-and-result-or-fail-closed',
          provenFailures: ['non-finite input', 'division by zero', 'overflow result'],
          nodeReferenceFunctions: [
            'clampFiniteF64',
            'lerpFiniteF64',
            'inverseLerpFiniteF64',
            'remapFiniteF64',
          ],
          provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
        }),
        expect.objectContaining({
          id: 'hs.std.collections.list3.i32.v1',
          functions: [
            'std_collections_list3_make_i32',
            'std_collections_list3_sum_i32',
            'std_collections_list3_replace_second_i32',
            'std_collections_list3_reverse_i32',
            'std_collections_list3_weighted_digest_i32',
          ],
          valueAbi: 'hs.aggregate.value.v1',
          layout: 'StdList3I32{first:i32,second:i32,third:i32}',
          provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
        }),
      ])
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'operation-by-operation binary32 rounding'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain('finite scalar f64');
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'finite-input-and-result-or-fail-closed'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'reject non-finite inputs, division by zero, and overflow results'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'signed-zero preservation remains unproven'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain('receipt-proven');
    expect(packageJson.holoscript.runtimeBoundary).toContain('40 ops and 170 vectors');
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'direct execution of the shipped math.hsplus and collections.hsplus packaged handlers'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      '35-function first-order host-ABI binding surface'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'immutable fixed-size List3<i32> projection'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'higher-order List, Map, and Set operations (function-valued parameters) remain preview'
    );
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

  it('keeps the vector ABI aggregate-valued, affine, target-neutral, and compatible', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'vector-v1.hs'), 'utf8');
    expect(source).toContain('struct StdVec3I32 { x: i32, y: i32, z: i32 }');
    expect(source).toContain('struct StdAabb3I32 { min: StdVec3I32, max: StdVec3I32 }');
    expect(source).toContain('export function std_math_vec3_make_i32');
    expect(source).toContain('export function std_math_vec3_dot_value_i32');
    expect(source).toContain('export function std_math_vec3_cross_value_i32');
    expect(source).toContain('export function std_math_vec3_length_sq_value_i32');
    expect(source).toContain('export function std_math_aabb3_make_i32');
    expect(source).toContain('export function std_math_aabb3_size_value_i32');
    expect(source).toContain('export function std_math_aabb3_volume_value_i32');
    expect(source).toContain('load(bounds.max.x)');
    expect(source).toContain('return move(result)');
    expect(source).toContain('export function std_math_vec3_dot_i32');
    expect(source).toContain('export function std_math_vec3_cross_x_i32');
    expect(source).toContain('export function std_math_vec3_cross_y_i32');
    expect(source).toContain('export function std_math_vec3_cross_z_i32');
    expect(source).toContain('export function std_math_vec3_length_sq_i32');
    expect(source).not.toMatch(/\bf32\b|\bf64\b/);
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });

  it('keeps the List3 ABI immutable, fixed-size, target-neutral, and explicit', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'collections-list3-v1.hs'), 'utf8');
    expect(source).toContain('struct StdList3I32 { first: i32, second: i32, third: i32 }');
    expect(source).toContain('export function std_collections_list3_make_i32');
    expect(source).toContain('export function std_collections_list3_sum_i32');
    expect(source).toContain('export function std_collections_list3_replace_second_i32');
    expect(source).toContain('export function std_collections_list3_reverse_i32');
    expect(source).toContain('export function std_collections_list3_weighted_digest_i32');
    expect(source).toContain('return move(result)');
    expect(source).toContain('fixed-size');
    expect(source).toContain('general List, Map, or Set');
    expect(source).not.toContain('store(');
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });

  it('keeps the f64 ABI finite, target-neutral, and explicit about excluded edges', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'scalar-f64-v1.hs'), 'utf8');
    expect(source).toContain('export function std_math_clamp_f64');
    expect(source).toContain('export function std_math_lerp_f64');
    expect(source).toContain('export function std_math_inverse_lerp_f64');
    expect(source).toContain('export function std_math_remap_f64');
    expect(source).toContain('non-finite inputs, division by zero, and overflow');
    expect(source).toContain('Signed-zero preservation remains outside');
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });

  it('keeps the f32 ABI finite, target-neutral, and explicit about binary32 rounding', () => {
    const source = readFileSync(join(packageRoot, 'src', 'abi', 'scalar-f32-v1.hs'), 'utf8');
    expect(source).toContain('export function std_math_clamp_f32');
    expect(source).toContain('export function std_math_lerp_f32');
    expect(source).toContain('export function std_math_inverse_lerp_f32');
    expect(source).toContain('export function std_math_remap_f32');
    expect(source).toContain('intermediate arithmetic result');
    expect(source).toContain('non-finite inputs, division by zero, and overflow');
    expect(source).toContain('Signed-zero preservation remains outside');
    expect(source).not.toMatch(/[A-Za-z]:[/\\]|\/Users\//);
  });
});
