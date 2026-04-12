/**
 * FITSParser — Pure JavaScript parser for FITS (Flexible Image Transport System) files.
 *
 * FITS is the standard data format in astronomy. Structure:
 *   - Header: 2880-byte blocks of 80-character ASCII "cards" (key=value pairs)
 *   - Data: big-endian binary arrays, padded to 2880-byte boundary
 *   - Extensions: additional HDUs (Header Data Units) with same structure
 *
 * Supports: BITPIX 8 (uint8), 16 (int16), 32 (int32), -32 (float32), -64 (float64)
 * Handles: BSCALE/BZERO physical value scaling, WCS coordinate metadata
 *
 * @see https://fits.gsfc.nasa.gov/fits_standard.html
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface WCSInfo {
  /** Reference pixel (1-indexed, per FITS convention) */
  crpix: number[];
  /** Reference value (world coordinate at reference pixel) */
  crval: number[];
  /** Pixel scale (coordinate increment per pixel) */
  cdelt: number[];
  /** Axis types (e.g., 'RA---TAN', 'DEC--TAN', 'FREQ') */
  ctype: string[];
  /** Axis units */
  cunit: string[];
}

export interface FITSFile {
  /** All header cards as key→value */
  headers: Map<string, string | number | boolean>;
  /** Data array (physical values after BSCALE/BZERO) */
  data: Float32Array;
  /** Axis dimensions [NAXIS1, NAXIS2, ...] */
  shape: number[];
  /** World Coordinate System info (if present) */
  wcs: WCSInfo | null;
  /** BITPIX from header */
  bitpix: number;
  /** Object name (OBJECT card) */
  object: string;
  /** Telescope name (TELESCOP card) */
  telescope: string;
  /** Observation date (DATE-OBS card) */
  dateObs: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_SIZE = 2880;
const CARD_SIZE = 80;
const CARDS_PER_BLOCK = BLOCK_SIZE / CARD_SIZE; // 36

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a FITS file from an ArrayBuffer.
 * Returns the primary HDU (first header + data unit).
 */
export function parseFITS(buffer: ArrayBuffer): FITSFile {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // ── Parse Header ─────────────────────────────────────────────────
  const headers = new Map<string, string | number | boolean>();
  let headerEnd = 0;

  outer:
  for (let block = 0; block * BLOCK_SIZE < buffer.byteLength; block++) {
    for (let card = 0; card < CARDS_PER_BLOCK; card++) {
      const offset = block * BLOCK_SIZE + card * CARD_SIZE;
      if (offset + CARD_SIZE > buffer.byteLength) break outer;

      const cardStr = decodeASCII(bytes, offset, CARD_SIZE);
      const keyword = cardStr.substring(0, 8).trim();

      if (keyword === 'END') {
        headerEnd = (block + 1) * BLOCK_SIZE; // data starts at next block boundary
        break outer;
      }

      if (cardStr[8] === '=' && cardStr[9] === ' ') {
        const valueStr = cardStr.substring(10).split('/')[0].trim();
        headers.set(keyword, parseCardValue(valueStr));
      } else if (keyword === 'COMMENT' || keyword === 'HISTORY') {
        // Skip comment/history cards
      }
    }
  }

  if (headerEnd === 0) {
    throw new Error('FITS: No END card found in header');
  }

  // ── Extract Critical Keywords ────────────────────────────────────
  const bitpix = getNum(headers, 'BITPIX');
  const naxis = getNum(headers, 'NAXIS');

  const shape: number[] = [];
  for (let i = 1; i <= naxis; i++) {
    shape.push(getNum(headers, `NAXIS${i}`));
  }

  const bscale = getNumOr(headers, 'BSCALE', 1.0);
  const bzero = getNumOr(headers, 'BZERO', 0.0);

  // ── Parse Data ───────────────────────────────────────────────────
  const totalPixels = shape.reduce((a, b) => a * b, 1);
  const bytesPerPixel = Math.abs(bitpix) / 8;
  const dataOffset = headerEnd;

  if (dataOffset + totalPixels * bytesPerPixel > buffer.byteLength) {
    throw new Error(`FITS: Data section extends beyond buffer (need ${dataOffset + totalPixels * bytesPerPixel}, have ${buffer.byteLength})`);
  }

  const data = new Float32Array(totalPixels);

  for (let i = 0; i < totalPixels; i++) {
    const off = dataOffset + i * bytesPerPixel;
    let raw: number;

    switch (bitpix) {
      case 8:
        raw = bytes[off];
        break;
      case 16:
        raw = view.getInt16(off, false); // big-endian
        break;
      case 32:
        raw = view.getInt32(off, false);
        break;
      case -32:
        raw = view.getFloat32(off, false);
        break;
      case -64:
        raw = view.getFloat64(off, false);
        break;
      default:
        throw new Error(`FITS: Unsupported BITPIX ${bitpix}`);
    }

    // Apply physical value transformation
    data[i] = bscale * raw + bzero;
  }

  // ── Extract WCS ──────────────────────────────────────────────────
  let wcs: WCSInfo | null = null;
  if (headers.has('CRVAL1')) {
    wcs = {
      crpix: [], crval: [], cdelt: [], ctype: [], cunit: [],
    };
    for (let i = 1; i <= naxis; i++) {
      wcs.crpix.push(getNumOr(headers, `CRPIX${i}`, 1));
      wcs.crval.push(getNumOr(headers, `CRVAL${i}`, 0));
      wcs.cdelt.push(getNumOr(headers, `CDELT${i}`, 1));
      wcs.ctype.push(getStrOr(headers, `CTYPE${i}`, ''));
      wcs.cunit.push(getStrOr(headers, `CUNIT${i}`, ''));
    }
  }

  return {
    headers,
    data,
    shape,
    wcs,
    bitpix,
    object: getStrOr(headers, 'OBJECT', ''),
    telescope: getStrOr(headers, 'TELESCOP', ''),
    dateObs: getStrOr(headers, 'DATE-OBS', ''),
  };
}

// ── FITS Builder (for tests) ─────────────────────────────────────────────────

/**
 * Build a minimal FITS file as ArrayBuffer (for testing).
 */
export function buildFITS(opts: {
  bitpix: number;
  shape: number[];
  data: number[];
  bscale?: number;
  bzero?: number;
  headers?: Record<string, string | number>;
}): ArrayBuffer {
  const cards: string[] = [];

  cards.push(fmtCard('SIMPLE', true));
  cards.push(fmtCard('BITPIX', opts.bitpix));
  cards.push(fmtCard('NAXIS', opts.shape.length));
  for (let i = 0; i < opts.shape.length; i++) {
    cards.push(fmtCard(`NAXIS${i + 1}`, opts.shape[i]));
  }
  if (opts.bscale !== undefined) cards.push(fmtCard('BSCALE', opts.bscale));
  if (opts.bzero !== undefined) cards.push(fmtCard('BZERO', opts.bzero));

  if (opts.headers) {
    for (const [key, val] of Object.entries(opts.headers)) {
      cards.push(fmtCard(key, val));
    }
  }

  cards.push('END'.padEnd(CARD_SIZE));

  // Pad header to block boundary
  while (cards.length % CARDS_PER_BLOCK !== 0) {
    cards.push(' '.repeat(CARD_SIZE));
  }

  const headerBytes = new Uint8Array(cards.length * CARD_SIZE);
  for (let i = 0; i < cards.length; i++) {
    for (let j = 0; j < CARD_SIZE; j++) {
      headerBytes[i * CARD_SIZE + j] = cards[i].charCodeAt(j);
    }
  }

  // Write data
  const bytesPerPixel = Math.abs(opts.bitpix) / 8;
  const dataSize = opts.data.length * bytesPerPixel;
  const paddedDataSize = Math.ceil(dataSize / BLOCK_SIZE) * BLOCK_SIZE;
  const dataBytes = new ArrayBuffer(paddedDataSize);
  const dataView = new DataView(dataBytes);

  for (let i = 0; i < opts.data.length; i++) {
    const off = i * bytesPerPixel;
    switch (opts.bitpix) {
      case 8: new Uint8Array(dataBytes)[off] = opts.data[i]; break;
      case 16: dataView.setInt16(off, opts.data[i], false); break;
      case 32: dataView.setInt32(off, opts.data[i], false); break;
      case -32: dataView.setFloat32(off, opts.data[i], false); break;
      case -64: dataView.setFloat64(off, opts.data[i], false); break;
    }
  }

  // Combine
  const result = new Uint8Array(headerBytes.length + paddedDataSize);
  result.set(headerBytes);
  result.set(new Uint8Array(dataBytes), headerBytes.length);
  return result.buffer;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function decodeASCII(bytes: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) {
    s += String.fromCharCode(bytes[offset + i]);
  }
  return s;
}

function parseCardValue(s: string): string | number | boolean {
  if (s === 'T') return true;
  if (s === 'F') return false;
  if (s.startsWith("'")) return s.replace(/^'|'$/g, '').trim();
  const n = Number(s);
  return Number.isNaN(n) ? s : n;
}

function getNum(headers: Map<string, string | number | boolean>, key: string): number {
  const v = headers.get(key);
  if (typeof v !== 'number') throw new Error(`FITS: Missing or non-numeric header ${key}`);
  return v;
}

function getNumOr(headers: Map<string, string | number | boolean>, key: string, def: number): number {
  const v = headers.get(key);
  return typeof v === 'number' ? v : def;
}

function getStrOr(headers: Map<string, string | number | boolean>, key: string, def: string): string {
  const v = headers.get(key);
  return typeof v === 'string' ? v : def;
}

function fmtCard(keyword: string, value: string | number | boolean): string {
  const kw = keyword.padEnd(8);
  let valStr: string;
  if (typeof value === 'boolean') {
    valStr = value ? 'T' : 'F';
    valStr = valStr.padStart(20);
  } else if (typeof value === 'number') {
    valStr = String(value).padStart(20);
  } else {
    valStr = `'${value}'`.padEnd(20);
  }
  return `${kw}= ${valStr}`.padEnd(CARD_SIZE);
}
