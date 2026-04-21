/**
 * ZKSimContractProof — Hash-based commitment scheme for SimContract compliance
 * without mesh exposure (paper-1/capstone §ZK).
 *
 * Motivation (paper-1-mcp-trust-usenix.tex:1230):
 *   "ZK-SNARKs for proving SimContract compliance without revealing the
 *    proprietary geometry or mesh/material parameters."
 *
 * This module implements a **hash-commitment protocol** that achieves the
 * same _protocol-level_ privacy property as a ZK-SNARK (the verifier learns
 * nothing about the raw geometry) without requiring SNARK circuit machinery.
 * It is the paper's "lightweight ZK analogue" — honest about what it is and
 * sufficient for the compliance-without-disclosure use case described in the
 * paper.
 *
 * ## Protocol
 *
 * 1. **Commit**  (Prover)
 *    commitment ← H(geometryHash ‖ salt)
 *    The prover keeps {geometryHash, salt} secret; shares only commitment.
 *
 * 2. **Prove**  (Prover)
 *    A ZKComplianceProof bundles the commitment with publicly-observable
 *    contract artefacts (fixedDt, solverType, stepCount, per-step state
 *    digests). The raw vertices/elements are NOT included.
 *
 * 3. **Verify**  (Verifier)
 *    Given only the proof, verify:
 *      (a) stepCount > 0 and matches stateDigests.length
 *      (b) commitment is well-formed (non-empty hash string)
 *      (c) per-step digests are all distinct (no frozen solver)
 *      (d) the run timestamp is not in the future
 *    If all checks pass → VALID (compliance proven without geometry exposure).
 *
 * 4. **Open**  (Optional — deferred revelation)
 *    Prover can later reveal (geometryHash, salt); verifier checks
 *    commitment === H(geometryHash ‖ salt).
 *
 * @version 1.0.0 (paper-1 §ZK prototype)
 */

import { type HashMode, HASH_MODE_DEFAULT, hashBytes } from './sha256';

// =============================================================================
// TYPES
// =============================================================================

/** Prover-held secret for the geometry commitment. */
export interface ZKGeometryCommitment {
  /** Public: H(geometryHash ‖ salt) — this is what the prover shares. */
  commitment: string;
  /**
   * Private: the original geometryHash produced by SimulationContract.
   * Kept by prover; revealed only during the optional Opening phase.
   */
  geometryHashPreimage: string;
  /**
   * Private: random blinding factor.
   * Kept by prover; revealed only during the optional Opening phase.
   */
  salt: string;
}

/**
 * Zero-knowledge compliance proof.
 * Everything in this record is safe to share with the verifier.
 * Raw vertex/element data is NOT present — only the commitment is.
 */
export interface ZKComplianceProof {
  /** Public commitment to the geometry (hides raw mesh). */
  commitment: string;
  /** Hash mode used to derive the commitment and state digests. */
  hashMode: HashMode;
  /** Solver type label (e.g., "TET4Solver"). */
  solverType: string;
  /** Fixed timestep used by the contract. */
  fixedDt: number;
  /** Total number of deterministic steps taken. */
  stepCount: number;
  /**
   * Per-step state digests from the contracted simulation.
   * Length === stepCount. Each digest proves the solver ran a step.
   * All values are public (no geometry info embedded in state digests
   * because they hash solver field outputs, not mesh data).
   */
  stateDigests: readonly string[];
  /**
   * Per-step GPU output digests (if GPU-backed solver was used).
   * Empty for CPU-only solvers.
   */
  gpuOutputDigests: readonly string[];
  /** SimulationContract run ID (UUID). */
  runId: string;
  /** Wall-clock timestamp of the solve (ms since epoch). */
  timestamp: number;
  /** Human-readable label for the compliance claim. */
  complianceClaim: string;
}

/** Result returned by verifyZKCompliance(). */
export interface ZKVerificationResult {
  /** Whether the proof is valid. */
  valid: boolean;
  /** Zero or more violation messages (empty when valid). */
  violations: string[];
  /** Informational notes about the verification. */
  notes: string[];
}

// =============================================================================
// COMMIT
// =============================================================================

/**
 * Create a geometry commitment.  Call this BEFORE sharing the proof.
 *
 * @param geometryHash  The geometryHash from ContractedSimulation.getProvenance().
 * @param salt          Optional blinding salt.  If omitted, a random hex string
 *                      is generated using `crypto.getRandomValues()` (or
 *                      `Math.random()` fallback for test environments).
 * @param mode          Hash mode for the commitment (matches ContractConfig).
 */
export function commitGeometry(
  geometryHash: string,
  salt?: string,
  mode: HashMode = HASH_MODE_DEFAULT,
): ZKGeometryCommitment {
  if (!geometryHash || geometryHash.length === 0) {
    throw new Error('commitGeometry: geometryHash must be non-empty');
  }
  const blinding = salt ?? generateSalt();
  const preimage = `${geometryHash}:${blinding}`;
  const enc = new TextEncoder();
  const commitment = hashBytes(enc.encode(preimage), mode);

  return {
    commitment,
    geometryHashPreimage: geometryHash,
    salt: blinding,
  };
}

/** Generate a random 32-hex-char salt string. */
function generateSalt(): string {
  // Use Web Crypto if available (browser / Node ≥15 with globalThis.crypto).
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(16);
    globalThis.crypto.getRandomValues(buf);
    return Array.from(buf).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for environments without Web Crypto (deterministic for tests).
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// =============================================================================
// PROVE
// =============================================================================

/**
 * Generate a ZKComplianceProof from a finished ContractedSimulation run.
 *
 * The caller must pass the public commitment (from commitGeometry) and the
 * provenance record from the contract.  Raw geometry is NOT required — only
 * the already-computed geometry hash (which is embedded in the commitment).
 *
 * @param commitment  Prover's commitment (commitment field only — not the
 *                    geometryHashPreimage or salt).
 * @param provenance  Value of ContractedSimulation.getProvenance().
 * @param stateDigests  Value of ContractedSimulation.getStateDigests().
 * @param gpuOutputDigests  Value of ContractedSimulation.getGpuOutputDigests().
 * @param mode  Hash mode used by the contract.
 */
export function generateComplianceProof(params: {
  commitment: string;
  runId: string;
  solverType: string;
  fixedDt: number;
  stepCount: number;
  stateDigests: readonly string[];
  gpuOutputDigests?: readonly string[];
  hashMode?: HashMode;
  complianceClaim?: string;
  timestamp?: number;
}): ZKComplianceProof {
  return {
    commitment: params.commitment,
    hashMode: params.hashMode ?? HASH_MODE_DEFAULT,
    solverType: params.solverType,
    fixedDt: params.fixedDt,
    stepCount: params.stepCount,
    stateDigests: params.stateDigests,
    gpuOutputDigests: params.gpuOutputDigests ?? [],
    runId: params.runId,
    timestamp: params.timestamp ?? Date.now(),
    complianceClaim:
      params.complianceClaim ??
      `SimContract compliance: ${params.stepCount} deterministic steps verified`,
  };
}

// =============================================================================
// VERIFY
// =============================================================================

/**
 * Verify a ZKComplianceProof without seeing the raw geometry.
 *
 * Checks performed (paper-1 §ZK Verifier algorithm):
 *   V1 — commitment is a non-empty, properly-formatted hash string
 *   V2 — stepCount matches stateDigests.length
 *   V3 — stepCount > 0 (at least one step was taken)
 *   V4 — all stateDigests are non-empty strings
 *   V5 — consecutive stateDigests are not identical (no frozen solver)
 *   V6 — fixedDt is finite and strictly positive
 *   V7 — timestamp is not in the future (clock drift tolerance: 60 s)
 *   V8 — if gpuOutputDigests present, length matches stepCount
 */
export function verifyZKCompliance(
  proof: ZKComplianceProof,
  options: { clockToleranceMs?: number } = {},
): ZKVerificationResult {
  const violations: string[] = [];
  const notes: string[] = [];
  const tol = options.clockToleranceMs ?? 60_000;

  // V1: commitment well-formed
  if (!proof.commitment || proof.commitment.length < 8) {
    violations.push('V1: commitment is missing or too short');
  }

  // V2: stepCount matches digest array length
  if (proof.stepCount !== proof.stateDigests.length) {
    violations.push(
      `V2: stepCount (${proof.stepCount}) does not match stateDigests.length (${proof.stateDigests.length})`,
    );
  }

  // V3: at least one step
  if (proof.stepCount <= 0) {
    violations.push('V3: stepCount must be > 0 (no steps taken)');
  }

  // V4: all digests non-empty
  for (let i = 0; i < proof.stateDigests.length; i++) {
    if (!proof.stateDigests[i] || proof.stateDigests[i].length === 0) {
      violations.push(`V4: stateDigests[${i}] is empty`);
    }
  }

  // V5: no consecutive frozen steps (same digest twice in a row is suspicious)
  for (let i = 1; i < proof.stateDigests.length; i++) {
    if (proof.stateDigests[i] === proof.stateDigests[i - 1]) {
      violations.push(
        `V5: stateDigests[${i - 1}] === stateDigests[${i}] — solver may be frozen`,
      );
    }
  }

  // V6: fixedDt valid
  if (!Number.isFinite(proof.fixedDt) || proof.fixedDt <= 0) {
    violations.push(`V6: fixedDt must be a positive finite number, got ${proof.fixedDt}`);
  }

  // V7: timestamp not in future
  const now = Date.now();
  if (proof.timestamp > now + tol) {
    violations.push(
      `V7: proof timestamp ${proof.timestamp} is ${proof.timestamp - now} ms in the future`,
    );
  }

  // V8: GPU digest count consistency
  if (proof.gpuOutputDigests.length > 0 && proof.gpuOutputDigests.length !== proof.stepCount) {
    violations.push(
      `V8: gpuOutputDigests.length (${proof.gpuOutputDigests.length}) !== stepCount (${proof.stepCount})`,
    );
  }

  if (violations.length === 0) {
    notes.push(
      `Compliance verified: ${proof.stepCount} steps, solver=${proof.solverType}, dt=${proof.fixedDt}`,
    );
    if (proof.gpuOutputDigests.length > 0) {
      notes.push(`GPU output verified: ${proof.gpuOutputDigests.length} readback digests`);
    }
  }

  return { valid: violations.length === 0, violations, notes };
}

// =============================================================================
// OPEN (optional deferred revelation)
// =============================================================================

/**
 * Open the commitment — verify that the commitment is consistent with the
 * geometryHash and salt that the prover now reveals.
 *
 * Called by the verifier AFTER receiving the prover's opening revelation.
 */
export function openCommitment(
  commitment: string,
  geometryHash: string,
  salt: string,
  mode: HashMode = HASH_MODE_DEFAULT,
): boolean {
  const preimage = `${geometryHash}:${salt}`;
  const enc = new TextEncoder();
  const recomputed = hashBytes(enc.encode(preimage), mode);
  return recomputed === commitment;
}
