/**
 * Pure content-hash functions for the simulation contract and CAEL traces.
 * Extracted from SimulationContract / CAELTrace to keep a single, testable surface.
 *
 * @see SimulationContract — re-exports for backward compatibility
 * @see sha256 — FNV-1a / SHA-256 mode dispatch
 */

import type { FieldData, SimSolver } from './SimSolver';
import type { CAELTraceEntry } from './CAELTrace';
import {
  type HashMode,
  HASH_MODE_DEFAULT,
  hashBytes,
  hashStringForCAEL,
} from './sha256';
import { toCanonical } from './cael-canon';

// Re-export for callers that want a single `hashes` import surface
export { HASH_MODE_DEFAULT, type HashMode } from './sha256';

// ── Geometry + GPU (from SimulationContract) ────────────────────────────────

export function hashGeometry(
  vertices: Float64Array | Float32Array | undefined,
  elements: Uint32Array | undefined,
  mode: HashMode = HASH_MODE_DEFAULT,
): string {
  if (!vertices || !elements) return 'no-geometry';

  const nCoord = vertices.length;
  const nIdx = elements.length;

  if (mode === 'sha256') {
    const totalBytes = 4 + nCoord * 4 + 4 + 4 + nIdx * 4;
    const buf = new Uint8Array(totalBytes);
    const view = new DataView(buf.buffer);
    let off = 0;
    view.setUint32(off, nCoord >>> 0, true); off += 4;
    for (let i = 0; i < nCoord; i++) {
      view.setInt32(off, Math.round(vertices[i] * 1e6) | 0, true); off += 4;
    }
    view.setUint32(off, 0x9e3779b9, true); off += 4;
    view.setUint32(off, nIdx >>> 0, true); off += 4;
    for (let i = 0; i < nIdx; i++) {
      view.setUint32(off, elements[i] >>> 0, true); off += 4;
    }
    return `geo-sha-${hashBytes(buf, 'sha256')}-${nCoord / 3}n-${nIdx}e`;
  }

  let h = 2166136261;

  for (let k = 0; k < 4; k++) {
    h ^= (nCoord >>> (8 * k)) & 0xff;
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < nCoord; i++) {
    const v = Math.round(vertices[i] * 1e6);
    h ^= v & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 24) & 0xff;
    h = Math.imul(h, 16777619);
  }

  h ^= 0x9e3779b9;
  h = Math.imul(h, 16777619);

  for (let k = 0; k < 4; k++) {
    h ^= (nIdx >>> (8 * k)) & 0xff;
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < nIdx; i++) {
    const v = elements[i];
    h ^= v & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 8) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 16) & 0xff;
    h = Math.imul(h, 16777619);
    h ^= (v >> 24) & 0xff;
    h = Math.imul(h, 16777619);
  }

  return `geo-${(h >>> 0).toString(16).padStart(8, '0')}-${nCoord / 3}n-${nIdx}e`;
}

const GPU_OUTPUT_QUANTUM = 1e-6;

export function hashGpuOutput(
  data: Float32Array,
  mode: HashMode = HASH_MODE_DEFAULT,
): string {
  if (data.length === 0) {
    return mode === 'sha256' ? `gpu-sha-${'0'.repeat(64)}-0` : 'gpu-00000000-0';
  }

  const n = data.length;
  const invQ = 1 / GPU_OUTPUT_QUANTUM;

  if (mode === 'sha256') {
    const buf = new Uint8Array(4 + n * 4);
    const view = new DataView(buf.buffer);
    view.setUint32(0, n >>> 0, true);
    for (let i = 0; i < n; i++) {
      const v = data[i];
      if (!Number.isFinite(v)) {
        throw new Error(
          `[SimulationContract] hashGpuOutput: non-finite value at index ${i}: ${v}.`,
        );
      }
      view.setInt32(4 + i * 4, Math.round(v * invQ) | 0, true);
    }
    return `gpu-sha-${hashBytes(buf, 'sha256')}-${n}`;
  }

  let h = 2166136261;
  for (let k = 0; k < 4; k++) {
    h ^= (n >>> (8 * k)) & 0xff;
    h = Math.imul(h, 16777619);
  }
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) {
      throw new Error(
        `[SimulationContract] hashGpuOutput: non-finite value at index ${i}: ${v}.`,
      );
    }
    const q = Math.round(v * invQ) | 0;
    h ^= q & 0xff; h = Math.imul(h, 16777619);
    h ^= (q >>> 8) & 0xff; h = Math.imul(h, 16777619);
    h ^= (q >>> 16) & 0xff; h = Math.imul(h, 16777619);
    h ^= (q >>> 24) & 0xff; h = Math.imul(h, 16777619);
  }
  return `gpu-${(h >>> 0).toString(16).padStart(8, '0')}-${n}`;
}

// ── State digest (from ContractedSimulation) ───────────────────────────────

const FIELD_QUANTUM_REGISTRY: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(stress|vonMises|principal[A-Z]|deviatoric|cauchy|pk[12])/i, 1_000],
  [/^(strain|deformation)/i, 1e-6],
  [/^(displacement|position|offset|translation|coord)/i, 1e-5],
  [/^(velocity|velo|speed)/i, 1e-3],
  [/^(acceleration|accel|force)/i, 1e-2],
  [/^(temperature|temp|thermal)/i, 0.1],
  [/^(pressure|press)/i, 100],
  [/^(energy|strainEnergy|kineticEnergy|potentialEnergy)/i, 1e-2],
];

const FALLBACK_QUANTUM = 1e-6;

/**
 * Per-field discretization quantum (paper-3 route-2b); exported for contract tests
 * and solver diagnostics.
 */
export function quantumForField(name: string): number {
  for (const [pattern, q] of FIELD_QUANTUM_REGISTRY) {
    if (pattern.test(name)) return q;
  }
  return FALLBACK_QUANTUM;
}

type SolverForDigest = {
  getField: SimSolver['getField'];
  fieldNames?: SimSolver['fieldNames'] | Iterable<string> | { [Symbol.iterator]?: () => Iterator<string> };
};

/**
 * Compute a canonical state digest from solver field buffers under the same rules
 * as the runtime contract (FNV-1a vs SHA-256, per-field q_f, fail-closed on non-finite).
 * Returns `''` when the solver has no iterable `fieldNames` (W4-T1: skip-with-empty).
 */
export function computeStateDigest(solver: SolverForDigest, hashMode: HashMode): string {
  const rawFieldNames = (solver as { fieldNames?: Iterable<string> }).fieldNames;
  if (!rawFieldNames || typeof (rawFieldNames as Iterable<string>)[Symbol.iterator] !== 'function') {
    return '';
  }
  const fieldNames = [...rawFieldNames].sort();

  if (hashMode === 'sha256') {
    type FieldBlock = { nameBytes: Uint8Array; intBytes: Uint8Array };
    const blocks: FieldBlock[] = [];
    let totalBytes = 0;
    for (const name of fieldNames) {
      const field = solver.getField(name) as FieldData | null;
      if (!field) continue;
      let values: Float32Array | Float64Array;
      if (field instanceof Float32Array) values = field;
      else if (field instanceof Float64Array) values = field;
      else {
        const maybeData = (field as unknown as { data?: Float32Array | Float64Array }).data;
        if (!maybeData) continue;
        values = maybeData;
      }
      const qf = quantumForField(name);
      const invQf = 1 / qf;
      const nameBytes = new Uint8Array(name.length);
      for (let i = 0; i < name.length; i++) nameBytes[i] = name.charCodeAt(i) & 0xff;
      const intBytes = new Uint8Array(values.length * 4);
      const view = new DataView(intBytes.buffer);
      for (let i = 0; i < values.length; i++) {
        const v = values[i];
        if (!Number.isFinite(v)) {
          throw new Error(
            `[SimulationContract] Non-finite value in field "${name}" at index ${i}: ${v}. ` +
            `State integrity violation — the contract's state digest is fail-closed on NaN/±Infinity. ` +
            `Investigate solver.step() for the stepping that produced this state.`,
          );
        }
        view.setInt32(i * 4, Math.round(v * invQf) | 0, true);
      }
      blocks.push({ nameBytes, intBytes });
      totalBytes += nameBytes.length + intBytes.length;
    }
    const buf = new Uint8Array(totalBytes);
    let off = 0;
    for (const blk of blocks) {
      buf.set(blk.nameBytes, off); off += blk.nameBytes.length;
      buf.set(blk.intBytes, off); off += blk.intBytes.length;
    }
    return hashBytes(buf, 'sha256');
  }

  const FNV_OFFSET = 0x811c9dc5;
  const FNV_PRIME = 0x01000193;
  let h = FNV_OFFSET >>> 0;

  for (const name of fieldNames) {
    const field = solver.getField(name) as FieldData | null;
    if (!field) continue;
    let values: Float32Array | Float64Array;
    if (field instanceof Float32Array) {
      values = field;
    } else if (field instanceof Float64Array) {
      values = field;
    } else {
      const maybeData = (field as unknown as { data?: Float32Array | Float64Array }).data;
      if (!maybeData) continue;
      values = maybeData;
    }
    const qf = quantumForField(name);
    const invQf = 1 / qf;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i) & 0xff;
      h = Math.imul(h, FNV_PRIME) >>> 0;
    }
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (!Number.isFinite(v)) {
        throw new Error(
          `[SimulationContract] Non-finite value in field "${name}" at index ${i}: ${v}. ` +
          `State integrity violation — the contract's state digest is fail-closed on NaN/±Infinity. ` +
          `Investigate solver.step() for the stepping that produced this state.`,
        );
      }
      const q = Math.round(v * invQf) | 0;
      h ^= q & 0xff;
      h = Math.imul(h, FNV_PRIME) >>> 0;
      h ^= (q >>> 8) & 0xff;
      h = Math.imul(h, FNV_PRIME) >>> 0;
      h ^= (q >>> 16) & 0xff;
      h = Math.imul(h, FNV_PRIME) >>> 0;
      h ^= (q >>> 24) & 0xff;
      h = Math.imul(h, FNV_PRIME) >>> 0;
    }
  }

  return h.toString(16).padStart(8, '0');
}

// ── CAEL entry hash (from CAELTrace) ───────────────────────────────────────

export function hashCAELEntry(
  entry: Omit<CAELTraceEntry, 'hash'>,
  mode: HashMode = HASH_MODE_DEFAULT,
): string {
  const canonical = toCanonical(entry);
  return hashStringForCAEL(JSON.stringify(canonical), mode);
}
