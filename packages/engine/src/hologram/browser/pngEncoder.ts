/**
 * Minimal, pure-JS PNG encoder — no compression, no dependencies.
 *
 * Used as a deterministic fallback when no browser canvas (`OffscreenCanvas`,
 * `convertToBlob`) is available — typically the Node-side vitest environment
 * for the BrowserQuiltRenderer determinism tests, plus headless / SSR paths
 * where Three.js can't render.
 *
 * Encodes RGBA8 pixels as a single PNG with one uncompressed DEFLATE block
 * inside the IDAT chunk. Spec-compliant per RFC 1950 + RFC 1951 + ISO PNG.
 *
 * @see W.067a: Content hashes must be stable cross-platform — pure JS encode
 *      with no library dependency means the same input bytes produce the same
 *      PNG bytes on every runtime, which is what the BrowserQuiltRenderer
 *      determinism test asserts via SHA-256.
 *
 * NOT a general-purpose PNG library. Output is uncompressed (~4x larger than
 * a real encoder). Browser bundle: ~2KB. Use `OffscreenCanvas.convertToBlob`
 * in production browser paths for compression.
 */

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// CRC-32 lookup table (precomputed lazily — keeps cold-start cost trivial)
let CRC_TABLE: Uint32Array | null = null;
function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  CRC_TABLE = t;
  return t;
}

function crc32(bytes: Uint8Array): number {
  const t = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i++) {
    c = t[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Adler-32 over raw bytes, per RFC 1950. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const m = 65521;
  for (let i = 0; i < bytes.byteLength; i++) {
    a = (a + bytes[i]) % m;
    b = (b + a) % m;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32BE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 0xff;
  out[offset + 1] = (value >>> 16) & 0xff;
  out[offset + 2] = (value >>> 8) & 0xff;
  out[offset + 3] = value & 0xff;
}

function writeU16LE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = value & 0xff;
  out[offset + 1] = (value >>> 8) & 0xff;
}

function writeChunk(parts: Uint8Array[], type: string, data: Uint8Array): void {
  const len = data.byteLength;
  const lengthBytes = new Uint8Array(4);
  writeU32BE(lengthBytes, 0, len);

  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i++) typeBytes[i] = type.charCodeAt(i);

  const crcInput = new Uint8Array(4 + len);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  const crc = crc32(crcInput);
  const crcBytes = new Uint8Array(4);
  writeU32BE(crcBytes, 0, crc);

  parts.push(lengthBytes, typeBytes, data, crcBytes);
}

/**
 * Wrap raw bytes in a zlib stream (RFC 1950) with a single uncompressed
 * DEFLATE stored block (RFC 1951 §3.2.4). Output is byte-stable and
 * deterministic for a given input.
 */
function zlibStoreEncode(raw: Uint8Array): Uint8Array {
  // zlib header: CMF=0x78 (deflate, 32K window), FLG chosen so (CMF*256+FLG)%31==0.
  // 0x78 0x01 = no compression / lowest level — convention, value irrelevant for stored blocks.
  // Build the header explicitly so the result is byte-stable.
  const cmf = 0x78;
  let flg = 0x01;
  // Adjust FLG so (CMF*256+FLG) % 31 == 0
  const rem = (cmf * 256 + flg) % 31;
  if (rem !== 0) flg = (flg + (31 - rem)) & 0xff;

  // Stored DEFLATE blocks: each can hold up to 65535 bytes. Chunk if larger.
  const MAX = 0xffff;
  const blockCount = Math.max(1, Math.ceil(raw.byteLength / MAX));
  const headerBytes = 2;
  const blockOverhead = 5; // 1 byte BFINAL/BTYPE + 2 bytes LEN + 2 bytes NLEN
  const trailerBytes = 4; // adler32
  const totalLen = headerBytes + blockCount * blockOverhead + raw.byteLength + trailerBytes;
  const out = new Uint8Array(totalLen);

  let off = 0;
  out[off++] = cmf;
  out[off++] = flg;

  for (let b = 0; b < blockCount; b++) {
    const start = b * MAX;
    const end = Math.min(start + MAX, raw.byteLength);
    const len = end - start;
    const isFinal = b === blockCount - 1 ? 1 : 0;
    out[off++] = isFinal; // BFINAL=isFinal, BTYPE=00 (stored)
    writeU16LE(out, off, len);
    off += 2;
    writeU16LE(out, off, (~len) & 0xffff);
    off += 2;
    out.set(raw.subarray(start, end), off);
    off += len;
  }

  const adler = adler32(raw);
  writeU32BE(out, off, adler);
  return out;
}

/**
 * Encode RGBA8 pixels as a deterministic PNG byte stream. No compression
 * (uses stored DEFLATE blocks) so the output bytes are 100% deterministic
 * across runtimes. Suitable for snapshot tests and content-addressed
 * hashing of QuiltRenderer output.
 *
 * @param rgba   Row-major RGBA bytes, length = width * height * 4
 * @param width  Image width in pixels
 * @param height Image height in pixels
 */
export function encodePngRgba(
  rgba: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  if (!Number.isInteger(width) || width <= 0) {
    throw new Error(`encodePngRgba: width must be a positive integer, got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new Error(`encodePngRgba: height must be a positive integer, got ${height}`);
  }
  const expected = width * height * 4;
  if (rgba.byteLength !== expected) {
    throw new Error(
      `encodePngRgba: rgba is ${rgba.byteLength} bytes, expected ${expected} (${width}x${height} RGBA8)`
    );
  }

  // IHDR: 13 bytes — width(4) height(4) depth(1) colorType(1) compression(1) filter(1) interlace(1)
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, width);
  writeU32BE(ihdr, 4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter: standard
  ihdr[12] = 0; // interlace: none

  // Filtered scanlines: prepend filter-type byte (0 = none) to each row
  const stride = width * 4;
  const filtered = new Uint8Array(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    filtered[y * (1 + stride)] = 0; // None filter
    filtered.set(rgba.subarray(y * stride, y * stride + stride), y * (1 + stride) + 1);
  }

  const idat = zlibStoreEncode(filtered);

  const parts: Uint8Array[] = [PNG_SIGNATURE];
  writeChunk(parts, 'IHDR', ihdr);
  writeChunk(parts, 'IDAT', idat);
  writeChunk(parts, 'IEND', new Uint8Array(0));

  let total = 0;
  for (const p of parts) total += p.byteLength;
  const result = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    result.set(p, off);
    off += p.byteLength;
  }
  return result;
}
