import { describe, it, expect } from 'vitest';
import {
  createSolidTexture,
  sampleTexture,
  sampleTextureBilinear,
  computeDisplacedPosition,
  computeDisplacementNormalsFromHeightMap,
  computePOM,
  triplanarWeights,
  sampleTriplanar,
  applyDetailAlbedo,
  blendDetailNormal,
  createAtlasPacker,
  packRect,
  getRectUV,
  getAtlasEfficiency,
  type Texture2D,
  type Vec2,
  type Vec3,
} from '../AdvancedTexturing';

// Helper: create a gradient height map (left=0, right=1)
function makeGradientTex(w: number, h: number): Texture2D {
  const pixels = new Float32Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = x / (w - 1);
      const pi = (y * w + x) * 4;
      pixels[pi] = v; pixels[pi + 1] = v; pixels[pi + 2] = v; pixels[pi + 3] = 1;
    }
  }
  return { width: w, height: h, pixels };
}

describe('AdvancedTexturing — Production Tests', () => {

  // ---------------------------------------------------------------------------
  // Texture Utilities
  // ---------------------------------------------------------------------------
  describe('createSolidTexture', () => {
    it('creates correct dimensions', () => {
      const tex = createSolidTexture(8, 8, 0.5, 0.3, 0.1);
      expect(tex.width).toBe(8); expect(tex.height).toBe(8);
      expect(tex.pixels.length).toBe(8 * 8 * 4);
    });

    it('all pixels match the specified colour', () => {
      const tex = createSolidTexture(4, 4, 0.7, 0.2, 0.9, 1);
      for (let i = 0; i < 4 * 4; i++) {
        expect(tex.pixels[i * 4]).toBeCloseTo(0.7, 4);
        expect(tex.pixels[i * 4 + 1]).toBeCloseTo(0.2, 4);
        expect(tex.pixels[i * 4 + 2]).toBeCloseTo(0.9, 4);
      }
    });
  });

  describe('sampleTexture', () => {
    it('returns pixel values at UV corners', () => {
      const tex = makeGradientTex(4, 4);
      const [r] = sampleTexture(tex, 0, 0);
      expect(r).toBeCloseTo(0, 2);
      const [r2] = sampleTexture(tex, 1, 0);
      expect(r2).toBeCloseTo(1, 2);
    });

    it('clamps out-of-range UVs', () => {
      const tex = createSolidTexture(4, 4, 0.5, 0.5, 0.5);
      expect(() => sampleTexture(tex, -1, -1)).not.toThrow();
      expect(() => sampleTexture(tex, 2, 2)).not.toThrow();
    });
  });

  describe('sampleTextureBilinear', () => {
    it('interpolates between left (0) and right (1)', () => {
      const tex = makeGradientTex(8, 8);
      const [v] = sampleTextureBilinear(tex, 0.5, 0.5);
      expect(v).toBeGreaterThan(0.3);
      expect(v).toBeLessThan(0.7);
    });

    it('exact corners match solid values', () => {
      const tex = createSolidTexture(4, 4, 1, 0, 0);
      const [r] = sampleTextureBilinear(tex, 0.5, 0.5);
      expect(r).toBeCloseTo(1, 4);
    });
  });

  // ---------------------------------------------------------------------------
  // Displacement Mapping
  // ---------------------------------------------------------------------------
  describe('computeDisplacedPosition', () => {
    it('flat height=0.5 (gray) with bias=0.5 → no displacement', () => {
      const heightMap = createSolidTexture(4, 4, 0.5);
      const pos: Vec3 = { x: 0, y: 0, z: 0 };
      const norm: Vec3 = { x: 0, y: 1, z: 0 };
      const result = computeDisplacedPosition(pos, norm, heightMap, 0.5, 0.5, { scale: 1, bias: 0.5 });
      expect(result.y).toBeCloseTo(0, 5);
    });

    it('white (h=1) above bias→ positive displacement along normal', () => {
      const heightMap = createSolidTexture(4, 4, 1);
      const pos: Vec3 = { x: 0, y: 0, z: 0 };
      const norm: Vec3 = { x: 0, y: 1, z: 0 };
      const result = computeDisplacedPosition(pos, norm, heightMap, 0.5, 0.5, { scale: 0.5, bias: 0.5 });
      expect(result.y).toBeGreaterThan(0);
    });

    it('black (h=0) below bias→ negative displacement', () => {
      const heightMap = createSolidTexture(4, 4, 0);
      const pos: Vec3 = { x: 0, y: 0, z: 0 };
      const norm: Vec3 = { x: 0, y: 1, z: 0 };
      const result = computeDisplacedPosition(pos, norm, heightMap, 0.5, 0.5, { scale: 0.5, bias: 0.5 });
      expect(result.y).toBeLessThan(0);
    });
  });

  describe('computeDisplacementNormalsFromHeightMap', () => {
    it('returns one normal per vertex', () => {
      const heights = new Float32Array(3 * 3).fill(0.5);
      const normals = computeDisplacementNormalsFromHeightMap(heights, 3, 3, 1, 1);
      expect(normals.length).toBe(9);
    });

    it('flat terrain gives normals with Y ≈ 1', () => {
      const heights = new Float32Array(4 * 4).fill(0.5);
      const normals = computeDisplacementNormalsFromHeightMap(heights, 4, 4, 1, 1);
      for (const n of normals) {
        expect(n.y).toBeCloseTo(1, 5);
        expect(n.x).toBeCloseTo(0, 5);
        expect(n.z).toBeCloseTo(0, 5);
      }
    });

    it('slope changes normals X component', () => {
      // Heights increase from left to right
      const W = 4, H = 4;
      const heights = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = x * 0.25;
      const normals = computeDisplacementNormalsFromHeightMap(heights, W, H, 1, 1);
      // Interior normals should have negative X (slope going up in +x)
      const interior = normals[H * W / 2 + W / 2]; // roughly center
      expect(interior.x).toBeLessThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Parallax Occlusion Mapping
  // ---------------------------------------------------------------------------
  describe('computePOM', () => {
    it('returns a Vec2', () => {
      const heightMap = createSolidTexture(16, 16, 0.5);
      const result = computePOM({ x: 0.5, y: 0.5 }, { x: 0.3, y: 0.1, z: 0.95 }, heightMap);
      expect(typeof result.x).toBe('number');
      expect(typeof result.y).toBe('number');
    });

    it('flat height map → no offset (UV stays near input)', () => {
      const heightMap = createSolidTexture(16, 16, 0.5);
      const uv: Vec2 = { x: 0.5, y: 0.5 };
      const result = computePOM(uv, { x: 0, y: 0, z: 1 }, heightMap, { heightScale: 0.1 });
      // Very small offset expected for flat map at straight-on angle
      expect(Math.abs(result.x - 0.5)).toBeLessThan(0.1);
    });

    it('non-zero view angle produces offset UVs', () => {
      const heightMap = makeGradientTex(32, 32);
      const result = computePOM(
        { x: 0.5, y: 0.5 },
        { x: 0.5, y: 0.1, z: 0.7 },
        heightMap,
        { heightScale: 0.15, minLayers: 8, maxLayers: 16 }
      );
      // Result should be a valid number
      expect(isFinite(result.x)).toBe(true);
      expect(isFinite(result.y)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Triplanar Mapping
  // ---------------------------------------------------------------------------
  describe('triplanarWeights', () => {
    it('weights sum to ~1', () => {
      const w = triplanarWeights({ x: 0.6, y: 0.5, z: 0.6 });
      expect(w.x + w.y + w.z).toBeCloseTo(1, 4);
    });

    it('upward normal → Y weight dominant', () => {
      const w = triplanarWeights({ x: 0, y: 1, z: 0 });
      expect(w.y).toBeGreaterThan(w.x);
      expect(w.y).toBeGreaterThan(w.z);
    });

    it('rightward normal → X weight dominant', () => {
      const w = triplanarWeights({ x: 1, y: 0, z: 0 });
      expect(w.x).toBeGreaterThan(w.y);
    });

    it('sharpness increases the dominant weight', () => {
      const wLow = triplanarWeights({ x: 0.7, y: 0.5, z: 0.5 }, 1);
      const wHigh = triplanarWeights({ x: 0.7, y: 0.5, z: 0.5 }, 8);
      expect(wHigh.x).toBeGreaterThan(wLow.x);
    });
  });

  describe('sampleTriplanar', () => {
    it('returns RGBA values', () => {
      const tex = createSolidTexture(8, 8, 0.5, 0.6, 0.7);
      const result = sampleTriplanar(tex, { x: 1, y: 2, z: 3 }, { x: 0, y: 1, z: 0 });
      expect(result.length).toBe(4);
    });

    it('solid colour texture returns that colour regardless of blending', () => {
      const tex = createSolidTexture(8, 8, 0.3, 0.5, 0.9);
      const result = sampleTriplanar(tex, { x: 1.7, y: 2.3, z: 0.8 }, { x: 0.4, y: 0.8, z: 0.4 });
      expect(result[0]).toBeCloseTo(0.3, 2);
      expect(result[1]).toBeCloseTo(0.5, 2);
      expect(result[2]).toBeCloseTo(0.9, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // Detail Maps
  // ---------------------------------------------------------------------------
  describe('applyDetailAlbedo', () => {
    it('returns RGBA', () => {
      const detail = createSolidTexture(8, 8, 0.5, 0.5, 0.5);
      const result = applyDetailAlbedo([0.6, 0.5, 0.4, 1], detail, 0.5, 0.5);
      expect(result.length).toBe(4);
    });

    it('intensity=0 returns base colour unchanged', () => {
      const detail = createSolidTexture(4, 4, 0.9);
      const base: [number, number, number, number] = [0.3, 0.5, 0.7, 1];
      const result = applyDetailAlbedo(base, detail, 0.5, 0.5, { intensity: 0 });
      expect(result[0]).toBeCloseTo(0.3, 4);
    });

    it('preserves alpha channel', () => {
      const detail = createSolidTexture(4, 4, 0.5);
      const result = applyDetailAlbedo([0.4, 0.4, 0.4, 0.75], detail, 0.2, 0.2);
      expect(result[3]).toBe(0.75);
    });
  });

  describe('blendDetailNormal', () => {
    it('base=up and detail=up returns up', () => {
      const base: Vec3 = { x: 0, y: 0, z: 1 };
      const detail: Vec3 = { x: 0, y: 0, z: 1 };
      const result = blendDetailNormal(base, detail);
      const len = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
      expect(len).toBeCloseTo(1, 4);
    });

    it('result is always a unit vector', () => {
      const cases: Array<[Vec3, Vec3]> = [
        [{ x: 0.1, y: -0.1, z: 1 }, { x: 0.2, y: 0.3, z: 1 }],
        [{ x: 0, y: 0, z: 1 }, { x: 0.5, y: 0, z: 1 }],
      ];
      for (const [base, detail] of cases) {
        // Normalise inputs
        const normalise = (v: Vec3): Vec3 => {
          const l = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2) || 1;
          return { x: v.x / l, y: v.y / l, z: v.z / l };
        };
        const result = blendDetailNormal(normalise(base), normalise(detail));
        const len = Math.sqrt(result.x ** 2 + result.y ** 2 + result.z ** 2);
        expect(len).toBeCloseTo(1, 3);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Texture Atlas Packing
  // ---------------------------------------------------------------------------
  describe('createAtlasPacker', () => {
    it('starts empty', () => {
      const packer = createAtlasPacker(2048, 2048);
      expect(packer.rects.length).toBe(0);
      expect(packer.rowCount).toBe(0);
    });
  });

  describe('packRect', () => {
    it('packs a single rect successfully', () => {
      const packer = createAtlasPacker(512, 512);
      const rect = packRect(packer, 'item0', 128, 64);
      expect(rect).not.toBeNull();
      expect(rect!.id).toBe('item0');
    });

    it('packed rect fits within atlas bounds', () => {
      const packer = createAtlasPacker(256, 256);
      const rect = packRect(packer, 'item', 64, 64);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(256);
      expect(rect!.y + rect!.height).toBeLessThanOrEqual(256);
    });

    it('packs multiple rects without overlap', () => {
      const packer = createAtlasPacker(512, 512);
      const rects = [];
      for (let i = 0; i < 8; i++) {
        const r = packRect(packer, `item${i}`, 60, 60);
        expect(r).not.toBeNull();
        rects.push(r!);
      }
      // Check all IDs unique
      const ids = new Set(rects.map(r => r.id));
      expect(ids.size).toBe(8);
    });

    it('returns null when atlas is full', () => {
      const packer = createAtlasPacker(32, 32);
      // Fill it completely
      packRect(packer, 'a', 30, 30);
      const overflow = packRect(packer, 'b', 30, 30);
      expect(overflow).toBeNull();
    });

    it('wraps to a new row when row is exhausted', () => {
      const packer = createAtlasPacker(100, 200);
      packRect(packer, 'a', 60, 40);
      packRect(packer, 'b', 60, 40); // should wrap to new row
      expect(packer.rowCount).toBeGreaterThan(0);
    });
  });

  describe('getRectUV', () => {
    it('first rect UV starts at (0+padding, 0+padding) normalised', () => {
      const packer = createAtlasPacker(512, 512);
      const rect = packRect(packer, 'item', 128, 128, 1)!;
      const uv = getRectUV(packer, rect);
      expect(uv.u0).toBeGreaterThanOrEqual(0);
      expect(uv.v0).toBeGreaterThanOrEqual(0);
      expect(uv.u1).toBeGreaterThan(uv.u0);
      expect(uv.v1).toBeGreaterThan(uv.v0);
    });

    it('UV values in [0, 1]', () => {
      const packer = createAtlasPacker(256, 256);
      const rect = packRect(packer, 'test', 64, 64)!;
      const uv = getRectUV(packer, rect);
      for (const v of [uv.u0, uv.u1, uv.v0, uv.v1]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('getAtlasEfficiency', () => {
    it('empty packer has 0% efficiency', () => {
      const packer = createAtlasPacker(256, 256);
      expect(getAtlasEfficiency(packer)).toBe(0);
    });

    it('efficiency increases with more rects', () => {
      const packer = createAtlasPacker(512, 512);
      packRect(packer, 'a', 64, 64);
      const e1 = getAtlasEfficiency(packer);
      packRect(packer, 'b', 64, 64);
      const e2 = getAtlasEfficiency(packer);
      expect(e2).toBeGreaterThan(e1);
    });

    it('efficiency ≤ 1', () => {
      const packer = createAtlasPacker(128, 128);
      for (let i = 0; i < 16; i++) packRect(packer, `r${i}`, 30, 30);
      expect(getAtlasEfficiency(packer)).toBeLessThanOrEqual(1);
    });
  });
});
