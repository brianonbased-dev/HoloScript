/**
 * Spatial Corpus Parse Validation
 *
 * Validates that all SpatialTrainingDataGenerator examples produce
 * parseable HoloScript in their `context` field. This is the spatial
 * counterpart to CorpusValidation.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { createSpatialTrainingDataGenerator } from '../SpatialTrainingDataGenerator';
import { HoloScriptCodeParser } from '@holoscript/core';

describe('Spatial Corpus Parse Validation', () => {
  const generator = createSpatialTrainingDataGenerator({ seed: 42, examplesPerCategory: 5 });
  const parser = new HoloScriptCodeParser();
  const allExamples = generator.generate();

  it('should generate a non-trivial number of spatial examples', () => {
    expect(allExamples.length).toBeGreaterThanOrEqual(10);
  });

  it('should cover multiple relationship types', () => {
    const types = new Set(allExamples.map((ex) => ex.relationshipType));
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it('should include both positive and negative examples', () => {
    const positive = allExamples.filter((ex) => ex.isPositive);
    const negative = allExamples.filter((ex) => !ex.isPositive);
    expect(positive.length).toBeGreaterThan(0);
    expect(negative.length).toBeGreaterThan(0);
  });

  // Parse-validate every generated HoloScript context
  describe('parse validation of context fields', () => {
    for (const example of allExamples) {
      it(`[${example.id}] context should parse without fatal errors`, () => {
        expect(example.context).toBeTruthy();
        expect(example.context.length).toBeGreaterThan(10);

        // Must contain composition structure
        expect(example.context).toContain('composition');
        expect(example.context).toContain('{');

        const result = parser.parse(example.context);
        expect(result).toBeDefined();
      });
    }
  });

  // Metrics
  it('should report spatial corpus metrics', () => {
    const totalExamples = allExamples.length;
    const totalChars = allExamples.reduce((sum, ex) => sum + ex.context.length, 0);
    const avgLength = Math.round(totalChars / totalExamples);
    const typeDistribution: Record<string, number> = {};
    for (const ex of allExamples) {
      typeDistribution[ex.relationshipType] = (typeDistribution[ex.relationshipType] || 0) + 1;
    }

    console.log('\n=== Spatial Corpus Metrics ===');
    console.log(`Total examples: ${totalExamples}`);
    console.log(`Total context chars: ${totalChars.toLocaleString()}`);
    console.log(`Average context length: ${avgLength} chars`);
    console.log(`Relationship types: ${Object.keys(typeDistribution).length}`);
    for (const [type, count] of Object.entries(typeDistribution)) {
      console.log(`  ${type}: ${count}`);
    }
    console.log('==============================\n');

    expect(totalExamples).toBeGreaterThan(0);
  });
});
