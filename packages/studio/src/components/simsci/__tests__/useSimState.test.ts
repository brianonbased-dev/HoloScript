// @vitest-environment node
/**
 * useSimState — unit tests
 *
 * Verifies store initialisation, preset switching, param overrides,
 * run() fetch contract, and lastDigest determinism tracking.
 * Uses vi.stubGlobal to mock fetch; no React render needed.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useSimState } from '../useSimState';
import { SIM_PRESETS } from '../presets';

// ── Helpers ───────────────────────────────────────────────────────────────────

function resetStore() {
  useSimState.getState().setPreset(SIM_PRESETS[0]!.id);
}

/** Minimal successful SimRunResult for a scalarField preset. */
function makeFakeResult(digest: string) {
  return {
    kind: 'scalarField' as const,
    field: { resolution: [4, 4, 4] as [number, number, number], values: new Array(64).fill(0.5) as number[] },
    stats: { maxTemp: 1.23, minTemp: 0.01 },
    runReport: {
      solver: 'thermal',
      steps: 200,
      dt: 0.01,
      finalStateDigest: digest,
      wallMs: 55.0,
      fieldNames: ['temperature'],
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSimState', () => {
  beforeEach(() => {
    resetStore();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initialises with the first preset and its default steps/dt overrides', () => {
    const { preset, paramOverrides } = useSimState.getState();
    expect(preset.id).toBe(SIM_PRESETS[0]!.id);
    expect(typeof paramOverrides['steps']).toBe('number');
    expect(typeof paramOverrides['dt']).toBe('number');
    expect(paramOverrides['steps']).toBe(preset.steps);
    expect(paramOverrides['dt']).toBe(preset.dt);
  });

  it('setPreset switches to the named preset and resets overrides', () => {
    const secondPreset = SIM_PRESETS[1]!;
    useSimState.getState().setPreset(secondPreset.id);

    const { preset, paramOverrides } = useSimState.getState();
    expect(preset.id).toBe(secondPreset.id);
    expect(paramOverrides['steps']).toBe(secondPreset.steps);
    expect(paramOverrides['dt']).toBe(secondPreset.dt);
    // result cleared on preset change
    expect(useSimState.getState().result).toBeNull();
  });

  it('setParamOverride updates a single param, leaving others unchanged', () => {
    const before = { ...useSimState.getState().paramOverrides };
    useSimState.getState().setParamOverride('steps', 999);

    const after = useSimState.getState().paramOverrides;
    expect(after['steps']).toBe(999);
    // dt unchanged
    expect(after['dt']).toBe(before['dt']);
  });

  it('run() sets running=true then false after success', async () => {
    const fakeResult = makeFakeResult('abc123');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => fakeResult,
      })
    );

    const runPromise = useSimState.getState().run();
    // running should be true while request is in-flight
    expect(useSimState.getState().running).toBe(true);

    await runPromise;

    const state = useSimState.getState();
    expect(state.running).toBe(false);
    expect(state.result).not.toBeNull();
    expect(state.result?.runReport.finalStateDigest).toBe('abc123');
    expect(state.error).toBeNull();
  });

  it('run() sets error when fetch returns non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'solver not found' }),
      })
    );

    await useSimState.getState().run();

    const state = useSimState.getState();
    expect(state.running).toBe(false);
    expect(state.error).toBe('solver not found');
    expect(state.result).toBeNull();
  });

  it('run() sets error on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValueOnce(new Error('network timeout'))
    );

    await useSimState.getState().run();

    const state = useSimState.getState();
    expect(state.running).toBe(false);
    expect(state.error).toBe('network timeout');
  });

  it('lastDigest tracks the previous run digest for determinism badge', async () => {
    const digest1 = 'digest-first-run-000000000000';
    const digest2 = 'digest-second-run-000000000000';

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult(digest1) })
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult(digest2) })
    );

    // First run — no previous digest
    await useSimState.getState().run();
    expect(useSimState.getState().result?.runReport.finalStateDigest).toBe(digest1);
    expect(useSimState.getState().lastDigest).toBeNull(); // nothing before first run

    // Second run — lastDigest = digest1
    await useSimState.getState().run();
    expect(useSimState.getState().result?.runReport.finalStateDigest).toBe(digest2);
    expect(useSimState.getState().lastDigest).toBe(digest1);
  });

  it('determinism badge condition: same digest on two consecutive runs', async () => {
    const sameDigest = 'deterministic-digest-abcdef';

    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult(sameDigest) })
        .mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult(sameDigest) })
    );

    await useSimState.getState().run();
    await useSimState.getState().run();

    const state = useSimState.getState();
    expect(state.result?.runReport.finalStateDigest).toBe(sameDigest);
    expect(state.lastDigest).toBe(sameDigest);
    // Badge condition: result.digest === lastDigest
    expect(state.result?.runReport.finalStateDigest === state.lastDigest).toBe(true);
  });

  it('clearResult resets result, error, lastDigest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({ ok: true, json: async () => makeFakeResult('x') })
    );
    await useSimState.getState().run();
    expect(useSimState.getState().result).not.toBeNull();

    useSimState.getState().clearResult();

    const state = useSimState.getState();
    expect(state.result).toBeNull();
    expect(state.error).toBeNull();
    expect(state.lastDigest).toBeNull();
  });

  it('run() POSTs to /api/simulation/run with correct shape', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => makeFakeResult('sha256test'),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Override steps to a known value
    useSimState.getState().setParamOverride('steps', 150);
    await useSimState.getState().run();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/simulation/run');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as {
      solver: string;
      steps: number;
      dt: number;
      config: Record<string, unknown>;
    };
    expect(body.solver).toBe(SIM_PRESETS[0]!.solver);
    expect(body.steps).toBe(150);
    expect(typeof body.dt).toBe('number');
    expect(typeof body.config).toBe('object');
  });
});
