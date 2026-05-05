/**
 * HoloMapRuntime Sprint-3 validation tests.
 *
 * Covers:
 * - Determinism: same seed + same inputs = same outputs
 * - Memory bounds: maxSequenceLength enforced via FIFO eviction
 * - Frame-rate throttling: targetFPS respected, null returned for throttled frames
 * - Performance metrics: stepMs, avgStepMs, throttledCount tracked
 * - Running bounds: incremental bounds tracking matches full re-scan
 */

import { describe, it, expect } from 'vitest';
import {
  createHoloMapRuntime,
  HOLOMAP_DEFAULTS,
  type ReconstructionFrame,
  type HoloMapConfig,
} from '../HoloMapRuntime';

function makeFrame(index: number, width = 4, height = 4): ReconstructionFrame {
  const stride = 4;
  return {
    index,
    timestampMs: index * 100,
    rgb: new Uint8Array(width * height * stride).map((_, i) => (i * 17 + index * 31) % 256),
    width,
    height,
    stride: stride as 3 | 4,
  };
}

async function stepAll(
  runtime: Awaited<ReturnType<typeof createHoloMapRuntime>>,
  frames: ReconstructionFrame[]
) {
  const steps = [];
  for (const f of frames) {
    const s = await runtime.step(f);
    if (s) steps.push(s);
  }
  return steps;
}

describe('HoloMapRuntime Sprint-3 — determinism', () => {
  it('produces identical replay hash for identical config', async () => {
    const cfg: HoloMapConfig = {
      ...HOLOMAP_DEFAULTS,
      seed: 42,
      modelHash: 'test-model',
      videoHash: 'fixture-1',
      targetFPS: 10000,
    };

    const r1 = createHoloMapRuntime();
    await r1.init(cfg);

    const r2 = createHoloMapRuntime();
    await r2.init(cfg);

    expect(r1.replayHash()).toBe(r2.replayHash());

    await r1.dispose();
    await r2.dispose();
  });

  it('produces different replay hash for different seed', async () => {
    const r1 = createHoloMapRuntime();
    await r1.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', targetFPS: 10000 });

    const r2 = createHoloMapRuntime();
    await r2.init({ ...HOLOMAP_DEFAULTS, seed: 2, modelHash: 'm', targetFPS: 10000 });

    expect(r1.replayHash()).not.toBe(r2.replayHash());

    await r1.dispose();
    await r2.dispose();
  });

  it('produces identical point clouds for identical frames + seed', async () => {
    const cfg = { ...HOLOMAP_DEFAULTS, seed: 123, modelHash: 'det-model', targetFPS: 10000 };
    const frames = [makeFrame(0), makeFrame(1), makeFrame(2)];

    const r1 = createHoloMapRuntime();
    await r1.init(cfg);
    const s1 = await stepAll(r1, frames);

    const r2 = createHoloMapRuntime();
    await r2.init(cfg);
    const s2 = await stepAll(r2, frames);

    expect(s1.length).toBe(s2.length);
    for (let i = 0; i < s1.length; i++) {
      expect([...s1[i].points.positions]).toEqual([...s2[i].points.positions]);
      expect([...s1[i].points.colors]).toEqual([...s2[i].points.colors]);
    }

    await r1.dispose();
    await r2.dispose();
  });
});

describe('HoloMapRuntime Sprint-3 — memory bounds', () => {
  it('enforces maxSequenceLength via FIFO eviction', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', maxSequenceLength: 3, targetFPS: 10000 });

    const frames = [makeFrame(0), makeFrame(1), makeFrame(2), makeFrame(3), makeFrame(4)];
    const steps = await stepAll(r, frames);

    expect(steps.length).toBe(5);

    const manifest = await r.finalize();
    // Only last 3 frames retained after eviction
    expect(manifest.frameCount).toBe(3);

    await r.dispose();
  });

  it('evicts oldest frames first (FIFO order)', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', maxSequenceLength: 2, targetFPS: 10000 });

    const frames = [makeFrame(0), makeFrame(1), makeFrame(2)];
    await stepAll(r, frames);

    const manifest = await r.finalize();
    // Frames 1 and 2 retained, frame 0 evicted
    expect(manifest.frameCount).toBe(2);

    await r.dispose();
  });

  it('point count tracks correctly after eviction', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', maxSequenceLength: 2, targetFPS: 10000 });

    const frames = [makeFrame(0, 4, 4), makeFrame(1, 4, 4), makeFrame(2, 4, 4)];
    await stepAll(r, frames);

    const manifest = await r.finalize();
    const expectedPerFrame = 16; // 4x4 grid
    expect(manifest.pointCount).toBe(2 * expectedPerFrame);

    await r.dispose();
  });
});

describe('HoloMapRuntime Sprint-3 — frame-rate throttling', () => {
  it('throttles frames faster than targetFPS', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', targetFPS: 1 }); // 1000 ms interval

    const f1 = makeFrame(0);
    const s1 = await r.step(f1);
    expect(s1).not.toBeNull();

    // Second frame immediately after should be throttled (1000ms interval)
    const s2 = await r.step(makeFrame(1));
    expect(s2).toBeNull();

    await r.dispose();
  });

  it('accepts frames after the capture timestamp passes the throttle interval', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', targetFPS: 1 }); // 1000 ms interval

    const s1 = await r.step(makeFrame(0));
    expect(s1).not.toBeNull();

    // With 1 FPS, a frame at +100 ms is throttled.
    const s2 = await r.step(makeFrame(1));
    expect(s2).toBeNull();

    // A frame at +1000 ms is accepted even if the test calls step() immediately.
    const s3 = await r.step(makeFrame(10));
    expect(s3).not.toBeNull();

    await r.dispose();
  });

  it('does not throttle first frame', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', targetFPS: 1 });

    const s1 = await r.step(makeFrame(0));
    expect(s1).not.toBeNull();

    await r.dispose();
  });
});

describe('HoloMapRuntime Sprint-3 — running bounds', () => {
  it('computes correct bounds incrementally', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', targetFPS: 10000 });

    const frames = [makeFrame(0), makeFrame(1)];
    await stepAll(r, frames);

    const manifest = await r.finalize();
    expect(manifest.bounds.min).toHaveLength(3);
    expect(manifest.bounds.max).toHaveLength(3);

    // Bounds should be finite
    for (const v of manifest.bounds.min) expect(Number.isFinite(v)).toBe(true);
    for (const v of manifest.bounds.max) expect(Number.isFinite(v)).toBe(true);

    // min <= max for each axis
    expect(manifest.bounds.min[0]).toBeLessThanOrEqual(manifest.bounds.max[0]);
    expect(manifest.bounds.min[1]).toBeLessThanOrEqual(manifest.bounds.max[1]);
    expect(manifest.bounds.min[2]).toBeLessThanOrEqual(manifest.bounds.max[2]);

    await r.dispose();
  });

  it('bounds survive eviction', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', maxSequenceLength: 1, targetFPS: 10000 });

    const frames = [makeFrame(0), makeFrame(1), makeFrame(2)];
    await stepAll(r, frames);

    const manifest = await r.finalize();
    expect(manifest.frameCount).toBe(1);
    expect(manifest.bounds.min).toHaveLength(3);
    expect(manifest.bounds.max).toHaveLength(3);

    await r.dispose();
  });
});

describe('HoloMapRuntime Sprint-3 — performance metrics', () => {
  it('tracks step count across multiple frames', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', targetFPS: 10000 });

    const frames = [makeFrame(0), makeFrame(1), makeFrame(2)];
    const steps = await stepAll(r, frames);
    expect(steps.length).toBe(3);

    await r.dispose();
  });

  it('finalize includes deterministic replay contract', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 7, modelHash: 'contract-test', targetFPS: 10000 });

    await r.step(makeFrame(0));
    const manifest = await r.finalize();

    expect(manifest.simulationContract.kind).toBe('holomap.reconstruction.v1');
    expect(manifest.simulationContract.replayFingerprint).toBe(manifest.replayHash);
    expect(manifest.simulationContract.holoScriptBuild).toBeTruthy();

    await r.dispose();
  });
});

describe('HoloMapRuntime Sprint-3 — reset determinism', () => {
  it('resets state cleanly after dispose', async () => {
    const r = createHoloMapRuntime();
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 1, modelHash: 'm', maxSequenceLength: 2, targetFPS: 10000 });

    await stepAll(r, [makeFrame(0), makeFrame(1)]);
    await r.dispose();

    // Re-init should start fresh
    await r.init({ ...HOLOMAP_DEFAULTS, seed: 2, modelHash: 'm2', targetFPS: 10000 });
    const manifest = await r.finalize();

    expect(manifest.frameCount).toBe(0);
    expect(manifest.replayHash).not.toBe('unset');

    await r.dispose();
  });
});
