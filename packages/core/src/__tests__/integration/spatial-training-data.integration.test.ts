/**
 * Integration Test: SpatialTrainingDataGenerator -> JSONL Pipeline
 *
 * Tests the full cross-package data flow:
 *   SpatialTrainingDataGenerator
 *     -> generate() -> SpatialTrainingExample[]
 *     -> exportJSONL() -> JSONL string
 *     -> parse each line -> validate SpatialTrainingJSONLEntry structure
 *
 * Validates that the generator produces well-formed, parseable JSONL output
 * with correct metadata, instruction/response pairs, and per-G.002 template
 * diversity across all spatial relationship types and difficulty levels.
 *
 * Packages exercised: core/training (SpatialTrainingDataGenerator, SpatialTrainingDataTypes)
 */

import { describe, it, expect } from 'vitest';
import { SpatialTrainingDataGenerator } from '../../training/SpatialTrainingDataGenerator';
import type {
  SpatialTrainingJSONLEntry,
  SpatialRelationshipType,
  SpatialDifficulty,
} from '../../training/SpatialTrainingDataTypes';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Parse a JSONL string into an array of typed objects.
 * Validates each line is valid JSON and returns typed entries.
 */
function parseJSONL(jsonl: string): SpatialTrainingJSONLEntry[] {
  const lines = jsonl.split('\n').filter((line) => line.trim() !== '');
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line) as SpatialTrainingJSONLEntry;
    } catch (e) {
      throw new Error(
        `Failed to parse JSONL line ${idx + 1}: ${(e as Error).message}\nLine: ${line}`
      );
    }
  });
}

/**
 * Validate a single JSONL entry has the required structure.
 */
function validateJSONLEntry(entry: SpatialTrainingJSONLEntry): string[] {
  const errors: string[] = [];

  if (typeof entry.instruction !== 'string' || entry.instruction.length === 0) {
    errors.push('instruction must be a non-empty string');
  }
  if (typeof entry.response !== 'string' || entry.response.length === 0) {
    errors.push('response must be a non-empty string');
  }
  if (!entry.metadata) {
    errors.push('metadata must be defined');
    return errors;
  }
  if (typeof entry.metadata.id !== 'string' || entry.metadata.id.length === 0) {
    errors.push('metadata.id must be a non-empty string');
  }
  if (
    !['spatial_adjacent', 'spatial_contains', 'spatial_reachable'].includes(
      entry.metadata.relationship_type
    )
  ) {
    errors.push(
      `metadata.relationship_type must be a valid type, got: ${entry.metadata.relationship_type}`
    );
  }
  if (typeof entry.metadata.is_positive !== 'boolean') {
    errors.push('metadata.is_positive must be a boolean');
  }
  if (!['basic', 'intermediate', 'advanced'].includes(entry.metadata.difficulty)) {
    errors.push(`metadata.difficulty must be a valid level, got: ${entry.metadata.difficulty}`);
  }
  if (!Array.isArray(entry.metadata.tags)) {
    errors.push('metadata.tags must be an array');
  }

  return errors;
}

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Integration: SpatialTrainingDataGenerator -> JSONL Pipeline', () => {
  // ---------------------------------------------------------------------------
  // End-to-End JSONL Generation and Parsing
  // ---------------------------------------------------------------------------

  describe('full JSONL generation: generate -> exportJSONL -> parse', () => {
    it('generates parseable JSONL with correct structure for all categories', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 5,
      });

      // Step 1: Generate examples
      const examples = generator.generate();
      expect(examples.length).toBeGreaterThan(0);

      // Step 2: Export to JSONL
      const jsonl = generator.exportJSONL(examples);
      expect(jsonl).toBeTruthy();
      expect(typeof jsonl).toBe('string');

      // Step 3: Parse each line
      const entries = parseJSONL(jsonl);
      expect(entries.length).toBe(examples.length);

      // Step 4: Validate every entry structure
      for (let i = 0; i < entries.length; i++) {
        const errors = validateJSONLEntry(entries[i]);
        expect(
          errors,
          `Entry ${i} (${entries[i].metadata?.id}) has validation errors: ${errors.join(', ')}`
        ).toHaveLength(0);
      }
    });

    it('produces one JSON object per line (no multi-line entries)', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 123,
        examplesPerCategory: 3,
      });

      const examples = generator.generate();
      const jsonl = generator.exportJSONL(examples);
      const lines = jsonl.split('\n').filter((line) => line.trim() !== '');

      // Each line must be individually parseable
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }

      // Line count must match example count
      expect(lines.length).toBe(examples.length);
    });
  });

  // ---------------------------------------------------------------------------
  // Relationship Type Coverage
  // ---------------------------------------------------------------------------

  describe('relationship type coverage in JSONL output', () => {
    it('produces entries for all 3 spatial relationship types', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 4,
        relationshipTypes: ['spatial_adjacent', 'spatial_contains', 'spatial_reachable'],
      });

      const examples = generator.generate();
      const jsonl = generator.exportJSONL(examples);
      const entries = parseJSONL(jsonl);

      const types = new Set(entries.map((e) => e.metadata.relationship_type));
      expect(types.has('spatial_adjacent')).toBe(true);
      expect(types.has('spatial_contains')).toBe(true);
      expect(types.has('spatial_reachable')).toBe(true);
    });

    it('generates correct count per category (relationship x difficulty)', () => {
      const examplesPerCategory = 6;
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory,
      });

      const examples = generator.generate();
      const stats = generator.getStats(examples);

      // 3 relationship types x 3 difficulty levels x 6 = 54
      expect(stats.totalExamples).toBe(3 * 3 * examplesPerCategory);

      // Each relationship type should get 3 difficulty levels x examplesPerCategory
      expect(stats.byRelationship.spatial_adjacent).toBe(3 * examplesPerCategory);
      expect(stats.byRelationship.spatial_contains).toBe(3 * examplesPerCategory);
      expect(stats.byRelationship.spatial_reachable).toBe(3 * examplesPerCategory);
    });
  });

  // ---------------------------------------------------------------------------
  // Difficulty Level Coverage
  // ---------------------------------------------------------------------------

  describe('difficulty level coverage in JSONL output', () => {
    it('produces entries at all 3 difficulty levels', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 4,
      });

      const examples = generator.generate();
      const jsonl = generator.exportJSONL(examples);
      const entries = parseJSONL(jsonl);

      const difficulties = new Set(entries.map((e) => e.metadata.difficulty));
      expect(difficulties.has('basic')).toBe(true);
      expect(difficulties.has('intermediate')).toBe(true);
      expect(difficulties.has('advanced')).toBe(true);
    });

    it('generates correct count per difficulty level', () => {
      const examplesPerCategory = 5;
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory,
      });

      const examples = generator.generate();
      const stats = generator.getStats(examples);

      // Each difficulty should get 3 relationship types x examplesPerCategory
      expect(stats.byDifficulty.basic).toBe(3 * examplesPerCategory);
      expect(stats.byDifficulty.intermediate).toBe(3 * examplesPerCategory);
      expect(stats.byDifficulty.advanced).toBe(3 * examplesPerCategory);
    });
  });

  // ---------------------------------------------------------------------------
  // Template Diversity (G.002 Mandate)
  // ---------------------------------------------------------------------------

  describe('template diversity (G.002: 10+ templates per relationship type)', () => {
    it('uses 10+ unique templates when generating sufficient examples', () => {
      // Generate enough examples per category to exercise all templates
      // With 12 templates per type, generating 50 examples per category
      // should use most/all templates via random selection
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 50,
      });

      const examples = generator.generate();
      const stats = generator.getStats(examples);

      // Per G.002 mandate: must have 10+ templates
      // With 12 templates per relationship type (36 total),
      // a large enough sample should exercise most of them
      expect(stats.uniqueTemplatesUsed).toBeGreaterThanOrEqual(10);
    });

    it('tags each example with its template identifier', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 5,
      });

      const examples = generator.generate();

      for (const ex of examples) {
        const templateTag = ex.tags.find((t) => t.startsWith('template:'));
        expect(templateTag, `Example ${ex.id} should have a template tag`).toBeDefined();
        expect(templateTag).toMatch(/^template:spatial_(adjacent|contains|reachable)-\d+$/);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Positive/Negative Balance
  // ---------------------------------------------------------------------------

  describe('positive/negative example balance', () => {
    it('respects the configured positive ratio', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 100,
        positiveRatio: 0.5,
      });

      const examples = generator.generate();
      const stats = generator.getStats(examples);

      // With 0.5 ratio and large N, expect roughly equal distribution
      // Allow +/- 20% tolerance for randomness
      const totalExamples = stats.totalExamples;
      const positiveRatio = stats.positiveCount / totalExamples;
      expect(positiveRatio).toBeGreaterThan(0.3);
      expect(positiveRatio).toBeLessThan(0.7);
    });

    it('marks positive/negative correctly in JSONL metadata', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 10,
      });

      const examples = generator.generate();
      const jsonl = generator.exportJSONL(examples);
      const entries = parseJSONL(jsonl);

      // Cross-reference: each entry's metadata.is_positive should match
      // the corresponding example's isPositive
      for (let i = 0; i < entries.length; i++) {
        expect(entries[i].metadata.is_positive).toBe(examples[i].isPositive);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // HoloScript Context in JSONL Instructions
  // ---------------------------------------------------------------------------

  describe('HoloScript context embedding in JSONL', () => {
    it('includes HoloScript scene source in instruction when includeContext=true', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 3,
        includeContext: true,
      });

      const examples = generator.generate();
      const jsonl = generator.exportJSONL(examples);
      const entries = parseJSONL(jsonl);

      for (const entry of entries) {
        // With includeContext, instruction should contain the HoloScript block
        expect(entry.instruction).toContain('HoloScript Scene:');
        expect(entry.instruction).toContain('```holoscript');
        expect(entry.instruction).toContain('composition "SpatialScene"');
      }
    });

    it('omits HoloScript context when includeContext=false', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 3,
        includeContext: false,
      });

      const examples = generator.generate();
      const jsonl = generator.exportJSONL(examples);
      const entries = parseJSONL(jsonl);

      for (const entry of entries) {
        expect(entry.instruction).not.toContain('```holoscript');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Reproducibility via Seeding
  // ---------------------------------------------------------------------------

  describe('reproducibility with seeded PRNG', () => {
    it('produces identical JSONL output with the same seed', () => {
      const gen1 = new SpatialTrainingDataGenerator({ seed: 999, examplesPerCategory: 5 });
      const gen2 = new SpatialTrainingDataGenerator({ seed: 999, examplesPerCategory: 5 });

      const jsonl1 = gen1.exportJSONL(gen1.generate());
      const jsonl2 = gen2.exportJSONL(gen2.generate());

      expect(jsonl1).toBe(jsonl2);
    });

    it('produces different JSONL output with different seeds', () => {
      const gen1 = new SpatialTrainingDataGenerator({ seed: 100, examplesPerCategory: 5 });
      const gen2 = new SpatialTrainingDataGenerator({ seed: 200, examplesPerCategory: 5 });

      const jsonl1 = gen1.exportJSONL(gen1.generate());
      const jsonl2 = gen2.exportJSONL(gen2.generate());

      expect(jsonl1).not.toBe(jsonl2);
    });

    it('reseed produces different output from original', () => {
      const generator = new SpatialTrainingDataGenerator({ seed: 42, examplesPerCategory: 3 });

      const examples1 = generator.generate();
      const jsonl1 = generator.exportJSONL(examples1);

      generator.reseed(999);

      const examples2 = generator.generate();
      const jsonl2 = generator.exportJSONL(examples2);

      expect(jsonl1).not.toBe(jsonl2);
    });
  });

  // ---------------------------------------------------------------------------
  // Filtered Generation APIs
  // ---------------------------------------------------------------------------

  describe('filtered generation: generateForRelationship / generateForDifficulty', () => {
    it('generateForRelationship only produces that relationship type', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 5,
      });

      const examples = generator.generateForRelationship('spatial_adjacent');

      for (const ex of examples) {
        expect(ex.relationshipType).toBe('spatial_adjacent');
      }

      // Should produce examplesPerCategory * difficultyLevels (3) = 15
      expect(examples.length).toBe(15);
    });

    it('generateForDifficulty only produces that difficulty level', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 5,
      });

      const examples = generator.generateForDifficulty('advanced');

      for (const ex of examples) {
        expect(ex.difficulty).toBe('advanced');
      }

      // Should produce examplesPerCategory * relationshipTypes (3) = 15
      expect(examples.length).toBe(15);
    });

    it('filtered examples produce valid JSONL when exported', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 4,
      });

      const examples = generator.generateForRelationship('spatial_reachable');
      const jsonl = generator.exportJSONL(examples);
      const entries = parseJSONL(jsonl);

      for (const entry of entries) {
        const errors = validateJSONLEntry(entry);
        expect(errors).toHaveLength(0);
        expect(entry.metadata.relationship_type).toBe('spatial_reachable');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // JSON Export
  // ---------------------------------------------------------------------------

  describe('JSON export produces valid structured output', () => {
    it('exportJSON produces parseable JSON array', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 3,
      });

      const examples = generator.generate();
      const json = generator.exportJSON(examples);

      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(examples.length);

      // Each entry should have all SpatialTrainingExample fields
      for (const entry of parsed) {
        expect(entry.id).toBeTruthy();
        expect(entry.instruction).toBeTruthy();
        expect(entry.response).toBeTruthy();
        expect(entry.context).toBeTruthy();
        expect(entry.relationshipType).toBeTruthy();
        expect(typeof entry.isPositive).toBe('boolean');
        expect(entry.difficulty).toBeTruthy();
        expect(Array.isArray(entry.tags)).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Stats Consistency
  // ---------------------------------------------------------------------------

  describe('stats consistency with generated data', () => {
    it('stats totals match generated example counts', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 8,
      });

      const examples = generator.generate();
      const stats = generator.getStats(examples);

      expect(stats.totalExamples).toBe(examples.length);
      expect(stats.positiveCount + stats.negativeCount).toBe(stats.totalExamples);

      const relSum =
        stats.byRelationship.spatial_adjacent +
        stats.byRelationship.spatial_contains +
        stats.byRelationship.spatial_reachable;
      expect(relSum).toBe(stats.totalExamples);

      const diffSum =
        stats.byDifficulty.basic + stats.byDifficulty.intermediate + stats.byDifficulty.advanced;
      expect(diffSum).toBe(stats.totalExamples);
    });
  });

  // ---------------------------------------------------------------------------
  // Scene Content Validation
  // ---------------------------------------------------------------------------

  describe('generated scenes contain valid spatial data', () => {
    it('adjacent scenes reference valid source and target IDs', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 5,
      });

      const examples = generator.generateForRelationship('spatial_adjacent');

      for (const ex of examples) {
        // The context (HoloScript source) should contain the composition wrapper
        expect(ex.context).toContain('composition "SpatialScene"');
        // Should contain at least one @spatial_adjacent trait annotation
        expect(ex.context).toContain('@spatial_adjacent');
        // Both instruction and response should be non-empty
        expect(ex.instruction.length).toBeGreaterThan(10);
        expect(ex.response.length).toBeGreaterThan(10);
      }
    });

    it('contains scenes reference zone and object blocks', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 5,
      });

      const examples = generator.generateForRelationship('spatial_contains');

      for (const ex of examples) {
        expect(ex.context).toContain('composition "SpatialScene"');
        // Containment scenes should have zone definitions
        expect(ex.context).toContain('zone');
        expect(ex.context).toContain('@spatial_contains');
      }
    });

    it('reachable scenes include obstacle definitions for non-basic difficulty', () => {
      const generator = new SpatialTrainingDataGenerator({
        seed: 42,
        examplesPerCategory: 10,
      });

      const examples = generator.generateForRelationship('spatial_reachable');
      const nonBasic = examples.filter((ex) => ex.difficulty !== 'basic');

      // At least some non-basic examples should have obstacles
      // (obstacles are randomly generated, so check at least some have them)
      const withObstacles = nonBasic.filter((ex) => ex.context.includes('@collidable'));
      expect(withObstacles.length).toBeGreaterThan(0);
    });
  });
});
