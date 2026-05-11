import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('emergent spacetime dependency boundary', () => {
  it('uses the narrow trait shim instead of the production traits barrel', () => {
    const page = readFileSync(path.resolve(__dirname, 'page.tsx'), 'utf8');
    const shim = readFileSync(
      path.resolve(__dirname, '../../../lib/demo/emergentSpacetimeTrait.ts'),
      'utf8'
    );

    expect(page).not.toContain("from '@holoscript/core/traits'");
    expect(page).toContain("from '@/lib/demo/emergentSpacetimeTrait'");
    expect(shim).toContain("from '../../../../core/src/traits/EmergentSpacetimeTrait'");
  });
});
