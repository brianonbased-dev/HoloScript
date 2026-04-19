/**
 * HoloMap weight loader — fetch + optional SHA-256 digest check (RFC §5.1).
 *
 * **CID convention (v1):** `weightCid` may be `sha256:<64 lowercase hex>` or bare 64-char hex.
 * Full multibase/CIDv1 parsing is a follow-on; this matches replay fingerprint discipline without
 * pulling an IPFS stack into core.
 */

export interface LoadHoloMapWeightsOptions {
  /** HTTPS, IPFS gateway, or same-origin URL to the weight blob. */
  weightUrl: string;
  /**
   * When set, downloaded bytes must match this digest (see module doc).
   * Mismatch throws — fail closed for SimulationContract honesty.
   */
  weightCid?: string;
  /** Test / SSR injection (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const c = globalThis.crypto;
  if (c?.subtle) {
    const buf = await c.subtle.digest('SHA-256', bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
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

/**
 * Fetch weight blob. When `weightCid` is set, verifies SHA-256 before returning.
 */
export async function loadHoloMapWeightBlob(options: LoadHoloMapWeightsOptions): Promise<ArrayBuffer> {
  const { weightUrl, weightCid, fetchImpl } = options;
  const f = fetchImpl ?? globalThis.fetch;
  if (typeof f !== 'function') {
    throw new Error('HoloMap weights: fetch is not available (provide fetchImpl)');
  }
  const res = await f(weightUrl);
  if (!res.ok) {
    throw new Error(`HoloMap weights: GET ${weightUrl} failed (${res.status} ${res.statusText})`);
  }
  const buf = await res.arrayBuffer();
  if (weightCid) {
    await assertWeightCid(new Uint8Array(buf), weightCid);
  }
  return buf;
}
