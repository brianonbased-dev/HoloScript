/**
 * Blind A/B preference study engine for learned scene composition (Paper 20).
 *
 * Core invariants:
 * - Provenance is hidden from the rater (no labels, no metadata leakage).
 * - Order is randomized per trial (LSC left/right counterbalanced).
 * - Statistical aggregation uses binomial test + Wilson 95% CI.
 */

export interface Composition {
  source: 'lsc' | 'baseline';
  holoSource: string;
  previewUrl?: string;
}

export interface ABTrial {
  trialId: string;
  prompt: string;
  left: Composition;
  right: Composition;
  /** Which side holds the LSC composition (hidden from rater) */
  lscSide: 'left' | 'right';
  /** Rater's choice — null until recorded */
  chosenSide: 'left' | 'right' | null;
  /** 1–5 Likert strength, null until recorded */
  strength: number | null;
  /** Timestamp ISO, null until recorded */
  recordedAt: string | null;
}

export interface ABResult {
  trialCount: number;
  lscWins: number;
  baselineWins: number;
  preferenceRate: number;
  /** Wilson 95% confidence interval */
  ci95: [number, number];
  /** Exact binomial test p-value (one-sided, H0: p=0.5) */
  binomialP: number;
  /** Passes the ≥70% gate with 5pp safety margin (lower CI ≥0.65) */
  passesGate: boolean;
}

/** Remove any provenance markers from a .holo composition. */
export function stripProvenance(holoSource: string): string {
  return holoSource
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/# .*$/gm, '')
    .replace(/@generated\b.*$/gm, '')
    .replace(/@source\b.*$/gm, '')
    .replace(/@author\b.*$/gm, '')
    .replace(/@timestamp\b.*$/gm, '')
    .trim();
}

function makeTrialId(): string {
  return `trial_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Create a single blind A/B trial with randomized order. */
export function createTrial(
  prompt: string,
  lscComposition: string,
  baselineComposition: string
): ABTrial {
  const lscSide: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right';
  const left: Composition = {
    source: lscSide === 'left' ? 'lsc' : 'baseline',
    holoSource: stripProvenance(lscSide === 'left' ? lscComposition : baselineComposition),
  };
  const right: Composition = {
    source: lscSide === 'right' ? 'lsc' : 'baseline',
    holoSource: stripProvenance(lscSide === 'right' ? lscComposition : baselineComposition),
  };
  return {
    trialId: makeTrialId(),
    prompt,
    left,
    right,
    lscSide,
    chosenSide: null,
    strength: null,
    recordedAt: null,
  };
}

/** Record a rater's forced choice on a trial. */
export function recordChoice(
  trial: ABTrial,
  chosenSide: 'left' | 'right',
  strength: number
): ABTrial {
  if (trial.chosenSide !== null) {
    throw new Error(`Trial ${trial.trialId} already has a recorded choice`);
  }
  if (strength < 1 || strength > 5 || !Number.isFinite(strength)) {
    throw new Error('Strength must be an integer 1–5');
  }
  return {
    ...trial,
    chosenSide,
    strength,
    recordedAt: new Date().toISOString(),
  };
}

/** Exact one-sided binomial p-value (H0: p=0.5). */
function binomialPValue(k: number, n: number): number {
  let p = 0;
  for (let i = k; i <= n; i++) {
    p += binomialPMF(i, n);
  }
  return p;
}

function binomialPMF(k: number, n: number): number {
  return binomialCoeff(n, k) * Math.pow(0.5, n);
}

function binomialCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let res = 1;
  for (let i = 1; i <= k; i++) {
    res = (res * (n - k + i)) / i;
  }
  return res;
}

/** Wilson score 95% CI for a proportion. */
function wilsonCI(k: number, n: number): [number, number] {
  const z = 1.959963984540054;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const halfWidth = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / denom;
  return [Math.max(0, centre - halfWidth), Math.min(1, centre + halfWidth)];
}

/** Aggregate completed trials into statistical summary. */
export function aggregateResults(trials: ABTrial[]): ABResult {
  const completed = trials.filter((t) => t.chosenSide !== null);
  const n = completed.length;
  if (n === 0) {
    return {
      trialCount: 0,
      lscWins: 0,
      baselineWins: 0,
      preferenceRate: 0,
      ci95: [0, 0],
      binomialP: 1,
      passesGate: false,
    };
  }
  const lscWins = completed.filter((t) => t.chosenSide === t.lscSide).length;
  const baselineWins = n - lscWins;
  const rate = lscWins / n;
  const ci = wilsonCI(lscWins, n);
  const p = binomialPValue(lscWins, n);
  return {
    trialCount: n,
    lscWins,
    baselineWins,
    preferenceRate: rate,
    ci95: ci,
    binomialP: p,
    passesGate: ci[0] >= 0.65,
  };
}
