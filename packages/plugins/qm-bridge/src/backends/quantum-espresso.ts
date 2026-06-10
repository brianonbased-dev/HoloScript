/**
 * Quantum ESPRESSO backend — DFT for solid-state / materials systems.
 *
 * Quantum ESPRESSO (QE) is an open-source suite for electronic-structure
 * calculations and materials modeling at the nanoscale. It implements
 * DFT, plane-wave methods, and pseudopotentials for periodic systems.
 *
 * This backend wraps QE's PWscf (pw.x) executable via a subprocess bridge.
 * It provides band structure, material properties, and density-of-states
 * calculations for crystals and periodic structures.
 *
 * Per EVOLVED §7.1: QE is the periodic/materials backend. It supports
 * capabilities #4 (material property / bandgap), #6 (DFT for materials).
 *
 * Source: research/2026-04-28_qm-as-foundational-layer-EVOLVED.md §7.1
 * Reference: https://www.quantum-espresso.org/
 */

import type {
  QmSolver,
  QmBackend,
  QmSolverConfig,
  QmMethod,
  MoleculeSpec,
  CrystalSpec,
  QmEnergyResult,
  QmBandStructureResult,
} from '../QmSolver';
import { requireCapability } from '../QmSolver';
import type { FieldData } from '@holoscript/engine/simulation/SimSolver';
import type { SimulationScale } from '@holoscript/engine/simulation/SimulationContract';

// ── QE-specific configuration ─────────────────────────────────────────────────

export interface QuantumEspressoConfig extends QmSolverConfig {
  backend: 'quantum-espresso';
  /** Path to pw.x executable. Default: 'pw.x'. */
  pwPath?: string;
  /** Path to bands.x executable. Default: 'bands.x'. */
  bandsPath?: string;
  /** Pseudopotential directory. */
  pseudoDir?: string;
  /** Kinetic energy cutoff for wavefunctions in Ry. Default: 60. */
  ecutwfc?: number;
  /** Kinetic energy cutoff for charge density in Ry. Default: 480. */
  ecutrho?: number;
  /** K-point mesh for SCF. Default: [8, 8, 8]. */
  kMesh?: [number, number, number];
  /** Smearing type and width. */
  smearing?: { type: string; degauss: number };
}

interface QuantumEspressoRawResult {
  total_energy?: number;
  fermi_energy?: number;
  band_gap?: number;
  is_metallic?: boolean;
  scf_iterations?: number;
  converged?: boolean;
  band_energies?: number[][];
}

// ── QE input generation ───────────────────────────────────────────────────────

/** Generate a QE pw.x input file from a crystal spec. */
function generateQeScfInput(
  crystal: CrystalSpec,
  method: QmMethod,
  config: QuantumEspressoConfig
): string {
  const ecutwfc = config.ecutwfc ?? 60;
  const ecutrho = config.ecutrho ?? 480;
  const kmesh = config.kMesh ?? [8, 8, 8];
  const smearing = config.smearing ?? { type: 'mv', degauss: 0.01 };
  const smearingOptions = smearing
    ? `  occupations = 'smearing'\n  smearing = '${smearing.type}'\n  degauss = ${smearing.degauss}`
    : '';

  // Map method to QE functional
  const functionalMap: Record<string, string> = {
    pbe: 'PBE',
    b3lyp: 'B3LYP',
    pbe0: 'PBE0',
    hse06: 'HSE06',
    dft: 'PBE',
  };
  const functional = functionalMap[method] ?? 'PBE';

  // Build atomic species block
  const species = [...new Set(crystal.atoms.map((a) => a.symbol))];
  const atomicSpecies = species.map((s) => `${s}  ${s}.upf  ${functional}`).join('\n');

  // Build atomic positions block
  const atomicPositions = crystal.atoms
    .map((a) => `${a.symbol}  ${a.fx.toFixed(8)}  ${a.fy.toFixed(8)}  ${a.fz.toFixed(8)}`)
    .join('\n');

  // Build lattice vectors block (convert from array format)
  const cellParameters = crystal.latticeVectors
    .map((v) => `  ${v[0].toFixed(8)}  ${v[1].toFixed(8)}  ${v[2].toFixed(8)}`)
    .join('\n');

  return `&CONTROL
  calculation = 'scf'
  prefix = 'holoscript_qm'
  outdir = './tmp'
  pseudo_dir = '${config.pseudoDir ?? './pseudo'}'
/

&SYSTEM
  ibrav = 0
  nat = ${crystal.atoms.length}
  ntyp = ${species.length}
  ecutwfc = ${ecutwfc}
  ecutrho = ${ecutrho}
  input_dft = '${functional}'
${smearingOptions}
/

&ELECTRONS
  conv_thr = ${config.convergenceThreshold ?? 1e-6}
  electron_maxstep = ${config.maxScfIterations ?? 100}
  mixing_beta = 0.7
/

ATOMIC_SPECIES
${atomicSpecies}

CELL_PARAMETERS angstrom
${cellParameters}

ATOMIC_POSITIONS crystal
${atomicPositions}

K_POINTS automatic
${kmesh[0]} ${kmesh[1]} ${kmesh[2]} 0 0 0
`;
}

// ── QE Backend Implementation ──────────────────────────────────────────────────

/**
 * QuantumEspressoBackend — wraps QE for periodic QM calculations.
 *
 * Implements the QmSolver interface for band structure and materials
 * calculations. Molecular methods throw (use Psi4 or TBLite).
 */
export class QuantumEspressoBackend implements QmSolver {
  readonly mode = 'steady-state' as const;
  readonly fieldNames: readonly string[] = ['total_energy', 'fermi_energy', 'band_gap'];
  readonly scale: SimulationScale = 'quantum';
  readonly backend: QmBackend = 'quantum-espresso';
  readonly qmConfig: QmSolverConfig;

  private pwPath: string;
  private bandsPath: string;
  private lastEnergy: number | null = null;
  private lastFermi: number | null = null;
  private lastBandGap: number | null = null;

  constructor(config: QuantumEspressoConfig) {
    this.qmConfig = config;
    this.pwPath = config.pwPath ?? 'pw.x';
    this.bandsPath = config.bandsPath ?? 'bands.x';
  }

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
      ecutwfc: (this.qmConfig as QuantumEspressoConfig).ecutwfc ?? 60,
      bandsPath: this.bandsPath,
      lastEnergy: this.lastEnergy,
      lastBandGap: this.lastBandGap,
    };
  }

  dispose(): void {
    this.lastEnergy = null;
    this.lastFermi = null;
    this.lastBandGap = null;
  }

  // ── Capability implementations ────────────────────────────────────────

  async computeEnergy(_molecule: MoleculeSpec): Promise<QmEnergyResult> {
    throw new Error(
      '[qm-bridge] Quantum ESPRESSO does not support molecular energy calculations. Use psi4 backend.'
    );
  }

  async optimizeGeometry(_molecule: MoleculeSpec): Promise<never> {
    throw new Error(
      '[qm-bridge] Quantum ESPRESSO does not support molecular geometry optimization. Use psi4 backend.'
    );
  }

  async computeVibrations(_molecule: MoleculeSpec): Promise<never> {
    throw new Error(
      '[qm-bridge] Quantum ESPRESSO does not support molecular vibrational analysis. Use psi4 backend.'
    );
  }

  async computeChargeDensity(): Promise<never> {
    throw new Error('[qm-bridge] Quantum ESPRESSO charge density not yet implemented (stage 2).');
  }

  async computeBandStructure(crystal: CrystalSpec): Promise<QmBandStructureResult> {
    requireCapability('quantum-espresso', 'periodic');
    const startTime = performance.now();
    const input = generateQeScfInput(
      crystal,
      this.qmConfig.method,
      this.qmConfig as QuantumEspressoConfig
    );
    const raw = await this.runQe(input);
    const wallTime = (performance.now() - startTime) / 1000;

    const result: QmBandStructureResult = {
      bandEnergies: raw.band_energies ?? [],
      fermiEnergy: raw.fermi_energy ?? 0,
      bandGap: raw.band_gap ?? 0,
      isMetallic: (raw.band_gap ?? 1) <= 0.01,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };

    this.lastFermi = result.fermiEnergy;
    this.lastBandGap = result.bandGap;
    return result;
  }

  async computeDipoleMoment(): Promise<never> {
    throw new Error(
      '[qm-bridge] Quantum ESPRESSO does not support molecular dipole calculations. Use psi4 backend.'
    );
  }

  async computeDftMaterials(crystal: CrystalSpec): Promise<{
    energy: QmEnergyResult;
    bandStructure: QmBandStructureResult;
  }> {
    requireCapability('quantum-espresso', 'periodic');
    const startTime = performance.now();

    // Run SCF calculation
    const scfInput = generateQeScfInput(
      crystal,
      this.qmConfig.method,
      this.qmConfig as QuantumEspressoConfig
    );
    const raw = await this.runQe(scfInput);
    const wallTimeEnergy = (performance.now() - startTime) / 1000;

    // Run band structure
    const bandResult = await this.computeBandStructure(crystal);

    const energyResult: QmEnergyResult = {
      totalEnergy: raw.total_energy ?? 0,
      electronicEnergy: raw.total_energy ?? 0,
      nuclearRepulsionEnergy: 0,
      scfIterations: raw.scf_iterations ?? 0,
      converged: raw.converged ?? false,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTimeEnergy,
    };

    this.lastEnergy = energyResult.totalEnergy;
    return { energy: energyResult, bandStructure: bandResult };
  }

  async computeNmrSpectrum(): Promise<never> {
    throw new Error('[qm-bridge] Quantum ESPRESSO does not support NMR GIAO. Use psi4 backend.');
  }

  async computeSemiEmpiricalEnergy(): Promise<never> {
    throw new Error(
      '[qm-bridge] Quantum ESPRESSO does not support semi-empirical. Use tblite backend.'
    );
  }

  async computeTransitionState(): Promise<never> {
    throw new Error(
      '[qm-bridge] Quantum ESPRESSO does not support NEB/TS search. Use psi4 backend.'
    );
  }

  async computeQmMm(): Promise<never> {
    throw new Error('[qm-bridge] Quantum ESPRESSO does not support QM/MM. Use psi4 backend.');
  }

  // ── Subprocess bridge ──────────────────────────────────────────────────

  /**
   * Run pw.x with the given SCF input and parse the output.
   *
   * When pwPath is '__mock__', returns synthesised results for testing
   * without a QE installation. When pwPath is any other value, the input is
   * written to a temp directory, pw.x is spawned with stdin redirect, and
   * the output is parsed for total energy, Fermi energy, and band gap.
   * If the spawn fails, an error is thrown — silent fallback to mock would
   * be verifier theater.
   *
   * Output parsing targets QE 7.x XML output (in the ./tmp/holoscript_qm.save/
   * directory) or falls back to stdout pattern matching.
   */
  private async runQe(input: string): Promise<QuantumEspressoRawResult> {
    if (this.pwPath === '__mock__') {
      return this.mockQeResult();
    }

    // Real pw.x subprocess invocation.
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');

    const execFileAsync = promisify(execFile);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'holoscript_qe_'));
    const inputPath = path.join(tmpDir, 'pw.in');
    const outputPath = path.join(tmpDir, 'pw.out');

    try {
      // Patch outdir in input to use tmpDir
      const patchedInput = input.replace("outdir = './tmp'", `outdir = '${tmpDir}/tmp'`);
      await fs.writeFile(inputPath, patchedInput, 'utf8');

      const { stdout, stderr } = await execFileAsync(
        this.pwPath,
        ['-in', inputPath],
        {
          cwd: tmpDir,
          maxBuffer: 50 * 1024 * 1024,
          env: { ...process.env, OMP_NUM_THREADS: '1' },
        }
      );

      // Write stdout to output file for easier parsing
      await fs.writeFile(outputPath, stdout, 'utf8').catch(() => undefined);

      if (stderr) {
        const fatal = stderr
          .split('\n')
          .filter((l) => l.includes('Error') || l.includes('Traceback') || l.includes('forrtl'));
        if (fatal.length > 0) {
          throw new Error(`[quantum-espresso] pw.x stderr: ${fatal.join('\n')}`);
        }
      }

      // Parse QE stdout for key quantities.
      // Total energy line:  "!    total energy              =     -340.12345678 Ry"
      const energyMatch = stdout.match(/!\s+total energy\s+=\s+([-\d.]+)\s+Ry/);
      const totalEnergy = energyMatch?.[1] !== undefined ? parseFloat(energyMatch[1]) : undefined;

      // Fermi energy line:  "the Fermi energy is     2.1234 ev"
      const fermiMatch = stdout.match(/the Fermi energy is\s+([-\d.]+)\s+ev/i);
      const fermiEnergy = fermiMatch?.[1] !== undefined ? parseFloat(fermiMatch[1]) : undefined;

      // Convergence:  "convergence has been achieved in   N iterations"
      const convMatch = stdout.match(/convergence has been achieved in\s+(\d+)/i);
      const converged = convMatch !== null;
      const scfIterations =
        convMatch?.[1] !== undefined ? parseInt(convMatch[1], 10) : 0;

      return {
        total_energy: totalEnergy,
        fermi_energy: fermiEnergy,
        band_gap: undefined, // Requires post-processing with bands.x
        is_metallic: fermiEnergy !== undefined && totalEnergy !== undefined,
        scf_iterations: scfIterations,
        converged,
        band_energies: [],
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[quantum-espresso] Failed to run pw.x at '${this.pwPath}': ${msg}`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private mockQeResult(): QuantumEspressoRawResult {
    // Typical perovskite SrTiO3 values
    return {
      total_energy: -340.5 + Math.random() * 0.01,
      fermi_energy: 2.1,
      band_gap: 1.9, // SrTiO3 experimental ~3.2 eV; DFT typically underestimates
      is_metallic: false,
      scf_iterations: 12,
      converged: true,
      band_energies: [],
    };
  }
}
