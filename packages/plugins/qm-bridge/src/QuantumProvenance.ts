/**
 * QuantumProvenance — the cael-quantum-v1 quantum-provenance discriminator.
 *
 * Origin: ai-ecosystem research/2026-08-11_utah-quantum-initiative-EVOLVED.md
 * ("For HoloScript"): every receipt in the cael-quantum-v1 family must say WHAT
 * KIND of quantum claim it is, machine-checkably. The field's four classes are
 * the four ways "quantum" gets claimed in practice, and the whole point is
 * separating the first from the other three — the dominant failure mode in
 * 2024–2026 quantum announcements is quantum-branded classical work:
 *
 *   qpu_measured                — a real quantum processor produced the numbers.
 *                                 Requires backend identity AND job id (an
 *                                 unnamed QPU claim fails validation), plus
 *                                 shots/quantum-seconds and an error-vs-
 *                                 classical-reference (or an explicit
 *                                 not_applicable reason — e.g. the run failed).
 *   simulator                   — classical simulation of quantum mechanics
 *                                 (statevector, tensor-network, Aer, cuQuantum).
 *                                 Requires the simulator identity.
 *   quantum_inspired_classical  — classical algorithms marketed or derived from
 *                                 quantum ideas (annealing-inspired heuristics,
 *                                 tensor trains…). Requires the method.
 *   analytic_reference          — derived/analytic artifacts: groupings,
 *                                 measurement circuits, transpilation counts,
 *                                 cost models, exact diagonalization references.
 *                                 Requires the method.
 *
 * Validation contract (mirrored by the ai-ecosystem checker
 * scripts/quantum_provenance_check.py, which also derives classes for legacy
 * hash-sealed receipts that predate the block): a receipt claiming quantum
 * results FAILS when the discriminator is absent-and-underivable, when
 * qpu_measured lacks backend or job id, or when the class contradicts the
 * receipt's own qpu_used flag.
 *
 * @module @holoscript/qm-bridge/QuantumProvenance
 */

export const QUANTUM_PROVENANCE_SPEC = 'quantum-provenance/v1';

export const QUANTUM_PROVENANCE_CLASSES = [
  'qpu_measured',
  'simulator',
  'quantum_inspired_classical',
  'analytic_reference',
] as const;

export type QuantumProvenanceClass = (typeof QUANTUM_PROVENANCE_CLASSES)[number];

/** Error-vs-classical-reference: a number with units, or an explicit waiver. */
export type ErrorVsClassicalReference =
  | { value_mHa: number; reference: string }
  | { description: string; reference: string }
  | { not_applicable: string };

export interface QuantumProvenanceBase {
  spec: typeof QUANTUM_PROVENANCE_SPEC;
  class: QuantumProvenanceClass;
}

export interface QpuMeasuredProvenance extends QuantumProvenanceBase {
  class: 'qpu_measured';
  /** Provider backend identity, e.g. "ibm_pittsburgh". */
  backend: string;
  /** Provider job id — the independently checkable anchor. */
  job_id: string;
  /** Shots, or null with `shots_note` explaining why (e.g. killed pre-result). */
  shots: number | null;
  shots_note?: string;
  /** Billed/estimated quantum seconds, or null with a note. */
  quantum_seconds: number | null;
  error_vs_classical_reference: ErrorVsClassicalReference;
}

export interface SimulatorProvenance extends QuantumProvenanceBase {
  class: 'simulator';
  /** Simulator identity, e.g. "statevector-cpu", "qiskit-aer", "cuquantum-custatevec". */
  simulator: string;
}

export interface QuantumInspiredClassicalProvenance extends QuantumProvenanceBase {
  class: 'quantum_inspired_classical';
  method: string;
}

export interface AnalyticReferenceProvenance extends QuantumProvenanceBase {
  class: 'analytic_reference';
  method: string;
}

export type QuantumProvenance =
  | QpuMeasuredProvenance
  | SimulatorProvenance
  | QuantumInspiredClassicalProvenance
  | AnalyticReferenceProvenance;

/** Validation result: empty `errors` ⇔ the block satisfies the contract. */
export interface ProvenanceValidation {
  ok: boolean;
  errors: string[];
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * Validate a quantum_provenance block against the contract. Pass the receipt's
 * `qpu_used` flag (when the receipt carries one) to catch class contradictions.
 */
export function validateQuantumProvenance(
  block: unknown,
  opts: { qpuUsed?: boolean } = {}
): ProvenanceValidation {
  const errors: string[] = [];
  if (typeof block !== 'object' || block === null) {
    return { ok: false, errors: ['quantum_provenance block is missing or not an object'] };
  }
  const b = block as Record<string, unknown>;
  if (b.spec !== QUANTUM_PROVENANCE_SPEC) {
    errors.push(`spec must be "${QUANTUM_PROVENANCE_SPEC}", got ${JSON.stringify(b.spec)}`);
  }
  const cls = b.class as QuantumProvenanceClass;
  if (!QUANTUM_PROVENANCE_CLASSES.includes(cls)) {
    errors.push(
      `class must be one of ${QUANTUM_PROVENANCE_CLASSES.join(' | ')}, got ${JSON.stringify(b.class)}`
    );
    return { ok: false, errors };
  }

  if (cls === 'qpu_measured') {
    if (!isNonEmptyString(b.backend)) errors.push('qpu_measured requires a backend identity');
    if (!isNonEmptyString(b.job_id)) errors.push('qpu_measured requires a provider job_id');
    if (b.shots === undefined) errors.push('qpu_measured requires shots (number, or null with shots_note)');
    if (b.shots === null && !isNonEmptyString(b.shots_note)) {
      errors.push('qpu_measured with shots=null requires shots_note explaining why');
    }
    if (b.quantum_seconds === undefined) errors.push('qpu_measured requires quantum_seconds (number or null)');
    const evr = b.error_vs_classical_reference as Record<string, unknown> | undefined;
    if (!evr || typeof evr !== 'object') {
      errors.push('qpu_measured requires error_vs_classical_reference (value/description with reference, or not_applicable with reason)');
    } else {
      const hasValue = typeof evr.value_mHa === 'number' && isNonEmptyString(evr.reference);
      const hasDesc = isNonEmptyString(evr.description) && isNonEmptyString(evr.reference);
      const hasWaiver = isNonEmptyString(evr.not_applicable);
      if (!hasValue && !hasDesc && !hasWaiver) {
        errors.push('error_vs_classical_reference must carry {value_mHa, reference}, {description, reference}, or {not_applicable}');
      }
    }
    if (opts.qpuUsed === false) {
      errors.push('class qpu_measured contradicts receipt qpu_used: false');
    }
  } else {
    if (opts.qpuUsed === true) {
      errors.push(`class ${cls} contradicts receipt qpu_used: true`);
    }
    if (cls === 'simulator' && !isNonEmptyString(b.simulator)) {
      errors.push('simulator class requires the simulator identity');
    }
    if (
      (cls === 'quantum_inspired_classical' || cls === 'analytic_reference') &&
      !isNonEmptyString(b.method)
    ) {
      errors.push(`${cls} class requires a method description`);
    }
  }
  return { ok: errors.length === 0, errors };
}

/** Throwing variant for emitters: a receipt with an invalid block never ships. */
export function assertQuantumProvenance(block: unknown, opts: { qpuUsed?: boolean } = {}): QuantumProvenance {
  const v = validateQuantumProvenance(block, opts);
  if (!v.ok) {
    throw new Error(`invalid quantum_provenance: ${v.errors.join('; ')}`);
  }
  return block as QuantumProvenance;
}
