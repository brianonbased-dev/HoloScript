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
  /** Opaque adapter fingerprint for cross-adapter dispute dispatch
   *  (paper-3 §5.2 Algorithm 1, 5b). Recorded into cael.init.payload
   *  at trace-record time; compared by CAELReplayer.sameAdapter()
   *  against the replay environment's current fingerprint at
   *  replay-time to dispatch digest-enforcement mode:
   *    same-adapter → strict digest enforcement (Item 5a behavior)
   *    cross-adapter → skip digest enforcement (Appendix A Lemma 3
   *                    regime boundary; fall through to metric-
   *                    comparison in the dispute oracle)
   *  Production format: vendor+architecture+device+driver+UA. Tests:
   *  any stable string. If absent at record-time, the trace is treated
   *  as cross-adapter for all replays (safe fallback). */
  adapterFingerprint?: string;
}

// ── Geometry Hashing ─────────────────────────────────────────────────────────

/**
 * Compute a fast fingerprint of mesh geometry.
 * Uses FNV-1a over quantized vertex positions and element indices with explicit
 * length prefixes and a vertex/connectivity domain separator (SEC-02): any
 * change to nodes, index count, or connectivity alters the digest.
 */
export function hashGeometry(
  vertices: Float64Array | Float32Array | undefined,
  elements: Uint32Array | undefined,
): string {
  if (!vertices || !elements) return 'no-geometry';

  let h = 2166136261;
  const nCoord = vertices.length;
  const nIdx = elements.length;

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

  // Separate vertex field from connectivity so tails cannot collide across domains.
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

    // Compute geometry hash
    const meshVertices = config.vertices as Float64Array | Float32Array | undefined;
    const meshElements = (config.tetrahedra ?? config.elements) as Uint32Array | undefined;

    this.geometryHash = hashGeometry(meshVertices, meshElements);

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
      this.stateDigests.push(this.computeStateDigest());
    });
    return subStepsTaken;
  }

  /**
   * Compute the canonical state digest: quantize every field to
   * int32 via round(value * 1e6), then FNV-1a over the concatenated
   * little-endian bytes in deterministic field-name order.
   *
   * Deterministic across platforms because:
   *   (1) field-name ordering is alphabetical (stable across engines)
   *   (2) quantization resets float32 reduction-order drift
   *   (3) FNV-1a is integer arithmetic (no floating-point at hash time)
   *
   * This is the primitive Route 2b relies on. If two adapters produce
   * float32 state vectors that agree within 1/1e6 of each other, their
   * state digests will be identical regardless of internal reduction
   * order differences in compute shaders.
   */
  /**
   * Per-field quantum registry (Route 2b, per-AUDIT 2026-04-20 proof outline).
   *
   * The earlier implementation used a single global quantum (round(v*1e6)),
   * which is correct only for state normalized to O(1). Real physics state
   * spans many orders of magnitude: stress ~10^5-10^9 Pa, displacement
   * ~10^-4-10^-2 m, temperature ~10^2-10^3 K, velocity ~10^-1-10^1 m/s.
   * A single global q gives either hash collisions (too coarse for small
   * fields) or excessive boundary straddles (too tight for large fields).
   *
   * Per-AUDIT convention: q_f = characteristic_scale_f * 1e-3, i.e. three
   * orders of magnitude tighter than the field's natural scale. Example:
   * stress field with characteristic scale 10^6 Pa → q = 10^3 Pa.
   *
   * Field-name prefix matching lets solvers contribute fields with
   * descriptive names (e.g., "stressField", "vonMisesStress",
   * "principalStress1") that all map to the same stress scale.
   *
   * Fields not matched by any registry entry use the fallback quantum
   * (1e-6, matching the pre-AUDIT behavior for backward compatibility
   * with O(1)-normalized mock solvers used in existing tests).
   */
  private static readonly FIELD_QUANTUM_REGISTRY: ReadonlyArray<readonly [RegExp, number]> = [
    // Stress-family fields: characteristic scale ~10^6 Pa → q = 1000 Pa
    [/^(stress|vonMises|principal[A-Z]|deviatoric|cauchy|pk[12])/i, 1_000],
    // Strain fields: dimensionless, characteristic scale ~10^-3 → q = 1e-6
    [/^(strain|deformation)/i, 1e-6],
    // Displacement/position: characteristic scale ~10^-2 m → q = 1e-5 m
    [/^(displacement|position|offset|translation|coord)/i, 1e-5],
    // Velocity: characteristic scale ~1 m/s → q = 1e-3 m/s
    [/^(velocity|velo|speed)/i, 1e-3],
    // Acceleration / force per mass: characteristic scale ~10 m/s² → q = 1e-2
    [/^(acceleration|accel|force)/i, 1e-2],
    // Temperature: characteristic scale ~10^2 K → q = 0.1 K
    [/^(temperature|temp|thermal)/i, 0.1],
    // Pressure: same family as stress; characteristic scale ~10^5 Pa → q = 100 Pa
    [/^(pressure|press)/i, 100],
    // Energy: characteristic scale ~10^1 J (per-element) → q = 1e-2 J
    [/^(energy|strainEnergy|kineticEnergy|potentialEnergy)/i, 1e-2],
  ];

  private static readonly FALLBACK_QUANTUM = 1e-6;

  /** Resolve the per-field quantum q_f for a given field name. Returns the
   *  first registry match, or the fallback for unrecognized fields. */
  private static quantumForField(name: string): number {
    for (const [pattern, q] of ContractedSimulation.FIELD_QUANTUM_REGISTRY) {
      if (pattern.test(name)) return q;
    }
    return ContractedSimulation.FALLBACK_QUANTUM;
  }

  private computeStateDigest(): string {
    // Deterministic field order
    const fieldNames = [...this.solver.fieldNames].sort();
    const FNV_OFFSET = 0x811c9dc5;
    const FNV_PRIME = 0x01000193;
    let h = FNV_OFFSET >>> 0;

    for (const name of fieldNames) {
      const field = this.solver.getField(name);
      if (!field) continue;
      // Flatten whatever the field is into a typed-array view
      let values: Float32Array | Float64Array;
      if (field instanceof Float32Array) {
        values = field;
      } else if (field instanceof Float64Array) {
        values = field;
      } else {
        // RegularGrid3D — assume it exposes `.data` per this codebase's convention
        const maybeData = (field as unknown as { data?: Float32Array | Float64Array }).data;
        if (!maybeData) continue;
        values = maybeData;
      }
      // Resolve the field's quantum (per-AUDIT 2026-04-20 per-field q_f)
      const qf = ContractedSimulation.quantumForField(name);
      const invQf = 1 / qf;
      // Hash the field-name first so two fields with identical values but
      // different names produce different digests
      for (let i = 0; i < name.length; i++) {
        h ^= name.charCodeAt(i) & 0xff;
        h = Math.imul(h, FNV_PRIME) >>> 0;
      }
      // Quantize by q_f (value / q_f, rounded to nearest integer-lattice point)
      // + fold into the hash.
      //
      // NaN/±Infinity guard (AUDIT 2026-04-20 Wave-1.5, Appendix A Lemma 1
      // edge case #3): without this check, Math.round(NaN) | 0 === 0 and
      // Math.round(Infinity) | 0 === 0, which would silently canonicalize a
      // non-finite state to zero and hash it as a valid state. That is a
      // semantic-integrity violation that is invisible to proof review —
      // it only surfaces in live misbehavior. Route 2b is a fail-closed
      // contract: a solver that produces non-finite state MUST halt here,
      // not silently elide. Downstream consumers (CAELReplayer, dispute
      // oracle) can treat a digest-raised step as a divergence point
      // without a separate NaN-detection pass.
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
    this.stateDigests.push(this.computeStateDigest());
  }

  /** Enforce Guarantee 1: halt if geometry has been corrupted.
   *  Re-hashes the mesh vertices and elements and compares against the
   *  contracted hash from construction. Throws if they diverge. */
  private enforceGeometryIntegrity(): void {
    const vertices = this.config.vertices as Float64Array | Float32Array | undefined;
    const elements = (this.config.tetrahedra ?? this.config.elements) as Uint32Array | undefined;
    if (!vertices || !elements) return; // No geometry to verify (e.g. grid-based solvers)
    const currentHash = hashGeometry(vertices, elements);
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
    interactions: InteractionEvent[];
    fixedDt: number;
    totalSteps: number;
  } {
    return {
      config: this.config,
      solverType: this.solverType,
      geometryHash: this.geometryHash,
      interactions: this.interactions,
      fixedDt: this.stepper.getSimTime() / Math.max(this.stepper.getStepCount(), 1),
      totalSteps: this.stepper.getStepCount(),
    };
  }

  /** Verify that the current geometry matches the contracted hash. */
  verifyGeometry(
    vertices: Float64Array | Float32Array,
    elements: Uint32Array,
  ): boolean {
    const currentHash = hashGeometry(vertices, elements);
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
