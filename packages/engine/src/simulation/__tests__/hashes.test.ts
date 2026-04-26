/**
 * Unit tests for pure contract hash functions (`hashes.ts`).
 * Parity, determinism, input sensitivity, and fail-closed error paths.
 */

import { describe, it, expect } from 'vitest';
import {
  hashGeometry,
  hashGpuOutput,
  computeStateDigest,
  hashCAELEntry,
  quantumForField,
} from '../hashes';
import type { SimSolver } from '../SimSolver';
import { HASH_MODE_DEFAULT } from '../sha256';

function minimalSolver(over: Partial<SimSolver> = {}): SimSolver {
  return {
    mode: 'transient',
    fieldNames: [] as const,
    step() {},
    async solve() {},
    getField() { return null; },
    getStats() { return {}; },
    dispose() {},
    ...over,
  } as SimSolver;
}

describe('hashes: mode shape parity (fnv1a vs sha256)', () => {
  it('hashGeometry uses geo- vs geo-sha- prefixes by mode', () => {
    const v = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const e = new Uint32Array([0, 1, 2, 3]);
    const fnv = hashGeometry(v, e, 'fnv1a');
    const sha = hashGeometry(v, e, 'sha256');
    expect(fnv).toMatch(/^geo-[0-9a-f]{8}-/);
    expect(sha).toMatch(/^geo-sha-[0-9a-f]{64}-/);
    expect(fnv).not.toBe(sha);
  });

  it('hashGpuOutput uses gpu- vs gpu-sha- prefixes by mode', () => {
    const data = new Float32Array([1, 2, 3]);
    const fnv = hashGpuOutput(data, 'fnv1a');
    const sha = hashGpuOutput(data, 'sha256');
    expect(fnv).toMatch(/^gpu-[0-9a-f]{8}-\d+$/);
    expect(sha).toMatch(/^gpu-sha-[0-9a-f]{64}-\d+$/);
    expect(fnv).not.toBe(sha);
  });

  it('hashCAELEntry uses cael- vs cael-sha- by mode', () => {
    const base = {
      version: 'cael.v1' as const,
      runId: 'r',
      index: 0,
      event: 'init' as const,
      timestamp: 0,
      simTime: 0,
      prevHash: 'cael.genesis',
      payload: { a: 1 },
    };
    const fnv = hashCAELEntry(base, 'fnv1a');
    const sha = hashCAELEntry(base, 'sha256');
    expect(fnv).toMatch(/^cael-[0-9a-f]+$/i);
    expect(sha).toMatch(/^cael-sha-[0-9a-f]{64}$/);
    expect(fnv).not.toBe(sha);
  });
});

describe('hashes: determinism + sensitivity', () => {
  it('same geometry → same hash', () => {
    const v = new Float32Array([0, 1, 2]);
    const e = new Uint32Array([0, 1, 2]);
    expect(hashGeometry(v, e, HASH_MODE_DEFAULT)).toBe(hashGeometry(v, e, HASH_MODE_DEFAULT));
  });

  it('one quantized vertex change alters hashGeometry', () => {
    const a = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    // Vertices are rounded to 1e-6; 1.0 is a definite lattice step.
    const b = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 1]);
    const e = new Uint32Array([0, 1, 2]);
    expect(hashGeometry(a, e, 'fnv1a')).not.toBe(hashGeometry(b, e, 'fnv1a'));
  });

  it('non-finite hashGpuOutput value throws (fail-closed)', () => {
    const data = new Float32Array([1, NaN, 2]);
    expect(() => hashGpuOutput(data, 'fnv1a')).toThrow(/non-finite/);
  });
});

describe('hashes: empty / missing inputs', () => {
  it("hashGeometry returns 'no-geometry' sentinel, not a silent crypto-length digest", () => {
    const h = hashGeometry(undefined, undefined, 'fnv1a');
    expect(h).toBe('no-geometry');
    expect(h).not.toMatch(/sha256|^[0-9a-f]{64}$/i);
  });

  it('hashGpuOutput empty array uses documented empty digest per mode', () => {
    expect(hashGpuOutput(new Float32Array(0), 'fnv1a')).toBe('gpu-00000000-0');
    const shaE = hashGpuOutput(new Float32Array(0), 'sha256');
    expect(shaE).toBe(`gpu-sha-${'0'.repeat(64)}-0`);
  });

  it("computeStateDigest without iterable fieldNames returns ''", () => {
    const s = minimalSolver() as SimSolver;
    (s as unknown as { fieldNames?: unknown }).fieldNames = undefined;
    expect(computeStateDigest(s, 'fnv1a')).toBe('');
  });
});

describe('hashes: quantumForField (registry resolution)', () => {
  it('resolves known prefixes and uses fallback for unknown', () => {
    expect(quantumForField('vonMisesStress1')).toBe(1_000);
    expect(quantumForField('somethingUnknown_123')).toBe(1e-6);
  });
});

describe('hashes: computeStateDigest on solver with fields', () => {
  it('stable digest for same field data (fnv1a)', () => {
    const t = new Float32Array([100]);
    const solver: SimSolver = {
      mode: 'transient',
      fieldNames: ['temperature', 's'],
      step() {},
      async solve() {},
      getField(n: string) {
        if (n === 'temperature') return t;
        if (n === 's') return t;
        return null;
      },
      getStats() { return {}; },
      dispose() {},
    };
    const a = computeStateDigest(solver, 'fnv1a');
    const b = computeStateDigest(solver, 'fnv1a');
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(a).toBe(b);
  });

  it('throws on non-finite field value in sha256 mode', () => {
    const t = new Float32Array([NaN]);
    const solver: SimSolver = {
      mode: 'transient',
      fieldNames: ['strainX'],
      step() {},
      async solve() {},
      getField() { return t; },
      getStats() { return {}; },
      dispose() {},
    };
    expect(() => computeStateDigest(solver, 'sha256')).toThrow(/Non-finite value in field/);
  });
});
