/**
 * SemanticDeterminismGate — the P1 cross-fleet determinism harness for the
 * learned-semantic novelty advisory (scope 2026-05-23_holoembed-semantic-encoder, P1).
 *
 * THE DECISION THIS GATE MAKES: the trigram novelty guard is RECEIPT-BINDING because it
 * is perfectly deterministic. The learned-semantic layer (SemanticNoveltyEncoder) is
 * ADVISORY ONLY until proven reproducible across the heterogeneous fleet — a learned model
 * introduces floating-point non-determinism (CPU/BLAS/quantization differences between
 * machines), and a receipt that cannot replay identically forever is not a receipt. This
 * module produces the EVIDENCE that decides advisory → receipt-binding promotion.
 *
 * THE HONEST FALLBACK IS BAKED IN: a verdict from a SINGLE machine is `insufficient-evidence`,
 * never `byte-identical` — you cannot prove cross-fleet reproducibility from one machine. The
 * gate only returns `byte-identical` (→ receipt-binding-eligible) when ≥2 DISTINCT machines
 * independently produce identical fingerprints at the same precision. Any disagreement, or
 * any same-machine instability, → `divergent` (stays advisory). This is a graceful degrade,
 * not a failure: if the fleet can't reproduce it, the trigram guard remains the receipt
 * binding and the semantic layer stays a review signal (per scope §Honest risks).
 *
 * HOW THE FLEET USES IT: each machine runs `buildDeterminismManifest({ machineLabel })`,
 * which embeds a fixed probe set N times (verifying same-machine stability) and emits a
 * portable manifest of machine-INDEPENDENT fingerprints (sha256 of the quantized vector —
 * the quantization absorbs sub-precision jitter, the hash catches real divergence). Collect
 * the manifests from ≥2 machines + CI, feed them to `assessDeterminismGate(manifests)`, and
 * the pure verdict decides. Fingerprints are pure functions of (model, text, precision) by
 * construction, so the comparison is exact and the gate logic is testable without the model.
 */

import { sha256Bytes } from './sha256';
import { SEMANTIC_NOVELTY_MODEL, embedSemantic } from './SemanticNoveltyEncoder';

export const DETERMINISM_MANIFEST_VERSION = 1 as const;

/** Decimal places the embedding is rounded to before hashing — absorbs sub-epsilon FP jitter. */
export const DETERMINISM_DEFAULT_PRECISION = 6;

/** Same-machine repeats per probe text — verifies run-to-run stability on one machine. */
export const DETERMINISM_DEFAULT_REPEATS = 3;

/**
 * Fixed, ORDERED probe set — the manifest hashes these in this exact order, so the same texts
 * must be compared across machines. Spans the engine's live claim domains (topology, geometry,
 * number theory) plus an unrelated control, matching the labeled eval set's coverage.
 */
export const DETERMINISM_PROBE_TEXTS: ReadonlyArray<string> = [
  'For every convex polyhedron, vertices minus edges plus faces equals two.',
  'In a right triangle the hypotenuse squared equals the sum of the squares of the other two sides.',
  'For every integer n>=2, 4/n equals 1/x + 1/y + 1/z.',
  'Two generic plane curves of degrees d1 and d2 intersect in d1*d2 points.',
  'The cat sat on the warm windowsill in the afternoon sun.',
];

const TEXT_ENCODER = new TextEncoder();

/**
 * Canonical token for one vector component at a fixed precision. Rounds to `precision` decimals
 * and normalizes negative zero, so `-0.0000004` and `+0.0000001` both become the same `0.000000`
 * token — sub-precision FP jitter cannot change the fingerprint, but a real difference does.
 */
export function quantizeToken(x: number, precision: number): string {
  if (!Number.isFinite(x)) {
    throw new Error('determinism-gate: vector components must be finite numbers');
  }
  if (!Number.isInteger(precision) || precision < 0 || precision > 12) {
    throw new Error('determinism-gate: precision must be an integer in [0, 12]');
  }
  const token = x.toFixed(precision);
  const zero = (0).toFixed(precision);
  return token === `-${zero}` ? zero : token; // normalize -0.000000 → 0.000000
}

/**
 * Machine-INDEPENDENT fingerprint of an embedding vector at a fixed precision.
 * Pure: sha256 over `modelId|precision|<quantized components>`. Two machines that produce
 * the same vector (to `precision` decimals) get byte-identical fingerprints by construction.
 */
export function vectorFingerprint(
  vector: ReadonlyArray<number>,
  precision: number = DETERMINISM_DEFAULT_PRECISION
): string {
  if (vector.length === 0) {
    throw new Error('determinism-gate: cannot fingerprint an empty vector');
  }
  const tokens = vector.map((c) => quantizeToken(c, precision));
  const canonical = `${SEMANTIC_NOVELTY_MODEL}|p${precision}|${tokens.join(',')}`;
  return `sha-${sha256Bytes(TEXT_ENCODER.encode(canonical))}`;
}

export interface DeterminismProbeEntry {
  text: string;
  /** Machine-independent fingerprint of the (quantized) embedding. */
  fingerprint: string;
  /** True iff all same-machine repeats produced a byte-identical vector. */
  sameMachineStable: boolean;
}

export interface DeterminismManifest {
  manifestVersion: typeof DETERMINISM_MANIFEST_VERSION;
  modelId: typeof SEMANTIC_NOVELTY_MODEL;
  /** Identifier for the machine that produced this manifest (NOT part of any fingerprint). */
  machineLabel: string;
  precision: number;
  dim: number;
  repeats: number;
  /** True iff every probe entry was same-machine stable across its repeats. */
  sameMachineStable: boolean;
  entries: ReadonlyArray<DeterminismProbeEntry>;
}

export interface BuildDeterminismManifestOptions {
  /** Identifier for this machine (e.g. os.hostname() + arch). Required — the gate needs ≥2 distinct. */
  machineLabel: string;
  precision?: number;
  repeats?: number;
  texts?: ReadonlyArray<string>;
}

/**
 * Build this machine's determinism manifest by embedding each probe text `repeats` times and
 * recording the machine-independent fingerprint plus whether the repeats were byte-identical.
 * Async (runs the local model). The emitted manifest is the portable artifact the fleet compares.
 */
export async function buildDeterminismManifest(
  options: BuildDeterminismManifestOptions
): Promise<DeterminismManifest> {
  const { machineLabel } = options;
  if (typeof machineLabel !== 'string' || machineLabel.length === 0) {
    throw new Error('determinism-gate: machineLabel must be a non-empty string');
  }
  const precision = options.precision ?? DETERMINISM_DEFAULT_PRECISION;
  const repeats = options.repeats ?? DETERMINISM_DEFAULT_REPEATS;
  if (!Number.isInteger(repeats) || repeats < 1) {
    throw new Error('determinism-gate: repeats must be a positive integer');
  }
  const texts = options.texts ?? DETERMINISM_PROBE_TEXTS;
  if (texts.length === 0) {
    throw new Error('determinism-gate: probe text set must be non-empty');
  }

  const entries: DeterminismProbeEntry[] = [];
  let dim = 0;
  let allStable = true;
  for (const text of texts) {
    const first = await embedSemantic(text);
    dim = first.length;
    let stable = true;
    for (let r = 1; r < repeats; r++) {
      const again = await embedSemantic(text);
      if (again.length !== first.length || !again.every((v, i) => v === first[i])) {
        stable = false;
        break;
      }
    }
    if (!stable) allStable = false;
    entries.push({
      text,
      fingerprint: vectorFingerprint(first, precision),
      sameMachineStable: stable,
    });
  }

  return {
    manifestVersion: DETERMINISM_MANIFEST_VERSION,
    modelId: SEMANTIC_NOVELTY_MODEL,
    machineLabel,
    precision,
    dim,
    repeats,
    sameMachineStable: allStable,
    entries,
  };
}

export interface ManifestComparison {
  /** False when the two manifests describe different model/precision/dim/text-sets (not comparable). */
  comparable: boolean;
  reason?: string;
  /** True iff comparable AND every probe fingerprint matches. */
  identical: boolean;
  machineA: string;
  machineB: string;
  mismatchedTexts: ReadonlyArray<string>;
}

/** Pure pairwise comparison of two manifests. No model required. */
export function compareDeterminismManifests(
  a: DeterminismManifest,
  b: DeterminismManifest
): ManifestComparison {
  const base = {
    machineA: a.machineLabel,
    machineB: b.machineLabel,
    mismatchedTexts: [] as string[],
  };
  if (a.manifestVersion !== b.manifestVersion) {
    return { ...base, comparable: false, reason: 'manifest version mismatch', identical: false };
  }
  if (a.modelId !== b.modelId) {
    return { ...base, comparable: false, reason: 'model id mismatch', identical: false };
  }
  if (a.precision !== b.precision) {
    return { ...base, comparable: false, reason: 'precision mismatch', identical: false };
  }
  if (a.dim !== b.dim) {
    return { ...base, comparable: false, reason: 'embedding dim mismatch', identical: false };
  }
  if (
    a.entries.length !== b.entries.length ||
    !a.entries.every((e, i) => e.text === b.entries[i]?.text)
  ) {
    return { ...base, comparable: false, reason: 'probe text set mismatch', identical: false };
  }
  const mismatchedTexts = a.entries
    .filter((e, i) => e.fingerprint !== b.entries[i].fingerprint)
    .map((e) => e.text);
  return { ...base, comparable: true, identical: mismatchedTexts.length === 0, mismatchedTexts };
}

export type DeterminismVerdict =
  | 'insufficient-evidence' // < 2 distinct machines — cannot prove cross-fleet reproducibility
  | 'incomparable' // manifests describe different model/precision/dim/texts
  | 'unstable' // a machine failed same-machine repeat stability
  | 'divergent' // machines disagree on at least one fingerprint
  | 'byte-identical'; // ≥ 2 distinct machines, all stable, all fingerprints match

export interface DeterminismGateAssessment {
  verdict: DeterminismVerdict;
  /**
   * The promotion decision. ONLY `byte-identical` across ≥2 distinct machines is eligible.
   * Everything else keeps the semantic layer ADVISORY and the trigram guard receipt-binding.
   */
  receiptBindingEligible: boolean;
  machineCount: number;
  machineLabels: ReadonlyArray<string>;
  modelId: typeof SEMANTIC_NOVELTY_MODEL;
  precision: number | null;
  /** Texts that diverged across machines (for `divergent`). */
  divergentTexts: ReadonlyArray<string>;
  notes: string;
}

/**
 * PURE verdict over a set of fleet manifests. The honest fallback is structural: a single
 * machine can never reach `byte-identical` — promotion requires ≥2 DISTINCT machines whose
 * fingerprints all match and whose runs were all same-machine stable. No model required.
 */
export function assessDeterminismGate(
  manifests: ReadonlyArray<DeterminismManifest>
): DeterminismGateAssessment {
  // Dedupe by machineLabel (first occurrence wins) — distinct machines are what matters.
  const distinct: DeterminismManifest[] = [];
  const seen = new Set<string>();
  for (const m of manifests) {
    if (!seen.has(m.machineLabel)) {
      seen.add(m.machineLabel);
      distinct.push(m);
    }
  }
  const machineLabels = distinct.map((m) => m.machineLabel);
  const modelId = SEMANTIC_NOVELTY_MODEL;

  if (distinct.length < 2) {
    return {
      verdict: 'insufficient-evidence',
      receiptBindingEligible: false,
      machineCount: distinct.length,
      machineLabels,
      modelId,
      precision: distinct[0]?.precision ?? null,
      divergentTexts: [],
      notes:
        'Need ≥2 distinct machines to prove cross-fleet reproducibility. Semantic layer stays advisory; trigram guard remains receipt-binding.',
    };
  }

  const unstable = distinct.filter((m) => !m.sameMachineStable).map((m) => m.machineLabel);
  if (unstable.length > 0) {
    return {
      verdict: 'unstable',
      receiptBindingEligible: false,
      machineCount: distinct.length,
      machineLabels,
      modelId,
      precision: distinct[0].precision,
      divergentTexts: [],
      notes: `Same-machine instability on: ${unstable.join(', ')}. Output is non-deterministic even on one machine; stays advisory.`,
    };
  }

  // Compare every machine against the first.
  const reference = distinct[0];
  const divergent = new Set<string>();
  for (let i = 1; i < distinct.length; i++) {
    const cmp = compareDeterminismManifests(reference, distinct[i]);
    if (!cmp.comparable) {
      return {
        verdict: 'incomparable',
        receiptBindingEligible: false,
        machineCount: distinct.length,
        machineLabels,
        modelId,
        precision: reference.precision,
        divergentTexts: [],
        notes: `Manifests not comparable (${cmp.reason}); align model/precision/probe-set across the fleet and re-run.`,
      };
    }
    for (const t of cmp.mismatchedTexts) divergent.add(t);
  }

  if (divergent.size > 0) {
    return {
      verdict: 'divergent',
      receiptBindingEligible: false,
      machineCount: distinct.length,
      machineLabels,
      modelId,
      precision: reference.precision,
      divergentTexts: [...divergent],
      notes: `${divergent.size} probe(s) diverge across the fleet at precision ${reference.precision}. Semantic layer STAYS advisory; trigram guard remains the receipt binding (graceful degrade).`,
    };
  }

  return {
    verdict: 'byte-identical',
    receiptBindingEligible: true,
    machineCount: distinct.length,
    machineLabels,
    modelId,
    precision: reference.precision,
    divergentTexts: [],
    notes: `All ${distinct.length} machines produce byte-identical fingerprints at precision ${reference.precision}. ELIGIBLE for receipt-binding promotion (record model content-hash + precision in the receipt).`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tolerance-based determinism (the ROBUST receipt primitive — P1 follow-up).
//
// The fixed-precision fingerprint gate above has boundary-straddle fragility: a vector
// component within (fleet jitter) of a rounding boundary flips the fingerprint at ANY fixed
// precision, so `divergent` can be reported even when the true divergence is sub-epsilon
// (exactly what the empirical P1 run found — 1.04e-7 jitter, but 3/5 fingerprints split at p6).
// Comparing RAW vectors with an absolute tolerance has no such fragility: it asks the honest
// question directly — "do the fleet's embeddings agree to within ε?" — which is the right
// gate for advisory→receipt-binding promotion. Pure; no model required.

/** Raw (un-quantized) embedding manifest — the shape emitted by scripts/.../determinism-raw.mjs. */
export interface RawVectorManifest {
  machineLabel: string;
  modelId: typeof SEMANTIC_NOVELTY_MODEL;
  dim: number;
  /** probe text → its L2-normalized embedding on this machine. */
  vectors: Readonly<Record<string, ReadonlyArray<number>>>;
}

/**
 * Default tolerance: 1e-5. Well above the measured cross-fleet float32 jitter (~1e-7) and far
 * below any semantically meaningful embedding delta — so it absorbs ULP noise without masking a
 * real model/version change. Tune per measured fleet jitter before promotion.
 */
export const DEFAULT_DETERMINISM_TOLERANCE = 1e-5;

export interface RawToleranceComparison {
  comparable: boolean;
  reason?: string;
  withinTolerance: boolean;
  maxAbsDelta: number;
  machineA: string;
  machineB: string;
  /** Probes whose max component delta exceeded ε. */
  exceedingTexts: ReadonlyArray<string>;
}

/** Pure: compare two raw manifests component-wise; agree iff every |Δ| ≤ ε. */
export function compareRawWithinTolerance(
  a: RawVectorManifest,
  b: RawVectorManifest,
  epsilon: number = DEFAULT_DETERMINISM_TOLERANCE
): RawToleranceComparison {
  const base = {
    machineA: a.machineLabel,
    machineB: b.machineLabel,
    exceedingTexts: [] as string[],
  };
  if (a.modelId !== b.modelId) {
    return {
      ...base,
      comparable: false,
      reason: 'model id mismatch',
      withinTolerance: false,
      maxAbsDelta: Infinity,
    };
  }
  if (a.dim !== b.dim) {
    return {
      ...base,
      comparable: false,
      reason: 'embedding dim mismatch',
      withinTolerance: false,
      maxAbsDelta: Infinity,
    };
  }
  const aTexts = Object.keys(a.vectors).sort();
  const bTexts = Object.keys(b.vectors).sort();
  if (aTexts.length !== bTexts.length || !aTexts.every((t, i) => t === bTexts[i])) {
    return {
      ...base,
      comparable: false,
      reason: 'probe text set mismatch',
      withinTolerance: false,
      maxAbsDelta: Infinity,
    };
  }
  let maxAbsDelta = 0;
  const exceedingTexts: string[] = [];
  for (const t of aTexts) {
    const va = a.vectors[t];
    const vb = b.vectors[t];
    let probeMax = 0;
    for (let i = 0; i < va.length; i++) {
      const d = Math.abs(va[i] - vb[i]);
      if (d > probeMax) probeMax = d;
    }
    if (probeMax > maxAbsDelta) maxAbsDelta = probeMax;
    if (probeMax > epsilon) exceedingTexts.push(t);
  }
  return {
    ...base,
    comparable: true,
    withinTolerance: exceedingTexts.length === 0,
    maxAbsDelta,
    exceedingTexts,
  };
}

export interface RawToleranceGateAssessment {
  verdict: 'insufficient-evidence' | 'incomparable' | 'divergent' | 'within-tolerance';
  receiptBindingEligible: boolean;
  epsilon: number;
  maxAbsDelta: number;
  machineCount: number;
  machineLabels: ReadonlyArray<string>;
  modelId: typeof SEMANTIC_NOVELTY_MODEL;
  exceedingTexts: ReadonlyArray<string>;
  notes: string;
}

/**
 * PURE tolerance verdict over raw-vector manifests from the fleet. Same honest fallback as the
 * fingerprint gate — a single machine is `insufficient-evidence`, never eligible. Eligible only
 * when ≥2 DISTINCT machines all agree to within ε. This is the robust promotion gate the scope
 * recommends over fixed-precision hashing (no boundary-straddle).
 */
export function assessRawToleranceGate(
  manifests: ReadonlyArray<RawVectorManifest>,
  epsilon: number = DEFAULT_DETERMINISM_TOLERANCE
): RawToleranceGateAssessment {
  const distinct: RawVectorManifest[] = [];
  const seen = new Set<string>();
  for (const m of manifests) {
    if (!seen.has(m.machineLabel)) {
      seen.add(m.machineLabel);
      distinct.push(m);
    }
  }
  const machineLabels = distinct.map((m) => m.machineLabel);
  const modelId = SEMANTIC_NOVELTY_MODEL;
  if (distinct.length < 2) {
    return {
      verdict: 'insufficient-evidence',
      receiptBindingEligible: false,
      epsilon,
      maxAbsDelta: 0,
      machineCount: distinct.length,
      machineLabels,
      modelId,
      exceedingTexts: [],
      notes: 'Need ≥2 distinct machines to prove cross-fleet reproducibility. Stays advisory.',
    };
  }
  const reference = distinct[0];
  let maxAbsDelta = 0;
  const exceeding = new Set<string>();
  for (let i = 1; i < distinct.length; i++) {
    const cmp = compareRawWithinTolerance(reference, distinct[i], epsilon);
    if (!cmp.comparable) {
      return {
        verdict: 'incomparable',
        receiptBindingEligible: false,
        epsilon,
        maxAbsDelta: Infinity,
        machineCount: distinct.length,
        machineLabels,
        modelId,
        exceedingTexts: [],
        notes: `Manifests not comparable (${cmp.reason}); align model/probe-set across the fleet.`,
      };
    }
    if (cmp.maxAbsDelta > maxAbsDelta) maxAbsDelta = cmp.maxAbsDelta;
    for (const t of cmp.exceedingTexts) exceeding.add(t);
  }
  if (exceeding.size > 0) {
    return {
      verdict: 'divergent',
      receiptBindingEligible: false,
      epsilon,
      maxAbsDelta,
      machineCount: distinct.length,
      machineLabels,
      modelId,
      exceedingTexts: [...exceeding],
      notes: `${exceeding.size} probe(s) exceed ε=${epsilon} (maxΔ=${maxAbsDelta.toExponential(3)}). Stays advisory.`,
    };
  }
  return {
    verdict: 'within-tolerance',
    receiptBindingEligible: true,
    epsilon,
    maxAbsDelta,
    machineCount: distinct.length,
    machineLabels,
    modelId,
    exceedingTexts: [],
    notes: `All ${distinct.length} machines agree to within ε=${epsilon} (maxΔ=${maxAbsDelta.toExponential(3)}). ELIGIBLE for receipt-binding promotion via a tolerance comparator.`,
  };
}
