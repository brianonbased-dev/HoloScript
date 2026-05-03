// @vitest-environment node
/**
 * /g/[hash] — server-side load tests.
 *
 * Uses a tmp-dir-backed FileSystemHologramStore (the same stack as the
 * production route) to verify:
 *   - valid hash + persisted bundle => loadBundle returns bundle info
 *   - invalid hash => returns { bundle: null, expired: false }
 *   - missing bundle => returns { bundle: null, expired: false }
 *   - expired share => returns { bundle: null, expired: true }
 *   - asset existence flags (hasQuilt etc.) reflect what's in the store
 *
 * We don't render the page (Next.js server-component invocation requires
 * the full Next runtime); we test the load function and metadata
 * generator directly.
 *
 * Wave B Stream 5: expiry policy tests added.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type HologramBundle,
  type HologramMeta,
  computeBundleHash,
} from '@holoscript/engine/hologram';
import { FileSystemHologramStore } from '@holoscript/engine/hologram/FileSystemHologramStore';
import { HologramShareRegistry } from '@holoscript/engine/hologram/HologramShareRegistry';

import { __resetHologramStoreForTests } from '@/app/api/hologram/_lib/store';

import { generateMetadata } from './page';
import { loadBundle } from './loadBundle';

function makeMeta(over: Partial<HologramMeta> = {}): HologramMeta {
  return {
    sourceKind: 'image',
    width: 4,
    height: 4,
    frames: 1,
    modelId: 'test-model',
    backend: 'cpu',
    inferenceMs: 1,
    createdAt: '2026-04-25T00:00:00.000Z',
    schemaVersion: 1,
    ...over,
  };
}

async function persistBundle(
  store: FileSystemHologramStore,
  meta: HologramMeta,
  withQuilt: boolean = true,
  withMvhevc: boolean = false,
  withParallax: boolean = false
): Promise<string> {
  const depth = new Float32Array(meta.width * meta.height * meta.frames);
  const normal = new Float32Array(meta.width * meta.height * meta.frames * 3);
  depth.fill(0.1);
  normal.fill(0.5);
  const depthBin = new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);
  const normalBin = new Uint8Array(normal.buffer, normal.byteOffset, normal.byteLength);
  const hash = await computeBundleHash(meta, depthBin, normalBin);

  const bundle: HologramBundle = {
    hash,
    meta,
    depthBin,
    normalBin,
    ...(withQuilt ? { quiltPng: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) } : {}),
    ...(withMvhevc ? { mvhevcMp4: new Uint8Array([0, 0, 0, 0x20]) } : {}),
    ...(withParallax ? { parallaxWebm: new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]) } : {}),
  };

  const result = await store.put(bundle);
  return result.hash;
}

describe('/g/[hash] — loadBundle', () => {
  let workDir: string;
  let store: FileSystemHologramStore;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'g-hash-page-'));
    vi.stubEnv('HOLOGRAM_STORE_ROOT', workDir);
    __resetHologramStoreForTests();
    store = new FileSystemHologramStore({ rootDir: workDir });
  });

  afterEach(async () => {
    __resetHologramStoreForTests();
    await rm(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('returns bundle: null, expired: false for non-string hash', async () => {
    const r1 = await loadBundle(undefined);
    expect(r1.bundle).toBeNull();
    expect(r1.expired).toBe(false);

    const r2 = await loadBundle(null);
    expect(r2.bundle).toBeNull();
    expect(r2.expired).toBe(false);

    const r3 = await loadBundle(123);
    expect(r3.bundle).toBeNull();
    expect(r3.expired).toBe(false);
  });

  it('returns bundle: null, expired: false for invalid hash shape', async () => {
    const r1 = await loadBundle('not-a-hash');
    expect(r1.bundle).toBeNull();
    expect(r1.expired).toBe(false);

    const r2 = await loadBundle('A'.repeat(64)); // uppercase
    expect(r2.bundle).toBeNull();
    expect(r2.expired).toBe(false);

    const r3 = await loadBundle('a'.repeat(63)); // too short
    expect(r3.bundle).toBeNull();
    expect(r3.expired).toBe(false);

    const r4 = await loadBundle('../etc/passwd');
    expect(r4.bundle).toBeNull();
    expect(r4.expired).toBe(false);
  });

  it('returns bundle: null for a valid-shape hash not in the store', async () => {
    const r = await loadBundle('a'.repeat(64));
    expect(r.bundle).toBeNull();
    expect(r.expired).toBe(false);
  });

  it('returns bundle info for a persisted bundle (quilt only)', async () => {
    const meta = makeMeta();
    const hash = await persistBundle(store, meta, true, false, false);
    const result = await loadBundle(hash);
    expect(result.bundle).not.toBeNull();
    expect(result.bundle?.hash).toBe(hash);
    expect(result.bundle?.meta.sourceKind).toBe('image');
    expect(result.bundle?.hasQuilt).toBe(true);
    expect(result.bundle?.hasMvhevc).toBe(false);
    expect(result.bundle?.hasParallax).toBe(false);
    expect(result.expired).toBe(false);
  });

  it('reflects all three asset flags', async () => {
    const meta = makeMeta();
    const hash = await persistBundle(store, meta, true, true, true);
    const result = await loadBundle(hash);
    expect(result.bundle?.hasQuilt).toBe(true);
    expect(result.bundle?.hasMvhevc).toBe(true);
    expect(result.bundle?.hasParallax).toBe(true);
  });

  it('reflects no asset flags when only depth/normal exist', async () => {
    const meta = makeMeta();
    const hash = await persistBundle(store, meta, false, false, false);
    const result = await loadBundle(hash);
    expect(result.bundle?.hasQuilt).toBe(false);
    expect(result.bundle?.hasMvhevc).toBe(false);
    expect(result.bundle?.hasParallax).toBe(false);
  });

  // ── Wave B Stream 5: expiry policy ──────────────────────────────────────────

  describe('expiry policy', () => {
    it('returns bundle for unshared gram (no share record)', async () => {
      const meta = makeMeta();
      const hash = await persistBundle(store, meta);
      const result = await loadBundle(hash);
      // No share record exists, but the bundle is still accessible
      expect(result.bundle).not.toBeNull();
      expect(result.expired).toBe(false);
    });

    it('returns bundle for active (non-expired) share', async () => {
      const meta = makeMeta();
      const hash = await persistBundle(store, meta);
      const registry = new HologramShareRegistry({ rootDir: workDir, defaultTtlSeconds: 3600 });
      await registry.createShare({ hash });

      const result = await loadBundle(hash);
      expect(result.bundle).not.toBeNull();
      expect(result.expired).toBe(false);
    });

    it('returns expired=true for expired share', async () => {
      const meta = makeMeta();
      const hash = await persistBundle(store, meta);
      const registry = new HologramShareRegistry({ rootDir: workDir, defaultTtlSeconds: 0 });
      // Create share that expires in 1 second
      await registry.createShare({ hash, ttlSeconds: 1 });

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = await loadBundle(hash);
      expect(result.bundle).toBeNull();
      expect(result.expired).toBe(true);
    });

    it('returns bundle for never-expiring share (ttlSeconds=0)', async () => {
      const meta = makeMeta();
      const hash = await persistBundle(store, meta);
      const registry = new HologramShareRegistry({ rootDir: workDir, defaultTtlSeconds: 0 });
      await registry.createShare({ hash, ttlSeconds: 0 });

      const result = await loadBundle(hash);
      expect(result.bundle).not.toBeNull();
      expect(result.expired).toBe(false);
    });
  });
});

describe('/g/[hash] — generateMetadata', () => {
  let workDir: string;
  let store: FileSystemHologramStore;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'g-hash-meta-'));
    vi.stubEnv('HOLOGRAM_STORE_ROOT', workDir);
    __resetHologramStoreForTests();
    store = new FileSystemHologramStore({ rootDir: workDir });
  });

  afterEach(async () => {
    __resetHologramStoreForTests();
    await rm(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it('falls back to "not found" title for missing bundle', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ hash: 'a'.repeat(64) }),
    });
    expect(meta.title).toBe('HoloGram — not found');
  });

  it('falls back to "not found" for invalid hash shape', async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ hash: 'NOT_A_VALID_HASH' }),
    });
    expect(meta.title).toBe('HoloGram — not found');
  });

  it('produces a sanitized title for a valid bundle', async () => {
    const hash = await persistBundle(store, makeMeta({ width: 1024, height: 768 }));
    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    expect(meta.title).toContain('image');
    expect(meta.title).toContain('1024x768');
  });

  it('omits OG image when no quilt asset', async () => {
    const hash = await persistBundle(store, makeMeta(), false, false, false);
    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    expect(meta.openGraph?.images).toBeUndefined();
  });

  it('includes OG image referencing the asset URL when quilt exists', async () => {
    const hash = await persistBundle(store, makeMeta(), true);
    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    const og = meta.openGraph;
    expect(og).toBeDefined();
    expect(Array.isArray(og?.images)).toBe(true);
    const imgs = og?.images as Array<{ url: string }> | undefined;
    expect(imgs?.[0]?.url).toBe(`/api/hologram/${hash}/quilt.png`);
  });

  // ── Wave B Stream 5: expired gram metadata ─────────────────────────────────

  it('shows "expired" title for expired share', async () => {
    const hash = await persistBundle(store, makeMeta());
    const registry = new HologramShareRegistry({ rootDir: workDir, defaultTtlSeconds: 0 });
    await registry.createShare({ hash, ttlSeconds: 1 });

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const meta = await generateMetadata({
      params: Promise.resolve({ hash }),
    });
    expect(meta.title).toBe('HoloGram — expired');
  });
});