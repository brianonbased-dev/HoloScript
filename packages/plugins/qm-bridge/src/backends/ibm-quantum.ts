/**
 * IBM Quantum backend — VQE and QAOA via Qiskit Python subprocess bridge.
 *
 * This is backend #4 of the qm-bridge plugin, implementing capability #10
 * "Quantum-circuit chemistry" (stage 2 of D.026 QM absorption roadmap).
 *
 * Architecture: TypeScript → Python subprocess (quantum_execute.py) → Qiskit.
 * Qiskit and its dependencies are entirely Python-side; the TS layer only
 * serialises inputs as JSON and deserialises JSON outputs. No external npm
 * packages are imported here.
 *
 * Supported operations:
 *   - VQE (Variational Quantum Eigensolver): ground-state energy for molecules
 *     up to ~12 atoms (sto-3g basis, 50-qubit horizon).
 *   - QAOA (Quantum Approximate Optimization Algorithm): combinatorial
 *     optimisation over Max-Cut / QUBO weight matrices.
 *
 * Execution modes:
 *   - 'aer'          — local Qiskit Aer simulator (no credentials needed).
 *   - 'ibm-quantum'  — real IBM Quantum hardware via IBM Quantum API token.
 *
 * Source: research/2026-04-28_qm-as-foundational-layer-EVOLVED.md §7.1 item 10
 * Reference: https://docs.quantum.ibm.com/
 */

import type {
  QmSolver,
  QmBackend,
  QmSolverConfig,
  MoleculeSpec,
  QmEnergyResult,
  QmGeometryResult,
  VQEResult,
  QAOAResult,
} from '../QmSolver';
import { requireCapability } from '../QmSolver';
import type { FieldData } from '@holoscript/engine/simulation/SimSolver';
import type { SimulationScale } from '@holoscript/engine/simulation/SimulationContract';

// ── IBM Quantum-specific configuration ────────────────────────────────────────

/**
 * Configuration for the IBM Quantum backend.
 *
 * Extends QmSolverConfig with quantum-circuit-specific options.
 * Most fields have sensible defaults so callers only need to supply
 * `backend: 'ibm-quantum'`, `method: 'vqe'`, and `basis: 'sto-3g'`.
 */
export interface IBMQuantumConfig extends QmSolverConfig {
  backend: 'ibm-quantum';
  /**
   * IBM Quantum API token.
   * Falls back to the IBM_QUANTUM_API_KEY environment variable.
   * Not required when executionMode is 'aer'.
   */
  apiToken?: string;
  /**
   * Execution mode.
   *   'aer'          — local Qiskit Aer simulator (default; no token needed).
   *   'ibm-quantum'  — real IBM Quantum hardware.
   */
  executionMode?: 'aer' | 'ibm-quantum';
  /**
   * IBM Quantum backend name (e.g. 'ibm_brisbane', 'ibm_torino').
   * Ignored when executionMode is 'aer'.
   * Default: least-busy backend selected by Qiskit automatically.
   */
  ibmBackend?: string;
  /**
   * VQE ansatz type.
   *   'hardware-efficient' — hardware-efficient ansatz (default).
   *   'uccsd'             — Unitary Coupled Cluster Singles and Doubles.
   *   'adapt'             — Adaptive VQE (ADAPT-VQE).
   */
  ansatz?: 'hardware-efficient' | 'uccsd' | 'adapt';
  /** Number of SPSA optimizer iterations. Default: 300. */
  maxOptimizerIterations?: number;
  /** QAOA circuit depth parameter p. Default: 1. */
  qaoa_p?: number;
  /**
   * Path to the quantum_execute.py script.
   * Default: resolved relative to this file's location via import.meta.url.
   */
  scriptPath?: string;
}

// ── Raw Python bridge response types ──────────────────────────────────────────

interface RawVQEResponse {
  ground_state_energy?: number;
  converged?: boolean;
  optimizer_iterations?: number;
  final_cost?: number;
  num_qubits?: number;
  circuit_depth?: number;
  execution_backend?: string;
  job_id?: string;
  wall_time_seconds?: number;
  error?: string;
}

interface RawQAOAResponse {
  optimal_bitstring?: string;
  optimal_value?: number;
  approximation_ratio?: number;
  circuit_depth_p?: number;
  num_qubits?: number;
  execution_backend?: string;
  job_id?: string;
  wall_time_seconds?: number;
  error?: string;
}

// ── IBM Quantum Backend Implementation ────────────────────────────────────────

/**
 * IBMQuantumBackend — runs VQE and QAOA circuits via Qiskit Python bridge.
 *
 * Implements the QmSolver interface so IBM Quantum jobs participate in the
 * same SimulationContract / CAEL recording / Brittney dispatch pipeline
 * as classical QM backends. Scale is always 'quantum'.
 *
 * All classical QM methods (vibrations, band structure, NMR, QM/MM, …) throw
 * a descriptive error directing callers to Psi4 or TBLite. Only
 * computeEnergy (wraps VQE), runVQE, and runQAOA are implemented.
 */
export class IBMQuantumBackend implements QmSolver {
  readonly mode = 'steady-state' as const;
  readonly fieldNames: readonly string[] = ['total_energy'];
  readonly scale: SimulationScale = 'quantum';
  readonly backend: QmBackend = 'ibm-quantum';
  readonly qmConfig: QmSolverConfig;

  /** Typed alias to the IBM-specific config. */
  readonly config: IBMQuantumConfig;

  /** Last VQE ground-state energy in Hartree; null before any calculation. */
  private lastEnergy: number | null = null;
  /** Last VQE result; null before any calculation. */
  private lastVQEResult: VQEResult | null = null;

  constructor(config: IBMQuantumConfig) {
    this.config = config;
    this.qmConfig = config;
  }

  // ── SimSolver lifecycle ────────────────────────────────────────────────

  /** No-op: QM solvers are steady-state, not time-stepped. */
  step(_dt: number): void { }

  /** No-op: energy is computed on-demand via capability methods. */
  solve(): void | Promise<void> { }

  /**
   * Return the last computed energy as a scalar field.
   *
   * @param name - Field name. 'total_energy' returns last VQE energy.
   * @throws If name is not 'total_energy' or no calculation has been run yet.
   */
  getField(name: string): FieldData {
    if (name === 'total_energy') {
      if (this.lastEnergy === null) {
        throw new Error('[ibm-quantum] No energy computed yet. Call computeEnergy or runVQE first.');
      }
      return new Float64Array([this.lastEnergy]);
    }
    throw new Error(`[ibm-quantum] Unknown field '${name}'. Available fields: total_energy`);
  }

  /** Return runtime statistics for diagnostics. */
  getStats(): Record<string, unknown> {
    return {
      backend: this.backend,
      executionMode: this.config.executionMode ?? 'aer',
      ansatz: this.config.ansatz ?? 'hardware-efficient',
      lastEnergy: this.lastEnergy,
      lastVQEConverged: this.lastVQEResult?.converged ?? null,
      lastVQEQubits: this.lastVQEResult?.numQubits ?? null,
    };
  }

  /** Clear cached results and reset internal state. */
  dispose(): void {
    this.lastEnergy = null;
    this.lastVQEResult = null;
  }

  /** Alias for dispose — reset cached results. */
  reset(): void {
    this.dispose();
  }

  // ── Implemented capabilities ──────────────────────────────────────────

  /**
   * Compute ground-state energy via VQE.
   *
   * Maps the VQE ground-state energy to the QmEnergyResult shape so this
   * backend is a drop-in replacement for Psi4 in energy-only workflows.
   * Nuclear repulsion energy is estimated from the molecular geometry.
   *
   * @param molecule - Molecular system to evaluate.
   * @returns QmEnergyResult with VQE-derived total energy.
   */
  async computeEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult> {
    requireCapability('ibm-quantum', 'molecular');
    const vqe = await this.runVQE(molecule);

    // Estimate nuclear repulsion from pairwise 1/r (Coulomb, atomic units)
    const nucRepulsion = this._estimateNuclearRepulsion(molecule);

    const result: QmEnergyResult = {
      totalEnergy: vqe.groundStateEnergy,
      electronicEnergy: vqe.groundStateEnergy - nucRepulsion,
      nuclearRepulsionEnergy: nucRepulsion,
      scfIterations: vqe.optimizerIterations,
      converged: vqe.converged,
      solverConfig: this.qmConfig,
      wallTimeSeconds: vqe.wallTimeSeconds,
    };

    this.lastEnergy = result.totalEnergy;
    return result;
  }

  /**
   * Geometry optimisation is not supported by the IBM Quantum backend.
   *
   * VQE evaluates energy at a fixed geometry; optimisation requires gradient
   * information that is expensive on quantum hardware. Use Psi4 for geometry
   * optimisation, then optionally validate with ibm-quantum for energy.
   *
   * @throws Always — directs caller to Psi4.
   */
  async optimizeGeometry(_molecule: MoleculeSpec): Promise<QmGeometryResult> {
    throw new Error(
      '[ibm-quantum] IBM Quantum backend does not support geometry optimization. ' +
      'Use Psi4 for optimization then ibm-quantum for energy validation.',
    );
  }

  // ── IBM-specific quantum methods ──────────────────────────────────────

  /**
   * Run VQE (Variational Quantum Eigensolver) to estimate ground-state energy.
   *
   * Builds a JSON payload describing the molecule, ansatz, and execution
   * parameters, then invokes quantum_execute.py via subprocess. Qiskit
   * handles qubit mapping (Jordan-Wigner or Bravyi-Kitaev), ansatz
   * construction, and SPSA optimisation.
   *
   * @param molecule     - Molecular system (≤12 atoms recommended for sto-3g).
   * @param ansatzLayers - Number of ansatz repetition layers. Default: 1.
   * @returns VQEResult with ground-state energy, convergence info, and qubit count.
   */
  async runVQE(molecule: MoleculeSpec, ansatzLayers: number = 1): Promise<VQEResult> {
    requireCapability('ibm-quantum', 'molecular');
    const startTime = performance.now();

    const input: Record<string, unknown> = {
      task: 'vqe',
      molecule: {
        atoms: molecule.atoms.map((a) => ({
          symbol: a.symbol,
          x: a.x,
          y: a.y,
          z: a.z,
        })),
        charge: molecule.charge ?? 0,
        multiplicity: molecule.multiplicity ?? 1,
        units: molecule.units ?? 'angstrom',
      },
      method: this.qmConfig.basis ?? 'sto-3g',
      ansatz: this.config.ansatz ?? 'hardware-efficient',
      ansatz_layers: ansatzLayers,
      max_iterations: this.config.maxOptimizerIterations ?? 300,
      execution_mode: this.config.executionMode ?? 'aer',
      ibm_backend: this.config.ibmBackend ?? null,
      api_token: this._resolveApiToken(),
    };

    const raw = await this._runPythonBridge(input) as RawVQEResponse;

    if (raw.error) {
      throw new Error(`[ibm-quantum] VQE failed: ${raw.error}`);
    }

    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    const executionBackend = (raw.execution_backend === 'ibm-quantum')
      ? 'ibm-quantum' as const
      : 'aer' as const;

    const result: VQEResult = {
      groundStateEnergy: raw.ground_state_energy ?? 0,
      converged: raw.converged ?? false,
      optimizerIterations: raw.optimizer_iterations ?? 0,
      finalCost: raw.final_cost ?? 0,
      numQubits: raw.num_qubits ?? 0,
      circuitDepth: raw.circuit_depth ?? 0,
      executionBackend,
      jobId: raw.job_id,
      wallTimeSeconds: wallTime,
      solverConfig: this.qmConfig,
    };

    this.lastVQEResult = result;
    this.lastEnergy = result.groundStateEnergy;
    return result;
  }

  /**
   * Run QAOA (Quantum Approximate Optimization Algorithm) for combinatorial
   * optimisation over a graph described by a weight matrix.
   *
   * The weight matrix W encodes edge weights: W[i][j] is the weight of the
   * edge between nodes i and j. Supports Max-Cut and QUBO formulations.
   * The Python bridge converts the matrix to a Qiskit QuadraticProgram and
   * runs QAOA with p layers of alternating problem and mixer unitaries.
   *
   * @param weightMatrix  - Symmetric adjacency/weight matrix (n×n).
   * @param circuitDepthP - Number of QAOA layers (p parameter). Default: 1.
   * @returns QAOAResult with optimal bitstring, objective value, and metadata.
   */
  async runQAOA(weightMatrix: number[][], circuitDepthP: number = 1): Promise<QAOAResult> {
    const startTime = performance.now();

    if (weightMatrix.length === 0) {
      throw new Error('[ibm-quantum] runQAOA: weightMatrix must be non-empty.');
    }

    const n = weightMatrix.length;
    for (let i = 0; i < n; i++) {
      const row = weightMatrix[i];
      if (row === undefined || row.length !== n) {
        throw new Error(
          `[ibm-quantum] runQAOA: weightMatrix must be square. ` +
          `Row ${i} has length ${row?.length ?? 'undefined'}, expected ${n}.`,
        );
      }
    }

    const input: Record<string, unknown> = {
      task: 'qaoa',
      weight_matrix: weightMatrix,
      p: circuitDepthP,
      execution_mode: this.config.executionMode ?? 'aer',
      ibm_backend: this.config.ibmBackend ?? null,
      api_token: this._resolveApiToken(),
    };

    const raw = await this._runPythonBridge(input) as RawQAOAResponse;

    if ((raw as { error?: string }).error) {
      throw new Error(`[ibm-quantum] QAOA failed: ${(raw as { error: string }).error}`);
    }

    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    const executionBackend = (raw.execution_backend === 'ibm-quantum')
      ? 'ibm-quantum' as const
      : 'aer' as const;

    return {
      optimalBitstring: raw.optimal_bitstring ?? '0'.repeat(n),
      optimalValue: raw.optimal_value ?? 0,
      approximationRatio: raw.approximation_ratio ?? 0,
      circuitDepthP: raw.circuit_depth_p ?? circuitDepthP,
      numQubits: raw.num_qubits ?? n,
      executionBackend,
      jobId: raw.job_id,
      wallTimeSeconds: wallTime,
      solverConfig: this.qmConfig,
    };
  }

  // ── Unsupported classical QM methods ─────────────────────────────────

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeVibrations(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeVibrations'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeChargeDensity(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeChargeDensity'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeBandStructure(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeBandStructure'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeDipoleMoment(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeDipoleMoment'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeDftMaterials(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeDftMaterials'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeNmrSpectrum(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeNmrSpectrum'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeSemiEmpiricalEnergy(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeSemiEmpiricalEnergy'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeTransitionState(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeTransitionState'));
  }

  /** @throws Always — IBM Quantum supports VQE/QAOA only. */
  async computeQmMm(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeQmMm'));
  }

  // ── Private helpers ────────────────────────────────────────────────────

  /**
   * Invoke the Python bridge script with a JSON-encoded input payload.
   *
   * The script (quantum_execute.py) reads the JSON argument, dispatches to
   * Qiskit, and writes a JSON result to stdout. Qiskit deprecation warnings
   * on stderr are filtered; genuine errors (Traceback / Error:) are surfaced.
   *
   * @param input - JSON-serialisable payload for the Python script.
   * @returns Parsed JSON response from the Python script.
   * @throws If the Python process exits with a fatal error.
   */
  private async _runPythonBridge(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    // Resolve script path: config override → sibling scripts/ directory
    const scriptPath =
      this.config.scriptPath ??
      new URL('../../../../../../scripts/quantum_execute.py', import.meta.url).pathname;

    // Prefer an explicit QISKIT_PYTHON env override; fall back to platform
    // defaults. On Windows, Qiskit 2.x installs under Python 3.14 at
    // C:\Python314\python.exe while the system `python3` alias may point
    // to a different (older) installation that lacks qiskit.
    const pythonExe =
      process.env.QISKIT_PYTHON ??
      (process.platform === 'win32' ? 'C:\\Python314\\python.exe' : 'python3');

    const { stdout, stderr } = await execFileAsync(
      pythonExe,
      [scriptPath, JSON.stringify(input)],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    // Qiskit emits deprecation and UserWarning messages to stderr — filter them.
    if (stderr) {
      const fatal = stderr
        .split('\n')
        .filter(
          (l) =>
            l.includes('Error:') ||
            l.includes('Traceback') ||
            l.includes('SyntaxError'),
        );
      if (fatal.length > 0) {
        throw new Error(`[ibm-quantum] Python bridge error: ${fatal.join('\n')}`);
      }
    }

    return JSON.parse(stdout) as Record<string, unknown>;
  }

  /**
   * Resolve the IBM Quantum API token from config or environment.
   *
   * @returns Token string, or null when running in 'aer' mode without a token.
   */
  private _resolveApiToken(): string | null {
    if (this.config.apiToken) {
      return this.config.apiToken;
    }
    if (typeof process !== 'undefined' && process.env['IBM_QUANTUM_API_KEY']) {
      return process.env['IBM_QUANTUM_API_KEY'];
    }
    return null;
  }

  /**
   * Estimate nuclear repulsion energy from pairwise Coulomb interactions.
   *
   * Uses atomic number approximations based on element symbol for a rough
   * classical nuclear repulsion estimate (Hartree, atomic units).
   * Coordinate input is in Angstroms; converted to Bohr (1 Å = 1.8897 Bohr).
   *
   * @param molecule - Molecular system.
   * @returns Estimated nuclear repulsion energy in Hartree.
   */
  private _estimateNuclearRepulsion(molecule: MoleculeSpec): number {
    const ANGSTROM_TO_BOHR = 1.8897259886;

    // Approximate atomic numbers for common elements
    const atomicNumbers: Record<string, number> = {
      H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
      Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18,
      K: 19, Ca: 20, Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30,
    };

    const atoms = molecule.atoms;
    let repulsion = 0;

    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const ai = atoms[i];
        const aj = atoms[j];
        if (ai === undefined || aj === undefined) continue;
        const zi = atomicNumbers[ai.symbol] ?? 6;  // default C if unknown
        const zj = atomicNumbers[aj.symbol] ?? 6;

        const dx = (ai.x - aj.x) * ANGSTROM_TO_BOHR;
        const dy = (ai.y - aj.y) * ANGSTROM_TO_BOHR;
        const dz = (ai.z - aj.z) * ANGSTROM_TO_BOHR;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (r > 0) {
          repulsion += (zi * zj) / r;
        }
      }
    }

    return repulsion;
  }

  /**
   * Build the standard error message for unsupported classical QM methods.
   *
   * @param methodName - The method name that was called.
   * @returns Descriptive error message.
   */
  private _unsupportedMsg(methodName: string): string {
    return (
      `[ibm-quantum] ${methodName} is not supported. ` +
      'IBM Quantum backend supports VQE (computeEnergy / runVQE) and ' +
      'QAOA (runQAOA) only. ' +
      'Use Psi4 or TBLite for classical QM methods.'
    );
  }
}
