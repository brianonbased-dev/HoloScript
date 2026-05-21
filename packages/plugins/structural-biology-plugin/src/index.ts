/**
 * @holoscript/structural-biology-plugin — protein/ligand/chain + docking + ADMET.
 *
 * Implements the canonical structural-biology vocabulary referenced by
 * paper-12 (HoloLand I3D) §"Comparison with OpenUSD Schema Plugins": three
 * domain object types (`protein`, `ligand`, `chain`) plus annotation traits
 * (`foldable`, `helix`, `sheet`, `residue_anchor`) that compose with the
 * 28 scientific-computing traits in @holoscript/core.
 *
 * v0.2.0 extends the bridge from AlphaFold structure prediction toward
 * binding affinity (AutoDock-GPU / Vina / GNINA) and ADMET prediction
 * (RDKit / ADMETlab / local-ML). This connects "structure" to "function" —
 * the founder direction for quarter-horizon expansion.
 *
 * ## New in v0.2.0 (AlphaFold → Binding/ADMET bridge)
 *
 * - Docking configuration and result types (AutoDock-GPU, Vina, GNINA)
 * - ADMET property prediction types (25 endpoints across A/D/M/E/T)
 * - `auto_dock`, `binding_affinity`, `admet_prediction`, `admet_result` traits
 *   wired to core's existing scientific-computing trait namespace
 * - Provenance chain integration for docking and ADMET results
 * - Compile targets: PDBQT, SDF, CSV, JSON, HoloScript .holo
 * - Drug-likeness heuristics (Lipinski Rule of 5, composite score)
 * - Backend selection functions for docking and ADMET
 *
 * @module @holoscript/structural-biology-plugin
 */

// ── Domain primitives (v0.1.0) ────────────────────────────────────────────────

export const STRUCTURAL_BIOLOGY_OBJECT_TYPES = [
  'protein',
  'ligand',
  'chain',
] as const;
export type StructuralBiologyObjectType =
  (typeof STRUCTURAL_BIOLOGY_OBJECT_TYPES)[number];

// ── Annotation traits (v0.1.0) ───────────────────────────────────────────────

export const STRUCTURAL_BIOLOGY_TRAITS = [
  'foldable',        // protein backbone supports folding state transitions
  'helix',           // alpha-helix secondary-structure annotation
  'sheet',           // beta-sheet secondary-structure annotation
  'residue_anchor',  // per-residue provenance anchor (chain id + index)
] as const;
export type StructuralBiologyTraitName =
  (typeof STRUCTURAL_BIOLOGY_TRAITS)[number];

// ── Bridge traits (v0.2.0) ────────────────────────────────────────────────────

/**
 * Bridge traits this plugin contributes that wire into core's existing
 * scientific-computing trait namespace. These are NOT redeclared — they
 * reference `auto_dock`, `binding_affinity` from core's
 * `SCIENTIFIC_COMPUTING_TRAITS` and add `admet_prediction`, `admet_result`
 * as new domain traits.
 */
export const BRIDGE_TRAITS = [
  'auto_dock',         // Automated molecular docking (core trait)
  'binding_affinity',  // Binding affinity metrics (core trait)
  'admet_prediction',  // ADMET property prediction (new)
  'admet_result',      // ADMET prediction result (new)
] as const;
export type BridgeTraitName = (typeof BRIDGE_TRAITS)[number];

// ── Plugin descriptor ──────────────────────────────────────────────────────────

export interface StructuralBiologyPluginDescriptor {
  /** Stable plugin identity used in the provenance hash chain. */
  id: 'structural-biology';
  version: string;
  objectTypes: readonly StructuralBiologyObjectType[];
  traits: readonly StructuralBiologyTraitName[];
  bridgeTraits: readonly BridgeTraitName[];
}

export const PLUGIN_DESCRIPTOR: StructuralBiologyPluginDescriptor = {
  id: 'structural-biology',
  version: '0.2.0',
  objectTypes: STRUCTURAL_BIOLOGY_OBJECT_TYPES,
  traits: STRUCTURAL_BIOLOGY_TRAITS,
  bridgeTraits: BRIDGE_TRAITS,
};

// ── Host registry contract ────────────────────────────────────────────────────

export interface PluginHostRegistry {
  registerObjectType(name: string, descriptor: { plugin: string }): void;
  registerTrait(name: string, descriptor: { plugin: string }): void;
}

/**
 * Single registration entry point. Paper-12 §"Comparison with OpenUSD Schema
 * Plugins" claims `register()` is the entire effort on the HoloScript side
 * — this function IS that claim, evaluated for LOC by the comparison harness.
 *
 * v0.2.0: Also registers the 4 bridge traits (auto_dock, binding_affinity,
 * admet_prediction, admet_result) alongside the original annotation traits.
 */
export function register(host: PluginHostRegistry): StructuralBiologyPluginDescriptor {
  for (const name of STRUCTURAL_BIOLOGY_OBJECT_TYPES) {
    host.registerObjectType(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  for (const name of STRUCTURAL_BIOLOGY_TRAITS) {
    host.registerTrait(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  for (const name of BRIDGE_TRAITS) {
    host.registerTrait(name, { plugin: PLUGIN_DESCRIPTOR.id });
  }
  return PLUGIN_DESCRIPTOR;
}

// ── Domain primitives (v0.1.0) ────────────────────────────────────────────────

export interface Residue {
  chain: string;          // chain identifier (e.g. "A")
  index: number;          // 1-based residue index in chain
  resname: string;        // 3-letter residue name (e.g. "GLY")
  secondary?: 'helix' | 'sheet' | 'loop';
}

export interface ProteinObject {
  type: 'protein';
  name: string;
  uniprot?: string;       // UniProt accession (e.g. "P00533")
  residues: Residue[];
  traits: StructuralBiologyTraitName[];
}

export interface LigandObject {
  type: 'ligand';
  name: string;
  smiles?: string;        // ligand SMILES string
  traits: StructuralBiologyTraitName[];
}

export interface ChainObject {
  type: 'chain';
  name: string;
  parentProtein: string;
  residueCount: number;
  traits: StructuralBiologyTraitName[];
}

export type StructuralBiologyObject = ProteinObject | LigandObject | ChainObject;

// ── Provenance hash chain (v0.1.0) ────────────────────────────────────────────

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function hashHex(s: string): string {
  return fnv1a(s).toString(16).padStart(8, '0');
}

export function residueAnchor(residue: Residue): string {
  return hashHex(
    `${PLUGIN_DESCRIPTOR.id}@${PLUGIN_DESCRIPTOR.version}|${residue.chain}:${residue.index}:${residue.resname}:${residue.secondary ?? 'loop'}`,
  );
}

export function chainHash(obj: StructuralBiologyObject): string {
  const head = `${PLUGIN_DESCRIPTOR.id}@${PLUGIN_DESCRIPTOR.version}|${obj.type}|${obj.name}`;
  if (obj.type === 'protein') {
    const tail = obj.residues.map(residueAnchor).join(':');
    return hashHex(`${head}|${tail}|traits:${obj.traits.join(',')}`);
  }
  const traitsTail = `traits:${obj.traits.join(',')}`;
  if (obj.type === 'ligand') {
    return hashHex(`${head}|smiles:${obj.smiles ?? ''}|${traitsTail}`);
  }
  return hashHex(`${head}|parent:${obj.parentProtein}|count:${obj.residueCount}|${traitsTail}`);
}

export function verifyChain(obj: StructuralBiologyObject, expected: string): boolean {
  return chainHash(obj) === expected;
}

// ── Docking bridge (v0.2.0) ───────────────────────────────────────────────────

export {
  // Types
  type DockingBackend,
  type DockingConfig,
  type DockingPose,
  type DockingResult,
  type AutoDockTrait,
  type BindingAffinityTrait,
  type DockingSolver,
  type DockingCompileFormat,
  type DockingCompileOptions,
  // Functions
  traitToConfig,
  dockingProvenance,
  selectDockingBackend,
  compileDocking,
} from './docking';

// ── ADMET bridge (v0.2.0) ──────────────────────────────────────────────────────

export {
  // Constants
  ADMET_PROPERTIES,
  // Types
  type AdmetProperty,
  type AdmetBackend,
  type AdmetConfig,
  type AdmetPrediction,
  type AdmetResult,
  type AdmetPredictionTrait,
  type AdmetResultTrait,
  type AdmetCompileFormat,
  type AdmetCompileOptions,
  // Functions
  countLipinskiViolations,
  computeDrugLikeness,
  selectAdmetBackend,
  admetProvenance,
  compileAdmet,
} from './admet';

// ── SimulationContract receipt bridge (v0.2.0) ─────────────────────────────────

export {
  // Types
  type DrugDiscoveryScale,
  type DockingReceipt,
  type AdmetReceipt,
  type DrugDiscoveryReceipt,
  type DrugLikenessAssessment,
  // Factory functions
  createDockingReceipt,
  createAdmetReceipt,
  createDrugDiscoveryReceipt,
  runDrugDiscoveryPipeline,
  // Compile targets
  compileDockingReceiptToHolo,
  compileAdmetReceiptToHolo,
  compileDrugDiscoveryReceiptToHolo,
} from './receipt';

// ── Version ────────────────────────────────────────────────────────────────────

export const VERSION = '0.2.0';