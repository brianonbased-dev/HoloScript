/**
 * TBLite backend — semi-empirical / extended tight-binding for fast screening.
 *
 * TBLite implements the GFN-xTB family of extended tight-binding methods
 * (GFN0-xTB, GFN1-xTB, GFN2-xTB). It provides fast, approximate QM
 * calculations suitable for screening large numbers of molecules where
 * DFT would be too expensive.
 *
 * This backend wraps TBLite's Python API (tblite-python) or the standalone
 * xtb executable via a subprocess bridge.
 *
 * Per EVOLVED §7.1: TBLite is the semi-empirical backend. It supports
 * capability #8 (semi-empirical for large systems / catalyst screening).
 *
 * Source: research/2026-04-28_qm-as-foundational-layer-EVOLVED.md §7.1
 * Reference: https://github.com/tblite/tblite
 */

import type {
  QmSolver,
  QmBackend,
  QmSolverConfig,
  MoleculeSpec,
  QmEnergyResult,
  QmGeometryResult,
} from '../QmSolver';
import { requireCapability } from '../QmSolver';
import type { FieldData } from '@holoscript/engine/simulation/SimSolver';
import type { SimulationScale } from '@holoscript/engine/simulation/SimulationContract';

// ── TBLite-specific configuration ─────────────────────────────────────────────

export interface TBLiteConfig extends QmSolverConfig {
  backend: 'tblite';
  /** Path to xtb executable. Default: 'xtb'. */
  xtbPath?: string;
  /** GFN-xTB method level. Default: 'GFN2-xTB'. */
  xtbMethod?: 'GFN0-xTB' | 'GFN1-xTB' | 'GFN2-xTB';
  /** Accuracy level (1-5, higher = more accurate, slower). Default: 1. */
  accuracy?: number;
}

interface TBLiteRawResult {
  total_energy?: number;
  converged?: boolean;
  scf_iterations?: number;
  dipole_moment?: [number, number, number];
  gradient_norm?: number;
  opt_steps?: number;
}

// ── TBLite Backend Implementation ──────────────────────────────────────────────

/**
 * TBLiteBackend — wraps TBLite/xtb for fast semi-empirical calculations.
 *
 * Implements the QmSolver interface for screening workflows. Provides
 * computeSemiEmpiricalEnergy for fast batch evaluation, plus basic
 * energy and geometry optimization via GFN-xTB.
 */
export class TBLiteBackend implements QmSolver {
  readonly mode = 'steady-state' as const;
  readonly fieldNames: readonly string[] = ['total_energy', 'dipole_moment'];
  readonly scale: SimulationScale = 'quantum';
  readonly backend: QmBackend = 'tblite';
  readonly qmConfig: QmSolverConfig;

  private xtbPath: string;
  private xtbMethod: string;
  private lastEnergy: number | null = null;

  constructor(config: TBLiteConfig) {
    this.qmConfig = config;
    this.xtbPath = config.xtbPath ?? 'xtb';
    this.xtbMethod = config.xtbMethod ?? 'GFN2-xTB';
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
    return null;
  }

  getStats(): Record<string, unknown> {
    return {
      backend: this.backend,
      method: this.xtbMethod,
      lastEnergy: this.lastEnergy,
    };
  }

  dispose(): void {
    this.lastEnergy = null;
  }

  // ── Capability implementations ────────────────────────────────────────

  async computeEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult> {
    return this.computeSemiEmpiricalEnergy(molecule);
  }

  async optimizeGeometry(molecule: MoleculeSpec): Promise<QmGeometryResult> {
    requireCapability('tblite', 'semiEmpirical');
    const startTime = performance.now();
    const raw = await this.runXtb(molecule, '--opt');
    const wallTime = (performance.now() - startTime) / 1000;

    return {
      molecule, // In real impl: parse optimized geometry from xtb output
      totalEnergy: raw.total_energy ?? 0,
      converged: raw.converged ?? false,
      optimizationSteps: raw.opt_steps ?? 0,
      finalGradientNorm: raw.gradient_norm ?? 0,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };
  }

  async computeVibrations(): Promise<never> {
    throw new Error(
      '[qm-bridge] TBLite vibrational analysis not yet implemented (stage 2). Use psi4 for accurate frequencies.'
    );
  }

  async computeChargeDensity(): Promise<never> {
    throw new Error('[qm-bridge] TBLite does not support charge density grids. Use psi4 backend.');
  }

  async computeBandStructure(): Promise<never> {
    throw new Error(
      '[qm-bridge] TBLite does not support band structure calculations. Use quantum-espresso backend.'
    );
  }

  async computeDipoleMoment(molecule: MoleculeSpec): Promise<[number, number, number]> {
    const result = await this.computeSemiEmpiricalEnergy(molecule);
    return result.dipoleMoment ?? [0, 0, 0];
  }

  async computeDftMaterials(): Promise<never> {
    throw new Error(
      '[qm-bridge] TBLite does not support periodic/materials DFT. Use quantum-espresso backend.'
    );
  }

  async computeNmrSpectrum(): Promise<never> {
    throw new Error('[qm-bridge] TBLite does not support NMR GIAO. Use psi4 backend.');
  }

  async computeSemiEmpiricalEnergy(molecule: MoleculeSpec): Promise<QmEnergyResult> {
    requireCapability('tblite', 'semiEmpirical');
    const startTime = performance.now();
    const raw = await this.runXtb(molecule, '--sp');
    const wallTime = (performance.now() - startTime) / 1000;

    const result: QmEnergyResult = {
      totalEnergy: raw.total_energy ?? 0,
      electronicEnergy: raw.total_energy ?? 0,
      nuclearRepulsionEnergy: 0,
      scfIterations: raw.scf_iterations ?? 0,
      converged: raw.converged ?? false,
      dipoleMoment: raw.dipole_moment,
      solverConfig: this.qmConfig,
      wallTimeSeconds: wallTime,
    };

    this.lastEnergy = result.totalEnergy;
    return result;
  }

  async computeTransitionState(): Promise<never> {
    throw new Error('[qm-bridge] TBLite does not support NEB/TS search. Use psi4 backend.');
  }

  async computeQmMm(): Promise<never> {
    throw new Error('[qm-bridge] TBLite does not support QM/MM. Use psi4 backend.');
  }

  // ── Subprocess bridge ──────────────────────────────────────────────────

  /**
   * Invoke xtb for a single-point (--sp) or geometry optimisation (--opt).
   *
   * When xtbPath is '__mock__', returns synthesised results so tests that do
   * not have xtb installed can still exercise the interface. When xtbPath is
   * any other value, the XYZ input is written to a temp directory, xtb is
   * spawned, and the JSON output (xtb --json writes xtbout.json) is parsed.
   * If the spawn fails, an error is thrown — silent fallback to mock would
   * be verifier theater.
   */
  private async runXtb(molecule: MoleculeSpec, task: string): Promise<TBLiteRawResult> {
    if (this.xtbPath === '__mock__') {
      return this.mockXtbResult(molecule, task);
    }

    // Real xtb subprocess invocation.
    const xyz = this.moleculeToXyz(molecule);
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const os = await import('node:os');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');

    const execFileAsync = promisify(execFile);
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'holoscript_xtb_'));
    const inputPath = path.join(tmpDir, 'input.xyz');
    const jsonOutputPath = path.join(tmpDir, 'xtbout.json');

    try {
      await fs.writeFile(inputPath, xyz, 'utf8');

      const args = [inputPath, task, '--json', '--namespace', 'xtbout'];
      // Add method flag (GFN0/GFN1/GFN2)
      if (this.xtbMethod === 'GFN0-xTB') args.push('--gfn', '0');
      else if (this.xtbMethod === 'GFN1-xTB') args.push('--gfn', '1');
      // GFN2-xTB is the default

      const { stderr } = await execFileAsync(this.xtbPath, args, {
        cwd: tmpDir,
        maxBuffer: 10 * 1024 * 1024,
      });

      if (stderr) {
        const fatal = stderr
          .split('\n')
          .filter((l) => l.includes('ERROR') || l.includes('Traceback'));
        if (fatal.length > 0) {
          throw new Error(`[tblite] xtb stderr: ${fatal.join('\n')}`);
        }
      }

      const jsonRaw = await fs.readFile(jsonOutputPath, 'utf8');
      const parsed = JSON.parse(jsonRaw) as Record<string, unknown>;

      return {
        total_energy:
          typeof parsed['total energy'] === 'number' ? parsed['total energy'] : undefined,
        converged: true,
        scf_iterations:
          typeof parsed['number of iterations taken for SCC'] === 'number'
            ? (parsed['number of iterations taken for SCC'] as number)
            : undefined,
        dipole_moment: Array.isArray(parsed['dipole'])
          ? (parsed['dipole'] as [number, number, number])
          : undefined,
        gradient_norm:
          typeof parsed['gradient norm'] === 'number'
            ? (parsed['gradient norm'] as number)
            : undefined,
        opt_steps:
          typeof parsed['optimization steps'] === 'number'
            ? (parsed['optimization steps'] as number)
            : undefined,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`[tblite] Failed to run xtb at '${this.xtbPath}': ${msg}`);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Convert molecule to XYZ format for xtb input. */
  private moleculeToXyz(molecule: MoleculeSpec): string {
    const atomLines = molecule.atoms
      .map((a) => `${a.symbol}  ${a.x.toFixed(8)}  ${a.y.toFixed(8)}  ${a.z.toFixed(8)}`)
      .join('\n');
    return `${molecule.atoms.length}\nHoloScript qm-bridge\n${atomLines}\n`;
  }

  private mockXtbResult(molecule: MoleculeSpec, task: string): TBLiteRawResult {
    const numAtoms = molecule.atoms.length;
    // GFN2-xTB energies are typically close to DFT but faster
    // ~-0.5 Hartree per atom is a rough approximation
    const approximateEnergy = -0.5 * numAtoms + Math.random() * 0.01;

    return {
      total_energy: approximateEnergy,
      converged: true,
      scf_iterations: Math.min(numAtoms, 20),
      dipole_moment: [0.1, 0.2, 0.3] as [number, number, number],
      gradient_norm: task === '--opt' ? 1e-4 : undefined,
      opt_steps: task === '--opt' ? 10 : undefined,
    };
  }
}
