/**
 * HoloMap weight loader — fetch + optional SHA-256 digest check (RFC §5.1).
 *
 * **CID convention (v1):** `weightCid` may be `sha256:<64 lowercase hex>` or bare 64-char hex.
 * Full multibase/CIDv1 parsing is a follow-on; this matches replay fingerprint discipline without
 * pulling an IPFS stack into core.
 */

import { getCachedWeightBlob, putCachedWeightBlob } from './holoMapWeightCache';

export interface LoadHoloMapWeightsOptions {
  /** Primary URL (HTTPS, IPFS gateway, same-origin, file://, or package-relative). */
  weightUrl: string;
  /** Fallback URLs tried in order after primary fails. */
  weightUrls?: string[];
  /**
   * When set, downloaded bytes must match this digest (see module doc).
   * Mismatch throws — fail closed for SimulationContract honesty.
   */
  weightCid?: string;
  /** Test / SSR injection (defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** When true, skip cache read but still write after successful fetch. */
  skipCache?: boolean;
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const c = globalThis.crypto;
  if (c?.subtle) {
    const buf = await c.subtle.digest('SHA-256', (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    return bufferToHex(new Uint8Array(buf));
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(bytes).digest('hex');
}

function bufferToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/** Normalize HoloMap weightCid to lowercase hex (no prefix). */
export function normalizeWeightCidDigest(cid: string): string {
  const t = cid.trim().toLowerCase();
  if (t.startsWith('sha256:')) return t.slice('sha256:'.length);
  return t;
}

/**
 * Verify `bytes` SHA-256 matches `weightCid` (normalized hex).
 */
export async function assertWeightCid(bytes: Uint8Array, weightCid: string): Promise<void> {
  const expect = normalizeWeightCidDigest(weightCid);
  if (!/^[0-9a-f]{64}$/.test(expect)) {
    throw new Error(
      `HoloMap weights: weightCid must be sha256:hex64 or 64-char hex (got "${weightCid.slice(0, 24)}...")`,
    );
  }
  const actual = await sha256Digest(bytes);
  if (actual !== expect) {
    throw new Error(
      `HoloMap weights: digest mismatch — expected ${expect.slice(0, 12)}… got ${actual.slice(0, 12)}…`,
    );
  }
}

export interface LoadResult {
  bytes: ArrayBuffer;
  verified: boolean;
  source: 'cache' | 'network' | 'file';
}

function isFileUrl(url: string): boolean {
  return url.startsWith('file://');
}

async function readFileUrl(url: string): Promise<ArrayBuffer> {
  const { readFile } = await import('node:fs/promises');
  const path = url.slice('file://'.length);
  const buf = await readFile(path);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch weight blob with cache-first reads, CDN fallback, and offline file:// support.
 *
 * Strategy (per RFC §5.1):
 *   1. If a valid `weightCid` is given and cache hit → return cached bytes.
 *   2. Try primary `weightUrl`, then fallbacks in `weightUrls` with retry/back-off.
 *   3. On successful network fetch, verify CID (if given), cache the verified blob, return.
 *   4. `file://` and package-relative paths bypass the network and go straight to disk.
 */
export async function loadHoloMapWeightBlob(options: LoadHoloMapWeightsOptions): Promise<LoadResult> {
  const { weightUrl, weightUrls = [], weightCid, fetchImpl, skipCache } = options;
  const f = fetchImpl ?? globalThis.fetch;

  // 1. Cache-first read when we know the CID
  if (weightCid && !skipCache) {
    const cached = await getCachedWeightBlob(weightCid);
    if (cached) {
      return { bytes: cached, verified: true, source: 'cache' };
    }
  }

  // 2. Offline / bundled file paths (Node only)
  const candidates = [weightUrl, ...weightUrls];
  for (const url of candidates) {
    if (isFileUrl(url)) {
      try {
        const buf = await readFileUrl(url);
        if (weightCid) {
          await assertWeightCid(new Uint8Array(buf), weightCid);
        }
        if (weightCid) {
          await putCachedWeightBlob(weightCid, buf);
        }
        return { bytes: buf, verified: !!weightCid, source: 'file' };
      } catch {
        // fall through to next candidate
      }
      continue;
    }

    // 3. Network fetch with retry
    if (typeof f !== 'function') {
      throw new Error('HoloMap weights: fetch is not available (provide fetchImpl)');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await f(url);
        if (!res.ok) {
          throw new Error(`GET ${url} failed (${res.status} ${res.statusText})`);
        }
        const buf = await res.arrayBuffer();
        if (weightCid) {
          await assertWeightCid(new Uint8Array(buf), weightCid);
        }
        if (weightCid) {
          await putCachedWeightBlob(weightCid, buf);
        }
        return { bytes: buf, verified: !!weightCid, source: 'network' };
      } catch (err) {
        if (attempt < 2) {
          await sleep(250 * (attempt + 1)); // 250ms, 500ms
        } else {
          // exhausted retries for this URL
          break;
        }
      }
    }
  }

  throw new Error(`HoloMap weights: all sources exhausted (tried ${candidates.length} URL(s))`);
}
