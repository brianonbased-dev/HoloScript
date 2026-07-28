import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  NATIVE_RENDER_CAPABILITIES,
  NATIVE_RENDER_SEMANTICS,
  R3F_BASELINE_RENDER_SEMANTICS,
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

const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url));

function fixturePaths(fixture: NativeRenderGoldenFixture): string[] {
  const paths = new Set<string>();

  paths.add(fixture.source.path);
  for (const step of fixture.chain) paths.add(step.path);
  for (const path of fixture.adapterBaseline?.paths ?? []) paths.add(path);

  for (const claim of fixture.semantics) {
    paths.add(claim.declaredIn.path);
    if (claim.loweredTo) paths.add(claim.loweredTo.path);
    if (claim.enforcedBy) paths.add(claim.enforcedBy.path);
  }

  for (const claim of fixture.capabilities ?? []) {
    paths.add(claim.declaredIn.path);
    if (claim.loweredTo) paths.add(claim.loweredTo.path);
    if (claim.enforcedBy) paths.add(claim.enforcedBy.path);
    for (const evidence of claim.adapterEvidence ?? []) paths.add(evidence.path);
  }

  return [...paths].sort();
}

function failureFor(
  failures: NativeRenderContractFailure[],
  code: NativeRenderContractFailure['code'],
  semantic: NativeRenderSemantic
): NativeRenderContractFailure | undefined {
  return failures.find((failure) => failure.code === code && failure.semantic === semantic);
}

function hasFailure(
  failures: NativeRenderContractFailure[],
  code: NativeRenderContractFailure['code']
): boolean {
  return failures.some((failure) => failure.code === code);
}

describe('native render contract golden fixtures', () => {
  it('accepts a fixture whose render semantics are declared in native source and enforced before the adapter', () => {
    const receipt = assertNativeRenderFixture(loadFixture('source-owned-full'));

    expect(receipt.ok).toBe(true);
    expect(receipt.coveredSemantics).toEqual([...NATIVE_RENDER_SEMANTICS]);
    expect(receipt.coveredCapabilities).toEqual([...NATIVE_RENDER_CAPABILITIES]);
  });

  it('accepts the R3F baseline only when the same behavior is owned by native source and IR', () => {
    const receipt = assertNativeRenderFixture(loadFixture('r3f-baseline-native-parity'));

    expect(receipt.ok).toBe(true);
    expect(receipt.coveredSemantics).toEqual([...NATIVE_RENDER_SEMANTICS]);
    expect(receipt.coveredCapabilities).toEqual([...NATIVE_RENDER_CAPABILITIES]);
  });

  it('pins the R3F baseline fixture to real native receipts and adapter evidence files', () => {
    const fixture = loadFixture('r3f-baseline-native-parity');
    const missing = fixturePaths(fixture).filter((path) => !existsSync(resolve(REPO_ROOT, path)));

    expect(missing).toEqual([]);
  });

  it('accepts R3F only as a backend adapter after baseline semantics are source-owned', () => {
    const fixture = loadFixture('r3f-baseline-source-owned');
    const receipt = assertNativeRenderFixture(fixture);
    const covered = new Set(receipt.coveredSemantics);

    expect(receipt.ok).toBe(true);
    expect(R3F_BASELINE_RENDER_SEMANTICS.every((semantic) => covered.has(semantic))).toBe(true);
    expect(fixture.chain[fixture.chain.length - 1]).toMatchObject({
      stage: 'backend-adapter',
      foreignRenderer: 'r3f',
      path: 'packages/r3f-renderer/src/components/MeshNode.tsx',
    });

    for (const semantic of R3F_BASELINE_RENDER_SEMANTICS) {
      const claim = fixture.semantics.find((entry) => entry.key === semantic);
      expect(claim?.ownerStage).not.toBe('backend-adapter');
      expect(claim?.declaredIn.path).toMatch(/\.(holo|hsplus|hs)$/);
      expect(claim?.loweredTo).toBeDefined();
      expect(claim?.enforcedBy).toBeDefined();
    }
  });

  it.each([
    ['adapter-interaction-only', 'interaction'],
    ['adapter-timing-only', 'timing'],
    ['adapter-xr-only', 'xr'],
  ] as const)(
    'rejects %s because the semantic is owned by the adapter',
    (fixtureName, semantic) => {
      const receipt = evaluateNativeRenderFixture(loadFixture(fixtureName));

      expect(receipt.ok).toBe(false);
      expect(failureFor(receipt.failures, 'ADAPTER_OWNED_SEMANTIC', semantic)).toBeDefined();
      expect(
        failureFor(receipt.failures, 'SEMANTIC_NOT_DECLARED_IN_NATIVE_SOURCE', semantic)
      ).toBeDefined();
    }
  );

  it('rejects an R3F baseline semantic when JSX becomes the owner', () => {
    const fixture = loadFixture('r3f-baseline-source-owned');
    const geometry = fixture.semantics.find((claim) => claim.key === 'geometry');
    expect(geometry).toBeDefined();
    geometry!.ownerStage = 'backend-adapter';
    geometry!.declaredIn = {
      path: 'packages/r3f-renderer/src/components/MeshNode.tsx',
      language: 'holo',
    };

    const receipt = evaluateNativeRenderFixture(fixture);

    expect(receipt.ok).toBe(false);
    expect(failureFor(receipt.failures, 'ADAPTER_OWNED_SEMANTIC', 'geometry')).toBeDefined();
    expect(
      failureFor(receipt.failures, 'SEMANTIC_NOT_DECLARED_IN_NATIVE_SOURCE', 'geometry')
    ).toBeDefined();
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

  it('rejects a fixture when a required native renderer capability is missing', () => {
    const fixture = loadFixture('r3f-baseline-native-parity');
    fixture.capabilities = fixture.capabilities?.filter((claim) => claim.key !== 'light');

    const receipt = evaluateNativeRenderFixture(fixture);

    expect(receipt.ok).toBe(false);
    expect(hasFailure(receipt.failures, 'MISSING_CAPABILITY')).toBe(true);
  });

  it('rejects a fixture when an R3F adapter owns a native renderer capability', () => {
    const fixture = loadFixture('r3f-baseline-native-parity');
    const eventClaim = fixture.capabilities?.find((claim) => claim.key === 'event');
    if (!eventClaim) throw new Error('expected event capability');
    eventClaim.ownerStage = 'backend-adapter';
    eventClaim.declaredIn = {
      path: 'packages/r3f-renderer/src/components/MeshNode.tsx',
      language: 'holo',
    };

    const receipt = evaluateNativeRenderFixture(fixture);

    expect(receipt.ok).toBe(false);
    expect(hasFailure(receipt.failures, 'ADAPTER_OWNED_CAPABILITY')).toBe(true);
    expect(hasFailure(receipt.failures, 'CAPABILITY_NOT_DECLARED_IN_NATIVE_SOURCE')).toBe(true);
  });
});
