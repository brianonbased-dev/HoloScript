/**
 * Graph-cache envelope I/O that can read metadata without materializing
 * `graphJson` on the V8 heap.
 *
 * Publication already streams the escaped graph as the last write step. Status
 * and age checks used to `readFileSync(..., 'utf-8')` + `JSON.parse` the whole
 * envelope, which on a 20k HoloScript graph is ~367 MiB of string plus another
 * ~340 MiB unescaped `graphJson` — enough to OOM an 8 GB Jetson sitting next to
 * llama. Metadata (roots, coverage, fileHashes, timestamp) is a few MiB.
 */
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const GRAPH_JSON_KEY = 'graphJson';
export const GRAPH_CACHE_METADATA_MAX_BYTES = 64 * 1024 * 1024;
export const GRAPH_CACHE_SIDECAR_MAX_BYTES = 8 * 1024 * 1024;

export interface GraphCacheEnvelopeSplit<TMetadata extends object = Record<string, unknown>> {
  metadata: TMetadata;
  graphJson?: string;
}

export function graphCacheMetaPath(graphFile: string): string {
  if (graphFile.endsWith(`${path.sep}graph-cache.json`) || graphFile.endsWith('/graph-cache.json')) {
    return graphFile.slice(0, -'graph-cache.json'.length) + 'graph-cache.meta.json';
  }
  if (graphFile.endsWith('graph-cache.json')) {
    return `${graphFile.slice(0, -'graph-cache.json'.length)}graph-cache.meta.json`;
  }
  return `${graphFile}.meta.json`;
}

function replaceFileAtomically(finalPath: string, tempPath: string): void {
  try {
    fs.renameSync(tempPath, finalPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'EEXIST' && code !== 'EPERM') throw error;
    fs.unlinkSync(finalPath);
    fs.renameSync(tempPath, finalPath);
  }
}

export function writeGraphCacheMetaSidecar(graphFile: string, metadata: object): void {
  const metaPath = graphCacheMetaPath(graphFile);
  const dir = path.dirname(metaPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${metaPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.writeFileSync(tempPath, `${JSON.stringify(metadata)}\n`, 'utf-8');
    replaceFileAtomically(metaPath, tempPath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
}

export function readGraphCacheMetaSidecar<TMetadata extends object = Record<string, unknown>>(
  graphFile: string
): TMetadata | null {
  const metaPath = graphCacheMetaPath(graphFile);
  try {
    const stat = fs.statSync(metaPath);
    if (stat.size > GRAPH_CACHE_SIDECAR_MAX_BYTES) return null;
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as TMetadata;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isJsonWs(byte: number): boolean {
  return byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20;
}

/**
 * Locate a top-level JSON string field without parsing values.
 * `valueStart`/`valueEnd` are the indexes of the opening/closing quotes.
 */
export function findTopLevelJsonStringField(
  buffer: Buffer,
  fieldName: string
): { keyStart: number; quoteStart: number; quoteEnd: number } | null {
  if (buffer.length < 2 || buffer[0] !== 0x7b) return null;
  const keyBytes = Buffer.from(`"${fieldName}"`, 'ascii');
  let depth = 0;
  let inString = false;
  let escape = false;
  let expectingKey = false;

  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (byte === 0x5c) {
        escape = true;
        continue;
      }
      if (byte === 0x22) inString = false;
      continue;
    }
    if (isJsonWs(byte)) continue;
    if (byte === 0x7b || byte === 0x5b) {
      depth += 1;
      if (byte === 0x7b) expectingKey = true;
      continue;
    }
    if (byte === 0x7d || byte === 0x5d) {
      depth -= 1;
      expectingKey = false;
      continue;
    }
    if (byte === 0x3a) {
      expectingKey = false;
      continue;
    }
    if (byte === 0x2c) {
      expectingKey = depth === 1;
      continue;
    }
    if (byte === 0x22) {
      if (expectingKey && depth === 1 && buffer.subarray(index, index + keyBytes.length).equals(keyBytes)) {
        const keyStart = index;
        let cursor = index + keyBytes.length;
        while (cursor < buffer.length && isJsonWs(buffer[cursor]!)) cursor += 1;
        if (buffer[cursor] !== 0x3a) return null;
        cursor += 1;
        while (cursor < buffer.length && isJsonWs(buffer[cursor]!)) cursor += 1;
        if (buffer[cursor] !== 0x22) return null;
        const quoteStart = cursor;
        let quoteEnd = quoteStart + 1;
        let valueEscape = false;
        for (; quoteEnd < buffer.length; quoteEnd += 1) {
          const valueByte = buffer[quoteEnd]!;
          if (valueEscape) {
            valueEscape = false;
            continue;
          }
          if (valueByte === 0x5c) {
            valueEscape = true;
            continue;
          }
          if (valueByte === 0x22) {
            return { keyStart, quoteStart, quoteEnd };
          }
        }
        return null;
      }
      inString = true;
      expectingKey = false;
    }
  }
  return null;
}

function stripTopLevelStringField(
  buffer: Buffer,
  keyStart: number,
  quoteEnd: number
): Buffer {
  let from = keyStart;
  let cursor = keyStart - 1;
  while (cursor >= 0 && isJsonWs(buffer[cursor]!)) cursor -= 1;
  if (cursor >= 0 && buffer[cursor] === 0x2c) from = cursor;

  let to = quoteEnd + 1;
  const prefix = buffer.subarray(0, from);
  let suffix = buffer.subarray(to);

  let prefixTrim = prefix.length;
  while (prefixTrim > 0 && isJsonWs(prefix[prefixTrim - 1]!)) prefixTrim -= 1;
  const prefixEndsWithOpen = prefixTrim > 0 && prefix[prefixTrim - 1] === 0x7b;

  let suffixOffset = 0;
  while (suffixOffset < suffix.length && isJsonWs(suffix[suffixOffset]!)) suffixOffset += 1;
  const suffixStartsWithComma = suffixOffset < suffix.length && suffix[suffixOffset] === 0x2c;
  const suffixStartsWithClose = suffixOffset < suffix.length && suffix[suffixOffset] === 0x7d;

  if (prefixEndsWithOpen && suffixStartsWithComma) {
    suffixOffset += 1;
    suffix = suffix.subarray(suffixOffset);
  } else if (suffixStartsWithClose && prefixTrim > 0 && prefix[prefixTrim - 1] === 0x2c) {
    return Buffer.concat([prefix.subarray(0, prefixTrim - 1), suffix.subarray(suffixOffset)]);
  }

  return Buffer.concat([prefix, suffix]);
}

export function parseGraphCacheEnvelopeBuffer<TMetadata extends object = Record<string, unknown>>(
  buffer: Buffer,
  options: { includeGraphJson?: boolean } = {}
): GraphCacheEnvelopeSplit<TMetadata> {
  const field = findTopLevelJsonStringField(buffer, GRAPH_JSON_KEY);
  if (!field) {
    const parsed = JSON.parse(buffer.toString('utf-8')) as TMetadata & { graphJson?: string };
    if (options.includeGraphJson === false && parsed && typeof parsed === 'object') {
      const { graphJson: _ignored, ...metadata } = parsed as TMetadata & { graphJson?: string };
      return { metadata: metadata as TMetadata };
    }
    return {
      metadata: parsed,
      ...(typeof parsed.graphJson === 'string' && options.includeGraphJson !== false
        ? { graphJson: parsed.graphJson }
        : {}),
    };
  }

  const metadataBuffer = stripTopLevelStringField(buffer, field.keyStart, field.quoteEnd);
  const metadata = JSON.parse(metadataBuffer.toString('utf-8')) as TMetadata;
  if (options.includeGraphJson === false) {
    return { metadata };
  }
  const token = buffer.subarray(field.quoteStart, field.quoteEnd + 1);
  const graphJson = JSON.parse(token.toString('utf-8')) as string;
  return { metadata, graphJson };
}

export function hashGraphCacheBuffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

const MAX_METADATA_BYTES = GRAPH_CACHE_METADATA_MAX_BYTES;
const STREAM_CHUNK_BYTES = 64 * 1024;
const GRAPH_JSON_KEY_TOKEN = Buffer.from(`"${GRAPH_JSON_KEY}"`, 'ascii');
const GRAPH_JSON_EMPTY_FIELD = Buffer.from(`"${GRAPH_JSON_KEY}":""`, 'ascii');

export function graphCacheSidecarTrustworthy(
  cacheFile: string,
  sidecar: { version?: unknown; cacheGenerationId?: string } | null,
  options: { generationId?: string; graphBytes?: number } = {}
): boolean {
  if (!sidecar || (sidecar.version !== 1 && sidecar.version !== 2)) return false;
  if (options.generationId && sidecar.cacheGenerationId !== options.generationId) return false;
  let graphStat: fs.Stats;
  try {
    graphStat = fs.statSync(cacheFile);
  } catch {
    return false;
  }
  if (
    options.graphBytes !== undefined &&
    Number.isFinite(options.graphBytes) &&
    graphStat.size !== options.graphBytes
  ) {
    return false;
  }
  try {
    const metaStat = fs.statSync(graphCacheMetaPath(cacheFile));
    if (graphStat.mtimeMs > metaStat.mtimeMs) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Read envelope metadata without allocating `graphJson`. Production envelopes
 * write `graphJson` last; this replaces that string with `""` while scanning
 * so a 367 MiB cache does not become a 367 MiB V8 string on status/age.
 */
export function readGraphCacheMetadataFromFile<TMetadata extends object = Record<string, unknown>>(
  cacheFile: string
): TMetadata | null {
  let fd: number | undefined;
  try {
    fd = fs.openSync(cacheFile, 'r');
    const replaced = replaceTopLevelGraphJsonWithEmpty(fd);
    if (!replaced) return null;
    const parsed = JSON.parse(replaced.toString('utf-8')) as TMetadata & { graphJson?: string };
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const { graphJson: _ignored, ...metadata } = parsed as TMetadata & { graphJson?: string };
    return metadata as TMetadata;
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {
        // The parse result (or null) is what callers act on.
      }
    }
  }
}

function replaceTopLevelGraphJsonWithEmpty(fd: number): Buffer | null {
  const scratch = Buffer.allocUnsafe(STREAM_CHUNK_BYTES);
  let window = Buffer.alloc(0);
  let eof = false;
  const dest = Buffer.allocUnsafe(MAX_METADATA_BYTES);
  let destUsed = 0;

  const refill = (): void => {
    if (eof) return;
    const n = fs.readSync(fd, scratch, 0, STREAM_CHUNK_BYTES, null);
    if (n <= 0) {
      eof = true;
      return;
    }
    const next = scratch.subarray(0, n);
    window = window.length === 0 ? Buffer.from(next) : Buffer.concat([window, next]);
  };

  const ensure = (need: number): boolean => {
    while (window.length < need && !eof) refill();
    return window.length >= need;
  };

  const emit = (buf: Buffer): boolean => {
    if (buf.length === 0) return true;
    if (destUsed + buf.length > MAX_METADATA_BYTES) return false;
    buf.copy(dest, destUsed);
    destUsed += buf.length;
    return true;
  };

  const emitByte = (byte: number): boolean => {
    if (destUsed + 1 > MAX_METADATA_BYTES) return false;
    dest[destUsed] = byte;
    destUsed += 1;
    return true;
  };

  const skipJsonStringContents = (): boolean => {
    let escape = false;
    while (true) {
      if (window.length === 0) {
        refill();
        if (window.length === 0) return false;
      }
      let consumed = 0;
      for (; consumed < window.length; consumed += 1) {
        const byte = window[consumed]!;
        if (escape) {
          escape = false;
          continue;
        }
        if (byte === 0x5c) {
          escape = true;
          continue;
        }
        if (byte === 0x22) {
          window = window.subarray(consumed + 1);
          return true;
        }
      }
      window = Buffer.alloc(0);
    }
  };

  const tryReplaceGraphJsonField = (): boolean => {
    if (!ensure(GRAPH_JSON_KEY_TOKEN.length)) return false;
    if (!window.subarray(0, GRAPH_JSON_KEY_TOKEN.length).equals(GRAPH_JSON_KEY_TOKEN)) {
      return false;
    }
    let cursor = GRAPH_JSON_KEY_TOKEN.length;
    const peek = (index: number): number | undefined => {
      if (!ensure(index + 1)) return undefined;
      return window[index];
    };
    while (true) {
      const byte = peek(cursor);
      if (byte === undefined) return false;
      if (isJsonWs(byte)) {
        cursor += 1;
        continue;
      }
      break;
    }
    if (peek(cursor) !== 0x3a) return false;
    cursor += 1;
    while (true) {
      const byte = peek(cursor);
      if (byte === undefined) return false;
      if (isJsonWs(byte)) {
        cursor += 1;
        continue;
      }
      break;
    }
    if (peek(cursor) !== 0x22) return false;
    cursor += 1;
    if (!emit(GRAPH_JSON_EMPTY_FIELD)) return false;
    window = window.subarray(cursor);
    if (!skipJsonStringContents()) {
      throw new Error('truncated graphJson string');
    }
    return true;
  };

  let depth = 0;
  let inString = false;
  let escape = false;
  let expectingKey = false;

  while (true) {
    if (window.length === 0) {
      refill();
      if (window.length === 0) break;
    }
    const byte = window[0]!;
    if (
      !inString &&
      expectingKey &&
      depth === 1 &&
      byte === 0x22 &&
      tryReplaceGraphJsonField()
    ) {
      expectingKey = false;
      continue;
    }
    if (!emitByte(byte)) return null;
    window = window.subarray(1);

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (byte === 0x5c) {
        escape = true;
        continue;
      }
      if (byte === 0x22) inString = false;
      continue;
    }
    if (isJsonWs(byte)) continue;
    if (byte === 0x7b || byte === 0x5b) {
      depth += 1;
      if (byte === 0x7b) expectingKey = true;
      continue;
    }
    if (byte === 0x7d || byte === 0x5d) {
      depth -= 1;
      expectingKey = false;
      continue;
    }
    if (byte === 0x3a) {
      expectingKey = false;
      continue;
    }
    if (byte === 0x2c) {
      expectingKey = depth === 1;
      continue;
    }
    if (byte === 0x22) {
      inString = true;
      expectingKey = false;
    }
  }

  if (destUsed === 0) return null;
  return Buffer.from(dest.subarray(0, destUsed));
}
