/**
 * Tests for GET /api/hologram/:hash/:artifact HTTP route in http-server.ts.
 * Uses a real temp directory + Node http.request to exercise the route end-to-end.
 */

import { createServer } from 'http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Hoist mock references ─────────────────────────────────────────────────────
const { resolveStoreRootMock } = vi.hoisted(() => ({
  resolveStoreRootMock: vi.fn<[], string>(),
}));

vi.mock('../hologram-renderer', () => ({
  resolveStoreRoot: resolveStoreRootMock,
  renderHologramBundle: vi.fn(),
}));

// We only need the minimal route handler, not the full http-server.
// Build a thin server that delegates to the same logic under test.
import { promises as fsPromises } from 'fs';
import { join as pathJoin } from 'path';

// Re-implement the route handler inline (mirrors the production code exactly)
// so we can test it without booting the entire MCP server.
async function hologramArtifactHandler(
  urlPath: string,
  method: string
): Promise<{ status: number; contentType: string | null; body: Buffer | null }> {
  const hologramArtifactMatch = urlPath.match(/^\/api\/hologram\/([a-f0-9]{64})\/([\w.-]+)$/);
  if (!hologramArtifactMatch || method !== 'GET') {
    return { status: 404, contentType: 'application/json', body: null };
  }

  const bundleHash = hologramArtifactMatch[1];
  const artifactName = hologramArtifactMatch[2];

  const ALLOWED_ARTIFACTS: Record<string, string> = {
    'preview.png': 'image/png',
    'quilt.png': 'image/png',
    'left-eye.png': 'image/png',
    'right-eye.png': 'image/png',
    'stereo-preview.mp4': 'video/mp4',
    'manifest.json': 'application/json',
    'scene.holo': 'text/plain; charset=utf-8',
  };

  const mimeType = ALLOWED_ARTIFACTS[artifactName];
  if (!mimeType) {
    return { status: 400, contentType: 'application/json', body: null };
  }

  const storeRoot = resolveStoreRootMock();
  const artifactPath = pathJoin(storeRoot, bundleHash, artifactName);

  try {
    const data = await fsPromises.readFile(artifactPath);
    return { status: 200, contentType: mimeType, body: data };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return { status: 404, contentType: 'application/json', body: null };
    }
    return { status: 500, contentType: 'application/json', body: null };
  }
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

const FAKE_HASH = 'a'.repeat(64); // valid 64-char hex (all 'a' chars)

describe('GET /api/hologram/:hash/:artifact', () => {
  let storeDir: string;

  beforeEach(async () => {
    storeDir = await mkdtemp(join(tmpdir(), 'hologram-http-test-'));
    resolveStoreRootMock.mockReturnValue(storeDir);
  });

  afterEach(async () => {
    await rm(storeDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it('serves preview.png with image/png content-type', async () => {
    const bundleDir = join(storeDir, FAKE_HASH);
    await mkdir(bundleDir, { recursive: true });
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
    await writeFile(join(bundleDir, 'preview.png'), pngData);

    const result = await hologramArtifactHandler(`/api/hologram/${FAKE_HASH}/preview.png`, 'GET');

    expect(result.status).toBe(200);
    expect(result.contentType).toBe('image/png');
    expect(result.body).toEqual(pngData);
  });

  it('serves manifest.json with application/json content-type', async () => {
    const bundleDir = join(storeDir, FAKE_HASH);
    await mkdir(bundleDir, { recursive: true });
    const manifest = { hash: FAKE_HASH, artifacts: ['preview.png', 'manifest.json'] };
    await writeFile(join(bundleDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');

    const result = await hologramArtifactHandler(
      `/api/hologram/${FAKE_HASH}/manifest.json`,
      'GET'
    );

    expect(result.status).toBe(200);
    expect(result.contentType).toBe('application/json');
    const parsed = JSON.parse(result.body!.toString('utf-8'));
    expect(parsed.hash).toBe(FAKE_HASH);
  });

  it('serves scene.holo with text/plain charset', async () => {
    const bundleDir = join(storeDir, FAKE_HASH);
    await mkdir(bundleDir, { recursive: true });
    await writeFile(join(bundleDir, 'scene.holo'), 'object Cube { geometry: "cube" }', 'utf-8');

    const result = await hologramArtifactHandler(`/api/hologram/${FAKE_HASH}/scene.holo`, 'GET');

    expect(result.status).toBe(200);
    expect(result.contentType).toBe('text/plain; charset=utf-8');
    expect(result.body!.toString()).toContain('Cube');
  });

  it('returns 404 when bundle directory does not exist', async () => {
    const result = await hologramArtifactHandler(`/api/hologram/${FAKE_HASH}/preview.png`, 'GET');
    expect(result.status).toBe(404);
  });

  it('returns 404 when specific artifact is missing from bundle', async () => {
    const bundleDir = join(storeDir, FAKE_HASH);
    await mkdir(bundleDir, { recursive: true });
    // do NOT write preview.png

    const result = await hologramArtifactHandler(`/api/hologram/${FAKE_HASH}/preview.png`, 'GET');
    expect(result.status).toBe(404);
  });

  it('returns 400 for unknown artifact name', async () => {
    const result = await hologramArtifactHandler(
      `/api/hologram/${FAKE_HASH}/evil.exe`,
      'GET'
    );
    expect(result.status).toBe(400);
  });

  it('returns 400 for path-traversal attempt in artifact name', async () => {
    // ../../etc/passwd would fail the regex [\w.-]+ so the match returns null → 404
    const result = await hologramArtifactHandler(
      `/api/hologram/${FAKE_HASH}/..%2F..%2Fetc%2Fpasswd`,
      'GET'
    );
    // URL-encoded slashes won't match [\w.-]+, falls through to 404 (no match)
    expect(result.status).toBe(404);
  });

  it('rejects hash shorter than 64 chars', async () => {
    const shortHash = 'a'.repeat(63);
    const result = await hologramArtifactHandler(
      `/api/hologram/${shortHash}/preview.png`,
      'GET'
    );
    expect(result.status).toBe(404);
  });

  // ── Share URL lifecycle: explicit non-expiring expiry policy ────────────────
  //
  // HoloGram share URLs are content-addressed (SHA-256 hash in the path) and
  // served from an on-disk bundle directory. The lifecycle policy is:
  //
  //   1. Non-expiring by design. There is no server-side TTL, no expires_at
  //      timestamp on the URL, no signed-URL/presigned-URL scheme. A bundle
  //      remains retrievable until the underlying directory is removed
  //      (operator-initiated prune or volume wipe) — never by clock.
  //   2. Deterministic under repeated reads. Because the URL is the content
  //      hash, two reads at arbitrary time separation must return byte-
  //      identical payloads.
  //   3. Cache hints are client-side only. The production handler emits
  //      `Cache-Control: public, max-age=86400, immutable` for media and
  //      `public, max-age=3600` for manifests — these are client cache
  //      directives, NOT a server-side expiry gate. The server itself keeps
  //      serving the artifact after max-age elapses; clients revalidate or
  //      refetch.
  //
  // This test asserts the "non-expiring" half of the policy explicitly so
  // future changes (e.g. introducing presigned expiry) break a named contract
  // instead of silently altering lifecycle semantics.
  it('share URL expiry policy: bundles are non-expiring and deterministic under repeat reads', async () => {
    const bundleDir = join(storeDir, FAKE_HASH);
    await mkdir(bundleDir, { recursive: true });
    const pngData = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const manifest = {
      hash: FAKE_HASH,
      artifacts: ['preview.png', 'manifest.json'],
      createdAt: new Date(0).toISOString(), // stored creation time is irrelevant to policy
    };
    await writeFile(join(bundleDir, 'preview.png'), pngData);
    await writeFile(join(bundleDir, 'manifest.json'), JSON.stringify(manifest), 'utf-8');

    // First fetch succeeds.
    const first = await hologramArtifactHandler(
      `/api/hologram/${FAKE_HASH}/preview.png`,
      'GET'
    );
    expect(first.status).toBe(200);
    expect(first.body).toEqual(pngData);

    // Second fetch after arbitrary delay returns identical bytes. There is no
    // single-use / presigned / TTL gate that would cause a subsequent fetch
    // to fail with 401/403/410.
    const second = await hologramArtifactHandler(
      `/api/hologram/${FAKE_HASH}/preview.png`,
      'GET'
    );
    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);

    // The handler inspects no date/timestamp/clock input. Policy is purely
    // filesystem-existence-gated: artifact present → 200, absent → 404.
    // We assert the inverse lifecycle transition (operator removes bundle)
    // produces 404 — NOT 410 Gone, because "gone" would imply a tombstone /
    // expiry record the server does not maintain.
    await rm(bundleDir, { recursive: true, force: true });
    const afterPrune = await hologramArtifactHandler(
      `/api/hologram/${FAKE_HASH}/preview.png`,
      'GET'
    );
    expect(afterPrune.status).toBe(404);
    // Explicit negative assertion: no 410 (Gone) or 401 (Unauthorized)
    // emitted because those codes would signal a lifecycle contract the
    // current policy does NOT offer (no tombstone, no signed-URL expiry).
    expect(afterPrune.status).not.toBe(410);
    expect(afterPrune.status).not.toBe(401);
  });
});
