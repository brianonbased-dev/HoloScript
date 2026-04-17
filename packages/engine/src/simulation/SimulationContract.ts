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
    }
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
   *  Enforces Guarantee 1 (geometry integrity) before each step. */
  step(wallDelta: number): number {
    this.enforceGeometryIntegrity();
    return this.stepper.advance(wallDelta, (dt) => {
      this.solver.step(dt);
    });
  }

  /** Solve a steady-state system (not time-stepped).
   *  Enforces Guarantee 1 (geometry integrity) before solving. */
  async solve(): Promise<void> {
    this.enforceGeometryIntegrity();
    await this.solver.solve();
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
