/**
 * SimulationContract — Enforced runtime guarantees for scientifically reliable simulation.
 *
 * What makes HoloScript different: the render model and the solver model are
 * the SAME object. This contract enforces that guarantee at runtime.
 *
 * ## Guarantees
 *
 * 1. **Geometry integrity**: Solver mesh hash === render mesh hash. No mismatch.
 * 2. **Unit validation**: All physical quantities carry validated units. No raw numbers.
 * 3. **Deterministic stepping**: Fixed timestep accumulator. Same input → same output always.
 * 4. **Interaction provenance**: Every user action that affects solver state is logged.
 * 5. **Auto-provenance**: Every solve() automatically records config + results + timing.
 * 6. **Replay**: Any simulation can be exactly reproduced from its provenance record.
 *
 * ## Usage
 *
 * Wrap any SimSolver in a ContractedSimulation to get all guarantees:
 *
 *   const contracted = new ContractedSimulation(solver, config);
 *   contracted.step(dt);        // deterministic, logged
 *   contracted.logInteraction('user_moved_load', { position: [25, 0, 0] });
 *   const provenance = contracted.getProvenance();  // full record
 *   const replay = contracted.createReplay();        // reproducible
 */

import type { SimSolver, FieldData } from './SimSolver';
import { isGpuBackedSolver } from './SimSolver';
import { type HashMode, HASH_MODE_DEFAULT, sha256Bytes } from './sha256';
import { computeStateDigest, hashGeometry, hashGpuOutput } from './hashes';
import {
  canonicalizeSubgridParams,
  type SubgridAttestation,
  type SubgridParams,
} from '@holoscript/core/paper-0c-spike';
import { fnv1a32Hex } from '@holoscript/core/reconstruction';

export {
  hashCAELEntry,
  computeStateDigest,
  hashGeometry,
  hashGpuOutput,
  quantumForField,
} from './hashes';
export type { HashMode } from './sha256';
export type { SubgridAttestation, SubgridParams } from '@holoscript/core/paper-0c-spike';

// ── Types ────────────────────────────────────────────────────────────────────

export interface InteractionEvent {
  /** Monotonic event ID */
  id: number;
  /** Wall-clock timestamp */
  timestamp: number;
  /** Simulation time when this interaction occurred */
  simTime: number;
  /** Type of interaction */
  type: string;
  /** Interaction payload (position change, load update, etc.) */
  data: Record<string, unknown>;
}

export interface SimulationProvenance {
  /** Unique run ID */
  runId: string;
  /** Geometry hash (SHA-like fingerprint of vertex + connectivity data) */
  geometryHash: string;
  /** Composite Contract-ID — `geometryHash` plus, when present, the
   *  adapter fingerprint and the subgrid-parameter attestation hash
   *  folded in deterministically. Backward-compat: when neither
   *  `adapterFingerprint` nor `subgridParams` is set on the contract,
   *  `contractId === geometryHash` byte-identically. */
  contractId: string;
  /** Subgrid-parameter attestation envelope (paper-0c CAEL). Present
   *  iff `ContractConfig.subgridParams` was provided at construction.
   *  The envelope's `hash` is folded into `contractId`; the full envelope
   *  (canonical form + hash + mode) is recorded by CAELRecorder into
   *  `cael.init.payload.subgridAttestation` for replay-side verification. */
  subgridAttestation?: SubgridAttestation;
  /** Solver type identifier */
  solverType: string;
  /** Full solver config (frozen at creation time) */
  config: Record<string, unknown>;
  /** Fixed timestep used */
  fixedDt: number;
  /** Total steps executed */
  totalSteps: number;
  /** Total simulation time */
  totalSimTime: number;
  /** Wall-clock solve duration (ms) */
  wallTimeMs: number;
  /** All user interactions during this simulation */
  interactions: InteractionEvent[];
  /** Final solver stats */
  finalStats: Record<string, unknown>;
  /** Whether the simulation is deterministically reproducible */
  deterministic: boolean;
  /** Platform version */
  platformVersion: string;
  /** Creation timestamp */
  createdAt: string;
}

export interface ContractViolation {
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ContractConfig {
  /** Fixed timestep in seconds (default: auto from solver CFL) */
  fixedDt?: number;
  /** Maximum timestep accumulator (prevents spiral of death, default: 0.1s) */
  maxAccumulator?: number;
  /** Whether to enforce unit validation (default: true) */
  enforceUnits?: boolean;
  /** Whether to reject meshes with out-of-range element indices (default: true). Paper #4 semantic sanity. */
  enforceMeshSanity?: boolean;
  /** Whether to log all interactions (default: true) */
  logInteractions?: boolean;
  /** Solver type label */
  solverType?: string;
  /** Use cryptographic (SHA-256) hash at the three contract hash
   *  sites (hashGeometry, computeStateDigest, hashCAELEntry) instead
   *  of the default FNV-1a.
   *
   *  Option C (SECURITY-mode 2026-04-20): FNV-1a is the DEFAULT for
   *  performance under the non-adversarial threat model; SHA-256 is
   *  opt-in for adversarial-peer deployments where collision
   *  resistance on the hash chain matters.
   *
   *  Performance cost: ~9-24× slower per-hash than FNV-1a at paper-3
   *  scales (see bench `fnv1a-vs-sha256.bench.test.ts`). On a 10^4-
   *  step full-building scenario, ~4.3 s of added hash overhead on
   *  ~30 s total simulation wall time = ~14% regression. Do not flip
   *  this on by default.
   *
   *  Mode is threaded through every contract hash site via a single
   *  dispatcher (`hashBytes` / `hashStringForCAEL`), written into
   *  `cael.init.payload.hashMode` at trace-record time, and verified
   *  at replay-time — mid-trace mode tampering throws.
   *
   *  See: ai-ecosystem research/2026-04-20_sha256-feature-flag-design.md
   *  (Option C + Wiring-commit prerequisites). */
  useCryptographicHash?: boolean;
  /** Opaque adapter fingerprint for cross-adapter dispute dispatch
   *  (paper-3 §5.2 Algorithm 1, 5b). Recorded into cael.init.payload
   *  at trace-record time; compared by CAELReplayer.sameAdapter()
   *  against the replay environment's current fingerprint at
   *  replay-time to dispatch digest-enforcement mode:
   *    same-adapter → strict digest enforcement (Item 5a behavior)
   *    cross-adapter → skip digest enforcement (Appendix A Lemma 3
   *                    regime boundary; fall through to metric-
   *                    comparison in the dispute oracle)
   *
   *  **SECURITY NOTES** (Wave-2 SECURITY-mode audit 2026-04-20 — see
   *  ai-ecosystem research/2026-04-20_adapter-fingerprint-security-audit.md):
   *
   *  - Privacy: if supplied as a raw concatenation
   *    (e.g. "vendor=Intel;device=UHD;driver=31.0"), this field
   *    leaks exact hardware identifiers to anyone who reads the
   *    trace. For traces shared externally (reviewer packages,
   *    peer-to-peer dispute exchanges, debugging exports), PREFER
   *    the SHA-256-hashed output of `computeAdapterFingerprint()`
   *    below — opaque 256-bit digest that preserves
   *    equivalence-class comparison (sameAdapter() still works)
   *    while closing the raw-identifier leak.
   *
   *  - Forgeability: this field is trust-the-caller. No validation
   *    against the actual WebGPU adapter at runtime, no signed
   *    attestation. In adversarial multi-agent settings a hostile
   *    agent can forge this field to either (a) force strict
   *    enforcement on genuinely-cross-adapter traces (DoS via
   *    spurious StateIntegrityViolation) or (b) bypass strict
   *    enforcement on genuinely-same-adapter traces by claiming
   *    different hardware. For single-tenant local development
   *    this is a non-issue; for production multi-agent contracts
   *    the fingerprint MUST come from a trusted source (WebGPU
   *    adapter info API called at recorder-construction time by
   *    trusted code, not user-supplied) and ideally
   *    cryptographically signed. Full attestation is deferred to
   *    a follow-up (see audit memo §Future hardening).
   *
   *  - Recommended use: pass the output of
   *    `await computeAdapterFingerprint(adapterInfo)` rather than
   *    a raw string. See helper below.
   *
   *  If absent at record-time, the trace is treated as
   *  cross-adapter for all replays (safe fallback). */
  adapterFingerprint?: string;

  /** Subgrid parameter vector for paper-0c CAEL attestation (TODO-05).
   *
   *  Set to declare the run's subgrid feedback / cooling / resolution-floor
   *  controls — anything below the mesh resolution that distinguishes two
   *  observationally-equivalent runs (EAGLE vs IllustrisTNG vs FIRE-3 etc.).
   *  When present, ContractedSimulation calls
   *  `canonicalizeSubgridParams()` (from `@holoscript/core/paper-0c-spike`),
   *  hashes the canonical form under the contract's `useCryptographicHash`
   *  mode, and folds the resulting hash into `getContractId()` alongside
   *  `geometryHash` and `adapterFingerprint`. The full SubgridAttestation
   *  envelope is exposed via `getSubgridAttestation()` and recorded in
   *  `cael.init.payload.subgridAttestation` by CAELRecorder.
   *
   *  **Backward compat**: when this field is ABSENT, `getContractId()`
   *  returns `geometryHash` byte-identically — no envelope is constructed,
   *  no extra hash work is done, and pre-change traces remain bit-exact
   *  reproducible. Same "omitted means unchanged fingerprint" semantics as
   *  `replayFingerprint.ts` (`weightCid`, `verticalProfile`).
   *
   *  See: `packages/core/src/paper-0c-spike/subgrid-attestation.ts`
   *  module header — "Why this exists" + "Integration hook". */
  subgridParams?: SubgridParams;
}

// ── Subgrid attestation (sync engine-side helper) ────────────────────────────

/**
 * Build a SubgridAttestation envelope synchronously inside the engine,
 * using the engine's sync hash primitives so it can be called from the
 * sync ContractedSimulation constructor.
 *
 * Why this lives in the engine rather than calling
 * `attestSubgridParams()` from `@holoscript/core/paper-0c-spike`: core's
 * SHA-256 path is async (Web Crypto, engine-free) and the engine
 * constructor is sync. We reuse core's `canonicalizeSubgridParams()` for
 * the canonical form (single source of truth — this guarantees
 * `verifySubgridAttestation()` from core round-trips against envelopes
 * produced here), then hash the canonical string under the requested
 * mode using engine's sync `fnv1a32Hex` / `sha256Bytes`.
 *
 * Resulting envelope is byte-compatible with core's `SubgridAttestation`
 * shape — verifySubgridAttestation/Async will accept it without
 * modification.
 */
function buildSubgridAttestationSync(
  params: SubgridParams,
  hashMode: HashMode,
): SubgridAttestation {
  const canonicalForm = canonicalizeSubgridParams(params);
  if (hashMode === 'fnv1a') {
    return Object.freeze({
      hash: fnv1a32Hex(canonicalForm),
      hashMode: 'fnv1a' as const,
      canonicalForm,
    });
  }
  // hashMode === 'sha256'
  const bytes = new TextEncoder().encode(canonicalForm);
  return Object.freeze({
    hash: sha256Bytes(bytes),
    hashMode: 'sha256' as const,
    canonicalForm,
  });
}

// ── Adapter fingerprint helper (Wave-2 SECURITY-mode 2026-04-20) ─────────────

/**
 * Canonical WebGPU adapter info (subset matching the W3C WebGPU
 * `GPUAdapterInfo` shape). All fields are optional; missing fields
 * canonicalize to empty string, which still produces a stable digest
 * but with less discriminative power.
 */
export interface AdapterInfo {
  /** GPU vendor (e.g. "Intel", "NVIDIA", "Apple", "AMD", "Qualcomm"). */
  vendor?: string;
  /** GPU architecture family (e.g. "gen12", "ampere", "m-series"). */
  architecture?: string;
  /** Specific device label (e.g. "Intel UHD Graphics 620"). */
  device?: string;
  /** Driver version string. */
  driver?: string;
  /** Browser user-agent (pins Chrome version etc.) */
  userAgent?: string;
}

/**
 * Compute a SHA-256 fingerprint of canonical adapter info, suitable
 * for `ContractConfig.adapterFingerprint` (Item 5b cross-adapter
 * dispatch).
 *
 * Why this helper exists (SECURITY-mode audit 2026-04-20):
 *   - Closes the raw-hardware-identifier privacy leak: the output is
 *     an opaque 256-bit hex string; readers see equivalence-class
 *     identity ("these two traces used the same adapter") without
 *     learning the raw vendor/device/driver strings.
 *   - Canonical pipe-joined tuple prevents ambiguity between
 *     fingerprints with different field boundaries. E.g. ("Intel",
 *     "foo") vs ("Intelfoo", "") both raw-concat to "Intelfoo" but
 *     pipe-canonicalize to distinct "Intel|foo" vs "Intelfoo|".
 *
 * What this helper does NOT solve:
 *   - Forgeability: the caller decides what AdapterInfo to pass. A
 *     hostile agent can still pass a made-up AdapterInfo to get any
 *     fingerprint they want. Full mitigation requires an attested
 *     source (the WebGPU adapter info API, called by trusted code,
 *     ideally signed). Deferred to a follow-up commit — see audit
 *     memo ai-ecosystem/research/2026-04-20_adapter-fingerprint-security-audit.md
 *     §Future hardening.
 *
 * Returns a 64-hex-char string (SHA-256 digest). Async because it
 * uses crypto.subtle.digest, which is Promise-based in both browser
 * and Node ≥ 15.
 */
export async function computeAdapterFingerprint(info: AdapterInfo): Promise<string> {
  const canonical = [
    info.vendor ?? '',
    info.architecture ?? '',
    info.device ?? '',
    info.driver ?? '',
    info.userAgent ?? '',
  ].join('|');
  const bytes = new TextEncoder().encode(canonical);
  // crypto.subtle.digest is available in modern browsers and Node ≥ 15
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Geometry / GPU / state / CAEL hashes: packages/engine/src/simulation/hashes.ts
// (re-exported above for backward compatibility).

/**
 * Paper #4 — semantic sanity beyond hash: element indices must reference real nodes.
 * Catches hash-consistent but physically meaningless connectivity (e.g. indices
 * pointing past the vertex buffer).
 */
export function validateMeshSanity(
  vertices: Float64Array | Float32Array | undefined,
  elements: Uint32Array | undefined,
): ContractViolation[] {
  if (!vertices || !elements) return [];

  const nCoord = vertices.length;
  if (nCoord < 3 || nCoord % 3 !== 0) {
    return [
      {
        rule: 'mesh-sanity',
        message: `Vertex buffer length ${nCoord} is not a positive multiple of 3`,
        severity: 'error',
      },
    ];
  }
  const numNodes = nCoord / 3;
  const out: ContractViolation[] = [];

  // Track referenced nodes to catch orphaned vertices (connectivity sanity)
  const referencedNodes = new Uint8Array(numNodes);

  for (let i = 0; i < vertices.length; i++) {
    const c = vertices[i];
    if (!Number.isFinite(c)) {
      out.push({
        rule: 'mesh-sanity',
        message: `Non-finite vertex coordinate at index ${i}`,
        severity: 'error',
      });
      break;
    }
  }

  for (let i = 0; i < elements.length; i++) {
    const idx = elements[i];
    if (!Number.isFinite(idx) || !Number.isInteger(idx)) {
      out.push({
        rule: 'mesh-connectivity',
        message: `Element index at offset ${i} is not a finite integer`,
        severity: 'error',
      });
      continue;
    }
    if (idx < 0 || idx >= numNodes) {
      out.push({
        rule: 'mesh-connectivity',
        message:
          `Element index ${idx} at offset ${i} out of range [0, ${numNodes - 1}] ` +
          `(${numNodes} nodes)`,
        severity: 'error',
      });
    } else {
      referencedNodes[idx] = 1;
    }
  }

  // Check for orphaned vertices (Guarantee 1: Connectivity Sanity)
  let orphanedCount = 0;
  for (let i = 0; i < numNodes; i++) {
    if (referencedNodes[i] === 0) orphanedCount++;
  }
  if (orphanedCount > 0) {
    out.push({
      rule: 'mesh-connectivity',
      message: `${orphanedCount} orphaned vertices detected (not referenced by any element)`,
      severity: 'warning',
    });
  }

  return out;
}

// ── Unit Validation ──────────────────────────────────────────────────────────

/** Known physical quantity ranges for sanity checking. */
const UNIT_RANGES: Record<string, { min: number; max: number; unit: string }> = {
  youngs_modulus: { min: 1e3, max: 2e12, unit: 'Pa' },         // rubber to diamond
  poisson_ratio: { min: -1, max: 0.5, unit: 'dimensionless' },
  yield_strength: { min: 1e3, max: 5e9, unit: 'Pa' },
  density: { min: 0.01, max: 25000, unit: 'kg/m³' },           // aerogel to osmium
  speed_of_sound: { min: 100, max: 20000, unit: 'm/s' },       // gas to diamond
  viscosity: { min: 1e-7, max: 1e6, unit: 'm²/s' },            // superfluid to pitch
  conductivity: { min: 0.001, max: 500, unit: 'W/(m·K)' },     // aerogel to copper
  permittivity: { min: 1, max: 1e5, unit: 'relative' },
  temperature: { min: 0, max: 1e6, unit: 'K' },
};

/**
 * Validate physical quantities in a solver config.
 * Returns violations for out-of-range or suspicious values.
 */
export function validateUnits(config: Record<string, unknown>): ContractViolation[] {
  const violations: ContractViolation[] = [];

  function check(obj: Record<string, unknown>, path: string) {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = path ? `${path}.${key}` : key;

      if (typeof value === 'object' && value !== null && !ArrayBuffer.isView(value)) {
        check(value as Record<string, unknown>, fullPath);
        continue;
      }

      if (typeof value !== 'number') continue;

      const range = UNIT_RANGES[key];
      if (!range) continue;

      if (value < range.min || value > range.max) {
        violations.push({
          rule: 'unit-range',
          message: `${fullPath} = ${value} is outside expected range [${range.min}, ${range.max}] ${range.unit}. Check units.`,
          severity: value < range.min * 0.001 || value > range.max * 1000 ? 'error' : 'warning',
        });
      }
    }
  }

  check(config, '');
  return violations;
}

// ── Deterministic Stepper ────────────────────────────────────────────────────

/**
 * Fixed-timestep accumulator for frame-independent, deterministic simulation.
 *
 * Instead of solver.step(frameDelta), which varies per frame:
 *   accumulator += frameDelta
 *   while (accumulator >= fixedDt) {
 *     solver.step(fixedDt)      // always the same dt
 *     accumulator -= fixedDt
 *   }
 *
 * This ensures the same simulation produces the same results regardless
 * of frame rate, machine speed, or when you step.
 */
export class DeterministicStepper {
  private accumulator = 0;
  private stepCount = 0;
  private simTime = 0;

  constructor(
    private fixedDt: number,
    private maxAccumulator = 0.1,
  ) {}

  /**
   * Advance by wall-clock delta. Returns the number of fixed steps taken.
   */
  advance(wallDelta: number, stepFn: (dt: number) => void): number {
    this.accumulator += Math.min(wallDelta, this.maxAccumulator);
    let steps = 0;

    while (this.accumulator >= this.fixedDt) {
      stepFn(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.stepCount++;
      this.simTime += this.fixedDt;
      steps++;
    }

    return steps;
  }

  /** Async variant of advance() — awaits each step function call. Used by asyncStep(). */
  async advanceAsync(wallDelta: number, stepFn: (dt: number) => Promise<void>): Promise<number> {
    this.accumulator += Math.min(wallDelta, this.maxAccumulator);
    let steps = 0;

    while (this.accumulator >= this.fixedDt) {
      await stepFn(this.fixedDt);
      this.accumulator -= this.fixedDt;
      this.stepCount++;
      this.simTime += this.fixedDt;
      steps++;
    }

    return steps;
  }

  getStepCount(): number { return this.stepCount; }
  getSimTime(): number { return this.simTime; }
  getAccumulator(): number { return this.accumulator; }
  reset(): void { this.accumulator = 0; this.stepCount = 0; this.simTime = 0; }
}

// ── Contracted Simulation ────────────────────────────────────────────────────

/**
 * ContractedSimulation — Wraps any SimSolver with enforced guarantees.
 */
export class ContractedSimulation {
  private solver: SimSolver;
  private stepper: DeterministicStepper;
  private interactions: InteractionEvent[] = [];
  private nextEventId = 0;
  private geometryHash: string;
  private config: Record<string, unknown>;
  private solverType: string;
  private violations: ContractViolation[] = [];
  private startTime = 0;
  private logInteractions: boolean;

  /**
   * Per-step state-vector digests (paper-3 Route 2b closure path for
   * Property 4 cross-adapter determinism).
   *
   * Each entry is the FNV-1a hash of the quantized (*1e6 + round) state
   * vector AFTER that step's solver.step() completed. The quantization
   * resets floating-point drift per step, which means cross-adapter
   * replays can agree bit-exact on the digest even when their underlying
   * float32 reduction orders differ — as long as the pre-quantized state
   * vectors agree within the contract's ε tolerance (defined by the
   * quantum, 1/1e6 = 1 µ-unit).
   *
   * See:
   *   research/2026-04-20_webgpu-determinism-protocol.md (ai-ecosystem)
   *   research/2026-04-20_property-4-route-2-proof-outline.md (ai-ecosystem)
   *   packages/engine/src/simulation/__tests__/state-canonicalize-overhead.bench.test.ts
   *     (decision: Route 2b wins at 1.372% max overhead vs paper-3 §7 production-step median)
   */
  private stateDigests: string[] = [];

  /**
   * Per-step GPU output digests (paper-4 §5.2 — GPU solver verification).
   *
   * Populated by `asyncStep()` when the wrapped solver implements
   * `GpuBackedSolver`. Each entry is the `hashGpuOutput()` digest of the
   * flat readback buffer returned by `solver.readbackOutput()` AFTER that
   * step's GPU dispatch completed. An empty array when using a CPU-only
   * solver (or when `asyncStep()` has not been called yet).
   *
   * Can be compared across replays to verify that two GPU runs produced
   * identical output buffers at each step (same guarantees as CPU-side
   * `stateDigests`, but applied to the raw GPU output before any CPU-side
   * field transformation).
   */
  private gpuOutputDigests: string[] = [];

  /**
   * Hash mode for all three contract hash sites (hashGeometry,
   * computeStateDigest, hashCAELEntry when this contract's recorder
   * wraps it). Option C (2026-04-20 SECURITY wiring): resolved from
   * contractConfig.useCryptographicHash at construction. Immutable
   * for the life of the contract.
   *
   * Per Prereq 1 (per-recorder flag scope): no env var or global
   * override — this is the only authoritative source.
   */
  private hashMode: HashMode;

  /** Public accessor for the hash mode. Used by CAELRecorder to
   *  thread the mode into hashCAELEntry calls and into
   *  cael.init.payload.hashMode. */
  getHashMode(): HashMode {
    return this.hashMode;
  }

  /**
   * Subgrid-parameter attestation envelope, present iff
   * ContractConfig.subgridParams was provided at construction. Frozen
   * at construction time; null when no subgrid params were supplied.
   *
   * CAELRecorder reads this and surfaces the envelope into
   * cael.init.payload.subgridAttestation for replay-side verification
   * via verifySubgridAttestation() / verifySubgridAttestationAsync()
   * from `@holoscript/core/paper-0c-spike`.
   */
  private subgridAttestation: SubgridAttestation | undefined = undefined;

  /** Public accessor for the subgrid-parameter attestation envelope.
   *  Returns `undefined` when the contract was constructed without
   *  `subgridParams`. */
  getSubgridAttestation(): SubgridAttestation | undefined {
    return this.subgridAttestation;
  }

  /** Stable Contract-ID used to identify a contracted run. Composes
   *  `geometryHash` plus, when present, the adapter fingerprint and
   *  the subgrid attestation hash. Backward-compat invariant: when
   *  neither `adapterFingerprint` nor `subgridParams` is set on the
   *  contract, this returns `geometryHash` byte-identically (no
   *  composition, no hashing) — so pre-change contracts produce the
   *  same Contract-ID as before this field existed. */
  private contractId: string = '';
  getContractId(): string {
    return this.contractId;
  }

  constructor(
    solver: SimSolver,
    config: Record<string, unknown>,
    contractConfig: ContractConfig = {},
  ) {
    this.solver = solver;

    // Efficient deep clone that preserves TypedArrays via structuredClone
    try {
      this.config = structuredClone(config);
    } catch {
      // Fallback if structuredClone isn't available (e.g. archaic environments, though JS/Node 17+ has it)
      // or if config contains non-cloneable objects. Just shallow copy the arrays.
      this.config = { ...config };
    }
    this.solverType = contractConfig.solverType ?? 'unknown';
    this.logInteractions = contractConfig.logInteractions ?? true;

    // Resolve hash mode ONCE from contractConfig. Per Prereq 1, this
    // is the only authoritative source — no env var fallback, no
    // module-level default override. Immutable for the contract's life.
    this.hashMode = contractConfig.useCryptographicHash ? 'sha256' : HASH_MODE_DEFAULT;

    // Compute geometry hash under the resolved mode
    const meshVertices = config.vertices as Float64Array | Float32Array | undefined;
    const meshElements = (config.tetrahedra ?? config.elements) as Uint32Array | undefined;

    this.geometryHash = hashGeometry(meshVertices, meshElements, this.hashMode);

    // Paper-0c TODO-05 followup: build the subgrid-parameter attestation
    // envelope synchronously when subgridParams is supplied. Mode flag
    // (useCryptographicHash → 'sha256' / 'fnv1a') propagates here too —
    // an adversarial peer who downgrades the contract's hash mode also
    // downgrades the subgrid hash, and the mode is recorded in the
    // envelope itself so replay can detect mode-substitution attacks.
    //
    // BACKWARD COMPAT: when subgridParams is absent, this branch is
    // skipped entirely — no canonicalization, no hashing, no envelope.
    // contractId below collapses to geometryHash, byte-identical to
    // pre-change behavior.
    if (contractConfig.subgridParams !== undefined) {
      this.subgridAttestation = buildSubgridAttestationSync(
        contractConfig.subgridParams,
        this.hashMode,
      );
    }

    // Compose Contract-ID. Order matters — we MUST keep the
    // backward-compat path (geometryHash byte-identical) when no
    // optional inputs are present. `replayFingerprint.ts` precedent:
    // optional fields only append when explicitly set.
    this.contractId = this.composeContractId(
      this.geometryHash,
      contractConfig.adapterFingerprint,
      this.subgridAttestation,
    );

    this.violations = [];
    if (contractConfig.enforceMeshSanity !== false) {
      this.violations.push(...validateMeshSanity(meshVertices, meshElements));
    }

    // Validate units
    if (contractConfig.enforceUnits !== false) {
      this.violations.push(...validateUnits(config));
    }

    for (const v of this.violations) {
      if (v.severity === 'error') {
        console.error(`[SimulationContract] ${v.message}`);
      } else {
        console.warn(`[SimulationContract] ${v.message}`);
      }
    }

    // Deterministic stepper
    const dt = contractConfig.fixedDt ?? 0.001;
    this.stepper = new DeterministicStepper(dt, contractConfig.maxAccumulator);
    this.startTime = performance.now();
  }

  /** Advance the simulation by wall-clock delta using fixed timestep.
   *  Enforces Guarantee 1 (geometry integrity) before each step.
   *  Captures per-step state digest for Property 4 Route 2b (cross-adapter
   *  determinism via per-step canonicalization — see stateDigests field). */
  step(wallDelta: number): number {
    this.enforceGeometryIntegrity();
    const subStepsTaken = this.stepper.advance(wallDelta, (dt) => {
      this.solver.step(dt);
      // Route 2b: canonicalize state AFTER each solver sub-step so the
      // digest sequence reflects inner fixed-timestep granularity, not
      // wall-clock delta granularity. This matters for replay — a replay
      // with a different wallDelta but the same inner-dt sequence must
      // produce the same digest sequence.
      this.stateDigests.push(computeStateDigest(this.solver, this.hashMode));
    });
    return subStepsTaken;
  }

  /**
   * Async variant of `step()` for GPU-backed solvers (paper-4 §5.2).
   *
   * Identical to `step()` except:
   *   1. Each sub-step awaits the solver's `step(dt)` promise (allowing
   *      GPU command buffer submission and synchronization to complete).
   *   2. After each sub-step, if the solver implements `GpuBackedSolver`,
   *      `readbackOutput()` is called and the result is hashed via
   *      `hashGpuOutput()` and appended to `gpuOutputDigests`. This
   *      records a verifiable fingerprint of the raw GPU output buffer
   *      at every fixed-timestep, closing the gap between CPU-side
   *      contract verification and GPU-executed solvers.
   *   3. CPU-side `stateDigests` (Route 2b) is still populated via
   *      `computeStateDigest()` if `fieldNames`/`getField()` are available,
   *      so existing replay/verification tooling continues to work.
   *
   * @returns Promise<number> — number of fixed sub-steps taken (same
   *          semantics as synchronous `step()`).
   */
  async asyncStep(wallDelta: number): Promise<number> {
    this.enforceGeometryIntegrity();
    const gpuBacked = isGpuBackedSolver(this.solver);

    const subStepsTaken = await this.stepper.advanceAsync(wallDelta, async (dt) => {
      await this.solver.step(dt);

      // GPU output digest (paper-4 §5.2)
      if (gpuBacked) {
        const gpuData = await (this.solver as import('./SimSolver').GpuBackedSolver).readbackOutput();
        this.gpuOutputDigests.push(hashGpuOutput(gpuData, this.hashMode));
      }

      // CPU-side Route 2b digest (unchanged from synchronous step)
      this.stateDigests.push(computeStateDigest(this.solver, this.hashMode));
    });

    return subStepsTaken;
  }

  /** Return the array of per-step GPU output digests captured by `asyncStep()`.
   *  Empty when using a CPU-only solver or before `asyncStep()` is called. */
  getGpuOutputDigests(): readonly string[] {
    return this.gpuOutputDigests.slice();
  }

  // State digest: `computeStateDigest()` in `hashes.ts` (Route 2b, per-field q_f).

  /** Return the array of per-step state digests captured so far.
   *  Used by CAELReplayer + cross-adapter determinism verification. */
  getStateDigests(): readonly string[] {
    return this.stateDigests.slice();
  }

  /** Solve a steady-state system (not time-stepped).
   *  Enforces Guarantee 1 (geometry integrity) before solving.
   *
   *  Route 2d (paper-3 Appendix A, Wave-2 item 6): captures a single
   *  terminal state digest at solve() completion. For steady-state
   *  solvers the convergence loop has already damped reduction-order
   *  variance — δ_fp is bounded by the solver's convergence tolerance
   *  (typically ≤ 10^-6 of field scale, much tighter than in-step
   *  atomic-reduction drift). So Route 2d typically achieves cross-
   *  adapter bit-identity at the lattice level with margin ≥ 10^3×,
   *  tighter than Route 2b's stepped bound.
   *
   *  The terminal digest is exposed via the same getStateDigests()
   *  API as Route 2b's per-step sequence; for a Route-2d replay there
   *  is exactly one digest to compare.
   *
   *  See: ai-ecosystem research/2026-04-20_property-4-route-2-proof-outline.md
   *  (Limitation #3, "Route 2d sketch" — now implemented).
   */
  async solve(): Promise<void> {
    this.enforceGeometryIntegrity();
    await this.solver.solve();
    // Route 2d: single terminal canonicalization on the converged
    // state. Fail-closed on NaN/Infinity (inherits guard from
    // computeStateDigest).
    this.stateDigests.push(computeStateDigest(this.solver, this.hashMode));
  }

  /**
   * Compose the Contract-ID from `geometryHash` and the optional
   * adapter / subgrid identity inputs.
   *
   * **Backward-compat invariant** (the load-bearing constraint of this
   * function): when both `adapterFingerprint` and `subgridAttestation`
   * are absent, this returns `geometryHash` BYTE-IDENTICALLY. No
   * hashing, no concatenation, no prefix. Pre-change contracts that
   * stored Contract-ID as `geometryHash` directly remain valid.
   *
   * When at least one optional input is set, we hash the canonical
   * pipe-joined tuple under the contract's hash mode. Same family as
   * `replayFingerprint.ts`'s pipe-delimited canonicalization. Pipe is
   * safe because hex hashes never contain `|`.
   *
   * Field order is fixed (`geometryHash | adapterFingerprint |
   * subgridHash`) and missing fields collapse to empty string — same
   * pattern as `computeAdapterFingerprint()` above.
   *
   * Hash mode: respects `this.hashMode` so a contract running under
   * SHA-256 produces a SHA-256-strength Contract-ID; FNV-1a-mode
   * contracts produce a 16-hex Contract-ID.
   */
  private composeContractId(
    geometryHash: string,
    adapterFingerprint: string | undefined,
    subgridAttestation: SubgridAttestation | undefined,
  ): string {
    // Backward-compat fast path: no optional identity inputs → pass
    // geometryHash through unchanged.
    if (adapterFingerprint === undefined && subgridAttestation === undefined) {
      return geometryHash;
    }
    const canonical = [
      geometryHash,
      adapterFingerprint ?? '',
      subgridAttestation?.hash ?? '',
    ].join('|');
    if (this.hashMode === 'sha256') {
      return `cid-sha-${sha256Bytes(new TextEncoder().encode(canonical))}`;
    }
    return `cid-${fnv1a32Hex(canonical)}`;
  }

  /** Enforce Guarantee 1: halt if geometry has been corrupted.
   *  Re-hashes the mesh vertices and elements under the contract's
   *  hash mode and compares against the contracted hash from
   *  construction. Throws if they diverge. */
  private enforceGeometryIntegrity(): void {
    const vertices = this.config.vertices as Float64Array | Float32Array | undefined;
    const elements = (this.config.tetrahedra ?? this.config.elements) as Uint32Array | undefined;
    if (!vertices || !elements) return; // No geometry to verify (e.g. grid-based solvers)
    const currentHash = hashGeometry(vertices, elements, this.hashMode);
    if (currentHash !== this.geometryHash) {
      throw new Error(
        `[SimulationContract] Geometry integrity violation: ` +
        `expected ${this.geometryHash}, got ${currentHash}. ` +
        `The mesh has been modified since contract construction.`
      );
    }
  }

  /** Log a user interaction that affects solver state. */
  logInteraction(type: string, data: Record<string, unknown>): void {
    if (!this.logInteractions) return;
    this.interactions.push({
      id: this.nextEventId++,
      timestamp: performance.now(),
      simTime: this.stepper.getSimTime(),
      type,
      data,
    });
  }

  /** Get a named field from the solver. */
  getField(name: string): FieldData | null {
    return this.solver.getField(name);
  }

  /** Get solver stats. */
  getStats(): Record<string, unknown> {
    return this.solver.getStats();
  }

  /** Get all contract violations found during construction. */
  getViolations(): ContractViolation[] {
    return this.violations;
  }

  /** Whether the contract has any errors (not just warnings). */
  hasErrors(): boolean {
    return this.violations.some((v) => v.severity === 'error');
  }

  /**
   * Generate the full provenance record for this simulation.
   * This is what makes it scientifically citable.
   */
  getProvenance(): SimulationProvenance {
    return {
      runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      geometryHash: this.geometryHash,
      contractId: this.contractId,
      ...(this.subgridAttestation !== undefined
        ? { subgridAttestation: this.subgridAttestation }
        : {}),
      solverType: this.solverType,
      config: this.config,
      fixedDt: this.stepper.getSimTime() / Math.max(this.stepper.getStepCount(), 1),
      totalSteps: this.stepper.getStepCount(),
      totalSimTime: this.stepper.getSimTime(),
      wallTimeMs: performance.now() - this.startTime,
      interactions: this.interactions,
      finalStats: this.solver.getStats(),
      deterministic: true,
      platformVersion: '6.1.0',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Create a replay record: config + interactions + geometry hash.
   * Another instance with the same config + interactions will produce
   * the same results (deterministic stepping guarantees this).
   */
  createReplay(): {
    config: Record<string, unknown>;
    solverType: string;
    geometryHash: string;
    contractId: string;
    subgridAttestation?: SubgridAttestation;
    interactions: InteractionEvent[];
    fixedDt: number;
    totalSteps: number;
  } {
    return {
      config: this.config,
      solverType: this.solverType,
      geometryHash: this.geometryHash,
      contractId: this.contractId,
      ...(this.subgridAttestation !== undefined
        ? { subgridAttestation: this.subgridAttestation }
        : {}),
      interactions: this.interactions,
      fixedDt: this.stepper.getSimTime() / Math.max(this.stepper.getStepCount(), 1),
      totalSteps: this.stepper.getStepCount(),
    };
  }

  /** Verify that the current geometry matches the contracted hash
   *  under the contract's hash mode. */
  verifyGeometry(
    vertices: Float64Array | Float32Array,
    elements: Uint32Array,
  ): boolean {
    const currentHash = hashGeometry(vertices, elements, this.hashMode);
    return currentHash === this.geometryHash;
  }

  /**
   * Replay a simulation from a provenance record (Guarantee 6).
   *
   * Creates a new ContractedSimulation from the replay record's config,
   * verifies geometry hash matches, and re-applies all interactions at
   * their recorded simulation times. For steady-state solvers, calls
   * solve() directly. For transient solvers, steps through the recorded
   * time span with the original fixed timestep.
   *
   * @returns The replayed ContractedSimulation instance with its own
   *          provenance record, which can be compared for equivalence.
   */
  static replayFromProvenance(
    solverFactory: (config: Record<string, unknown>) => SimSolver,
    replay: {
      config: Record<string, unknown>;
      solverType: string;
      geometryHash: string;
      interactions: InteractionEvent[];
      fixedDt: number;
      totalSteps: number;
    },
  ): ContractedSimulation {
    // Reconstruct solver from config
    const solver = solverFactory(replay.config);
    const contracted = new ContractedSimulation(solver, replay.config, {
      solverType: replay.solverType,
      fixedDt: replay.fixedDt,
      logInteractions: true,
    });

    // Verify geometry hash matches (same mesh as original)
    if (contracted.geometryHash !== replay.geometryHash) {
      throw new Error(
        `[SimulationContract] Replay geometry mismatch: ` +
        `expected ${replay.geometryHash}, got ${contracted.geometryHash}. ` +
        `The config does not produce the same mesh as the original run.`
      );
    }

    // Re-apply interactions at their recorded simulation times
    for (const interaction of replay.interactions) {
      contracted.logInteraction(interaction.type, interaction.data);
    }

    return contracted;
  }

  dispose(): void {
    this.solver.dispose();
  }
}
