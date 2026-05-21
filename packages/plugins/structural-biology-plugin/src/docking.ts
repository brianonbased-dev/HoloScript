/**
 * @holoscript/structural-biology-plugin — AutoDock binding affinity bridge.
 *
 * Provides configuration, result, and trait interfaces for molecular docking
 * via AutoDock-GPU / AutoDock Vina. Wires into core's existing `auto_dock`
 * and `binding_affinity` scientific-computing traits.
 *
 * Architecture follows the qm-bridge pattern: each docking backend implements
 * DockingSolver (which extends the SimSolver contract for steady-state
 * molecular docking), and participates in the same SimulationContract / CAEL
 * recording / Brittney dispatch pipeline.
 *
 * @module docking
 */

// ── Docking backends ─────────────────────────────────────────────────────────

export type DockingBackend = 'autodock-gpu' | 'autodock-vina' | 'gnina';

// ── Docking configuration ────────────────────────────────────────────────────

export interface DockingConfig {
  /** Docking engine backend */
  backend: DockingBackend;
  /** Receptor protein (PDB data or PDBQT string) */
  receptor: string;
  /** Ligand (SMILES, PDBQT, or SDF) */
  ligand: string;
  /** Search space center x */
  centerX: number;
  /** Search space center y */
  centerY: number;
  /** Search space center z */
  centerZ: number;
  /** Search space size x (Angstroms) */
  sizeX: number;
  /** Search space size y (Angstroms) */
  sizeY: number;
  /** Search space size z (Angstroms) */
  sizeZ: number;
  /** Number of docking runs (exhaustiveness in Vina terms) */
  numRuns?: number;
  /** Energy range for Vina: max energy difference from best mode (kcal/mol) */
  energyRange?: number;
  /** Maximum number of binding modes to output */
  maxModes?: number;
  /** Flexible receptor residues (for induced-fit docking) */
  flexibleResidues?: string[];
  /** Scoring function variant */
  scoringFunction?: 'vina' | 'ad4' | 'vinardo' | 'gnina_default';
  /** GPU device index for AutoDock-GPU (-1 for CPU fallback) */
  gpuDevice?: number;
  /** Number of LGA runs for AutoDock-GPU */
  lgaRuns?: number;
  /** Population size for AutoDock-GPU LGA */
  popSize?: number;
}

// ── Docking result ────────────────────────────────────────────────────────────

export interface DockingPose {
  /** Binding affinity in kcal/mol */
  affinity: number;
  /** Root-mean-square deviation from reference (lower bound) */
  rmsdLb: number;
  /** Root-mean-square deviation from reference (upper bound) */
  rmsdUb: number;
  /** Pose PDBQT data */
  poseData: string;
  /** Intermolecular energy (kcal/mol) */
  intermolEnergy?: number;
  /** Internal energy (kcal/mol) */
  internalEnergy?: number;
  /** Torsional energy (kcal/mol) */
  torsionalEnergy?: number;
}

export interface DockingResult {
  status: 'success' | 'failed';
  /** Best binding affinity (kcal/mol, most negative = strongest binding) */
  bestAffinity?: number;
  /** All poses from the docking run, sorted by affinity */
  poses: DockingPose[];
  /** Receptor identifier */
  receptorId: string;
  /** Ligand identifier (SMILES or name) */
  ligandId: string;
  /** Backend used */
  backend: DockingBackend;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** AutoDock-GPU specific: number of LGA runs completed */
  lgaRunsCompleted?: number;
  /** Error message if status is 'failed' */
  error?: string;
}

// ── Docking trait interfaces ─────────────────────────────────────────────────

/**
 * @auto_dock trait — Automated molecular docking configuration.
 * Wires to core's existing `auto_dock` scientific-computing trait.
 */
export interface AutoDockTrait {
  trait: 'auto_dock';
  /** Docking backend */
  backend: DockingBackend;
  /** Receptor PDBQT or PDB data */
  receptor: string;
  /** Ligand SMILES, PDBQT, or SDF */
  ligand: string;
  /** Search box center {x, y, z} in Angstroms */
  searchCenter: { x: number; y: number; z: number };
  /** Search box dimensions {x, y, z} in Angstroms */
  searchSize: { x: number; y: number; z: number };
  /** Number of docking runs */
  numRuns?: number;
  /** Scoring function variant */
  scoringFunction?: 'vina' | 'ad4' | 'vinardo' | 'gnina_default';
}

/**
 * @binding_affinity trait — Binding affinity metrics result.
 * Wires to core's existing `binding_affinity` scientific-computing trait.
 */
export interface BindingAffinityTrait {
  trait: 'binding_affinity';
  /** Best binding affinity (kcal/mol) */
  bestAffinity: number;
  /** Number of poses */
  poseCount: number;
  /** RMSD range (lower, upper) for best pose */
  bestRmsdRange: [number, number];
  /** Backend used */
  backend: DockingBackend;
  /** Ki (inhibition constant) in nM, derived from affinity */
  ki_nm?: number;
  /** Percentage of poses below threshold affinity */
  hitRate?: number;
}

// ── DockingSolver ─────────────────────────────────────────────────────────────

/**
 * DockingSolver — steady-state SimSolver for molecular docking.
 *
 * Extends the core SimSolver contract for docking workloads. `solve()`
 * executes the docking run and returns the result. `step()` is a no-op
 * (docking is steady-state, not transient). Output fields are accessible
 * via `getField()` after `solve()` completes.
 *
 * Follows the qm-bridge factory pattern: `createDockingSolver(config)`
 * returns a backend-specific instance.
 */
export interface DockingSolver {
  /** Docking is always steady-state */
  readonly mode: 'steady-state';
  /** Available output field names */
  readonly fieldNames: readonly string[];
  /** Backend identifier */
  readonly backend: DockingBackend;

  /** Execute the docking computation */
  solve(): Promise<DockingResult>;

  /** Retrieve a named output field after solve() */
  getField(name: string): Float32Array | Float64Array | null;

  /** Solver statistics (run count, timing, convergence) */
  getStats(): Record<string, unknown>;

  /** Release resources */
  dispose(): void;
}

// ── Docking config -> DockingConfig adapter ───────────────────────────────────

/**
 * Convert an AutoDockTrait (domain-level) to a DockingConfig (solver-level).
 * This bridges the plugin trait vocabulary to the solver configuration format.
 */
export function traitToConfig(trait: AutoDockTrait): DockingConfig {
  return {
    backend: trait.backend,
    receptor: trait.receptor,
    ligand: trait.ligand,
    centerX: trait.searchCenter.x,
    centerY: trait.searchCenter.y,
    centerZ: trait.searchCenter.z,
    sizeX: trait.searchSize.x,
    sizeY: trait.searchSize.y,
    sizeZ: trait.searchSize.z,
    numRuns: trait.numRuns,
    scoringFunction: trait.scoringFunction,
  };
}

// ── Provenance integration ────────────────────────────────────────────────────

/**
 * Compute a provenance anchor for a docking result, linking it back to the
 * structural-biology plugin identity and the specific receptor-ligand pair.
 */
export function dockingProvenance(result: DockingResult): string {
  const { fnv1a } = (() => {
    let h = 0x811c9dc5;
    const fnv = (s: string) => {
      h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    };
    return { fnv1a: fnv };
  })();

  const head = `structural-biology@0.1.0|docking|${result.backend}`;
  const receptorHash = fnv1a(result.receptorId);
  const ligandHash = fnv1a(result.ligandId);
  const affinityKey = `best:${result.bestAffinity?.toFixed(2) ?? 'unknown'}`;
  const poseKey = `poses:${result.poses.length}`;

  return fnv1a(`${head}|r:${receptorHash}|l:${ligandHash}|${affinityKey}|${poseKey}`);
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Select the appropriate docking backend based on a question or use case.
 *
 * - 'autodock-gpu': High-throughput screening, large grid searches, GPU-accelerated
 * - 'autodock-vina': Standard docking, widely validated, good default
 * - 'gnina': CNN scoring, pose prediction with ML re-scoring
 */
export function selectDockingBackend(questionType: string): DockingBackend {
  const q = questionType.toLowerCase();

  if (q.includes('screen') || q.includes('high-throughput') || q.includes('batch') || q.includes('many')) {
    return 'autodock-gpu';
  }

  if (q.includes('cnn') || q.includes('ml') || q.includes('gnina') || q.includes('neural') || q.includes('deep learning')) {
    return 'gnina';
  }

  // Default: AutoDock Vina — the well-validated workhorse
  return 'autodock-vina';
}

// ── Compile targets ───────────────────────────────────────────────────────────

export type DockingCompileFormat = 'pdbqt' | 'sdf' | 'csv' | 'holo';

export interface DockingCompileOptions {
  format?: DockingCompileFormat;
}

/**
 * Compile AutoDock and BindingAffinity traits into a target representation.
 *
 * - `pdbqt`  — PDBQT with REMARK lines (default, AutoDock-native)
 * - `sdf`    — MDL MOL/SDF with docking annotations
 * - `csv`    — CSV table of pose affinities and RMSD values
 * - `holo`   — HoloScript .holo composition
 */
export function compileDocking(
  traits: Array<AutoDockTrait | BindingAffinityTrait>,
  opts: DockingCompileOptions = {},
): string {
  const format = opts.format ?? 'pdbqt';

  switch (format) {
    case 'pdbqt':
      return compileDockingToPdbqt(traits);
    case 'sdf':
      return compileDockingToSdf(traits);
    case 'csv':
      return compileDockingToCsv(traits);
    case 'holo':
      return compileDockingToHolo(traits);
    default:
      throw new Error(`Unsupported docking format: ${format as string}`);
  }
}

function compileDockingToPdbqt(traits: Array<AutoDockTrait | BindingAffinityTrait>): string {
  const lines: string[] = ['HEADER    HOLOSCRIPT DOCKING PLUGIN'];

  for (const t of traits) {
    if (t.trait === 'auto_dock') {
      lines.push(`REMARK 400 DOCKING backend=${t.backend}`);
      lines.push(`REMARK 400 SEARCH_CENTER ${t.searchCenter.x},${t.searchCenter.y},${t.searchCenter.z}`);
      lines.push(`REMARK 400 SEARCH_SIZE ${t.searchSize.x},${t.searchSize.y},${t.searchSize.z}`);
      lines.push(`REMARK 400 SCORING ${t.scoringFunction ?? 'vina'}`);
      if (t.numRuns) lines.push(`REMARK 400 RUNS ${t.numRuns}`);
    } else if (t.trait === 'binding_affinity') {
      lines.push(`REMARK 500 BINDING_AFFINITY best=${t.bestAffinity} kcal/mol`);
      lines.push(`REMARK 500 POSES ${t.poseCount}`);
      lines.push(`REMARK 500 RMSD_RANGE ${t.bestRmsdRange[0].toFixed(3)}-${t.bestRmsdRange[1].toFixed(3)}`);
      lines.push(`REMARK 500 BACKEND ${t.backend}`);
      if (t.ki_nm !== undefined) lines.push(`REMARK 500 KI ${t.ki_nm.toFixed(2)} nM`);
      if (t.hitRate !== undefined) lines.push(`REMARK 500 HIT_RATE ${(t.hitRate * 100).toFixed(1)}%`);
    }
  }

  lines.push('END');
  return lines.join('\n');
}

function compileDockingToSdf(traits: Array<AutoDockTrait | BindingAffinityTrait>): string {
  const lines: string[] = [];

  for (const t of traits) {
    if (t.trait === 'binding_affinity') {
      lines.push('ligand');
      lines.push('  HoloScript');
      lines.push('');
      lines.push('  0  0  0  0  0  0  0  0  0  0  0 V2000');
      lines.push('M  END');
      lines.push(`>  <docking.backend> (${t.backend})`);
      lines.push(`${t.backend}`);
      lines.push('');
      lines.push(`>  <docking.bestAffinity> (kcal/mol)`);
      lines.push(`${t.bestAffinity}`);
      lines.push('');
      lines.push(`>  <docking.poseCount>`);
      lines.push(`${t.poseCount}`);
      lines.push('');
      lines.push(`>  <docking.rmsdRange>`);
      lines.push(`${t.bestRmsdRange[0].toFixed(3)},${t.bestRmsdRange[1].toFixed(3)}`);
      lines.push('');
      if (t.ki_nm !== undefined) {
        lines.push(`>  <docking.ki_nm>`);
        lines.push(`${t.ki_nm.toFixed(2)}`);
        lines.push('');
      }
      lines.push('$$$$');
    }
  }

  return lines.join('\n');
}

function compileDockingToCsv(traits: Array<AutoDockTrait | BindingAffinityTrait>): string {
  const rows: string[] = ['trait,backend,bestAffinity_kcal_mol,poseCount,rmsdLb,rmsdUb,ki_nm,hitRate'];

  for (const t of traits) {
    if (t.trait === 'binding_affinity') {
      rows.push(
        `binding_affinity,${t.backend},${t.bestAffinity},${t.poseCount},${t.bestRmsdRange[0]},${t.bestRmsdRange[1]},${t.ki_nm ?? ''},${t.hitRate ?? ''}`,
      );
    } else if (t.trait === 'auto_dock') {
      rows.push(
        `auto_dock,${t.backend},,,${t.searchCenter.x},${t.searchCenter.y},${t.searchCenter.z},`,
      );
    }
  }

  return rows.join('\n');
}

function compileDockingToHolo(traits: Array<AutoDockTrait | BindingAffinityTrait>): string {
  const lines: string[] = ['composition "DockingScene" {'];

  for (const t of traits) {
    if (t.trait === 'auto_dock') {
      lines.push(`  object "DockingConfig" @auto_dock {`);
      lines.push(`    backend: "${t.backend}"`);
      lines.push(`    center: { x: ${t.searchCenter.x}, y: ${t.searchCenter.y}, z: ${t.searchCenter.z} }`);
      lines.push(`    size: { x: ${t.searchSize.x}, y: ${t.searchSize.y}, z: ${t.searchSize.z} }`);
      if (t.numRuns) lines.push(`    numRuns: ${t.numRuns}`);
      if (t.scoringFunction) lines.push(`    scoringFunction: "${t.scoringFunction}"`);
      lines.push('  }');
    } else if (t.trait === 'binding_affinity') {
      lines.push(`  object "BindingAffinity" @binding_affinity {`);
      lines.push(`    bestAffinity: ${t.bestAffinity}`);
      lines.push(`    poseCount: ${t.poseCount}`);
      lines.push(`    rmsdRange: [${t.bestRmsdRange[0]}, ${t.bestRmsdRange[1]}]`);
      lines.push(`    backend: "${t.backend}"`);
      if (t.ki_nm !== undefined) lines.push(`    ki_nm: ${t.ki_nm.toFixed(2)}`);
      if (t.hitRate !== undefined) lines.push(`    hitRate: ${(t.hitRate * 100).toFixed(1)}%`);
      lines.push('  }');
    }
  }

  lines.push('}');
  return lines.join('\n');
}