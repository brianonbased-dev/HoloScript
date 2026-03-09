/**
 * CBOR encoding for MVC objects
 *
 * Uses CBOR (Concise Binary Object Representation) for space-efficient
 * binary serialization. Combined with schema compression for maximum efficiency.
 *
 * @version 1.0.0
 */

import { encode, decode } from 'cbor-x';

/**
 * CBOR encoding options
 */
export interface CBOROptions {
  /** Use packed encoding (more compact) */
  packed?: boolean;

  /** Use shared structure optimization */
  useRecords?: boolean;

  /** Maximum encoding buffer size (bytes) */
  maxBufferSize?: number;
}

/**
 * CBOR encoding result
 */
export interface CBORResult {
  /** Encoded binary data */
  encoded: Uint8Array;

  /** Original JSON size (bytes) */
  jsonSize: number;

  /** CBOR size (bytes) */
  cborSize: number;

  /** Compression ratio vs JSON */
  compressionRatio: number;
}

/**
 * Encode object to CBOR
 */
export function encodeCBOR(obj: unknown, options: CBOROptions = {}): CBORResult {
  // Calculate JSON size for comparison
  const jsonSize = new TextEncoder().encode(JSON.stringify(obj)).length;

  // Encode to CBOR (cbor-x v1.6 only accepts value parameter)
  const encoded = encode(obj);

  const cborSize = encoded.length;

  // Check size limit
  if (options.maxBufferSize && cborSize > options.maxBufferSize) {
    throw new Error(`CBOR encoding exceeds maximum size: ${cborSize} > ${options.maxBufferSize}`);
  }

  return {
    encoded,
    jsonSize,
    cborSize,
    compressionRatio: 1 - cborSize / jsonSize,
  };
}

/**
 * Decode CBOR to object
 */
export function decodeCBOR<T = unknown>(encoded: Uint8Array): T {
  try {
    return decode(encoded) as T;
  } catch (error) {
    throw new Error(
      `CBOR decoding failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Encode object to base64-encoded CBOR (for text transmission)
 */
export function encodeCBORBase64(obj: unknown, options: CBOROptions = {}): string {
  const { encoded } = encodeCBOR(obj, options);
  return Buffer.from(encoded).toString('base64');
}

/**
 * Decode base64-encoded CBOR
 */
export function decodeCBORBase64<T = unknown>(base64: string): T {
  const buffer = Buffer.from(base64, 'base64');
  return decodeCBOR<T>(new Uint8Array(buffer));
}

/**
 * Validate CBOR encoding is within size target
 */
export function validateSize(
  encoded: Uint8Array,
  target: number,
  label: string = 'object'
): { valid: boolean; size: number; target: number; message: string } {
  const size = encoded.length;
  const valid = size <= target;

  return {
    valid,
    size,
    target,
    message: valid
      ? `${label} size ${size}B is within target ${target}B`
      : `${label} size ${size}B exceeds target ${target}B by ${size - target}B`,
  };
}

/**
 * Batch encode multiple MVC objects with size tracking
 */
export function batchEncodeCBOR(
  objects: unknown[],
  options: CBOROptions = {}
): {
  results: CBORResult[];
  totalJsonSize: number;
  totalCborSize: number;
  averageCompressionRatio: number;
} {
  const results = objects.map((obj) => encodeCBOR(obj, options));

  const totalJsonSize = results.reduce((sum, r) => sum + r.jsonSize, 0);
  const totalCborSize = results.reduce((sum, r) => sum + r.cborSize, 0);
  const averageCompressionRatio =
    results.reduce((sum, r) => sum + r.compressionRatio, 0) / results.length;

  return {
    results,
    totalJsonSize,
    totalCborSize,
    averageCompressionRatio,
  };
}
