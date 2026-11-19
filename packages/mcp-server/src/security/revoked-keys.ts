/**
 * Process-wide set of revoked key fingerprints (sha256 hex of the key value).
 *
 * Lives outside the HoloMesh key registry so every auth path, including the
 * legacy single-key checks, can refuse a revoked value without importing the
 * registry. holomesh/state.ts loads and persists the set (revoked-keys.json).
 */
import * as crypto from 'crypto';

const revokedFingerprints: Set<string> = new Set();

/** sha256 hex of a key value. Never logged. */
export function keyFingerprint(key: string): string {
  return crypto.createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Record a revoked key by value. */
export function markKeyRevoked(key: string): void {
  revokedFingerprints.add(keyFingerprint(key));
}

/** Record a revoked key by fingerprint (as loaded from disk). */
export function addRevokedFingerprint(fingerprint: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(fingerprint)) return false;
  revokedFingerprints.add(fingerprint);
  return true;
}

/** True when this key value has been revoked. */
export function isKeyRevoked(key: string | undefined | null): boolean {
  if (!key) return false;
  return revokedFingerprints.has(keyFingerprint(key));
}

/** Every revoked fingerprint currently known. */
export function revokedFingerprintList(): string[] {
  return Array.from(revokedFingerprints);
}

/** Test helper. */
export function _resetRevokedKeysForTests(): void {
  revokedFingerprints.clear();
}
