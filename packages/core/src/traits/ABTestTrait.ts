/**
 * ABTest Trait
 *
 * A/B testing framework for spatial computing scenes with:
 * - Deterministic variant assignment (hash-based, no PII required)
 * - Multiple concurrent experiments
 * - Statistical significance calculation (chi-squared and z-test)
 * - Conversion tracking with arbitrary goal events
 * - Multi-armed bandit mode for adaptive allocation
 * - Privacy-respecting defaults (anonymous participant IDs)
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Allocation strategy for variant assignment */
type AllocationStrategy = 'equal' | 'weighted' | 'bandit';

/** Statistical test type */
type StatisticalTest = 'chi_squared' | 'z_test';

/** Experiment status */
type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'archived';

/** A single experiment variant */
export interface ABVariant {
  id: string;
  name: string;
  weight: number; // 0-1 allocation weight (used in weighted strategy)
  config: Record<string, unknown>; // Variant-specific configuration overrides
}

/** Conversion goal definition */
export interface ConversionGoal {
  id: string;
  name: string;
  event_type: string; // Event to listen for
  value_key?: string; // Optional key to extract numeric value from event
  minimum_value?: number; // Minimum value threshold for conversion
}

/** Per-variant statistics */
export interface VariantStats {
  variantId: string;
  participantCount: number;
  conversionCounts: Record<string, number>; // goalId -> count
  conversionValues: Record<string, number>; // goalId -> sum of values
  conversionRates: Record<string, number>; // goalId -> rate
  avgTimeToConversion: Record<string, number>; // goalId -> avg ms
  firstExposureTime: number;
  lastConversionTime: number;
}

/** Statistical significance result */
export interface SignificanceResult {
  goalId: string;
  controlVariantId: string;
  treatmentVariantId: string;
  testType: StatisticalTest;
  testStatistic: number;
  pValue: number;
  isSignificant: boolean; // p < alpha
  confidenceLevel: number; // 1 - alpha
  uplift: number; // Relative improvement (treatment - control) / control
  controlRate: number;
  treatmentRate: number;
  sampleSizeControl: number;
  sampleSizeTreatment: number;
  minimumDetectableEffect: number;
  requiredSampleSize: number; // Estimated samples needed for significance
}

/** Experiment definition */
export interface Experiment {
  id: string;
  name: string;
  description: string;
  variants: ABVariant[];
  goals: ConversionGoal[];
  allocation_strategy: AllocationStrategy;
  status: ExperimentStatus;
  control_variant_id: string;
  start_time: number;
  end_time?: number;
}

// =============================================================================
// STATE
// =============================================================================

interface ABTestState {
  experiments: Map<string, Experiment>;
  variantStats: Map<string, Map<string, VariantStats>>; // experimentId -> variantId -> stats
  participantAssignments: Map<string, Map<string, string>>; // participantId -> experimentId -> variantId
  participantExposures: Map<string, Map<string, number>>; // participantId -> experimentId -> exposureTime
  banditRewards: Map<string, Map<string, { successes: number; failures: number }>>; // experimentId -> variantId -> rewards
  localParticipantId: string;
  isActive: boolean;
}

// =============================================================================
// CONFIG
// =============================================================================

export interface ABTestConfig {
  /** Enable/disable A/B testing */
  enabled: boolean;

  /** Default allocation strategy */
  default_strategy: AllocationStrategy;

  /** Statistical significance threshold (alpha) */
  alpha: number; // Default 0.05 for 95% confidence

  /** Minimum sample size before significance testing */
  min_sample_size: number;

  /** Minimum detectable effect size (used in sample size estimation) */
  min_detectable_effect: number;

  /** Statistical power (1 - beta) for sample size estimation */
  statistical_power: number;

  /** Auto-complete experiments when significance is reached */
  auto_complete: boolean;

  /** Maximum experiment duration in ms (0 = unlimited) */
  max_duration: number;

  /** Privacy mode: anonymous generates local IDs, no PII ever */
  privacy_mode: 'anonymous' | 'pseudonymous';

  /** Enable multi-armed bandit adaptive allocation */
  enable_bandit: boolean;

  /** Bandit exploration rate (epsilon for epsilon-greedy) */
  bandit_epsilon: number;

  /** Custom tags for metrics attribution */
  custom_tags: Record<string, string>;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Deterministic hash-based variant assignment.
 * Uses a simple string hash (djb2) to ensure same participant always gets same variant.
 * No PII needed - participantId can be any anonymous identifier.
 */
function hashAssign(participantId: string, experimentId: string, variants: ABVariant[], strategy: AllocationStrategy): string {
  if (variants.length === 0) return '';
  if (variants.length === 1) return variants[0].id;

  // djb2 hash
  const key = `${participantId}:${experimentId}`;
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = ((hash << 5) + hash + key.charCodeAt(i)) | 0;
  }
  const bucket = Math.abs(hash) / 2147483647; // Normalize to 0-1

  if (strategy === 'equal') {
    const index = Math.floor(bucket * variants.length);
    return variants[Math.min(index, variants.length - 1)].id;
  }

  // Weighted assignment
  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  let cumWeight = 0;
  for (const variant of variants) {
    cumWeight += variant.weight / totalWeight;
    if (bucket <= cumWeight) {
      return variant.id;
    }
  }
  return variants[variants.length - 1].id;
}

/**
 * Thompson Sampling for multi-armed bandit.
 * Uses Beta distribution sampling for each variant.
 */
function banditSelect(
  variants: ABVariant[],
  rewards: Map<string, { successes: number; failures: number }>,
  epsilon: number
): string {
  if (variants.length === 0) return '';

  // Epsilon-greedy exploration
  if (Math.random() < epsilon) {
    return variants[Math.floor(Math.random() * variants.length)].id;
  }

  // Thompson Sampling with Beta distribution approximation
  let bestScore = -1;
  let bestVariantId = variants[0].id;

  for (const variant of variants) {
    const r = rewards.get(variant.id) || { successes: 1, failures: 1 };
    // Sample from Beta(successes + 1, failures + 1) using approximation
    const alpha = r.successes + 1;
    const beta = r.failures + 1;
    // Box-Muller approximation of Beta distribution
    const mean = alpha / (alpha + beta);
    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const stddev = Math.sqrt(variance);
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    const sample = Math.max(0, Math.min(1, mean + z * stddev));

    if (sample > bestScore) {
      bestScore = sample;
      bestVariantId = variant.id;
    }
  }

  return bestVariantId;
}

/**
 * Compute z-test for two proportions (conversion rates).
 * Returns z-statistic and p-value.
 */
function zTestTwoProportions(
  n1: number,
  x1: number,
  n2: number,
  x2: number
): { z: number; pValue: number } {
  if (n1 === 0 || n2 === 0) return { z: 0, pValue: 1 };

  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPooled = (x1 + x2) / (n1 + n2);

  if (pPooled === 0 || pPooled === 1) return { z: 0, pValue: 1 };

  const se = Math.sqrt(pPooled * (1 - pPooled) * (1 / n1 + 1 / n2));
  if (se === 0) return { z: 0, pValue: 1 };

  const z = (p1 - p2) / se;

  // Approximate p-value using normal CDF (Abramowitz and Stegun approximation)
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return { z, pValue };
}

/**
 * Compute chi-squared test for independence.
 * Tests if conversion rates differ across variants.
 */
function chiSquaredTest(
  variants: Array<{ participants: number; conversions: number }>
): { chiSquared: number; pValue: number; df: number } {
  const total = variants.reduce((s, v) => s + v.participants, 0);
  const totalConversions = variants.reduce((s, v) => s + v.conversions, 0);

  if (total === 0) return { chiSquared: 0, pValue: 1, df: variants.length - 1 };

  const overallRate = totalConversions / total;
  let chiSquared = 0;

  for (const variant of variants) {
    if (variant.participants === 0) continue;

    const expectedConversions = variant.participants * overallRate;
    const expectedNonConversions = variant.participants * (1 - overallRate);

    if (expectedConversions > 0) {
      chiSquared +=
        (variant.conversions - expectedConversions) ** 2 / expectedConversions;
    }
    if (expectedNonConversions > 0) {
      const nonConversions = variant.participants - variant.conversions;
      chiSquared +=
        (nonConversions - expectedNonConversions) ** 2 / expectedNonConversions;
    }
  }

  const df = variants.length - 1;
  const pValue = 1 - chiSquaredCDF(chiSquared, df);

  return { chiSquared, pValue, df };
}

/**
 * Normal cumulative distribution function (Abramowitz & Stegun approximation)
 */
function normalCDF(x: number): number {
  if (x < -6) return 0;
  if (x > 6) return 1;

  const b1 = 0.31938153;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;

  const t = 1 / (1 + p * Math.abs(x));
  const z = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  const y = 1 - z * (b1 * t + b2 * t ** 2 + b3 * t ** 3 + b4 * t ** 4 + b5 * t ** 5);

  return x >= 0 ? y : 1 - y;
}

/**
 * Chi-squared CDF approximation using the regularized incomplete gamma function.
 * Uses series expansion for small values and continued fraction for large.
 */
function chiSquaredCDF(x: number, df: number): number {
  if (x <= 0 || df <= 0) return 0;
  return regularizedGammaP(df / 2, x / 2);
}

/**
 * Regularized incomplete gamma function P(a, x) approximation.
 * Uses series expansion.
 */
function regularizedGammaP(a: number, x: number): number {
  if (x < 0) return 0;
  if (x === 0) return 0;

  // Series expansion for small x
  if (x < a + 1) {
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 200; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-10) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }

  // Continued fraction for large x
  return 1 - regularizedGammaQ(a, x);
}

/**
 * Complement of regularized gamma: Q(a, x) = 1 - P(a, x)
 * Uses Lentz's continued fraction algorithm
 */
function regularizedGammaQ(a: number, x: number): number {
  let f = 1e-30;
  let c = 1e-30;
  let d = 1 / (x + 1 - a);
  let h = d;

  for (let i = 1; i < 200; i++) {
    const an = -i * (i - a);
    const bn = x + 2 * i + 1 - a;
    d = bn + an * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = bn + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }

  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

/**
 * Log-gamma function (Stirling's approximation)
 */
function logGamma(x: number): number {
  if (x <= 0) return 0;

  // Lanczos approximation coefficients
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }

  x -= 1;
  let sum = c[0];
  for (let i = 1; i < g + 2; i++) {
    sum += c[i] / (x + i);
  }

  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
}

/**
 * Estimate required sample size for detecting a given effect size.
 */
function estimateRequiredSampleSize(
  baselineRate: number,
  minDetectableEffect: number,
  alpha: number,
  power: number
): number {
  if (baselineRate <= 0 || baselineRate >= 1) return 0;

  const treatmentRate = baselineRate * (1 + minDetectableEffect);
  if (treatmentRate <= 0 || treatmentRate >= 1) return 0;

  // z-values for alpha/2 and power
  const zAlpha = normalQuantile(1 - alpha / 2);
  const zBeta = normalQuantile(power);

  const p1 = baselineRate;
  const p2 = treatmentRate;
  const pBar = (p1 + p2) / 2;

  const n =
    ((zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) +
      zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) /
      (p1 - p2)) ** 2;

  return Math.ceil(n);
}

/**
 * Normal quantile (inverse CDF) approximation.
 * Rational approximation by Peter Acklam.
 */
function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p === 0.5) return 0;

  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
}

function generateAnonymousId(): string {
  const chars = '0123456789abcdef';
  let result = 'anon_';
  for (let i = 0; i < 12; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function initVariantStats(variantId: string, goalIds: string[]): VariantStats {
  const conversionCounts: Record<string, number> = {};
  const conversionValues: Record<string, number> = {};
  const conversionRates: Record<string, number> = {};
  const avgTimeToConversion: Record<string, number> = {};

  for (const goalId of goalIds) {
    conversionCounts[goalId] = 0;
    conversionValues[goalId] = 0;
    conversionRates[goalId] = 0;
    avgTimeToConversion[goalId] = 0;
  }

  return {
    variantId,
    participantCount: 0,
    conversionCounts,
    conversionValues,
    conversionRates,
    avgTimeToConversion,
    firstExposureTime: 0,
    lastConversionTime: 0,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const abTestHandler: TraitHandler<ABTestConfig> = {
  name: 'abtest' as any,

  defaultConfig: {
    enabled: true,
    default_strategy: 'equal',
    alpha: 0.05,
    min_sample_size: 30,
    min_detectable_effect: 0.1,
    statistical_power: 0.8,
    auto_complete: false,
    max_duration: 0,
    privacy_mode: 'anonymous',
    enable_bandit: false,
    bandit_epsilon: 0.1,
    custom_tags: {},
  },

  onAttach(node, config, context) {
    const state: ABTestState = {
      experiments: new Map(),
      variantStats: new Map(),
      participantAssignments: new Map(),
      participantExposures: new Map(),
      banditRewards: new Map(),
      localParticipantId: generateAnonymousId(),
      isActive: config.enabled,
    };
    (node as any).__abTestState = state;

    context.emit?.('abtest_attached', {
      node,
      participantId: state.localParticipantId,
      privacyMode: config.privacy_mode,
    });
  },

  onDetach(node, _config, context) {
    const state = (node as any).__abTestState as ABTestState;
    if (!state) return;

    // Emit final experiment summaries
    for (const [experimentId, experiment] of state.experiments) {
      const stats = state.variantStats.get(experimentId);
      if (stats) {
        context.emit?.('abtest_experiment_summary', {
          node,
          experimentId,
          experimentName: experiment.name,
          status: experiment.status,
          variantStats: Array.from(stats.values()),
        });
      }
    }

    delete (node as any).__abTestState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__abTestState as ABTestState;
    if (!state || !state.isActive) return;

    const now = Date.now();

    // Check experiment durations
    if (config.max_duration > 0) {
      for (const [experimentId, experiment] of state.experiments) {
        if (
          experiment.status === 'running' &&
          now - experiment.start_time > config.max_duration
        ) {
          experiment.status = 'completed';
          experiment.end_time = now;
          context.emit?.('abtest_experiment_completed', {
            node,
            experimentId,
            reason: 'max_duration_exceeded',
          });
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__abTestState as ABTestState;
    if (!state) return;

    // --- Create experiment ---
    if (event.type === 'abtest_create_experiment') {
      const experiment: Experiment = {
        id: (event.id as string) || generateAnonymousId(),
        name: (event.name as string) || 'Experiment',
        description: (event.description as string) || '',
        variants: (event.variants as ABVariant[]) || [],
        goals: (event.goals as ConversionGoal[]) || [],
        allocation_strategy:
          (event.strategy as AllocationStrategy) || config.default_strategy,
        status: 'draft',
        control_variant_id: (event.controlVariantId as string) || '',
        start_time: 0,
      };

      // Initialize stats for each variant
      const statsMap = new Map<string, VariantStats>();
      const goalIds = experiment.goals.map((g) => g.id);
      for (const variant of experiment.variants) {
        statsMap.set(variant.id, initVariantStats(variant.id, goalIds));
      }

      // Set control to first variant if not specified
      if (!experiment.control_variant_id && experiment.variants.length > 0) {
        experiment.control_variant_id = experiment.variants[0].id;
      }

      state.experiments.set(experiment.id, experiment);
      state.variantStats.set(experiment.id, statsMap);

      if (config.enable_bandit) {
        const rewardMap = new Map<string, { successes: number; failures: number }>();
        for (const variant of experiment.variants) {
          rewardMap.set(variant.id, { successes: 1, failures: 1 }); // Prior
        }
        state.banditRewards.set(experiment.id, rewardMap);
      }

      context.emit?.('abtest_experiment_created', {
        node,
        experimentId: experiment.id,
        variants: experiment.variants.map((v) => v.id),
        goals: experiment.goals.map((g) => g.id),
      });
    }

    // --- Start experiment ---
    else if (event.type === 'abtest_start_experiment') {
      const experimentId = event.experimentId as string;
      const experiment = state.experiments.get(experimentId);
      if (experiment && experiment.status === 'draft') {
        experiment.status = 'running';
        experiment.start_time = Date.now();
        context.emit?.('abtest_experiment_started', {
          node,
          experimentId,
        });
      }
    }

    // --- Pause experiment ---
    else if (event.type === 'abtest_pause_experiment') {
      const experimentId = event.experimentId as string;
      const experiment = state.experiments.get(experimentId);
      if (experiment && experiment.status === 'running') {
        experiment.status = 'paused';
        context.emit?.('abtest_experiment_paused', { node, experimentId });
      }
    }

    // --- Resume experiment ---
    else if (event.type === 'abtest_resume_experiment') {
      const experimentId = event.experimentId as string;
      const experiment = state.experiments.get(experimentId);
      if (experiment && experiment.status === 'paused') {
        experiment.status = 'running';
        context.emit?.('abtest_experiment_resumed', { node, experimentId });
      }
    }

    // --- Complete experiment ---
    else if (event.type === 'abtest_complete_experiment') {
      const experimentId = event.experimentId as string;
      const experiment = state.experiments.get(experimentId);
      if (experiment && (experiment.status === 'running' || experiment.status === 'paused')) {
        experiment.status = 'completed';
        experiment.end_time = Date.now();
        context.emit?.('abtest_experiment_completed', {
          node,
          experimentId,
          reason: 'manual',
        });
      }
    }

    // --- Assign variant to participant ---
    else if (event.type === 'abtest_assign') {
      const experimentId = event.experimentId as string;
      const participantId = (event.participantId as string) || state.localParticipantId;
      const experiment = state.experiments.get(experimentId);

      if (!experiment || experiment.status !== 'running') return;

      // Check if already assigned
      let assignments = state.participantAssignments.get(participantId);
      if (!assignments) {
        assignments = new Map();
        state.participantAssignments.set(participantId, assignments);
      }

      let variantId = assignments.get(experimentId);

      if (!variantId) {
        // Assign variant
        if (config.enable_bandit && experiment.allocation_strategy === 'bandit') {
          const rewards = state.banditRewards.get(experimentId);
          variantId = banditSelect(
            experiment.variants,
            rewards || new Map(),
            config.bandit_epsilon
          );
        } else {
          variantId = hashAssign(
            participantId,
            experimentId,
            experiment.variants,
            experiment.allocation_strategy
          );
        }

        assignments.set(experimentId, variantId);

        // Track exposure time
        let exposures = state.participantExposures.get(participantId);
        if (!exposures) {
          exposures = new Map();
          state.participantExposures.set(participantId, exposures);
        }
        exposures.set(experimentId, Date.now());

        // Update stats
        const statsMap = state.variantStats.get(experimentId);
        if (statsMap) {
          const stats = statsMap.get(variantId);
          if (stats) {
            stats.participantCount++;
            if (stats.firstExposureTime === 0) {
              stats.firstExposureTime = Date.now();
            }
          }
        }
      }

      // Return the variant config
      const variant = experiment.variants.find((v) => v.id === variantId);
      context.emit?.('abtest_variant_assigned', {
        node,
        experimentId,
        participantId,
        variantId,
        variantName: variant?.name || '',
        variantConfig: variant?.config || {},
      });
    }

    // --- Record conversion ---
    else if (event.type === 'abtest_conversion') {
      const experimentId = event.experimentId as string;
      const goalId = event.goalId as string;
      const participantId = (event.participantId as string) || state.localParticipantId;
      const value = (event.value as number) || 1;

      const experiment = state.experiments.get(experimentId);
      if (!experiment || experiment.status !== 'running') return;

      // Get participant's variant
      const assignments = state.participantAssignments.get(participantId);
      const variantId = assignments?.get(experimentId);
      if (!variantId) return;

      // Update stats
      const statsMap = state.variantStats.get(experimentId);
      if (statsMap) {
        const stats = statsMap.get(variantId);
        if (stats) {
          stats.conversionCounts[goalId] = (stats.conversionCounts[goalId] || 0) + 1;
          stats.conversionValues[goalId] = (stats.conversionValues[goalId] || 0) + value;

          // Update conversion rate
          if (stats.participantCount > 0) {
            stats.conversionRates[goalId] =
              stats.conversionCounts[goalId] / stats.participantCount;
          }

          // Update avg time to conversion
          const exposures = state.participantExposures.get(participantId);
          const exposureTime = exposures?.get(experimentId);
          if (exposureTime) {
            const timeToConversion = Date.now() - exposureTime;
            const prevAvg = stats.avgTimeToConversion[goalId] || 0;
            const count = stats.conversionCounts[goalId];
            stats.avgTimeToConversion[goalId] =
              prevAvg + (timeToConversion - prevAvg) / count;
          }

          stats.lastConversionTime = Date.now();

          // Update bandit rewards
          if (config.enable_bandit) {
            const rewards = state.banditRewards.get(experimentId);
            if (rewards) {
              const r = rewards.get(variantId);
              if (r) r.successes++;
            }
          }
        }
      }

      context.emit?.('abtest_conversion_recorded', {
        node,
        experimentId,
        goalId,
        participantId,
        variantId,
        value,
      });

      // Check auto-complete
      if (config.auto_complete) {
        checkAutoComplete(state, config, experiment, context, node);
      }
    }

    // --- Calculate significance ---
    else if (event.type === 'abtest_calculate_significance') {
      const experimentId = event.experimentId as string;
      const goalId = event.goalId as string;
      const testType = (event.testType as StatisticalTest) || 'z_test';

      const experiment = state.experiments.get(experimentId);
      const statsMap = state.variantStats.get(experimentId);
      if (!experiment || !statsMap) return;

      const results: SignificanceResult[] = [];

      if (testType === 'z_test') {
        // Z-test: pairwise comparison of each treatment vs control
        const controlStats = statsMap.get(experiment.control_variant_id);
        if (!controlStats) return;

        for (const [variantId, stats] of statsMap) {
          if (variantId === experiment.control_variant_id) continue;

          const controlN = controlStats.participantCount;
          const controlX = controlStats.conversionCounts[goalId] || 0;
          const treatmentN = stats.participantCount;
          const treatmentX = stats.conversionCounts[goalId] || 0;

          const { z, pValue } = zTestTwoProportions(
            controlN,
            controlX,
            treatmentN,
            treatmentX
          );

          const controlRate = controlN > 0 ? controlX / controlN : 0;
          const treatmentRate = treatmentN > 0 ? treatmentX / treatmentN : 0;
          const uplift = controlRate > 0 ? (treatmentRate - controlRate) / controlRate : 0;

          const requiredN = estimateRequiredSampleSize(
            controlRate || 0.1,
            config.min_detectable_effect,
            config.alpha,
            config.statistical_power
          );

          results.push({
            goalId,
            controlVariantId: experiment.control_variant_id,
            treatmentVariantId: variantId,
            testType: 'z_test',
            testStatistic: z,
            pValue,
            isSignificant: pValue < config.alpha && controlN >= config.min_sample_size && treatmentN >= config.min_sample_size,
            confidenceLevel: 1 - config.alpha,
            uplift,
            controlRate,
            treatmentRate,
            sampleSizeControl: controlN,
            sampleSizeTreatment: treatmentN,
            minimumDetectableEffect: config.min_detectable_effect,
            requiredSampleSize: requiredN,
          });
        }
      } else {
        // Chi-squared test: overall comparison
        const variantData: Array<{ participants: number; conversions: number }> = [];
        for (const [, stats] of statsMap) {
          variantData.push({
            participants: stats.participantCount,
            conversions: stats.conversionCounts[goalId] || 0,
          });
        }

        const { chiSquared, pValue } = chiSquaredTest(variantData);

        // Report pairwise results using chi-squared overall result
        const controlStats = statsMap.get(experiment.control_variant_id);
        if (controlStats) {
          for (const [variantId, stats] of statsMap) {
            if (variantId === experiment.control_variant_id) continue;

            const controlRate =
              controlStats.participantCount > 0
                ? (controlStats.conversionCounts[goalId] || 0) / controlStats.participantCount
                : 0;
            const treatmentRate =
              stats.participantCount > 0
                ? (stats.conversionCounts[goalId] || 0) / stats.participantCount
                : 0;
            const uplift = controlRate > 0 ? (treatmentRate - controlRate) / controlRate : 0;

            results.push({
              goalId,
              controlVariantId: experiment.control_variant_id,
              treatmentVariantId: variantId,
              testType: 'chi_squared',
              testStatistic: chiSquared,
              pValue,
              isSignificant: pValue < config.alpha,
              confidenceLevel: 1 - config.alpha,
              uplift,
              controlRate,
              treatmentRate,
              sampleSizeControl: controlStats.participantCount,
              sampleSizeTreatment: stats.participantCount,
              minimumDetectableEffect: config.min_detectable_effect,
              requiredSampleSize: estimateRequiredSampleSize(
                controlRate || 0.1,
                config.min_detectable_effect,
                config.alpha,
                config.statistical_power
              ),
            });
          }
        }
      }

      context.emit?.('abtest_significance_results', {
        node,
        experimentId,
        goalId,
        testType,
        results,
      });
    }

    // --- Query experiment ---
    else if (event.type === 'abtest_query') {
      const experimentId = event.experimentId as string;
      const experiment = state.experiments.get(experimentId);
      const statsMap = state.variantStats.get(experimentId);

      if (!experiment) return;

      context.emit?.('abtest_info', {
        queryId: event.queryId,
        node,
        experimentId,
        name: experiment.name,
        status: experiment.status,
        startTime: experiment.start_time,
        endTime: experiment.end_time,
        variants: experiment.variants.map((v) => v.id),
        goals: experiment.goals.map((g) => g.id),
        variantStats: statsMap ? Array.from(statsMap.values()) : [],
        totalParticipants: statsMap
          ? Array.from(statsMap.values()).reduce((s, v) => s + v.participantCount, 0)
          : 0,
      });
    }

    // --- List experiments ---
    else if (event.type === 'abtest_list') {
      const experiments = Array.from(state.experiments.values()).map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        variantCount: e.variants.length,
        goalCount: e.goals.length,
        startTime: e.start_time,
      }));

      context.emit?.('abtest_list_result', {
        queryId: event.queryId,
        node,
        experiments,
      });
    }

    // --- Get variant for local participant ---
    else if (event.type === 'abtest_get_my_variant') {
      const experimentId = event.experimentId as string;
      const assignments = state.participantAssignments.get(state.localParticipantId);
      const variantId = assignments?.get(experimentId);

      if (variantId) {
        const experiment = state.experiments.get(experimentId);
        const variant = experiment?.variants.find((v) => v.id === variantId);
        context.emit?.('abtest_my_variant', {
          queryId: event.queryId,
          node,
          experimentId,
          variantId,
          variantName: variant?.name || '',
          variantConfig: variant?.config || {},
        });
      }
    }

    // --- Record non-conversion (for bandit) ---
    else if (event.type === 'abtest_no_conversion') {
      if (config.enable_bandit) {
        const experimentId = event.experimentId as string;
        const participantId = (event.participantId as string) || state.localParticipantId;
        const assignments = state.participantAssignments.get(participantId);
        const variantId = assignments?.get(experimentId);

        if (variantId) {
          const rewards = state.banditRewards.get(experimentId);
          if (rewards) {
            const r = rewards.get(variantId);
            if (r) r.failures++;
          }
        }
      }
    }
  },
};

function checkAutoComplete(
  state: ABTestState,
  config: ABTestConfig,
  experiment: Experiment,
  context: { emit?: (event: string, payload?: unknown) => void },
  node: unknown
): void {
  const statsMap = state.variantStats.get(experiment.id);
  if (!statsMap) return;

  const controlStats = statsMap.get(experiment.control_variant_id);
  if (!controlStats) return;

  // Check if any goal has reached significance
  for (const goal of experiment.goals) {
    for (const [variantId, stats] of statsMap) {
      if (variantId === experiment.control_variant_id) continue;

      const controlN = controlStats.participantCount;
      const controlX = controlStats.conversionCounts[goal.id] || 0;
      const treatmentN = stats.participantCount;
      const treatmentX = stats.conversionCounts[goal.id] || 0;

      if (controlN >= config.min_sample_size && treatmentN >= config.min_sample_size) {
        const { pValue } = zTestTwoProportions(controlN, controlX, treatmentN, treatmentX);

        if (pValue < config.alpha) {
          experiment.status = 'completed';
          experiment.end_time = Date.now();
          context.emit?.('abtest_experiment_completed', {
            node,
            experimentId: experiment.id,
            reason: 'significance_reached',
            goalId: goal.id,
            winningVariant: variantId,
            pValue,
          });
          return;
        }
      }
    }
  }
}

export default abTestHandler;
