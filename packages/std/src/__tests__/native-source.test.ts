import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

describe('@holoscript/std native source tracer', () => {
  it('ships compiler-visible sources and the executable scalar ABI under an explicit boundary', () => {
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['src/math.hsplus', 'src/collections.hsplus', 'src/abi/scalar-v1.hs'])
    );
    expect(packageJson.exports['./native/math.hsplus']).toBe('./src/math.hsplus');
    expect(packageJson.exports['./native/collections.hsplus']).toBe('./src/collections.hsplus');
    expect(packageJson.exports['./native/abi/scalar-v1.hs']).toBe('./src/abi/scalar-v1.hs');
    expect(packageJson.holoscript).toMatchObject({
      artifact: 'library',
      supportTier: 'experimental',
      entrypoint: './src/math.hsplus',
      exports: {
        './math': './src/math.hsplus',
        './collections': './src/collections.hsplus',
        './abi/scalar-v1': './src/abi/scalar-v1.hs',
      },
      abi: {
        id: 'hs.std.scalar.i32.v1',
        functions: ['std_math_clamp_i32', 'std_math_sign_i32', 'std_math_step_i32'],
        provenTargets: ['node', 'browser-wasm-uaal', 'owned-metal'],
      },
    });
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'Executable scalar i32 math ABI v1 parity is proven'
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
});
