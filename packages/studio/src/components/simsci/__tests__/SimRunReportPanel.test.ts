// @vitest-environment node
/**
 * SimRunReportPanel — UI contract tests (store layer)
 *
 * Validates the state shape SimRunReportPanel renders against:
 * report fields, stat filtering, determinism badge condition.
 * Does NOT render React.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSimState } from '../useSimState';
import { SIM_PRESETS } from '../presets';

function resetStore() {
  useSimState.getState().setPreset(SIM_PRESETS[0]!.id);
}

function makeFakeResult(digest: string, solver = 'thermal') {
  return {
    kind: 'scalarField' as const,
    field: {
      resolution: [4, 4, 4] as [number, number, number],
      values: new Array(64).fill(0.5) as number[],
    },
    stats: {
      maxTemp: 2.5,
      minTemp: 0.1,
      meanTemp: 1.0,
      convergenceLabel: 'converged', // string — should be filtered out
      iterations: 200,
    },
    runReport: {
      solver,
      steps: 200,
      dt: 0.01,
      finalStateDigest: digest,
      wallMs: 123.4,
      fieldNames: ['temperature', 'pressure'],
    },
  };
}

describe('SimRunReportPanel — UI contract (store layer)', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('result is null before any run', () => {
    expect(useSimState.getState().result).toBeNull();
  });

  it('result.runReport has required fields after a successful run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => makeFakeResult('abcdef1234'),
      })
    );

    await useSimState.getState().run();
    const { result } = useSimState.getState();
    expect(result).not.toBeNull();

    const report = result!.runReport;
    expect(typeof report.solver).toBe('string');
    expect(typeof report.steps).toBe('number');
    expect(typeof report.dt).toBe('number');
    expect(typeof report.finalStateDigest).toBe('string');
    expect(report.finalStateDigest.length).toBeGreaterThan(0);
    expect(typeof report.wallMs).toBe('number');
    expect(Array.isArray(report.fieldNames)).toBe(true);
  });

  it('numeric stats can be extracted from result.stats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => makeFakeResult('xyz'),
      })
    );

    await useSimState.getState().run();
    const { result } = useSimState.getState();
    expect(result).not.toBeNull();

    // Simulate what the panel does: filter to finite numbers only
    const numericStats = Object.entries(result!.stats).filter(
      ([, v]): v is number => typeof v === 'number' && Number.isFinite(v)
    );

    // maxTemp, minTemp, meanTemp, iterations — 4 numeric entries
    expect(numericStats.length).toBe(4);
    const keys = numericStats.map(([k]) => k);
    expect(keys).toContain('maxTemp');
    expect(keys).toContain('minTemp');
    // convergenceLabel (string) was filtered out
    expect(keys).not.toContain('convergenceLabel');
  });

  it('determinism badge condition: consecutive identical digests', async () => {
    const sameDigest = 'deterministic-abc123';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult(sameDigest) })
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult(sameDigest) })
    );

    await useSimState.getState().run();
    // After first run: result = digest, lastDigest = null → no badge
    expect(useSimState.getState().lastDigest).toBeNull();

    await useSimState.getState().run();
    // After second run: result = same digest, lastDigest = first digest
    const { result, lastDigest } = useSimState.getState();
    expect(result?.runReport.finalStateDigest).toBe(sameDigest);
    expect(lastDigest).toBe(sameDigest);
    expect(result?.runReport.finalStateDigest === lastDigest).toBe(true);
  });

  it('determinism badge absent when digests differ', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult('digest-A') })
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult('digest-B') })
    );

    await useSimState.getState().run();
    await useSimState.getState().run();

    const { result, lastDigest } = useSimState.getState();
    expect(result?.runReport.finalStateDigest).toBe('digest-B');
    expect(lastDigest).toBe('digest-A');
    expect(result?.runReport.finalStateDigest === lastDigest).toBe(false);
  });

  it('fieldNames array is preserved from the API response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => makeFakeResult('d1', 'thermal'),
      })
    );

    await useSimState.getState().run();
    const report = useSimState.getState().result?.runReport;
    expect(report?.fieldNames).toEqual(['temperature', 'pressure']);
  });
});
