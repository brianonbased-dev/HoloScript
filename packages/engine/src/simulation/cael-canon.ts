/**
 * Canonical value encoding for CAEL trace entries (JSON-stable shapes).
 * Shared by `encodeCAELValue` and `hashCAELEntry` in `hashes.ts`.
 */

interface CAELTypedArrayEnvelope {
  __cael_typed_array: string;
  data: number[];
}

function isTypedArrayEnvelope(value: unknown): value is CAELTypedArrayEnvelope {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<CAELTypedArrayEnvelope>;
  return typeof maybe.__cael_typed_array === 'string' && Array.isArray(maybe.data);
}

export function constructTypedArray(type: string, data: number[]): unknown {
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

export { isTypedArrayEnvelope };

export function toCanonical(value: unknown): unknown {
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
