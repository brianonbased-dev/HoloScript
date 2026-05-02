// @vitest-environment node
/**
 * HologramShareRegistry — tests for share metadata + expiry policy.
 *
 * Wave B Stream 5: share URL infrastructure (task_1776813797701_zi8i).
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
import {
  HologramShareRegistry,
  type HologramShareRecord,
} from '@holoscript/engine/hologram/HologramShareRegistry';

import { __resetHologramStoreForTests } from '@/app/api/hologram/_lib/store';

function makeMeta(over: Partial<HologramMeta> = {}): HologramMeta {
  return {
    sourceKind: 'image',
    width: 4,
    height: 4,
    frames: 1,
    modelId: 'test-model',
    backend: 'cpu',
    inferenceMs: 1,
    createdAt: '2026-05-01T00:00:00.000Z',
    schemaVersion: 1,
    ...over,
  };
}

async function persistBundle(store: FileSystemHologramStore, meta?: HologramMeta): Promise<string> {
  const m = meta ?? makeMeta();
  const depth = new Float32Array(m.width * m.height * m.frames);
  const normal = new Float32Array(m.width * m.height * m.frames * 3);
  depth.fill(0.1);
  normal.fill(0.5);
  const depthBin = new Uint8Array(depth.buffer, depth.byteOffset, depth.byteLength);
  const normalBin = new Uint8Array(normal.buffer, normal.byteOffset, normal.byteLength);
  const hash = await computeBundleHash(m, depthBin, normalBin);
  const bundle: HologramBundle = { hash, meta: m, depthBin, normalBin };
  await store.put(bundle);
  return hash;
}

describe('HologramShareRegistry', () => {
  let workDir: string;
  let store: FileSystemHologramStore;
  let registry: HologramShareRegistry;

  beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), 'share-registry-test-'));
    vi.stubEnv('HOLOGRAM_STORE_ROOT', workDir);
    __resetHologramStoreForTests();
    store = new FileSystemHologramStore({ rootDir: workDir });
    registry = new HologramShareRegistry({ rootDir: workDir });
  });

  afterEach(async () => {
    __resetHologramStoreForTests();
    await rm(workDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  // ── createShare ────────────────────────────────────────────────────────────

  describe('createShare', () => {
    it('creates a share record with default (no-expiry) TTL', async () => {
      const hash = await persistBundle(store);
      const record = await registry.createShare({ hash });

      expect(record.hash).toBe(hash);
      expect(record.createdAt).toBeTruthy();
      expect(record.expiresAt).toBeNull();
      expect(record.viewCount).toBe(0);
      expect(record.createdBy).toBe('');
      expect(record.schemaVersion).toBe(1);
    });

    it('creates a share record with custom TTL', async () => {
      const hash = await persistBundle(store);
      const record = await registry.createShare({ hash, ttlSeconds: 3600 });

      expect(record.hash).toBe(hash);
      expect(record.expiresAt).not.toBeNull();
      // expiresAt should be ~1 hour from now
      const expiresAt = new Date(record.expiresAt!);
      const createdAt = new Date(record.createdAt);
      const diffSeconds = (expiresAt.getTime() - createdAt.getTime()) / 1000;
      expect(diffSeconds).toBe(3600);
    });

    it('creates a share record with createdBy', async () => {
      const hash = await persistBundle(store);
      const record = await registry.createShare({ hash, createdBy: 'user@example.com' });

      expect(record.createdBy).toBe('user@example.com');
    });

    it('is idempotent — returns existing record on duplicate create', async () => {
      const hash = await persistBundle(store);
      const first = await registry.createShare({ hash, ttlSeconds: 3600 });
      const second = await registry.createShare({ hash, ttlSeconds: 7200 });

      // Second call returns the ORIGINAL record (idempotent)
      expect(second.hash).toBe(first.hash);
      expect(second.createdAt).toBe(first.createdAt);
      expect(second.expiresAt).toBe(first.expiresAt);
    });

    it('rejects invalid hashes', async () => {
      await expect(registry.createShare({ hash: 'not-a-hash' })).rejects.toThrow();
    });
  });

  // ── getShareStatus ────────────────────────────────────────────────────────

  describe('getShareStatus', () => {
    it('returns null record + not expired for unshared bundle', async () => {
      const hash = await persistBundle(store);
      const status = await registry.getShareStatus(hash);

      expect(status.record).toBeNull();
      expect(status.expired).toBe(false);
    });

    it('returns active share record', async () => {
      const hash = await persistBundle(store);
      await registry.createShare({ hash });
      const status = await registry.getShareStatus(hash);

      expect(status.record).not.toBeNull();
      expect(status.record!.hash).toBe(hash);
      expect(status.expired).toBe(false);
    });

    it('detects expired shares', async () => {
      const hash = await persistBundle(store);
      // Create a share that expires in 1 second
      await registry.createShare({ hash, ttlSeconds: 1 });

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const status = await registry.getShareStatus(hash);
      expect(status.expired).toBe(true);
      expect(status.record).not.toBeNull();
    });

    it('non-expiring share stays active', async () => {
      const hash = await persistBundle(store);
      await registry.createShare({ hash, ttlSeconds: 0 }); // never expire
      const status = await registry.getShareStatus(hash);

      expect(status.expired).toBe(false);
      expect(status.record!.expiresAt).toBeNull();
    });

    it('rejects invalid hashes', async () => {
      await expect(registry.getShareStatus('invalid')).rejects.toThrow();
    });
  });

  // ── incrementViewCount ────────────────────────────────────────────────────

  describe('incrementViewCount', () => {
    it('increments view count for existing share', async () => {
      const hash = await persistBundle(store);
      await registry.createShare({ hash });

      await registry.incrementViewCount(hash);
      await registry.incrementViewCount(hash);
      await registry.incrementViewCount(hash);

      const status = await registry.getShareStatus(hash);
      expect(status.record!.viewCount).toBe(3);
    });

    it('is a no-op for bundles with no share record', async () => {
      const hash = await persistBundle(store);
      // Should not throw
      await registry.incrementViewCount(hash);
    });
  });

  // ── setExpiry ─────────────────────────────────────────────────────────────

  describe('setExpiry', () => {
    it('sets expiry on an existing share', async () => {
      const hash = await persistBundle(store);
      await registry.createShare({ hash }); // never expires
      const newExpiry = new Date('2027-01-01T00:00:00.000Z').toISOString();

      const updated = await registry.setExpiry(hash, newExpiry);
      expect(updated).not.toBeNull();
      expect(updated!.expiresAt).toBe(newExpiry);
    });

    it('removes expiry by setting null', async () => {
      const hash = await persistBundle(store);
      await registry.createShare({ hash, ttlSeconds: 3600 }); // expires in 1h

      const updated = await registry.setExpiry(hash, null);
      expect(updated).not.toBeNull();
      expect(updated!.expiresAt).toBeNull();
    });

    it('returns null for non-existent share', async () => {
      const hash = await persistBundle(store);
      // Don't create a share — just try to set expiry
      const result = await registry.setExpiry(hash, null);
      expect(result).toBeNull();
    });
  });

  // ── TTL clamping ──────────────────────────────────────────────────────────

  describe('TTL clamping', () => {
    it('clamps TTL to maxTtlSeconds', async () => {
      const hash = await persistBundle(store);
      const reg = new HologramShareRegistry({
        rootDir: workDir,
        maxTtlSeconds: 86400, // 1 day max
      });

      const record = await reg.createShare({ hash, ttlSeconds: 999999999 });
      const expiresAt = new Date(record.expiresAt!);
      const createdAt = new Date(record.createdAt);
      const diffSeconds = (expiresAt.getTime() - createdAt.getTime()) / 1000;

      expect(diffSeconds).toBeLessThanOrEqual(86400);
    });

    it('uses default TTL when no TTL specified', async () => {
      const hash = await persistBundle(store);
      const reg = new HologramShareRegistry({
        rootDir: workDir,
        defaultTtlSeconds: 7200,
      });

      const record = await reg.createShare({ hash });
      expect(record.expiresAt).not.toBeNull();
      const expiresAt = new Date(record.expiresAt!);
      const createdAt = new Date(record.createdAt);
      const diffSeconds = (expiresAt.getTime() - createdAt.getTime()) / 1000;
      expect(diffSeconds).toBe(7200);
    });
  });

  // ── Share file format ────────────────────────────────────────────────────

  describe('share.json file', () => {
    it('is valid JSON with correct structure', async () => {
      const hash = await persistBundle(store);
      await registry.createShare({ hash });

      const { readFile } = await import('node:fs/promises');
      const sharePath = join(workDir, hash.slice(0, 2), hash, 'share.json');
      const raw = await readFile(sharePath, 'utf-8');
      const parsed: HologramShareRecord = JSON.parse(raw);

      expect(parsed.hash).toBe(hash);
      expect(parsed.schemaVersion).toBe(1);
      expect(typeof parsed.createdAt).toBe('string');
      expect(parsed.viewCount).toBe(0);
    });
  });
});