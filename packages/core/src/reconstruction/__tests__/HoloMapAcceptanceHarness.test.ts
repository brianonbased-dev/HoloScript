import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHoloMapRuntime, HOLOMAP_DEFAULTS, type ReconstructionFrame } from '../HoloMapRuntime';

type TimingStats = { p50: number; p99: number; samples: number[] };

function buildFrame(index: number): ReconstructionFrame {
  return {
    index,
    timestampMs: index * 33,
    width: 2,
    height: 2,
    stride: 4,
    rgb: new Uint8Array([
      10 + index,
      20 + index,
      30 + index,
      255,
      40 + index,
      50 + index,
      60 + index,
      255,
      70 + index,
      80 + index,
      90 + index,
      255,
      100 + index,
      110 + index,
      120 + index,
      255,
    ]),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[idx] ?? 0;
}

function summarizeTimings(samples: number[]): TimingStats {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p99: percentile(sorted, 0.99),
    samples,
  };
}

function normalizeManifest(manifest: Awaited<ReturnType<ReturnType<typeof createHoloMapRuntime>['finalize']>>) {
  return {
    ...manifest,
    provenance: {
      ...manifest.provenance,
      capturedAtIso: '<captured-at>',
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HoloMap acceptance harness', () => {
  it('loads verified weights and produces deterministic manifests with timing stats', async () => {
    const weightBytes = new TextEncoder().encode('holomap-acceptance-weight-fixture');
    const weightCid = createHash('sha256').update(weightBytes).digest('hex');

    const fetchMock = vi.fn(async () => new Response(weightBytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const runHarness = async () => {
      const runtime = createHoloMapRuntime();
      await runtime.init({
        ...HOLOMAP_DEFAULTS,
        seed: 123,
        modelHash: 'acceptance-model-v1',
        videoHash: 'acceptance-video-fixture',
        weightCid,
        weightUrl: 'https://example.invalid/holomap-weights.bin',
      });

      const timings: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const frame = buildFrame(i);
        const start = performance.now();
        const step = await runtime.step(frame);
        const end = performance.now();
        timings.push(end - start);
        expect(step.pose.position.length).toBe(3);
        expect(step.points.positions.length).toBeGreaterThan(0);
      }

      const manifest = await runtime.finalize();
      const replayHash = runtime.replayHash();
      await runtime.dispose();

      return {
        manifest,
        replayHash,
        stats: summarizeTimings(timings),
      };
    };

    const runA = await runHarness();
    const runB = await runHarness();

    expect(fetchMock).toHaveBeenCalled();
    expect(runA.replayHash).toBe(runB.replayHash);
    expect(normalizeManifest(runA.manifest)).toEqual(normalizeManifest(runB.manifest));

    expect(runA.manifest.pointCount).toBeGreaterThan(0);
    expect(runA.manifest.frameCount).toBe(12);
    expect(runA.manifest.provenance.anchorHash).toBe(`self-attested:${runA.replayHash}`);

    expect(runA.stats.p50).toBeGreaterThanOrEqual(0);
    expect(runA.stats.p99).toBeGreaterThanOrEqual(runA.stats.p50);
    expect(runA.stats.samples).toHaveLength(12);
  });
});
