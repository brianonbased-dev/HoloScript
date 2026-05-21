/**
 * @holoscript/structural-biology-plugin — SimulationContract receipt bridge.
 *
 * Connects docking and ADMET results to the HoloScript SimulationContract system.
 * Each docking run and ADMET prediction produces a verifiable receipt that ties
 * the result back to the structural-biology plugin identity and the input
 * parameters, enabling provenance tracking across the drug-discovery pipeline.
 *
 * ## Architecture
 *
 * The docking/ADMET pipeline is steady-state (solve once, not per-frame), so
 * the receipt pattern follows the ContractedSimulation Route 2d convention:
 * a single terminal state digest after solve() completes, rather than per-step
 * digests. The receipt carries:
 *
 *   - Plugin identity (structural-biology@version)
 *   - Input parameters (receptor, ligand, search box, backend)
 *   - Result summary (best affinity, pose count, drug-likeness)
 *   - Provenance hash chain (docking provenance + ADMET provenance)
 *   - Simulation scale tag ('atomistic' for docking, 'empirical-surrogate' for ADMET)
 *
 * ## Drug-discovery pipeline
 *
 *   AlphaFold (structure) → Docking (affinity) → ADMET (safety) → Receipt (provenance)
 *
 * The receipt is the 6th component of the SimContract pattern (per W.058):
 *   Config → Solver → Solve → Result → Provenance → Receipt
 *
 * @module receipt
 */

import {
  dockingProvenance,
  admetProvenance,
  type DockingConfig,
  type DockingResult,
  type DockingBackend,
  type AdmetConfig,
  type AdmetResult,
  type AdmetBackend,
  type AutoDockTrait,
  type BindingAffinityTrait,
  type AdmetPredictionTrait,
  type AdmetResultTrait,
  countLipinskiViolations,
  computeDrugLikeness,
  traitToConfig,
  selectDockingBackend,
  selectAdmetBackend,
  compileDocking,
  compileAdmet,
} from './index';

// ── Simulation scale for drug-discovery pipeline ────────────────────────────

/**
 * Simulation scale tags for drug-discovery pipeline stages.
 *
 * - 'atomistic': Molecular docking operates at the atomic scale
 *   (inter-atomic potentials, protein-ligand geometry)
 * - 'empirical-surrogate': ADMET prediction uses ML/rule-based models
 *   trained on experimental data — empirical surrogates by definition
 */
export type DrugDiscoveryScale = 'atomistic' | 'empirical-surrogate';

// ── Docking receipt ─────────────────────────────────────────────────────────

/**
 * Receipt for a molecular docking simulation run.
 *
 * Follows the SimulationContract pattern: config → solver → solve → result →
 * provenance → receipt. The receipt ties the docking result to the input
 * parameters and plugin identity, enabling reproducible provenance tracking.
 *
 * Scale: 'atomistic' — docking operates at inter-atomic potential scale.
 */
export interface DockingReceipt {
  /** Unique receipt ID for this docking run */
  receiptId: string;
  /** ISO-8601 timestamp when this receipt was generated */
  issuedAt: string;
  /** Plugin identity (structural-biology@version) */
  pluginId: string;
  /** Simulation scale — always 'atomistic' for docking */
  scale: 'atomistic';
  /** Docking backend used */
  backend: DockingBackend;
  /** Input configuration (receptor, ligand, search box) */
  config: DockingConfig;
  /** Docking result (best affinity, poses) */
  result: DockingResult;
  /** Provenance hash from dockingProvenance() */
  provenanceHash: string;
  /** Execution time in milliseconds (if available) */
  executionTimeMs?: number;
  /** Whether the docking run succeeded */
  verified: boolean;
}

// ── ADMET receipt ───────────────────────────────────────────────────────────

/**
 * Receipt for an ADMET prediction run.
 *
 * Scale: 'empirical-surrogate' — ADMET predictions use ML/rule-based models.
 */
export interface AdmetReceipt {
  /** Unique receipt ID for this ADMET prediction run */
  receiptId: string;
  /** ISO-8601 timestamp when this receipt was generated */
  issuedAt: string;
  /** Plugin identity (structural-biology@version) */
  pluginId: string;
  /** Simulation scale — always 'empirical-surrogate' for ADMET */
  scale: 'empirical-surrogate';
  /** ADMET backend used */
  backend: AdmetBackend;
  /** Input configuration (SMILES, properties) */
  config: AdmetConfig;
  /** ADMET result (predictions, drug-likeness) */
  result: AdmetResult;
  /** Provenance hash from admetProvenance() */
  provenanceHash: string;
  /** Execution time in milliseconds (if available) */
  executionTimeMs?: number;
  /** Whether the ADMET prediction succeeded */
  verified: boolean;
}

// ── Drug-discovery pipeline receipt (combined) ──────────────────────────────

/**
 * Combined receipt for the full drug-discovery pipeline:
 * AlphaFold structure → Docking → ADMET → Drug-likeness assessment.
 *
 * This is the top-level receipt that chains the three stages together
 * with a composite provenance hash, enabling end-to-end verification
 * from protein structure prediction through drug-likeness assessment.
 */
export interface DrugDiscoveryReceipt {
  /** Unique receipt ID for this pipeline run */
  receiptId: string;
  /** ISO-8601 timestamp when this receipt was generated */
  issuedAt: string;
  /** Plugin identity (structural-biology@version) */
  pluginId: string;
  /** Docking receipt (affinity stage) */
  docking: DockingReceipt;
  /** ADMET receipt (safety stage) */
  admet: AdmetReceipt;
  /** Composite provenance hash (docking + ADMET) */
  compositeProvenanceHash: string;
  /**
   * Overall drug-likeness assessment combining docking affinity
   * and ADMET safety profile.
   */
  assessment: DrugLikenessAssessment;
}

/**
 * Drug-likeness assessment combining docking affinity and ADMET safety.
 *
 * This is the "so what" of the pipeline: does the molecule bind well
 * AND pass safety screening? A strong binder that fails ADMET is not
 * a viable drug candidate.
 */
export interface DrugLikenessAssessment {
  /** Best binding affinity (kcal/mol) — more negative = stronger binding */
  bestAffinity: number;
  /** Drug-likeness score (0.0-1.0) from computeDrugLikeness() */
  drugLikenessScore: number;
  /** Number of Lipinski Rule of 5 violations */
  lipinskiViolations: number;
  /** Number of ADMET properties predicted */
  propertyCount: number;
  /** Whether the molecule passes drug-likeness threshold (>0.5 score, <=1 Lipinski violation) */
  passes: boolean;
  /** Ki (inhibition constant) in nM, derived from best affinity */
  ki_nm?: number;
  /** Percentage of docking poses below threshold affinity */
  hitRate?: number;
  /** Human-readable summary */
  summary: string;
}

// ── Receipt factory functions ───────────────────────────────────────────────

const PLUGIN_ID = 'structural-biology@0.2.0';

/**
 * Create a receipt for a docking simulation run.
 *
 * This is the primary receipt-emission point for the docking stage.
 * Each docking run produces exactly one receipt that ties the result
 * to the input configuration and plugin identity.
 */
export function createDockingReceipt(
  config: DockingConfig,
  result: DockingResult,
): DockingReceipt {
  const provenanceHash = dockingProvenance(result);
  const verified = result.status === 'success';

  return {
    receiptId: `dock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    issuedAt: new Date().toISOString(),
    pluginId: PLUGIN_ID,
    scale: 'atomistic',
    backend: result.backend,
    config,
    result,
    provenanceHash,
    executionTimeMs: result.executionTimeMs,
    verified,
  };
}

/**
 * Create a receipt for an ADMET prediction run.
 *
 * Each ADMET prediction produces exactly one receipt that ties the result
 * to the input SMILES and plugin identity.
 */
export function createAdmetReceipt(
  config: AdmetConfig,
  result: AdmetResult,
): AdmetReceipt {
  const provenanceHash = admetProvenance(result);
  const verified = result.status === 'success';

  return {
    receiptId: `admet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    issuedAt: new Date().toISOString(),
    pluginId: PLUGIN_ID,
    scale: 'empirical-surrogate',
    backend: result.backend,
    config,
    result,
    provenanceHash,
    executionTimeMs: result.executionTimeMs,
    verified,
  };
}

/**
 * Create a composite receipt for the full drug-discovery pipeline.
 *
 * Chains docking receipt + ADMET receipt into a single provenance chain.
 * The composite hash ties both stages together so the pipeline is
 * end-to-end verifiable.
 */
export function createDrugDiscoveryReceipt(
  dockingReceipt: DockingReceipt,
  admetReceipt: AdmetReceipt,
): DrugDiscoveryReceipt {
  // Composite provenance: hash of (docking hash | ADMET hash)
  const compositeInput = `${dockingReceipt.provenanceHash}|${admetReceipt.provenanceHash}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < compositeInput.length; i++) {
    h ^= compositeInput.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const compositeProvenanceHash = (h >>> 0).toString(16).padStart(8, '0');

  // Drug-likeness assessment: combines docking affinity with ADMET safety
  const bestAffinity = dockingReceipt.result.bestAffinity ?? 0;
  const drugLikenessScore = admetReceipt.result.drugLikenessScore ?? 0;
  const lipinskiViolations = admetReceipt.result.lipinskiViolations ?? 0;
  const propertyCount = admetReceipt.result.predictions.length;
  const passes = drugLikenessScore > 0.5 && lipinskiViolations <= 1;

  const assessment: DrugLikenessAssessment = {
    bestAffinity,
    drugLikenessScore,
    lipinskiViolations,
    propertyCount,
    passes,
    ki_nm: dockingReceipt.result.poses[0]
      ? Math.exp(dockingReceipt.result.bestAffinity! * 1000 / (1.989e-3 * 298.15))
      : undefined,
    hitRate: dockingReceipt.result.poses.length > 0
      ? dockingReceipt.result.poses.filter(p => p.affinity <= -7.0).length / dockingReceipt.result.poses.length
      : undefined,
    summary: formatAssessmentSummary(bestAffinity, drugLikenessScore, lipinskiViolations, passes),
  };

  return {
    receiptId: `drug-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    issuedAt: new Date().toISOString(),
    pluginId: PLUGIN_ID,
    docking: dockingReceipt,
    admet: admetReceipt,
    compositeProvenanceHash,
    assessment,
  };
}

/**
 * Format a human-readable assessment summary.
 */
function formatAssessmentSummary(
  bestAffinity: number,
  drugLikenessScore: number,
  lipinskiViolations: number,
  passes: boolean,
): string {
  const affinityStr = bestAffinity < -7
    ? `strong binding (${bestAffinity.toFixed(1)} kcal/mol)`
    : bestAffinity < -5
      ? `moderate binding (${bestAffinity.toFixed(1)} kcal/mol)`
      : `weak binding (${bestAffinity.toFixed(1)} kcal/mol)`;

  const drugStr = passes
    ? `drug-like (score=${drugLikenessScore.toFixed(2)}, ${lipinskiViolations} Lipinski violations)`
    : `not drug-like (score=${drugLikenessScore.toFixed(2)}, ${lipinskiViolations} Lipinski violations)`;

  return `${affinityStr}, ${drugStr}`;
}

// ── Pipeline orchestration ───────────────────────────────────────────────────

/**
 * Run the full drug-discovery pipeline: docking → ADMET → receipt.
 *
 * This is the top-level entry point that chains all three stages together.
 * Each stage produces its own receipt, and the composite receipt ties them
 * together for end-to-end provenance.
 *
 * @param dockingConfig - Docking configuration (receptor, ligand, search box)
 * @param dockingResult - Docking result from a DockingSolver
 * @param admetConfig - ADMET configuration (SMILES, properties)
 * @param admetResult - ADMET prediction result
 * @returns Combined drug-discovery receipt
 */
export function runDrugDiscoveryPipeline(
  dockingConfig: DockingConfig,
  dockingResult: DockingResult,
  admetConfig: AdmetConfig,
  admetResult: AdmetResult,
): DrugDiscoveryReceipt {
  const dockingReceipt = createDockingReceipt(dockingConfig, dockingResult);
  const admetReceipt = createAdmetReceipt(admetConfig, admetResult);
  return createDrugDiscoveryReceipt(dockingReceipt, admetReceipt);
}

// ── Compile targets for receipts ─────────────────────────────────────────────

/**
 * Compile a DockingReceipt to HoloScript .holo format.
 */
export function compileDockingReceiptToHolo(receipt: DockingReceipt): string {
  const lines: string[] = [
    'composition "DockingReceipt" {',
    `  meta {`,
    `    receiptId: "${receipt.receiptId}"`,
    `    issuedAt: "${receipt.issuedAt}"`,
    `    pluginId: "${receipt.pluginId}"`,
    `    scale: "${receipt.scale}"`,
    `    backend: "${receipt.backend}"`,
    `    provenanceHash: "${receipt.provenanceHash}"`,
    `    verified: ${receipt.verified}`,
    `  }`,
    `  config @auto_dock {`,
    `    receptor: "${receipt.config.receptor}"`,
    `    ligand: "${receipt.config.ligand}"`,
    `    center: { x: ${receipt.config.centerX}, y: ${receipt.config.centerY}, z: ${receipt.config.centerZ} }`,
    `    size: { x: ${receipt.config.sizeX}, y: ${receipt.config.sizeY}, z: ${receipt.config.sizeZ} }`,
    `  }`,
    `  result @binding_affinity {`,
    `    bestAffinity: ${receipt.result.bestAffinity ?? 'null'}`,
    `    poseCount: ${receipt.result.poses.length}`,
    `    status: "${receipt.result.status}"`,
    `  }`,
    `}`,
  ];
  return lines.join('\n');
}

/**
 * Compile an AdmetReceipt to HoloScript .holo format.
 */
export function compileAdmetReceiptToHolo(receipt: AdmetReceipt): string {
  const lines: string[] = [
    'composition "AdmetReceipt" {',
    `  meta {`,
    `    receiptId: "${receipt.receiptId}"`,
    `    issuedAt: "${receipt.issuedAt}"`,
    `    pluginId: "${receipt.pluginId}"`,
    `    scale: "${receipt.scale}"`,
    `    backend: "${receipt.backend}"`,
    `    provenanceHash: "${receipt.provenanceHash}"`,
    `    verified: ${receipt.verified}`,
    `  }`,
    `  config @admet_prediction {`,
    `    smiles: "${receipt.config.smiles}"`,
    `  }`,
    `  result @admet_result {`,
    `    drugLikenessScore: ${receipt.result.drugLikenessScore ?? 'null'}`,
    `    lipinskiViolations: ${receipt.result.lipinskiViolations ?? 'null'}`,
    `    propertyCount: ${receipt.result.predictions.length}`,
    `    status: "${receipt.result.status}"`,
    `  }`,
    `}`,
  ];
  return lines.join('\n');
}

/**
 * Compile a DrugDiscoveryReceipt to HoloScript .holo format.
 *
 * This is the canonical output format for the drug-discovery pipeline:
 * a .holo composition that chains docking + ADMET + assessment into a
 * single verifiable artifact.
 */
export function compileDrugDiscoveryReceiptToHolo(receipt: DrugDiscoveryReceipt): string {
  const lines: string[] = [
    'composition "DrugDiscoveryReceipt" {',
    `  meta {`,
    `    receiptId: "${receipt.receiptId}"`,
    `    issuedAt: "${receipt.issuedAt}"`,
    `    pluginId: "${receipt.pluginId}"`,
    `    compositeProvenanceHash: "${receipt.compositeProvenanceHash}"`,
    `  }`,
    `  docking {`,
    `    receiptId: "${receipt.docking.receiptId}"`,
    `    provenanceHash: "${receipt.docking.provenanceHash}"`,
    `    backend: "${receipt.docking.backend}"`,
    `    bestAffinity: ${receipt.assessment.bestAffinity}`,
    `    poseCount: ${receipt.docking.result.poses.length}`,
    `  }`,
    `  admet {`,
    `    receiptId: "${receipt.admet.receiptId}"`,
    `    provenanceHash: "${receipt.admet.provenanceHash}"`,
    `    backend: "${receipt.admet.backend}"`,
    `    drugLikenessScore: ${receipt.assessment.drugLikenessScore}`,
    `    lipinskiViolations: ${receipt.assessment.lipinskiViolations}`,
    `    passes: ${receipt.assessment.passes}`,
    `  }`,
    `  assessment {`,
    `    passes: ${receipt.assessment.passes}`,
    `    drugLikenessScore: ${receipt.assessment.drugLikenessScore}`,
    `    bestAffinity: ${receipt.assessment.bestAffinity}`,
    `    summary: "${receipt.assessment.summary}"`,
    `  }`,
    `}`,
  ];
  return lines.join('\n');
}