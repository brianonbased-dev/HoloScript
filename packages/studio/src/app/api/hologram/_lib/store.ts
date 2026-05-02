import { resolve } from 'node:path';

import { FileSystemHologramStore } from '@holoscript/engine/hologram/FileSystemHologramStore';
import { HologramShareRegistry } from '@holoscript/engine/hologram/HologramShareRegistry';

/** Upper bound for multipart request bodies (defense before `request.formData()`). */
export const MAX_HOLOGRAM_UPLOAD_BYTES = 100 * 1024 * 1024;

/** Default TTL for HoloGram shares (0 = never expire). Override with HOLOGRAM_SHARE_TTL_SECONDS. */
export const DEFAULT_SHARE_TTL_SECONDS = 0;

let storeSingleton: FileSystemHologramStore | null = null;
let shareRegistrySingleton: HologramShareRegistry | null = null;

export function getHologramStoreRoot(): string {
  const raw = process.env.HOLOGRAM_STORE_ROOT;
  if (typeof raw === 'string' && raw.length > 0) {
    return resolve(raw);
  }
  return '/data/hologram';
}

export function getHologramStore(): FileSystemHologramStore {
  if (!storeSingleton) {
    storeSingleton = new FileSystemHologramStore({
      rootDir: getHologramStoreRoot(),
      maxBundleBytes: MAX_HOLOGRAM_UPLOAD_BYTES,
    });
  }
  return storeSingleton;
}

/**
 * Get the HologramShareRegistry singleton. Lives alongside the HologramStore
 * (same rootDir). TTL configured via HOLOGRAM_SHARE_TTL_SECONDS env var;
 * default is 0 (never expire).
 */
export function getShareRegistry(): HologramShareRegistry {
  if (!shareRegistrySingleton) {
    const ttlRaw = process.env.HOLOGRAM_SHARE_TTL_SECONDS;
    const ttl = ttlRaw ? Math.max(0, Number.parseInt(ttlRaw, 10) || 0) : DEFAULT_SHARE_TTL_SECONDS;
    shareRegistrySingleton = new HologramShareRegistry({
      rootDir: getHologramStoreRoot(),
      defaultTtlSeconds: ttl,
    });
  }
  return shareRegistrySingleton;
}

/** @internal Vitest — clears the singleton so env / root changes apply. */
export function __resetHologramStoreForTests(): void {
  storeSingleton = null;
  shareRegistrySingleton = null;
}
