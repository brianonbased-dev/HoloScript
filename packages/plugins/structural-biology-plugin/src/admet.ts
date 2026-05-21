/**
 * @holoscript/structural-biology-plugin — ADMET prediction bridge.
 *
 * Absorption, Distribution, Metabolism, Excretion, and Toxicity (ADMET)
 * prediction traits and interfaces. Extends the structural-biology plugin
 * from structure (AlphaFold) to function (drug-likeness and safety).
 *
 * ADMET models predict whether a molecule is likely to be a viable drug
 * candidate BEFORE expensive synthesis and testing. This bridge wires into
 * the provenance chain so that ADMET predictions carry the same plugin-identity
 * provenance as protein/ligand objects.
 *
 * Backend options:
 *   - 'rdkit': Rule-based and ML models via RDKit (Python, fast, well-validated)
 *   - 'admetlab': ADMETlab 3.0 web service (comprehensive, 47 endpoints)
 *   - 'local-ml': On-device ONNX/Rust ML models (offline, latency-critical)
 *
 * @module admet
 */

// ── ADMET property names ────────────────────────────────────────────────────

export const ADMET_PROPERTIES = [
  // Absorption
  'caco2_permeability',       // Caco-2 cell permeability (logPapp)
  'hia',                      // Human intestinal absorption (%)
  'pgp_substrate',            // P-glycoprotein substrate (binary)
  'pgp_inhibitor',            // P-glycoprotein inhibitor (binary)
  'bbb_permeability',         // Blood-brain barrier penetration (binary)
  'cns_permeability',         // CNS permeability (binary)
  // Distribution
  'vdss',                     // Volume of distribution at steady state (L/kg)
  'fraction_unbound',         // Fraction unbound in plasma (Fu)
  'ppb',                      // Plasma protein binding (%)
  // Metabolism
  'cyp2d6_substrate',        // CYP2D6 substrate (binary)
  'cyp3a4_substrate',        // CYP3A4 substrate (binary)
  'cyp1a2_inhibitor',        // CYP1A2 inhibitor (binary)
  'cyp2c19_inhibitor',       // CYP2C19 inhibitor (binary)
  'cyp2c9_inhibitor',        // CYP2C9 inhibitor (binary)
  'cyp2d6_inhibitor',        // CYP2D6 inhibitor (binary)
  'cyp3a4_inhibitor',        // CYP3A4 inhibitor (binary)
  'cyp2d6_inhibitor_v2',     // CYP2D6 inhibitor v2 (binary, updated model)
  // Excretion
  'half_life',                // Elimination half-life (hours)
  'clearance',                // Hepatic clearance (mL/min/kg)
  // Toxicity
  'hht',                     // Human hepatotoxicity (binary)
  'ames',                    // Ames mutagenicity (binary)
  'dili',                    // Drug-induced liver injury (binary)
  'skin_sensitization',      // Skin sensitization (binary)
  'carcinogenesis',          // Carcinogenicity (binary)
  'rat_oral_ld50',           // Rat oral LD50 (mol/kg)
] as const;

export type AdmetProperty = (typeof ADMET_PROPERTIES)[number];

// ── ADMET backends ────────────────────────────────────────────────────────────

export type AdmetBackend = 'rdkit' | 'admetlab' | 'local-ml';

// ── ADMET configuration ───────────────────────────────────────────────────────

export interface AdmetConfig {
  /** Prediction backend */
  backend: AdmetBackend;
  /** Molecule in SMILES notation */
  smiles: string;
  /** Which ADMET properties to predict (empty = all) */
  properties?: AdmetProperty[];
  /** Confidence threshold for binary predictions (0.0-1.0) */
  confidenceThreshold?: number;
  /** Include uncertainty estimates */
  includeUncertainty?: boolean;
}

// ── ADMET result ───────────────────────────────────────────────────────────────

export interface AdmetPrediction {
  /** ADMET property name */
  property: AdmetProperty;
  /** Predicted value (numeric) or probability (binary) */
  value: number;
  /** Unit of measurement (e.g., 'logPapp', '%', 'binary', 'L/kg') */
  unit: string;
  /** Prediction confidence (0.0-1.0) */
  confidence: number;
  /** Lower bound of 95% CI (if includeUncertainty) */
  lower?: number;
  /** Upper bound of 95% CI (if includeUncertainty) */
  upper?: number;
  /** Model version */
  modelVersion: string;
}

export interface AdmetResult {
  status: 'success' | 'failed';
  /** Input SMILES */
  smiles: string;
  /** Backend used */
  backend: AdmetBackend;
  /** Individual property predictions */
  predictions: AdmetPrediction[];
  /** Overall drug-likeness score (0.0-1.0, heuristic composite) */
  drugLikenessScore?: number;
  /** Lipinski Rule of 5 compliance */
  lipinskiViolations?: number;
  /** Execution time in milliseconds */
  executionTimeMs?: number;
  /** Error message if status is 'failed' */
  error?: string;
}

// ── ADMET trait interface ──────────────────────────────────────────────────────

/**
 * @admet_prediction trait — Predict ADMET properties for a molecule.
 *
 * This trait connects to core's scientific-computing trait namespace and
 * represents a request to compute absorption, distribution, metabolism,
 * excretion, and toxicity properties from a molecular structure.
 */
export interface AdmetPredictionTrait {
  trait: 'admet_prediction';
  /** Molecule in SMILES notation */
  smiles: string;
  /** Which properties to predict (empty = all) */
  properties?: AdmetProperty[];
  /** Backend to use */
  backend?: AdmetBackend;
  /** Confidence threshold for binary predictions */
  confidenceThreshold?: number;
}

/**
 * @admet_result trait — ADMET prediction result for provenance tracking.
 *
 * Carries the predicted ADMET properties alongside plugin identity so that
 * downstream consumers can verify which plugin produced the prediction.
 */
export interface AdmetResultTrait {
  trait: 'admet_result';
  /** Input SMILES */
  smiles: string;
  /** Drug-likeness composite score */
  drugLikenessScore: number;
  /** Number of Lipinski violations */
  lipinskiViolations: number;
  /** Number of properties predicted */
  propertyCount: number;
  /** Backend used */
  backend: AdmetBackend;
  /** Pass/fail summary — true if drug-likeness > 0.5 and lipinskiViolations <= 1 */
  passes: boolean;
}

// ── Drug-likeness heuristics ───────────────────────────────────────────────────

/**
 * Compute Lipinski Rule of 5 violations for a SMILES string.
 *
 * This is a simplified heuristic count. A full implementation would use
 * RDKit to compute exact molecular weight, logP, HBD, HBA from the SMILES.
 * Here we count violations based on estimated properties.
 *
 * Lipinski rules:
 *   1. MW <= 500 Da
 *   2. logP <= 5
 *   3. HBD <= 5
 *   4. HBA <= 10
 *
 * Returns the number of rules violated (0-4).
 */
export function countLipinskiViolations(smiles: string): number {
  // Heuristic: estimate from SMILES length and atom composition.
  // A production implementation would use RDKit or an on-device model.
  // This provides a reasonable placeholder that counts real violations
  // for the common case.

  let violations = 0;

  // Heuristic molecular weight: count heavy atoms * ~13 Da average
  // (simplified from periodic table average across drug-like space)
  const heavyAtomCount = (smiles.match(/[A-Z]/g) ?? []).length;
  const estimatedMW = heavyAtomCount * 13;
  if (estimatedMW > 500) violations++;

  // Heuristic logP: count C atoms (hydrophobic) vs N,O atoms (hydrophilic)
  const carbonCount = (smiles.match(/C/g) ?? []).length;
  const polarAtomCount = (smiles.match(/[NO]/g) ?? []).length;
  const estimatedLogP = carbonCount * 0.54 - polarAtomCount * 1.0;
  if (estimatedLogP > 5) violations++;

  // HBD: count explicit OH and NH groups
  const hbdCount = (smiles.match(/OH|NH/g) ?? []).length;
  if (hbdCount > 5) violations++;

  // HBA: count N and O atoms
  if (polarAtomCount > 10) violations++;

  return violations;
}

/**
 * Compute a heuristic drug-likeness score (0.0-1.0) from ADMET predictions.
 *
 * Weighted composite of:
 *   - Lipinski compliance (0 violations → 1.0, each violation → -0.2)
 *   - BBB permeability (if predicted, favorable → +0.15)
 *   - HIA (if predicted, >80% → +0.1)
 *   - Toxicity flags (any positive → -0.25 per flag)
 *   - Half-life in therapeutic range (5-24h → +0.1)
 */
export function computeDrugLikeness(predictions: AdmetPrediction[], lipinskiViolations: number): number {
  let score = 1.0;

  // Lipinski penalty
  score -= lipinskiViolations * 0.2;

  for (const p of predictions) {
    // BBB permeability (binary, probability)
    if (p.property === 'bbb_permeability' && p.value < 0.5) {
      score -= 0.15;
    }
    // HIA
    if (p.property === 'hia' && p.value < 80) {
      score -= 0.1;
    }
    // Toxicity flags
    if (
      (p.property === 'ames' || p.property === 'hht' || p.property === 'dili') &&
      p.value > 0.5
    ) {
      score -= 0.25;
    }
    // Half-life in therapeutic range
    if (p.property === 'half_life' && p.value >= 5 && p.value <= 24) {
      score += 0.1;
    }
  }

  return Math.max(0, Math.min(1, score));
}

// ── Backend selection ─────────────────────────────────────────────────────────

/**
 * Select the appropriate ADMET backend based on question type.
 *
 * - 'rdkit': Fast, rule-based + ML, good for screening
 * - 'admetlab': Comprehensive 47-endpoint prediction, web service
 * - 'local-ml': On-device, offline, latency-critical
 */
export function selectAdmetBackend(questionType: string): AdmetBackend {
  const q = questionType.toLowerCase();

  if (q.includes('comprehensive') || q.includes('full') || q.includes('admetlab')) {
    return 'admetlab';
  }

  if (q.includes('offline') || q.includes('local') || q.includes('latency') || q.includes('edge')) {
    return 'local-ml';
  }

  // Default: RDKit — fast, well-validated, good for screening
  return 'rdkit';
}

// ── Provenance integration ──────────────────────────────────────────────────────

/**
 * Compute a provenance anchor for an ADMET prediction, linking it back to the
 * structural-biology plugin identity and the input SMILES.
 */
export function admetProvenance(result: AdmetResult): string {
  let h = 0x811c9dc5;
  const fnv = (s: string) => {
    h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };

  const head = `structural-biology@0.1.0|admet|${result.backend}`;
  const smilesHash = fnv(result.smiles);
  const predictionKey = `props:${result.predictions.length}`;
  const scoreKey = `dl:${result.drugLikenessScore?.toFixed(2) ?? 'na'}`;
  const lipinskiKey = `lipinski:${result.lipinskiViolations ?? 'na'}`;

  return fnv(`${head}|smiles:${smilesHash}|${predictionKey}|${scoreKey}|${lipinskiKey}`);
}

// ── Compile targets ────────────────────────────────────────────────────────────

export type AdmetCompileFormat = 'csv' | 'json' | 'sdf' | 'holo';

export interface AdmetCompileOptions {
  format?: AdmetCompileFormat;
}

/**
 * Compile ADMET traits into a target representation.
 *
 * - `csv`  — CSV table of property predictions (default)
 * - `json` — JSON payload for API consumption
 * - `sdf`  — MDL SDF with ADMET annotations
 * - `holo` — HoloScript .holo composition
 */
export function compileAdmet(
  traits: Array<AdmetPredictionTrait | AdmetResultTrait>,
  opts: AdmetCompileOptions = {},
): string {
  const format = opts.format ?? 'csv';

  switch (format) {
    case 'csv':
      return compileAdmetToCsv(traits);
    case 'json':
      return compileAdmetToJson(traits);
    case 'sdf':
      return compileAdmetToSdf(traits);
    case 'holo':
      return compileAdmetToHolo(traits);
    default:
      throw new Error(`Unsupported ADMET format: ${format as string}`);
  }
}

function compileAdmetToCsv(traits: Array<AdmetPredictionTrait | AdmetResultTrait>): string {
  const rows: string[] = ['trait,smiles,backend,properties,drugLikenessScore,lipinskiViolations,passes'];

  for (const t of traits) {
    if (t.trait === 'admet_prediction') {
      const props = t.properties?.join(';') ?? 'all';
      rows.push(`admet_prediction,${t.smiles},${t.backend ?? 'rdkit'},${props},,`);
    } else if (t.trait === 'admet_result') {
      rows.push(
        `admet_result,${t.smiles},${t.backend},${t.propertyCount},${t.drugLikenessScore},${t.lipinskiViolations},${t.passes}`,
      );
    }
  }

  return rows.join('\n');
}

function compileAdmetToJson(traits: Array<AdmetPredictionTrait | AdmetResultTrait>): string {
  return JSON.stringify(traits, null, 2);
}

function compileAdmetToSdf(traits: Array<AdmetPredictionTrait | AdmetResultTrait>): string {
  const lines: string[] = [];

  for (const t of traits) {
    lines.push('molecule');
    lines.push('  HoloScript/ADMET');
    lines.push('');
    lines.push('  0  0  0  0  0  0  0  0  0  0  0 V2000');
    lines.push('M  END');

    if (t.trait === 'admet_result') {
      lines.push(`>  <admet.drugLikenessScore>`);
      lines.push(`${t.drugLikenessScore}`);
      lines.push('');
      lines.push(`>  <admet.lipinskiViolations>`);
      lines.push(`${t.lipinskiViolations}`);
      lines.push('');
      lines.push(`>  <admet.passes>`);
      lines.push(`${t.passes}`);
      lines.push('');
    }

    lines.push('$$$$');
  }

  return lines.join('\n');
}

function compileAdmetToHolo(traits: Array<AdmetPredictionTrait | AdmetResultTrait>): string {
  const lines: string[] = ['composition "AdmetScene" {'];

  for (const t of traits) {
    if (t.trait === 'admet_prediction') {
      lines.push(`  object "AdmetPrediction" @admet_prediction {`);
      lines.push(`    smiles: "${t.smiles}"`);
      if (t.backend) lines.push(`    backend: "${t.backend}"`);
      if (t.properties && t.properties.length > 0) {
        lines.push(`    properties: [${t.properties.map((p) => `"${p}"`).join(', ')}]`);
      }
      lines.push('  }');
    } else if (t.trait === 'admet_result') {
      lines.push(`  object "AdmetResult" @admet_result {`);
      lines.push(`    smiles: "${t.smiles}"`);
      lines.push(`    drugLikenessScore: ${t.drugLikenessScore}`);
      lines.push(`    lipinskiViolations: ${t.lipinskiViolations}`);
      lines.push(`    propertyCount: ${t.propertyCount}`);
      lines.push(`    backend: "${t.backend}"`);
      lines.push(`    passes: ${t.passes}`);
      lines.push('  }');
    }
  }

  lines.push('}');
  return lines.join('\n');
}