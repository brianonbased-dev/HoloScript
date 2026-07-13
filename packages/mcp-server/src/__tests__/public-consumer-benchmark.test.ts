import { describe, expect, it } from 'vitest';

// The benchmark is intentionally plain Node ESM so foreign consumers run the
// same artifact in release gates without a TypeScript loader.
// @ts-expect-error The JavaScript benchmark has no separate declaration file.
import {
  compareWithBaseline,
  countDependencyNodes,
  parseArgs,
  warningMetrics,
} from '../../scripts/public-consumer-benchmark.mjs';

function passingMetrics() {
  const importProbe = {
    settled: true,
    importMs: 100,
    settleMs: 150,
    persistentResources: [] as string[],
  };
  return {
    install: { elapsedMs: 1_000, dependencyNodes: 10, peerWarningCount: 1 },
    package: { bytes: 1_020 },
    imports: {
      rootEsm: { ...importProbe },
      rootCjs: { ...importProbe },
      serviceEsm: { ...importProbe },
      serviceCjs: { ...importProbe },
    },
    serviceStart: { healthy: true, elapsedMs: 500 },
  };
}

describe('public consumer benchmark helpers', () => {
  it('counts the complete installed dependency tree', () => {
    expect(
      countDependencyNodes({
        dependencies: {
          a: { dependencies: { b: {} } },
          c: {},
        },
      })
    ).toBe(3);
    expect(
      countDependencyNodes([{ dependencies: { a: { dependencies: { b: {} } } } }])
    ).toBe(2);
  });

  it('parses the public package manager selector', () => {
    expect(parseArgs(['--manager', 'pnpm']).manager).toBe('pnpm');
    expect(parseArgs([]).manager).toBe('npm');
  });

  it('separates peer warnings from general warnings', () => {
    expect(
      warningMetrics('npm WARN deprecated old\nnpm WARN ERESOLVE overriding peer dependency')
    ).toEqual({ warningCount: 2, peerWarningCount: 1 });
  });

  it('fails the gate when an import retains a timer', () => {
    const metrics = passingMetrics();
    metrics.imports.rootEsm.persistentResources.push('Timeout');
    const result = compareWithBaseline(metrics, {
      package: { version: '8.0.12' },
      metrics: {
        install: { elapsedMs: 900, dependencyNodes: 10, peerWarningCount: 1 },
        package: { bytes: 1_000 },
        imports: { rootEsm: { settleMs: 12_000 }, rootCjs: { settleMs: 12_000 } },
        serviceStart: { elapsedMs: 600 },
      },
    });

    expect(result.checks.importsOwnNoPersistentResources).toBe(false);
    expect(result.ok).toBe(false);
  });
});
