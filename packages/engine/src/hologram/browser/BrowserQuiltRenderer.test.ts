/**
 * BrowserQuiltRenderer — snapshot-style determinism on 32×32 fixture.
 *
 * Sprint 0a.2 DoD: "snapshot-style on a 32x32 fixture image, verify hash
 * determinism across runs."
 *
 * Strategy: force the CPU rasterizer (`path: 'cpu'`) so the output is
 * runtime-independent (no driver float quirks, no Three.js readPixels), then:
 *   1. SHA-256 the quilt PNG twice — must match (determinism)
 *   2. Tweak one pixel of the depth map — hash must change (sensitivity)
 *   3. Tweak the source image — hash must change (sensitivity)
 *   4. Verify the output starts with the PNG signature
 *   5. End-to-end: createHologram(media, 'image', createBrowserProviders())
 *      with injected depth + decoder produces a valid HologramBundle whose
 *      `quiltPng` is non-empty.
 */

import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

import { BrowserQuiltRenderer } from './BrowserQuiltRenderer';
import { BrowserDepthProvider, type ImageDecoder } from './BrowserDepthProvider';
import { createBrowserProviders } from './index';
import { createHologram } from '../createHologram';
import type { DepthEstimationService } from '../DepthEstimationService';

// ── 32×32 fixture builders ──────────────────────────────────────────────────

const FIXTURE_W = 32;
const FIXTURE_H = 32;

/** Deterministic checkerboard image — small enough that CPU raster is <50ms. */
function makeFixtureImage(seed = 0): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const data = new Uint8ClampedArray(FIXTURE_W * FIXTURE_H * 4);
  for (let y = 0; y < FIXTURE_H; y++) {
    for (let x = 0; x < FIXTURE_W; x++) {
      const idx = (y * FIXTURE_W + x) * 4;
      // Checkerboard tinted by seed so we can produce variants
      const cell = ((x >> 2) ^ (y >> 2)) & 1;
      data[idx] = cell ? (200 + seed) % 256 : 50;
      data[idx + 1] = cell ? 100 : (200 - seed) % 256;
      data[idx + 2] = cell ? 30 : 200;
      data[idx + 3] = 255;
    }
  }
  return { data, width: FIXTURE_W, height: FIXTURE_H };
}

/** Smooth radial depth gradient — center near, corners far. */
function makeFixtureDepth(seed = 0): Float32Array {
  const out = new Float32Array(FIXTURE_W * FIXTURE_H);
  const cx = (FIXTURE_W - 1) / 2;
  const cy = (FIXTURE_H - 1) / 2;
  const maxR = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < FIXTURE_H; y++) {
    for (let x = 0; x < FIXTURE_W; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const baseDepth = r / maxR; // 0 at center, 1 at corners
      out[y * FIXTURE_W + x] = Math.min(1, Math.max(0, baseDepth + seed * 0.001));
    }
  }
  return out;
}

const FIXTURE_MEDIA = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // fake JPEG SOI marker

const FIXTURE_DECODER: ImageDecoder = async () => makeFixtureImage(0);

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function decodeStoredPngRgba(png: Uint8Array, width: number, height: number): Uint8Array {
  const idatParts: Uint8Array[] = [];
  let offset = 8;
  while (offset < png.byteLength) {
    const length = readU32BE(png, offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    if (type === 'IDAT') {
      idatParts.push(png.subarray(dataStart, dataStart + length));
    }
    offset = dataStart + length + 4;
  }

  const zlib = concatBytes(idatParts);
  const rawParts: Uint8Array[] = [];
  let pos = 2;
  while (pos < zlib.byteLength - 4) {
    const header = zlib[pos++];
    const isFinal = (header & 1) === 1;
    const blockType = (header >> 1) & 0x03;
    if (blockType !== 0) throw new Error(`expected stored PNG block, got ${blockType}`);
    const length = zlib[pos] | (zlib[pos + 1] << 8);
    const inverseLength = zlib[pos + 2] | (zlib[pos + 3] << 8);
    if (((length ^ inverseLength) & 0xffff) !== 0xffff) {
      throw new Error('invalid stored PNG block length');
    }
    pos += 4;
    rawParts.push(zlib.subarray(pos, pos + length));
    pos += length;
    if (isFinal) break;
  }

  const filtered = concatBytes(rawParts);
  const stride = width * 4;
  const expected = height * (1 + stride);
  if (filtered.byteLength !== expected) {
    throw new Error(`decoded PNG payload is ${filtered.byteLength}, expected ${expected}`);
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const src = y * (1 + stride);
    if (filtered[src] !== 0) throw new Error(`unsupported PNG filter ${filtered[src]}`);
    rgba.set(filtered.subarray(src + 1, src + 1 + stride), y * stride);
  }
  return rgba;
}

function hashTile(
  rgba: Uint8Array,
  quiltWidth: number,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  const tile = new Uint8Array(width * height * 4);
  const rowBytes = width * 4;
  for (let row = 0; row < height; row++) {
    const src = ((y + row) * quiltWidth + x) * 4;
    tile.set(rgba.subarray(src, src + rowBytes), row * rowBytes);
  }
  return sha256Hex(tile);
}

/**
 * Helper: run the quilt renderer directly with the 32×32 fixture + small
 * tile grid (3×2 = 6 views) so the test is fast (~100ms even on the
 * CPU path) but still exercises the per-tile loop, parallax shift, and
 * grid composition.
 */
async function renderFixtureQuilt(
  opts: {
    depth?: Float32Array;
    source?: { data: Uint8ClampedArray; width: number; height: number };
  } = {}
): Promise<Uint8Array> {
  const renderer = new BrowserQuiltRenderer({
    path: 'cpu',
    overrides: {
      views: 6,
      columns: 3,
      rows: 2,
      resolution: [192, 128], // 64×64 tiles
    },
    imageDecoder: async () => opts.source ?? makeFixtureImage(0),
  });

  return renderer.render({
    depthMap: opts.depth ?? makeFixtureDepth(0),
    normalMap: new Float32Array(FIXTURE_W * FIXTURE_H * 3),
    width: FIXTURE_W,
    height: FIXTURE_H,
    frames: 1,
    media: FIXTURE_MEDIA,
    sourceKind: 'image',
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BrowserQuiltRenderer — determinism (CPU path)', () => {
  it('produces byte-identical PNG on repeated runs (32×32 fixture)', async () => {
    const a = await renderFixtureQuilt();
    const b = await renderFixtureQuilt();
    expect(a.byteLength).toBe(b.byteLength);
    expect(sha256Hex(a)).toBe(sha256Hex(b));
  });

  it('produces a different hash when the depth map changes', async () => {
    const a = await renderFixtureQuilt({ depth: makeFixtureDepth(0) });
    // Perturb a 4×4 block — single-pixel changes can floor away under the
    // CPU rasterizer's nearest-neighbor sampling at small tile sizes.
    const tweaked = makeFixtureDepth(0);
    for (let y = 14; y < 18; y++) {
      for (let x = 14; x < 18; x++) {
        tweaked[y * FIXTURE_W + x] = 0.0; // strong foreground spike
      }
    }
    const b = await renderFixtureQuilt({ depth: tweaked });
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });

  it('produces a different hash when the source image changes', async () => {
    const a = await renderFixtureQuilt({ source: makeFixtureImage(0) });
    const b = await renderFixtureQuilt({ source: makeFixtureImage(7) });
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });

  it('renders distinct pixels across quilt tiles', async () => {
    const out = await renderFixtureQuilt();
    const rgba = decodeStoredPngRgba(out, 192, 128);
    const bottomRowTop = 64;
    const leftView = hashTile(rgba, 192, 0, bottomRowTop, 64, 64);
    const rightView = hashTile(rgba, 192, 128, bottomRowTop, 64, 64);

    expect(leftView).not.toBe(rightView);
  });

  it('output begins with the PNG signature', async () => {
    const out = await renderFixtureQuilt();
    expect(out[0]).toBe(0x89);
    expect(out[1]).toBe(0x50);
    expect(out[2]).toBe(0x4e);
    expect(out[3]).toBe(0x47);
  });
});

describe('BrowserQuiltRenderer — input validation', () => {
  it('rejects depth map with wrong length', async () => {
    const renderer = new BrowserQuiltRenderer({
      path: 'cpu',
      overrides: { views: 6, columns: 3, rows: 2, resolution: [192, 128] },
      imageDecoder: async () => makeFixtureImage(0),
    });
    await expect(
      renderer.render({
        depthMap: new Float32Array(10), // wrong
        normalMap: new Float32Array(0),
        width: FIXTURE_W,
        height: FIXTURE_H,
        frames: 1,
        media: FIXTURE_MEDIA,
        sourceKind: 'image',
      })
    ).rejects.toThrow(/depthMap is 10 entries, expected 1024/);
  });

  it('rejects zero width', async () => {
    const renderer = new BrowserQuiltRenderer({
      path: 'cpu',
      imageDecoder: async () => makeFixtureImage(0),
    });
    await expect(
      renderer.render({
        depthMap: new Float32Array(0),
        normalMap: new Float32Array(0),
        width: 0,
        height: 32,
        frames: 1,
        media: FIXTURE_MEDIA,
        sourceKind: 'image',
      })
    ).rejects.toThrow(/invalid width 0/);
  });
});

describe('BrowserQuiltRenderer — composition + tile selection', () => {
  it('honors `overrides` passed to the QuiltCompiler', async () => {
    const renderer = new BrowserQuiltRenderer({
      path: 'cpu',
      overrides: { views: 4, columns: 2, rows: 2, resolution: [128, 128] },
      imageDecoder: async () => makeFixtureImage(0),
    });
    const out = await renderer.render({
      depthMap: makeFixtureDepth(0),
      normalMap: new Float32Array(FIXTURE_W * FIXTURE_H * 3),
      width: FIXTURE_W,
      height: FIXTURE_H,
      frames: 1,
      media: FIXTURE_MEDIA,
      sourceKind: 'image',
    });
    // PNG with width=128, height=128: bytes 16..23 in the IHDR encode w,h
    const w = (out[16] << 24) | (out[17] << 16) | (out[18] << 8) | out[19];
    const h = (out[20] << 24) | (out[21] << 16) | (out[22] << 8) | out[23];
    expect(w).toBe(128);
    expect(h).toBe(128);
  });

  it('falls back to the CPU path automatically when OffscreenCanvas is missing', async () => {
    // The default 'auto' path probes OffscreenCanvas. In node-vitest it's
    // missing, so the renderer must still succeed via the CPU rasterizer.
    const renderer = new BrowserQuiltRenderer({
      // path defaults to 'auto'
      overrides: { views: 4, columns: 2, rows: 2, resolution: [128, 128] },
      imageDecoder: async () => makeFixtureImage(0),
    });
    const out = await renderer.render({
      depthMap: makeFixtureDepth(0),
      normalMap: new Float32Array(FIXTURE_W * FIXTURE_H * 3),
      width: FIXTURE_W,
      height: FIXTURE_H,
      frames: 1,
      media: FIXTURE_MEDIA,
      sourceKind: 'image',
    });
    expect(out[0]).toBe(0x89); // PNG signature byte 0
  });
});

// ─── End-to-end via createHologram ─────────────────────────────────────────

/**
 * Stub depth service for the e2e test — same shape as
 * BrowserDepthProvider.test.ts so the orchestrator path (createHologram +
 * BrowserDepthProvider + BrowserQuiltRenderer) is exercised end-to-end
 * without WebGPU / Transformers.js / IndexedDB.
 */
function makeStubDepthService(): DepthEstimationService {
  return {
    get initialized() {
      return false;
    },
    get backend() {
      return 'webgpu' as const;
    },
    config: { modelId: 'depth-anything/Depth-Anything-V2-Small-hf' },
    async initialize() {
      /* noop */
    },
    async estimateDepth(imgData: { width: number; height: number }) {
      return {
        depthMap: makeFixtureDepth(0),
        normalMap: new Float32Array(imgData.width * imgData.height * 3),
        width: imgData.width,
        height: imgData.height,
        backend: 'webgpu' as const,
        inferenceMs: 0,
      };
    },
  } as unknown as DepthEstimationService;
}

describe('createBrowserProviders — end-to-end via createHologram', () => {
  it('produces a HologramBundle with a non-empty quilt PNG', async () => {
    const providers = createBrowserProviders({
      depth: {
        service: makeStubDepthService(),
        imageDecoder: async () => makeFixtureImage(0),
      },
      quilt: {
        path: 'cpu',
        overrides: { views: 6, columns: 3, rows: 2, resolution: [192, 128] },
        imageDecoder: async () => makeFixtureImage(0),
      },
    });

    const bundle = await createHologram(FIXTURE_MEDIA, 'image', providers, {
      targets: ['quilt'],
      now: () => new Date('2026-04-25T00:00:00.000Z'),
    });

    expect(bundle.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(bundle.meta.width).toBe(FIXTURE_W);
    expect(bundle.meta.height).toBe(FIXTURE_H);
    expect(bundle.meta.frames).toBe(1);
    expect(bundle.meta.modelId).toBe('depth-anything/Depth-Anything-V2-Small-hf');
    expect(bundle.meta.backend).toBe('webgpu');
    expect(bundle.quiltPng).toBeDefined();
    expect(bundle.quiltPng!.byteLength).toBeGreaterThan(100);
    expect(bundle.quiltPng![0]).toBe(0x89); // PNG sig
  });

  it('end-to-end pipeline is hash-deterministic across runs', async () => {
    async function run(): Promise<{ bundleHash: string; quiltHash: string }> {
      const providers = createBrowserProviders({
        depth: {
          service: makeStubDepthService(),
          imageDecoder: async () => makeFixtureImage(0),
        },
        quilt: {
          path: 'cpu',
          overrides: { views: 6, columns: 3, rows: 2, resolution: [192, 128] },
          imageDecoder: async () => makeFixtureImage(0),
        },
      });
      const bundle = await createHologram(FIXTURE_MEDIA, 'image', providers, {
        targets: ['quilt'],
        now: () => new Date('2026-04-25T00:00:00.000Z'),
      });
      return {
        bundleHash: bundle.hash,
        quiltHash: sha256Hex(bundle.quiltPng!),
      };
    }
    const a = await run();
    const b = await run();
    expect(a.bundleHash).toBe(b.bundleHash);
    expect(a.quiltHash).toBe(b.quiltHash);
  });

  it('integrates BrowserDepthProvider modelId into the bundle hash identity', async () => {
    // Same source + depth, different modelId ⇒ different bundle hash
    async function run(modelId: string): Promise<string> {
      const fakeService = {
        get initialized() {
          return false;
        },
        get backend() {
          return 'webgpu' as const;
        },
        config: { modelId },
        async initialize() {},
        async estimateDepth(img: { width: number; height: number }) {
          return {
            depthMap: makeFixtureDepth(0),
            normalMap: new Float32Array(img.width * img.height * 3),
            width: img.width,
            height: img.height,
            backend: 'webgpu' as const,
            inferenceMs: 0,
          };
        },
      } as unknown as DepthEstimationService;

      const providers = {
        depth: new BrowserDepthProvider({
          service: fakeService,
          imageDecoder: async () => makeFixtureImage(0),
        }),
        quilt: new BrowserQuiltRenderer({
          path: 'cpu',
          overrides: { views: 4, columns: 2, rows: 2, resolution: [128, 128] },
          imageDecoder: async () => makeFixtureImage(0),
        }),
      };
      const bundle = await createHologram(FIXTURE_MEDIA, 'image', providers, {
        targets: ['quilt'],
        now: () => new Date('2026-04-25T00:00:00.000Z'),
      });
      return bundle.hash;
    }

    const a = await run('model-a');
    const b = await run('model-b');
    expect(a).not.toBe(b);
  });
});
