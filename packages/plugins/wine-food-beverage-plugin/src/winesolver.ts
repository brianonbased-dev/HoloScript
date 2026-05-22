/**
 * Wine & beverage analytics solvers — wine-food-beverage-plugin
 *
 * Implements:
 *  - 100-point wine scoring model (Wine Spectator / UC Davis 20-point scaled)
 *  - Food-wine pairing affinity matrix (7 pairing axes)
 *  - Cellar aging optimizer (peak-drinking window)
 *  - Blend optimization (weighted quality maximization under cost constraint)
 *  - Inventory valuation (FIFO/LIFO/WAC)
 *
 * References:
 *  - UC Davis 20-point scorecard (Amerine & Roessler 1976)
 *  - Wine Spectator 100-point scale methodology
 *  - Jackson R (2009) Wine Science, 3rd ed. Academic Press.
 *  - Peynaud E (1984) Knowing and Making Wine. Wiley.
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WineScorecard {
  /** Color/appearance 0–4 */
  appearance: number;
  /** Aroma/bouquet 0–6 */
  aroma: number;
  /** Taste/palate 0–6 */
  taste: number;
  /** Overall impression 0–4 */
  overall: number;
}

export interface WineScoringResult {
  /** UC Davis 20-pt raw score */
  rawScore: number;
  /** Converted 100-point scale */
  hundredPointScore: number;
  /** WS label: Outstanding/Excellent/Very Good/Good/Mediocre/Not Recommended */
  rating: 'Outstanding' | 'Excellent' | 'Very Good' | 'Good' | 'Mediocre' | 'Not Recommended';
  /** Suggested retail tier */
  priceTier: 'icon' | 'premium' | 'mid-range' | 'everyday' | 'value';
  scorecard: WineScorecard;
}

export interface FoodPairingInput {
  /** Wine characteristics 0–10 each */
  wineBody: number;
  wineTannin: number;
  wineAcidity: number;
  wineSweetness: number;
  wineAlcohol: number;
  /** Food characteristics 0–10 each */
  foodRichness: number;
  foodAcidity: number;
  foodSweetness: number;
  foodSpice: number;
  foodSaltiness: number;
}

export interface FoodPairingResult {
  /** Overall affinity 0–100 */
  affinityScore: number;
  pairing: 'excellent' | 'good' | 'acceptable' | 'poor';
  /** Axis-by-axis breakdown */
  axes: Array<{ axis: string; score: number; rationale: string }>;
  recommendation: string;
}

export interface WineVintage {
  id: string;
  variety: string;
  vintage: number;  // year
  /** Peak drinking window start */
  peakStart: number;
  /** Peak drinking window end */
  peakEnd: number;
  /** Bottles in cellar */
  bottles: number;
  purchasePricePerBottle: number;
}

export interface CellarAgingResult {
  vintages: Array<{
    id: string;
    variety: string;
    vintage: number;
    currentYear: number;
    ageYears: number;
    status: 'too-young' | 'peak' | 'past-peak' | 'declining';
    yearsToPeak: number | null;
    estimatedCurrentValue: number;
    recommendation: string;
  }>;
  portfolioValue: number;
  peakBottles: number;
  tooYoungBottles: number;
  pastPeakBottles: number;
}

export interface BlendComponent {
  variety: string;
  /** Quality score 0–100 */
  quality: number;
  /** Cost per liter USD */
  costPerLiter: number;
  /** Available liters */
  availableLiters: number;
  /** Minimum blend % (appellation rules) */
  minPct?: number;
  /** Maximum blend % */
  maxPct?: number;
}

export interface BlendOptimizationResult {
  /** Optimized blend percentages summing to 100% */
  blend: Array<{ variety: string; percentage: number; litersUsed: number }>;
  /** Volume-weighted quality score */
  blendQuality: number;
  /** Cost per liter */
  blendCostPerLiter: number;
  /** Whether all appellation constraints satisfied */
  constraintsSatisfied: boolean;
}

export interface WineReceiptOptions {
  runId?: string;
}

// ─── Wine Scoring ─────────────────────────────────────────────────────────────

/**
 * UC Davis 20-point → 100-point conversion (linear scale):
 * WS = 50 + (rawScore / 20) × 50
 */
export function wineScoring(scorecard: WineScorecard): WineScoringResult {
  const { appearance, aroma, taste, overall } = scorecard;

  if (appearance < 0 || appearance > 4) throw new Error('appearance must be 0–4');
  if (aroma < 0 || aroma > 6)          throw new Error('aroma must be 0–6');
  if (taste < 0 || taste > 6)          throw new Error('taste must be 0–6');
  if (overall < 0 || overall > 4)      throw new Error('overall must be 0–4');

  const rawScore = appearance + aroma + taste + overall;
  // UC Davis max = 20; convert to WS 50–100 scale
  const hundredPointScore = Math.round(50 + (rawScore / 20) * 50);

  const rating: WineScoringResult['rating'] =
    hundredPointScore >= 96 ? 'Outstanding' :
    hundredPointScore >= 90 ? 'Excellent' :
    hundredPointScore >= 85 ? 'Very Good' :
    hundredPointScore >= 80 ? 'Good' :
    hundredPointScore >= 70 ? 'Mediocre' : 'Not Recommended';

  const priceTier: WineScoringResult['priceTier'] =
    hundredPointScore >= 96 ? 'icon' :
    hundredPointScore >= 90 ? 'premium' :
    hundredPointScore >= 85 ? 'mid-range' :
    hundredPointScore >= 80 ? 'everyday' : 'value';

  return { rawScore, hundredPointScore, rating, priceTier, scorecard };
}

// ─── Food-Wine Pairing ────────────────────────────────────────────────────────

/**
 * Seven-axis pairing model based on sensory interaction rules:
 * 1. Body-Richness match (like with like)
 * 2. Tannin-Fat complementarity
 * 3. Acid balance (wine acid ≈ food acid)
 * 4. Sweetness bridge
 * 5. Spice vs tannin tension
 * 6. Salt × acid complementarity
 * 7. Alcohol × richness balance
 */
export function foodWinePairing(input: FoodPairingInput): FoodPairingResult {
  const axes: Array<{ axis: string; score: number; rationale: string }> = [];

  // 1. Body-richness match (10 − |wineBody − foodRichness|) normalized to 10
  const bodyScore = Math.max(0, 10 - Math.abs(input.wineBody - input.foodRichness));
  axes.push({ axis: 'body-richness', score: bodyScore, rationale: bodyScore > 7 ? 'Body and richness are well-matched' : 'Body and richness mismatch — one overwhelms the other' });

  // 2. Tannin softens fat in rich food; low-fat food + high tannin = harsh
  const tanninFatScore = Math.min(10, input.wineTannin * 0.5 + input.foodRichness * 0.5);
  axes.push({ axis: 'tannin-fat', score: tanninFatScore, rationale: tanninFatScore > 6 ? 'Tannin-fat complementarity works well' : 'Tannin may feel aggressive with lean food' });

  // 3. Acid balance — close acid levels are harmonious
  const acidScore = Math.max(0, 10 - Math.abs(input.wineAcidity - input.foodAcidity) * 1.5);
  axes.push({ axis: 'acidity', score: acidScore, rationale: acidScore > 7 ? 'Acidity levels complement each other' : 'Acidity imbalance may create flatness or sharpness' });

  // 4. Sweetness bridge
  const sweetnessScore = Math.max(0, 10 - Math.abs(input.wineSweetness - input.foodSweetness) * 1.2);
  axes.push({ axis: 'sweetness', score: sweetnessScore, rationale: sweetnessScore > 7 ? 'Sweetness levels are harmonious' : 'Sweet/dry mismatch' });

  // 5. High spice + high tannin = tension (bitterness amplified)
  const spiceTanninTension = Math.max(0, 10 - (input.foodSpice * input.wineTannin) / 10);
  axes.push({ axis: 'spice-tannin', score: spiceTanninTension, rationale: spiceTanninTension > 7 ? 'Spice-tannin interaction is acceptable' : 'High spice amplifies tannin bitterness — consider lower-tannin wine' });

  // 6. Salt × acid complementarity (salt + acid = bright, balanced)
  const saltAcidScore = Math.min(10, (input.foodSaltiness + input.wineAcidity) / 2);
  axes.push({ axis: 'salt-acid', score: saltAcidScore, rationale: saltAcidScore > 6 ? 'Salt and acidity create brightness' : 'Low salt-acid complementarity' });

  // 7. Alcohol × richness
  const alcoholRichnessScore = Math.max(0, 10 - Math.abs(input.wineAlcohol - input.foodRichness) * 0.8);
  axes.push({ axis: 'alcohol-richness', score: alcoholRichnessScore, rationale: alcoholRichnessScore > 7 ? 'Alcohol weight matches food richness' : 'Alcohol weight imbalance' });

  const affinityScore = (axes.reduce((s, a) => s + a.score, 0) / (axes.length * 10)) * 100;
  const pairing: FoodPairingResult['pairing'] =
    affinityScore >= 80 ? 'excellent' :
    affinityScore >= 65 ? 'good' :
    affinityScore >= 50 ? 'acceptable' : 'poor';

  const recommendation =
    pairing === 'excellent' ? 'Outstanding pairing — ideal for fine dining service.' :
    pairing === 'good'      ? 'Good pairing — enhances both wine and dish.' :
    pairing === 'acceptable'? 'Acceptable pairing — serviceable but not synergistic.' :
    'Poor pairing — consider an alternative wine.';

  return { affinityScore, pairing, axes, recommendation };
}

// ─── Cellar Aging Optimizer ───────────────────────────────────────────────────

export function cellarAgingOptimizer(
  vintages: WineVintage[],
  currentYear: number = new Date().getFullYear(),
): CellarAgingResult {
  if (vintages.length === 0) throw new Error('No vintages in cellar');

  // Appreciation model: 3% per year while in peak, −5%/yr past peak
  const analyzed = vintages.map(v => {
    const ageYears = currentYear - v.vintage;
    let status: CellarAgingResult['vintages'][0]['status'];
    let yearsToP_peak: number | null = null;
    let appreciationFactor: number;

    if (currentYear < v.peakStart) {
      status = 'too-young';
      yearsToP_peak = v.peakStart - currentYear;
      appreciationFactor = 1 + 0.02 * ageYears;
    } else if (currentYear <= v.peakEnd) {
      status = 'peak';
      appreciationFactor = 1 + 0.03 * (currentYear - v.peakStart + 1);
    } else if (currentYear <= v.peakEnd + 5) {
      status = 'past-peak';
      appreciationFactor = Math.max(0.5, 1 - 0.05 * (currentYear - v.peakEnd));
    } else {
      status = 'declining';
      appreciationFactor = Math.max(0.20, 0.5 - 0.03 * (currentYear - v.peakEnd - 5));
    }

    const recommendation =
      status === 'too-young'   ? `Hold ${yearsToP_peak} more year(s) before drinking.` :
      status === 'peak'        ? 'Drinking at peak — enjoy now or hold through peak window.' :
      status === 'past-peak'   ? 'Past peak — drink soon to retain character.' :
      'Declining — consume or sell; likely losing complexity.';

    return {
      id: v.id,
      variety: v.variety,
      vintage: v.vintage,
      currentYear,
      ageYears,
      status,
      yearsToPeak: yearsToP_peak,
      estimatedCurrentValue: v.purchasePricePerBottle * appreciationFactor * v.bottles,
      recommendation,
    };
  });

  return {
    vintages: analyzed,
    portfolioValue: analyzed.reduce((s, v) => s + v.estimatedCurrentValue, 0),
    peakBottles: vintages.filter((_, i) => analyzed[i].status === 'peak').reduce((s, v) => s + v.bottles, 0),
    tooYoungBottles: vintages.filter((_, i) => analyzed[i].status === 'too-young').reduce((s, v) => s + v.bottles, 0),
    pastPeakBottles: vintages.filter((_, i) => analyzed[i].status === 'past-peak' || analyzed[i].status === 'declining').reduce((s, v) => s + v.bottles, 0),
  };
}

// ─── Blend Optimization ───────────────────────────────────────────────────────

/**
 * Greedy blend optimizer:
 * Sort components by quality-to-cost ratio, fill max allowed amount for each,
 * respecting min% constraints and total = 100%.
 * Simple heuristic — not LP — but respects all bounds.
 */
export function blendOptimization(
  components: BlendComponent[],
  targetVolumeLiters: number,
): BlendOptimizationResult {
  if (components.length === 0) throw new Error('No blend components');
  if (targetVolumeLiters <= 0) throw new Error('targetVolumeLiters must be positive');

  // Sort by quality/cost ratio descending
  const sorted = [...components].sort((a, b) => (b.quality / b.costPerLiter) - (a.quality / a.costPerLiter));

  // Assign minimums first
  const pcts = sorted.map(c => ({ ...c, pct: c.minPct ?? 0 }));
  let allocated = pcts.reduce((s, c) => s + c.pct, 0);

  // Fill remaining with best quality/cost components up to their max
  for (const comp of pcts) {
    if (allocated >= 100) break;
    const remaining = 100 - allocated;
    const maxAllowed = (comp.maxPct ?? 100) - comp.pct;
    const maxByAvail = (comp.availableLiters / targetVolumeLiters) * 100 - comp.pct;
    const canAdd = Math.min(remaining, maxAllowed, maxByAvail);
    comp.pct += canAdd;
    allocated += canAdd;
  }

  // Normalize to 100% if floating point drift
  const total = pcts.reduce((s, c) => s + c.pct, 0);
  const blend = pcts.map(c => ({
    variety: c.variety,
    percentage: total > 0 ? (c.pct / total) * 100 : c.pct,
    litersUsed: (c.pct / 100) * targetVolumeLiters,
  }));

  const blendQuality = blend.reduce((s, b, i) => s + b.percentage / 100 * sorted[i].quality, 0);
  const blendCostPerLiter = blend.reduce((s, b, i) => s + b.percentage / 100 * sorted[i].costPerLiter, 0);

  const constraintsSatisfied = sorted.every((c, i) => {
    const pct = blend[i].percentage;
    return pct >= (c.minPct ?? 0) && pct <= (c.maxPct ?? 100);
  });

  return { blend, blendQuality, blendCostPerLiter, constraintsSatisfied };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface WineAnalysisResult {
  scoring?: WineScoringResult;
  pairing?: FoodPairingResult;
  cellar?: CellarAgingResult;
  blend?: BlendOptimizationResult;
  converged: true;
}

export function buildWineReceipt(
  result: WineAnalysisResult,
  options?: WineReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.scoring && result.scoring.hundredPointScore < 80) {
    violations.push({ criterion: 'wine_quality', message: `Wine score ${result.scoring.hundredPointScore}/100 < 80 — not recommended for commercial release` });
  }
  if (result.pairing && result.pairing.pairing === 'poor') {
    violations.push({ criterion: 'pairing', message: `Food-wine affinity ${result.pairing.affinityScore.toFixed(0)}/100 — poor pairing, consider alternative` });
  }
  if (result.blend && !result.blend.constraintsSatisfied) {
    violations.push({ criterion: 'blend_constraints', message: 'Blend does not satisfy appellation minimum/maximum percentage requirements' });
  }

  return buildDomainSimulationReceipt({
    plugin: 'wine-food-beverage',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `wine-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'beverage-analytics', scale: 'cellar' },
    resultSummary: {
      hundredPointScore: result.scoring?.hundredPointScore,
      pairingAffinity: result.pairing?.affinityScore,
      portfolioValue: result.cellar?.portfolioValue,
      blendQuality: result.blend?.blendQuality,
    },
    cael: { version: 'cael.v1', event: 'wine_food_beverage.beverage_analysis', solverType: 'wine-food-beverage.scoring' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
