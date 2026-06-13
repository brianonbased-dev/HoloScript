/**
 * Tests for computeTraceRecorder — the ADDITIVE tap that accrues real
 * compute-axis training data from live Brittney scene grades.
 *
 * Proves: the record path FIRES on a graded compute mutation with the right
 * JSON-RPC shape, SKIPS non-compute mutations, and is FAILURE-ISOLATED — a
 * thrown fetch / network error never propagates into the (Brittney) caller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  recordComputeTrace,
  buildGradePayload,
  extractComputeTuple,
} from '../computeTraceRecorder';
import type { SimContractCheckResult } from '../SimContractGate';

function computeCheck(
  overrides: Partial<{
    object_name: string;
    trait_name: string;
    property_key: string;
    property_value: unknown;
    contractId: string;
    passed: boolean;
    resolvedBound: { min: number; max: number } | null;
  }> = {}
): SimContractCheckResult {
  return {
    passed: overrides.passed ?? true,
    contractId: overrides.contractId ?? 'unscoped',
    // Default to a real two-sided contract bound so the recorder records (BugA);
    // pass resolvedBound: null to exercise the unscoped-skip path.
    resolvedBound: 'resolvedBound' in overrides ? overrides.resolvedBound : { min: 0, max: 2 },
    mutation: {
      tool: 'set_trait_property',
      input: {
        object_name: overrides.object_name ?? 'Lamp',
        trait_name: overrides.trait_name ?? 'glow',
        property_key: overrides.property_key ?? 'intensity',
        property_value: 'property_value' in overrides ? overrides.property_value : 0.75,
      },
    },
  };
}

// ─── Pure extraction / payload tests ────────────────────────────────────────

describe('extractComputeTuple', () => {
  it('extracts a numeric trait-property mutation', () => {
    const tuple = extractComputeTuple(computeCheck());
    expect(tuple).toEqual({
      objectName: 'Lamp',
      traitName: 'glow',
      propertyKey: 'intensity',
      propertyValue: 0.75,
    });
  });

  it('returns null for a non-compute tool (create_object)', () => {
    const check: SimContractCheckResult = {
      passed: true,
      contractId: 'unscoped',
      mutation: { tool: 'create_object', input: { object_name: 'Box' } },
    };
    expect(extractComputeTuple(check)).toBeNull();
  });

  it('returns null for a non-numeric property value', () => {
    expect(extractComputeTuple(computeCheck({ property_value: 'bright' }))).toBeNull();
  });

  it('returns null when trait_name or property_key is missing', () => {
    expect(extractComputeTuple(computeCheck({ trait_name: '' }))).toBeNull();
    expect(extractComputeTuple(computeCheck({ property_key: '' }))).toBeNull();
  });
});

describe('buildGradePayload', () => {
  it('builds the holo_grade_compute_mutation argument shape, self-graded', () => {
    const payload = buildGradePayload({
      sessionId: 'sess-1',
      instruction: 'make the lamp brighter',
      scene: 'object "Lamp" {}',
      check: computeCheck({ property_value: 0.9, contractId: 'unscoped' }),
    });
    expect(payload).toMatchObject({
      sessionId: 'sess-1',
      instruction: 'make the lamp brighter',
      contractId: 'unscoped',
      scene: 'object "Lamp" {}',
      // BugA: bound comes from the resolved contract range (not a degenerate
      // self-reference); expected === the applied value; tagged live-brittney.
      expectedValue: 0.9,
      opLabel: 'live-brittney',
      bound: { trait: 'glow', property: 'intensity', min: 0, max: 2, current: 0.9 },
      mutation: {
        tool: 'set_trait_property',
        objectName: 'Lamp',
        traitName: 'glow',
        propertyKey: 'intensity',
        propertyValue: 0.9,
      },
    });
  });

  it('returns null for a non-compute mutation', () => {
    const check: SimContractCheckResult = {
      passed: true,
      contractId: 'unscoped',
      mutation: { tool: 'delete_object', input: { object_name: 'Box' } },
    };
    expect(buildGradePayload({ sessionId: 's', instruction: 'i', scene: '', check })).toBeNull();
  });

  it('returns null (skip) for an unscoped compute mutation with no resolved bound (BugA)', () => {
    const payload = buildGradePayload({
      sessionId: 's',
      instruction: 'i',
      scene: '',
      check: computeCheck({ property_value: 0.5, resolvedBound: null }),
    });
    expect(payload).toBeNull();
  });
});

// ─── Fire-and-forget dispatch + failure isolation ───────────────────────────

describe('recordComputeTrace', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', 'test-api-key');
    vi.stubEnv('HOLOSCRIPT_MCP', 'https://holo.test');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('FIRES a JSON-RPC tools/call to holo_grade_compute_mutation with the right shape', () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ result: { passed: true } }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const dispatched = recordComputeTrace({
      sessionId: 'sess-42',
      instruction: 'set the glow intensity to 0.6',
      scene: 'object "Lamp" {}',
      check: computeCheck({ property_value: 0.6 }),
    });

    expect(dispatched).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://holo.test/mcp');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer test-api-key');

    const body = JSON.parse(init.body as string);
    expect(body.jsonrpc).toBe('2.0');
    expect(body.method).toBe('tools/call');
    expect(body.params.name).toBe('holo_grade_compute_mutation');
    expect(body.params.arguments).toMatchObject({
      sessionId: 'sess-42',
      instruction: 'set the glow intensity to 0.6',
      expectedValue: 0.6,
      opLabel: 'live-brittney',
      mutation: { traitName: 'glow', propertyKey: 'intensity', propertyValue: 0.6 },
    });
  });

  it('SKIPS (no fetch) a non-compute mutation', () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const check: SimContractCheckResult = {
      passed: true,
      contractId: 'unscoped',
      mutation: { tool: 'create_object', input: { object_name: 'Box' } },
    };
    const dispatched = recordComputeTrace({
      sessionId: 's',
      instruction: 'add a box',
      scene: '',
      check,
    });

    expect(dispatched).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SKIPS when no API key is configured', () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    vi.stubEnv('MCP_API_KEY', '');
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const dispatched = recordComputeTrace({
      sessionId: 's',
      instruction: 'i',
      scene: '',
      check: computeCheck(),
    });

    expect(dispatched).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('FAILURE ISOLATION: a thrown fetch does NOT propagate to the caller', () => {
    // fetch throws synchronously — the recorder must swallow it.
    globalThis.fetch = vi.fn(() => {
      throw new Error('network exploded');
    }) as unknown as typeof fetch;

    // Must NOT throw.
    expect(() =>
      recordComputeTrace({
        sessionId: 's',
        instruction: 'i',
        scene: '',
        check: computeCheck(),
      })
    ).not.toThrow();
  });

  it('FAILURE ISOLATION: a rejected fetch promise does NOT surface', async () => {
    const rejected = Promise.reject(new Error('async network failure'));
    // Pre-attach a catch so the test runner does not flag an unhandled rejection
    // for our assertion handle; the recorder attaches its own .catch internally.
    rejected.catch(() => {});
    globalThis.fetch = vi.fn().mockReturnValue(rejected) as unknown as typeof fetch;

    // Synchronous call returns true (dispatched) without awaiting / throwing.
    expect(
      recordComputeTrace({
        sessionId: 's',
        instruction: 'i',
        scene: '',
        check: computeCheck(),
      })
    ).toBe(true);

    // Let the rejected microtask settle; the process must not crash.
    await new Promise((r) => setTimeout(r, 0));
  });
});
