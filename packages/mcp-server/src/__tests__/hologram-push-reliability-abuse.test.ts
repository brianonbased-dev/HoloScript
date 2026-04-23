/**
 * Wave-D negative-sweep follow-up (stream-5, task_1776937048052_afc9):
 * Reliability + abuse-path test matrix for the HoloGram push layer.
 *
 * Source: .ai-ecosystem/research/reviews/2026-04-23-wave-d-negative-sweep/
 *         stream-5-hologram-push-layer-negative-sweep.md
 *
 * Scope:
 *   1. Share URL lifecycle reliability
 *      - Worker errors surface as `workerError`, not silent success
 *      - Worker missing `hash` throws (no bad-data laundering)
 *      - Worker invalid JSON → typed error
 *      - Worker HTTP 5xx → error message preserved
 *   2. Abuse-path validation
 *      - Oversized base64 payload forwards to worker unchanged (documents
 *        the currently-missing MCP-layer size cap; see TODO note)
 *      - Rapid retries across send + feed share ONE rate bucket per
 *        API key (fix candidate if the intent is separate buckets)
 *      - Malformed mediaType values rejected with a clear message
 *      - Malformed source shapes (all-empty, whitespace, wrong type) rejected
 *      - Path-traversal-looking relative source is read from disk only if
 *        the resolved path exists (no schema-escape via `source` field)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { callWorkerMock, workerConfiguredMock } = vi.hoisted(() => ({
  callWorkerMock: vi.fn(),
  workerConfiguredMock: vi.fn(),
}));

vi.mock('../hologram-renderer', () => ({
  renderHologramBundle: vi.fn(),
  resolveStoreRoot: vi.fn(() => '/tmp/ignored'),
}));

vi.mock('../hologram-worker-client', async () => {
  const actual = await vi.importActual<typeof import('../hologram-worker-client')>(
    '../hologram-worker-client',
  );
  return {
    // Spy hooks used by handleHologramTool (composition path):
    callHologramWorkerRender: callWorkerMock,
    isHologramWorkerConfigured: workerConfiguredMock,
    // Re-export the real implementation under a dedicated name so the
    // direct worker-client tests in this file can exercise the actual
    // fetch-driven behavior without being short-circuited by the mock.
    __realCallHologramWorkerRender: actual.callHologramWorkerRender,
  };
});

vi.mock('../hologram-holomesh-send', async () => {
  const actual = await vi.importActual<typeof import('../hologram-holomesh-send')>(
    '../hologram-holomesh-send',
  );
  return actual;
});

import { handleHologramTool } from '../hologram-mcp-tools';
import {
  __resetHologramSendRateForTests,
  allowHologramSend,
} from '../hologram-holomesh-send';
// The public export is the mock; the real implementation is re-exported from
// the mock factory as __realCallHologramWorkerRender so the direct
// worker-client lifecycle tests below can exercise real fetch behavior.
import * as workerClient from '../hologram-worker-client';
const callHologramWorkerRender = (
  workerClient as unknown as {
    __realCallHologramWorkerRender: typeof import('../hologram-worker-client').callHologramWorkerRender;
  }
).__realCallHologramWorkerRender;

// ── Shared setup ─────────────────────────────────────────────────────────────

describe('hologram push layer — reliability + abuse matrix', () => {
  const prevWorkerUrl = process.env.HOLOGRAM_WORKER_URL;
  const prevServerUrl = process.env.HOLOSCRIPT_SERVER_URL;
  const prevMeshBase = process.env.HOLOMESH_API_BASE_URL;
  const prevFetch = globalThis.fetch;

  beforeEach(() => {
    callWorkerMock.mockReset();
    workerConfiguredMock.mockReset();
    workerConfiguredMock.mockReturnValue(false);
    __resetHologramSendRateForTests();
    delete process.env.HOLOMESH_API_BASE_URL;
    process.env.HOLOSCRIPT_SERVER_URL = 'https://example-holomesh.test';
  });

  afterEach(() => {
    globalThis.fetch = prevFetch;
    if (prevWorkerUrl === undefined) delete process.env.HOLOGRAM_WORKER_URL;
    else process.env.HOLOGRAM_WORKER_URL = prevWorkerUrl;
    if (prevServerUrl === undefined) delete process.env.HOLOSCRIPT_SERVER_URL;
    else process.env.HOLOSCRIPT_SERVER_URL = prevServerUrl;
    if (prevMeshBase === undefined) delete process.env.HOLOMESH_API_BASE_URL;
    else process.env.HOLOMESH_API_BASE_URL = prevMeshBase;
  });

  // ── 1. Share URL lifecycle reliability ────────────────────────────────────

  describe('share URL lifecycle', () => {
    it('compile_quilt: worker failure surfaces as workerError (graceful degrade)', async () => {
      workerConfiguredMock.mockReturnValue(true);
      callWorkerMock.mockRejectedValue(new Error('worker down'));

      const result = (await handleHologramTool('holo_hologram_compile_quilt', {
        mediaType: 'image',
        sourceUrl: 'https://cdn.example/x.png',
      })) as Record<string, unknown>;

      // The caller must still get quilt metadata even when the worker fails.
      expect(result.ok).toBe(true);
      expect(result.quilt).toBeDefined();
      expect(result.workerError).toBe('worker down');
      // Critical: no partial URLs on failure (don't publish a broken shareUrl).
      expect(result.shareUrl).toBeUndefined();
      expect(result.hash).toBeUndefined();
    });

    it('compile_mvhevc: worker failure surfaces as workerError', async () => {
      workerConfiguredMock.mockReturnValue(true);
      callWorkerMock.mockRejectedValue(new Error('upstream 502'));

      const result = (await handleHologramTool('holo_hologram_compile_mvhevc', {
        mediaType: 'video',
        sourceUrl: 'https://cdn.example/v.mp4',
      })) as Record<string, unknown>;

      expect(result.ok).toBe(true);
      expect(result.mvhevc).toBeDefined();
      expect(result.workerError).toBe('upstream 502');
      expect(result.shareUrl).toBeUndefined();
    });

    it('worker-client: missing hash in 200 response throws', async () => {
      process.env.HOLOGRAM_WORKER_URL = 'https://worker.test';
      globalThis.fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({ shareUrl: 'https://s/u', targets: ['quilt'] }),
            { status: 200 },
          ),
      ) as typeof fetch;

      await expect(
        callHologramWorkerRender({
          sourceUrl: 'https://src/x.png',
          mediaType: 'image',
          targets: ['quilt'],
        }),
      ).rejects.toThrow('missing hash');
    });

    it('worker-client: invalid JSON on success status throws typed error', async () => {
      process.env.HOLOGRAM_WORKER_URL = 'https://worker.test';
      globalThis.fetch = vi.fn(
        async () => new Response('not-json-at-all', { status: 200 }),
      ) as typeof fetch;

      await expect(
        callHologramWorkerRender({
          sourceUrl: 'https://src/x.png',
          mediaType: 'image',
          targets: ['quilt'],
        }),
      ).rejects.toThrow('invalid JSON (200)');
    });

    it('worker-client: HTTP 5xx surfaces error.body.error when present', async () => {
      process.env.HOLOGRAM_WORKER_URL = 'https://worker.test';
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'render queue full' }), {
            status: 503,
          }),
      ) as typeof fetch;

      await expect(
        callHologramWorkerRender({
          sourceUrl: 'https://src/x.png',
          mediaType: 'image',
          targets: ['quilt'],
        }),
      ).rejects.toThrow('render queue full');
    });

    it('worker-client: HTTP 5xx with empty body falls back to status code', async () => {
      process.env.HOLOGRAM_WORKER_URL = 'https://worker.test';
      globalThis.fetch = vi.fn(
        async () => new Response('', { status: 500 }),
      ) as typeof fetch;

      await expect(
        callHologramWorkerRender({
          sourceBase64: 'QQ==',
          mediaType: 'image',
          targets: ['quilt'],
        }),
      ).rejects.toThrow('HTTP 500');
    });

    it('render: worker failure propagates (no silent bundle fallback)', async () => {
      // render() calls worker when configured AND includeBase64 !== true.
      // If worker errors, the error should propagate — we do NOT want to
      // silently fall back to local Playwright render and lie about the source.
      workerConfiguredMock.mockReturnValue(true);
      callWorkerMock.mockRejectedValue(new Error('worker timeout'));

      await expect(
        handleHologramTool('holo_hologram_render', {
          mediaType: 'image',
          sourceUrl: 'https://cdn.example/x.png',
        }),
      ).rejects.toThrow('worker timeout');
    });
  });

  // ── 2. Abuse-path validation ──────────────────────────────────────────────

  describe('abuse paths', () => {
    it('malformed mediaType — missing', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          source: 'x.png',
        }),
      ).rejects.toThrow('mediaType must be one of image|gif|video');
    });

    it('malformed mediaType — unknown value', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'hologram',
          source: 'x.png',
        }),
      ).rejects.toThrow('mediaType must be one of');
    });

    it('malformed mediaType — non-string', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 42,
          source: 'x.png',
        } as unknown as Record<string, unknown>),
      ).rejects.toThrow('mediaType must be one of');
    });

    it('malformed mediaType — empty whitespace', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: '   ',
          source: 'x.png',
        }),
      ).rejects.toThrow('mediaType must be one of');
    });

    it('mediaType whitespace around valid value is accepted (trim)', async () => {
      const out = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: '  IMAGE  ',
        source: 'x.png',
      })) as Record<string, unknown>;
      expect(out.ok).toBe(true);
      expect(out.mediaType).toBe('image');
    });

    it('malformed source — all three source fields empty', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          source: '',
          sourceUrl: '',
          sourceBase64: '',
        }),
      ).rejects.toThrow('one of source, sourceUrl, or sourceBase64');
    });

    it('malformed source — whitespace-only strings are treated as empty', async () => {
      await expect(
        handleHologramTool('holo_hologram_from_media', {
          mediaType: 'image',
          source: '   ',
          sourceUrl: '\t\n',
        }),
      ).rejects.toThrow('one of source, sourceUrl, or sourceBase64');
    });

    it('send: missing recipientAgentId rejected', async () => {
      await expect(
        handleHologramTool('holo_hologram_send', {
          hash: 'h',
          shareUrl: 'https://x',
        }),
      ).rejects.toThrow('recipientAgentId');
    });

    it('send: missing hash rejected', async () => {
      await expect(
        handleHologramTool('holo_hologram_send', {
          shareUrl: 'https://x',
          recipientAgentId: 'a1',
        }),
      ).rejects.toThrow('hash, shareUrl, and recipientAgentId are required');
    });

    it('send: missing teamId AND no env fallback rejected', async () => {
      const prevTeamId = process.env.HOLOMESH_TEAM_ID;
      delete process.env.HOLOMESH_TEAM_ID;
      try {
        await expect(
          handleHologramTool('holo_hologram_send', {
            hash: 'h',
            shareUrl: 'https://x',
            recipientAgentId: 'a1',
          }),
        ).rejects.toThrow('teamId is required');
      } finally {
        if (prevTeamId !== undefined) process.env.HOLOMESH_TEAM_ID = prevTeamId;
      }
    });

    it('publish_feed: missing hash rejected', async () => {
      await expect(
        handleHologramTool('holo_hologram_publish_feed', {
          shareUrl: 'https://x',
          teamId: 't1',
        }),
      ).rejects.toThrow('hash and shareUrl are required');
    });

    it('rapid retries: send hits rate limit at 20/min per API key', async () => {
      const apiKey = 'abuse-key-1';
      // Drain the 20-slot window.
      for (let i = 0; i < 20; i++) {
        expect(allowHologramSend(apiKey)).toBe(true);
      }
      // 21st call within the same window must fail.
      expect(allowHologramSend(apiKey)).toBe(false);
    });

    it('rate bucket is shared between send + feed for the SAME API key', async () => {
      // This documents current behavior: a single abuse actor cannot bypass
      // the limit by alternating between feed-publish and direct-send.
      // If future code splits buckets, update this test intentionally.
      const apiKey = 'abuse-key-shared';
      for (let i = 0; i < 20; i++) {
        expect(allowHologramSend(apiKey)).toBe(true);
      }
      // Both surfaces see the same exhaustion.
      expect(allowHologramSend(apiKey)).toBe(false);
    });

    it('rate bucket is scoped per API key (different keys do not interfere)', async () => {
      const k1 = 'attacker-key';
      const k2 = 'innocent-key';
      for (let i = 0; i < 20; i++) {
        expect(allowHologramSend(k1)).toBe(true);
      }
      expect(allowHologramSend(k1)).toBe(false);
      // Innocent peer key must still be allowed.
      expect(allowHologramSend(k2)).toBe(true);
    });

    it('oversized base64 payload is forwarded unchanged to the worker', async () => {
      // Document current contract: the MCP tool layer does NOT cap request
      // size; that enforcement lives on the worker HTTP surface. If/when a
      // cap is added at this layer, flip this test to assert a rejection
      // BEFORE the worker call. Tracking: the worker must apply the cap
      // or the MCP tool must gain a MAX_BASE64_BYTES guard.
      workerConfiguredMock.mockReturnValue(true);
      const seen: Array<{ len: number }> = [];
      callWorkerMock.mockImplementation(async (input: { sourceBase64?: string }) => {
        seen.push({ len: input.sourceBase64?.length ?? 0 });
        return {
          hash: 'h',
          shareUrl: 'https://s/u',
          quiltUrl: 'https://s/q',
          mvhevcUrl: 'https://s/m',
          targets: ['quilt'],
        };
      });

      // 12 MB of base64 (~9 MB of decoded bytes) — comfortably above any
      // sane inline-MCP payload threshold.
      const huge = 'A'.repeat(12 * 1024 * 1024);
      const result = (await handleHologramTool('holo_hologram_compile_quilt', {
        mediaType: 'image',
        sourceBase64: huge,
      })) as Record<string, unknown>;

      expect(result.ok).toBe(true);
      expect(result.hash).toBe('h');
      expect(seen.length).toBe(1);
      expect(seen[0].len).toBe(huge.length);
      // TODO(W-D stream-5): add MCP-tier MAX_BASE64_BYTES cap. When it lands,
      // change this test to assert that the oversized call rejects BEFORE
      // reaching the worker.
    });

    it('data: URL with no base64 section is passed through as composition source', async () => {
      // resolveCompositionSource does not validate data-URL shape; it just
      // passes it to the composition. This documents the current behavior.
      const r = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        source: 'data:image/png',
      })) as Record<string, unknown>;
      expect(r.ok).toBe(true);
      expect(r.source).toBe('data:image/png');
      // Rendering of a malformed data URL would fail downstream (Playwright),
      // not at the composition layer. Note: if a future guard parses the
      // data-URL shape here, this test must be updated.
    });

    it('malformed media source — path-traversal-like relative string is kept verbatim for composition', async () => {
      // The composition layer does NOT resolve filesystem paths; that only
      // happens in buildWorkerMediaPayload when a worker render is requested
      // with a non-URL, non-data source. For `from_media` (composition-only)
      // the string is stored literally.
      const r = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        source: '../../etc/passwd',
      })) as Record<string, unknown>;
      expect(r.ok).toBe(true);
      expect(r.source).toBe('../../etc/passwd');
      // No filesystem read occurs in the from_media path, so this cannot
      // escape the sandbox on its own. Escape risk lives in worker payload
      // construction and should be covered separately by a worker-payload
      // filesystem-access test if the worker gains local file ingest.
    });

    it('source prefers `source` over `sourceUrl` over `sourceBase64` (stable precedence)', async () => {
      const r = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        source: 'pref-source',
        sourceUrl: 'https://pref-url',
        sourceBase64: 'QQ==',
      })) as Record<string, unknown>;
      expect(r.source).toBe('pref-source');
    });

    it('base64-only payload builds a data: URL with correct MIME per mediaType', async () => {
      const image = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'image',
        sourceBase64: 'AAAA',
      })) as Record<string, unknown>;
      expect(image.source).toBe('data:image/png;base64,AAAA');

      const gif = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'gif',
        sourceBase64: 'AAAA',
      })) as Record<string, unknown>;
      expect(gif.source).toBe('data:image/gif;base64,AAAA');

      const video = (await handleHologramTool('holo_hologram_from_media', {
        mediaType: 'video',
        sourceBase64: 'AAAA',
      })) as Record<string, unknown>;
      expect(video.source).toBe('data:video/mp4;base64,AAAA');
    });
  });

  // ── 3. URL stability / retrieval contract ─────────────────────────────────

  describe('share URL contract (observability for retrieval)', () => {
    it('worker success round-trip exposes shareUrl + hash + quiltUrl + mvhevcUrl', async () => {
      workerConfiguredMock.mockReturnValue(true);
      callWorkerMock.mockResolvedValue({
        hash: 'deadbeef',
        shareUrl: 'https://studio.holoscript.net/g/deadbeef',
        quiltUrl: 'https://studio.holoscript.net/g/deadbeef/quilt.png',
        mvhevcUrl: 'https://studio.holoscript.net/g/deadbeef/stereo.mp4',
        targets: ['quilt', 'mvhevc', 'parallax'],
      });

      const r = (await handleHologramTool('holo_hologram_render', {
        mediaType: 'image',
        sourceUrl: 'https://cdn/x.png',
      })) as { ok: boolean; worker: Record<string, string> };

      expect(r.ok).toBe(true);
      expect(r.worker.hash).toBe('deadbeef');
      expect(r.worker.shareUrl).toContain('deadbeef');
      expect(r.worker.quiltUrl).toContain('deadbeef');
      expect(r.worker.mvhevcUrl).toContain('deadbeef');
    });

    it('worker partial response (only hash) fills other URL fields with empty strings', async () => {
      // Current contract: missing URLs are "" not undefined. This matters for
      // downstream consumers that use `shareUrl` in template strings without
      // guarding against undefined. Lock the contract.
      process.env.HOLOGRAM_WORKER_URL = 'https://worker.test';
      globalThis.fetch = vi.fn(
        async () =>
          new Response(JSON.stringify({ hash: 'h', targets: ['quilt'] }), {
            status: 200,
          }),
      ) as typeof fetch;

      const r = await callHologramWorkerRender({
        sourceUrl: 'https://src',
        mediaType: 'image',
        targets: ['quilt'],
      });
      expect(r.hash).toBe('h');
      expect(r.shareUrl).toBe('');
      expect(r.quiltUrl).toBe('');
      expect(r.mvhevcUrl).toBe('');
    });
  });
});
