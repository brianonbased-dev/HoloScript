import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type ReconstructionFrame,
} from '../HoloMapRuntime';
import { serializeMicroWeights, type HoloMapMicroWeights } from '../holoMapMicroEncoder';

vi.mock('../holoMapWeightCache', () => ({
  getCachedWeightBlob: vi.fn(() => Promise.resolve(undefined)),
  putCachedWeightBlob: vi.fn(() => Promise.resolve()),
}));

type TimingStats = { p50: number; p99: number; samples: number[] };

// Encoder geometry mirrors holoMapMicroEncoder constants.
const EMBED = 32;
const PATCH = 14 * 14 * 3;

function ramp(n: number, base: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i += 1) a[i] = base + i * 1e-4;
  return a;
}

function makeAcceptanceWeights(): HoloMapMicroWeights {
  return {
    proj: ramp(EMBED * PATCH, 0.01),
    Wq: ramp(EMBED * EMBED, 0.02),
    Wk: ramp(EMBED * EMBED, 0.03),
    Wv: ramp(EMBED * EMBED, 0.04),
    Wxyz: ramp(EMBED * 3, 0.05),
    gamma1: ramp(EMBED, 1.0),
    beta1: ramp(EMBED, 0.1),
    gamma2: ramp(EMBED, 1.0),
    beta2: ramp(EMBED, 0.2),
  };
}

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

function buildDenseFrame(index: number): ReconstructionFrame {
  const width = 16;
  const height = 16;
  const stride = 4;
  const rgb = new Uint8Array(width * height * stride);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * stride;
      rgb[i] = (x * 11 + index) % 255;
      rgb[i + 1] = (y * 13 + index) % 255;
      rgb[i + 2] = ((x + y) * 7 + index) % 255;
      rgb[i + 3] = 255;
    }
  }
  return {
    index,
    timestampMs: index * 33,
    width,
    height,
    stride,
    rgb,
  };
}

function buildMeasuredPoseFrame(index: number): ReconstructionFrame {
  return {
    ...buildFrame(index),
    depth: new Float32Array([0.5, 0.5, 0.5, 0.5]),
    depthConfidence: new Float32Array([1, 1, 1, 1]),
    devicePose: {
      position: [index * 0.05, 0.25, 1.5],
      rotation: [0, 0, 0, 1],
      confidence: 0.99,
    },
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

function trajectoryRmseMeters(
  observed: Array<[number, number, number]>,
  expected: Array<[number, number, number]>
): number {
  if (observed.length !== expected.length) {
    throw new Error(
      `trajectory length mismatch: observed=${observed.length} expected=${expected.length}`
    );
  }
  let squared = 0;
  for (let i = 0; i < observed.length; i += 1) {
    const a = observed[i]!;
    const b = expected[i]!;
    squared += (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  }
  return Math.sqrt(squared / Math.max(1, observed.length));
}

function normalizeManifest(
  manifest: Awaited<ReturnType<ReturnType<typeof createHoloMapRuntime>['finalize']>>
) {
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
  it('refuses dense-proof mode without a verified checkpoint', async () => {
    const runtime = createHoloMapRuntime();

    await expect(
      runtime.init({
        ...HOLOMAP_DEFAULTS,
        seed: 123,
        modelHash: 'acceptance-model-v1',
        videoHash: 'acceptance-video-fixture',
        reconstructionMode: 'dense-proof',
        targetFPS: 10000,
      })
    ).rejects.toThrow(/requires weightCid, weightUrl or localResolver/);
  });

  it('consumes local verified weights and raises density in dense-proof mode', async () => {
    const weightBytes = serializeMicroWeights(makeAcceptanceWeights());
    const weightCid = createHash('sha256').update(weightBytes).digest('hex');
    const weightBuffer = weightBytes.buffer.slice(
      weightBytes.byteOffset,
      weightBytes.byteOffset + weightBytes.byteLength
    ) as ArrayBuffer;
    const localResolver = vi.fn(async () => weightBuffer);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 123,
      modelHash: 'acceptance-model-v1',
      videoHash: 'acceptance-video-fixture',
      reconstructionMode: 'dense-proof',
      weightCid,
      localResolver,
      targetFPS: 10000,
    });

    const step = await runtime.step(buildDenseFrame(0));
    const manifest = await runtime.finalize();
    await runtime.dispose();

    expect(localResolver).toHaveBeenCalledWith(weightCid);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(step!.points.positions).toHaveLength(16 * 16 * 3);
    expect(manifest.pointCount).toBe(16 * 16);
    expect(manifest.reconstruction).toMatchObject({
      mode: 'dense-proof',
      modelHash: 'acceptance-model-v1',
      tileGrid: 16,
      weightCid,
      weightLoadedBytes: weightBytes.byteLength,
      weightVerified: true,
      weightSource: 'file',
    });
  });

  it('loads verified weights and produces deterministic manifests with timing stats', async () => {
    const weightBytes = serializeMicroWeights(makeAcceptanceWeights());
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
        targetFPS: 10000, // disable throttling for deterministic acceptance test
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

  it('changes the accepted reconstruction when real checkpoint weights are supplied', async () => {
    const weightBytes = serializeMicroWeights(makeAcceptanceWeights());
    const weightCid = createHash('sha256').update(weightBytes).digest('hex');
    const fetchMock = vi.fn(async () => new Response(weightBytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const runHarness = async (withWeights: boolean) => {
      const runtime = createHoloMapRuntime();
      await runtime.init({
        ...HOLOMAP_DEFAULTS,
        seed: 123,
        modelHash: 'acceptance-model-v1',
        videoHash: 'acceptance-video-fixture',
        ...(withWeights
          ? {
              weightCid,
              weightUrl: 'https://example.invalid/holomap-weights.bin',
            }
          : {}),
        targetFPS: 10000,
      });

      let firstPositions: number[] = [];
      for (let i = 0; i < 12; i += 1) {
        const step = await runtime.step(buildFrame(i));
        if (i === 0) firstPositions = Array.from(step!.points.positions);
      }

      const replayHash = runtime.replayHash();
      await runtime.dispose();
      return { firstPositions, replayHash };
    };

    const realWeights = await runHarness(true);
    const prngWeights = await runHarness(false);
    expect(realWeights.firstPositions.length).toBeGreaterThan(0);
    expect(prngWeights.firstPositions).toHaveLength(realWeights.firstPositions.length);

    const maxPositionDelta = Math.max(
      ...realWeights.firstPositions.map((value, i) =>
        Math.abs(value - (prngWeights.firstPositions[i] ?? value))
      )
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(realWeights.replayHash).not.toBe(prngWeights.replayHash);
    expect(maxPositionDelta).toBeGreaterThan(1e-6);
  });

  it('loads real checkpoint weights through the runtime local resolver before fetch', async () => {
    const weightBytes = serializeMicroWeights(makeAcceptanceWeights());
    const weightCid = createHash('sha256').update(weightBytes).digest('hex');
    const weightBuffer = weightBytes.buffer.slice(
      weightBytes.byteOffset,
      weightBytes.byteOffset + weightBytes.byteLength
    ) as ArrayBuffer;
    const localResolver = vi.fn(async () => weightBuffer);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 123,
      modelHash: 'acceptance-model-v1',
      videoHash: 'acceptance-video-fixture',
      weightCid,
      weightUrl: 'https://example.invalid/holomap-weights.bin',
      localResolver,
      targetFPS: 10000,
    });

    const step = await runtime.step(buildFrame(0));
    await runtime.dispose();

    expect(localResolver).toHaveBeenCalledWith(weightCid);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(step!.points.positions.length).toBeGreaterThan(0);
  });

  it('matches a COLMAP-style measured-pose trajectory under real weights', async () => {
    const weightBytes = serializeMicroWeights(makeAcceptanceWeights());
    const weightCid = createHash('sha256').update(weightBytes).digest('hex');
    const fetchMock = vi.fn(async () => new Response(weightBytes, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 123,
      modelHash: 'acceptance-model-v1',
      videoHash: 'acceptance-video-fixture',
      weightCid,
      weightUrl: 'https://example.invalid/holomap-weights.bin',
      targetFPS: 10000,
    });

    const expected: Array<[number, number, number]> = [];
    const observed: Array<[number, number, number]> = [];
    for (let i = 0; i < 24; i += 1) {
      const frame = buildMeasuredPoseFrame(i);
      const step = await runtime.step(frame);
      expected.push([...frame.devicePose!.position]);
      observed.push([...step.pose.position]);
      expect(step.pose.confidence).toBeCloseTo(0.99, 5);
      expect(step.points.positions.length).toBeGreaterThan(0);
    }

    const relAteMeters = trajectoryRmseMeters(observed, expected);
    const manifest = await runtime.finalize();
    await runtime.dispose();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(relAteMeters).toBeLessThan(1e-9);
    expect(manifest.pointCount).toBeGreaterThan(0);
    expect(manifest.frameCount).toBe(24);
  });
});
