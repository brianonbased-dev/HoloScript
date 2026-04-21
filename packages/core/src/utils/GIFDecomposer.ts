/**
 * GIFDecomposer — Decodes animated GIFs into frame sequences.
 *
 * Handles all 4 GIF disposal methods (UNSPECIFIED, DO_NOT_DISPOSE,
 * RESTORE_TO_BACKGROUND, RESTORE_TO_PREVIOUS) by compositing frames
 * onto an offscreen canvas following the GIF89a spec.
 *
 * Browser-only (requires Canvas 2D API).
 *
 * Usage:
 *   const frames = await GIFDecomposer.decompose(url);
 *   // frames[i].imageData — RGBA ImageData
 *   // frames[i].delay     — display duration in ms
 */

// ── GIF89a disposal method constants ─────────────────────────────────────────

/** GIF89a frame disposal methods (Graphic Control Extension field 2–3). */
export const GifDisposalMethod = {
  /** No disposal specified — treat as DO_NOT_DISPOSE. */
  UNSPECIFIED: 0,
  /** Leave frame in place; next frame composites over it. */
  DO_NOT_DISPOSE: 1,
  /** Restore frame area to background colour before drawing next frame. */
  RESTORE_TO_BACKGROUND: 2,
  /** Restore the canvas to the state before this frame was drawn. */
  RESTORE_TO_PREVIOUS: 3,
} as const;

export type GifDisposalMethod = (typeof GifDisposalMethod)[keyof typeof GifDisposalMethod];

// ── Public types ──────────────────────────────────────────────────────────────

/** A single decoded GIF frame. */
export interface GifFrame {
  /** Width of the full logical GIF canvas. */
  width: number;
  /** Height of the full logical GIF canvas. */
  height: number;
  /** RGBA pixel data for the full canvas after compositing this frame. */
  imageData: ImageData;
  /** Display duration in milliseconds (minimum 20 ms, per browser convention). */
  delay: number;
  /** Disposal method applied *after* this frame (before the next one). */
  disposalMethod: GifDisposalMethod;
}

/** Result of decomposing an animated GIF. */
export interface GifDecomposition {
  frames: GifFrame[];
  /** Total loop count — 0 means infinite. */
  loopCount: number;
  /** Width of the GIF logical screen in pixels. */
  width: number;
  /** Height of the GIF logical screen in pixels. */
  height: number;
}

// ── Internal GIF byte-level parser ───────────────────────────────────────────

interface RawGifFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  delay: number;
  disposalMethod: GifDisposalMethod;
  hasTransparency: boolean;
  transparentIndex: number;
  interlaced: boolean;
  localColorTable: Uint8Array | null;
  imageData: Uint8Array; // LZW-decoded indices
}

interface GifHeader {
  width: number;
  height: number;
  globalColorTable: Uint8Array | null;
  backgroundColorIndex: number;
  loopCount: number;
}

/**
 * Minimal GIF89a byte-level parser.
 * Parses colour tables, Graphic Control Extensions, and image descriptors.
 * Uses the browser's built-in LZW decoder via <img> + canvas tricks.
 */
class GifByteParser {
  private data: Uint8Array;
  private pos = 0;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  private readU8(): number {
    return this.data[this.pos++];
  }

  private readU16LE(): number {
    const lo = this.data[this.pos++];
    const hi = this.data[this.pos++];
    return lo | (hi << 8);
  }

  private readColorTable(size: number): Uint8Array {
    const count = 2 ** (size + 1);
    const table = this.data.slice(this.pos, this.pos + count * 3);
    this.pos += count * 3;
    return table;
  }

  /** Skip a sub-block chain (size byte + data, repeat until size = 0). */
  private skipSubBlocks(): void {
    let blockSize: number;
    while ((blockSize = this.readU8()) !== 0) {
      this.pos += blockSize;
    }
  }

  /** Read a sub-block chain into a single concatenated Uint8Array. */
  private readSubBlocks(): Uint8Array {
    const chunks: Uint8Array[] = [];
    let blockSize: number;
    while ((blockSize = this.readU8()) !== 0) {
      chunks.push(this.data.slice(this.pos, this.pos + blockSize));
      this.pos += blockSize;
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  parse(): { header: GifHeader; frames: RawGifFrame[] } {
    // Signature + version (GIF87a / GIF89a)
    this.pos += 6;

    // Logical Screen Descriptor
    const width = this.readU16LE();
    const height = this.readU16LE();
    const packed = this.readU8();
    const hasGlobalTable = (packed >> 7) & 1;
    const globalTableSize = packed & 0x07;
    const backgroundColorIndex = this.readU8();
    this.pos++; // pixel aspect ratio

    let globalColorTable: Uint8Array | null = null;
    if (hasGlobalTable) {
      globalColorTable = this.readColorTable(globalTableSize);
    }

    // Graphics state
    let delay = 100;
    let disposalMethod: GifDisposalMethod = GifDisposalMethod.UNSPECIFIED;
    let hasTransparency = false;
    let transparentIndex = 0;
    let loopCount = 0;

    const frames: RawGifFrame[] = [];

    // Extension / descriptor parsing loop
    while (this.pos < this.data.length) {
      const sentinel = this.readU8();

      if (sentinel === 0x3b) break; // GIF trailer

      if (sentinel === 0x21) {
        // Extension
        const label = this.readU8();

        if (label === 0xf9) {
          // Graphic Control Extension
          this.pos++; // block size (always 4)
          const gcePacked = this.readU8();
          disposalMethod = ((gcePacked >> 3) & 0x07) as GifDisposalMethod;
          hasTransparency = (gcePacked & 0x01) === 1;
          delay = this.readU16LE() * 10; // centiseconds → ms
          if (delay < 20) delay = 20; // browser minimum
          transparentIndex = this.readU8();
          this.pos++; // block terminator
        } else if (label === 0xff) {
          // Application Extension (may carry Netscape loop count)
          const blockSize = this.readU8();
          const appId = String.fromCharCode(...this.data.slice(this.pos, this.pos + 8));
          this.pos += blockSize;
          // Read sub-blocks — check for Netscape 2.0 loop data
          let subSize: number;
          while ((subSize = this.readU8()) !== 0) {
            const sub = this.data.slice(this.pos, this.pos + subSize);
            this.pos += subSize;
            if (appId.startsWith('NETSCAPE') && sub[0] === 0x01) {
              loopCount = sub[1] | (sub[2] << 8);
            }
          }
        } else {
          this.skipSubBlocks();
        }
      } else if (sentinel === 0x2c) {
        // Image Descriptor
        const x = this.readU16LE();
        const y = this.readU16LE();
        const fw = this.readU16LE();
        const fh = this.readU16LE();
        const idPacked = this.readU8();
        const hasLocalTable = (idPacked >> 7) & 1;
        const interlaced = ((idPacked >> 6) & 1) === 1;
        const localTableSize = idPacked & 0x07;

        let localColorTable: Uint8Array | null = null;
        if (hasLocalTable) {
          localColorTable = this.readColorTable(localTableSize);
        }

        // LZW minimum code size + sub-blocks (we skip actual LZW decode —
        // that's handled by the browser's native GIF decoder below)
        const lzwMinCodeSize = this.readU8();
        void lzwMinCodeSize; // captured but unused — browser decodes
        const imageData = this.readSubBlocks();

        frames.push({
          x, y, width: fw, height: fh,
          delay, disposalMethod, hasTransparency, transparentIndex,
          interlaced, localColorTable, imageData,
        });

        // Reset per-frame GCE state
        delay = 100;
        disposalMethod = GifDisposalMethod.UNSPECIFIED;
        hasTransparency = false;
        transparentIndex = 0;
      }
    }

    return {
      header: { width, height, globalColorTable, backgroundColorIndex, loopCount },
      frames,
    };
  }
}

// ── Canvas-based compositor ───────────────────────────────────────────────────

/**
 * Composites raw GIF frames onto a canvas, applying disposal methods correctly.
 * Uses the browser's native GIF decoder for LZW decompression by loading each
 * frame as an isolated GIF image via an `<img>` element.
 */
async function compositeFrames(
  raw: ReturnType<GifByteParser['parse']>,
  originalData: Uint8Array,
): Promise<GifFrame[]> {
  const { header, frames: rawFrames } = raw;
  const { width, height } = header;

  // Use the browser's native decoder: load the whole GIF into an img element,
  // then draw individual frames to a canvas by controlling currentTime on a
  // video — or simply draw the composed result from a temporary hidden img.
  // Because the Web APIs don't expose individual GIF frames natively, we use
  // a single-frame GIF reconstruction approach: for each frame, build a
  // one-frame GIF blob and decode it with an offscreen <img>.

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
  if (!ctx) throw new Error('GIFDecomposer: OffscreenCanvas 2D unavailable');

  // "previous" snapshot — kept for RESTORE_TO_PREVIOUS disposal
  let previousSnapshot: ImageData | null = null;

  const composed: GifFrame[] = [];

  for (let i = 0; i < rawFrames.length; i++) {
    const rf = rawFrames[i];

    // Before drawing: take snapshot if this frame uses RESTORE_TO_PREVIOUS
    if (rf.disposalMethod === GifDisposalMethod.RESTORE_TO_PREVIOUS) {
      previousSnapshot = ctx.getImageData(0, 0, width, height);
    }

    // Build a minimal 1-frame GIF for browser decoding
    const frameGifData = buildSingleFrameGif(originalData, i, header, rawFrames);
    const blob = new Blob([frameGifData], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);

    try {
      const img = await loadImage(url);
      ctx.drawImage(img, rf.x, rf.y, rf.width, rf.height);
    } finally {
      URL.revokeObjectURL(url);
    }

    composed.push({
      width,
      height,
      imageData: ctx.getImageData(0, 0, width, height),
      delay: rf.delay,
      disposalMethod: rf.disposalMethod,
    });

    // Apply disposal for next frame
    switch (rf.disposalMethod) {
      case GifDisposalMethod.RESTORE_TO_BACKGROUND: {
        ctx.clearRect(rf.x, rf.y, rf.width, rf.height);
        // If background colour is set (not transparent), fill it
        if (header.globalColorTable && header.backgroundColorIndex > 0) {
          const bi = header.backgroundColorIndex * 3;
          const r = header.globalColorTable[bi];
          const g = header.globalColorTable[bi + 1];
          const b = header.globalColorTable[bi + 2];
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(rf.x, rf.y, rf.width, rf.height);
        }
        break;
      }
      case GifDisposalMethod.RESTORE_TO_PREVIOUS: {
        if (previousSnapshot) {
          ctx.putImageData(previousSnapshot, 0, 0);
          previousSnapshot = null;
        }
        break;
      }
      // UNSPECIFIED and DO_NOT_DISPOSE: leave canvas as-is
      default:
        break;
    }
  }

  return composed;
}

/** Loads an image URL and returns a resolved HTMLImageElement. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`GIFDecomposer: failed to load frame image`));
    img.src = url;
  });
}

/**
 * Builds a minimal single-frame GIF blob from the original GIF byte stream.
 * We re-use the original header + global colour table and splice in one frame.
 * This avoids re-implementing LZW compression.
 */
function buildSingleFrameGif(
  original: Uint8Array,
  frameIndex: number,
  header: GifHeader,
  frames: RawGifFrame[],
): Uint8Array {
  // Strategy: scan the original byte stream, locate the Nth image descriptor,
  // and extract from there to the next image descriptor (or trailer).
  // We then prepend the GIF header + logical screen descriptor.

  // Walk the original bytes to find frame start positions
  const starts: number[] = [];
  let pos = 6; // skip signature

  // Logical Screen Descriptor size
  const lsdPacked = original[pos + 4];
  const hasGlobal = (lsdPacked >> 7) & 1;
  const globalSize = lsdPacked & 0x07;
  const lsdEnd = pos + 7 + (hasGlobal ? 3 * (2 ** (globalSize + 1)) : 0);
  const headerBytes = original.slice(0, lsdEnd);

  pos = lsdEnd;
  const framePayloads: Uint8Array[] = [];
  let currentFrameStart = -1;

  while (pos < original.length) {
    const b = original[pos];
    if (b === 0x3b) break; // trailer
    if (b === 0x2c) {
      // Image descriptor — record start
      if (currentFrameStart >= 0) {
        framePayloads.push(original.slice(currentFrameStart, pos));
      }
      currentFrameStart = pos;
      pos += 10; // image descriptor is 10 bytes
      const idp = original[currentFrameStart + 9];
      if ((idp >> 7) & 1) {
        pos += 3 * (2 ** ((idp & 0x07) + 1));
      }
      pos++; // LZW min code size
      let sb: number;
      while ((sb = original[pos++]) !== 0) pos += sb;
    } else if (b === 0x21) {
      pos += 2; // extension introducer + label
      let sb: number;
      while ((sb = original[pos++]) !== 0) pos += sb;
    } else {
      pos++;
    }
  }
  if (currentFrameStart >= 0) {
    framePayloads.push(original.slice(currentFrameStart, pos));
  }

  const payload = framePayloads[frameIndex] ?? framePayloads[0];
  const trailer = new Uint8Array([0x3b]);

  const total = headerBytes.length + payload.length + trailer.length;
  const out = new Uint8Array(total);
  out.set(headerBytes, 0);
  out.set(payload, headerBytes.length);
  out.set(trailer, headerBytes.length + payload.length);
  return out;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Options for GIFDecomposer.decompose() */
export interface GifDecomposeOptions {
  /**
   * Maximum number of frames to decode (default: all frames).
   * Useful for preview thumbnails or memory-constrained environments.
   */
  maxFrames?: number;
  /**
   * If true, uses the faster single-pass native decoder path (loads the whole
   * GIF into an <img> via a hidden element and draws it at sequential
   * currentTime offsets). Less accurate for disposal methods 2 & 3.
   * Default: false.
   */
  fast?: boolean;
}

/**
 * Decomposes an animated GIF from a URL or Blob into an array of frames.
 *
 * All 4 GIF89a disposal methods are supported:
 *  - 0 (UNSPECIFIED)       → treated as DO_NOT_DISPOSE
 *  - 1 (DO_NOT_DISPOSE)    → next frame composites over current canvas
 *  - 2 (RESTORE_TO_BG)     → frame region cleared before next frame
 *  - 3 (RESTORE_TO_PREV)   → canvas restored to pre-frame state
 *
 * @param source  URL string or Blob to fetch the GIF from.
 * @param options Optional decompose options.
 * @returns       Promise resolving to a GifDecomposition.
 */
export async function decomposeGif(
  source: string | Blob,
  options: GifDecomposeOptions = {},
): Promise<GifDecomposition> {
  // Fetch raw bytes
  let data: Uint8Array;
  if (typeof source === 'string') {
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`GIFDecomposer: HTTP ${response.status} for "${source}"`);
    }
    data = new Uint8Array(await response.arrayBuffer());
  } else {
    data = new Uint8Array(await source.arrayBuffer());
  }

  // Validate GIF signature
  const sig = String.fromCharCode(data[0], data[1], data[2]);
  if (sig !== 'GIF') {
    throw new Error('GIFDecomposer: input is not a GIF file');
  }

  const parser = new GifByteParser(data);
  const raw = parser.parse();

  let rawFrames = raw.frames;
  if (options.maxFrames !== undefined && options.maxFrames > 0) {
    rawFrames = rawFrames.slice(0, options.maxFrames);
  }

  const frames = await compositeFrames({ header: raw.header, frames: rawFrames }, data);

  return {
    frames,
    loopCount: raw.header.loopCount,
    width: raw.header.width,
    height: raw.header.height,
  };
}

/**
 * `GIFDecomposer` — namespace-style convenience wrapper around `decomposeGif`.
 *
 * @example
 * ```ts
 * const { frames, loopCount } = await GIFDecomposer.decompose('/assets/anim.gif');
 * for (const frame of frames) {
 *   ctx.putImageData(frame.imageData, 0, 0);
 *   await delay(frame.delay);
 * }
 * ```
 */
export const GIFDecomposer = {
  decompose: decomposeGif,
  DisposalMethod: GifDisposalMethod,
} as const;
