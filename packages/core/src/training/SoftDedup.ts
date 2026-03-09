/**
 * SoftDedup - Soft Deduplication via N-gram Commonness Scoring
 *
 * Instead of hard-deleting duplicate training examples, SoftDedup computes
 * n-gram commonness scores and assigns sampling weights. Examples with
 * high-frequency n-grams (template-generated / near-duplicate content)
 * receive lower sampling weights, reducing their influence during training
 * without discarding them entirely.
 *
 * Based on training rule W.008:
 *   "Reweight duplicates instead of deleting them. SoftDedup uses n-gram
 *    commonness scores to reduce sampling weight of high-frequency data.
 *    26% faster training, +1.77% accuracy vs hard dedup alone."
 *
 * Pipeline position: Quality Filter -> Hard Dedup (W.004) -> SoftDedup (W.008)
 *
 * @module training/SoftDedup
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for the SoftDedup algorithm.
 */
export interface SoftDedupConfig {
  /**
   * N-gram sizes to compute commonness scores for.
   * Using multiple sizes captures both local (small n) and structural (large n)
   * patterns. Default: [3, 5, 7] (character-level trigrams, 5-grams, 7-grams).
   */
  ngramSizes: number[];

  /**
   * Whether to use word-level n-grams instead of character-level.
   * Word-level captures semantic similarity; character-level captures
   * template-level patterns. Default: false (character-level).
   */
  wordLevel: boolean;

  /**
   * Minimum sampling weight. Even the most common examples keep at least
   * this weight to prevent complete exclusion. Default: 0.1 (10% weight).
   * Must be in range (0, 1].
   */
  minWeight: number;

  /**
   * Maximum sampling weight. Rare/unique examples get at most this weight.
   * Default: 1.0 (100% weight). Must be in range [minWeight, 1].
   */
  maxWeight: number;

  /**
   * Temperature parameter controlling how aggressively to downweight
   * common examples. Higher temperature = more uniform weights.
   * Lower temperature = more aggressive downweighting.
   * Default: 1.0.
   */
  temperature: number;

  /**
   * Percentile threshold for "common" n-grams.
   * N-grams appearing more frequently than this percentile of all n-gram
   * frequencies are considered "common". Default: 0.7 (top 30% are common).
   * Must be in range [0, 1].
   */
  commonThresholdPercentile: number;
}

/**
 * Result for a single training example after SoftDedup scoring.
 */
export interface SoftDedupResult {
  /** Index of the example in the input array */
  index: number;

  /** Computed commonness score (0 = unique, 1 = fully common) */
  commonnessScore: number;

  /** Assigned sampling weight (minWeight to maxWeight) */
  samplingWeight: number;

  /** N-gram statistics for this example */
  ngramStats: NgramStats;
}

/**
 * N-gram statistics for a single example.
 */
export interface NgramStats {
  /** Total number of n-grams extracted */
  totalNgrams: number;

  /** Number of n-grams classified as "common" */
  commonNgrams: number;

  /** Ratio of common n-grams to total (0 to 1) */
  commonRatio: number;
}

/**
 * Aggregate statistics for the entire SoftDedup run.
 */
export interface SoftDedupStats {
  /** Total examples processed */
  totalExamples: number;

  /** Mean sampling weight across all examples */
  meanWeight: number;

  /** Median sampling weight */
  medianWeight: number;

  /** Standard deviation of sampling weights */
  stdWeight: number;

  /** Number of examples at minimum weight (heavily downweighted) */
  atMinWeight: number;

  /** Number of examples at maximum weight (unique/rare) */
  atMaxWeight: number;

  /** Effective dataset size (sum of all weights) */
  effectiveDatasetSize: number;

  /** Reduction ratio: 1 - (effectiveSize / totalExamples) */
  reductionRatio: number;

  /** Number of unique n-grams in the corpus */
  uniqueNgramsInCorpus: number;

  /** Commonness threshold frequency (absolute count) */
  commonThresholdFrequency: number;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Default SoftDedup configuration.
 * Tuned for HoloScript/Brittney training datasets (920K-1.5M examples).
 */
export const DEFAULT_SOFTDEDUP_CONFIG: SoftDedupConfig = {
  ngramSizes: [3, 5, 7],
  wordLevel: false,
  minWeight: 0.1,
  maxWeight: 1.0,
  temperature: 1.0,
  commonThresholdPercentile: 0.7,
};

// =============================================================================
// SOFT DEDUP CLASS
// =============================================================================

/**
 * SoftDedup processor for training data.
 *
 * Computes n-gram commonness scores and assigns sampling weights
 * to training examples. Works AFTER hard dedup (W.004).
 *
 * @example
 * ```ts
 * const dedup = new SoftDedup();
 * const results = dedup.process([
 *   'composition MyScene { orb Player { Grabbable {} } }',
 *   'composition MyScene { orb Player { Grabbable {} } }',  // near-duplicate
 *   'world Arena { orb Enemy { Physics { mass: 10 } } }',   // unique
 * ]);
 *
 * // results[0].samplingWeight ~= 0.3 (common template)
 * // results[1].samplingWeight ~= 0.3 (common template)
 * // results[2].samplingWeight ~= 1.0 (unique content)
 * ```
 */
export class SoftDedup {
  private config: SoftDedupConfig;

  constructor(config: Partial<SoftDedupConfig> = {}) {
    this.config = { ...DEFAULT_SOFTDEDUP_CONFIG, ...config };
    this.validateConfig();
  }

  /**
   * Process a dataset of text examples and compute sampling weights.
   *
   * @param examples - Array of text strings (training examples)
   * @returns Array of SoftDedupResult with sampling weights
   */
  process(examples: string[]): SoftDedupResult[] {
    if (examples.length === 0) {
      return [];
    }

    if (examples.length === 1) {
      return [
        {
          index: 0,
          commonnessScore: 0,
          samplingWeight: this.config.maxWeight,
          ngramStats: {
            totalNgrams: this.extractNgrams(examples[0]).length,
            commonNgrams: 0,
            commonRatio: 0,
          },
        },
      ];
    }

    // Step 1: Build corpus-wide n-gram frequency map
    const corpusFrequencies = this.buildCorpusFrequencies(examples);

    // Step 2: Compute commonness threshold
    const threshold = this.computeThreshold(corpusFrequencies);

    // Step 3: Score each example
    const results: SoftDedupResult[] = examples.map((example, index) => {
      const ngrams = this.extractNgrams(example);
      const totalNgrams = ngrams.length;

      if (totalNgrams === 0) {
        return {
          index,
          commonnessScore: 0,
          samplingWeight: this.config.maxWeight,
          ngramStats: { totalNgrams: 0, commonNgrams: 0, commonRatio: 0 },
        };
      }

      // Count how many of this example's n-grams are "common"
      let commonCount = 0;
      for (const ngram of ngrams) {
        const freq = corpusFrequencies.get(ngram) ?? 0;
        if (freq >= threshold) {
          commonCount++;
        }
      }

      const commonRatio = commonCount / totalNgrams;

      // Commonness score is the ratio of common n-grams
      const commonnessScore = commonRatio;

      // Convert commonness to sampling weight using temperature scaling
      const samplingWeight = this.commonnessToWeight(commonnessScore);

      return {
        index,
        commonnessScore,
        samplingWeight,
        ngramStats: {
          totalNgrams,
          commonNgrams: commonCount,
          commonRatio,
        },
      };
    });

    return results;
  }

  /**
   * Compute aggregate statistics for a set of SoftDedup results.
   */
  computeStats(results: SoftDedupResult[]): SoftDedupStats {
    if (results.length === 0) {
      return {
        totalExamples: 0,
        meanWeight: 0,
        medianWeight: 0,
        stdWeight: 0,
        atMinWeight: 0,
        atMaxWeight: 0,
        effectiveDatasetSize: 0,
        reductionRatio: 0,
        uniqueNgramsInCorpus: 0,
        commonThresholdFrequency: 0,
      };
    }

    const weights = results.map((r) => r.samplingWeight);
    const totalExamples = results.length;
    const sum = weights.reduce((a, b) => a + b, 0);
    const meanWeight = sum / totalExamples;

    // Median
    const sorted = [...weights].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianWeight =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

    // Standard deviation
    const variance = weights.reduce((acc, w) => acc + (w - meanWeight) ** 2, 0) / totalExamples;
    const stdWeight = Math.sqrt(variance);

    // Count extremes (with small epsilon for floating point)
    const epsilon = 1e-9;
    const atMinWeight = weights.filter((w) => Math.abs(w - this.config.minWeight) < epsilon).length;
    const atMaxWeight = weights.filter((w) => Math.abs(w - this.config.maxWeight) < epsilon).length;

    const effectiveDatasetSize = sum;
    const reductionRatio = 1 - effectiveDatasetSize / totalExamples;

    return {
      totalExamples,
      meanWeight,
      medianWeight,
      stdWeight,
      atMinWeight,
      atMaxWeight,
      effectiveDatasetSize,
      reductionRatio,
      uniqueNgramsInCorpus: 0, // filled by caller if needed
      commonThresholdFrequency: 0, // filled by caller if needed
    };
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<SoftDedupConfig> {
    return { ...this.config };
  }

  // ===========================================================================
  // INTERNAL METHODS
  // ===========================================================================

  /**
   * Extract n-grams from a text string.
   * Supports both character-level and word-level n-grams.
   */
  private extractNgrams(text: string): string[] {
    const ngrams: string[] = [];

    for (const n of this.config.ngramSizes) {
      if (this.config.wordLevel) {
        const words = text.split(/\s+/).filter((w) => w.length > 0);
        for (let i = 0; i <= words.length - n; i++) {
          ngrams.push(words.slice(i, i + n).join(' '));
        }
      } else {
        const normalized = text.toLowerCase();
        for (let i = 0; i <= normalized.length - n; i++) {
          ngrams.push(normalized.substring(i, i + n));
        }
      }
    }

    return ngrams;
  }

  /**
   * Build a frequency map of all n-grams across the entire corpus.
   */
  private buildCorpusFrequencies(examples: string[]): Map<string, number> {
    const frequencies = new Map<string, number>();

    for (const example of examples) {
      const ngrams = this.extractNgrams(example);
      for (const ngram of ngrams) {
        frequencies.set(ngram, (frequencies.get(ngram) ?? 0) + 1);
      }
    }

    return frequencies;
  }

  /**
   * Compute the frequency threshold above which an n-gram is considered "common".
   * Uses the configured percentile of the frequency distribution.
   */
  private computeThreshold(frequencies: Map<string, number>): number {
    if (frequencies.size === 0) {
      return 1;
    }

    const freqValues = Array.from(frequencies.values()).sort((a, b) => a - b);
    const percentileIndex = Math.floor(freqValues.length * this.config.commonThresholdPercentile);
    const clampedIndex = Math.min(percentileIndex, freqValues.length - 1);

    return Math.max(freqValues[clampedIndex], 2); // At least frequency 2 to be "common"
  }

  /**
   * Convert a commonness score (0-1) to a sampling weight.
   *
   * Uses exponential decay with temperature scaling:
   *   weight = maxWeight * exp(-commonnessScore / temperature)
   *
   * Then clamps to [minWeight, maxWeight].
   */
  private commonnessToWeight(commonnessScore: number): number {
    const { minWeight, maxWeight, temperature } = this.config;

    // Exponential decay: high commonness -> low weight
    const rawWeight = maxWeight * Math.exp(-commonnessScore / temperature);

    // Clamp to [minWeight, maxWeight]
    return Math.max(minWeight, Math.min(maxWeight, rawWeight));
  }

  /**
   * Validate configuration parameters.
   * @throws Error if configuration is invalid
   */
  private validateConfig(): void {
    const { minWeight, maxWeight, temperature, commonThresholdPercentile, ngramSizes } =
      this.config;

    if (minWeight <= 0 || minWeight > 1) {
      throw new Error(`SoftDedup: minWeight must be in (0, 1], got ${minWeight}`);
    }

    if (maxWeight < minWeight || maxWeight > 1) {
      throw new Error(`SoftDedup: maxWeight must be in [minWeight, 1], got ${maxWeight}`);
    }

    if (temperature <= 0) {
      throw new Error(`SoftDedup: temperature must be > 0, got ${temperature}`);
    }

    if (commonThresholdPercentile < 0 || commonThresholdPercentile > 1) {
      throw new Error(
        `SoftDedup: commonThresholdPercentile must be in [0, 1], got ${commonThresholdPercentile}`
      );
    }

    if (ngramSizes.length === 0) {
      throw new Error('SoftDedup: ngramSizes must have at least one entry');
    }

    for (const n of ngramSizes) {
      if (n < 1 || !Number.isInteger(n)) {
        throw new Error(`SoftDedup: each ngramSize must be a positive integer, got ${n}`);
      }
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a SoftDedup processor with optional configuration overrides.
 *
 * @example
 * ```ts
 * const dedup = createSoftDedup({ wordLevel: true, temperature: 0.5 });
 * const results = dedup.process(myDataset);
 * const stats = dedup.computeStats(results);
 * console.log(`Effective dataset size: ${stats.effectiveDatasetSize}`);
 * ```
 */
export function createSoftDedup(config: Partial<SoftDedupConfig> = {}): SoftDedup {
  return new SoftDedup(config);
}
