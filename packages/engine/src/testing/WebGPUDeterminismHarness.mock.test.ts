/**
 * Mock-mode WebGPU determinism harness — validates artifact shape + compareAdapterArtifacts.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  HARNESS_OUTPUT_WORDS,
  HARNESS_WGSL,
  runDeterminismHarness,
  compareAdapterArtifacts,
  isHarnessMockMode,
  WebGPUProductionEvidenceMockError,
  type HarnessConfig,
} from './WebGPUDeterminismHarness';
import type { CAELTrace } from '../simulation/CAELTrace';

const smokeTrace: CAELTrace = [
  {
    version: 'cael.v1',
    runId: 'mock-run',
    index: 0,
    event: 'init',
    timestamp: 0,
    simTime: 0,
    prevHash: '0',
    hash: 'aaaaaaaa',
    payload: {},
  },
  {
    version: 'cael.v1',
    runId: 'mock-run',
    index: 1,
    event: 'step',
    timestamp: 1,
    simTime: 0.016,
    prevHash: 'aaaaaaaa',
    hash: 'bbbbbbbb',
    payload: { n: 1 },
  },
];

function mockConfig(partial: Partial<HarnessConfig>): HarnessConfig {
  return {
    traces: { smoke: smokeTrace },
    replications: 3,
    adapterTag: 'swiftshader',
    host: 'vitest-mock',
    captureFields: false,
    protocolCommit: 'test-commit',
    ...partial,
  } as HarnessConfig;
}

describe('WebGPUDeterminismHarness (mock)', () => {
  beforeEach(() => {
    process.env.WEBGPU_HARNESS_MOCK = '1';
  });
  afterEach(() => {
    delete process.env.WEBGPU_HARNESS_MOCK;
  });

  it('isHarnessMockMode reflects WEBGPU_HARNESS_MOCK=1', () => {
    expect(isHarnessMockMode()).toBe(true);
  });

  it('keeps the production kernel and capture mirror deterministic and in lockstep', () => {
    const mirror = readFileSync(
      new URL('../../../../scripts/webgpu-capture/cael-trace-fold-v1.wgsl', import.meta.url),
      'utf8'
    );
    const mirrorBody = mirror.slice(mirror.indexOf('struct TraceRow')).trim();
    expect(mirrorBody).toBe(HARNESS_WGSL.trim());
    expect(HARNESS_OUTPUT_WORDS).toBe(16);
    expect(HARNESS_WGSL).toContain('atomicXor(&finalState[i % 8u], v)');
    expect(HARNESS_WGSL).toContain('atomicAdd(&finalState[8u + (i % 8u)]');
    expect(HARNESS_WGSL).not.toContain('finalState[(i + 3u) % 8u]');
  });

  it('runDeterminismHarness returns self-consistent artifact', async () => {
    const art = await runDeterminismHarness(mockConfig({ adapterTag: 'swiftshader' }));
    expect(art.protocol).toBe('2026-04-20_webgpu-determinism-protocol');
    expect(art.executionMode).toBe('mock');
    expect(art.kernel.name).toBe('cael-trace-fold-v1');
    expect(art.scenarios.smoke).toBeDefined();
    expect(art.scenarios.smoke!.replications.length).toBe(3);
    const d0 = art.scenarios.smoke!.replications[0]!.finalStateDigest;
    expect(art.scenarios.smoke!.replications.every((r) => r.finalStateDigest === d0)).toBe(true);
  });

  it('rejects mock mode for production evidence runs', async () => {
    await expect(
      runDeterminismHarness(mockConfig({ productionEvidence: true }))
    ).rejects.toBeInstanceOf(WebGPUProductionEvidenceMockError);
  });

  it('compareAdapterArtifacts reports H0 when two mocks share trace semantics', async () => {
    const a = await runDeterminismHarness(mockConfig({ adapterTag: 'swiftshader' }));
    const b = await runDeterminismHarness(mockConfig({ adapterTag: 'nvidia-rtx3060' }));
    const v = compareAdapterArtifacts([a, b]);
    expect(v.verdict).toBe('H0_HOLDS');
  });
});
