/**
 * Compact on-disk form of a CodebaseGraph's scanned files (serialized graph v3).
 *
 * Why (2026-10-05): HoloScript's graph-cache.json was 372 MB, 88% of it the
 * `files` array: every call record repeated its file's path (as filePath and as
 * the callerId prefix) and every record repeated its field names. Reading it
 * needs ~2 GB of heap, more than the Jetson (7.6 GB total, ~1.8 GB free) has
 * to spare. This codec writes each file's path once, stores each record list
 * as a column table, and interns repeated strings (callee names, kinds,
 * languages) in one shared table. decodeFiles(encodeFiles(files)) reproduces
 * the JSON value of every file exactly; CompactGraphCodec.test.ts proves it.
 */
import type { ScannedFile } from './types';

export const COMPACT_GRAPH_FORMAT = 'holoscript.compact-files.v1';

/**
 * A record list as rows over a shared key list. Each distinct key order seen
 * ("shape") is stored once; a row is [shapeId, ...values in that shape's key
 * order], so decoding reproduces every record's keys in their original order
 * and JSON.stringify of a decoded file is byte-identical to the original.
 * `s` lists key indexes whose values are interned strings.
 */
interface Table {
  k: string[];
  s: number[];
  shapes: number[][];
  r: unknown[][];
}

export interface CompactFiles {
  format: typeof COMPACT_GRAPH_FORMAT;
  strings: string[];
  files: Array<Record<string, unknown>>;
}

/** A string column value equal to the owning file's path. */
const SAME_PATH = 0;

class StringTable {
  readonly values: string[] = [];
  private readonly index = new Map<string, number>();
  id(value: string): number {
    let id = this.index.get(value);
    if (id === undefined) {
      id = this.values.length;
      this.values.push(value);
      this.index.set(value, id);
    }
    return id;
  }
}

function isRecordList(value: unknown): value is Array<Record<string, unknown>> {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
  );
}

/**
 * Encode one string relative to the file path: the path itself becomes
 * SAME_PATH, a `${path}:` prefix becomes a negative-free marker string
 * "\u0001rest", everything else is interned. Returned value is a string-table
 * index offset by 1 (so 0 stays SAME_PATH).
 */
function encodeString(value: string, filePath: string, strings: StringTable): number {
  if (value === filePath) return SAME_PATH;
  const prefixed = value.startsWith(`${filePath}:`)
    ? `\u0001${value.slice(filePath.length + 1)}`
    : value;
  return strings.id(prefixed) + 1;
}

function decodeString(code: number, filePath: string, strings: string[]): string {
  if (code === SAME_PATH) return filePath;
  const raw = strings[code - 1];
  return raw.charCodeAt(0) === 1 ? `${filePath}:${raw.slice(1)}` : raw;
}

function encodeTable(
  rows: Array<Record<string, unknown>>,
  filePath: string,
  strings: StringTable
): Table {
  const keys: string[] = [];
  const keyIndex = new Map<string, number>();
  const nonString = new Set<number>();
  const shapes: number[][] = [];
  const shapeIndex = new Map<string, number>();
  const rowShapes: number[] = [];
  for (const row of rows) {
    const shape: number[] = [];
    for (const [key, value] of Object.entries(row)) {
      // JSON drops undefined-valued keys; so must we, or they return as null.
      if (value === undefined) continue;
      let i = keyIndex.get(key);
      if (i === undefined) {
        i = keys.length;
        keys.push(key);
        keyIndex.set(key, i);
      }
      if (typeof value !== 'string') nonString.add(i);
      shape.push(i);
    }
    const shapeKey = shape.join(',');
    let id = shapeIndex.get(shapeKey);
    if (id === undefined) {
      id = shapes.length;
      shapes.push(shape);
      shapeIndex.set(shapeKey, id);
    }
    rowShapes.push(id);
  }
  const isString = (i: number) => !nonString.has(i);
  return {
    k: keys,
    s: keys.map((_, i) => i).filter(isString),
    shapes,
    r: rows.map((row, rowIndex) => {
      const out: unknown[] = [rowShapes[rowIndex]];
      for (const i of shapes[rowShapes[rowIndex]]) {
        const value = row[keys[i]];
        out.push(isString(i) ? encodeString(value as string, filePath, strings) : value);
      }
      return out;
    }),
  };
}

function decodeTable(table: Table, filePath: string, strings: string[]): Array<Record<string, unknown>> {
  const isString = new Set(table.s);
  return table.r.map((values) => {
    const row: Record<string, unknown> = {};
    const shape = table.shapes[values[0] as number];
    for (let j = 0; j < shape.length; j++) {
      const i = shape[j];
      const value = values[j + 1];
      row[table.k[i]] = isString.has(i) ? decodeString(value as number, filePath, strings) : value;
    }
    return row;
  });
}

export function encodeFiles(files: readonly ScannedFile[]): CompactFiles {
  const strings = new StringTable();
  const encoded = files.map((file) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(file as unknown as Record<string, unknown>)) {
      if (value === undefined) continue;
      out[key] = isRecordList(value)
        ? { t: encodeTable(value, file.path, strings) }
        : value;
    }
    return out;
  });
  return { format: COMPACT_GRAPH_FORMAT, strings: strings.values, files: encoded };
}

export function decodeFiles(compact: CompactFiles): ScannedFile[] {
  if (compact.format !== COMPACT_GRAPH_FORMAT) {
    throw new Error(`Unknown compact graph format: ${String(compact.format)}`);
  }
  return compact.files.map((encoded) => {
    const filePath = encoded.path as string;
    const file: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(encoded)) {
      const table =
        value !== null && typeof value === 'object' && !Array.isArray(value)
          ? (value as { t?: Table }).t
          : undefined;
      file[key] = table && Array.isArray(table.k) && Array.isArray(table.shapes) ? decodeTable(table, filePath, compact.strings) : value;
    }
    return file as unknown as ScannedFile;
  });
}
