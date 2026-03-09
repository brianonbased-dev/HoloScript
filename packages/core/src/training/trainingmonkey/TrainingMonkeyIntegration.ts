/**
 * TrainingMonkey Integration Module
 *
 * Converts HoloScript spatial reasoning JSONL training data into
 * TrainingMonkey's Alpaca format with:
 *   1. JSONL reading and parsing
 *   2. Alpaca format conversion (instruction/input/output)
 *   3. SoftDedup (W.008) n-gram reweighting for sampling
 *   4. Stratified train/validation splits (90/10)
 *   5. TrainingMonkey-compatible training config (W.006 hyperparameters)
 *   6. Ready-to-upload output file generation
 *
 * @module training/trainingmonkey/TrainingMonkeyIntegration
 */

import { SoftDedup } from '../SoftDedup';
import type { SoftDedupResult } from '../SoftDedup';
import type { SpatialTrainingJSONLEntry } from '../SpatialTrainingDataTypes';
import type {
  AlpacaEntry,
  WeightedAlpacaEntry,
  DatasetSplit,
  SplitStats,
  TrainingMonkeyConfig,
  TrainingMonkeyIntegrationConfig,
  IntegrationResult,
} from './TrainingMonkeyTypes';
import { DEFAULT_INTEGRATION_CONFIG } from './TrainingMonkeyTypes';

// =============================================================================
// SEEDED PRNG (Fisher-Yates shuffle requires deterministic randomness)
// =============================================================================

/**
 * Simple seeded PRNG (mulberry32) for deterministic shuffling.
 * Produces values in [0, 1).
 */
function createSeededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================================
// TRAINING MONKEY INTEGRATION CLASS
// =============================================================================

/**
 * Integrates HoloScript spatial reasoning data with TrainingMonkey.
 *
 * Full pipeline:
 *   readJsonl() -> convertToAlpaca() -> applySoftDedup() -> splitDataset() -> generateConfig()
 *
 * @example
 * ```ts
 * const integration = new TrainingMonkeyIntegration({
 *   inputPath: 'spatial-reasoning-10k.jsonl',
 *   outputDir: './output',
 * });
 *
 * const jsonlContent = fs.readFileSync('spatial-reasoning-10k.jsonl', 'utf-8');
 * const result = integration.process(jsonlContent);
 *
 * fs.writeFileSync('alpaca-train.jsonl', result.trainJsonl);
 * fs.writeFileSync('alpaca-val.jsonl', result.validationJsonl);
 * fs.writeFileSync('training-config.json', result.configJson);
 * ```
 */
export class TrainingMonkeyIntegration {
  private config: TrainingMonkeyIntegrationConfig;
  private softDedup: SoftDedup;

  constructor(config: Partial<TrainingMonkeyIntegrationConfig> = {}) {
    this.config = { ...DEFAULT_INTEGRATION_CONFIG, ...config };
    this.softDedup = new SoftDedup({
      ngramSizes: [3, 5, 7],
      wordLevel: false,
      minWeight: 0.1,
      maxWeight: 1.0,
      temperature: 1.0,
      commonThresholdPercentile: 0.7,
    });
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Run the full integration pipeline on raw JSONL content.
   *
   * @param jsonlContent - Raw JSONL string content from the dataset file
   * @returns Complete IntegrationResult with split data, config, and serialized output
   */
  process(jsonlContent: string): IntegrationResult {
    // Step 1: Parse JSONL
    const entries = this.readJsonl(jsonlContent);

    // Step 2: Convert to Alpaca format
    const alpacaEntries = this.convertToAlpaca(entries);

    // Step 3: Apply SoftDedup reweighting
    const weightedEntries = this.config.enableSoftDedup
      ? this.applySoftDedup(alpacaEntries, entries)
      : alpacaEntries.map(
          (entry, index) =>
            ({
              ...entry,
              sampling_weight: 1.0,
              metadata: entries[index]?.metadata,
            }) as WeightedAlpacaEntry
        );

    // Step 4: Split into train/validation
    const split = this.splitDataset(weightedEntries);

    // Step 5: Generate training config
    const config = this.generateConfig(split);

    // Step 6: Serialize outputs
    const trainJsonl = this.serializeJsonl(split.train);
    const validationJsonl = this.serializeJsonl(split.validation);
    const configJson = JSON.stringify(config, null, 2);

    return {
      split,
      config,
      trainJsonl,
      validationJsonl,
      configJson,
    };
  }

  /**
   * Parse raw JSONL content into SpatialTrainingJSONLEntry objects.
   *
   * @param jsonlContent - Raw JSONL string (one JSON object per line)
   * @returns Array of parsed entries
   * @throws Error if a line contains invalid JSON
   */
  readJsonl(jsonlContent: string): SpatialTrainingJSONLEntry[] {
    const lines = jsonlContent.split('\n').filter((line) => line.trim() !== '');
    const entries: SpatialTrainingJSONLEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      try {
        const parsed = JSON.parse(lines[i]) as SpatialTrainingJSONLEntry;
        if (!parsed.instruction || !parsed.response) {
          throw new Error(`Missing required fields (instruction/response)`);
        }
        entries.push(parsed);
      } catch (e) {
        throw new Error(`Failed to parse JSONL line ${i + 1}: ${(e as Error).message}`);
      }
    }

    return entries;
  }

  /**
   * Convert spatial training entries to Alpaca format.
   *
   * Mapping:
   *   instruction -> instruction (question/prompt)
   *   input -> extracted HoloScript scene from instruction (if present)
   *   output -> response (answer)
   *
   * @param entries - Parsed spatial training entries
   * @returns Alpaca-formatted entries
   */
  convertToAlpaca(entries: SpatialTrainingJSONLEntry[]): AlpacaEntry[] {
    return entries.map((entry) => {
      // Extract HoloScript scene block from instruction as separate input
      const { questionPart, scenePart } = this.extractSceneFromInstruction(entry.instruction);

      return {
        instruction: questionPart,
        input: scenePart,
        output: entry.response,
      };
    });
  }

  /**
   * Apply SoftDedup (W.008) n-gram reweighting to Alpaca entries.
   *
   * Uses the instruction + output text to compute n-gram commonness scores
   * and assigns sampling weights. Template-generated near-duplicates receive
   * lower weights (min 0.1), while unique examples keep weight 1.0.
   *
   * @param alpacaEntries - Converted Alpaca entries
   * @param originalEntries - Original JSONL entries (for metadata preservation)
   * @returns Weighted Alpaca entries with sampling_weight and metadata
   */
  applySoftDedup(
    alpacaEntries: AlpacaEntry[],
    originalEntries: SpatialTrainingJSONLEntry[]
  ): WeightedAlpacaEntry[] {
    // Build text corpus from instruction + output for n-gram analysis
    const textCorpus = alpacaEntries.map((entry) => `${entry.instruction} ${entry.output}`);

    // Run SoftDedup
    const dedupResults: SoftDedupResult[] = this.softDedup.process(textCorpus);

    // Merge weights with Alpaca entries
    return alpacaEntries.map((entry, index) => ({
      ...entry,
      sampling_weight: dedupResults[index]?.samplingWeight ?? 1.0,
      metadata: originalEntries[index]?.metadata,
    }));
  }

  /**
   * Split weighted entries into train/validation sets.
   *
   * When stratified=true, the split preserves the distribution of
   * relationship_type and difficulty across both sets.
   *
   * @param entries - Weighted Alpaca entries
   * @returns DatasetSplit with train, validation, and stats
   */
  splitDataset(entries: WeightedAlpacaEntry[]): DatasetSplit {
    if (entries.length === 0) {
      return {
        train: [],
        validation: [],
        stats: {
          totalExamples: 0,
          trainCount: 0,
          validationCount: 0,
          trainRatio: 0,
          validationRatio: 0,
          stratified: this.config.stratify,
        },
      };
    }

    const rng = createSeededRandom(this.config.seed);

    let train: WeightedAlpacaEntry[];
    let validation: WeightedAlpacaEntry[];

    if (this.config.stratify && entries[0]?.metadata) {
      ({ train, validation } = this.stratifiedSplit(entries, rng));
    } else {
      ({ train, validation } = this.randomSplit(entries, rng));
    }

    const stats: SplitStats = {
      totalExamples: entries.length,
      trainCount: train.length,
      validationCount: validation.length,
      trainRatio: train.length / entries.length,
      validationRatio: validation.length / entries.length,
      stratified: this.config.stratify && !!entries[0]?.metadata,
    };

    return { train, validation, stats };
  }

  /**
   * Generate a TrainingMonkey-compatible training configuration.
   *
   * Uses W.006 hyperparameters:
   *   - Learning rate: 2e-4
   *   - Epochs: 2
   *   - Optimizer: paged_adamw_8bit
   *
   * Uses W.007 batch sizing:
   *   - Micro-batch: 8
   *   - Gradient accumulation: 4
   *   - Effective batch: 32
   *
   * Uses W.009 LR schedule:
   *   - Warmup: 10% of total steps
   *   - Schedule: cosine decay
   *
   * @param split - The dataset split result
   * @returns TrainingMonkey-compatible config
   */
  generateConfig(split: DatasetSplit): TrainingMonkeyConfig {
    const microBatchSize = 8;
    const gradientAccumulationSteps = 4;
    const epochs = 2;
    const effectiveBatchSize = microBatchSize * gradientAccumulationSteps;
    const stepsPerEpoch = Math.ceil(split.stats.trainCount / effectiveBatchSize);
    const totalSteps = stepsPerEpoch * epochs;

    // Compute SoftDedup stats
    const weights = split.train.map((e) => e.sampling_weight);
    const meanWeight =
      weights.length > 0 ? weights.reduce((sum, w) => sum + w, 0) / weights.length : 1.0;
    const effectiveSize = weights.reduce((sum, w) => sum + w, 0);
    const reductionRatio = weights.length > 0 ? 1 - effectiveSize / weights.length : 0;

    return {
      model: {
        name: this.config.modelName,
        maxSeqLength: 2048,
      },
      hyperparameters: {
        learningRate: 2e-4,
        epochs,
        optimizer: 'paged_adamw_8bit',
        microBatchSize,
        gradientAccumulationSteps,
        maxGradNorm: 1.0,
        weightDecay: 0.01,
      },
      lrSchedule: {
        warmupRatio: 0.1,
        type: 'cosine',
      },
      dataset: {
        trainPath: `${this.config.outputDir}/alpaca-train.jsonl`,
        validationPath: `${this.config.outputDir}/alpaca-val.jsonl`,
        trainCount: split.stats.trainCount,
        validationCount: split.stats.validationCount,
        totalSteps,
      },
      softDedup: {
        applied: this.config.enableSoftDedup,
        meanWeight,
        effectiveSize,
        reductionRatio,
      },
    };
  }

  /**
   * Serialize weighted Alpaca entries to JSONL string.
   *
   * @param entries - Entries to serialize
   * @returns JSONL string (one JSON object per line)
   */
  serializeJsonl(entries: WeightedAlpacaEntry[]): string {
    return entries.map((entry) => JSON.stringify(entry)).join('\n');
  }

  /**
   * Get the current integration configuration.
   */
  getConfig(): Readonly<TrainingMonkeyIntegrationConfig> {
    return { ...this.config };
  }

  // ===========================================================================
  // INTERNAL METHODS
  // ===========================================================================

  /**
   * Extract the question part and HoloScript scene from an instruction string.
   *
   * The spatial reasoning dataset embeds HoloScript scenes in instructions:
   * ```
   * Does the spatial_adjacent constraint pass?
   *
   * HoloScript Scene:
   * ```holoscript
   * composition "SpatialScene" { ... }
   * ```
   * ```
   *
   * This method splits the instruction into the question (instruction field)
   * and the scene source (input field) for the Alpaca format.
   */
  private extractSceneFromInstruction(instruction: string): {
    questionPart: string;
    scenePart: string;
  } {
    // Look for "HoloScript Scene:" marker
    const sceneMarkerIndex = instruction.indexOf('HoloScript Scene:');

    if (sceneMarkerIndex === -1) {
      // No scene embedded, use full instruction
      return { questionPart: instruction.trim(), scenePart: '' };
    }

    const questionPart = instruction.substring(0, sceneMarkerIndex).trim();
    const scenePart = instruction.substring(sceneMarkerIndex).trim();

    return { questionPart, scenePart };
  }

  /**
   * Perform a stratified split preserving distribution of metadata fields.
   * Groups by relationship_type + difficulty and splits each group proportionally.
   */
  private stratifiedSplit(
    entries: WeightedAlpacaEntry[],
    rng: () => number
  ): { train: WeightedAlpacaEntry[]; validation: WeightedAlpacaEntry[] } {
    // Group entries by stratification key
    const groups = new Map<string, WeightedAlpacaEntry[]>();

    for (const entry of entries) {
      const key = entry.metadata
        ? `${entry.metadata.relationship_type}:${entry.metadata.difficulty}`
        : 'unknown';

      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(entry);
    }

    const train: WeightedAlpacaEntry[] = [];
    const validation: WeightedAlpacaEntry[] = [];

    // Split each group proportionally
    for (const [, groupEntries] of groups) {
      // Shuffle the group deterministically
      const shuffled = this.fisherYatesShuffle([...groupEntries], rng);

      const splitIndex = Math.round(shuffled.length * this.config.trainRatio);
      train.push(...shuffled.slice(0, splitIndex));
      validation.push(...shuffled.slice(splitIndex));
    }

    return { train, validation };
  }

  /**
   * Perform a simple random split.
   */
  private randomSplit(
    entries: WeightedAlpacaEntry[],
    rng: () => number
  ): { train: WeightedAlpacaEntry[]; validation: WeightedAlpacaEntry[] } {
    const shuffled = this.fisherYatesShuffle([...entries], rng);
    const splitIndex = Math.round(shuffled.length * this.config.trainRatio);

    return {
      train: shuffled.slice(0, splitIndex),
      validation: shuffled.slice(splitIndex),
    };
  }

  /**
   * Fisher-Yates shuffle with seeded PRNG for deterministic ordering.
   */
  private fisherYatesShuffle<T>(array: T[], rng: () => number): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a TrainingMonkeyIntegration instance with optional config overrides.
 *
 * @example
 * ```ts
 * const integration = createTrainingMonkeyIntegration({
 *   inputPath: 'spatial-reasoning-10k.jsonl',
 *   outputDir: './output',
 *   trainRatio: 0.9,
 * });
 *
 * const result = integration.process(jsonlContent);
 * ```
 */
export function createTrainingMonkeyIntegration(
  config: Partial<TrainingMonkeyIntegrationConfig> = {}
): TrainingMonkeyIntegration {
  return new TrainingMonkeyIntegration(config);
}
