/**
 * CAELTrace — Contracted Agent-Environment Loop artifact schema (Phase 1).
 *
 * JSONL entry format with hash-chain integrity. Each line is one event.
 */

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

function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `cael-${(h >>> 0).toString(16).padStart(8, '0')}`;
}

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

export function hashCAELEntry(entry: Omit<CAELTraceEntry, 'hash'>): string {
  const canonical = toCanonical(entry);
  return fnv1a(JSON.stringify(canonical));
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

export function verifyCAELHashChain(trace: CAELTrace): { valid: boolean; brokenAt?: number; reason?: string } {
  let prevHash = 'cael.genesis';

  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    if (entry.prevHash !== prevHash) {
      return { valid: false, brokenAt: i, reason: `prevHash mismatch at index ${i}` };
    }

    const expected = hashCAELEntry({
      version: entry.version,
      runId: entry.runId,
      index: entry.index,
      event: entry.event,
      timestamp: entry.timestamp,
      simTime: entry.simTime,
      prevHash: entry.prevHash,
      payload: entry.payload,
    });

    if (entry.hash !== expected) {
      return { valid: false, brokenAt: i, reason: `hash mismatch at index ${i}` };
    }

    prevHash = entry.hash;
  }

  return { valid: true };
}
