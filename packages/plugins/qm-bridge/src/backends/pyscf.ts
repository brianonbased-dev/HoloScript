/**
 * PySCF backend — DFT, post-HF, and PBC (periodic) calculations.
 *
 * PySCF is the canonical open-source quantum chemistry package for Python.
 * This backend provides Stage 2 capabilities:
 *   - Molecular DFT/post-HF (overlaps with Psi4, but PySCF-native)
 *   - PBC (periodic boundary conditions) DFT for crystals and materials
 *   - Band structure via PySCF PBC + k-point sampling
 *   - Phonon via finite displacement of PBC forces
 *   - Density of states via PySCF PBC eigenvalue interpolation
 *   - Hamiltonian export via PySCF -> OpenFermion -> QubitOperator
 *
 * Architecture mirrors the IBM Quantum bridge: TypeScript config -> JSON ->
 * Python subprocess (quantum_materials_execute.py) -> JSON result.
 * Receipt provenance (cael-quantum-v1 schema) is preserved for every real
 * computation. NISQ ceiling framing: these are verifiable-receipt
 * demonstrations, not chemical-accuracy claims.
 *
 * Source: task_1779368357034_l6qj (qm-bridge Stage 2)
 * Reference: https://pyscf.org/  https://openfermion.readthedocs.io/
 */

import type {
  QmSolver,
  QmBackend,
  QmSolverConfig,
  QmMethod,
  MoleculeSpec,
  CrystalSpec,
  QmEnergyResult,
  QmGeometryResult,
  QmVibrationalResult,
  QmBandStructureResult,
  QmTransitionStateResult,
  QmPhononResult,
  QmDensityOfStatesResult,
  QmPyscfHamiltonianResult,
} from '../QmSolver';
import { requireCapability } from '../QmSolver';
import type { FieldData } from '@holoscript/engine/simulation/SimSolver';
import type { SimulationScale } from '@holoscript/engine/simulation/SimulationContract';

// ── PySCF-specific configuration ─────────────────────────────────────────────────

export interface PySCFConfig extends QmSolverConfig {
  backend: 'pyscf';
  /**
   * Path to the quantum_materials_execute.py script.
   * Default: resolved relative to this file via import.meta.url.
   */
  scriptPath?: string;
  /** Python executable. Default: 'python3' (or QISKIT_PYTHON on Windows). */
  pythonPath?: string;
  /** Number of k-points for PBC calculations. Default: [4, 4, 4]. */
  kMesh?: [number, number, number];
  /** Pseudopotential for PBC calculations. Default: 'gth-pade'. */
  pseudo?: string;
  /** Kinetic energy cutoff in Ry for PBC. Default: 100. */
  ecutwfc?: number;
  /** Whether to use k-point sampling for band structure. Default: true. */
  useKpoints?: boolean;
  /** Number of displacement steps for phonon (finite displacement). Default: 2. */
  phononDisplacements?: number;
}

// ── Raw Python bridge response types ──────────────────────────────────────────────

/** Approximate atomic numbers for element symbols (for mock mode). */
const ATOMIC_NUMBERS: Record<string, number> = {
  H: 1, He: 2, Li: 3, Be: 4, B: 5, C: 6, N: 7, O: 8, F: 9, Ne: 10,
  Na: 11, Mg: 12, Al: 13, Si: 14, P: 15, S: 16, Cl: 17, Ar: 18,
  K: 19, Ca: 20, Sc: 21, Ti: 22, V: 23, Cr: 24, Mn: 25, Fe: 26,
  Co: 27, Ni: 28, Cu: 29, Zn: 30, Ga: 31, Ge: 32, As: 33, Se: 34,
  Br: 35, Kr: 36, Rb: 37, Sr: 38, Pd: 46, Ag: 47, Cd: 48, I: 53,
  Pt: 78, Au: 79, Hg: 80, Pb: 82, Bi: 83,
};

/** sto-3g orbital -> qubit count (Jordan-Wigner), for mock Hamiltonian export. */
const ORBITAL_MAP: Record<string, number> = {
  H: 1, He: 1, Li: 5, Be: 5, B: 5, C: 5, N: 5, O: 5,
  F: 5, Ne: 5, Na: 9, Mg: 9, Al: 9, Si: 9, P: 9, S: 9,
  Cl: 9, Ar: 9,
};

interface RawPySCFResult {
  total_energy?: number;
  electronic_energy?: number;
  nuclear_repulsion_energy?: number;
  scf_iterations?: number;
  converged?: boolean;
  dipole_moment?: [number, number, number];
  optimization_steps?: number;
  final_gradient_norm?: number;
  frequencies?: number[];
  zero_point_energy?: number;
  band_energies?: number[][];
  fermi_energy?: number;
  band_gap?: number;
  is_metallic?: boolean;
  kpoint_labels?: Array<{ label: string; index: number }>;
  phonon_frequencies?: number[];
  phonon_eigenvectors?: number[][][];
  free_energy_correction?: number;
  num_displacements?: number;
  dos_energies?: number[];
  dos_total?: number[];
  dos_projected?: Record<string, number[]>;
  dos_num_points?: number;
  hamiltonian_num_qubits?: number;
  hamiltonian_num_terms?: number;
  hamiltonian_operator?: string;
  computed_locally?: boolean;
  error?: string;
  receipt?: Record<string, unknown>;
  receipt_path?: string;
  wall_time_seconds?: number;
}

// ── PySCF Backend Implementation ──────────────────────────────────────────────────

/**
 * PySCFBackend — wraps PySCF for molecular + periodic QM calculations.
 *
 * Implements the QmSolver interface so PySCF calculations participate in the
 * same SimulationContract / CAEL recording / Brittney dispatch pipeline
 * as classical solvers. Scale is always 'quantum'.
 *
 * Stage 2 addition: materials-science Hamiltonians via PySCF PBC ->
 * OpenFermion QubitOperator -> same VQE + receipt pipeline as IBM Quantum.
 * Different Hamiltonian (crystal field vs molecular), same provenance.
 */
export class PySCFBackend implements QmSolver {
  readonly mode = 'steady-state' as const;
  readonly fieldNames: readonly string[] = ['total_energy', 'fermi_energy', 'band_gap'];
  readonly scale: SimulationScale = 'quantum';
  readonly backend: QmBackend = 'pyscf';
  readonly qmConfig: QmSolverConfig;
  readonly config: PySCFConfig;

  private lastEnergy: number | null = null;
  private lastFermi: number | null = null;
  private lastBandGap: number | null = null;

  constructor(config: PySCFConfig) {
    this.config = config;
    this.qmConfig = config;
  }

  // ── SimSolver lifecycle ────────────────────────────────────────────────

  step(_dt: number): void {
    // QM solvers are steady-state
  }

  solve(): void | Promise<void> {
    // Handled by capability methods
  }

  getField(name: string): FieldData | null {
    if (name === 'total_energy' && this.lastEnergy !== null) {
      return new Float64Array([this.lastEnergy]);
    }
    if (name === 'fermi_energy' && this.lastFermi !== null) {
      return new Float64Array([this.lastFermi]);
    }
    if (name === 'band_gap' && this.lastBandGap !== null) {
      return new Float64Array([this.lastBandGap]);
    }
    return null;
  }

  getStats(): Record<string, unknown> {
    return {
      backend: this.backend,
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
      kMesh: this.config.kMesh ?? [4, 4, 4],
      pseudo: this.config.pseudo ?? 'gth-pade',
      ecutwfc: this.config.ecutwfc ?? 100,
      lastEnergy: this.lastEnergy,
      lastFermi: this.lastFermi,
      lastBandGap: this.lastBandGap,
    };
  }

  dispose(): void {
    this.lastEnergy = null;
    this.lastFermi = null;
    this.lastBandGap = null;
  }

  // ── Molecular capability implementations ────────────────────────────────

  async computeEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult> {
    requireCapability('pyscf', 'molecular');
    const startTime = performance.now();
    const raw = await this._runPythonBridge({
      task: 'energy',
      molecule: {
        atoms: molecule.atoms.map((a) => ({
          symbol: a.symbol, x: a.x, y: a.y, z: a.z,
        })),
        charge: molecule.charge ?? 0,
        multiplicity: molecule.multiplicity ?? 1,
        units: molecule.units ?? 'angstrom',
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] Energy calculation failed: ${raw.error}`);
    }

    const result: QmEnergyResult = {
      totalEnergy: raw.total_energy ?? 0,
      electronicEnergy: raw.electronic_energy ?? 0,
      nuclearRepulsionEnergy: raw.nuclear_repulsion_energy ?? 0,
      scfIterations: raw.scf_iterations ?? 0,
      converged: raw.converged ?? false,
      dipoleMoment: raw.dipole_moment,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };

    this.lastEnergy = result.totalEnergy;
    return result;
  }

  async optimizeGeometry(molecule: MoleculeSpec): Promise<QmGeometryResult> {
    requireCapability('pyscf', 'molecular');
    const startTime = performance.now();
    const raw = await this._runPythonBridge({
      task: 'optimize',
      molecule: {
        atoms: molecule.atoms.map((a) => ({
          symbol: a.symbol, x: a.x, y: a.y, z: a.z,
        })),
        charge: molecule.charge ?? 0,
        multiplicity: molecule.multiplicity ?? 1,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] Geometry optimization failed: ${raw.error}`);
    }

    return {
      molecule, // Placeholder: real PySCF returns optimized geometry
      totalEnergy: raw.total_energy ?? 0,
      converged: raw.converged ?? false,
      optimizationSteps: raw.optimization_steps ?? 0,
      finalGradientNorm: raw.final_gradient_norm ?? 0,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  async computeVibrations(molecule: MoleculeSpec): Promise<QmVibrationalResult> {
    requireCapability('pyscf', 'molecular');
    const startTime = performance.now();
    const raw = await this._runPythonBridge({
      task: 'frequency',
      molecule: {
        atoms: molecule.atoms.map((a) => ({
          symbol: a.symbol, x: a.x, y: a.y, z: a.z,
        })),
        charge: molecule.charge ?? 0,
        multiplicity: molecule.multiplicity ?? 1,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] Vibrational calculation failed: ${raw.error}`);
    }

    return {
      frequencies: raw.frequencies ?? [],
      intensities: [],
      reducedMasses: [],
      zeroPointEnergy: raw.zero_point_energy ?? 0,
      thermochemistry: {
        enthalpy: 0,
        gibbsFreeEnergy: 0,
        entropy: 0,
      },
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  async computeChargeDensity(): Promise<never> {
    throw new Error('[pyscf] Charge density not yet implemented (stage 3).');
  }

  async computeBandStructure(crystal: CrystalSpec): Promise<QmBandStructureResult> {
    requireCapability('pyscf', 'periodic');
    const startTime = performance.now();
    const raw = await this._runPythonBridge({
      task: 'band_structure',
      crystal: {
        atoms: crystal.atoms.map((a) => ({
          symbol: a.symbol, fx: a.fx, fy: a.fy, fz: a.fz,
        })),
        lattice_vectors: crystal.latticeVectors.map((v) => [v[0], v[1], v[2]]),
        space_group: crystal.spaceGroup,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
      k_mesh: this.config.kMesh ?? [4, 4, 4],
      pseudo: this.config.pseudo ?? 'gth-pade',
      ecutwfc: this.config.ecutwfc ?? 100,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] Band structure calculation failed: ${raw.error}`);
    }

    const result: QmBandStructureResult = {
      bandEnergies: raw.band_energies ?? [],
      fermiEnergy: raw.fermi_energy ?? 0,
      bandGap: raw.band_gap ?? 0,
      isMetallic: (raw.band_gap ?? 1) <= 0.01,
      kpointLabels: raw.kpoint_labels,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };

    this.lastFermi = result.fermiEnergy;
    this.lastBandGap = result.bandGap;
    return result;
  }

  async computeDipoleMoment(molecule: MoleculeSpec): Promise<[number, number, number]> {
    const energyResult = await this.computeEnergy(molecule);
    return energyResult.dipoleMoment ?? [0, 0, 0];
  }

  async computeDftMaterials(crystal: CrystalSpec): Promise<{
    energy: QmEnergyResult;
    bandStructure: QmBandStructureResult;
  }> {
    requireCapability('pyscf', 'periodic');
    const startTime = performance.now();
    const raw = await this._runPythonBridge({
      task: 'dft_materials',
      crystal: {
        atoms: crystal.atoms.map((a) => ({
          symbol: a.symbol, fx: a.fx, fy: a.fy, fz: a.fz,
        })),
        lattice_vectors: crystal.latticeVectors.map((v) => [v[0], v[1], v[2]]),
        space_group: crystal.spaceGroup,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
      k_mesh: this.config.kMesh ?? [4, 4, 4],
      pseudo: this.config.pseudo ?? 'gth-pade',
      ecutwfc: this.config.ecutwfc ?? 100,
    });
    const wallTimeEnergy = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] DFT materials calculation failed: ${raw.error}`);
    }

    const energyResult: QmEnergyResult = {
      totalEnergy: raw.total_energy ?? 0,
      electronicEnergy: raw.electronic_energy ?? 0,
      nuclearRepulsionEnergy: raw.nuclear_repulsion_energy ?? 0,
      scfIterations: raw.scf_iterations ?? 0,
      converged: raw.converged ?? false,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTimeEnergy,
    };

    const bandResult: QmBandStructureResult = {
      bandEnergies: raw.band_energies ?? [],
      fermiEnergy: raw.fermi_energy ?? 0,
      bandGap: raw.band_gap ?? 0,
      isMetallic: (raw.band_gap ?? 1) <= 0.01,
      kpointLabels: raw.kpoint_labels,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTimeEnergy,
    };

    this.lastEnergy = energyResult.totalEnergy;
    this.lastFermi = bandResult.fermiEnergy;
    this.lastBandGap = bandResult.bandGap;

    return { energy: energyResult, bandStructure: bandResult };
  }

  async computeNmrSpectrum(): Promise<never> {
    throw new Error('[pyscf] NMR GIAO is not a primary target for PySCF backend. Use psi4 backend.');
  }

  async computeSemiEmpiricalEnergy(): Promise<never> {
    throw new Error('[pyscf] PySCF does not support semi-empirical methods. Use tblite backend.');
  }

  async computeTransitionState(
    reactant: MoleculeSpec,
    product: MoleculeSpec,
    numImages = 7,
  ): Promise<QmTransitionStateResult> {
    requireCapability('pyscf', 'transitionStates');
    const startTime = performance.now();

    // Approximate TS as midpoint geometry (real implementation uses PySCF NEB)
    const midpointAtoms = reactant.atoms.map((a, i) => {
      const productAtom = product.atoms[i];
      if (!productAtom) {
        throw new Error('[pyscf] Reactant/product atom counts must match for transition state search.');
      }
      return {
        symbol: a.symbol,
        x: (a.x + productAtom.x) / 2,
        y: (a.y + productAtom.y) / 2,
        z: (a.z + productAtom.z) / 2,
      };
    });
    const midpoint: MoleculeSpec = { ...reactant, atoms: midpointAtoms };
    const energyResult = await this.computeEnergy(midpoint);
    const wallTime = (performance.now() - startTime) / 1000;

    return {
      molecule: midpoint,
      forwardBarrier: 0,
      reverseBarrier: 0,
      transitionStateEnergy: energyResult.totalEnergy,
      converged: false,
      numImages,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  async computeQmMm(): Promise<never> {
    throw new Error('[pyscf] QM/MM is not yet implemented (stage 3).');
  }

  // ── PySCF PBC-specific capabilities (Stage 2) ───────────────────────────

  /**
   * Compute phonon frequencies via finite displacement of PBC forces.
   *
   * PySCF PBC computes forces at equilibrium and at displaced geometries,
   * then constructs the dynamical matrix via finite differences. The
   * resulting frequencies and eigenvectors describe vibrational modes
   * of the crystal lattice.
   *
   * NISQ ceiling applies: these are verifiable-receipt demonstrations,
   * not chemical-accuracy claims.
   */
  async computePhonons(crystal: CrystalSpec): Promise<QmPhononResult> {
    requireCapability('pyscf', 'periodic');
    const startTime = performance.now();
    const numDisplacements = this.config.phononDisplacements ?? 2;

    const raw = await this._runPythonBridge({
      task: 'phonon',
      crystal: {
        atoms: crystal.atoms.map((a) => ({
          symbol: a.symbol, fx: a.fx, fy: a.fy, fz: a.fz,
        })),
        lattice_vectors: crystal.latticeVectors.map((v) => [v[0], v[1], v[2]]),
        space_group: crystal.spaceGroup,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
      k_mesh: this.config.kMesh ?? [4, 4, 4],
      pseudo: this.config.pseudo ?? 'gth-pade',
      ecutwfc: this.config.ecutwfc ?? 100,
      num_displacements: numDisplacements,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] Phonon calculation failed: ${raw.error}`);
    }

    return {
      frequencies: raw.phonon_frequencies ?? [],
      eigenvectors: raw.phonon_eigenvectors,
      zeroPointEnergy: raw.zero_point_energy ?? 0,
      freeEnergyCorrection: raw.free_energy_correction,
      converged: raw.converged ?? false,
      numDisplacements: raw.num_displacements ?? numDisplacements,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  /**
   * Compute density of states for a periodic system.
   *
   * Samples the Brillouin zone on a dense k-point mesh and interpolates
   * eigenvalues to produce total DOS and optionally projected DOS per
   * atom type.
   */
  async computeDensityOfStates(crystal: CrystalSpec): Promise<QmDensityOfStatesResult> {
    requireCapability('pyscf', 'periodic');
    const startTime = performance.now();

    const raw = await this._runPythonBridge({
      task: 'dos',
      crystal: {
        atoms: crystal.atoms.map((a) => ({
          symbol: a.symbol, fx: a.fx, fy: a.fy, fz: a.fz,
        })),
        lattice_vectors: crystal.latticeVectors.map((v) => [v[0], v[1], v[2]]),
        space_group: crystal.spaceGroup,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
      k_mesh: this.config.kMesh ?? [4, 4, 4],
      pseudo: this.config.pseudo ?? 'gth-pade',
      ecutwfc: this.config.ecutwfc ?? 100,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] DOS calculation failed: ${raw.error}`);
    }

    return {
      energies: raw.dos_energies ?? [],
      totalDos: raw.dos_total ?? [],
      projectedDos: raw.dos_projected,
      fermiEnergy: raw.fermi_energy ?? 0,
      energyRange: [
        Math.min(...(raw.dos_energies ?? [0])),
        Math.max(...(raw.dos_energies ?? [0])),
      ],
      numPoints: raw.dos_num_points ?? (raw.dos_energies?.length ?? 0),
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  /**
   * Export a PBC Hamiltonian via PySCF -> OpenFermion QubitOperator.
   *
   * This is the Stage 2 bridge between materials-science DFT and quantum
   * circuit verification. PySCF PBC computes the mean-field Hamiltonian;
   * OpenFermion maps it to a QubitOperator (Jordan-Wigner). The result
   * can be fed into the VQE pipeline (ibm-quantum backend) for
   * verifiable-receipt demonstration.
   *
   * NISQ ceiling: PBC Hamiltonians grow exponentially with unit cell size.
   * Practical limit is ~2-3 atom cells with sto-3g (10-20 qubits).
   */
  async computePyscfHamiltonian(crystal: CrystalSpec): Promise<QmPyscfHamiltonianResult> {
    requireCapability('pyscf', 'periodic');
    const startTime = performance.now();

    const raw = await this._runPythonBridge({
      task: 'hamiltonian',
      crystal: {
        atoms: crystal.atoms.map((a) => ({
          symbol: a.symbol, fx: a.fx, fy: a.fy, fz: a.fz,
        })),
        lattice_vectors: crystal.latticeVectors.map((v) => [v[0], v[1], v[2]]),
        space_group: crystal.spaceGroup,
      },
      method: this.qmConfig.method,
      basis: this.qmConfig.basis,
      k_mesh: this.config.kMesh ?? [4, 4, 4],
      pseudo: this.config.pseudo ?? 'gth-pade',
      ecutwfc: this.config.ecutwfc ?? 100,
      export_hamiltonian: true,
    });
    const wallTime = raw.wall_time_seconds ?? (performance.now() - startTime) / 1000;

    if (raw.error) {
      throw new Error(`[pyscf] Hamiltonian export failed: ${raw.error}`);
    }

    return {
      numQubits: raw.hamiltonian_num_qubits ?? 0,
      numTerms: raw.hamiltonian_num_terms ?? 0,
      numKpoints: this.config.kMesh ? this.config.kMesh[0] * this.config.kMesh[1] * this.config.kMesh[2] : 64,
      scfConverged: raw.converged ?? false,
      totalEnergy: raw.total_energy ?? 0,
      hamiltonianOperator: raw.hamiltonian_operator,
      computedLocally: raw.computed_locally ?? true,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  // ── Python subprocess bridge ────────────────────────────────────────────

  /**
   * Invoke the quantum_materials_execute.py bridge with a JSON payload.
   *
   * Same architecture as ibm-quantum.ts: serialise config + crystal/molecule
   * to JSON, invoke Python, parse JSON result. PySCF/OpenFermion live
   * entirely on the Python side.
   *
   * When scriptPath or pythonPath is '__mock__', returns deterministic mock
   * values for testing without a PySCF installation.
   */
  private async _runPythonBridge(
    input: Record<string, unknown>,
  ): Promise<RawPySCFResult> {
    // Mock mode: return deterministic values without Python
    const scriptPath = this.config.scriptPath ?? '';
    const pythonExe =
      this.config.pythonPath ??
      process.env.PYTHON_PYSCF ??
      (process.platform === 'win32' ? 'C:\\Python314\\python.exe' : 'python3');

    if (scriptPath === '__mock__' || pythonExe === '__mock__') {
      return this._mockResult(input);
    }

    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);

    const resolvedScript =
      scriptPath ||
      new URL('../../../../../scripts/quantum_materials_execute.py', import.meta.url).pathname;

    const { stdout, stderr } = await execFileAsync(
      pythonExe,
      [resolvedScript, JSON.stringify(input)],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    // Filter PySCF/OpenFermion deprecation warnings from stderr
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
        throw new Error(`[pyscf] Python bridge error: ${fatal.join('\n')}`);
      }
    }

    const result = JSON.parse(stdout) as RawPySCFResult;

    // Store receipt provenance if present
    if (result.receipt) {
      this._lastReceipt = result.receipt;
      if (result.receipt_path) {
        this._lastReceiptPath = result.receipt_path;
      }
    }

    return result;
  }

  /**
   * Return deterministic mock results for testing without PySCF installed.
   *
   * Matches the mock shapes from quantum_materials_execute.py fallbacks.
   */
  private _mockResult(input: Record<string, unknown>): RawPySCFResult {
    const task = input['task'] as string ?? 'energy';
    const molecule = input['molecule'] as { atoms: Array<{ symbol: string }> } | undefined;
    const crystal = input['crystal'] as { atoms: Array<{ symbol: string }> } | undefined;
    const atoms = molecule?.atoms ?? crystal?.atoms ?? [];
    const nAtoms = atoms.length || 3;

    // Molecular energy mock
    if (task === 'energy' || task === 'optimize' || task === 'frequency') {
      const heavy = atoms.filter((a) => a.symbol !== 'H').length;
      const hydrogen = nAtoms - heavy;
      const mockEnergy = -(heavy * 40.0 + hydrogen * 0.5) + 0.0001;
      return {
        total_energy: mockEnergy,
        electronic_energy: mockEnergy + 9.0,
        nuclear_repulsion_energy: 9.0,
        scf_iterations: 8,
        converged: true,
        dipole_moment: [0.0, 0.0, 0.0],
        wall_time_seconds: 0.01,
        computed_locally: false,
      };
    }

    // PBC / band structure mock (SrTiO3-like values)
    if (task === 'band_structure' || task === 'dft_materials') {
      return {
        total_energy: -340.5 + 0.0001,
        electronic_energy: -349.5,
        nuclear_repulsion_energy: 9.0,
        scf_iterations: 12,
        converged: true,
        band_energies: [[-5.0, -3.0, -1.0, 1.5, 3.0, 5.0]],
        fermi_energy: 2.1,
        band_gap: 1.9,
        is_metallic: false,
        wall_time_seconds: 0.05,
        computed_locally: false,
      };
    }

    // Phonon mock
    if (task === 'phonon') {
      const nModes = nAtoms * 3;
      const avgMass = atoms.length > 0
        ? atoms.reduce((sum, a) => sum + (ATOMIC_NUMBERS[a.symbol] ?? 12), 0) / nAtoms
        : 12;
      const debyeFreq = 300.0 / Math.sqrt(avgMass);
      const frequencies = Array.from({ length: nModes }, (_, i) => debyeFreq * (i + 1) / nModes);
      const zpe = frequencies.reduce((s, f) => s + f, 0) * 0.5 * 2.998e-10;
      return {
        phonon_frequencies: frequencies,
        zero_point_energy: zpe,
        free_energy_correction: zpe * 0.9,
        converged: true,
        num_displacements: nAtoms * 3 * 2,
        wall_time_seconds: 0.02,
        computed_locally: false,
      };
    }

    // DOS mock — Gaussian-broadened two-peak DOS (SrTiO3-like)
    if (task === 'dos') {
      const nPoints = 200;
      const energies: number[] = [];
      const dos: number[] = [];
      for (let i = 0; i < nPoints; i++) {
        const e = -7.0 + i * 14.0 / nPoints;
        energies.push(parseFloat(e.toFixed(4)));
        // Two-peak structure (valence + conduction band)
        const vb = Math.exp(-0.5 * ((e + 2.0) / 1.0) ** 2);
        const cb = Math.exp(-0.5 * ((e - 5.0) / 1.5) ** 2);
        dos.push(parseFloat((0.3 * vb + 0.15 * cb).toFixed(6)));
      }
      return {
        dos_energies: energies,
        dos_total: dos,
        fermi_energy: 2.1,
        dos_num_points: nPoints,
        wall_time_seconds: 0.01,
        computed_locally: false,
      };
    }

    // Hamiltonian export mock
    if (task === 'hamiltonian') {
      const numQubits = atoms.reduce(
        (sum, a) => sum + (ORBITAL_MAP[a.symbol] ?? 9) * 2, 0,
      ) || 10;
      return {
        total_energy: -340.5,
        converged: true,
        scf_iterations: 12,
        hamiltonian_num_qubits: numQubits,
        hamiltonian_num_terms: numQubits * (numQubits + 1) / 2 + numQubits,
        hamiltonian_operator: null,
        computed_locally: false,
        wall_time_seconds: 0.01,
      };
    }

    // Default mock
    return {
      total_energy: -76.0,
      electronic_energy: -85.0,
      nuclear_repulsion_energy: 9.0,
      scf_iterations: 8,
      converged: true,
      wall_time_seconds: 0.01,
      computed_locally: false,
    };
  }

  /** Most recent receipt from a real computation (for provenance tracking). */
  private _lastReceipt: Record<string, unknown> | null = null;
  private _lastReceiptPath: string | null = null;

  /**
   * Get the most recent computation receipt (cael-quantum-v1 schema).
   * Returns null if no real computation has been performed yet.
   */
  getLastReceipt(): { receipt: Record<string, unknown> | null; path: string | null } {
    return { receipt: this._lastReceipt, path: this._lastReceiptPath };
  }
}