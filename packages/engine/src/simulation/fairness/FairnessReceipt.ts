/**
 * FairnessReceipt -- sovereign, replayable receipt for an algorithmic-fairness
 * evaluation, built on the SimulationContract hash + replay primitives WITHOUT
 * inheriting the physics-shaped provenance types.
 *
 * Why a sibling type and not `WorldModelReceipt` / `SimulationProvenance`:
 * those carry physics fields (geometryHash, solverType, scaleEnvelope, mesh
 * connectivity, JEPA latent vectors). Forcing credit / underwriting fairness
 * fields into them would pollute the physics provenance type and violate D.007
 * (domain-free core). Instead this module reuses the *primitives*:
 *   - the `hashBytes` chokepoint (FNV-1a default / SHA-256 opt-in, sha256.ts),
 *     so a fairness receipt is hashed under the exact same SECURITY-mode wiring
 *     as every physics contract hash site; and
 *   - the Guarantee-6 replay discipline (rebuild identity from a record,
 *     re-derive the fingerprint, flag MATCH/DRIFT on comparison).
 *
 * It carries only fairness-shaped fields and a versioned regulatory crosswalk
 * (data, not hardcoded behavior -- the crosswalk ships as overridable constants).
 *
 * @see ../sha256 -- the hashBytes / HashMode chokepoint this reuses
 * @see ./FairnessSweep -- produces the metrics these receipts wrap
 */

import { hashBytes, HASH_MODE_DEFAULT, type HashMode } from '../sha256';

// -- Canonical content hashing ------------------------------------------------

/**
 * Stable, key-sorted JSON serialization for content hashing. Recurses objects
 * (keys sorted) and arrays (order preserved). Non-finite numbers and
 * undefined/function values serialize to `null` so a hash never depends on
 * platform float formatting of NaN/Infinity.
 */
export function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  const t = typeof value;
  if (t === 'number') return Number.isFinite(value as number) ? String(value) : 'null';
  if (t === 'boolean') return (value as boolean) ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (t === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
  }
  return 'null';
}

/** Content hash over any value via the SimulationContract hash chokepoint. */
export function hashContent(value: unknown, mode: HashMode = HASH_MODE_DEFAULT): string {
  return hashBytes(new TextEncoder().encode(canonicalize(value)), mode);
}

// -- Determinism grade (the F-1 honesty layer) ---------------------------------

/**
 * How reproducibly a model + pipeline re-executes -- declared on the receipt so a
 * regulator knows exactly what re-execution they are getting, instead of a bare
 * (and on a real model often false) "byte-identical replay" claim:
 *   - 'exact'       -- bit-reproducible decisions; `decisionDigest` re-runs byte-identical.
 *   - 'quantized'   -- individual decisions may vary; the aggregate adverse-impact
 *                      ratio reproduces within `replayTolerance`.
 *   - 'statistical' -- only the distribution-level verdict is stable; pair with a
 *                      FairnessRobustnessReceipt band for verification.
 * The grade is declared by the model and MEASURED by the engine (double-run) --
 * an over-claimed 'exact' is auto-downgraded, never trusted (see runFairnessSweep).
 */
export type DeterminismGrade = 'exact' | 'quantized' | 'statistical';

/**
 * Content digest over an ordered boolean decision vector -- the exact-grade replay
 * artifact. A validator re-running the model on the recorded inputs recomputes
 * this and compares; on an `exact` model it is byte-identical.
 */
export function computeDecisionDigest(
  decisions: readonly boolean[],
  mode: HashMode = HASH_MODE_DEFAULT,
): string {
  let bits = '';
  for (const d of decisions) bits += d ? '1' : '0';
  return hashBytes(new TextEncoder().encode(`fd:${decisions.length}:${bits}`), mode);
}

// -- Metrics -------------------------------------------------------------------

/** Disparity metrics a fairness/anti-discrimination examiner names directly. */
export interface FairnessMetrics {
  /** Per-group approval rate, keyed by protected-attribute value. */
  approvalRate: Record<string, number>;
  /** EEOC 4/5ths adverse-impact ratio: min(rate) / max(rate) across groups. */
  adverseImpactRatio: number;
  /** Largest pairwise demographic-parity difference: max(rate) - min(rate). */
  demographicParityDiff: number;
  /** adverseImpactRatio >= 0.80 (the 4/5ths threshold). */
  fourFifthsPass: boolean;
}

// -- Replay key (Guarantee-6 identity) ----------------------------------------

/**
 * The inputs that uniquely determine a fairness decision. A validator who
 * re-runs the model from this key alone must re-derive the same
 * `replayFingerprint` -- this is the offline-replay guarantee.
 */
export interface FairnessReplayKey {
  modelHash: string;
  seed: number;
  inputHash: string;
  weightStrategy: string;
}

export function computeReplayFingerprint(
  key: FairnessReplayKey,
  mode: HashMode = HASH_MODE_DEFAULT,
): string {
  return hashContent(key, mode);
}

// -- Per-decision receipt (Claims 1-3) ----------------------------------------

export interface FairnessReceipt {
  kind: 'fairness.receipt.v1';
  modelId: string;
  modelHash: string;
  seed: number;
  inputHash: string;
  weightStrategy: string;
  /** Hash over the replay key -- re-derivable by a validator from the key alone. */
  replayFingerprint: string;
  sampleSize: number;
  protectedAttribute: string;
  metrics: FairnessMetrics;
  decision: 'PASS' | 'FLAG-DISPARATE-IMPACT';
  /** Content digest over the ordered per-record decisions (exact-grade replay artifact). */
  decisionDigest: string;
  /** Content digest over the disparity metrics. */
  metricsDigest: string;
  /** Declared + engine-measured reproducibility grade (see DeterminismGrade). */
  replayDeterminism: DeterminismGrade;
  /** Max |delta adverse-impact ratio| tolerated on replay (0 for 'exact'). */
  replayTolerance: number;
  /** Versioned regulator crosswalk (data -- overridable per engagement). */
  regulatoryMapping: Record<string, string>;
  hashMode: HashMode;
  issuedAt: string;
  /** Content hash over the whole receipt body (computed with this field omitted). */
  receiptHash: string;
}

export interface EmitFairnessReceiptParams {
  modelId: string;
  modelHash: string;
  seed: number;
  inputHash: string;
  weightStrategy: string;
  sampleSize: number;
  protectedAttribute: string;
  metrics: FairnessMetrics;
  /** Digest over the ordered per-record decisions (from computeDecisionDigest). */
  decisionDigest: string;
  /** Declared/measured reproducibility grade (default 'exact'). */
  replayDeterminism?: DeterminismGrade;
  /** Replay tolerance for non-exact grades (default 0). */
  replayTolerance?: number;
  regulatoryMapping?: Record<string, string>;
  issuedAt: string;
  hashMode?: HashMode;
}

export function emitFairnessReceipt(p: EmitFairnessReceiptParams): FairnessReceipt {
  const mode = p.hashMode ?? HASH_MODE_DEFAULT;
  const replayFingerprint = computeReplayFingerprint(
    { modelHash: p.modelHash, seed: p.seed, inputHash: p.inputHash, weightStrategy: p.weightStrategy },
    mode,
  );
  const body: Omit<FairnessReceipt, 'receiptHash'> = {
    kind: 'fairness.receipt.v1',
    modelId: p.modelId,
    modelHash: p.modelHash,
    seed: p.seed,
    inputHash: p.inputHash,
    weightStrategy: p.weightStrategy,
    replayFingerprint,
    sampleSize: p.sampleSize,
    protectedAttribute: p.protectedAttribute,
    metrics: p.metrics,
    decision: p.metrics.fourFifthsPass ? 'PASS' : 'FLAG-DISPARATE-IMPACT',
    decisionDigest: p.decisionDigest,
    metricsDigest: hashContent(p.metrics, mode),
    replayDeterminism: p.replayDeterminism ?? 'exact',
    replayTolerance: p.replayTolerance ?? 0,
    regulatoryMapping: p.regulatoryMapping ?? DEFAULT_FAIRNESS_CROSSWALK,
    hashMode: mode,
    issuedAt: p.issuedAt,
  };
  return { ...body, receiptHash: hashContent(body, mode) };
}

// -- Robustness receipt (Claims 4-5) ------------------------------------------

export interface RobustnessBand {
  /** Ensemble mean adverse-impact ratio. */
  mean: number;
  /** Ensemble standard deviation. */
  std: number;
  /** 90% confidence interval on the adverse-impact ratio: [p5, p95]. */
  ci90: [number, number];
  /** Worst-case (minimum) adverse-impact ratio over the ensemble. */
  worstCase: number;
}

export interface FairnessRobustnessReceipt {
  kind: 'fairness.robustness.v1';
  modelId: string;
  modelHash: string;
  seed: number;
  baseInputHash: string;
  weightStrategy: string;
  replicates: number;
  replayFingerprint: string;
  /** Content hash over the sorted ensemble of adverse-impact ratios. */
  ensembleHash: string;
  robustness: RobustnessBand;
  verdict: 'ROBUSTLY-FAIR' | 'ROBUSTLY-UNFAIR' | 'INDETERMINATE-FAIRNESS';
  regulatoryMapping: Record<string, string>;
  hashMode: HashMode;
  issuedAt: string;
  receiptHash: string;
}

export interface EmitRobustnessReceiptParams {
  modelId: string;
  modelHash: string;
  seed: number;
  baseInputHash: string;
  weightStrategy: string;
  replicates: number;
  ensembleHash: string;
  robustness: RobustnessBand;
  verdict: FairnessRobustnessReceipt['verdict'];
  regulatoryMapping?: Record<string, string>;
  issuedAt: string;
  hashMode?: HashMode;
}

export function emitRobustnessReceipt(p: EmitRobustnessReceiptParams): FairnessRobustnessReceipt {
  const mode = p.hashMode ?? HASH_MODE_DEFAULT;
  const replayFingerprint = computeReplayFingerprint(
    { modelHash: p.modelHash, seed: p.seed, inputHash: p.baseInputHash, weightStrategy: p.weightStrategy },
    mode,
  );
  const body: Omit<FairnessRobustnessReceipt, 'receiptHash'> = {
    kind: 'fairness.robustness.v1',
    modelId: p.modelId,
    modelHash: p.modelHash,
    seed: p.seed,
    baseInputHash: p.baseInputHash,
    weightStrategy: p.weightStrategy,
    replicates: p.replicates,
    replayFingerprint,
    ensembleHash: p.ensembleHash,
    robustness: p.robustness,
    verdict: p.verdict,
    regulatoryMapping: p.regulatoryMapping ?? DEFAULT_ROBUSTNESS_CROSSWALK,
    hashMode: mode,
    issuedAt: p.issuedAt,
  };
  return { ...body, receiptHash: hashContent(body, mode) };
}

// -- Guarantee-6: verification + replay ---------------------------------------

export type ReplayVerdict = 'MATCH' | 'DRIFT';

/**
 * Integrity check: recompute the receipt's content hash and compare. Returns
 * true iff the receipt body is byte-identical to what was issued (catches any
 * post-hoc tamper of the receipt itself).
 */
export function verifyReceiptIntegrity(
  receipt: FairnessReceipt | FairnessRobustnessReceipt,
): boolean {
  const { receiptHash, ...body } = receipt;
  return hashContent(body, receipt.hashMode) === receiptHash;
}

/**
 * Offline replay (Guarantee 6): given an independently-observed replay key --
 * e.g. a validator who re-ran the model on the recorded inputs -- return MATCH
 * iff the re-derived fingerprint equals the receipt's, else DRIFT. Any change
 * to model, seed, inputs, or weights breaks the fingerprint.
 */
export function replayFairnessReceipt(
  receipt: { replayFingerprint: string; hashMode: HashMode },
  observedKey: FairnessReplayKey,
): ReplayVerdict {
  return computeReplayFingerprint(observedKey, receipt.hashMode) === receipt.replayFingerprint
    ? 'MATCH'
    : 'DRIFT';
}

/**
 * Re-execution verification -- the determinism-aware Guarantee 6. Given a FRESH
 * re-run of the model on the recorded inputs, returns MATCH iff the re-run
 * reproduces the receipt to the grade the receipt declares:
 *   - 'exact'                    -> the decision digest must be byte-identical.
 *   - 'quantized' / 'statistical'-> the re-run adverse-impact ratio must be within
 *                                   `replayTolerance` of the recorded value.
 * This is what `replayFairnessReceipt` (input-key identity) cannot do alone: it
 * verifies OUTPUTS, so a non-deterministic model no longer DRIFTs spuriously.
 */
export function verifyReplayExecution(
  receipt: Pick<
    FairnessReceipt,
    'decisionDigest' | 'metrics' | 'replayDeterminism' | 'replayTolerance'
  >,
  rerun: { decisionDigest: string; adverseImpactRatio: number },
): ReplayVerdict {
  if (receipt.replayDeterminism === 'exact') {
    return rerun.decisionDigest === receipt.decisionDigest ? 'MATCH' : 'DRIFT';
  }
  const delta = Math.abs(rerun.adverseImpactRatio - receipt.metrics.adverseImpactRatio);
  return delta <= receipt.replayTolerance ? 'MATCH' : 'DRIFT';
}

// -- Default regulator crosswalks (data -- overridable per engagement) --------

/**
 * Per-decision receipt -> regulator mapping. One receipt satisfies these
 * simultaneously. Ships as the verified default; pass a custom map to
 * `emitFairnessReceipt` to version it per jurisdiction.
 */
export const DEFAULT_FAIRNESS_CROSSWALK: Record<string, string> = {
  'EU-AI-Act Art.10 (data governance / bias mitigation)':
    'metrics.demographicParityDiff + per-cohort approvalRate',
  'EU-AI-Act Art.12 (record-keeping)':
    'replayFingerprint + inputHash (append-only, content-hashed)',
  'EU-AI-Act Art.15 (accuracy/robustness)':
    'replayFingerprint determinism = reproducibility evidence',
  'Colorado SB21-169 / Reg 10-1-1 (unfair-discrimination testing)':
    'metrics.adverseImpactRatio (4/5ths) + fourFifthsPass',
  'NAIC AI Systems Evaluation Tool (sample case file + bias audit)':
    'this receipt IS the case file; metrics = bias audit',
  'FDA SaMD bias review / HIPAA audit trail':
    'time-stamped, non-overwritable content hash = audit record',
  'SR 11-7 / revised-MRM (independent validation)':
    'validator re-runs from (modelHash,seed,inputHash,weights) -> same fingerprint',
};

/** Robustness receipt -> regulator mapping (stress-scenario / drift-monitoring asks). */
export const DEFAULT_ROBUSTNESS_CROSSWALK: Record<string, string> = {
  'EU-AI-Act Art.15 (accuracy/robustness)':
    'ci90 adverse-impact + worstCase under input uncertainty',
  'CCAR/DFAST (reproducible stress scenarios)':
    'LHS ensemble = stress sweep; ensembleHash + replayFingerprint reproduce it',
  'SR 11-7 / revised-MRM (ongoing monitoring)':
    'robustness band detects fairness drift the point estimate hides',
  'Colorado SB21-169 / NAIC (testing under data drift)':
    'verdict holds across population-drift + noise space, not a single sample',
};
