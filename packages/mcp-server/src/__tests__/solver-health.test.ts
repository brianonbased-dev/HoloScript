import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { runSolverHealthProbe, SOLVER_HEALTH_CONFIG, SOLVER_HEALTH_SCHEMA } from '../solver-health';

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
    .join(',')}}`;
}

describe('solver health probe', () => {
  it('runs one bounded real-solver request and returns a secret-safe receipt', async () => {
    const handler = vi.fn(async () => ({
      success: true,
      result: {
        temperatureGrid: new Float32Array(27),
        temperatureField: new Float32Array(27),
      },
      caelTraceId: 'cael:health-test:final-hash',
      traceHash: 'final-hash',
      traceJSONL: '{"sensitive":"large trace omitted from health response"}',
    }));

    const receipt = await runSolverHealthProbe({
      handleSimulationToolImpl: handler,
      now: () => new Date('2026-07-26T15:00:00.000Z'),
      platform: 'linux',
      architecture: 'x64',
    });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith('solve_thermal', {
      config: SOLVER_HEALTH_CONFIG,
      steps: 1,
    });
    expect(receipt).toMatchObject({
      schemaVersion: SOLVER_HEALTH_SCHEMA,
      status: 'healthy',
      success: true,
      zeroSpend: true,
      spendUsd: 0,
      credentialUsed: false,
      steps: 1,
      gridResolution: [3, 3, 3],
      caelTraceId: 'cael:health-test:final-hash',
      traceHash: 'final-hash',
      device: 'CPU-native-linux-x64',
    });
    expect(receipt).not.toHaveProperty('result');
    expect(receipt).not.toHaveProperty('traceJSONL');

    const { receiptHash, ...payload } = receipt;
    const expectedHash = `sha256:${createHash('sha256')
      .update(canonicalize(payload), 'utf8')
      .digest('hex')}`;
    expect(receiptHash).toBe(expectedHash);
  });

  it('fails closed when the solver does not execute successfully', async () => {
    await expect(
      runSolverHealthProbe({
        handleSimulationToolImpl: async () => ({
          success: false,
          error: 'engine unavailable',
        }),
      })
    ).rejects.toThrow('engine unavailable');
  });

  it('fails closed when a successful response lacks CAEL proof', async () => {
    await expect(
      runSolverHealthProbe({
        handleSimulationToolImpl: async () => ({
          success: true,
          traceHash: 'hash-without-trace-id',
        }),
      })
    ).rejects.toThrow('genuine CAEL trace');
  });
});
