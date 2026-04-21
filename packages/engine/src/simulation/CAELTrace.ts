/**
 * CAELTrace — Contracted Agent-Environment Loop artifact schema (Phase 1).
 *
 * JSONL entry format with hash-chain integrity. Each line is one event.
 *
 * Hash mode (Option C, 2026-04-20 SECURITY wave): the chain hash
 * function is configurable between FNV-1a (default, fast, non-
 * cryptographic) and SHA-256 (opt-in via ContractConfig.useCryptographicHash).
 * Mode is threaded into hashCAELEntry + verifyCAELHashChain, and
 * written into cael.init.payload.hashMode for trace self-identification
 * (Prereq 3 — prevents silent-downgrade and mid-trace mode tampering).
 *
 * See: packages/engine/src/simulation/sha256.ts for the hash primitives.
 */

import {
  type HashMode,
  HASH_MODE_DEFAULT,
  hashStringForCAEL,
  hashShapeMatchesMode,
} from './sha256';

export type CAELTraceEvent = 'init' | 'step' | 'interaction' | 'solve' | 'final';

export interface CAELTraceEntry {
  version: 'cael.v1';
  runId: string;
  index: number;
  event: CAELTraceEvent;
  timestamp: number;
  simTime: number;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
}

export type CAELTrace = CAELTraceEntry[];

interface CAELTypedArrayEnvelope {
  __cael_typed_array: string;
  data: number[];
}

// Legacy FNV-1a string hash lives in sha256.ts as fnv1aStringLegacy.
// CAELTrace uses it indirectly via hashStringForCAEL(input, mode).

function toCanonical(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    const typed = value as unknown as { constructor: { name: string }; length: number; [index: number]: number };
    const out: CAELTypedArrayEnvelope = {
      __cael_typed_array: typed.constructor.name,
      data: Array.from({ length: typed.length }, (_, i) => typed[i]),
    };
    return out;
  }

  if (Array.isArray(value)) {
    return value.map((v) => toCanonical(v));
  }

  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    out[key] = toCanonical(obj[key]);
  }
  return out;
}

export function encodeCAELValue(value: unknown): unknown {
  return toCanonical(value);
}

function isTypedArrayEnvelope(value: unknown): value is CAELTypedArrayEnvelope {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<CAELTypedArrayEnvelope>;
  return typeof maybe.__cael_typed_array === 'string' && Array.isArray(maybe.data);
}

function constructTypedArray(type: string, data: number[]): unknown {
  switch (type) {
    case 'Float32Array': return new Float32Array(data);
    case 'Float64Array': return new Float64Array(data);
    case 'Uint32Array': return new Uint32Array(data);
    case 'Int32Array': return new Int32Array(data);
    case 'Uint16Array': return new Uint16Array(data);
    case 'Int16Array': return new Int16Array(data);
    case 'Uint8Array': return new Uint8Array(data);
    case 'Int8Array': return new Int8Array(data);
    default: return data;
  }
}

export function decodeCAELValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;

  if (isTypedArrayEnvelope(value)) {
    return constructTypedArray(value.__cael_typed_array, value.data);
  }

  if (Array.isArray(value)) {
    return value.map((v) => decodeCAELValue(v));
  }

  const obj = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = decodeCAELValue(v);
  }
  return out;
}

/**
 * Hash a CAEL trace entry under the given mode.
 *
 * Mode dispatch (Option C):
 *   mode='fnv1a'  → 'cael-<8hex>' (legacy format, UTF-16 charCodeAt)
 *   mode='sha256' → 'cael-sha-<64hex>' (UTF-8 bytes, SHA-256)
 *
 * Mode defaults to 'fnv1a' if omitted, preserving back-compat for
 * callers that haven't been updated yet. New code should pass the
 * mode explicitly, sourced from ContractConfig.useCryptographicHash.
 */
export function hashCAELEntry(
  entry: Omit<CAELTraceEntry, 'hash'>,
  mode: HashMode = HASH_MODE_DEFAULT,
): string {
  const canonical = toCanonical(entry);
  return hashStringForCAEL(JSON.stringify(canonical), mode);
}

export function toCAELJSONL(trace: CAELTrace): string {
  return trace.map((entry) => JSON.stringify(entry)).join('\n');
}

export function parseCAELJSONL(jsonl: string): CAELTrace {
  const lines = jsonl
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.map((line) => JSON.parse(line) as CAELTraceEntry);
}

/**
 * Verify the hash chain of a CAEL trace under a given mode.
 *
 * Mode semantics (Option C, Prereq 3):
 *   - If `mode` is provided, every entry's hash must both (a) equal
 *     the re-computed hashCAELEntry output under that mode and
 *     (b) have a shape consistent with that mode. Any entry whose
 *     hash shape contradicts the declared mode is a mid-trace
 *     tamper — the verifier rejects with a specific error.
 *   - If `mode` is omitted, infer from the trace: prefer the mode
 *     recorded in `trace[0].payload.hashMode`, else fall back to
 *     'fnv1a' (back-compat for pre-Option-C traces).
 *
 * The shape check is the Prereq 3 guard: an adversary who replaces a
 * single event's hash with a different-mode hash (even with a
 * matching chain recomputation) is caught before the expected-hash
 * comparison runs.
 */
export function verifyCAELHashChain(
  trace: CAELTrace,
  mode?: HashMode,
): { valid: boolean; brokenAt?: number; reason?: string } {
  // Resolve mode: explicit > init payload > default
  let resolvedMode: HashMode;
  if (mode !== undefined) {
    resolvedMode = mode;
  } else if (
    trace.length > 0 &&
    trace[0].event === 'init' &&
    (trace[0].payload.hashMode === 'fnv1a' || trace[0].payload.hashMode === 'sha256')
  ) {
    resolvedMode = trace[0].payload.hashMode;
  } else {
    resolvedMode = HASH_MODE_DEFAULT;
  }

  let prevHash = 'cael.genesis';

  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    if (entry.prevHash !== prevHash) {
      return { valid: false, brokenAt: i, reason: `prevHash mismatch at index ${i}` };
    }

    // Prereq 3 shape check: catches mid-trace mode tampering before
    // the expected-hash computation.
    if (!hashShapeMatchesMode(entry.hash, resolvedMode)) {
      return {
        valid: false,
        brokenAt: i,
        reason: `hash shape at index ${i} does not match declared mode '${resolvedMode}' — mid-trace mode tamper detected`,
      };
    }

    const expected = hashCAELEntry(
      {
        version: entry.version,
        runId: entry.runId,
        index: entry.index,
        event: entry.event,
        timestamp: entry.timestamp,
        simTime: entry.simTime,
        prevHash: entry.prevHash,
        payload: entry.payload,
      },
      resolvedMode,
    );

    if (entry.hash !== expected) {
      return { valid: false, brokenAt: i, reason: `hash mismatch at index ${i}` };
    }

    prevHash = entry.hash;
  }

  return { valid: true };
}
