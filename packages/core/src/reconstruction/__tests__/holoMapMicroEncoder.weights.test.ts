import { describe, it, expect } from 'vitest';
import {
  serializeMicroWeights,
  deserializeMicroWeights,
  runHoloMapMicroEncoderCpu,
  type HoloMapMicroWeights,
  type HoloMapMicroFrame,
} from '../holoMapMicroEncoder';

// Encoder geometry (mirrors holoMapMicroEncoder constants).
const EMBED = 32;
const PATCH = 14 * 14 * 3; // 588
const EXPECTED_BYTES = 8 + (EMBED * PATCH + 3 * EMBED * EMBED + EMBED * 3 + 4 * EMBED) * 4;

function ramp(n: number, base: number): Float32Array {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i += 1) a[i] = base + i * 1e-4;
  return a;
}

function makeWeights(): HoloMapMicroWeights {
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

function gradientFrame(): HoloMapMicroFrame {
  const w = 8;
  const h = 8;
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0; i < rgb.length; i += 1) rgb[i] = (i * 7) % 256;
  return { index: 0, rgb, width: w, height: h, stride: 3 };
}

describe('holoMapMicroEncoder checkpoint (de)serialization', () => {
  it('round-trips all 9 tensors exactly', () => {
    const w = makeWeights();
    const bytes = serializeMicroWeights(w);
    expect(bytes.byteLength).toBe(EXPECTED_BYTES);
    const back = deserializeMicroWeights(bytes);
    expect(back).not.toBeNull();
    for (const key of Object.keys(w) as (keyof HoloMapMicroWeights)[]) {
      expect(Array.from(back![key])).toEqual(Array.from(w[key]));
    }
  });

  it('rejects a blob of the wrong length', () => {
    expect(deserializeMicroWeights(new Uint8Array(10))).toBeNull();
  });

  it('rejects a right-length blob with a bad magic', () => {
    expect(deserializeMicroWeights(new Uint8Array(EXPECTED_BYTES))).toBeNull();
  });
});

describe('holoMapMicroEncoder weight wiring (the loader↔encoder fix)', () => {
  it('consumes valid checkpoint bytes — output differs from PRNG weights', async () => {
    const frame = gradientFrame();
    const cfg = { seed: 7, modelHash: 'wiring-test' };

    const prng = await runHoloMapMicroEncoderCpu(frame, cfg);
    const ckpt = serializeMicroWeights(makeWeights());
    const real = await runHoloMapMicroEncoderCpu(frame, { ...cfg, weightBytes: ckpt });

    expect(prng).toHaveLength(3);
    expect(real).toHaveLength(3);
    // The whole point of the fix: supplying real weights actually changes output.
    expect(Array.from(real)).not.toEqual(Array.from(prng));
  });

  it('falls back to PRNG when the checkpoint blob is malformed', async () => {
    const frame = gradientFrame();
    const cfg = { seed: 7, modelHash: 'wiring-test' };

    const prng = await runHoloMapMicroEncoderCpu(frame, cfg);
    const fallback = await runHoloMapMicroEncoderCpu(frame, {
      ...cfg,
      weightBytes: new Uint8Array(10), // not a valid HMW1 blob
    });
    expect(Array.from(fallback)).toEqual(Array.from(prng));
  });
});
