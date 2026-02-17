/**
 * HoloScript Playground — URL Share Encoder/Decoder
 *
 * Compresses playground state (source code + active example) into a
 * URL-safe hash fragment so users can share links directly.
 *
 * Format: #v1/<base64url(deflate(JSON))>
 * Fallback: #v0/<base64url(JSON)> for environments without CompressionStream.
 */

export interface PlaygroundState {
  source: string;
  example?: string;
  version?: number;
}

const MAGIC_V1 = 'v1';
const MAGIC_V0 = 'v0';

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Convert a Uint8Array to a URL-safe base64 string */
function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Convert a URL-safe base64 string back to Uint8Array */
function fromBase64Url(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Deflate-compress bytes using CompressionStream (available in modern browsers/Node 18+) */
async function compress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    return data; // Fall back to uncompressed
  }
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

/** Inflate-decompress bytes using DecompressionStream */
async function decompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    return data;
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    result.set(c, offset);
    offset += c.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encode a PlaygroundState into a URL hash fragment.
 * Uses compression when available; falls back to plain base64.
 */
export async function encodeState(state: PlaygroundState): Promise<string> {
  const json = JSON.stringify(state);
  const encoder = new TextEncoder();
  const raw = encoder.encode(json);

  try {
    const compressed = await compress(raw);
    // Only use compressed if actually smaller
    if (compressed.length < raw.length) {
      return `#${MAGIC_V1}/${toBase64Url(compressed)}`;
    }
  } catch {
    // Compression failed — fall back
  }

  return `#${MAGIC_V0}/${toBase64Url(raw)}`;
}

/**
 * Decode a URL hash fragment back into PlaygroundState.
 * Returns null if the hash is missing or malformed.
 */
export async function decodeState(hash: string): Promise<PlaygroundState | null> {
  try {
    const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
    const slashIdx = fragment.indexOf('/');
    if (slashIdx === -1) return null;

    const magic = fragment.slice(0, slashIdx);
    const payload = fragment.slice(slashIdx + 1);

    const bytes = fromBase64Url(payload);
    const decoder = new TextDecoder();

    let json: string;
    if (magic === MAGIC_V1) {
      const decompressed = await decompress(bytes);
      json = decoder.decode(decompressed);
    } else if (magic === MAGIC_V0) {
      json = decoder.decode(bytes);
    } else {
      return null; // Unknown version
    }

    const parsed = JSON.parse(json) as PlaygroundState;
    if (typeof parsed.source !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Write the encoded state to `window.location.hash` (browser only).
 */
export async function pushState(state: PlaygroundState): Promise<void> {
  if (typeof window === 'undefined') return;
  const hash = await encodeState(state);
  window.history.replaceState(null, '', hash);
}

/**
 * Read and decode state from `window.location.hash` (browser only).
 */
export async function readState(): Promise<PlaygroundState | null> {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash || hash === '#') return null;
  return decodeState(hash);
}
