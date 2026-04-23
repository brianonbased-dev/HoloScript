import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { renderHologramBundleMock } = vi.hoisted(() => ({
  renderHologramBundleMock: vi.fn(),
}));

const { callWorkerMock, workerConfiguredMock } = vi.hoisted(() => ({
  callWorkerMock: vi.fn(),
  workerConfiguredMock: vi.fn(),
}));

vi.mock('../hologram-renderer', () => ({
  renderHologramBundle: renderHologramBundleMock,
}));

vi.mock('../hologram-worker-client', () => ({
  callHologramWorkerRender: callWorkerMock,
  isHologramWorkerConfigured: workerConfiguredMock,
}));

vi.mock('../hologram-holomesh-send', () => ({
  sendHologramTeamMessage: vi.fn(async () => ({ success: true, message: { id: 'm' } })),
  publishHologramTeamFeed: vi.fn(async () => ({ success: true, item: { id: 'f1' } })),
}));

import { publishHologramTeamFeed, sendHologramTeamMessage } from '../hologram-holomesh-send';
import {
  handleHologramTool,
  hologramToolDefinitions,
  isHologramToolName,
} from '../hologram-mcp-tools';

describe('hologram mcp tools', () => {
  const prevWorkerUrl = process.env.HOLOGRAM_WORKER_URL;

  beforeEach(() => {
    renderHologramBundleMock.mockReset();
    callWorkerMock.mockReset();
    workerConfiguredMock.mockReturnValue(false);
    if (prevWorkerUrl === undefined) delete process.env.HOLOGRAM_WORKER_URL;
    else process.env.HOLOGRAM_WORKER_URL = prevWorkerUrl;
  });

  afterEach(() => {
    vi.mocked(sendHologramTeamMessage).mockClear();
    vi.mocked(publishHologramTeamFeed).mockClear();
  });

  it('defines expected hologram tools', () => {
    const names = hologramToolDefinitions.map((t) => t.name);
    expect(names).toContain('holo_hologram_from_media');
    expect(names).toContain('holo_hologram_compile_quilt');
    expect(names).toContain('holo_hologram_compile_mvhevc');
    expect(names).toContain('holo_hologram_render');
    expect(names).toContain('holo_hologram_publish_feed');
    expect(names).toContain('holo_hologram_send');
  });

  it('identifies hologram tool names', () => {
    expect(isHologramToolName('holo_hologram_from_media')).toBe(true);
    expect(isHologramToolName('holo_hologram_compile_quilt')).toBe(true);
    expect(isHologramToolName('holo_hologram_compile_mvhevc')).toBe(true);
    expect(isHologramToolName('holo_hologram_render')).toBe(true);
    expect(isHologramToolName('holo_hologram_publish_feed')).toBe(true);
    expect(isHologramToolName('holo_hologram_send')).toBe(true);
    expect(isHologramToolName('holo_reconstruct_from_video')).toBe(false);
  });

  it('rejects invalid inputs', async () => {
    await expect(
      handleHologramTool('holo_hologram_from_media', {
        source: 'media/photo.jpg',
      } as Record<string, unknown>),
    ).rejects.toThrow('mediaType must be one of image|gif|video');

    await expect(
      handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
      } as Record<string, unknown>),
    ).rejects.toThrow('one of source, sourceUrl, or sourceBase64');

    await expect(
      handleHologramTool('holo_hologram_send', {
        hash: 'h',
        shareUrl: 'https://x',
      } as Record<string, unknown>),
    ).rejects.toThrow('recipientAgentId');
  });

  // Matrix gap: .ai-ecosystem/scripts/hologram-reliability-matrix.json
  //   id=oversized-payload-rejection (abuse-path, high severity)
  //   match="oversized hologram payload" — keep this literal string in place
  //   below so the matrix checker flips `actual` from gap → covered.
  describe('rejects oversized hologram payload before send/render', () => {
    const prevCap = process.env.HOLOGRAM_MCP_MAX_BASE64_BYTES;

    beforeEach(() => {
      // Pin a small cap so tests stay fast and deterministic.
      process.env.HOLOGRAM_MCP_MAX_BASE64_BYTES = '1024';
    });

    afterEach(() => {
      if (prevCap === undefined) delete process.env.HOLOGRAM_MCP_MAX_BASE64_BYTES;
      else process.env.HOLOGRAM_MCP_MAX_BASE64_BYTES = prevCap;
    });

    it('rejects holo_hologram_from_media when sourceBase64 exceeds cap', async () => {
      const huge = 'A'.repeat(2048);
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          sourceBase64: huge,
        } as Record<string, unknown>),
      ).rejects.toThrow(/oversized hologram payload/);
    });

    it('rejects holo_hologram_compile_quilt before worker call when payload oversized', async () => {
      workerConfiguredMock.mockReturnValue(true);
      const huge = 'B'.repeat(2048);

      await expect(
        handleHologramTool('holo_hologram_compile_quilt', {
          mediaType: 'image',
          sourceBase64: huge,
        } as Record<string, unknown>),
      ).rejects.toThrow(/oversized hologram payload/);

      // Critical: the worker must NOT be called for oversized payloads —
      // this is the "before send/render" contract the reliability matrix
      // asserts (id=oversized-payload-rejection).
      expect(callWorkerMock).not.toHaveBeenCalled();
    });

    it('rejects holo_hologram_render before worker/bundle call when payload oversized', async () => {
      workerConfiguredMock.mockReturnValue(true);
      const huge = 'C'.repeat(2048);

      await expect(
        handleHologramTool('holo_hologram_render', {
          mediaType: 'image',
          sourceBase64: huge,
        } as Record<string, unknown>),
      ).rejects.toThrow(/oversized hologram payload/);

      expect(callWorkerMock).not.toHaveBeenCalled();
      expect(renderHologramBundleMock).not.toHaveBeenCalled();
    });

    it('accepts payloads at or below the cap', async () => {
      const ok = 'D'.repeat(1024);
      const result = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        sourceBase64: ok,
      })) as Record<string, unknown>;
      expect(result.ok).toBe(true);
    });

    it('rejects oversized inline data: URLs in `source` field', async () => {
      const huge = 'E'.repeat(2048);
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          source: `data:image/png;base64,${huge}`,
        } as Record<string, unknown>),
      ).rejects.toThrow(/oversized hologram payload/);
    });
  });

  // Matrix gap: .ai-ecosystem/scripts/hologram-reliability-matrix.json
  //   id=malformed-media-input (abuse-path, high severity)
  //   match="malformed media payload" — keep this literal string in place
  //   below so the matrix checker flips `actual` from gap → covered.
  //
  // The contract under test: when a caller hands us a syntactically-invalid
  // media/depth payload (base64 with non-alphabet bytes, a data: URL that
  // lacks a valid `;base64,<payload>` section, an empty-MIME data: URL, or
  // garbage bytes inside an inline data: URL), the MCP tool layer must
  // refuse the input with an explicit error — never silently forward it
  // to the worker or the local renderer. A malformed media payload that
  // slips through would either crash the Playwright renderer with a
  // confusing decode error, or get written to a bundle as an unreadable
  // artifact. Catching it at the composition boundary is the cheapest
  // place in the pipeline.
  describe('rejects malformed media payload before send/render', () => {
    it('rejects holo_hologram_from_media when sourceBase64 contains non-base64 bytes', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          sourceBase64: '!!!this is not base64!!!',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);
    });

    it('rejects holo_hologram_from_media when sourceBase64 contains unicode', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          // Mojibake / utf-8 bytes that Node sometimes produces when a
          // caller forgets to base64-encode their buffer.
          sourceBase64: 'café☕️binary',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);
    });

    it('rejects holo_hologram_from_media when source is a data: URL with empty MIME', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          source: 'data:;base64,AAAA',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);
    });

    it('rejects holo_hologram_from_media when source is a data: URL with no base64 payload', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          // Valid MIME, `;base64,` present but payload after comma is empty.
          source: 'data:image/png;base64,',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);
    });

    it('rejects holo_hologram_from_media when inline data: URL carries non-base64 bytes', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          source: 'data:image/png;base64,!!!not-base64***',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);
    });

    it('rejects holo_hologram_compile_quilt before worker call when base64 is malformed', async () => {
      workerConfiguredMock.mockReturnValue(true);

      await expect(
        handleHologramTool('holo_hologram_compile_quilt', {
          mediaType: 'image',
          sourceBase64: '*** not base64 ***',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);

      // Critical: the worker must NOT be called for a malformed payload —
      // this is the "before send/render" contract the reliability matrix
      // asserts (id=malformed-media-input).
      expect(callWorkerMock).not.toHaveBeenCalled();
    });

    it('rejects holo_hologram_render before worker/bundle call when base64 is malformed', async () => {
      workerConfiguredMock.mockReturnValue(true);

      await expect(
        handleHologramTool('holo_hologram_render', {
          mediaType: 'image',
          sourceBase64: 'spaces and !!! punctuation ???',
        } as Record<string, unknown>),
      ).rejects.toThrow(/malformed media payload/);

      expect(callWorkerMock).not.toHaveBeenCalled();
      expect(renderHologramBundleMock).not.toHaveBeenCalled();
    });

    it('accepts valid base64 alphabet (RFC 4648) after rejecting malformed siblings', async () => {
      // Sanity: we are not over-rejecting — a well-formed base64 string
      // with every character class (A-Z a-z 0-9 + / and trailing =) flows
      // through without hitting the malformed-media-payload guard.
      const ok = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        sourceBase64: 'AbCd0123+/Ef==',
      })) as Record<string, unknown>;
      expect(ok.ok).toBe(true);
      expect(ok.source).toBe('data:image/png;base64,AbCd0123+/Ef==');
    });

    it('accepts URL-safe base64 alphabet (- and _)', async () => {
      const ok = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        sourceBase64: 'AbCd-_0123',
      })) as Record<string, unknown>;
      expect(ok.ok).toBe(true);
    });
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

  it('generates composition from sourceUrl', async () => {
    const result = (await handleHologramTool('holo_hologram_from_media', {
      mediaType: 'gif',
      sourceUrl: 'https://cdn.example/a.gif',
    })) as Record<string, unknown>;

    expect(result.ok).toBe(true);
    expect(result.source).toBe('https://cdn.example/a.gif');
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

  it('merges worker URLs into compile_quilt when worker configured', async () => {
    workerConfiguredMock.mockReturnValue(true);
    callWorkerMock.mockResolvedValue({
      hash: 'wh',
      shareUrl: 'https://share/u',
      quiltUrl: 'https://share/q.png',
      mvhevcUrl: 'https://share/m.mp4',
      targets: ['quilt'],
    });

    const quiltResult = (await handleHologramTool('holo_hologram_compile_quilt', {
      mediaType: 'image',
      sourceUrl: 'https://example.com/x.png',
    })) as Record<string, unknown>;

    expect(quiltResult.hash).toBe('wh');
    expect(quiltResult.quiltUrl).toBe('https://share/q.png');
    expect(callWorkerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        targets: ['quilt'],
        mediaType: 'image',
        sourceUrl: 'https://example.com/x.png',
      }),
    );
  });

  it('returns real bundle metadata for holo_hologram_render (local path)', async () => {
    renderHologramBundleMock.mockResolvedValue({
      hash: 'abc123',
      bundleDir: '/tmp/holograms/abc123',
      manifest: {
        path: '/tmp/holograms/abc123/manifest.json',
        byteLength: 512,
        sha256: 'm',
        mimeType: 'application/json',
      },
      previewPng: {
        path: '/tmp/holograms/abc123/preview.png',
        byteLength: 1024,
        sha256: 'p',
        mimeType: 'image/png',
      },
      quiltPng: {
        path: '/tmp/holograms/abc123/quilt.png',
        byteLength: 4096,
        sha256: 'q',
        mimeType: 'image/png',
      },
      stereoLeftPng: {
        path: '/tmp/holograms/abc123/left-eye.png',
        byteLength: 900,
        sha256: 'l',
        mimeType: 'image/png',
      },
      stereoRightPng: {
        path: '/tmp/holograms/abc123/right-eye.png',
        byteLength: 901,
        sha256: 'r',
        mimeType: 'image/png',
      },
      stereoVideo: {
        path: '/tmp/holograms/abc123/stereo-preview.mp4',
        byteLength: 8192,
        sha256: 'v',
        mimeType: 'video/mp4',
        codec: 'libx265',
        stereoMode: 'side-by-side-hevc-preview',
      },
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
    expect(callWorkerMock).not.toHaveBeenCalled();
  });

  it('uses worker for holo_hologram_render when configured and includeBase64 false', async () => {
    workerConfiguredMock.mockReturnValue(true);
    callWorkerMock.mockResolvedValue({
      hash: 'w1',
      shareUrl: 'https://s/u',
      quiltUrl: 'https://s/q',
      mvhevcUrl: 'https://s/m',
      targets: ['quilt', 'mvhevc', 'parallax'],
    });

    const result = (await handleHologramTool('holo_hologram_render', {
      mediaType: 'image',
      sourceUrl: 'https://cdn/i.png',
    })) as { ok: boolean; worker: { hash: string } };

    expect(result.ok).toBe(true);
    expect(result.worker.hash).toBe('w1');
    expect(renderHologramBundleMock).not.toHaveBeenCalled();
  });

  it('holo_hologram_send delegates to HoloMesh helper', async () => {
    const out = (await handleHologramTool('holo_hologram_send', {
      hash: 'hh',
      shareUrl: 'https://share',
      recipientAgentId: 'agent_z',
      teamId: 'team_t',
    })) as { ok: boolean };

    expect(out.ok).toBe(true);
    expect(sendHologramTeamMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: 'hh',
        shareUrl: 'https://share',
        recipientAgentId: 'agent_z',
        teamId: 'team_t',
      }),
    );
  });

  it('holo_hologram_publish_feed delegates to HoloMesh helper', async () => {
    const out = (await handleHologramTool('holo_hologram_publish_feed', {
      hash: 'hh2',
      shareUrl: 'https://studio.holoscript.net/g/hh2',
      teamId: 'team_tf',
    })) as { ok: boolean };

    expect(out.ok).toBe(true);
    expect(publishHologramTeamFeed).toHaveBeenCalledWith(
      expect.objectContaining({
        hash: 'hh2',
        shareUrl: 'https://studio.holoscript.net/g/hh2',
        teamId: 'team_tf',
      }),
    );
  });
});
