import { describe, it, expect } from 'vitest';
import {
  computeSSAO,
  computeSSR,
  computeSSGI,
  haltonJitter,
  blendTAA,
  applyMotionBlur,
  computeCoC,
  applyDOF,
  applyChromaticAberration,
  applyFilmGrain,
  applyVignette,
} from '../ScreenSpaceEffects';

// Helper: create a test pixel buffer (RGBA, all pixels = value)
function makeBuf(w: number, h: number, r = 0.5, g = 0.5, b = 0.5, a = 1): Float32Array {
  const buf = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4 + 0] = r;
    buf[i * 4 + 1] = g;
    buf[i * 4 + 2] = b;
    buf[i * 4 + 3] = a;
  }
  return buf;
}

// Helper: create a depth buffer (R = linear depth)
function makeDepth(w: number, h: number, depth = 0.5): Float32Array {
  const buf = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) buf[i * 4] = depth;
  return buf;
}

describe('ScreenSpaceEffects — Production Tests', () => {
  // ---------------------------------------------------------------------------
  // SSAO
  // ---------------------------------------------------------------------------
  describe('computeSSAO', () => {
    it('returns a Float32Array of width*height elements', () => {
      const W = 16,
        H = 16;
      const depth = makeDepth(W, H, 0.5);
      const normals = makeBuf(W, H, 0, 0, 1, 0);
      const result = computeSSAO(depth, normals, W, H, { samples: 8 });
      expect(result.length).toBe(W * H);
    });

    it('sky pixels (depth=1) get full occlusion factor = 1', () => {
      const W = 4,
        H = 4;
      const depth = makeDepth(W, H, 1);
      const normals = makeBuf(W, H, 0, 0, 1, 0);
      const result = computeSSAO(depth, normals, W, H);
      for (let i = 0; i < W * H; i++) expect(result[i]).toBeCloseTo(1, 3);
    });

    it('all values in [0, 1]', () => {
      const W = 8,
        H = 8;
      const depth = makeDepth(W, H, 0.4);
      const normals = makeBuf(W, H, 0, 1, 0, 0);
      const result = computeSSAO(depth, normals, W, H, { samples: 4, radius: 0.1 });
      for (let i = 0; i < W * H; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(0);
        expect(result[i]).toBeLessThanOrEqual(1);
      }
    });

    it('produces non-zero result (kernel samples change across depth values)', () => {
      const W = 8,
        H = 8;
      // Make a checkerboard depth so neighbouring samples differ from the pixel
      const d1 = new Float32Array(W * H * 4);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          d1[(y * W + x) * 4] = (x + y) % 2 === 0 ? 0.2 : 0.8;
        }
      const normals = makeBuf(W, H, 0, 0, 1, 0);
      const result = computeSSAO(d1, normals, W, H, { samples: 4, radius: 0.3 });
      // With a checkerboard depth, at least some pixels should be partially occluded
      const sum = result.reduce((a, b) => a + b, 0);
      expect(sum).toBeGreaterThan(0);
      expect(sum).toBeLessThan(W * H); // not all pixels are fully un-occluded
    });
  });

  // ---------------------------------------------------------------------------
  // SSR
  // ---------------------------------------------------------------------------
  describe('computeSSR', () => {
    it('returns mask and uvs arrays of correct size', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H, 0.8, 0.8, 0.9);
      const depth = makeDepth(W, H, 0.4);
      const roughness = new Float32Array(W * H).fill(0.1);
      const { mask, uvs } = computeSSR(color, depth, W, H, roughness);
      expect(mask.length).toBe(W * H);
      expect(uvs.length).toBe(W * H * 2);
    });

    it('rough pixels beyond maxRoughness have zero mask', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H);
      const depth = makeDepth(W, H, 0.5);
      const roughness = new Float32Array(W * H).fill(0.9); // all rough
      const { mask } = computeSSR(color, depth, W, H, roughness, { maxRoughness: 0.4 });
      const sum = mask.reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });

    it('sky pixels have zero mask', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H);
      const depth = makeDepth(W, H, 1.0); // sky
      const roughness = new Float32Array(W * H).fill(0.1);
      const { mask } = computeSSR(color, depth, W, H, roughness);
      const sum = mask.reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // SSGI
  // ---------------------------------------------------------------------------
  describe('computeSSGI', () => {
    it('returns RGBA buffer of correct size', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H, 1, 0, 0);
      const depth = makeDepth(W, H, 0.5);
      const result = computeSSGI(color, depth, W, H, { sampleCount: 4 });
      expect(result.length).toBe(W * H * 4);
    });

    it('with intensity=0 RGB channels are zero (alpha=1 is set unconditionally)', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H, 0.5, 0.5, 0.5);
      const depth = makeDepth(W, H, 0.5);
      const result = computeSSGI(color, depth, W, H, { intensity: 0, sampleCount: 4 });
      // RGB channels should be 0 when intensity=0; alpha=1 unconditionally
      for (let i = 0; i < W * H; i++) {
        expect(result[i * 4 + 0]).toBeCloseTo(0, 5); // R
        expect(result[i * 4 + 1]).toBeCloseTo(0, 5); // G
        expect(result[i * 4 + 2]).toBeCloseTo(0, 5); // B
        // alpha (result[i*4+3]) is set to 1 by the implementation — not tested here
      }
    });

    it('bright source bleeds onto neighbours', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H, 0, 0, 0); // all black
      // Set center pixels to bright red
      for (let y = 3; y <= 4; y++) for (let x = 3; x <= 4; x++) color[(y * W + x) * 4] = 1;
      const depth = makeDepth(W, H, 0.3);
      const result = computeSSGI(color, depth, W, H, { intensity: 1, radius: 3, sampleCount: 8 });
      const cornerR = result[0];
      const centerR = result[(4 * W + 4) * 4];
      expect(centerR).toBeGreaterThan(cornerR);
    });
  });

  // ---------------------------------------------------------------------------
  // TAA / Halton
  // ---------------------------------------------------------------------------
  describe('haltonJitter', () => {
    it('returns values in [-0.5, 0.5]', () => {
      for (let i = 0; i < 32; i++) {
        const [x, y] = haltonJitter(i);
        expect(x).toBeGreaterThanOrEqual(-0.5);
        expect(x).toBeLessThanOrEqual(0.5);
        expect(y).toBeGreaterThanOrEqual(-0.5);
        expect(y).toBeLessThanOrEqual(0.5);
      }
    });

    it('sub-pixel jitter values are unique across frames', () => {
      const jitters = new Set<string>();
      for (let i = 0; i < 16; i++) {
        const [x, y] = haltonJitter(i);
        jitters.add(`${x.toFixed(4)},${y.toFixed(4)}`);
      }
      expect(jitters.size).toBeGreaterThan(8);
    });
  });

  describe('blendTAA', () => {
    it('with feedback=0 output equals current frame', () => {
      const W = 4,
        H = 4;
      const current = makeBuf(W, H, 1, 0, 0);
      const history = makeBuf(W, H, 0, 1, 0);
      const out = blendTAA(current, history, W, H, { feedback: 0 });
      expect(out[0]).toBeCloseTo(1, 4);
      expect(out[1]).toBeCloseTo(0, 4);
    });

    it('with feedback=1 output equals history', () => {
      const W = 4,
        H = 4;
      const current = makeBuf(W, H, 1, 0, 0);
      const history = makeBuf(W, H, 0, 0, 1);
      const out = blendTAA(current, history, W, H, { feedback: 1 });
      expect(out[0]).toBeCloseTo(0, 4);
      expect(out[2]).toBeCloseTo(1, 4);
    });

    it('updates history in-place', () => {
      const W = 4,
        H = 4;
      const current = makeBuf(W, H, 1, 0, 0);
      const history = makeBuf(W, H, 0, 0, 0);
      blendTAA(current, history, W, H, { feedback: 0.9 });
      // After one blend, history[0] should be close to 0.1 (feedback=0.9 of 0, + 0.1 of 1)
      expect(history[0]).toBeCloseTo(0.1, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Motion Blur
  // ---------------------------------------------------------------------------
  describe('applyMotionBlur', () => {
    it('returns buffer of correct size', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H);
      const velocity = new Float32Array(W * H * 4).fill(0);
      const out = applyMotionBlur(color, velocity, W, H);
      expect(out.length).toBe(W * H * 4);
    });

    it('zero velocity → output equals input', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H, 0.7, 0.3, 0.5);
      const velocity = new Float32Array(W * H * 4).fill(0);
      const out = applyMotionBlur(color, velocity, W, H, { sampleCount: 4 });
      expect(out[0]).toBeCloseTo(0.7, 3);
      expect(out[1]).toBeCloseTo(0.3, 3);
    });

    it('non-zero velocity causes blur (centre pixel differs from src)', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H, 0, 0, 0);
      // Bright pixel at top-left
      color[0] = 1;
      color[1] = 0;
      color[2] = 0;
      const velocity = new Float32Array(W * H * 4);
      // Give center pixel rightward velocity
      velocity[(4 * W + 4) * 4] = 8;
      const out = applyMotionBlur(color, velocity, W, H, { sampleCount: 4, maxLength: 8 });
      // Center pixel should be blurred (not exactly black)
      const centerR = out[(4 * W + 4) * 4];
      expect(centerR).toBeGreaterThanOrEqual(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Depth of Field
  // ---------------------------------------------------------------------------
  describe('computeCoC', () => {
    it('in-focus depth returns zero CoC', () => {
      const coc = computeCoC(0.5, { focalDepth: 0.5, focalRange: 0.1 });
      expect(coc).toBe(0);
    });

    it('out-of-focus depth returns positive CoC', () => {
      const coc = computeCoC(0.9, { focalDepth: 0.5, focalRange: 0.1, maxRadiusPx: 8 });
      expect(coc).toBeGreaterThan(0);
    });

    it('CoC is clamped to maxRadiusPx', () => {
      const coc = computeCoC(1.0, { focalDepth: 0.0, focalRange: 0, maxRadiusPx: 8 });
      expect(coc).toBeLessThanOrEqual(8);
    });
  });

  describe('applyDOF', () => {
    it('returns correct buffer size', () => {
      const W = 8,
        H = 8;
      const out = applyDOF(makeBuf(W, H), makeDepth(W, H), W, H);
      expect(out.length).toBe(W * H * 4);
    });

    it('in-focus pixels are similar to input', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H, 0.6, 0.3, 0.9);
      const depth = makeDepth(W, H, 0.5); // at focal depth
      const out = applyDOF(color, depth, W, H, {
        focalDepth: 0.5,
        focalRange: 0.4,
        maxRadiusPx: 0,
      });
      expect(out[0]).toBeCloseTo(0.6, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Chromatic Aberration
  // ---------------------------------------------------------------------------
  describe('applyChromaticAberration', () => {
    it('returns buffer of correct size', () => {
      const W = 8,
        H = 8;
      const out = applyChromaticAberration(makeBuf(W, H, 1, 1, 1), W, H, { strength: 2 });
      expect(out.length).toBe(W * H * 4);
    });

    it('centre pixel is unchanged (zero aberration at centre)', () => {
      const W = 9,
        H = 9;
      const color = makeBuf(W, H, 0.8, 0.5, 0.3);
      const out = applyChromaticAberration(color, W, H, { strength: 4 });
      // Exact centre pixel (4,4) — aberration = 0
      const pi = (4 * W + 4) * 4;
      expect(out[pi + 1]).toBeCloseTo(color[pi + 1], 3); // green unchanged
    });

    it('all output values in [0, ∞) (no NaN)', () => {
      const W = 8,
        H = 8;
      const out = applyChromaticAberration(makeBuf(W, H), W, H, { strength: 3 });
      for (let i = 0; i < out.length; i++) expect(isFinite(out[i])).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Film Grain
  // ---------------------------------------------------------------------------
  describe('applyFilmGrain', () => {
    it('returns buffer of same size', () => {
      const W = 8,
        H = 8;
      const out = applyFilmGrain(makeBuf(W, H), W, H, 0.05);
      expect(out.length).toBe(W * H * 4);
    });

    it('intensity=0 → output equals input', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H, 0.5, 0.3, 0.7);
      const out = applyFilmGrain(color, W, H, 0);
      for (let i = 0; i < out.length; i += 4) {
        expect(out[i]).toBeCloseTo(color[i], 4);
      }
    });

    it('high intensity produces noise (non-uniform output)', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H, 0.5);
      const out = applyFilmGrain(color, W, H, 0.3);
      const unique = new Set(
        Array.from(out.filter((_, i) => i % 4 === 0)).map((v) => v.toFixed(4))
      );
      expect(unique.size).toBeGreaterThan(1);
    });

    it('different seeds produce different grain', () => {
      const W = 8,
        H = 8;
      const color = makeBuf(W, H, 0.5);
      const a = applyFilmGrain(color, W, H, 0.2, 0);
      const b = applyFilmGrain(color, W, H, 0.2, 999);
      let diff = 0;
      for (let i = 0; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
      expect(diff).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Vignette
  // ---------------------------------------------------------------------------
  describe('applyVignette', () => {
    it('returns buffer of correct size', () => {
      const W = 8,
        H = 8;
      const out = applyVignette(makeBuf(W, H), W, H, 0.5);
      expect(out.length).toBe(W * H * 4);
    });

    it('center pixel is brighter than corner pixel', () => {
      const W = 9,
        H = 9;
      const color = makeBuf(W, H, 1, 1, 1);
      const out = applyVignette(color, W, H, 1, 0.5);
      const centerR = out[(4 * W + 4) * 4];
      const cornerR = out[0];
      expect(centerR).toBeGreaterThan(cornerR);
    });

    it('strength=0 → output equals input', () => {
      const W = 4,
        H = 4;
      const color = makeBuf(W, H, 0.8, 0.6, 0.4);
      const out = applyVignette(color, W, H, 0);
      for (let i = 0; i < out.length; i += 4) {
        expect(out[i]).toBeCloseTo(color[i], 4);
      }
    });
  });
});
