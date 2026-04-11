/**
 * Schema-based JSON compression
 *
 * Compresses JSON by removing schema-inferrable data and using compact keys.
 * Works in conjunction with CBOR encoding for maximum size reduction.
 *
 * @version 1.0.0
 */

import type { MVCObject, _MVCType } from '../types';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Remove default values defined in schema */
  removeDefaults?: boolean;

  /** Use compact field names */
  compactKeys?: boolean;

  /** Remove null/undefined fields */
  removeNulls?: boolean;

  /** Maximum precision for floating point numbers */
  floatPrecision?: number;
}

/**
 * Compression result with metadata
 */
export interface CompressionResult {
  /** Compressed data */
  compressed: unknown;

  /** Original size (bytes) */
  originalSize: number;

  /** Compressed size (bytes) */
  compressedSize: number;

  /** Compression ratio (0-1, higher is better) */
  compressionRatio: number;
}

/**
 * Field key mapping for compact representation
 */
const COMPACT_KEY_MAP: Record<string, string> = {
  // Common fields
  crdtType: 't',
  crdtId: 'i',
  timestamp: 'ts',
  lastUpdated: 'lu',
  vectorClock: 'vc',
  agentDid: 'agd',
  actorDid: 'acd',
  operationId: 'oi',

  // DecisionHistory
  decisions: 'd',
  description: 'ds',
  choice: 'ch',
  parentId: 'pi',
  outcome: 'o',
  confidence: 'cf',

  // ActiveTaskState
  tasks: 'tk',
  taskTags: 'tt',
  statusRegisters: 'sr',
  title: 'ti',
  status: 'st',
  priority: 'pr',
  createdAt: 'ca',
  updatedAt: 'ua',
  assignedTo: 'at',
  estimatedDuration: 'ed',
  actualDuration: 'actd',

  // UserPreferences
  spatial: 'sp',
  communication: 'cm',
  visual: 'vs',
  privacy: 'pv',
  lwwMetadata: 'lm',

  // SpatialContext
  primaryAnchor: 'pa',
  currentPose: 'cp',
  recentAnchors: 'ra',
  environment: 'env',
  coordinate: 'co',
  latitude: 'lat',
  longitude: 'lng',
  altitude: 'alt',
  position: 'pos',
  orientation: 'ori',

  // EvidenceTrail
  vcpMetadata: 'vm',
  entries: 'en',
  headHash: 'hh',
  content: 'cn',
  hash: 'h',
  previousHash: 'ph',
  sequence: 'sq',
};

/**
 * Reverse key map for decompression
 */
const REVERSE_KEY_MAP = Object.fromEntries(Object.entries(COMPACT_KEY_MAP).map(([k, v]) => [v, k]));

/**
 * Compress MVC object using schema-based compression
 */
export function compressMVC(obj: MVCObject, options: CompressionOptions = {}): CompressionResult {
  const originalJSON = JSON.stringify(obj);
  const originalSize = new TextEncoder().encode(originalJSON).length;

  let compressed: unknown = structuredClone(obj);

  // Apply compression strategies
  if (options.removeNulls !== false) {
    compressed = removeNullish(compressed);
  }

  if (options.floatPrecision !== undefined) {
    compressed = roundFloats(compressed, options.floatPrecision);
  }

  if (options.compactKeys !== false) {
    compressed = compactKeys(compressed);
  }

  const compressedJSON = JSON.stringify(compressed);
  const compressedSize = new TextEncoder().encode(compressedJSON).length;

  return {
    compressed,
    originalSize,
    compressedSize,
    compressionRatio: 1 - compressedSize / originalSize,
  };
}

/**
 * Decompress MVC object
 */
export function decompressMVC(compressed: unknown): unknown {
  let decompressed = structuredClone(compressed);

  // Restore original keys
  decompressed = restoreKeys(decompressed);

  return decompressed;
}

/**
 * Remove null/undefined values recursively
 */
function removeNullish(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeNullish);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (value !== null && value !== undefined) {
        result[key] = removeNullish(value);
      }
    }
    return result;
  }

  return obj;
}

/**
 * Round floating point numbers to specified precision
 */
function roundFloats(obj: unknown, precision: number): unknown {
  if (typeof obj === 'number' && !Number.isInteger(obj)) {
    return Number(obj.toFixed(precision));
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => roundFloats(item, precision));
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = roundFloats(value, precision);
    }
    return result;
  }

  return obj;
}

/**
 * Replace keys with compact versions
 */
function compactKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(compactKeys);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const compactKey = COMPACT_KEY_MAP[key] ?? key;
      result[compactKey] = compactKeys(value);
    }
    return result;
  }

  return obj;
}

/**
 * Restore original keys from compact versions
 */
function restoreKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(restoreKeys);
  }

  if (typeof obj === 'object' && obj !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const originalKey = REVERSE_KEY_MAP[key] ?? key;
      result[originalKey] = restoreKeys(value);
    }
    return result;
  }

  return obj;
}

/**
 * Calculate compression statistics
 */
export function getCompressionStats(results: CompressionResult[]): {
  totalOriginal: number;
  totalCompressed: number;
  averageRatio: number;
  bestRatio: number;
  worstRatio: number;
} {
  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
  const ratios = results.map((r) => r.compressionRatio);

  return {
    totalOriginal,
    totalCompressed,
    averageRatio: ratios.reduce((sum, r) => sum + r, 0) / ratios.length,
    bestRatio: Math.max(...ratios),
    worstRatio: Math.min(...ratios),
  };
}
