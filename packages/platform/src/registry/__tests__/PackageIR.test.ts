import { describe, expect, it } from 'vitest';

import {
  canonicalizePackageIR,
  createPackageLockReceipt,
  digestPackageSource,
  validatePackageIR,
  verifyCachedPackageArtifact,
  verifyPackageLockReceipt,
  type PackageIR,
  type ResolvedPackageArtifact,
} from '../PackageIR';

function fixturePackage(overrides: Partial<PackageIR> = {}): PackageIR {
  return {
    schemaVersion: 'holoscript.package-ir.v0.1',
    name: '@holoscript/example-math',
    version: '1.0.0',
    kind: 'library',
    supportTier: 'preview',
    entrypoints: {
      source: './src/index.hsplus',
      exports: {
        '.': './src/index.hsplus',
      },
    },
    dependencies: {},
    compatibility: {
      holoscript: '>=8.0.0',
      targets: ['node', 'browser-wasm', 'owned-metal'],
    },
    capabilities: [],
    provenance: {
      license: 'MIT',
      repository: 'https://github.com/brianonbased-dev/HoloScript',
      owner: 'HoloScript',
    },
    ...overrides,
  };
}

describe('PackageIR', () => {
  it('validates the compiler-native package boundary', () => {
    expect(validatePackageIR(fixturePackage())).toEqual({ valid: true, errors: [] });

    const invalid = fixturePackage({
      version: 'latest',
      entrypoints: { source: '../escape.hsplus' },
    });
    const result = validatePackageIR(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('version must be an exact semantic version');
    expect(result.errors).toContain('entrypoints.source must stay within the package root');
  });

  it('canonicalizes semantically equal manifests to identical bytes', () => {
    const left = fixturePackage({
      dependencies: {
        '@holoscript/vector': { range: '^2.0.0', source: { kind: 'registry' } },
        '@holoscript/scalar': { range: '1.1.0', source: { kind: 'registry' } },
      },
    });
    const right = fixturePackage({
      dependencies: {
        '@holoscript/scalar': { source: { kind: 'registry' }, range: '1.1.0' },
        '@holoscript/vector': { source: { kind: 'registry' }, range: '^2.0.0' },
      },
    });

    expect(canonicalizePackageIR(left)).toBe(canonicalizePackageIR(right));
  });

  it('creates a deterministic, independently verifiable lock receipt', async () => {
    const root = fixturePackage();
    const scalarSource = '@export object scalar { value: 1 }';
    const vectorSource = '@export object vector { value: [1, 2, 3] }';
    const artifacts: ResolvedPackageArtifact[] = [
      {
        name: '@holoscript/vector',
        version: '2.1.0',
        source: { kind: 'registry', locator: 'https://registry.test' },
        manifestDigest: await digestPackageSource('manifest-vector'),
        contentDigest: await digestPackageSource(vectorSource),
        dependencies: ['@holoscript/scalar@1.1.0'],
      },
      {
        name: '@holoscript/scalar',
        version: '1.1.0',
        source: { kind: 'registry', locator: 'https://registry.test' },
        manifestDigest: await digestPackageSource('manifest-scalar'),
        contentDigest: await digestPackageSource(scalarSource),
        dependencies: [],
      },
    ];

    const first = await createPackageLockReceipt(root, artifacts);
    const second = await createPackageLockReceipt(root, [...artifacts].reverse());

    expect(first.graphDigest).toBe(second.graphDigest);
    expect(first.packages.map((entry) => entry.name)).toEqual([
      '@holoscript/scalar',
      '@holoscript/vector',
    ]);
    await expect(verifyPackageLockReceipt(first)).resolves.toEqual({ valid: true, errors: [] });
  });

  it('rejects tampered receipts and cached source during offline replay', async () => {
    const source = '@export object math { value: 42 }';
    const artifact: ResolvedPackageArtifact = {
      name: '@holoscript/example-math',
      version: '1.0.0',
      source: { kind: 'registry', locator: 'https://registry.test' },
      manifestDigest: await digestPackageSource('manifest-root'),
      contentDigest: await digestPackageSource(source),
      dependencies: [],
    };
    const receipt = await createPackageLockReceipt(fixturePackage(), [artifact]);

    await expect(verifyCachedPackageArtifact(receipt.packages[0], source)).resolves.toBe(true);
    await expect(
      verifyCachedPackageArtifact(receipt.packages[0], `${source}\n// tampered`)
    ).resolves.toBe(false);

    const tampered = {
      ...receipt,
      packages: [{ ...receipt.packages[0], version: '9.9.9' }],
    };
    const verification = await verifyPackageLockReceipt(tampered);
    expect(verification.valid).toBe(false);
    expect(verification.errors).toContain('graph digest mismatch');
  });

  it('fails closed on malformed digests, private paths, and incomplete graphs', async () => {
    const base: ResolvedPackageArtifact = {
      name: '@holoscript/example-math',
      version: '1.0.0',
      source: { kind: 'path', locator: './vendor/example-math' },
      manifestDigest: await digestPackageSource('manifest-root'),
      contentDigest: await digestPackageSource('@export object math { value: 42 }'),
      dependencies: [],
    };

    await expect(
      createPackageLockReceipt(fixturePackage(), [
        { ...base, source: { kind: 'path', locator: 'C:\\private\\example-math' } },
      ])
    ).rejects.toThrow('path source must be package-relative');
    await expect(
      createPackageLockReceipt(fixturePackage(), [
        { ...base, manifestDigest: 'sha256:not-a-real-digest' },
      ])
    ).rejects.toThrow('invalid manifest digest');
    await expect(
      createPackageLockReceipt(fixturePackage(), [
        { ...base, dependencies: ['@holoscript/missing@1.0.0'] },
      ])
    ).rejects.toThrow('missing resolved dependency');
  });
});
