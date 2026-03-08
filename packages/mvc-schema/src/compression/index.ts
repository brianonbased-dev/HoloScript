/**
 * @holoscript/mvc-schema - Compression pipeline
 *
 * Two-stage compression for maximum size reduction:
 * 1. Schema-based JSON compression (remove redundancy)
 * 2. CBOR binary encoding (compact representation)
 *
 * Target: <2KB per object, <10KB total for all 5 MVC objects
 *
 * @packageDocumentation
 */

import type { MVCObject } from '../types';
import { compressMVC, decompressMVC, type CompressionOptions, type CompressionResult } from './schema-compression';
import { encodeCBOR, decodeCBOR, encodeCBORBase64, decodeCBORBase64, validateSize, type CBOROptions, type CBORResult } from './cbor-encoding';

export { compressMVC, decompressMVC, type CompressionOptions, type CompressionResult };
export { encodeCBOR, decodeCBOR, encodeCBORBase64, decodeCBORBase64, validateSize, type CBOROptions, type CBORResult };

/**
 * Full compression pipeline result
 */
export interface FullCompressionResult {
  /** Schema compression stage */
  schemaCompression: CompressionResult;

  /** CBOR encoding stage */
  cborEncoding: CBORResult;

  /** Final compressed binary data */
  compressed: Uint8Array;

  /** Original JSON size */
  originalSize: number;

  /** Final compressed size */
  finalSize: number;

  /** Total compression ratio */
  totalCompressionRatio: number;

  /** Size validation against target */
  validation: {
    valid: boolean;
    size: number;
    target: number;
    message: string;
  };
}

/**
 * Full compression pipeline: Schema compression + CBOR encoding
 */
export function compressMVCFull(
  obj: MVCObject,
  options: {
    compression?: CompressionOptions;
    cbor?: CBOROptions;
    sizeTarget?: number;
  } = {}
): FullCompressionResult {
  const sizeTarget = options.sizeTarget ?? 2048; // Default 2KB target

  // Stage 1: Schema-based compression
  const schemaCompression = compressMVC(obj, options.compression);

  // Stage 2: CBOR encoding
  const cborEncoding = encodeCBOR(schemaCompression.compressed, options.cbor);

  // Calculate totals
  const originalSize = new TextEncoder().encode(JSON.stringify(obj)).length;
  const finalSize = cborEncoding.cborSize;
  const totalCompressionRatio = 1 - finalSize / originalSize;

  // Validate size target
  const validation = validateSize(cborEncoding.encoded, sizeTarget, obj.crdtType);

  return {
    schemaCompression,
    cborEncoding,
    compressed: cborEncoding.encoded,
    originalSize,
    finalSize,
    totalCompressionRatio,
    validation,
  };
}

/**
 * Full decompression pipeline: CBOR decode + Schema decompression
 */
export function decompressMVCFull<T extends MVCObject = MVCObject>(
  compressed: Uint8Array
): T {
  // Stage 1: CBOR decode
  const schemaCompressed = decodeCBOR(compressed);

  // Stage 2: Schema decompression
  const decompressed = decompressMVC(schemaCompressed);

  return decompressed as T;
}

/**
 * Compress MVC object to base64 string (for text transmission)
 */
export function compressMVCToBase64(
  obj: MVCObject,
  options: {
    compression?: CompressionOptions;
    cbor?: CBOROptions;
  } = {}
): string {
  const schemaCompression = compressMVC(obj, options.compression);
  return encodeCBORBase64(schemaCompression.compressed, options.cbor);
}

/**
 * Decompress MVC object from base64 string
 */
export function decompressMVCFromBase64<T extends MVCObject = MVCObject>(
  base64: string
): T {
  const schemaCompressed = decodeCBORBase64(base64);
  return decompressMVC(schemaCompressed) as T;
}

/**
 * Batch compress all 5 MVC objects with aggregate statistics
 */
export function compressMVCBatch(
  objects: MVCObject[],
  options: {
    compression?: CompressionOptions;
    cbor?: CBOROptions;
    sizeTarget?: number;
    totalSizeTarget?: number;
  } = {}
): {
  results: FullCompressionResult[];
  totalOriginalSize: number;
  totalFinalSize: number;
  averageCompressionRatio: number;
  allValid: boolean;
  totalSizeTarget: number;
  exceedsTotal: boolean;
} {
  const totalSizeTarget = options.totalSizeTarget ?? 10240; // Default 10KB total

  const results = objects.map((obj) => compressMVCFull(obj, options));

  const totalOriginalSize = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalFinalSize = results.reduce((sum, r) => sum + r.finalSize, 0);
  const averageCompressionRatio =
    results.reduce((sum, r) => sum + r.totalCompressionRatio, 0) / results.length;

  const allValid = results.every((r) => r.validation.valid);
  const exceedsTotal = totalFinalSize > totalSizeTarget;

  return {
    results,
    totalOriginalSize,
    totalFinalSize,
    averageCompressionRatio,
    allValid,
    totalSizeTarget,
    exceedsTotal,
  };
}
