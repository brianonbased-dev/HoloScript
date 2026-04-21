import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderHologramBundleMock } = vi.hoisted(() => ({
  renderHologramBundleMock: vi.fn(),
}));

vi.mock('../hologram-renderer', () => ({
  renderHologramBundle: renderHologramBundleMock,
}));

import {
  handleHologramTool,
  hologramToolDefinitions,
  isHologramToolName,
} from '../hologram-mcp-tools';

describe('hologram mcp tools', () => {
  beforeEach(() => {
    renderHologramBundleMock.mockReset();
  });

  it('defines expected hologram tools', () => {
    const names = hologramToolDefinitions.map((t) => t.name);
    expect(names).toContain('holo_hologram_from_media');
    expect(names).toContain('holo_hologram_compile_quilt');
    expect(names).toContain('holo_hologram_compile_mvhevc');
    expect(names).toContain('holo_hologram_render');
  });

  it('identifies hologram tool names', () => {
    expect(isHologramToolName('holo_hologram_from_media')).toBe(true);
    expect(isHologramToolName('holo_hologram_compile_quilt')).toBe(true);
    expect(isHologramToolName('holo_hologram_compile_mvhevc')).toBe(true);
    expect(isHologramToolName('holo_hologram_render')).toBe(true);
    expect(isHologramToolName('holo_reconstruct_from_video')).toBe(false);
  });

  it('rejects invalid inputs', async () => {
    await expect(
      handleHologramTool('holo_hologram_from_media', {
        source: 'media/photo.jpg',
      } as Record<string, unknown>)
    ).rejects.toThrow('mediaType must be one of image|gif|video');

    await expect(
      handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
      } as Record<string, unknown>)
    ).rejects.toThrow('source is required');
  });

  it('generates .holo composition from image input', async () => {
    const result = (await handleHologramTool('holo_hologram_from_media', {
      mediaType: 'image',
      source: 'gallery/photo1.jpg',
      name: 'PhotoOne',
    })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.mediaType).toBe('image');
    expect(typeof result.holoCode).toBe('string');
    expect((result.holoCode as string).includes('@depth_estimation')).toBe(true);
  });

  it('compiles quilt and mvhevc outputs', async () => {
    const quiltResult = (await handleHologramTool('holo_hologram_compile_quilt', {
      mediaType: 'video',
      source: 'clips/portal.mp4',
      quiltConfig: { views: 48, device: '16inch' },
    })) as Record<string, unknown>;

    expect(quiltResult.ok).toBe(true);
    expect((quiltResult.quilt as { config: { views: number } }).config.views).toBe(48);

    const mvhevcResult = (await handleHologramTool('holo_hologram_compile_mvhevc', {
      mediaType: 'video',
      source: 'clips/portal.mp4',
      mvhevcConfig: { fps: 60, quality: 'medium' },
    })) as Record<string, unknown>;

    expect(mvhevcResult.ok).toBe(true);
    expect((mvhevcResult.mvhevc as { config: { fps: number } }).config.fps).toBe(60);
  });

  it('returns real bundle metadata for holo_hologram_render', async () => {
    renderHologramBundleMock.mockResolvedValue({
      hash: 'abc123',
      bundleDir: '/tmp/holograms/abc123',
      manifest: { path: '/tmp/holograms/abc123/manifest.json', byteLength: 512, sha256: 'm', mimeType: 'application/json' },
      previewPng: { path: '/tmp/holograms/abc123/preview.png', byteLength: 1024, sha256: 'p', mimeType: 'image/png' },
      quiltPng: { path: '/tmp/holograms/abc123/quilt.png', byteLength: 4096, sha256: 'q', mimeType: 'image/png' },
      stereoLeftPng: { path: '/tmp/holograms/abc123/left-eye.png', byteLength: 900, sha256: 'l', mimeType: 'image/png' },
      stereoRightPng: { path: '/tmp/holograms/abc123/right-eye.png', byteLength: 901, sha256: 'r', mimeType: 'image/png' },
      stereoVideo: { path: '/tmp/holograms/abc123/stereo-preview.mp4', byteLength: 8192, sha256: 'v', mimeType: 'video/mp4', codec: 'libx265', stereoMode: 'side-by-side-hevc-preview' },
      depthBackend: 'luminance-proxy',
      holoCodePath: '/tmp/holograms/abc123/scene.holo',
    });

    const result = (await handleHologramTool('holo_hologram_render', {
      mediaType: 'image',
      source: 'gallery/photo1.jpg',
      name: 'PhotoOne',
    })) as {
      ok: boolean;
      bundle: {
        previewPng: { byteLength: number };
        quiltPng: { byteLength: number };
        stereoVideo: { byteLength: number };
      };
    };

    expect(result.ok).toBe(true);
    expect(result.bundle.previewPng.byteLength).toBe(1024);
    expect(result.bundle.quiltPng.byteLength).toBe(4096);
    expect(result.bundle.stereoVideo.byteLength).toBe(8192);
    expect(renderHologramBundleMock).toHaveBeenCalledTimes(1);
  });
});
