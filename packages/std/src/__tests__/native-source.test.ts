import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));

describe('@holoscript/std native source tracer', () => {
  it('ships compiler-visible math and collections sources under an explicit preview boundary', () => {
    expect(packageJson.files).toEqual(
      expect.arrayContaining(['src/math.hsplus', 'src/collections.hsplus'])
    );
    expect(packageJson.exports['./native/math.hsplus']).toBe('./src/math.hsplus');
    expect(packageJson.exports['./native/collections.hsplus']).toBe(
      './src/collections.hsplus'
    );
    expect(packageJson.holoscript).toMatchObject({
      artifact: 'library',
      supportTier: 'preview',
      entrypoint: './src/math.hsplus',
      exports: {
        './math': './src/math.hsplus',
        './collections': './src/collections.hsplus',
      },
    });
    expect(packageJson.holoscript.runtimeBoundary).toContain(
      'collections host-ABI parity are not yet claimed'
    );
    expect(packageJson.holoscript.runtimeBoundary).toContain('receipt-proven');
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
});
