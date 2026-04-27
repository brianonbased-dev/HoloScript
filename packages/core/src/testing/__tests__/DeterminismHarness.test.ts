import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DeterminismHarness,
  captureEnvironment,
  hashBytes,
  describeEnvironment,
  type ProbeResult,
  type EnvironmentInfo,
  type DivergenceReport,
} from '../DeterminismHarness.js';

// =============================================================================
// hashBytes
// =============================================================================

describe('hashBytes', () => {
  it('returns an fnv1a-64 prefix when algo is fnv1a', async () => {
    const h = await hashBytes(new Uint8Array([1, 2, 3]), 'fnv1a');
    expect(h).toMatch(/^fnv1a-64:/);
  });

  it('produces consistent fnv1a hashes for the same input', async () => {
    const bytes = new Uint8Array([10, 20, 30, 40]);
    const h1 = await hashBytes(bytes, 'fnv1a');
    const h2 = await hashBytes(bytes, 'fnv1a');
    expect(h1).toBe(h2);
  });

  it('produces different fnv1a hashes for different inputs', async () => {
    const h1 = await hashBytes(new Uint8Array([1, 2, 3]), 'fnv1a');
    const h2 = await hashBytes(new Uint8Array([3, 2, 1]), 'fnv1a');
    expect(h1).not.toBe(h2);
  });

  it('accepts string input and hashes it', async () => {
    const h = await hashBytes('hello world', 'fnv1a');
    expect(h).toMatch(/^fnv1a-64:/);
    expect(h.length).toBeGreaterThan(10);
  });

  it('hashes empty input without throwing', async () => {
    const h = await hashBytes(new Uint8Array(0), 'fnv1a');
    expect(h).toMatch(/^fnv1a-64:/);
  });

  it('returns sha256 or fnv1a-64 prefix for default algo', async () => {
    const h = await hashBytes(new Uint8Array([1, 2, 3]));
    // In Node test environment SubtleCrypto may or may not be available
    expect(h).toMatch(/^(sha256:|fnv1a-64:)/);
  });

  it('is consistent across calls with same algo and input', async () => {
    const input = new TextEncoder().encode('determinism test');
    const h1 = await hashBytes(input, 'fnv1a');
    const h2 = await hashBytes(input, 'fnv1a');
    expect(h1).toBe(h2);
  });
});

// =============================================================================
// captureEnvironment
// =============================================================================

describe('captureEnvironment', () => {
  it('returns an EnvironmentInfo object with a runtime field', async () => {
    const env = await captureEnvironment();
    expect(env).toBeDefined();
    expect(['browser', 'node', 'unknown']).toContain(env.runtime);
  });

  it('captures node info in a Node.js environment', async () => {
    const env = await captureEnvironment();
    // vitest runs in Node, so runtime should be 'node'
    expect(env.runtime).toBe('node');
    expect(env.node).toBeDefined();
    expect(env.node!.version).toBeTruthy();
    expect(env.node!.platform).toBeTruthy();
    expect(env.node!.arch).toBeTruthy();
  });

  it('includes provided annotations', async () => {
    const env = await captureEnvironment({ backend: 'test', version: '1' });
    expect(env.annotations).toEqual({ backend: 'test', version: '1' });
  });

  it('omits annotations when none provided', async () => {
    const env = await captureEnvironment();
    expect(env.annotations).toBeUndefined();
  });

  it('returns empty annotations obj when empty obj passed', async () => {
    const env = await captureEnvironment({});
    // Empty annotation object is not included
    expect(env.annotations).toBeUndefined();
  });
});

// =============================================================================
// describeEnvironment
// =============================================================================

describe('describeEnvironment', () => {
  it('returns runtime as the first segment', () => {
    const env: EnvironmentInfo = { runtime: 'node', node: { version: '18.0', platform: 'linux', arch: 'x64' } };
    const desc = describeEnvironment(env);
    expect(desc).toMatch(/^node/);
  });

  it('includes node version, platform, and arch', () => {
    const env: EnvironmentInfo = { runtime: 'node', node: { version: '18.15', platform: 'win32', arch: 'x64' } };
    const desc = describeEnvironment(env);
    expect(desc).toContain('node 18.15');
    expect(desc).toContain('win32');
    expect(desc).toContain('x64');
  });

  it('includes gpu info when present', () => {
    const env: EnvironmentInfo = {
      runtime: 'browser',
      gpu: { vendor: 'nvidia', architecture: 'ampere' },
    };
    const desc = describeEnvironment(env);
    expect(desc).toContain('gpu:nvidia/ampere');
  });

  it('includes gpu vendor only when no architecture', () => {
    const env: EnvironmentInfo = {
      runtime: 'browser',
      gpu: { vendor: 'amd' },
    };
    const desc = describeEnvironment(env);
    expect(desc).toContain('gpu:amd');
    expect(desc).not.toContain('/');
  });

  it('includes browser info when present', () => {
    const env: EnvironmentInfo = {
      runtime: 'browser',
      browser: { browser: 'chromium', os: 'macos' },
    };
    const desc = describeEnvironment(env);
    expect(desc).toContain('chromium');
    expect(desc).toContain('macos');
  });

  it('includes annotations as key=value', () => {
    const env: EnvironmentInfo = {
      runtime: 'node',
      annotations: { run: 'a', seed: '42' },
    };
    const desc = describeEnvironment(env);
    expect(desc).toContain('run=a');
    expect(desc).toContain('seed=42');
  });

  it('returns just the runtime when nothing else is set', () => {
    const env: EnvironmentInfo = { runtime: 'unknown' };
    const desc = describeEnvironment(env);
    expect(desc).toBe('unknown');
  });
});

// =============================================================================
// DeterminismHarness.probe
// =============================================================================

describe('DeterminismHarness.probe', () => {
  it('returns a ProbeResult with correct name', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('test-probe', () => new Uint8Array([1, 2, 3]));
    expect(result.name).toBe('test-probe');
  });

  it('returns a ProbeResult with outputHash', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('hash-test', () => new Uint8Array([1, 2, 3]));
    expect(result.outputHash).toBeTruthy();
    expect(result.outputHash).not.toBe('');
  });

  it('returns same hash for same input across two probes', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a' });
    const data = new Uint8Array([5, 10, 15, 20]);
    const r1 = await harness.probe('p', () => data);
    const r2 = await harness.probe('p', () => data);
    expect(r1.outputHash).toBe(r2.outputHash);
  });

  it('returns different hashes for different inputs', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a' });
    const r1 = await harness.probe('p', () => new Uint8Array([1, 2, 3]));
    const r2 = await harness.probe('p', () => new Uint8Array([4, 5, 6]));
    expect(r1.outputHash).not.toBe(r2.outputHash);
  });

  it('returns correct outputSize in bytes', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('size-test', () => new Uint8Array(64));
    expect(result.outputSize).toBe(64);
  });

  it('returns outputSize for string output', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('str-test', () => 'hello');
    expect(result.outputSize).toBeGreaterThan(0);
  });

  it('captures output when captureOutput=true', async () => {
    const harness = new DeterminismHarness({ captureOutput: true });
    const data = new Uint8Array([7, 8, 9]);
    const result = await harness.probe('capture', () => data);
    expect(result.output).toBeDefined();
    expect(result.output).toEqual(data);
  });

  it('does not capture output when captureOutput=false (default)', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('no-capture', () => new Uint8Array([1]));
    expect(result.output).toBeUndefined();
  });

  it('handles async probe functions', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a' });
    const result = await harness.probe('async-probe', async () => {
      await Promise.resolve();
      return new Uint8Array([42]);
    });
    expect(result.outputHash).toMatch(/^fnv1a-64:/);
    expect(result.outputSize).toBe(1);
  });

  it('records error in ProbeResult when probe throws', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('error-probe', () => {
      throw new Error('boom');
    });
    expect(result.error).toBe('boom');
    expect(result.outputHash).toMatch(/^error:/);
    expect(result.outputSize).toBe(0);
  });

  it('includes environment in result', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('env-test', () => new Uint8Array([1]));
    expect(result.environment).toBeDefined();
    expect(result.environment.runtime).toBeDefined();
  });

  it('includes timestamp', async () => {
    const harness = new DeterminismHarness();
    const before = Date.now();
    const result = await harness.probe('ts-test', () => new Uint8Array([1]));
    const after = Date.now();
    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
  });

  it('records durationMs >= 0', async () => {
    const harness = new DeterminismHarness();
    const result = await harness.probe('dur-test', () => new Uint8Array([1]));
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('propagates harness annotations to probe result environment', async () => {
    const harness = new DeterminismHarness({ annotations: { suite: 'perf' } });
    const result = await harness.probe('ann-test', () => new Uint8Array([1]));
    expect(result.environment.annotations?.suite).toBe('perf');
  });

  it('merges per-probe annotations with harness annotations', async () => {
    const harness = new DeterminismHarness({ annotations: { suite: 'perf' } });
    const result = await harness.probe(
      'merge-ann',
      () => new Uint8Array([1]),
      { run: 'first' }
    );
    expect(result.environment.annotations?.suite).toBe('perf');
    expect(result.environment.annotations?.run).toBe('first');
  });

  it('uses fnv1a algorithm when configured', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a' });
    const result = await harness.probe('fnv-test', () => new Uint8Array([1, 2]));
    expect(result.outputHash).toMatch(/^fnv1a-64:/);
  });
});

// =============================================================================
// DeterminismHarness.compareResults (static)
// =============================================================================

describe('DeterminismHarness.compareResults', () => {
  function makeResult(name: string, hash: string): ProbeResult {
    return {
      name,
      timestamp: Date.now(),
      environment: { runtime: 'node' },
      durationMs: 1,
      outputHash: hash,
      outputSize: 4,
    };
  }

  it('returns non-divergent for empty results', () => {
    const report = DeterminismHarness.compareResults([]);
    expect(report.divergent).toBe(false);
    expect(report.totalResults).toBe(0);
    expect(report.uniqueHashes).toBe(0);
  });

  it('returns convergent when all results share the same hash', () => {
    const results = [
      makeResult('probe', 'abc123'),
      makeResult('probe', 'abc123'),
      makeResult('probe', 'abc123'),
    ];
    const report = DeterminismHarness.compareResults(results);
    expect(report.divergent).toBe(false);
    expect(report.uniqueHashes).toBe(1);
    expect(report.totalResults).toBe(3);
  });

  it('returns divergent when results have different hashes', () => {
    const results = [
      makeResult('probe', 'hash_a'),
      makeResult('probe', 'hash_b'),
    ];
    const report = DeterminismHarness.compareResults(results);
    expect(report.divergent).toBe(true);
    expect(report.uniqueHashes).toBe(2);
  });

  it('groups results by hash', () => {
    const results = [
      makeResult('probe', 'hash_a'),
      makeResult('probe', 'hash_a'),
      makeResult('probe', 'hash_b'),
    ];
    const report = DeterminismHarness.compareResults(results);
    expect(report.groups).toHaveLength(2);
    const groupA = report.groups.find(g => g.hash === 'hash_a')!;
    expect(groupA.results).toHaveLength(2);
    const groupB = report.groups.find(g => g.hash === 'hash_b')!;
    expect(groupB.results).toHaveLength(1);
  });

  it('sets probeName from the first result', () => {
    const results = [makeResult('my-probe', 'h1'), makeResult('my-probe', 'h1')];
    const report = DeterminismHarness.compareResults(results);
    expect(report.probeName).toBe('my-probe');
  });

  it('summary contains CONVERGENT for matching hashes', () => {
    const results = [makeResult('p', 'hash'), makeResult('p', 'hash')];
    const report = DeterminismHarness.compareResults(results);
    expect(report.summary).toMatch(/CONVERGENT/);
  });

  it('summary contains DIVERGENT for mismatched hashes', () => {
    const results = [makeResult('p', 'h1'), makeResult('p', 'h2')];
    const report = DeterminismHarness.compareResults(results);
    expect(report.summary).toMatch(/DIVERGENT/);
  });

  it('handles single result as convergent', () => {
    const results = [makeResult('p', 'only_hash')];
    const report = DeterminismHarness.compareResults(results);
    expect(report.divergent).toBe(false);
    expect(report.uniqueHashes).toBe(1);
    expect(report.totalResults).toBe(1);
  });

  it('includes environments descriptors in each group', () => {
    const r1: ProbeResult = {
      name: 'p',
      timestamp: 0,
      environment: { runtime: 'node', node: { version: '18', platform: 'linux', arch: 'x64' } },
      durationMs: 0,
      outputHash: 'h',
      outputSize: 0,
    };
    const report = DeterminismHarness.compareResults([r1]);
    expect(report.groups[0].environments).toHaveLength(1);
    expect(report.groups[0].environments[0]).toContain('node');
  });
});

// =============================================================================
// End-to-end: probe + compareResults
// =============================================================================

describe('DeterminismHarness end-to-end', () => {
  it('detects convergence across identical runs', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a' });
    const data = new Uint8Array([1, 1, 2, 3, 5, 8, 13]);
    const r1 = await harness.probe('fib', () => data);
    const r2 = await harness.probe('fib', () => data);
    const r3 = await harness.probe('fib', () => data);
    const report = DeterminismHarness.compareResults([r1, r2, r3]);
    expect(report.divergent).toBe(false);
    expect(report.uniqueHashes).toBe(1);
  });

  it('detects divergence when probe returns different outputs', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a' });
    let counter = 0;
    const r1 = await harness.probe('non-det', () => new Uint8Array([counter++]));
    const r2 = await harness.probe('non-det', () => new Uint8Array([counter++]));
    const report = DeterminismHarness.compareResults([r1, r2]);
    expect(report.divergent).toBe(true);
  });

  it('round-trips: probe output captured equals original data', async () => {
    const harness = new DeterminismHarness({ hashAlgorithm: 'fnv1a', captureOutput: true });
    const original = new Uint8Array([10, 20, 30, 40, 50]);
    const result = await harness.probe('capture-roundtrip', () => original);
    expect(result.output).toEqual(original);
  });
});
