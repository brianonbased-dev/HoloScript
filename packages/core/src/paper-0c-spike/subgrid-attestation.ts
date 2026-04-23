/**
 * paper-0c subgrid-parameter attestation (TODO-05).
 *
 * ## Why this exists
 *
 * Independent galaxy-formation suites (EAGLE, IllustrisTNG, FIRE-3, COLIBRE)
 * reproduce the observed stellar-mass function using demonstrably different
 * subgrid feedback physics — a persistent observational degeneracy
 * re-confirmed in cross-code calibration studies (ARCHITECTS II, 2026).
 * Increasing particle count does NOT resolve this: the ambiguity lives in
 * calibration choices below the resolution floor.
 *
 * CAEL's hash-chain primitive already records ContractConfig hashMode in the
 * trace init payload (see SimulationContract.ts ContractConfig /
 * `cael.init.payload.hashMode`). This module extends the same idea to the
 * full subgrid parameter vector: feedback efficiencies, cooling thresholds,
 * resolution floor, and any other named scalar/boolean/string controls.
 * Two runs that are observationally indistinguishable at the output level
 * become cryptographically distinguishable at the provenance level.
 *
 * **This is a labeling result, not a physics result.** It does not close the
 * degeneracy. It makes the degeneracy tractable under Simulation-Based
 * Inference, where posterior fidelity depends on knowing which simulator
 * configuration produced each training sample.
 *
 * ## Integration hook (followup, out-of-scope for this ship)
 *
 * Engine integration site: `packages/engine/src/simulation/SimulationContract.ts`
 * ContractConfig — add `subgridParams?: SubgridParams` field, call
 * `attestSubgridParams()` at ContractedSimulation construction, and fold the
 * resulting `hash` into Contract-ID alongside `geometryHash` and
 * `adapterFingerprint`. Record the full SubgridAttestation envelope in
 * `cael.init.payload.subgridAttestation`.
 *
 * This ship provides the primitive; engine integration is a separate task.
 *
 * ## Design notes
 *
 * - Kept engine-free. Imports only from sibling `reconstruction/` module
 *   (same package, same build target). Matches the "dep-free of engine
 *   internals" precedent set by quantum-registry.ts.
 * - Two hash modes, paralleling ContractConfig.useCryptographicHash:
 *   FNV-1a (default, synchronous, 16 hex) and SHA-256 (async, 64 hex).
 *   Mode recorded in the envelope to defeat mode-substitution attacks at
 *   replay.
 * - Canonicalization uses sorted keys + pipe-delimited key=value pairs —
 *   same family as replayFingerprint.ts.
 */

import { fnv1a32Hex } from '../reconstruction/replayFingerprint';

// ── Types ────────────────────────────────────────────────────────────────────

/** Hash mode, paralleling ContractConfig.useCryptographicHash. */
export type HashMode = 'fnv1a' | 'sha256';

/** Default mode matches ContractConfig's default (FNV-1a, non-adversarial). */
export const DEFAULT_HASH_MODE: HashMode = 'fnv1a';

/** Permitted subgrid parameter value types. */
export type SubgridParamValue = number | boolean | string;

/** A subgrid parameter vector. Keys are lexicographically sorted during canonicalization. */
export type SubgridParams = Record<string, SubgridParamValue>;

/**
 * Attestation envelope folded into CAEL trace init payload
 * (`cael.init.payload.subgridAttestation`) and, upstream, into Contract-ID.
 */
export interface SubgridAttestation {
  /** Hex-encoded hash of the canonical parameter string. */
  readonly hash: string;
  /** Mode used to produce `hash`. Recorded to detect mode substitution at replay. */
  readonly hashMode: HashMode;
  /** Canonical string form used as hash input. Machine-checkable, not for display. */
  readonly canonicalForm: string;
}

/** Verification result — valid, or a detailed mismatch reason. */
export type VerifyResult =
  | { readonly valid: true }
  | {
      readonly valid: false;
      readonly reason: 'hashMode-mismatch' | 'hash-mismatch' | 'canonical-form-mismatch';
      readonly expected: string;
      readonly actual: string;
    };

// ── Error types ──────────────────────────────────────────────────────────────

/**
 * Thrown when the subgrid parameter vector is missing or empty. Refusing
 * empty vectors is a deliberate choice: silently hashing an empty object
 * would produce a constant hash across all "unspecified" runs, defeating
 * the whole point of attestation.
 */
export class MissingSubgridParamsError extends Error {
  constructor() {
    super(
      'Subgrid parameter vector is required — empty or missing vectors are refused ' +
        'to prevent silent empty-hash attestation. Pass explicit keys with their run-time values.'
    );
    this.name = 'MissingSubgridParamsError';
  }
}

/**
 * Thrown when a parameter value is of an unsupported type or a non-finite
 * number (NaN, +/-Infinity). Silently accepting these would produce
 * non-deterministic or misleading canonical forms.
 */
export class InvalidSubgridParamValueError extends Error {
  constructor(key: string, value: unknown) {
    super(
      `Subgrid parameter '${key}' has invalid value ${String(value)} (type ${typeof value}). ` +
        'Allowed value types: finite number, boolean, string.'
    );
    this.name = 'InvalidSubgridParamValueError';
  }
}

// ── Canonicalization ─────────────────────────────────────────────────────────

/**
 * Canonicalize a subgrid parameter vector to a deterministic string.
 *
 * Rules:
 * - Keys sorted ascending (lexicographic, default String < comparison).
 *   This defeats Object.keys() insertion-order drift across JS engines.
 * - Numbers serialized via Number.prototype.toString(). Finite-only:
 *   NaN, +Infinity, -Infinity are refused.
 * - Booleans serialized as `true` / `false` literals.
 * - Strings wrapped in backticks (e.g. `=`foo``) to unambiguously separate
 *   string values from numeric values at the same key (avoids the
 *   `"42"` vs `42` collision).
 * - Format: `key=value|key=value|...` — pipe delimiter, same family as
 *   replayFingerprint.ts.
 *
 * @throws MissingSubgridParamsError if the vector is empty.
 * @throws InvalidSubgridParamValueError for non-finite numbers, null, undefined, or object values.
 */
export function canonicalizeSubgridParams(params: SubgridParams): string {
  const keys = Object.keys(params);
  if (keys.length === 0) {
    throw new MissingSubgridParamsError();
  }
  const sorted = keys.slice().sort();
  const parts: string[] = [];
  for (const key of sorted) {
    const v = params[key];
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) {
        throw new InvalidSubgridParamValueError(key, v);
      }
      parts.push(`${key}=${v.toString()}`);
    } else if (typeof v === 'boolean') {
      parts.push(`${key}=${v ? 'true' : 'false'}`);
    } else if (typeof v === 'string') {
      parts.push(`${key}=\`${v}\``);
    } else {
      throw new InvalidSubgridParamValueError(key, v);
    }
  }
  return parts.join('|');
}

// ── SHA-256 via Web Crypto (isomorphic: Node 20+, browsers, Deno) ────────────

/**
 * Compute SHA-256 over a UTF-8 string, returning 64-hex.
 * Kept local to paper-0c-spike to preserve this module's engine-free import
 * graph. Uses Web Crypto's SubtleCrypto, which is available in Node 20+
 * (globalThis.crypto.subtle), browsers, and Deno without shims.
 */
async function sha256Hex(input: string): Promise<string> {
  const subtle =
    typeof globalThis.crypto !== 'undefined' && 'subtle' in globalThis.crypto
      ? globalThis.crypto.subtle
      : undefined;
  if (!subtle) {
    throw new Error(
      'SubtleCrypto unavailable: SHA-256 mode requires Web Crypto (Node 20+, browsers, Deno).'
    );
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  const hex: string[] = [];
  for (const b of view) hex.push(b.toString(16).padStart(2, '0'));
  return hex.join('');
}

// ── Hashing ──────────────────────────────────────────────────────────────────

/**
 * Hash a canonicalized subgrid param string under the requested mode.
 *
 * - `'fnv1a'` returns `string` synchronously (16-hex, 64-bit effective).
 * - `'sha256'` returns `Promise<string>` (64-hex).
 *
 * Caller picks mode to match `ContractConfig.useCryptographicHash`.
 */
export function hashSubgridParams(params: SubgridParams, mode: 'fnv1a'): string;
export function hashSubgridParams(params: SubgridParams, mode: 'sha256'): Promise<string>;
export function hashSubgridParams(
  params: SubgridParams,
  mode: HashMode
): string | Promise<string>;
export function hashSubgridParams(
  params: SubgridParams,
  mode: HashMode = DEFAULT_HASH_MODE
): string | Promise<string> {
  const canonical = canonicalizeSubgridParams(params);
  if (mode === 'fnv1a') return fnv1a32Hex(canonical);
  if (mode === 'sha256') return sha256Hex(canonical);
  // Exhaustiveness guard — only reachable via unchecked casts.
  throw new Error(`Unknown hash mode: ${String(mode)}`);
}

// ── Attestation (envelope wrapper) ───────────────────────────────────────────

/**
 * Produce a SubgridAttestation envelope. Intended to be folded into the CAEL
 * trace init payload (`cael.init.payload.subgridAttestation`) and, upstream,
 * folded into Contract-ID alongside `geometryHash` + `adapterFingerprint`.
 *
 * Engine integration point: see module header "Integration hook" section.
 */
export function attestSubgridParams(
  params: SubgridParams,
  mode: 'fnv1a'
): SubgridAttestation;
export function attestSubgridParams(
  params: SubgridParams,
  mode: 'sha256'
): Promise<SubgridAttestation>;
export function attestSubgridParams(
  params: SubgridParams,
  mode?: HashMode
): SubgridAttestation | Promise<SubgridAttestation>;
export function attestSubgridParams(
  params: SubgridParams,
  mode: HashMode = DEFAULT_HASH_MODE
): SubgridAttestation | Promise<SubgridAttestation> {
  const canonicalForm = canonicalizeSubgridParams(params);
  if (mode === 'fnv1a') {
    return Object.freeze({
      hash: fnv1a32Hex(canonicalForm),
      hashMode: 'fnv1a',
      canonicalForm,
    });
  }
  if (mode === 'sha256') {
    return sha256Hex(canonicalForm).then((hash) =>
      Object.freeze({ hash, hashMode: 'sha256' as const, canonicalForm })
    );
  }
  throw new Error(`Unknown hash mode: ${String(mode)}`);
}

// ── Verification (replay side) ───────────────────────────────────────────────

const FNV1A_HEX_SHAPE = /^[0-9a-f]{16}$/;
const SHA256_HEX_SHAPE = /^[0-9a-f]{64}$/;

function describeExpectedShape(mode: HashMode): string {
  return mode === 'fnv1a' ? 'fnv1a hash (16 hex chars)' : 'sha256 hash (64 hex chars)';
}

/**
 * Synchronously verify a FNV-1a attestation against a parameter vector.
 *
 * Checks (in order):
 *   1. Canonical form matches — defeats param tampering.
 *   2. Hash-shape matches declared mode — defeats mode-substitution attacks
 *      where an adversary swaps hash content but leaves `hashMode` unchanged.
 *   3. Hash equality under the declared mode.
 *
 * For SHA-256 attestations, throws: SHA-256 verification is async and must
 * use `verifySubgridAttestationAsync`. The throw is deliberate — silently
 * returning `{valid: true}` for an unverifiable attestation would be worse
 * than the work required to switch to the async path.
 */
export function verifySubgridAttestation(
  attestation: SubgridAttestation,
  params: SubgridParams
): VerifyResult {
  const canonical = canonicalizeSubgridParams(params);
  if (canonical !== attestation.canonicalForm) {
    return {
      valid: false,
      reason: 'canonical-form-mismatch',
      expected: attestation.canonicalForm,
      actual: canonical,
    };
  }
  const expectedShape = attestation.hashMode === 'fnv1a' ? FNV1A_HEX_SHAPE : SHA256_HEX_SHAPE;
  if (!expectedShape.test(attestation.hash)) {
    return {
      valid: false,
      reason: 'hashMode-mismatch',
      expected: describeExpectedShape(attestation.hashMode),
      actual: `${attestation.hash.length} hex chars`,
    };
  }
  if (attestation.hashMode === 'fnv1a') {
    const computed = fnv1a32Hex(canonical);
    return computed === attestation.hash
      ? { valid: true }
      : { valid: false, reason: 'hash-mismatch', expected: attestation.hash, actual: computed };
  }
  // attestation.hashMode === 'sha256'
  throw new Error(
    'verifySubgridAttestation: sha256 mode requires verifySubgridAttestationAsync (async crypto).'
  );
}

/**
 * Async-capable verify. Works for both FNV-1a and SHA-256 attestations.
 * Prefer this in non-hot-path contexts for uniform handling.
 */
export async function verifySubgridAttestationAsync(
  attestation: SubgridAttestation,
  params: SubgridParams
): Promise<VerifyResult> {
  if (attestation.hashMode === 'fnv1a') {
    return verifySubgridAttestation(attestation, params);
  }
  const canonical = canonicalizeSubgridParams(params);
  if (canonical !== attestation.canonicalForm) {
    return {
      valid: false,
      reason: 'canonical-form-mismatch',
      expected: attestation.canonicalForm,
      actual: canonical,
    };
  }
  if (!SHA256_HEX_SHAPE.test(attestation.hash)) {
    return {
      valid: false,
      reason: 'hashMode-mismatch',
      expected: describeExpectedShape('sha256'),
      actual: `${attestation.hash.length} hex chars`,
    };
  }
  const computed = await sha256Hex(canonical);
  return computed === attestation.hash
    ? { valid: true }
    : { valid: false, reason: 'hash-mismatch', expected: attestation.hash, actual: computed };
}
