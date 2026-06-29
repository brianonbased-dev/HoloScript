import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NATIVE_RENDER_SEMANTICS,
  assertNativeRenderFixture,
  evaluateNativeRenderFixture,
  type NativeRenderContractFailure,
  type NativeRenderGoldenFixture,
  type NativeRenderSemantic,
} from '../render/native-render-contract';

function loadFixture(name: string): NativeRenderGoldenFixture {
  const url = new URL(`../render/golden-fixtures/${name}.golden.json`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8')) as NativeRenderGoldenFixture;
}

function failureFor(
  failures: NativeRenderContractFailure[],
  code: NativeRenderContractFailure['code'],
  semantic: NativeRenderSemantic
): NativeRenderContractFailure | undefined {
  return failures.find((failure) => failure.code === code && failure.semantic === semantic);
}

describe('native render contract golden fixtures', () => {
  it('accepts a fixture whose render semantics are declared in native source and enforced before the adapter', () => {
    const receipt = assertNativeRenderFixture(loadFixture('source-owned-full'));

    expect(receipt.ok).toBe(true);
    expect(receipt.coveredSemantics).toEqual([...NATIVE_RENDER_SEMANTICS]);
  });

  it.each([
    ['adapter-interaction-only', 'interaction'],
    ['adapter-timing-only', 'timing'],
    ['adapter-xr-only', 'xr'],
  ] as const)('rejects %s because the semantic is owned by the adapter', (fixtureName, semantic) => {
    const receipt = evaluateNativeRenderFixture(loadFixture(fixtureName));

    expect(receipt.ok).toBe(false);
    expect(failureFor(receipt.failures, 'ADAPTER_OWNED_SEMANTIC', semantic)).toBeDefined();
    expect(failureFor(receipt.failures, 'SEMANTIC_NOT_DECLARED_IN_NATIVE_SOURCE', semantic)).toBeDefined();
  });

  it('rejects a fixture when a foreign renderer appears before the backend adapter stage', () => {
    const fixture = loadFixture('source-owned-full');
    fixture.chain[1] = {
      ...fixture.chain[1],
      foreignRenderer: 'r3f',
      path: 'packages/r3f-renderer/src/runtime/adapter-owned-ir.tsx',
    };

    const receipt = evaluateNativeRenderFixture(fixture);

    expect(receipt.ok).toBe(false);
    expect(receipt.failures).toContainEqual(
      expect.objectContaining({
        code: 'FOREIGN_RENDERER_BEFORE_ADAPTER',
        path: 'packages/r3f-renderer/src/runtime/adapter-owned-ir.tsx',
      })
    );
  });

  it('rejects a fixture when a required native render semantic is missing', () => {
    const fixture = loadFixture('source-owned-full');
    fixture.semantics = fixture.semantics.filter((claim) => claim.key !== 'asset');

    const receipt = evaluateNativeRenderFixture(fixture);

    expect(receipt.ok).toBe(false);
    expect(failureFor(receipt.failures, 'MISSING_SEMANTIC', 'asset')).toBeDefined();
  });
});
