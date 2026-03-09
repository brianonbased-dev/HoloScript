/**
 * Tests: TrainingMonkey Integration Module
 *
 * Full test coverage for the spatial reasoning -> TrainingMonkey pipeline:
 *   1. JSONL reading and parsing
 *   2. Alpaca format conversion (instruction/input/output)
 *   3. SoftDedup (W.008) n-gram reweighting
 *   4. Train/validation splits (90/10, stratified)
 *   5. TrainingMonkey-compatible config generation (W.006 hyperparameters)
 *   6. End-to-end pipeline (process)
 *   7. Serialization to JSONL output
 *   8. Edge cases and error handling
 */

import { describe, it, expect } from 'vitest';
import {
  TrainingMonkeyIntegration,
  createTrainingMonkeyIntegration,
  DEFAULT_INTEGRATION_CONFIG,
} from '../trainingmonkey';
import type {
  AlpacaEntry,
  WeightedAlpacaEntry,
  DatasetSplit,
  TrainingMonkeyConfig,
  IntegrationResult,
} from '../trainingmonkey';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Minimal valid JSONL entry matching SpatialTrainingJSONLEntry format.
 */
function makeEntry(
  id: string,
  relType: string = 'spatial_adjacent',
  difficulty: string = 'basic',
  isPositive: boolean = true,
  includeScene: boolean = true
): string {
  const scenePart = includeScene
    ? `\n\nHoloScript Scene:\n\`\`\`holoscript\ncomposition "SpatialScene" {\n  object "${id}" {\n    geometry: "cube"\n    position: [1.0, 2.0, 3.0]\n  }\n}\n\`\`\``
    : '';

  const instruction = `Does the ${relType} constraint pass for "${id}"?${scenePart}`;
  const response = isPositive
    ? `Yes, "${id}" satisfies the constraint.`
    : `No, "${id}" violates the constraint.`;

  return JSON.stringify({
    instruction,
    response,
    metadata: {
      id,
      relationship_type: relType,
      is_positive: isPositive,
      difficulty,
      tags: [relType, difficulty, isPositive ? 'positive' : 'negative'],
    },
  });
}

/**
 * Build a multi-line JSONL string from entries.
 */
function buildJsonl(entries: string[]): string {
  return entries.join('\n');
}

/**
 * Create a small balanced dataset with all relationship types and difficulties.
 */
function createBalancedDataset(perGroup: number = 3): string {
  const relTypes = ['spatial_adjacent', 'spatial_contains', 'spatial_reachable'];
  const difficulties = ['basic', 'intermediate', 'advanced'];
  const entries: string[] = [];

  let counter = 0;
  for (const rel of relTypes) {
    for (const diff of difficulties) {
      for (let i = 0; i < perGroup; i++) {
        counter++;
        entries.push(
          makeEntry(
            `obj-${counter}`,
            rel,
            diff,
            i % 2 === 0 // alternate positive/negative
          )
        );
      }
    }
  }

  return buildJsonl(entries);
}

// =============================================================================
// TESTS
// =============================================================================

describe('TrainingMonkeyIntegration', () => {
  // ---------------------------------------------------------------------------
  // Construction & Configuration
  // ---------------------------------------------------------------------------

  describe('constructor and configuration', () => {
    it('uses default config when no overrides provided', () => {
      const integration = new TrainingMonkeyIntegration();
      const config = integration.getConfig();
      expect(config.trainRatio).toBe(0.9);
      expect(config.seed).toBe(42);
      expect(config.enableSoftDedup).toBe(true);
      expect(config.modelName).toBe('qwen7b');
      expect(config.stratify).toBe(true);
    });

    it('merges partial config with defaults', () => {
      const integration = new TrainingMonkeyIntegration({
        trainRatio: 0.8,
        seed: 123,
      });
      const config = integration.getConfig();
      expect(config.trainRatio).toBe(0.8);
      expect(config.seed).toBe(123);
      expect(config.enableSoftDedup).toBe(true); // default preserved
    });

    it('factory function creates instance with config', () => {
      const integration = createTrainingMonkeyIntegration({
        modelName: 'phi35',
      });
      expect(integration.getConfig().modelName).toBe('phi35');
    });

    it('exports DEFAULT_INTEGRATION_CONFIG', () => {
      expect(DEFAULT_INTEGRATION_CONFIG).toBeDefined();
      expect(DEFAULT_INTEGRATION_CONFIG.trainRatio).toBe(0.9);
      expect(DEFAULT_INTEGRATION_CONFIG.seed).toBe(42);
    });
  });

  // ---------------------------------------------------------------------------
  // JSONL Reading
  // ---------------------------------------------------------------------------

  describe('readJsonl', () => {
    it('parses valid JSONL with multiple entries', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = buildJsonl([makeEntry('obj-1'), makeEntry('obj-2'), makeEntry('obj-3')]);

      const entries = integration.readJsonl(jsonl);
      expect(entries).toHaveLength(3);
    });

    it('preserves instruction and response fields', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('test-obj', 'spatial_adjacent', 'basic', true);

      const entries = integration.readJsonl(jsonl);
      expect(entries[0].instruction).toContain('test-obj');
      expect(entries[0].response).toContain('test-obj');
    });

    it('preserves metadata fields', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('meta-test', 'spatial_contains', 'advanced', false);

      const entries = integration.readJsonl(jsonl);
      expect(entries[0].metadata.id).toBe('meta-test');
      expect(entries[0].metadata.relationship_type).toBe('spatial_contains');
      expect(entries[0].metadata.difficulty).toBe('advanced');
      expect(entries[0].metadata.is_positive).toBe(false);
      expect(entries[0].metadata.tags).toContain('spatial_contains');
    });

    it('skips empty lines in JSONL', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = `${makeEntry('obj-1')}\n\n${makeEntry('obj-2')}\n\n`;

      const entries = integration.readJsonl(jsonl);
      expect(entries).toHaveLength(2);
    });

    it('throws on invalid JSON lines', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = `${makeEntry('obj-1')}\n{invalid json}\n${makeEntry('obj-3')}`;

      expect(() => integration.readJsonl(jsonl)).toThrow('Failed to parse JSONL line 2');
    });

    it('throws on missing instruction field', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = JSON.stringify({ response: 'hello', metadata: {} });

      expect(() => integration.readJsonl(jsonl)).toThrow('Missing required fields');
    });

    it('throws on missing response field', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = JSON.stringify({ instruction: 'hello', metadata: {} });

      expect(() => integration.readJsonl(jsonl)).toThrow('Missing required fields');
    });

    it('handles single-line JSONL', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('single');

      const entries = integration.readJsonl(jsonl);
      expect(entries).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Alpaca Format Conversion
  // ---------------------------------------------------------------------------

  describe('convertToAlpaca', () => {
    it('produces entries with instruction, input, and output fields', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('conv-test');
      const entries = integration.readJsonl(jsonl);

      const alpaca = integration.convertToAlpaca(entries);
      expect(alpaca).toHaveLength(1);
      expect(alpaca[0]).toHaveProperty('instruction');
      expect(alpaca[0]).toHaveProperty('input');
      expect(alpaca[0]).toHaveProperty('output');
    });

    it('maps response to output field', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('output-test', 'spatial_adjacent', 'basic', true);
      const entries = integration.readJsonl(jsonl);

      const alpaca = integration.convertToAlpaca(entries);
      expect(alpaca[0].output).toContain('output-test');
      expect(alpaca[0].output).toContain('satisfies the constraint');
    });

    it('extracts HoloScript scene into input field', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('scene-test', 'spatial_adjacent', 'basic', true, true);
      const entries = integration.readJsonl(jsonl);

      const alpaca = integration.convertToAlpaca(entries);
      expect(alpaca[0].input).toContain('HoloScript Scene:');
      expect(alpaca[0].input).toContain('composition "SpatialScene"');
    });

    it('separates question from scene in instruction', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('sep-test');
      const entries = integration.readJsonl(jsonl);

      const alpaca = integration.convertToAlpaca(entries);
      // The instruction should contain the question part WITHOUT the scene
      expect(alpaca[0].instruction).toContain('sep-test');
      expect(alpaca[0].instruction).not.toContain('composition "SpatialScene"');
    });

    it('uses empty input when no scene is present', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('no-scene', 'spatial_adjacent', 'basic', true, false);
      const entries = integration.readJsonl(jsonl);

      const alpaca = integration.convertToAlpaca(entries);
      expect(alpaca[0].input).toBe('');
    });

    it('converts all entries in batch', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = buildJsonl([
        makeEntry('batch-1'),
        makeEntry('batch-2'),
        makeEntry('batch-3'),
        makeEntry('batch-4'),
        makeEntry('batch-5'),
      ]);
      const entries = integration.readJsonl(jsonl);

      const alpaca = integration.convertToAlpaca(entries);
      expect(alpaca).toHaveLength(5);
      for (const entry of alpaca) {
        expect(entry.instruction).toBeTruthy();
        expect(entry.output).toBeTruthy();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // SoftDedup (W.008) N-gram Reweighting
  // ---------------------------------------------------------------------------

  describe('applySoftDedup (W.008)', () => {
    it('assigns sampling weights to all entries', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(3);
      const entries = integration.readJsonl(jsonl);
      const alpaca = integration.convertToAlpaca(entries);

      const weighted = integration.applySoftDedup(alpaca, entries);
      expect(weighted).toHaveLength(entries.length);

      for (const entry of weighted) {
        expect(entry.sampling_weight).toBeGreaterThanOrEqual(0.1);
        expect(entry.sampling_weight).toBeLessThanOrEqual(1.0);
      }
    });

    it('preserves original metadata in weighted entries', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('meta-keep', 'spatial_reachable', 'advanced', false);
      const entries = integration.readJsonl(jsonl);
      const alpaca = integration.convertToAlpaca(entries);

      const weighted = integration.applySoftDedup(alpaca, entries);
      expect(weighted[0].metadata).toBeDefined();
      expect(weighted[0].metadata!.id).toBe('meta-keep');
      expect(weighted[0].metadata!.relationship_type).toBe('spatial_reachable');
    });

    it('preserves Alpaca fields in weighted entries', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('fields-test');
      const entries = integration.readJsonl(jsonl);
      const alpaca = integration.convertToAlpaca(entries);

      const weighted = integration.applySoftDedup(alpaca, entries);
      expect(weighted[0].instruction).toBe(alpaca[0].instruction);
      expect(weighted[0].input).toBe(alpaca[0].input);
      expect(weighted[0].output).toBe(alpaca[0].output);
    });

    it('downweights near-duplicate template content', () => {
      const integration = new TrainingMonkeyIntegration();

      // Create entries with very similar template text
      const similarEntries: string[] = [];
      for (let i = 0; i < 20; i++) {
        similarEntries.push(makeEntry(`similar-${i}`, 'spatial_adjacent', 'basic', true));
      }
      // Add a unique entry
      similarEntries.push(
        JSON.stringify({
          instruction:
            'This is a completely unique and different instruction that has nothing in common with the template above. It discusses quantum mechanics and the behavior of subatomic particles.',
          response:
            'The answer involves Heisenberg uncertainty principle and wave-particle duality in quantum field theory.',
          metadata: {
            id: 'unique-1',
            relationship_type: 'spatial_adjacent',
            is_positive: true,
            difficulty: 'advanced',
            tags: ['unique'],
          },
        })
      );

      const jsonl = buildJsonl(similarEntries);
      const entries = integration.readJsonl(jsonl);
      const alpaca = integration.convertToAlpaca(entries);
      const weighted = integration.applySoftDedup(alpaca, entries);

      // The unique entry should have a higher weight than the template entries
      const uniqueWeight = weighted[weighted.length - 1].sampling_weight;
      const templateWeights = weighted.slice(0, -1).map((w) => w.sampling_weight);
      const avgTemplateWeight = templateWeights.reduce((a, b) => a + b, 0) / templateWeights.length;

      expect(uniqueWeight).toBeGreaterThan(avgTemplateWeight);
    });

    it('assigns weight 1.0 when SoftDedup is disabled', () => {
      const integration = new TrainingMonkeyIntegration({
        enableSoftDedup: false,
      });
      const jsonl = createBalancedDataset(2);
      const result = integration.process(jsonl);

      for (const entry of result.split.train) {
        expect(entry.sampling_weight).toBe(1.0);
      }
      for (const entry of result.split.validation) {
        expect(entry.sampling_weight).toBe(1.0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Train/Validation Split
  // ---------------------------------------------------------------------------

  describe('splitDataset', () => {
    it('produces 90/10 split by default', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10); // 3 relTypes * 3 difficulties * 10 = 90 entries
      const result = integration.process(jsonl);

      const { stats } = result.split;
      expect(stats.totalExamples).toBe(90);
      // Allow +/- 2% tolerance for rounding
      expect(stats.trainRatio).toBeGreaterThan(0.88);
      expect(stats.trainRatio).toBeLessThan(0.92);
      expect(stats.validationRatio).toBeGreaterThan(0.08);
      expect(stats.validationRatio).toBeLessThan(0.12);
    });

    it('train + validation = total examples', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(5);
      const result = integration.process(jsonl);

      const { stats } = result.split;
      expect(stats.trainCount + stats.validationCount).toBe(stats.totalExamples);
    });

    it('respects custom trainRatio', () => {
      const integration = new TrainingMonkeyIntegration({ trainRatio: 0.8 });
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);

      const { stats } = result.split;
      expect(stats.trainRatio).toBeGreaterThan(0.78);
      expect(stats.trainRatio).toBeLessThan(0.82);
    });

    it('preserves stratification across relationship types', () => {
      const integration = new TrainingMonkeyIntegration({ stratify: true });
      const jsonl = createBalancedDataset(20);
      const result = integration.process(jsonl);

      // Check that all relationship types appear in both train and validation
      const trainTypes = new Set(
        result.split.train.filter((e) => e.metadata).map((e) => e.metadata!.relationship_type)
      );
      const valTypes = new Set(
        result.split.validation.filter((e) => e.metadata).map((e) => e.metadata!.relationship_type)
      );

      expect(trainTypes.has('spatial_adjacent')).toBe(true);
      expect(trainTypes.has('spatial_contains')).toBe(true);
      expect(trainTypes.has('spatial_reachable')).toBe(true);
      expect(valTypes.has('spatial_adjacent')).toBe(true);
      expect(valTypes.has('spatial_contains')).toBe(true);
      expect(valTypes.has('spatial_reachable')).toBe(true);
    });

    it('preserves stratification across difficulty levels', () => {
      const integration = new TrainingMonkeyIntegration({ stratify: true });
      const jsonl = createBalancedDataset(20);
      const result = integration.process(jsonl);

      const trainDiffs = new Set(
        result.split.train.filter((e) => e.metadata).map((e) => e.metadata!.difficulty)
      );
      const valDiffs = new Set(
        result.split.validation.filter((e) => e.metadata).map((e) => e.metadata!.difficulty)
      );

      expect(trainDiffs.has('basic')).toBe(true);
      expect(trainDiffs.has('intermediate')).toBe(true);
      expect(trainDiffs.has('advanced')).toBe(true);
      expect(valDiffs.has('basic')).toBe(true);
      expect(valDiffs.has('intermediate')).toBe(true);
      expect(valDiffs.has('advanced')).toBe(true);
    });

    it('is deterministic with the same seed', () => {
      const jsonl = createBalancedDataset(10);

      const result1 = new TrainingMonkeyIntegration({ seed: 42 }).process(jsonl);
      const result2 = new TrainingMonkeyIntegration({ seed: 42 }).process(jsonl);

      expect(result1.trainJsonl).toBe(result2.trainJsonl);
      expect(result1.validationJsonl).toBe(result2.validationJsonl);
    });

    it('produces different splits with different seeds', () => {
      const jsonl = createBalancedDataset(10);

      const result1 = new TrainingMonkeyIntegration({ seed: 42 }).process(jsonl);
      const result2 = new TrainingMonkeyIntegration({ seed: 999 }).process(jsonl);

      // With different seeds, the train/val split ordering should differ
      expect(result1.trainJsonl).not.toBe(result2.trainJsonl);
    });

    it('handles empty dataset', () => {
      const integration = new TrainingMonkeyIntegration();
      const entries: WeightedAlpacaEntry[] = [];
      const split = integration.splitDataset(entries);

      expect(split.train).toHaveLength(0);
      expect(split.validation).toHaveLength(0);
      expect(split.stats.totalExamples).toBe(0);
    });

    it('handles single-entry dataset', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = makeEntry('single');
      const result = integration.process(jsonl);

      // Single entry should go to train (90% rounds to 1)
      expect(result.split.stats.totalExamples).toBe(1);
      expect(result.split.stats.trainCount + result.split.stats.validationCount).toBe(1);
    });

    it('handles non-stratified split', () => {
      const integration = new TrainingMonkeyIntegration({ stratify: false });
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);

      expect(result.split.stats.stratified).toBe(false);
      expect(result.split.stats.trainCount + result.split.stats.validationCount).toBe(
        result.split.stats.totalExamples
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Training Config Generation
  // ---------------------------------------------------------------------------

  describe('generateConfig', () => {
    it('produces W.006-compliant hyperparameters', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);
      const config = result.config;

      expect(config.hyperparameters.learningRate).toBe(2e-4);
      expect(config.hyperparameters.epochs).toBe(2);
      expect(config.hyperparameters.optimizer).toBe('paged_adamw_8bit');
    });

    it('produces W.007-compliant batch sizing', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);
      const config = result.config;

      expect(config.hyperparameters.microBatchSize).toBe(8);
      expect(config.hyperparameters.gradientAccumulationSteps).toBe(4);
      // Effective batch = 8 * 4 = 32
      const effectiveBatch =
        config.hyperparameters.microBatchSize * config.hyperparameters.gradientAccumulationSteps;
      expect(effectiveBatch).toBe(32);
    });

    it('produces W.009-compliant LR schedule', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);
      const config = result.config;

      expect(config.lrSchedule.warmupRatio).toBe(0.1);
      expect(config.lrSchedule.type).toBe('cosine');
    });

    it('computes correct total training steps', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10); // 3 relTypes * 3 difficulties * 10 = 90 entries total
      const result = integration.process(jsonl);
      const config = result.config;

      const effectiveBatch = 8 * 4; // 32
      const stepsPerEpoch = Math.ceil(config.dataset.trainCount / effectiveBatch);
      const expectedTotalSteps = stepsPerEpoch * 2; // 2 epochs

      expect(config.dataset.totalSteps).toBe(expectedTotalSteps);
    });

    it('includes correct dataset counts', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);
      const config = result.config;

      expect(config.dataset.trainCount).toBe(result.split.stats.trainCount);
      expect(config.dataset.validationCount).toBe(result.split.stats.validationCount);
      // 3 relTypes * 3 difficulties * 10 perGroup = 90
      expect(config.dataset.trainCount + config.dataset.validationCount).toBe(90);
    });

    it('includes SoftDedup statistics', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);
      const config = result.config;

      expect(config.softDedup.applied).toBe(true);
      expect(config.softDedup.meanWeight).toBeGreaterThan(0);
      expect(config.softDedup.meanWeight).toBeLessThanOrEqual(1.0);
      expect(config.softDedup.effectiveSize).toBeGreaterThan(0);
    });

    it('reports SoftDedup as not applied when disabled', () => {
      const integration = new TrainingMonkeyIntegration({
        enableSoftDedup: false,
      });
      const jsonl = createBalancedDataset(5);
      const result = integration.process(jsonl);

      expect(result.config.softDedup.applied).toBe(false);
      expect(result.config.softDedup.meanWeight).toBe(1.0);
    });

    it('uses configured model name', () => {
      const integration = new TrainingMonkeyIntegration({
        modelName: 'phi35',
      });
      const jsonl = createBalancedDataset(3);
      const result = integration.process(jsonl);

      expect(result.config.model.name).toBe('phi35');
    });

    it('includes output directory in dataset paths', () => {
      const integration = new TrainingMonkeyIntegration({
        outputDir: '/root/training-v44',
      });
      const jsonl = createBalancedDataset(3);
      const result = integration.process(jsonl);

      expect(result.config.dataset.trainPath).toBe('/root/training-v44/alpaca-train.jsonl');
      expect(result.config.dataset.validationPath).toBe('/root/training-v44/alpaca-val.jsonl');
    });
  });

  // ---------------------------------------------------------------------------
  // JSONL Serialization
  // ---------------------------------------------------------------------------

  describe('serializeJsonl', () => {
    it('produces one JSON object per line', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(3);
      const result = integration.process(jsonl);

      const trainLines = result.trainJsonl.split('\n').filter((l) => l.trim());
      expect(trainLines).toHaveLength(result.split.stats.trainCount);

      // Each line must be parseable JSON
      for (const line of trainLines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('serialized entries contain all required Alpaca fields', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(3);
      const result = integration.process(jsonl);

      const trainLines = result.trainJsonl.split('\n').filter((l) => l.trim());
      for (const line of trainLines) {
        const parsed = JSON.parse(line);
        expect(parsed).toHaveProperty('instruction');
        expect(parsed).toHaveProperty('input');
        expect(parsed).toHaveProperty('output');
        expect(parsed).toHaveProperty('sampling_weight');
      }
    });

    it('serialized entries are readable by TrainingMonkey format', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(3);
      const result = integration.process(jsonl);

      const trainLines = result.trainJsonl.split('\n').filter((l) => l.trim());
      for (const line of trainLines) {
        const parsed = JSON.parse(line);
        // TrainingMonkey reads: example.get("instruction"), example.get("output")
        expect(typeof parsed.instruction).toBe('string');
        expect(parsed.instruction.length).toBeGreaterThan(0);
        expect(typeof parsed.output).toBe('string');
        expect(parsed.output.length).toBeGreaterThan(0);
      }
    });

    it('config JSON is valid and parseable', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(3);
      const result = integration.process(jsonl);

      const config = JSON.parse(result.configJson);
      expect(config).toHaveProperty('model');
      expect(config).toHaveProperty('hyperparameters');
      expect(config).toHaveProperty('lrSchedule');
      expect(config).toHaveProperty('dataset');
      expect(config).toHaveProperty('softDedup');
    });
  });

  // ---------------------------------------------------------------------------
  // End-to-End Pipeline
  // ---------------------------------------------------------------------------

  describe('process (end-to-end pipeline)', () => {
    it('produces complete IntegrationResult', () => {
      const integration = new TrainingMonkeyIntegration({
        outputDir: '/output',
        seed: 42,
      });
      const jsonl = createBalancedDataset(5);
      const result = integration.process(jsonl);

      expect(result).toHaveProperty('split');
      expect(result).toHaveProperty('config');
      expect(result).toHaveProperty('trainJsonl');
      expect(result).toHaveProperty('validationJsonl');
      expect(result).toHaveProperty('configJson');
    });

    it('pipeline is idempotent with same seed', () => {
      const jsonl = createBalancedDataset(5);

      const result1 = new TrainingMonkeyIntegration({ seed: 42 }).process(jsonl);
      const result2 = new TrainingMonkeyIntegration({ seed: 42 }).process(jsonl);

      expect(result1.trainJsonl).toBe(result2.trainJsonl);
      expect(result1.validationJsonl).toBe(result2.validationJsonl);
      expect(result1.configJson).toBe(result2.configJson);
    });

    it('handles dataset with only one relationship type', () => {
      const entries: string[] = [];
      for (let i = 0; i < 20; i++) {
        entries.push(makeEntry(`adj-${i}`, 'spatial_adjacent', 'basic', i % 2 === 0));
      }

      const integration = new TrainingMonkeyIntegration();
      const result = integration.process(buildJsonl(entries));

      expect(result.split.stats.totalExamples).toBe(20);
      expect(result.split.stats.trainCount + result.split.stats.validationCount).toBe(20);
    });

    it('handles dataset with mixed scene/no-scene entries', () => {
      const entries: string[] = [
        makeEntry('with-scene', 'spatial_adjacent', 'basic', true, true),
        makeEntry('no-scene', 'spatial_adjacent', 'basic', true, false),
      ];

      const integration = new TrainingMonkeyIntegration();
      const result = integration.process(buildJsonl(entries));

      expect(result.split.stats.totalExamples).toBe(2);
    });

    it('handles larger dataset (500+ entries)', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(60); // 3*3*60 = 540 entries

      const result = integration.process(jsonl);
      expect(result.split.stats.totalExamples).toBe(540);
      expect(result.split.stats.trainCount).toBeGreaterThan(400);
      expect(result.split.stats.validationCount).toBeGreaterThan(40);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('handles entries without metadata gracefully in non-stratified mode', () => {
      const entries = [
        JSON.stringify({
          instruction: 'Question 1?',
          response: 'Answer 1.',
        }),
        JSON.stringify({
          instruction: 'Question 2?',
          response: 'Answer 2.',
        }),
      ];

      const integration = new TrainingMonkeyIntegration({ stratify: false });
      const result = integration.process(buildJsonl(entries));

      expect(result.split.stats.totalExamples).toBe(2);
      expect(result.split.stats.stratified).toBe(false);
    });

    it('handles entries with metadata.tags as array', () => {
      const integration = new TrainingMonkeyIntegration();
      const entry = JSON.stringify({
        instruction: 'Test question?',
        response: 'Test answer.',
        metadata: {
          id: 'tag-test',
          relationship_type: 'spatial_adjacent',
          is_positive: true,
          difficulty: 'basic',
          tags: ['tag1', 'tag2', 'tag3'],
        },
      });

      const result = integration.process(entry);
      expect(result.split.stats.totalExamples).toBe(1);
    });

    it('handles very long instruction text', () => {
      const longInstruction = 'A'.repeat(10000);
      const entry = JSON.stringify({
        instruction: longInstruction,
        response: 'Short answer.',
        metadata: {
          id: 'long-test',
          relationship_type: 'spatial_adjacent',
          is_positive: true,
          difficulty: 'basic',
          tags: [],
        },
      });

      const integration = new TrainingMonkeyIntegration();
      const result = integration.process(entry);
      expect(result.split.stats.totalExamples).toBe(1);
    });

    it('config totalSteps is correct for small datasets', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = buildJsonl([makeEntry('small-1'), makeEntry('small-2'), makeEntry('small-3')]);
      const result = integration.process(jsonl);

      // With 3 entries, ~3 train examples, effective batch 32
      // stepsPerEpoch = ceil(trainCount / 32), totalSteps = stepsPerEpoch * 2
      const effectiveBatch = 8 * 4;
      const expected = Math.ceil(result.split.stats.trainCount / effectiveBatch) * 2;
      expect(result.config.dataset.totalSteps).toBe(expected);
    });
  });

  // ---------------------------------------------------------------------------
  // Data Integrity Checks
  // ---------------------------------------------------------------------------

  describe('data integrity', () => {
    it('no data is lost during pipeline (train + val = total)', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(15);
      const result = integration.process(jsonl);

      const totalInput = jsonl.split('\n').filter((l) => l.trim()).length;
      const totalOutput = result.split.stats.trainCount + result.split.stats.validationCount;

      expect(totalOutput).toBe(totalInput);
    });

    it('all entries retain their original content through pipeline', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = buildJsonl([
        makeEntry('integrity-1', 'spatial_adjacent', 'basic', true),
        makeEntry('integrity-2', 'spatial_contains', 'intermediate', false),
        makeEntry('integrity-3', 'spatial_reachable', 'advanced', true),
      ]);

      const result = integration.process(jsonl);
      const allEntries = [...result.split.train, ...result.split.validation];

      // Each original entry should be in the output
      const ids = allEntries
        .filter((e) => e.metadata)
        .map((e) => e.metadata!.id)
        .sort();
      expect(ids).toEqual(['integrity-1', 'integrity-2', 'integrity-3']);
    });

    it('sampling_weight values are always in valid range', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(30);
      const result = integration.process(jsonl);

      const allEntries = [...result.split.train, ...result.split.validation];
      for (const entry of allEntries) {
        expect(entry.sampling_weight).toBeGreaterThanOrEqual(0.1);
        expect(entry.sampling_weight).toBeLessThanOrEqual(1.0);
      }
    });

    it('output JSONL line count matches entry count', () => {
      const integration = new TrainingMonkeyIntegration();
      const jsonl = createBalancedDataset(10);
      const result = integration.process(jsonl);

      const trainLineCount = result.trainJsonl.split('\n').filter((l) => l.trim()).length;
      const valLineCount = result.validationJsonl.split('\n').filter((l) => l.trim()).length;

      expect(trainLineCount).toBe(result.split.stats.trainCount);
      expect(valLineCount).toBe(result.split.stats.validationCount);
    });
  });
});
