import { resolve } from 'node:path';

import { FileSystemHologramStore } from '@holoscript/engine/hologram/FileSystemHologramStore';

/** Upper bound for multipart request bodies (defense before `request.formData()`). */
export const MAX_HOLOGRAM_UPLOAD_BYTES = 100 * 1024 * 1024;

let storeSingleton: FileSystemHologramStore | null = null;

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

/** @internal Vitest — clears the singleton so env / root changes apply. */
export function __resetHologramStoreForTests(): void {
  storeSingleton = null;
}
