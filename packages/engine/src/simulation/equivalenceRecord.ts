/**
 * Equivalence wire format (W.315) — compare two simulation-contract records
 * under the same "circuit" (config + geometry contract + interaction script),
 * generalizing the UISessionRecorder init pattern (`solverType: 'ui.session.v1'`
 * in `packages/studio/src/lib/uiSessionRecorder.ts`).
 *
 * Use `solverType: 'equivalence.v1'` on a **witness** object (e.g. CAEL `init`
 * payload or a small JSON artifact) to mark that the surrounding harness ran
 * a digital-twin / twin-solver agreement check, not a physics step.
 */

import type { InteractionEvent, SimulationProvenance } from './SimulationContract';
import type { SubgridAttestation } from '@holoscript/core/paper-0c-spike';

/** Recorded on witness payloads when a wire comparison was performed. */
export const EQUIVALENCE_V1 = 'equivalence.v1' as const;

export type EquivalenceV1SolverType = typeof EQUIVALENCE_V1;

/**
 * Schema for a comparison witness (e.g. embedded in CAEL init or sidecar JSON).
 * Mirrors the `solverType` slot used by `ui.session.v1` (Studio) so downstream
 * tools can route by `solverType` without a second discriminator.
 */
export interface EquivalenceV1Record {
  solverType: EquivalenceV1SolverType;
  /** Bumps if canonicalization rules change. */
  specVersion: 1;
  /** Stable derived key for the left / A side (see `wireKey`). */
  wireKeyLeft: string;
  /** Stable derived key for the right / B side. */
  wireKeyRight: string;
  /** True iff `wireKeyLeft === wireKeyRight`. */
  equivalent: boolean;
  /** Optional harness label (test name, twin slot, Martinis run id, …). */
  label?: string;
}

/** Minimum shape shared by `createReplay()` and the comparable slice of {@link SimulationProvenance}. */
export type EquivalenceWireInput = {
  config: Record<string, unknown>;
  solverType: string;
  geometryHash: string;
  contractId: string;
  fixedDt: number;
  totalSteps: number;
  interactions: ReadonlyArray<InteractionEvent>;
  subgridAttestation?: SubgridAttestation;
};

function isSimulationProvenance(x: unknown): x is SimulationProvenance {
  return (
    typeof x === 'object' &&
    x !== null &&
    'runId' in x &&
    'wallTimeMs' in x &&
    Array.isArray((x as SimulationProvenance).interactions)
  );
}

/** Narrow an unknown to {@link EquivalenceWireInput} (replay or provenance). */
export function toEquivalenceWireInput(
  src: EquivalenceWireInput | SimulationProvenance
): EquivalenceWireInput {
  if (isSimulationProvenance(src)) {
    return {
      config: src.config,
      solverType: src.solverType,
      geometryHash: src.geometryHash,
      contractId: src.contractId,
      fixedDt: src.fixedDt,
      totalSteps: src.totalSteps,
      interactions: src.interactions,
      subgridAttestation: src.subgridAttestation,
    };
  }
  return {
    config: src.config,
    solverType: src.solverType,
    geometryHash: src.geometryHash,
    contractId: src.contractId,
    fixedDt: src.fixedDt,
    totalSteps: src.totalSteps,
    interactions: src.interactions as InteractionEvent[],
    subgridAttestation: src.subgridAttestation,
  };
}

/**
 * JSON-like stable string for hashing / equality. Sorts object keys; arrays keep order.
 * Numbers and strings are JSON-serialized; `undefined` is skipped in objects.
 */
export function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'string') return JSON.stringify(value);
  if (t === 'number' || t === 'boolean') return JSON.stringify(value);
  if (t !== 'object') return JSON.stringify(String(value));
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(',')}]`;
  }
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  const parts: string[] = [];
  for (const k of keys) {
    if (o[k] === undefined) continue;
    parts.push(`${JSON.stringify(k)}:${stableStringify(o[k])}`);
  }
  return `{${parts.join(',')}}`;
}

/**
 * Build the canonical wire snapshot used for agreement checks.
 * Strips per-run fields (`id`, `timestamp` on interactions) and sorts
 * interactions by `simTime` then `type` for a deterministic ordering.
 */
export function canonicalWireSnapshot(source: EquivalenceWireInput | SimulationProvenance): Record<string, unknown> {
  const r = toEquivalenceWireInput(source);
  const sortedInteractions = r.interactions
    .map((ev) => ({
      simTime: ev.simTime,
      type: ev.type,
      data: ev.data,
    }))
    .sort((a, b) => {
      if (a.simTime !== b.simTime) return a.simTime - b.simTime;
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return stableStringify(a.data).localeCompare(stableStringify(b.data));
    });
  return {
    contractId: r.contractId,
    geometryHash: r.geometryHash,
    solverType: r.solverType,
    fixedDt: r.fixedDt,
    totalSteps: r.totalSteps,
    config: r.config,
    subgridAttestation: r.subgridAttestation ?? null,
    interactions: sortedInteractions,
  };
}

/** Single derived key for one side of an equivalence test. */
export function wireKey(source: EquivalenceWireInput | SimulationProvenance): string {
  return stableStringify(canonicalWireSnapshot(source));
}

/**
 * True if two replay / provenance-shaped records are wire-equivalent: same
 * contract geometry, same solver label, same config (key-sorted), same
 * ordered interaction script (ignoring monotonic `id` and wall `timestamp`).
 */
export function wireFormatEquivalent(
  a: EquivalenceWireInput | SimulationProvenance,
  b: EquivalenceWireInput | SimulationProvenance
): boolean {
  return wireKey(a) === wireKey(b);
}

/** Build a `equivalence.v1` witness record (for logging, CAEL init, or sidecar files). */
export function buildEquivalenceV1Record(
  a: EquivalenceWireInput | SimulationProvenance,
  b: EquivalenceWireInput | SimulationProvenance,
  options: { label?: string } = {}
): EquivalenceV1Record {
  const wireKeyLeft = wireKey(a);
  const wireKeyRight = wireKey(b);
  return {
    solverType: EQUIVALENCE_V1,
    specVersion: 1,
    wireKeyLeft,
    wireKeyRight,
    equivalent: wireKeyLeft === wireKeyRight,
    ...(options.label !== undefined ? { label: options.label } : {}),
  };
}
