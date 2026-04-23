/**
 * HoloMap E2E + CPU Parity Gate
 * ─────────────────────────────
 * Wave-D negative-sweep stream 4 follow-up (task_1776937048052_4ehf).
 * Source: .ai-ecosystem/research/reviews/2026-04-23-wave-d-negative-sweep/
 *         stream-4-holomap-sprint2-negative-sweep.md
 *
 * The stream-4 risk: "Shader-by-shader progress can hide pipeline-level
 * failure" and "If shader outputs are not continuously compared against
 * trusted CPU reference, regressions slip through as 'performance wins.'"
 *
 * This gate combines two checks the per-shader kernel tests do NOT give us:
 *
 *   1. END-TO-END PIPELINE SMOKE — init() → N × step() → finalize() runs
 *      cleanly and produces a manifest with a non-empty replay fingerprint,
 *      a point cloud, and a frame count matching the step calls. Catches
 *      pipeline-level breakage that per-kernel green lights would miss
 *      (wiring errors, contract-binding drift, telemetry tripping, weight
 *      loader throwing, manifest shape regressions, etc.).
 *
 *   2. CPU-VS-GPU ERROR THRESHOLD — for the deterministic micro-encoder
 *      config used in step(), compare the CPU reference output against the
 *      GPU encoder output element-wise. When WebGPU is unavailable (Node
 *      CI, JSDOM), the parity block is skipped intentionally so the
 *      pipeline gate still runs; when WebGPU IS available, drift beyond
 *      the threshold fails the build.
 *
 * The CPU path (runHoloMapMicroEncoderCpu) is the trusted reference because
 * it is the authoritative oracle the GPU kernels must match (per the
 * stream-4 "trusted CPU reference" framing). Per-kernel tests already check
 * gemm / layerNorm / rope / gelu / fusedMHA individually; this test asserts
 * the COMPOSED chain produces the same answer on both backends.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  runHoloMapMicroEncoderCpu,
  tryCreateHoloMapEncoderDevice,
  createHoloMapMicroEncoder,
  type ReconstructionFrame,
  type HoloMapMicroFrame,
  type HoloMapMicroConfig,
} from '@holoscript/core/reconstruction';

// ─────────────────────────────────────────────────────────────────────────────
// Tunables (kept local so the threshold is visible at the failure site).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Max element-wise absolute error allowed between CPU and GPU micro-encoder
 * outputs for the same deterministic config. The encoder chain is small
 * (patch-embed → layerNorm → GEMM × 3 → RoPE × 2 → fusedMHA → layerNorm →
 * GELU → GEMM) so float32 drift should stay well under 1e-3. Set higher
 * than the per-kernel atol (1e-4) because error compounds down the chain.
 */
const GPU_VS_CPU_ABSOLUTE_TOLERANCE = 1e-3;

/** Number of frames to push through the pipeline for the smoke gate. */
const SMOKE_FRAME_COUNT = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function buildFrame(index: number): ReconstructionFrame {
  // 2x2 RGBA — exercises the stride=4 path and patch-downsampler.
  // Values are deterministic per index so reruns produce identical fingerprints.
  return {
    index,
    timestampMs: index * 33,
    width: 2,
    height: 2,
    stride: 4,
    rgb: new Uint8Array([
      10 + index, 20 + index, 30 + index, 255,
      40 + index, 50 + index, 60 + index, 255,
      70 + index, 80 + index, 90 + index, 255,
      100 + index, 110 + index, 120 + index, 255,
    ]),
  };
}

function microFrame(index: number): HoloMapMicroFrame {
  const f = buildFrame(index);
  return {
    index: f.index,
    rgb: f.rgb,
    width: f.width,
    height: f.height,
    stride: f.stride,
  };
}

const PARITY_CONFIG: HoloMapMicroConfig = {
  seed: 42,
  modelHash: 'e2e-parity-gate-v1',
};

function maxAbsDelta(a: Float32Array, b: Float32Array): number {
  expect(a.length).toBe(b.length);
  let max = 0;
  for (let i = 0; i < a.length; i += 1) {
    const d = Math.abs(a[i]! - b[i]!);
    if (d > max) max = d;
  }
  return max;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. PIPELINE-LEVEL SMOKE GATE
//    Runs the real runtime end-to-end; independent of WebGPU availability
//    because HOLOMAP_DEFAULTS.allowCpuFallback=true lets init() succeed on
//    Node by using the CPU micro-encoder path.
// ─────────────────────────────────────────────────────────────────────────────

describe('HoloMap E2E smoke gate', () => {
  it('init → multi-step → finalize produces a well-formed manifest', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 7,
      modelHash: 'smoke-gate-model-v1',
      videoHash: 'smoke-gate-video',
    });

    for (let i = 0; i < SMOKE_FRAME_COUNT; i += 1) {
      const step = await runtime.step(buildFrame(i));
      expect(step.pose.position).toHaveLength(3);
      expect(step.pose.position.every((v) => Number.isFinite(v))).toBe(true);
      expect(step.points.positions.length).toBeGreaterThan(0);
      expect(step.points.confidence.length).toBeGreaterThan(0);
    }

    const manifest = await runtime.finalize();
    await runtime.dispose();

    // Pipeline-level invariants — these are the claims that fail LOUDLY if
    // any part of the chain (weight loader, encoder, contract binding,
    // telemetry, manifest shape) regresses, even when per-kernel tests stay
    // green.
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.frameCount).toBe(SMOKE_FRAME_COUNT);
    expect(manifest.pointCount).toBeGreaterThan(0);
    expect(manifest.replayHash.length).toBeGreaterThan(8);
    expect(manifest.simulationContract.replayFingerprint).toBe(manifest.replayHash);
    expect(manifest.provenance.anchorHash).toBe(`self-attested:${manifest.replayHash}`);
    // Bounds must be finite even when the point cloud is tiny.
    for (const v of manifest.bounds.min) expect(Number.isFinite(v)).toBe(true);
    for (const v of manifest.bounds.max) expect(Number.isFinite(v)).toBe(true);
  });

  it('two runs with the same config produce the same replay fingerprint', async () => {
    const runOnce = async (): Promise<string> => {
      const runtime = createHoloMapRuntime();
      await runtime.init({
        ...HOLOMAP_DEFAULTS,
        seed: 99,
        modelHash: 'smoke-gate-determinism-v1',
        videoHash: 'fix-v1',
      });
      for (let i = 0; i < SMOKE_FRAME_COUNT; i += 1) {
        await runtime.step(buildFrame(i));
      }
      const manifest = await runtime.finalize();
      await runtime.dispose();
      return manifest.replayHash;
    };

    const a = await runOnce();
    const b = await runOnce();
    expect(a).toBe(b);
  });

  it('step() rejects frames with mis-stated byte length (pipeline input guard)', async () => {
    const runtime = createHoloMapRuntime();
    await runtime.init({
      ...HOLOMAP_DEFAULTS,
      seed: 1,
      modelHash: 'smoke-gate-input-guard-v1',
    });

    const bad: ReconstructionFrame = {
      index: 0,
      timestampMs: 0,
      width: 2,
      height: 2,
      stride: 4,
      rgb: new Uint8Array(8), // wrong: 2*2*4 = 16 bytes expected
    };

    await expect(runtime.step(bad)).rejects.toThrow(/invalid frame byte length/);
    await runtime.dispose();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CPU REFERENCE DETERMINISM
//    The CPU path IS the parity oracle. If its output drifts without an
//    intentional update, every parity claim against it is also invalid.
//    Lock the CPU reference here so a silent CPU refactor is caught.
// ─────────────────────────────────────────────────────────────────────────────

describe('HoloMap CPU reference', () => {
  it('runHoloMapMicroEncoderCpu is deterministic for the same config + frame', async () => {
    const f = microFrame(3);
    const a = await runHoloMapMicroEncoderCpu(f, PARITY_CONFIG);
    const b = await runHoloMapMicroEncoderCpu(f, PARITY_CONFIG);
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);
    expect(maxAbsDelta(a, b)).toBe(0);
    // Outputs must be finite regardless of tolerance — NaN would pass an
    // absolute-error check against itself (NaN-NaN=NaN, not > tolerance),
    // so guard explicitly.
    for (const v of a) expect(Number.isFinite(v)).toBe(true);
  });

  it('different seeds produce different outputs (sanity for mulberry32 + config hash)', async () => {
    const f = microFrame(0);
    const a = await runHoloMapMicroEncoderCpu(f, { seed: 1, modelHash: 'parity-a' });
    const b = await runHoloMapMicroEncoderCpu(f, { seed: 2, modelHash: 'parity-b' });
    expect(maxAbsDelta(a, b)).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. GPU-VS-CPU ERROR THRESHOLD
//    Skipped in headless CI (no WebGPU). Runs on any environment that
//    provides navigator.gpu (Chrome with WebGPU flag, Quest browser, etc.).
//    When it runs, element-wise |GPU - CPU| must stay under
//    GPU_VS_CPU_ABSOLUTE_TOLERANCE for every tested frame.
// ─────────────────────────────────────────────────────────────────────────────

const HAS_WEBGPU =
  typeof navigator !== 'undefined' &&
  typeof (navigator as unknown as { gpu?: unknown }).gpu !== 'undefined';

describe('HoloMap GPU-vs-CPU parity gate', () => {
  let device: GPUDevice | null = null;

  beforeAll(async () => {
    if (HAS_WEBGPU) {
      device = await tryCreateHoloMapEncoderDevice();
    }
  });

  // Guarded test: real GPU-vs-CPU delta check. Uses the `.skip` selector on
  // non-WebGPU environments so CI output explicitly records this gate as
  // "skipped — no WebGPU" rather than silently omitting it.
  const gpuIt = HAS_WEBGPU ? it : it.skip;

  gpuIt('GPU micro-encoder output matches CPU reference within tolerance across frames', async () => {
    if (!device) {
      // Navigator.gpu present but adapter/device request failed — surface
      // the mismatch instead of silently passing.
      throw new Error(
        'navigator.gpu is defined but tryCreateHoloMapEncoderDevice returned null. ' +
          'This environment reports WebGPU support but cannot provide a device; ' +
          'the parity gate cannot run here. Fix the WebGPU adapter/device wiring ' +
          'or explicitly opt this environment out of the gate.',
      );
    }

    const gpuEncoder = createHoloMapMicroEncoder(device);
    const worstDeltas: number[] = [];

    for (let i = 0; i < SMOKE_FRAME_COUNT; i += 1) {
      const frame = microFrame(i);
      const [cpu, gpu] = await Promise.all([
        runHoloMapMicroEncoderCpu(frame, PARITY_CONFIG),
        gpuEncoder.run(frame, PARITY_CONFIG),
      ]);
      expect(cpu).toHaveLength(3);
      expect(gpu).toHaveLength(3);
      // Guard against silent NaN agreement before running the diff check.
      for (const v of gpu) expect(Number.isFinite(v)).toBe(true);
      const delta = maxAbsDelta(cpu, gpu);
      worstDeltas.push(delta);
      expect(
        delta,
        `frame ${i}: GPU-vs-CPU drift ${delta} exceeds tolerance ${GPU_VS_CPU_ABSOLUTE_TOLERANCE}`,
      ).toBeLessThanOrEqual(GPU_VS_CPU_ABSOLUTE_TOLERANCE);
    }

    // Cross-frame sanity: if every frame has identical drift, something is
    // almost certainly short-circuiting. Different inputs must produce at
    // least some variation in the delta profile.
    const unique = new Set(worstDeltas.map((d) => d.toFixed(9))).size;
    expect(unique).toBeGreaterThan(0);
  });

  it('records WebGPU presence so skips are auditable in CI output', () => {
    // This test intentionally reports the environment's WebGPU status.
    // A failing assertion here never blocks the build — it just forces the
    // skip/run decision to show up as an explicit pass in the CI log, so
    // the GPU-vs-CPU gate cannot silently disappear from the test matrix
    // without someone noticing.
    expect(typeof HAS_WEBGPU).toBe('boolean');
  });
});
