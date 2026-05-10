/**
 * Paper #1 / PAPER-GAP-06 — Independent CAEL hash-chain verify + replay timing.
 *
 * Measures `verifyCAELHashChain` (verifier-only) vs full `CAELReplayer.verify` + `replay`
 * on a non-trivial trace. Logs ms and entries/s for methods text.
 *
 * Run: pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/paper-cael-replay-benchmark.test.ts
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import { CAELRecorder } from '../CAELRecorder';
import { CAELReplayer } from '../CAELReplayer';
import {
  type CAELTrace,
  type CAELTraceEntry,
  parseCAELJSONL,
  verifyCAELHashChain,
} from '../CAELTrace';

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['temperature'],
    time: 0,
    step(dt: number) {
      this.time += dt;
    },
    solve() {},
    getField(): FieldData | null {
      return new Float32Array([this.time, this.time + 1, this.time + 2]);
    },
    getStats() {
      return { converged: true, currentTime: this.time };
    },
    dispose() {},
  };
}

function calcStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p99Index = Math.min(n - 1, Math.floor(n * 0.99));
  const p99 = sorted[p99Index];
  return { median, p99 };
}

type AblationTamperKind =
  | 'event_type_change'
  | 'payload_value_change'
  | 'timestamp_alteration'
  | 'entry_deletion'
  | 'entry_insertion'
  | 'entry_reordering';

interface AblationTiming {
  medianUs: number;
  p99Us: number;
}

interface AblationResult {
  generatedAt: string;
  harness: string;
  host: {
    platform: string;
    arch: string;
    node: string;
    vitest: string;
  };
  representativeTrace: {
    entries: number;
    bytes: number;
    timingRuns: number;
  };
  variants: {
    full: AblationTiming & { tpRate: number; falsePositiveRate: number };
    minusVerify: AblationTiming & { tpRate: number; falsePositiveRate: number };
    baseline: AblationTiming & { tpRate: number; falsePositiveRate: number };
  };
  corpus: {
    controls: number;
    tampered: number;
    byKind: Record<AblationTamperKind, { trials: number; detected: number }>;
  };
}

function cloneTrace(trace: CAELTrace): CAELTrace {
  return JSON.parse(JSON.stringify(trace)) as CAELTrace;
}

function mutateEntry(entry: CAELTraceEntry, patch: Partial<CAELTraceEntry>): CAELTraceEntry {
  return { ...entry, ...patch };
}

function makeTamperedTrace(trace: CAELTrace, kind: AblationTamperKind, trial: number): CAELTrace {
  const out = cloneTrace(trace);
  const target = Math.max(1, Math.min(out.length - 2, 1 + (trial % Math.max(1, out.length - 2))));

  switch (kind) {
    case 'event_type_change':
      out[target] = mutateEntry(out[target], { event: 'interaction' });
      return out;
    case 'payload_value_change':
      out[target] = mutateEntry(out[target], {
        payload: { ...out[target].payload, wallDelta: 0.02 + trial * 0.000001 },
      });
      return out;
    case 'timestamp_alteration':
      out[target] = mutateEntry(out[target], { timestamp: out[target].timestamp + 1 + trial });
      return out;
    case 'entry_deletion':
      out.splice(target, 1);
      return out;
    case 'entry_insertion':
      out.splice(target, 0, mutateEntry(out[target], { index: out[target].index + 1 }));
      return out;
    case 'entry_reordering': {
      const swap = Math.min(out.length - 2, target + 1);
      [out[target], out[swap]] = [out[swap], out[target]];
      return out;
    }
  }
}

function timeCallsUs(fn: () => unknown, runs: number): AblationTiming {
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push((performance.now() - t0) * 1000);
  }
  const stats = calcStats(samples);
  return { medianUs: stats.median, p99Us: stats.p99 };
}

function writeAblationArtifact(result: AblationResult): string | null {
  if (process.env.PAPER1_ABLATION_WRITE !== '1') return null;

  const __dir = dirname(fileURLToPath(import.meta.url));
  // __tests__ -> simulation -> src -> engine -> packages -> repo root
  const repoRoot = resolve(__dir, '..', '..', '..', '..', '..');
  const benchLogsDir = resolve(repoRoot, '.bench-logs');
  if (!existsSync(benchLogsDir)) mkdirSync(benchLogsDir, { recursive: true });
  const artifactPath = resolve(benchLogsDir, 'paper-1-mcp-ablation.json');
  writeFileSync(artifactPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  return artifactPath;
}

describe('Paper #1 — CAEL verifier / replay benchmark (PAPER-GAP-06)', () => {
  /** Each `step()` adds one row after `init`; `finalize()` adds `final`. Entries = steps + 2. */
  function buildTrace(steps: number): { jsonl: string; entryCount: number } {
    const recorder = new CAELRecorder(
      mockSolver(),
      {
        vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        tetrahedra: new Uint32Array([0, 1, 2, 3]),
      },
      { solverType: 'structural-tet10', fixedDt: 0.01 }
    );
    for (let i = 0; i < steps; i++) {
      recorder.step(0.01);
    }
    recorder.finalize();
    const jsonl = recorder.toJSONL();
    const trace = parseCAELJSONL(jsonl);
    return { jsonl, entryCount: trace.length };
  }

  it('reports verify-only median/p99 at multiple trace lengths (table splits)', async () => {
    const stepTargets = [98, 998, 9998, 99995];
    const verifyRuns = 10;

    console.log(
      '\n[paper-cael-replay-benchmark] === verify-only splits (us/entry median, p99) ==='
    );
    for (const steps of stepTargets) {
      const { jsonl, entryCount } = buildTrace(steps);
      const trace = parseCAELJSONL(jsonl);
      expect(trace.length).toBe(entryCount);

      const verifySamplesUs: number[] = [];
      for (let r = 0; r < verifyRuns; r++) {
        const t0 = performance.now();
        const v = verifyCAELHashChain(trace);
        const t1 = performance.now();
        expect(v.valid).toBe(true);
        const runTimeMs = t1 - t0;
        verifySamplesUs.push((runTimeMs * 1000) / entryCount);
      }
      const stats = calcStats(verifySamplesUs);
      const totalMedianMs = (stats.median * entryCount) / 1000;
      console.log(
        `[paper-cael-replay-benchmark] entries=${entryCount} steps=${steps} ` +
          `totalMedian=${totalMedianMs.toFixed(3)}ms ` +
          `us/entry med=${stats.median.toFixed(4)} p99=${stats.p99.toFixed(4)}`
      );
    }
  }, 600_000);

  it('reports verify-only vs full replay wall time (~100k entries)', async () => {
    const steps = 99995;
    const { jsonl, entryCount } = buildTrace(steps);
    expect(entryCount).toBeGreaterThan(90_000);

    const trace = parseCAELJSONL(jsonl);
    const verifyRuns = 10;
    const verifySamplesUs: number[] = [];

    for (let r = 0; r < verifyRuns; r++) {
      const t0 = performance.now();
      const v = verifyCAELHashChain(trace);
      const t1 = performance.now();
      expect(v.valid).toBe(true);

      const runTimeMs = t1 - t0;
      const perEntryUs = (runTimeMs * 1000) / entryCount;
      verifySamplesUs.push(perEntryUs);
    }

    const stats = calcStats(verifySamplesUs);

    const replayer = new CAELReplayer(jsonl);
    const t1 = performance.now();
    const chain = replayer.verify();
    expect(chain.valid).toBe(true);
    const replaySim = await replayer.replay(() => mockSolver());
    replaySim.dispose();
    const replayMs = performance.now() - t1;

    console.log(
      `\n[paper-cael-replay-benchmark] entries=${entryCount} verifyRuns=${verifyRuns} ` +
        `verify: ${stats.median.toFixed(4)} us/entry median (p99: ${stats.p99.toFixed(4)} us/entry) `
    );
    console.log(
      `[paper-cael-replay-benchmark] single replayer.verify+replay wall ${replayMs.toFixed(2)}ms (${entryCount} entries)`
    );

    expect(replayMs).toBeLessThan(120_000);
  }, 120_000);

  /**
   * Tab:verify small-$n$ sweep for Paper 1 — hash-chain verify **total** wall time ($\mu$s).
   * Entries $n$ = steps + 2 (init row, `steps` step rows, finalize row).
   */
  it('reports tab:verify n-sweep at 3/13/103/1003 entries (hash verify median/p99, total μs)', async () => {
    const entryTargets = [3, 13, 103, 1003];
    const verifyRuns = 10;

    console.log(
      '\n[paper-cael-replay-benchmark] === tab:verify n-sweep (hash verify, total μs) ==='
    );
    for (const entryCount of entryTargets) {
      const steps = entryCount - 2;
      const { jsonl, entryCount: ec } = buildTrace(steps);
      expect(ec).toBe(entryCount);

      const trace = parseCAELJSONL(jsonl);
      const totalUsSamples: number[] = [];
      for (let r = 0; r < verifyRuns; r++) {
        const t0 = performance.now();
        const v = verifyCAELHashChain(trace);
        const t1 = performance.now();
        expect(v.valid).toBe(true);
        totalUsSamples.push((t1 - t0) * 1000);
      }
      const stats = calcStats(totalUsSamples);
      const perEntryMedNs = (stats.median / entryCount) * 1000;
      console.log(
        `[paper-cael-replay-benchmark] tab:verify entries=${entryCount} verifyRuns=${verifyRuns} ` +
          `hashVerifyTotalUs med=${stats.median.toFixed(2)} p99=${stats.p99.toFixed(2)} ` +
          `(~${perEntryMedNs.toFixed(1)} ns/entry)`
      );
    }
  }, 120_000);

  /**
   * Tab:verify small-$n$ sweep — **structural** (parse + schema check) and **full replay** timings.
   * Structural = parseCAELJSONL (validates entry structure, types, ordering).
   * Full replay = CAELReplayer.verify() + replay() with mock solver factory.
   */
  it('reports tab:verify n-sweep at 3/13/103/1003 entries (structural µs + full replay ms)', async () => {
    const entryTargets = [3, 13, 103, 1003];
    const runs = 10;

    console.log(
      '\n[paper-cael-replay-benchmark] === tab:verify n-sweep (structural µs + full replay ms) ==='
    );
    for (const entryCount of entryTargets) {
      const steps = entryCount - 2;
      const { jsonl, entryCount: ec } = buildTrace(steps);
      expect(ec).toBe(entryCount);

      // Structural: time parseCAELJSONL (schema-level validation).
      const structUsSamples: number[] = [];
      for (let r = 0; r < runs; r++) {
        const t0 = performance.now();
        const parsed = parseCAELJSONL(jsonl);
        expect(parsed.length).toBe(entryCount);
        structUsSamples.push((performance.now() - t0) * 1000);
      }
      const structStats = calcStats(structUsSamples);

      // Full replay: verify + replay with mock solver (ms total).
      const replayMsSamples: number[] = [];
      for (let r = 0; r < runs; r++) {
        const replayer = new CAELReplayer(jsonl);
        const t0 = performance.now();
        const chain = replayer.verify();
        expect(chain.valid).toBe(true);
        const sim = await replayer.replay(() => mockSolver());
        sim.dispose();
        replayMsSamples.push(performance.now() - t0);
      }
      const replayStats = calcStats(replayMsSamples);

      console.log(
        `[paper-cael-replay-benchmark] tab:verify entries=${entryCount} runs=${runs} ` +
          `structuralTotalUs med=${structStats.median.toFixed(2)} p99=${structStats.p99.toFixed(2)} ` +
          `fullReplayTotalMs med=${replayStats.median.toFixed(2)} p99=${replayStats.p99.toFixed(2)}`
      );
    }
  }, 600_000);

  it('reports paper-1 MCP ablation per-call latency and detection rates', () => {
    const representative = buildTrace(1001);
    const representativeTrace = parseCAELJSONL(representative.jsonl);
    expect(representative.entryCount).toBe(1003);

    const timingRuns = Number.parseInt(process.env.PAPER1_ABLATION_RUNS ?? '200', 10);
    const fullTiming = timeCallsUs(() => {
      const trace = parseCAELJSONL(representative.jsonl);
      const result = verifyCAELHashChain(trace);
      if (!result.valid) throw new Error(result.reason ?? 'verification failed');
      return result;
    }, timingRuns);

    const minusVerifyTiming = timeCallsUs(() => {
      // Same response surface with a trace attached, but no hash-chain verification.
      return representative.jsonl.length > 0;
    }, timingRuns);

    const baselineTiming = timeCallsUs(() => {
      // Baseline no-pipeline response handling: consume a scalar result only.
      return representative.entryCount > 0;
    }, timingRuns);

    const tamperKinds: AblationTamperKind[] = [
      'event_type_change',
      'payload_value_change',
      'timestamp_alteration',
      'entry_deletion',
      'entry_insertion',
      'entry_reordering',
    ];
    const trialsPerKind = 100;
    const byKind = Object.fromEntries(
      tamperKinds.map((kind) => [kind, { trials: trialsPerKind, detected: 0 }])
    ) as Record<AblationTamperKind, { trials: number; detected: number }>;

    let fullTruePositive = 0;
    let tamperedTrials = 0;
    for (const kind of tamperKinds) {
      for (let trial = 0; trial < trialsPerKind; trial++) {
        const tampered = makeTamperedTrace(representativeTrace, kind, trial);
        const verification = verifyCAELHashChain(tampered);
        const detected = !verification.valid;
        if (detected) {
          fullTruePositive += 1;
          byKind[kind].detected += 1;
        }
        tamperedTrials += 1;
      }
    }

    let fullFalsePositive = 0;
    const controlTrials = 100;
    for (let trial = 0; trial < controlTrials; trial++) {
      const verification = verifyCAELHashChain(representativeTrace);
      if (!verification.valid) fullFalsePositive += 1;
    }

    const result: AblationResult = {
      generatedAt: new Date().toISOString(),
      harness: 'packages/engine/src/simulation/__tests__/paper-cael-replay-benchmark.test.ts',
      host: {
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        vitest: '4.1.5',
      },
      representativeTrace: {
        entries: representative.entryCount,
        bytes: Buffer.byteLength(representative.jsonl, 'utf8'),
        timingRuns,
      },
      variants: {
        full: {
          ...fullTiming,
          tpRate: fullTruePositive / tamperedTrials,
          falsePositiveRate: fullFalsePositive / controlTrials,
        },
        minusVerify: {
          ...minusVerifyTiming,
          tpRate: 0,
          falsePositiveRate: 0,
        },
        baseline: {
          ...baselineTiming,
          tpRate: 0,
          falsePositiveRate: 0,
        },
      },
      corpus: {
        controls: controlTrials,
        tampered: tamperedTrials,
        byKind,
      },
    };

    const artifact = writeAblationArtifact(result);
    console.log('\n[paper-cael-replay-benchmark] === paper-1 MCP ablation ===');
    console.log(
      `[paper-cael-replay-benchmark] entries=${result.representativeTrace.entries} ` +
        `bytes=${result.representativeTrace.bytes} timingRuns=${timingRuns}`
    );
    console.log(
      `[paper-cael-replay-benchmark] full med=${result.variants.full.medianUs.toFixed(2)}us ` +
        `p99=${result.variants.full.p99Us.toFixed(2)}us ` +
        `tp=${(result.variants.full.tpRate * 100).toFixed(1)}% ` +
        `fp=${(result.variants.full.falsePositiveRate * 100).toFixed(1)}%`
    );
    console.log(
      `[paper-cael-replay-benchmark] -verify med=${result.variants.minusVerify.medianUs.toFixed(2)}us ` +
        `p99=${result.variants.minusVerify.p99Us.toFixed(2)}us`
    );
    console.log(
      `[paper-cael-replay-benchmark] baseline med=${result.variants.baseline.medianUs.toFixed(2)}us ` +
        `p99=${result.variants.baseline.p99Us.toFixed(2)}us`
    );
    if (artifact) console.log(`[paper-cael-replay-benchmark] artifact=${artifact}`);

    expect(result.variants.full.tpRate).toBe(1);
    expect(result.variants.full.falsePositiveRate).toBe(0);
    expect(result.variants.minusVerify.tpRate).toBe(0);
    expect(result.variants.baseline.tpRate).toBe(0);
  }, 120_000);
});
