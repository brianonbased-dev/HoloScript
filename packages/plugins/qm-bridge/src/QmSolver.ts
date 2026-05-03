/**
 * QmSolver — Quantum mechanics solver interface for the HoloScript ecosystem.
 *
 * Extends the engine's SimSolver with quantum-specific capabilities. Each
 * backend (Psi4, Quantum ESPRESSO, TBLite) implements this interface to
 * provide unified access to QM calculations under SimulationContract
 * scale-tag dispatch.
 *
 * Per W.QDA.001 (Query-Driven Abstraction): Brittney dispatches to the
 * appropriate QM tier based on the user's question. The scale tag
 * ('quantum') routes acceptance envelopes and CAEL recording correctly.
 *
 * Source: research/2026-04-28_qm-as-foundational-layer-EVOLVED.md §7.1
 */

import type { SimSolver, SolverMode, FieldData } from '@holoscript/engine/simulation/SimSolver';
import type { SimulationScale } from '@holoscript/engine/simulation/SimulationContract';

// ── QM Method Taxonomy ────────────────────────────────────────────────────────

/** Supported QM calculation methods. */
export type QmMethod =
  | 'hf'           // Hartree-Fock
  | 'dft'          // Density Functional Theory
  | 'mp2'          // Moller-Plesset 2nd order
  | 'ccsd'         // Coupled Cluster Singles and Doubles
  | 'ccsd(t)'      // CCSD with perturbative triples
  | 'gfN-xTB'      // GFN extended tight-binding (TBLite)
  | 'pbe'          // PBE generalized gradient approximation
  | 'b3lyp'        // B3LYP hybrid functional
  | 'hse06'        // HSE06 screened hybrid functional
  | 'pbe0';        // PBE0 hybrid functional

/** Supported basis sets. */
export type QmBasis =
  | 'sto-3g'
  | '3-21g'
  | '6-31g'
  | '6-31g*'
  | '6-31g**'
  | '6-311g**'
  | '6-311+g**'
  | 'cc-pvdz'
  | 'cc-pvtz'
  | 'cc-pvqz'
  | 'aug-cc-pvdz'
  | 'aug-cc-pvtz'
  | 'def2-svp'
  | 'def2-tzvp'
  | 'def2-qzvp'
  | 'minimal';      // For semi-empirical (TBLite)

/** QM backend identifiers. */
export type QmBackend = 'psi4' | 'quantum-espresso' | 'tblite';

/** Molecular system representation. */
export interface MoleculeSpec {
  /** Atomic symbols + 3D coordinates in Angstroms. */
  atoms: Array<{ symbol: string; x: number; y: number; z: number }>;
  /** Total charge. Default: 0. */
  charge?: number;
  /** Spin multiplicity (2S+1). Default: 1 (singlet). */
  multiplicity?: number;
  /** Units for coordinates. Default: 'angstrom'. */
  units?: 'angstrom' | 'bohr';
}

/** Crystal structure for periodic calculations (Quantum ESPRESSO). */
export interface CrystalSpec {
  /** Atomic symbols + fractional coordinates. */
  atoms: Array<{ symbol: string; fx: number; fy: number; fz: number }>;
  /** Lattice vectors in Angstroms: a, b, c vectors. */
  latticeVectors: Array<[number, number, number]>;
  /** Space group number (1-230). Default: auto-detect. */
  spaceGroup?: number;
}

/** QM solver configuration. */
export interface QmSolverConfig {
  /** Backend to use. */
  backend: QmBackend;
  /** Calculation method. */
  method: QmMethod;
  /** Basis set (ignored for semi-empirical). */
  basis: QmBasis;
  /** SCF convergence threshold in Hartree. Default: 1e-6. */
  convergenceThreshold?: number;
  /** Maximum SCF iterations. Default: 100. */
  maxScfIterations?: number;
  /** Memory limit in MB. Default: 4000. */
  memoryMb?: number;
  /** Number of compute threads. Default: auto (all available). */
  numThreads?: number;
  /** Extra backend-specific keyword arguments. */
  extraKeywords?: Record<string, unknown>;
}

/** Result from a ground-state energy calculation. */
export interface QmEnergyResult {
  /** Total energy in Hartree. */
  totalEnergy: number;
  /** Electronic energy in Hartree. */
  electronicEnergy: number;
  /** Nuclear repulsion energy in Hartree. */
  nuclearRepulsionEnergy: number;
  /** Number of SCF iterations to converge. */
  scfIterations: number;
  /** Whether the SCF converged. */
  converged: boolean;
  /** Dipole moment in Debye (x, y, z). */
  dipoleMoment?: [number, number, number];
  /** Mulliken charges per atom. */
  mullikenCharges?: number[];
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

/** Result from a geometry optimization. */
export interface QmGeometryResult {
  /** Optimized molecular geometry. */
  molecule: MoleculeSpec;
  /** Energy at the optimized geometry in Hartree. */
  totalEnergy: number;
  /** Optimizer convergence status. */
  converged: boolean;
  /** Number of optimization steps. */
  optimizationSteps: number;
  /** Final gradient norm in Hartree/Bohr. */
  finalGradientNorm: number;
  /** Vibrational frequencies in cm^-1 (if computed). */
  vibrationalFrequencies?: number[];
  /** Zero-point energy in Hartree (if frequencies computed). */
  zeroPointEnergy?: number;
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

/** Result from a vibrational frequency calculation. */
export interface QmVibrationalResult {
  /** Vibrational frequencies in cm^-1. */
  frequencies: number[];
  /** Infrared intensities in km/mol. */
  intensities: number[];
  /** Reduced masses in amu. */
  reducedMasses: number[];
  /** Zero-point energy in Hartree. */
  zeroPointEnergy: number;
  /** Thermodynamic quantities at 298.15 K. */
  thermochemistry: {
    enthalpy: number;        // Hartree
    gibbsFreeEnergy: number; // Hartree
    entropy: number;         // cal/(mol*K)
  };
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

/** Result from a charge density calculation. */
export interface QmChargeDensityResult {
  /** Electron density values on a 3D grid. */
  densityGrid: Float64Array;
  /** Grid dimensions [nx, ny, nz]. */
  gridDimensions: [number, number, number];
  /** Grid origin in Bohr. */
  gridOrigin: [number, number, number];
  /** Grid spacing in Bohr. */
  gridSpacing: [number, number, number];
  /** Total number of electrons. */
  totalElectrons: number;
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

/** Result from a band structure calculation (Quantum ESPRESSO). */
export interface QmBandStructureResult {
  /** Band energies in eV. Shape: [n_kpoints][n_bands]. */
  bandEnergies: number[][];
  /** Fermi energy in eV. */
  fermiEnergy: number;
  /** Band gap in eV (0 for metals). */
  bandGap: number;
  /** Whether the material is metallic. */
  isMetallic: boolean;
  /** K-point labels for high-symmetry points. */
  kpointLabels?: Array<{ label: string; index: number }>;
  /** Total density of states at Fermi level in states/eV. */
  dosAtFermi?: number;
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

/** Result from an NMR spectrum calculation (GIAO). */
export interface QmNmrResult {
  /** Isotropic shielding values in ppm per nucleus. */
  isotropicShieldings: number[];
  /** Anisotropic shielding tensors per nucleus (3x3 upper triangle). */
  anisotropicTensors?: number[][];
  /** Nucleus labels (e.g. '1H', '13C'). */
  nucleusLabels: string[];
  /** Reference shielding for TMS in ppm (computed or literature). */
  referenceShielding: Record<string, number>;
  /** Chemical shifts in ppm (shielding - reference). */
  chemicalShifts: number[];
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

/** Result from a NEB / transition state calculation. */
export interface QmTransitionStateResult {
  /** Transition state geometry. */
  molecule: MoleculeSpec;
  /** Forward activation energy in Hartree (from reactant). */
  forwardBarrier: number;
  /** Reverse activation energy in Hartree (from product). */
  reverseBarrier: number;
  /** Energy at the transition state in Hartree. */
  transitionStateEnergy: number;
  /** Whether the NEB converged. */
  converged: boolean;
  /** Number of NEB images used. */
  numImages: number;
  /** Solver config that produced this result. */
  solverConfig: QmSolverConfig;
  /** Wall time in seconds. */
  wallTimeSeconds: number;
}

// ── QmSolver Interface ────────────────────────────────────────────────────────

/**
 * QmSolver — unified interface for quantum mechanics calculations.
 *
 * Extends SimSolver so QM backends participate in the same
 * SimulationContract / CAEL recording / Brittney dispatch pipeline
 * as classical solvers. The `scale` is always 'quantum'.
 *
 * Implementations: Psi4Backend, QuantumEspressoBackend, TBLiteBackend.
 */
export interface QmSolver extends SimSolver {
  /** QM solvers always operate at the quantum scale. */
  readonly scale: SimulationScale;

  /** The backend this solver wraps. */
  readonly backend: QmBackend;

  /** Configuration used to construct this solver. */
  readonly qmConfig: QmSolverConfig;

  // ── The 10 user-facing capabilities (GROW §7, EVOLVED §7.1) ──────────────

  /**
   * #1: Compute ground-state energy.
   * "What's the energy of this molecule?"
   */
  computeEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult>;

  /**
   * #1 (continued): Optimize molecular geometry.
   * "What's the equilibrium geometry of this drug candidate?"
   */
  optimizeGeometry(molecule: MoleculeSpec): Promise<QmGeometryResult>;

  /**
   * #2: Compute vibrational modes.
   * "What are the vibrational frequencies?"
   */
  computeVibrations(molecule: MoleculeSpec): Promise<QmVibrationalResult>;

  /**
   * #3: Compute charge density on a grid.
   * "What does the electron density look like?"
   */
  computeChargeDensity(
    molecule: MoleculeSpec,
    gridDimensions?: [number, number, number],
  ): Promise<QmChargeDensityResult>;

  /**
   * #4: Compute electronic band structure (periodic systems).
   * "What's the bandgap of this perovskite?"
   * (Quantum ESPRESSO only; throws for molecular backends.)
   */
  computeBandStructure(crystal: CrystalSpec): Promise<QmBandStructureResult>;

  /**
   * #5: Compute dipole moments (included in energy result, but
   * available as a standalone call for convenience).
   * "What's the dipole moment?"
   */
  computeDipoleMoment(molecule: MoleculeSpec): Promise<[number, number, number]>;

  /**
   * #6: DFT for materials (alias for computeBandStructure + computeEnergy
   * on a crystal). "Run DFT for this material."
   * (Quantum ESPRESSO only.)
   */
  computeDftMaterials(crystal: CrystalSpec): Promise<{
    energy: QmEnergyResult;
    bandStructure: QmBandStructureResult;
  }>;

  /**
   * #7: NMR spectrum prediction (GIAO).
   * "What does the predicted 1H NMR look like?"
   * (Psi4 only; throws for other backends.)
   */
  computeNmrSpectrum(molecule: MoleculeSpec): Promise<QmNmrResult>;

  /**
   * #8: Semi-empirical fast screening (TBLite).
   * "Rank these 100 candidates quickly."
   * (TBLite only; throws for other backends.)
   */
  computeSemiEmpiricalEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult>;

  /**
   * #9: NEB / transition state search.
   * "What's the activation energy for this reaction?"
   */
  computeTransitionState(
    reactant: MoleculeSpec,
    product: MoleculeSpec,
    numImages?: number,
  ): Promise<QmTransitionStateResult>;

  /**
   * #10: Basic QM/MM (boundary between QM region and MM force field).
   * "Run a QM/MM calculation on this active site."
   * Stage 1: simple mechanical embedding. Stage 2: electronic embedding.
   */
  computeQmMm(
    qmRegion: MoleculeSpec,
    mmRegion: MoleculeSpec,
    mmForceField?: string,
  ): Promise<QmEnergyResult>;
}

// ── Backend capability matrix ──────────────────────────────────────────────────

/** Capabilities that a QM backend supports. */
export interface QmBackendCapabilities {
  /** Molecular calculations (energy, geometry, vibrations). */
  molecular: boolean;
  /** Periodic / crystal calculations (DFT for solids). */
  periodic: boolean;
  /** Semi-empirical tight-binding (fast screening). */
  semiEmpirical: boolean;
  /** NMR GIAO calculations. */
  nmrGiao: boolean;
  /** TD-DFT excited states (stage 2). */
  tdDft: boolean;
  /** Post-HF correlated methods (MP2, CCSD, CCSD(T)). */
  postHf: boolean;
  /** NEB / transition state search. */
  transitionStates: boolean;
  /** QM/MM boundary. */
  qmMm: boolean;
  /** Maximum recommended atom count (approximate). */
  maxAtoms: number;
}

/** Per-backend capability declarations. */
export const QM_BACKEND_CAPABILITIES: Record<QmBackend, QmBackendCapabilities> = {
  psi4: {
    molecular: true,
    periodic: false,
    semiEmpirical: false,
    nmrGiao: true,
    tdDft: true,
    postHf: true,
    transitionStates: true,
    qmMm: true,
    maxAtoms: 200,
  },
  'quantum-espresso': {
    molecular: false,
    periodic: true,
    semiEmpirical: false,
    nmrGiao: false,
    tdDft: false,
    postHf: false,
    transitionStates: false,
    qmMm: false,
    maxAtoms: 500,  // periodic systems handle more atoms
  },
  tblite: {
    molecular: true,
    periodic: false,
    semiEmpirical: true,
    nmrGiao: false,
    tdDft: false,
    postHf: false,
    transitionStates: false,
    qmMm: false,
    maxAtoms: 1000,
  },
};

/**
 * Check whether a backend supports a given capability.
 * Throws a descriptive error if unsupported (for use in QmSolver methods
 * that are backend-specific).
 */
export function requireCapability(
  backend: QmBackend,
  capability: keyof QmBackendCapabilities,
): void {
  const caps = QM_BACKEND_CAPABILITIES[backend];
  if (!caps[capability]) {
    throw new Error(
      `[qm-bridge] Backend '${backend}' does not support '${capability}'. ` +
      `Available backends: ${Object.entries(QM_BACKEND_CAPABILITIES)
        .filter(([, c]) => c[capability])
        .map(([b]) => b)
        .join(', ') || 'none'}`,
    );
  }
}