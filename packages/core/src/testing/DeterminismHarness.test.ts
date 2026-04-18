/**
 * DeterminismHarness tests — verify the cross-backend determinism
 * probing infrastructure works under Node (no WebGPU) and reports
 * sensible environment data, hashing, and divergence comparisons.
 *
 * Real-GPU probes live in per-paper test files (Paper #2 SNN, P2-0
 * retargeting, P3-CENTER rendering) that import this harness and
 * supply a backend-specific probeFn.
 */

import { describe, it, expect } from 'vitest';
import {
  DeterminismHarness,
  captureEnvironment,
  hashBytes,
  describeEnvironment,
  type ProbeResult,
} from './DeterminismHarness';

describe('DeterminismHarness.probe', () => {
  it('hashes a deterministic Uint8Array output consistently across runs', async () => {
    const harness = new DeterminismHarness();
    const fn = () => new Uint8Array([1, 2, 3, 4, 5]);

    const r1 = await harness.probe('bytes-trivial', fn);
    const r2 = await harness.probe('bytes-trivial', fn);

    expect(r1.outputHash).toBe(r2.outputHash);
    expect(r1.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
    expect(r1.outputSize).toBe(5);
  });

  it('hashes a string output via UTF-8 encoding', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('string-output', () => 'composition "Test" {}');
    expect(r.outputHash).toMatch(/^(sha256|fnv1a-64):[0-9a-f]+$/);
    expect(r.outputSize).toBeGreaterThan(0);
  });

  it('distinguishes different outputs with different hashes', async () => {
    const harness = new DeterminismHarness();
    const r1 = await harness.probe('a', () => new Uint8Array([1]));
    const r2 = await harness.probe('b', () => new Uint8Array([2]));
    expect(r1.outputHash).not.toBe(r2.outputHash);
  });

  it('captures an environment with runtime !== "unknown" in Node', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('env-probe', () => new Uint8Array([0]));
    expect(['node', 'browser']).toContain(r.environment.runtime);
    // In vitest/Node the environment should have `node` info populated.
    if (r.environment.runtime === 'node') {
      expect(r.environment.node).toBeDefined();
      expect(r.environment.node?.version).toBeTruthy();
      expect(r.environment.node?.platform).toBeTruthy();
    }
  });

  it('does not throw when the probe function throws — reports error on result', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('throws', () => {
      throw new Error('intentional');
    });
    expect(r.error).toBe('intentional');
    expect(r.outputHash.startsWith('error:')).toBe(true);
    expect(r.outputSize).toBe(0);
  });

  it('retains output bytes when captureOutput: true', async () => {
    const harness = new DeterminismHarness({ captureOutput: true });
    const bytes = new Uint8Array([10, 20, 30]);
    const r = await harness.probe('capture', () => bytes);
    expect(r.output).toEqual(bytes);
  });

  it('threads annotations into the captured environment', async () => {
    const harness = new DeterminismHarness({ annotations: { test_suite: 'harness-self' } });
    const r = await harness.probe('annotated', () => new Uint8Array([0]), {
      scenario: 'unit',
    });
    expect(r.environment.annotations).toEqual({
      test_suite: 'harness-self',
      scenario: 'unit',
    });
  });

  it('measures duration with non-negative number', async () => {
    const harness = new DeterminismHarness();
    const r = await harness.probe('duration', async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Uint8Array([0]);
    });
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe('DeterminismHarness.compareResults', () => {
  const baseEnv = () => ({ runtime: 'node' as const });

  function fakeResult(name: string, hash: string, envTag: string): ProbeResult {
    return {
      name,
      timestamp: Date.now(),
      environment: { ...baseEnv(), annotations: { tag: envTag } },
      durationMs: 1,
      outputHash: hash,
      outputSize: 1,
    };
  }

  it('reports convergent when all results share one hash', () => {
    const results = [
      fakeResult('snn-1k', 'sha256:abc', 'chromium-nvidia'),
      fakeResult('snn-1k', 'sha256:abc', 'firefox-nvidia'),
      fakeResult('snn-1k', 'sha256:abc', 'safari-apple'),
    ];
    const report = DeterminismHarness.compareResults(results);
    expect(report.divergent).toBe(false);
    expect(report.uniqueHashes).toBe(1);
    expect(report.totalResults).toBe(3);
    expect(report.summary).toMatch(/^CONVERGENT/);
  });

  it('reports divergent when results disagree and groups by hash', () => {
    const results = [
      fakeResult('retarget', 'sha256:aaa', 'chromium-nvidia'),
      fakeResult('retarget', 'sha256:aaa', 'firefox-nvidia'),
      fakeResult('retarget', 'sha256:bbb', 'safari-apple'),
    ];
    const report = DeterminismHarness.compareResults(results);
    expect(report.divergent).toBe(true);
    expect(report.uniqueHashes).toBe(2);
    expect(report.groups.length).toBe(2);
    // The larger group should carry 2 results.
    const largest = report.groups.reduce((a, b) =>
      a.results.length >= b.results.length ? a : b
    );
    expect(largest.results.length).toBe(2);
    expect(report.summary).toMatch(/^DIVERGENT/);
  });

  it('handles the empty input gracefully', () => {
    const report = DeterminismHarness.compareResults([]);
    expect(report.divergent).toBe(false);
    expect(report.totalResults).toBe(0);
    expect(report.groups).toEqual([]);
  });
});

describe('hashBytes', () => {
  it('produces identical hashes for identical inputs', async () => {
    const h1 = await hashBytes(new Uint8Array([1, 2, 3]));
    const h2 = await hashBytes(new Uint8Array([1, 2, 3]));
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', async () => {
    const h1 = await hashBytes(new Uint8Array([1, 2, 3]));
    const h2 = await hashBytes(new Uint8Array([1, 2, 4]));
    expect(h1).not.toBe(h2);
  });

  it('accepts string inputs (UTF-8 encoded)', async () => {
    const h1 = await hashBytes('hello');
    const h2 = await hashBytes('hello');
    expect(h1).toBe(h2);
    const h3 = await hashBytes('world');
    expect(h1).not.toBe(h3);
  });

  it('fnv1a fallback produces a 16-hex-char hash', async () => {
    const h = await hashBytes(new Uint8Array([0, 1, 2, 3]), 'fnv1a');
    expect(h).toMatch(/^fnv1a-64:[0-9a-f]{16}$/);
  });
});

describe('captureEnvironment', () => {
  it('returns a runtime tag', async () => {
    const env = await captureEnvironment();
    expect(['browser', 'node', 'unknown']).toContain(env.runtime);
  });

  it('includes annotations when supplied', async () => {
    const env = await captureEnvironment({ hardware_class: 'rtx-3060', test_id: 'unit' });
    expect(env.annotations).toEqual({ hardware_class: 'rtx-3060', test_id: 'unit' });
  });
});

describe('describeEnvironment', () => {
  it('produces a human-readable one-liner for a Node env', () => {
    const desc = describeEnvironment({
      runtime: 'node',
      node: { version: '22.0.0', arch: 'x64', platform: 'linux' },
      annotations: { test: 'u1' },
    });
    expect(desc).toContain('node');
    expect(desc).toContain('22.0.0');
    expect(desc).toContain('linux/x64');
    expect(desc).toContain('test=u1');
  });

  it('produces a human-readable one-liner for a browser env with GPU', () => {
    const desc = describeEnvironment({
      runtime: 'browser',
      browser: { browser: 'chromium', os: 'windows' },
      gpu: { vendor: 'nvidia', architecture: 'ada-lovelace', backend: 'webgpu' },
    });
    expect(desc).toContain('browser');
    expect(desc).toContain('chromium');
    expect(desc).toContain('windows');
    expect(desc).toContain('gpu:nvidia/ada-lovelace');
  });
});
