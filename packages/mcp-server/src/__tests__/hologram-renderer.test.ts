import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockPage = {
  setContent: vi.fn(async () => undefined),
  waitForFunction: vi.fn(async () => undefined),
  evaluate: vi.fn(async () => ({
    previewPngDataUrl: 'data:image/png;base64,' + Buffer.from('preview-bytes').toString('base64'),
    quiltPngDataUrl: 'data:image/png;base64,' + Buffer.from('quilt-bytes').toString('base64'),
    leftPngDataUrl: 'data:image/png;base64,' + Buffer.from('left-bytes').toString('base64'),
    rightPngDataUrl: 'data:image/png;base64,' + Buffer.from('right-bytes').toString('base64'),
    width: 420,
    height: 560,
    depthBackend: 'luminance-proxy',
  })),
};

const mockBrowser = {
  newPage: vi.fn(async () => mockPage),
  close: vi.fn(async () => undefined),
};

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(async () => mockBrowser),
  },
}));

vi.mock('../holo-video-ingest', () => ({
  ffmpegAvailableSync: vi.fn(() => false),
  resolveFfmpegBinary: vi.fn(() => 'ffmpeg'),
}));

import { renderHologramBundle } from '../hologram-renderer';

describe('hologram-renderer', () => {
  let storeDir: string;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'hologram-renderer-test-'));
    process.env.HOLOGRAM_STORE_DIR = storeDir;
    mockPage.setContent.mockClear();
    mockPage.waitForFunction.mockClear();
    mockPage.evaluate.mockClear();
    mockBrowser.newPage.mockClear();
    mockBrowser.close.mockClear();
  });

  afterEach(async () => {
    delete process.env.HOLOGRAM_STORE_DIR;
    await rm(storeDir, { recursive: true, force: true });
  });

  it('writes a content-addressed bundle with image artifacts', async () => {
    const result = await renderHologramBundle({
      mediaType: 'image',
      source: 'gallery/photo.jpg',
      name: 'Photo',
      holoCode: 'composition "Photo" {}',
      quilt: {
        config: {
          views: 48,
          columns: 8,
          rows: 6,
          resolution: [3360, 3360],
          baseline: 0.06,
          device: '16inch',
        },
        tiles: Array.from({ length: 48 }, (_, index) => ({
          column: index % 8,
          row: Math.floor(index / 8),
          cameraOffset: (index - 24) / 24,
          viewShear: 0,
        })),
        metadata: { tileWidth: 420, tileHeight: 560, numViews: 48 },
      },
      mvhevc: {
        config: { fps: 30, container: 'mp4' },
        views: [
          { eye: 'left', cameraOffset: -0.0325, viewShear: 0.01 },
          { eye: 'right', cameraOffset: 0.0325, viewShear: -0.01 },
        ],
        metadata: { stereoMode: 'multiview-hevc' },
      },
    });

    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.previewPng.byteLength).toBeGreaterThan(0);
    expect(result.quiltPng.byteLength).toBeGreaterThan(0);
    expect(result.stereoLeftPng.byteLength).toBeGreaterThan(0);
    expect(result.stereoRightPng.byteLength).toBeGreaterThan(0);
    expect(result.stereoVideo).toBeUndefined();
    expect(result.depthBackend).toBe('luminance-proxy');
    expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});
