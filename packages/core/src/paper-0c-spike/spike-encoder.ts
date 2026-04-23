/**
 * paper-0c spike-encoder — event-to-spike encoding with replay-hash preservation.
 *
 * Implements the encoding contract from
 * `research/2026-04-23_paper-0c-spike-encoding-spec.md`.
 * Stage A foundation (Stages B/C deferred to future work).
 *
 * Contract:
 *   - Each CAEL step produces a canonical-sorted spike batch.
 *   - Per-step digest is FNV-1a (non-adversarial) of the serialized batch.
 *   - Chain hash = rolling FNV-1a of (prev_chain_hash || step_digest).
 *   - Canonical ordering = (neuron_id, timestamp_us, polarity).
 *
 * No external deps; pure function; safe to import from Node or browser bundles.
 */

export interface Spike {
  neuron_id: number;
  timestamp_us: number; // rounded to 1 us at encode time
  polarity: 1 | -1;
}

export interface SpikeBatch {
  step: number;
  spikes: Spike[];
  digest: Uint8Array; // 4 bytes FNV-1a
}

export interface CAELStepInput {
  step: number;
  /** Per-field float values; keys map to neuron_id base via encodeField below. */
  floats?: Record<string, number>;
  /** Per-field Vector3 values; each gets 3 consecutive neuron_ids. */
  vectors?: Record<string, [number, number, number]>;
  /** Discrete action names; hashed into action_space_base region. */
  actions?: string[];
  /** Optional pre-allocated time window for this step, in microseconds. */
  window_us?: number;
}

/**
 * Minimal field-quantum registry. The full registry from FIELD_QUANTUM_REGISTRY
 * (paper-3 Route 2b) is deferred. Default q_f = 1e-3 for floats, 1e-3 per component
 * for vectors. Override via the `quanta` argument to `encodeStep`.
 */
export type FieldQuanta = Record<string, number>;

const DEFAULT_FLOAT_QUANTUM = 1e-3;
const ACTION_SPACE_BASE = 1_000_000; // reserve actions above this neuron id
const FLOAT_NEURONS_PER_FIELD = 1;
const VECTOR_NEURONS_PER_FIELD = 3;
const FIELD_NEURON_STRIDE = 16; // gap between fields to avoid collision

/** Stable 32-bit hash of a field name to a neuron-id region base. */
export function fieldToNeuronBase(field: string): number {
  // FNV-1a 32-bit on the field name bytes, then scale into a byte-stride region.
  let h = 0x811c9dc5;
  for (let i = 0; i < field.length; i++) {
    h ^= field.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // Quantize to stride; keep below ACTION_SPACE_BASE.
  return ((h >>> 0) % ACTION_SPACE_BASE) * 0 + ((h >>> 0) % (ACTION_SPACE_BASE / FIELD_NEURON_STRIDE)) * FIELD_NEURON_STRIDE;
}

/** Encode a float value as a rate-coded spike train within the window. */
export function encodeFloat(
  value: number,
  quantum: number,
  neuron_id: number,
  window_us: number
): Spike[] {
  const n = Math.max(0, Math.round(Math.abs(value) / quantum));
  const polarity: 1 | -1 = value >= 0 ? 1 : -1;
  if (n === 0) return [];
  const out: Spike[] = [];
  // Evenly space n spikes within [0, window_us). Round to 1 us.
  for (let i = 0; i < n; i++) {
    const ts = Math.round((i * window_us) / n);
    out.push({ neuron_id, timestamp_us: ts, polarity });
  }
  return out;
}

export function encodeVector3(
  v: [number, number, number],
  quantum: number,
  base_neuron: number,
  window_us: number
): Spike[] {
  const out: Spike[] = [];
  for (let k = 0; k < 3; k++) {
    out.push(...encodeFloat(v[k], quantum, base_neuron + k, window_us));
  }
  return out;
}

export function encodeAction(action: string, window_us: number): Spike {
  // Fixed-point event at mid-window; neuron in ACTION_SPACE_BASE + hash(action).
  let h = 0x811c9dc5;
  for (let i = 0; i < action.length; i++) {
    h ^= action.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const neuron_id = ACTION_SPACE_BASE + ((h >>> 0) % 1024);
  return { neuron_id, timestamp_us: Math.round(window_us / 2), polarity: 1 };
}

/** Canonical-sort spikes by (neuron_id, timestamp_us, polarity). */
export function canonicalSort(spikes: Spike[]): Spike[] {
  return [...spikes].sort((a, b) => {
    if (a.neuron_id !== b.neuron_id) return a.neuron_id - b.neuron_id;
    if (a.timestamp_us !== b.timestamp_us) return a.timestamp_us - b.timestamp_us;
    return a.polarity - b.polarity;
  });
}

/** FNV-1a 32-bit on a Uint8Array. Returns 4-byte digest (big-endian). */
export function fnv1a(bytes: Uint8Array): Uint8Array {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const out = new Uint8Array(4);
  out[0] = (h >>> 24) & 0xff;
  out[1] = (h >>> 16) & 0xff;
  out[2] = (h >>> 8) & 0xff;
  out[3] = h & 0xff;
  return out;
}

/** Serialize a canonical spike batch to bytes for digest computation. */
export function serializeSpikes(spikes: Spike[]): Uint8Array {
  // 10 bytes per spike: 4 neuron_id (LE u32) + 4 timestamp_us (LE u32) + 2 polarity (LE i16)
  const buf = new Uint8Array(spikes.length * 10);
  let off = 0;
  for (const s of spikes) {
    const nid = s.neuron_id >>> 0;
    const ts = s.timestamp_us >>> 0;
    const pol = s.polarity === 1 ? 1 : 0xffff;
    buf[off++] = nid & 0xff;
    buf[off++] = (nid >>> 8) & 0xff;
    buf[off++] = (nid >>> 16) & 0xff;
    buf[off++] = (nid >>> 24) & 0xff;
    buf[off++] = ts & 0xff;
    buf[off++] = (ts >>> 8) & 0xff;
    buf[off++] = (ts >>> 16) & 0xff;
    buf[off++] = (ts >>> 24) & 0xff;
    buf[off++] = pol & 0xff;
    buf[off++] = (pol >>> 8) & 0xff;
  }
  return buf;
}

/** Encode a single CAEL step into a canonical spike batch with digest. */
export function encodeStep(input: CAELStepInput, quanta: FieldQuanta = {}): SpikeBatch {
  const window = input.window_us ?? 10_000; // default 10 ms
  const spikes: Spike[] = [];

  // Avoid Array.prototype.push(...bigArr) — V8's argument stack cap overflows at
  // ~100k items. Use explicit loops for float/vector fanout which can produce
  // large spike counts on small quanta.
  if (input.floats) {
    for (const [field, value] of Object.entries(input.floats)) {
      const q = quanta[field] ?? DEFAULT_FLOAT_QUANTUM;
      const base = fieldToNeuronBase(field);
      const emitted = encodeFloat(value, q, base, window);
      for (let i = 0; i < emitted.length; i++) spikes.push(emitted[i]);
    }
  }

  if (input.vectors) {
    for (const [field, v] of Object.entries(input.vectors)) {
      const q = quanta[field] ?? DEFAULT_FLOAT_QUANTUM;
      const base = fieldToNeuronBase(field);
      const emitted = encodeVector3(v, q, base, window);
      for (let i = 0; i < emitted.length; i++) spikes.push(emitted[i]);
    }
  }

  if (input.actions) {
    for (const a of input.actions) {
      spikes.push(encodeAction(a, window));
    }
  }

  const sorted = canonicalSort(spikes);
  const digest = fnv1a(serializeSpikes(sorted));
  return { step: input.step, spikes: sorted, digest };
}

/** Roll a chain hash forward: new = fnv1a(prev || digest). */
export function extendChain(prev_chain: Uint8Array, step_digest: Uint8Array): Uint8Array {
  const combined = new Uint8Array(prev_chain.length + step_digest.length);
  combined.set(prev_chain, 0);
  combined.set(step_digest, prev_chain.length);
  return fnv1a(combined);
}

/** Hex encode a digest for human-readable output. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
