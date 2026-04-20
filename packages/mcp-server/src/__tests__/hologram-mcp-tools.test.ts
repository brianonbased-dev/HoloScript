import { describe, expect, it } from 'vitest';

import {
  handleHologramTool,
  hologramToolDefinitions,
  isHologramToolName,
} from '../hologram-mcp-tools';

describe('hologram mcp tools', () => {
  it('defines expected hologram tools', () => {
    const names = hologramToolDefinitions.map((t) => t.name);
    expect(names).toContain('holo_hologram_from_media');
    expect(names).toContain('holo_hologram_compile_quilt');
    expect(names).toContain('holo_hologram_compile_mvhevc');
  });

  it('identifies hologram tool names', () => {
    expect(isHologramToolName('holo_hologram_from_media')).toBe(true);
    expect(isHologramToolName('holo_hologram_compile_quilt')).toBe(true);
    expect(isHologramToolName('holo_hologram_compile_mvhevc')).toBe(true);
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
});
