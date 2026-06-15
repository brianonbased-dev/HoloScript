/**
 * Quantinuum backend — logical-qubit (error-corrected) VQE via a Python subprocess bridge.
 *
 * This is the qm-bridge leg of the post-Microsoft/Quantinuum QEC leverage plan
 * (ai-ecosystem research/2026-06-15_microsoft-quantinuum-quantum-error-correction.md).
 * Where the IBM backend runs bare NISQ circuits, this one runs VQE on *encoded*
 * (logical) qubits and reports the QEC bookkeeping — logical-vs-physical error and the
 * post-selection acceptance fraction — straight into the `cael-quantum-v1.qec` receipt
 * schema. That makes an error-corrected result provenance-honest by construction: it
 * cannot quote an N-fold logical improvement without disclosing how many shots it kept.
 *
 * Architecture: TypeScript → Python subprocess (quantinuum_execute.py) → pytket/qnexus.
 * No npm packages are imported here; the quantum SDK lives entirely Python-side.
 *
 * Execution modes:
 *   - 'sim'        — local classical SURROGATE of logical-qubit behaviour (default).
 *                    No credentials, no spend; verifies the whole pipeline + receipt.
 *   - 'quantinuum' — real Quantinuum H-series hardware via qnexus (FOUNDER-GATED SPEND,
 *                    D.080 / F.072 — never run without explicit authorization).
 *
 * Claim boundary: 'sim' mode is a classical model of how logical error suppresses with
 * code distance; it is NOT hardware and NOT a full stabiliser simulation. Hardware-grade
 * claims require executionMode 'quantinuum' on real H-series qubits.
 *
 * Source: research/2026-06-15_microsoft-quantinuum-quantum-error-correction.md (Tier 1)
 * Reference: https://docs.quantinuum.com/nexus/
 */

import type {
  QmSolver,
  QmBackend,
  QmSolverConfig,
  MoleculeSpec,
  QmEnergyResult,
  QmGeometryResult,
  VQEResult,
  QuantinuumQECResult,
} from '../QmSolver';
import { requireCapability } from '../QmSolver';
import type { FieldData } from '@holoscript/engine/simulation/SimSolver';
import type { SimulationScale } from '@holoscript/engine/simulation/SimulationContract';

// ── Quantinuum-specific configuration ─────────────────────────────────────────

/**
 * Configuration for the Quantinuum logical-qubit backend.
 *
 * Most fields default sensibly so callers need only supply `backend: 'quantinuum'`.
 * The default executionMode is 'sim' so nothing here ever costs money or needs a
 * token unless the caller explicitly opts into hardware.
 */
export interface QuantinuumConfig extends QmSolverConfig {
  backend: 'quantinuum';
  /**
   * Quantinuum Nexus API token. Falls back to QUANTINUUM_API_KEY.
   * Not required when executionMode is 'sim'.
   */
  apiToken?: string;
  /**
   * Execution mode.
   *   'sim'        — local classical surrogate (default; no token, no spend).
   *   'quantinuum' — real H-series hardware (FOUNDER-GATED paid compute).
   */
  executionMode?: 'sim' | 'quantinuum';
  /**
   * Quantinuum device name (e.g. 'H2-1', 'H1-1E' emulator). Ignored in 'sim' mode.
   * Default: provider-selected.
   */
  device?: string;
  /**
   * QEC code family for the logical encoding.
   *   'none'      — unencoded (physical qubits; distance 1).
   *   'steane'    — [[7,1,3]] colour code (the dependency-free reference encoding).
   *   'carbon'    — Quantinuum's carbon code (hardware logical qubits).
   *   'tesseract' — the tesseract colour code.
   * Default: 'steane'.
   */
  codeFamily?: 'none' | 'steane' | 'carbon' | 'tesseract';
  /** Code distance d. Default: 3. */
  codeDistance?: number;
  /** Number of QEC rounds (>1 = mid-circuit correction). Default: 1. */
  rounds?: number;
  /**
   * Per-qubit physical error rate of the (emulated) device. Drives the 'sim'
   * surrogate's logical-error model. Default: 1e-3 (H-series ballpark).
   */
  physicalErrorRate?: number;
  /** VQE ansatz repetition layers. Default: 1. */
  ansatzLayers?: number;
  /** SPSA optimizer iterations. Default: 100. */
  maxOptimizerIterations?: number;
  /** Path to quantinuum_execute.py. Default: resolved relative to this file. */
  scriptPath?: string;
}

// ── Raw Python bridge response ────────────────────────────────────────────────

interface RawQuantinuumVQEResponse {
  ground_state_energy?: number;
  converged?: boolean;
  optimizer_iterations?: number;
  final_cost?: number;
  num_qubits?: number;
  logical_qubits?: number;
  physical_qubits?: number;
  code_family?: string;
  code_distance?: number;
  rounds?: number;
  physical_error_rate?: number;
  logical_error_rate?: number;
  post_selection_used?: boolean;
  acceptance_fraction?: number;
  circuit_depth?: number;
  execution_backend?: string;
  job_id?: string;
  wall_time_seconds?: number;
  error?: string;
}

// ── cael-quantum-v1.qec receipt shape (emitted by toQecReceipt) ───────────────

/** A `cael-quantum-v1.qec` receipt, the cross-vendor honest-reporting record. */
export interface QecReceipt {
  schema: 'cael-quantum-v1.qec';
  kind: 'qec_logical_vqe_receipt';
  created_at: string;
  tier: 'hardware' | 'simulate';
  claim_boundary: string;
  code: {
    family: string;
    name: string;
    distance: number;
    logical_qubits: number;
    physical_qubits: number;
  };
  noise_model: string;
  decoder: string;
  rounds: number;
  measurement: {
    physical_error_rate: number;
    logical_error_rate: number;
    suppression_factor_physical_over_logical: number | null;
    ground_state_energy: number;
    converged: boolean;
  };
  post_selection: {
    used: boolean;
    acceptance_fraction: number;
    note: string;
  };
  payload_hash: string;
  receipt_id: string;
}

// ── Quantinuum Backend Implementation ─────────────────────────────────────────

/**
 * QuantinuumBackend — logical-qubit VQE via the quantinuum_execute.py bridge.
 *
 * Implements QmSolver so logical-qubit jobs participate in the same
 * SimulationContract / CAEL recording pipeline as every other QM backend.
 * Scale is always 'quantum'. All classical-QM methods throw and direct callers
 * to Psi4 / TBLite.
 */
export class QuantinuumBackend implements QmSolver {
  readonly mode = 'steady-state' as const;
  readonly fieldNames: readonly string[] = ['total_energy'];
  readonly scale: SimulationScale = 'quantum';
  readonly backend: QmBackend = 'quantinuum';
  readonly qmConfig: QmSolverConfig;

  /** Typed alias to the Quantinuum-specific config. */
  readonly config: QuantinuumConfig;

  private lastEnergy: number | null = null;
  private lastResult: QuantinuumQECResult | null = null;

  constructor(config: QuantinuumConfig) {
    this.config = config;
    this.qmConfig = config;
  }

  // ── SimSolver lifecycle ──────────────────────────────────────────────────

  step(_dt: number): void {}
  solve(): void | Promise<void> {}

  getField(name: string): FieldData {
    if (name === 'total_energy') {
      if (this.lastEnergy === null) {
        throw new Error(
          '[quantinuum] No energy computed yet. Call computeEnergy or runLogicalVQE first.'
        );
      }
      return new Float64Array([this.lastEnergy]);
    }
    throw new Error(`[quantinuum] Unknown field '${name}'. Available fields: total_energy`);
  }

  getStats(): Record<string, unknown> {
    return {
      backend: this.backend,
      executionMode: this.config.executionMode ?? 'sim',
      codeFamily: this.config.codeFamily ?? 'steane',
      codeDistance: this.config.codeDistance ?? 3,
      lastEnergy: this.lastEnergy,
      lastConverged: this.lastResult?.converged ?? null,
      lastLogicalErrorRate: this.lastResult?.logicalErrorRate ?? null,
      lastAcceptanceFraction: this.lastResult?.postSelection.acceptanceFraction ?? null,
    };
  }

  dispose(): void {
    this.lastEnergy = null;
    this.lastResult = null;
  }

  reset(): void {
    this.dispose();
  }

  // ── Implemented capabilities ────────────────────────────────────────────

  /**
   * Compute ground-state energy via logical-qubit VQE.
   *
   * Drop-in compatible with the QmEnergyResult shape so a logical run can stand
   * in for Psi4 in energy-only workflows. Nuclear repulsion is estimated
   * classically from the geometry (same approach as the IBM backend).
   */
  async computeEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult> {
    requireCapability('quantinuum', 'molecular');
    const vqe = await this.runLogicalVQE(molecule);
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

  /** Geometry optimisation is not supported — use Psi4, then validate energy here. */
  async optimizeGeometry(_molecule: MoleculeSpec): Promise<QmGeometryResult> {
    throw new Error(
      '[quantinuum] Quantinuum backend does not support geometry optimization. ' +
        'Use Psi4 for optimization, then quantinuum for logical-qubit energy validation.'
    );
  }

  /**
   * Run VQE on logical (error-corrected) qubits and return the full QEC bookkeeping.
   *
   * Builds a JSON payload describing the molecule + encoding, invokes
   * quantinuum_execute.py, and maps the response onto QuantinuumQECResult — which
   * carries logical-vs-physical error AND the post-selection acceptance fraction.
   */
  async runLogicalVQE(molecule: MoleculeSpec): Promise<QuantinuumQECResult> {
    requireCapability('quantinuum', 'molecular');
    const startTime = performance.now();

    const executionMode = this.config.executionMode ?? 'sim';
    const input: Record<string, unknown> = {
      task: 'logical_vqe',
      molecule: {
        atoms: molecule.atoms.map((a) => ({ symbol: a.symbol, x: a.x, y: a.y, z: a.z })),
        charge: molecule.charge ?? 0,
        multiplicity: molecule.multiplicity ?? 1,
        units: molecule.units ?? 'angstrom',
      },
      method: this.qmConfig.basis ?? 'sto-3g',
      ansatz_layers: this.config.ansatzLayers ?? 1,
      max_iterations: this.config.maxOptimizerIterations ?? 100,
      execution_mode: executionMode,
      device: this.config.device ?? null,
      code_family: this.config.codeFamily ?? 'steane',
      code_distance: this.config.codeDistance ?? 3,
      rounds: this.config.rounds ?? 1,
      physical_error_rate: this.config.physicalErrorRate ?? 1e-3,
    };

    const raw = (await this._runPythonBridge(input)) as RawQuantinuumVQEResponse;
    if (raw.error) {
      throw new Error(`[quantinuum] logical VQE failed: ${raw.error}`);
    }

    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;
    const executionBackend =
      raw.execution_backend === 'quantinuum'
        ? ('quantinuum' as const)
        : ('quantinuum-sim' as const);

    const result: QuantinuumQECResult = {
      groundStateEnergy: raw.ground_state_energy ?? 0,
      converged: raw.converged ?? false,
      optimizerIterations: raw.optimizer_iterations ?? 0,
      finalCost: raw.final_cost ?? 0,
      numQubits: raw.num_qubits ?? raw.physical_qubits ?? 0,
      circuitDepth: raw.circuit_depth ?? 0,
      executionBackend,
      jobId: raw.job_id,
      wallTimeSeconds: wallTime,
      solverConfig: this.qmConfig,
      logicalQubits: raw.logical_qubits ?? 0,
      physicalQubits: raw.physical_qubits ?? 0,
      codeFamily: raw.code_family ?? (this.config.codeFamily ?? 'steane'),
      codeDistance: raw.code_distance ?? (this.config.codeDistance ?? 3),
      rounds: raw.rounds ?? (this.config.rounds ?? 1),
      physicalErrorRate: raw.physical_error_rate ?? (this.config.physicalErrorRate ?? 1e-3),
      logicalErrorRate: raw.logical_error_rate ?? 0,
      postSelection: {
        used: raw.post_selection_used ?? false,
        acceptanceFraction: raw.acceptance_fraction ?? 1.0,
      },
    };

    this.lastResult = result;
    this.lastEnergy = result.groundStateEnergy;
    return result;
  }

  /**
   * VQERunnerTrait / QmSolver compatibility shim: returns the plain VQEResult slice
   * of the logical run, so the Quantinuum backend is usable anywhere `runVQE` is.
   */
  async runVQE(molecule: MoleculeSpec, _ansatzLayers: number = 1): Promise<VQEResult> {
    return this.runLogicalVQE(molecule);
  }

  /**
   * Map a logical-VQE result onto a `cael-quantum-v1.qec` receipt — the honest,
   * cross-vendor record. A post-selected result keeps `post_selection.used=true`
   * and a sub-1.0 acceptance fraction, so the suppression figure can never be
   * quoted without the discard rate that produced it.
   */
  async toQecReceipt(result: QuantinuumQECResult): Promise<QecReceipt> {
    const isHw = result.executionBackend === 'quantinuum';
    const suppression =
      result.logicalErrorRate > 0
        ? result.physicalErrorRate / result.logicalErrorRate
        : null;
    const base = {
      schema: 'cael-quantum-v1.qec' as const,
      kind: 'qec_logical_vqe_receipt' as const,
      created_at: new Date().toISOString(),
      tier: (isHw ? 'hardware' : 'simulate') as 'hardware' | 'simulate',
      claim_boundary: isHw
        ? 'Logical-qubit VQE on real Quantinuum H-series hardware (error-corrected).'
        : 'Local classical surrogate of logical-qubit error suppression; NOT hardware ' +
          'and NOT a full stabiliser simulation. Verifies pipeline + receipt only.',
      code: {
        family: result.codeFamily,
        name: `${result.codeFamily}-d${result.codeDistance}`,
        distance: result.codeDistance,
        logical_qubits: result.logicalQubits,
        physical_qubits: result.physicalQubits,
      },
      noise_model: isHw ? 'hardware' : 'depolarizing-surrogate',
      decoder: result.codeFamily === 'none' ? 'none' : 'lookup-table',
      rounds: result.rounds,
      measurement: {
        physical_error_rate: result.physicalErrorRate,
        logical_error_rate: result.logicalErrorRate,
        suppression_factor_physical_over_logical: suppression,
        ground_state_energy: result.groundStateEnergy,
        converged: result.converged,
      },
      post_selection: {
        used: result.postSelection.used,
        acceptance_fraction: result.postSelection.acceptanceFraction,
        note:
          'A fair logical-vs-physical suppression figure must be scaled by ' +
          'acceptance_fraction; a sub-1.0 fraction means shots were discarded.',
      },
    };
    const { createHash } = await import('node:crypto');
    const payload_hash = createHash('sha256')
      .update(
        JSON.stringify({
          schema: base.schema,
          code: base.code,
          noise_model: base.noise_model,
          decoder: base.decoder,
          rounds: base.rounds,
          measurement: base.measurement,
          post_selection: base.post_selection,
        })
      )
      .digest('hex');
    return { ...base, payload_hash, receipt_id: `qec-${payload_hash.slice(0, 16)}` };
  }

  // ── Unsupported classical QM methods ─────────────────────────────────────

  async computeVibrations(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeVibrations'));
  }
  async computeChargeDensity(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeChargeDensity'));
  }
  async computeBandStructure(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeBandStructure'));
  }
  async computeDipoleMoment(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeDipoleMoment'));
  }
  async computeDftMaterials(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeDftMaterials'));
  }
  async computeNmrSpectrum(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeNmrSpectrum'));
  }
  async computeSemiEmpiricalEnergy(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeSemiEmpiricalEnergy'));
  }
  async computeTransitionState(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeTransitionState'));
  }
  async computeQmMm(): Promise<never> {
    throw new Error(this._unsupportedMsg('computeQmMm'));
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Invoke the Python bridge with a JSON payload. The token is passed through the
   * child environment (QUANTINUUM_API_KEY), never the argv JSON, so it cannot leak
   * into process listings or logs. Mirrors the IBM backend's secret discipline.
   */
  private async _runPythonBridge(
    input: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    const scriptPath =
      this.config.scriptPath ??
      new URL('../../../../../../scripts/quantinuum_execute.py', import.meta.url).pathname;

    const pythonExe =
      process.env.QISKIT_PYTHON ??
      (process.platform === 'win32' ? 'C:\\Python314\\python.exe' : 'python3');

    const bridgeInput = { ...input };
    delete bridgeInput['api_token'];
    delete bridgeInput['apiToken'];

    const apiToken = this._resolveApiToken();
    const childEnv = apiToken
      ? { ...process.env, QUANTINUUM_API_KEY: apiToken }
      : process.env;

    const { stdout, stderr } = await execFileAsync(
      pythonExe,
      [scriptPath, JSON.stringify(bridgeInput)],
      { maxBuffer: 10 * 1024 * 1024, env: childEnv }
    );

    if (stderr) {
      const fatal = stderr
        .split('\n')
        .filter(
          (l) => l.includes('Error:') || l.includes('Traceback') || l.includes('SyntaxError')
        );
      if (fatal.length > 0) {
        throw new Error(`[quantinuum] Python bridge error: ${fatal.join('\n')}`);
      }
    }

    return JSON.parse(stdout) as Record<string, unknown>;
  }

  private _resolveApiToken(): string | null {
    if (this.config.apiToken) {
      return this.config.apiToken;
    }
    if (typeof process !== 'undefined' && process.env['QUANTINUUM_API_KEY']) {
      return process.env['QUANTINUUM_API_KEY'];
    }
    return null;
  }

  /** Estimate nuclear repulsion from pairwise Coulomb (Hartree, a.u.). */
  private _estimateNuclearRepulsion(molecule: MoleculeSpec): number {
    const ANGSTROM_TO_BOHR = 1.8897259886;
    const atomicNumbers: Record<string, number> = {
      H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
      Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18, K: 19, Ca: 20,
      Fe: 26, Co: 27, Ni: 28, Cu: 29, Zn: 30,
    };
    const atoms = molecule.atoms;
    let repulsion = 0;
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const ai = atoms[i];
        const aj = atoms[j];
        if (ai === undefined || aj === undefined) continue;
        const zi = atomicNumbers[ai.symbol] ?? 6;
        const zj = atomicNumbers[aj.symbol] ?? 6;
        const dx = (ai.x - aj.x) * ANGSTROM_TO_BOHR;
        const dy = (ai.y - aj.y) * ANGSTROM_TO_BOHR;
        const dz = (ai.z - aj.z) * ANGSTROM_TO_BOHR;
        const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (r > 0) repulsion += (zi * zj) / r;
      }
    }
    return repulsion;
  }

  private _unsupportedMsg(methodName: string): string {
    return (
      `[quantinuum] ${methodName} is not supported. ` +
      'Quantinuum backend supports logical-qubit VQE (computeEnergy / runLogicalVQE / ' +
      'runVQE) only. Use Psi4 or TBLite for classical QM methods.'
    );
  }
}
