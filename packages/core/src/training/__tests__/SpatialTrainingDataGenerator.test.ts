import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpatialTrainingDataGenerator,
  createSpatialTrainingDataGenerator,
} from '../SpatialTrainingDataGenerator';
import type {
  SpatialTrainingExample,
  SpatialGeneratorConfig,
  SpatialDifficulty,
  SpatialRelationshipType,
  SpatialTrainingJSONLEntry,
} from '../SpatialTrainingDataTypes';

// =============================================================================
// HELPERS
// =============================================================================

const FIXED_SEED = 42;

function createSeededGenerator(
  overrides: Partial<SpatialGeneratorConfig> = {}
): SpatialTrainingDataGenerator {
  return new SpatialTrainingDataGenerator({
    seed: FIXED_SEED,
    ...overrides,
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('SpatialTrainingDataGenerator', () => {
  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  describe('initialization', () => {
    it('should create a generator with default config', () => {
      const gen = new SpatialTrainingDataGenerator();
      expect(gen).toBeDefined();
    });

    it('should create a generator via factory function', () => {
      const gen = createSpatialTrainingDataGenerator();
      expect(gen).toBeDefined();
    });

    it('should create a generator with custom config', () => {
      const gen = new SpatialTrainingDataGenerator({
        examplesPerCategory: 5,
        seed: 123,
        positiveRatio: 0.7,
      });
      expect(gen).toBeDefined();
    });

    it('should accept all configuration options', () => {
      const config: SpatialGeneratorConfig = {
        examplesPerCategory: 3,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
        positiveRatio: 0.6,
        seed: 99,
        includeContext: false,
      };
      const gen = new SpatialTrainingDataGenerator(config);
      expect(gen).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Generation: basic output structure
  // ---------------------------------------------------------------------------

  describe('generate()', () => {
    let gen: SpatialTrainingDataGenerator;

    beforeEach(() => {
      gen = createSeededGenerator({ examplesPerCategory: 3 });
    });

    it('should generate examples', () => {
      const examples = gen.generate();
      expect(examples.length).toBeGreaterThan(0);
    });

    it('should generate expected number of examples', () => {
      // 3 relationship types x 3 difficulty levels x 3 examples per category = 27
      const examples = gen.generate();
      expect(examples.length).toBe(27);
    });

    it('should generate examples with required fields', () => {
      const examples = gen.generate();
      for (const ex of examples) {
        expect(ex.id).toBeDefined();
        expect(ex.id.length).toBeGreaterThan(0);
        expect(ex.instruction).toBeDefined();
        expect(ex.instruction.length).toBeGreaterThan(0);
        expect(ex.response).toBeDefined();
        expect(ex.response.length).toBeGreaterThan(0);
        expect(ex.context).toBeDefined();
        expect(ex.context.length).toBeGreaterThan(0);
        expect(ex.relationshipType).toBeDefined();
        expect(ex.difficulty).toBeDefined();
        expect(ex.tags).toBeDefined();
        expect(ex.tags.length).toBeGreaterThan(0);
        expect(typeof ex.isPositive).toBe('boolean');
      }
    });

    it('should produce unique IDs for all examples', () => {
      const examples = gen.generate();
      const ids = examples.map((ex) => ex.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should produce valid HoloScript in context', () => {
      const examples = gen.generate();
      for (const ex of examples) {
        expect(ex.context).toContain('composition "SpatialScene"');
        expect(ex.context).toContain('{');
        expect(ex.context).toContain('}');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Reproducibility (seeded RNG)
  // ---------------------------------------------------------------------------

  describe('reproducibility', () => {
    it('should produce identical output with same seed', () => {
      const gen1 = createSeededGenerator({ examplesPerCategory: 5 });
      const gen2 = createSeededGenerator({ examplesPerCategory: 5 });

      const examples1 = gen1.generate();
      const examples2 = gen2.generate();

      expect(examples1.length).toBe(examples2.length);
      for (let i = 0; i < examples1.length; i++) {
        expect(examples1[i].instruction).toBe(examples2[i].instruction);
        expect(examples1[i].response).toBe(examples2[i].response);
        expect(examples1[i].context).toBe(examples2[i].context);
      }
    });

    it('should produce different output with different seeds', () => {
      const gen1 = new SpatialTrainingDataGenerator({ seed: 1, examplesPerCategory: 5 });
      const gen2 = new SpatialTrainingDataGenerator({ seed: 2, examplesPerCategory: 5 });

      const examples1 = gen1.generate();
      const examples2 = gen2.generate();

      // At least some examples should differ
      let diffCount = 0;
      for (let i = 0; i < Math.min(examples1.length, examples2.length); i++) {
        if (examples1[i].instruction !== examples2[i].instruction) {
          diffCount++;
        }
      }
      expect(diffCount).toBeGreaterThan(0);
    });

    it('should allow reseed for fresh generation', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const first = gen.generate();

      gen.reseed(FIXED_SEED);
      const second = gen.generate();

      expect(first.length).toBe(second.length);
      for (let i = 0; i < first.length; i++) {
        expect(first[i].instruction).toBe(second[i].instruction);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Relationship type coverage
  // ---------------------------------------------------------------------------

  describe('relationship types', () => {
    it('should generate spatial_adjacent examples', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_adjacent'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.relationshipType).toBe('spatial_adjacent');
      }
    });

    it('should generate spatial_contains examples', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_contains'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.relationshipType).toBe('spatial_contains');
      }
    });

    it('should generate spatial_reachable examples', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_reachable'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.relationshipType).toBe('spatial_reachable');
      }
    });

    it('should include spatial constraint traits in HoloScript context', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 5 });
      const examples = gen.generate();

      const adjacentExamples = examples.filter((e) => e.relationshipType === 'spatial_adjacent');
      for (const ex of adjacentExamples) {
        expect(ex.context).toContain('@spatial_adjacent');
      }

      const containsExamples = examples.filter((e) => e.relationshipType === 'spatial_contains');
      for (const ex of containsExamples) {
        expect(ex.context).toContain('@spatial_contains');
      }

      const reachableExamples = examples.filter((e) => e.relationshipType === 'spatial_reachable');
      for (const ex of reachableExamples) {
        expect(ex.context).toContain('@spatial_reachable');
      }
    });

    it('should generate for specific relationship type', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generateForRelationship('spatial_contains');

      expect(examples.length).toBe(9); // 3 difficulties x 3 examples
      for (const ex of examples) {
        expect(ex.relationshipType).toBe('spatial_contains');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Positive / Negative examples
  // ---------------------------------------------------------------------------

  describe('positive and negative examples', () => {
    it('should generate both positive and negative examples', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 20 });
      const examples = gen.generate();

      const positive = examples.filter((e) => e.isPositive);
      const negative = examples.filter((e) => !e.isPositive);

      expect(positive.length).toBeGreaterThan(0);
      expect(negative.length).toBeGreaterThan(0);
    });

    it('should respect positiveRatio configuration', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 100,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
        positiveRatio: 0.7,
      });
      const examples = gen.generate();

      const positiveCount = examples.filter((e) => e.isPositive).length;
      const ratio = positiveCount / examples.length;

      // Allow some variance due to randomness
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(0.9);
    });

    it('should generate positive adjacent examples with objects within maxDistance', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_adjacent'],
        examplesPerCategory: 20,
        difficultyLevels: ['basic'],
        positiveRatio: 1.0,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(true);
        // Positive adjacent responses should indicate objects are close enough
        expect(ex.response.toLowerCase()).toMatch(
          /yes|satisf|pass|within|close|proper|no violation/i
        );
      }
    });

    it('should generate negative adjacent examples with objects beyond maxDistance', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_adjacent'],
        examplesPerCategory: 20,
        difficultyLevels: ['basic'],
        positiveRatio: 0.0,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(false);
        // Negative adjacent responses should indicate objects are too far
        expect(ex.response.toLowerCase()).toMatch(
          /no|exceed|fail|violat|not|outside|too far|improper|break/i
        );
      }
    });

    it('should generate positive contains examples with objects inside bounds', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_contains'],
        examplesPerCategory: 10,
        difficultyLevels: ['basic'],
        positiveRatio: 1.0,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(true);
      }
    });

    it('should generate negative contains examples with objects outside bounds', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_contains'],
        examplesPerCategory: 10,
        difficultyLevels: ['basic'],
        positiveRatio: 0.0,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(false);
      }
    });

    it('should generate positive reachable examples with clear paths', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_reachable'],
        examplesPerCategory: 10,
        difficultyLevels: ['basic'],
        positiveRatio: 1.0,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(true);
      }
    });

    it('should generate negative reachable examples with blocked paths', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_reachable'],
        examplesPerCategory: 10,
        difficultyLevels: ['intermediate', 'advanced'],
        positiveRatio: 0.0,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(false);
      }
    });

    it('should tag positive and negative examples correctly', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 10 });
      const examples = gen.generate();

      for (const ex of examples) {
        if (ex.isPositive) {
          expect(ex.tags).toContain('positive');
          expect(ex.tags).not.toContain('negative');
        } else {
          expect(ex.tags).toContain('negative');
          expect(ex.tags).not.toContain('positive');
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Difficulty levels
  // ---------------------------------------------------------------------------

  describe('difficulty levels', () => {
    it('should generate basic difficulty examples (2 objects)', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['basic'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.difficulty).toBe('basic');
      }
    });

    it('should generate intermediate difficulty examples (3-5 objects)', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['intermediate'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.difficulty).toBe('intermediate');
      }
    });

    it('should generate advanced difficulty examples (6+ objects)', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['advanced'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.difficulty).toBe('advanced');
      }
    });

    it('should generate for specific difficulty level', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generateForDifficulty('intermediate');

      expect(examples.length).toBe(9); // 3 rel types x 3 examples
      for (const ex of examples) {
        expect(ex.difficulty).toBe('intermediate');
      }
    });

    it('should include more objects in advanced scenes', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['advanced'],
        relationshipTypes: ['spatial_adjacent'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        // Advanced scenes should have more object declarations
        const objectMatches = ex.context.match(/object\s+"/g);
        expect(objectMatches).toBeDefined();
        expect(objectMatches!.length).toBeGreaterThanOrEqual(4);
      }
    });

    it('should have basic scenes with minimal objects', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['basic'],
        relationshipTypes: ['spatial_adjacent'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        const objectMatches = ex.context.match(/object\s+"/g);
        expect(objectMatches).toBeDefined();
        expect(objectMatches!.length).toBe(2);
      }
    });

    it('should include nested containment in advanced contains scenes', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['advanced'],
        relationshipTypes: ['spatial_contains'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      // At least some advanced contains scenes should have nested zones
      const scenesWithMultipleZones = examples.filter((ex) => {
        const zoneMatches = ex.context.match(/zone\s+"/g);
        return zoneMatches && zoneMatches.length >= 2;
      });
      expect(scenesWithMultipleZones.length).toBeGreaterThan(0);
    });

    it('should include obstacles in advanced reachable scenes', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['advanced'],
        relationshipTypes: ['spatial_reachable'],
        examplesPerCategory: 5,
      });
      const examples = gen.generate();

      // Advanced reachable scenes should have obstacle objects
      const scenesWithObstacles = examples.filter((ex) => {
        return ex.context.includes('@static') || ex.context.includes('@collidable');
      });
      expect(scenesWithObstacles.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Template diversity (G.002 mandate: 10+ templates)
  // ---------------------------------------------------------------------------

  describe('template diversity (G.002 compliance)', () => {
    it('should use 10+ templates for spatial_adjacent', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 50,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const templateTags = new Set<string>();
      for (const ex of examples) {
        const tplTag = ex.tags.find((t) => t.startsWith('template:'));
        if (tplTag) templateTags.add(tplTag);
      }

      expect(templateTags.size).toBeGreaterThanOrEqual(10);
    });

    it('should use 10+ templates for spatial_contains', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 50,
        relationshipTypes: ['spatial_contains'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const templateTags = new Set<string>();
      for (const ex of examples) {
        const tplTag = ex.tags.find((t) => t.startsWith('template:'));
        if (tplTag) templateTags.add(tplTag);
      }

      expect(templateTags.size).toBeGreaterThanOrEqual(10);
    });

    it('should use 10+ templates for spatial_reachable', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 50,
        relationshipTypes: ['spatial_reachable'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const templateTags = new Set<string>();
      for (const ex of examples) {
        const tplTag = ex.tags.find((t) => t.startsWith('template:'));
        if (tplTag) templateTags.add(tplTag);
      }

      expect(templateTags.size).toBeGreaterThanOrEqual(10);
    });

    it('should produce diverse instruction texts (no single template dominates)', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 30,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      // Count template usage
      const templateCounts = new Map<string, number>();
      for (const ex of examples) {
        const tplTag = ex.tags.find((t) => t.startsWith('template:')) ?? 'unknown';
        templateCounts.set(tplTag, (templateCounts.get(tplTag) ?? 0) + 1);
      }

      // No single template should account for more than 40% of examples
      for (const [, count] of templateCounts) {
        expect(count / examples.length).toBeLessThan(0.4);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // HoloScript source generation
  // ---------------------------------------------------------------------------

  describe('HoloScript source generation', () => {
    it('should generate valid composition blocks', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 5 });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toMatch(/^composition\s+"SpatialScene"\s+\{/);
        expect(ex.context.endsWith('}')).toBe(true);
      }
    });

    it('should include object positions in HoloScript', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 5 });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toMatch(/position:\s+\[[\d\-.,\s]+\]/);
      }
    });

    it('should include geometry types in object blocks', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 5,
        relationshipTypes: ['spatial_adjacent'],
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toMatch(/geometry:\s+"\w+"/);
      }
    });

    it('should include spatial_adjacent trait with parameters', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 5,
        relationshipTypes: ['spatial_adjacent'],
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toMatch(
          /@spatial_adjacent\(target:\s+"[^"]+",\s+maxDistance:\s+[\d.]+m\)/
        );
      }
    });

    it('should include spatial_contains trait with parameters', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 5,
        relationshipTypes: ['spatial_contains'],
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toMatch(/@spatial_contains\(target:\s+"[^"]+"/);
      }
    });

    it('should include spatial_reachable trait with parameters', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 5,
        relationshipTypes: ['spatial_reachable'],
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toMatch(/@spatial_reachable\(target:\s+"[^"]+"/);
      }
    });

    it('should include zone blocks for containment scenes', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 5,
        relationshipTypes: ['spatial_contains'],
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.context).toContain('zone "');
        expect(ex.context).toContain('shape: "box"');
        expect(ex.context).toContain('size:');
      }
    });

    it('should include obstacle markers in reachable scenes', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 10,
        relationshipTypes: ['spatial_reachable'],
        difficultyLevels: ['intermediate', 'advanced'],
      });
      const examples = gen.generate();

      const withObstacles = examples.filter(
        (ex) => ex.context.includes('@static') || ex.context.includes('@collidable')
      );
      expect(withObstacles.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Scene generation
  // ---------------------------------------------------------------------------

  describe('scene generation', () => {
    it('should generate adjacent scenes', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_adjacent', 'basic', true);

      expect(scene.name).toContain('Adjacent');
      expect(scene.objects.length).toBe(2);
      expect(scene.relationships.length).toBe(1);
      expect(scene.relationships[0].type).toBe('spatial_adjacent');
      expect(scene.difficulty).toBe('basic');
    });

    it('should generate contains scenes', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_contains', 'basic', true);

      expect(scene.name).toContain('Contains');
      expect(scene.objects.length).toBeGreaterThanOrEqual(2);
      expect(scene.relationships.length).toBe(1);
      expect(scene.relationships[0].type).toBe('spatial_contains');
    });

    it('should generate reachable scenes', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_reachable', 'basic', true);

      expect(scene.name).toContain('Reachable');
      expect(scene.objects.length).toBeGreaterThanOrEqual(2);
      expect(scene.relationships.length).toBe(1);
      expect(scene.relationships[0].type).toBe('spatial_reachable');
    });

    it('should include HoloScript source in scene', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_adjacent', 'basic', true);

      expect(scene.holoScriptSource).toBeDefined();
      expect(scene.holoScriptSource.length).toBeGreaterThan(0);
      expect(scene.holoScriptSource).toContain('composition');
    });

    it('should generate positive adjacent scenes with satisfied constraint', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_adjacent', 'basic', true);

      expect(scene.relationships[0].satisfied).toBe(true);
    });

    it('should generate negative adjacent scenes with violated constraint', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_adjacent', 'basic', false);

      expect(scene.relationships[0].satisfied).toBe(false);
    });

    it('should generate positive contains scenes with object inside bounds', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_contains', 'basic', true);

      expect(scene.relationships[0].satisfied).toBe(true);
    });

    it('should generate negative contains scenes with object outside bounds', () => {
      const gen = createSeededGenerator();
      const scene = gen.generateScene('spatial_contains', 'basic', false);

      expect(scene.relationships[0].satisfied).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // JSONL export
  // ---------------------------------------------------------------------------

  describe('JSONL export', () => {
    it('should export valid JSONL', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const jsonl = gen.exportJSONL(examples);

      expect(jsonl).toBeDefined();
      expect(jsonl.length).toBeGreaterThan(0);

      const lines = jsonl.split('\n');
      expect(lines.length).toBe(examples.length);

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should include instruction and response fields in each JSONL entry', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const jsonl = gen.exportJSONL(examples);

      const lines = jsonl.split('\n');
      for (const line of lines) {
        const entry: SpatialTrainingJSONLEntry = JSON.parse(line);
        expect(entry.instruction).toBeDefined();
        expect(entry.instruction.length).toBeGreaterThan(0);
        expect(entry.response).toBeDefined();
        expect(entry.response.length).toBeGreaterThan(0);
      }
    });

    it('should include metadata in JSONL entries', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const jsonl = gen.exportJSONL(examples);

      const lines = jsonl.split('\n');
      for (const line of lines) {
        const entry: SpatialTrainingJSONLEntry = JSON.parse(line);
        expect(entry.metadata).toBeDefined();
        expect(entry.metadata.id).toBeDefined();
        expect(entry.metadata.relationship_type).toBeDefined();
        expect(typeof entry.metadata.is_positive).toBe('boolean');
        expect(entry.metadata.difficulty).toBeDefined();
        expect(entry.metadata.tags).toBeDefined();
      }
    });

    it('should include HoloScript context when includeContext is true', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 3,
        includeContext: true,
      });
      const examples = gen.generate();
      const jsonl = gen.exportJSONL(examples);

      const lines = jsonl.split('\n');
      for (const line of lines) {
        const entry: SpatialTrainingJSONLEntry = JSON.parse(line);
        expect(entry.instruction).toContain('HoloScript Scene:');
        expect(entry.instruction).toContain('```holoscript');
      }
    });

    it('should exclude HoloScript context when includeContext is false', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 3,
        includeContext: false,
      });
      const examples = gen.generate();
      const jsonl = gen.exportJSONL(examples);

      const lines = jsonl.split('\n');
      for (const line of lines) {
        const entry: SpatialTrainingJSONLEntry = JSON.parse(line);
        expect(entry.instruction).not.toContain('HoloScript Scene:');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // JSON export
  // ---------------------------------------------------------------------------

  describe('JSON export', () => {
    it('should export valid JSON', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const json = gen.exportJSON(examples);

      expect(json).toBeDefined();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(examples.length);
    });

    it('should preserve all example fields in JSON export', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const json = gen.exportJSON(examples);
      const parsed: SpatialTrainingExample[] = JSON.parse(json);

      for (let i = 0; i < examples.length; i++) {
        expect(parsed[i].id).toBe(examples[i].id);
        expect(parsed[i].instruction).toBe(examples[i].instruction);
        expect(parsed[i].response).toBe(examples[i].response);
        expect(parsed[i].relationshipType).toBe(examples[i].relationshipType);
        expect(parsed[i].isPositive).toBe(examples[i].isPositive);
        expect(parsed[i].difficulty).toBe(examples[i].difficulty);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  describe('getStats()', () => {
    it('should return correct total count', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const stats = gen.getStats(examples);

      expect(stats.totalExamples).toBe(examples.length);
    });

    it('should break down by relationship type', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const stats = gen.getStats(examples);

      expect(stats.byRelationship.spatial_adjacent).toBeGreaterThan(0);
      expect(stats.byRelationship.spatial_contains).toBeGreaterThan(0);
      expect(stats.byRelationship.spatial_reachable).toBeGreaterThan(0);

      const relTotal =
        stats.byRelationship.spatial_adjacent +
        stats.byRelationship.spatial_contains +
        stats.byRelationship.spatial_reachable;
      expect(relTotal).toBe(stats.totalExamples);
    });

    it('should break down by difficulty', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 3 });
      const examples = gen.generate();
      const stats = gen.getStats(examples);

      expect(stats.byDifficulty.basic).toBeGreaterThan(0);
      expect(stats.byDifficulty.intermediate).toBeGreaterThan(0);
      expect(stats.byDifficulty.advanced).toBeGreaterThan(0);

      const diffTotal =
        stats.byDifficulty.basic + stats.byDifficulty.intermediate + stats.byDifficulty.advanced;
      expect(diffTotal).toBe(stats.totalExamples);
    });

    it('should count positive and negative examples', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 10 });
      const examples = gen.generate();
      const stats = gen.getStats(examples);

      expect(stats.positiveCount + stats.negativeCount).toBe(stats.totalExamples);
      expect(stats.positiveCount).toBeGreaterThan(0);
      expect(stats.negativeCount).toBeGreaterThan(0);
    });

    it('should track unique templates used', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 20 });
      const examples = gen.generate();
      const stats = gen.getStats(examples);

      expect(stats.uniqueTemplatesUsed).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Randomized scene parameters
  // ---------------------------------------------------------------------------

  describe('randomized scene parameters', () => {
    it('should randomize object positions', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 10,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      // Extract positions from HoloScript source
      const positions = new Set<string>();
      for (const ex of examples) {
        const matches = ex.context.match(/position:\s+\[([^\]]+)\]/g);
        if (matches) {
          for (const m of matches) {
            positions.add(m);
          }
        }
      }

      // Should have diverse positions (not all the same)
      expect(positions.size).toBeGreaterThan(5);
    });

    it('should randomize object scales', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 10,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['intermediate'],
      });
      const examples = gen.generate();

      const scales = new Set<string>();
      for (const ex of examples) {
        const matches = ex.context.match(/scale:\s+\[([^\]]+)\]/g);
        if (matches) {
          for (const m of matches) {
            scales.add(m);
          }
        }
      }

      expect(scales.size).toBeGreaterThan(3);
    });

    it('should randomize maxDistance for adjacent constraints', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 10,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const distances = new Set<string>();
      for (const ex of examples) {
        const match = ex.context.match(/maxDistance:\s+([\d.]+)m/);
        if (match) {
          distances.add(match[1]);
        }
      }

      expect(distances.size).toBeGreaterThan(3);
    });

    it('should randomize container sizes for contains constraints', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 10,
        relationshipTypes: ['spatial_contains'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const sizes = new Set<string>();
      for (const ex of examples) {
        const match = ex.context.match(/size:\s+\[([^\]]+)\]/);
        if (match) {
          sizes.add(match[1]);
        }
      }

      expect(sizes.size).toBeGreaterThan(3);
    });

    it('should use diverse object names', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 10,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const names = new Set<string>();
      for (const ex of examples) {
        const matches = ex.context.match(/object\s+"([^"]+)"/g);
        if (matches) {
          for (const m of matches) {
            names.add(m);
          }
        }
      }

      expect(names.size).toBeGreaterThan(5);
    });

    it('should use diverse geometry types', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: FIXED_SEED,
        examplesPerCategory: 20,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      const geoTypes = new Set<string>();
      for (const ex of examples) {
        const matches = ex.context.match(/geometry:\s+"(\w+)"/g);
        if (matches) {
          for (const m of matches) {
            geoTypes.add(m);
          }
        }
      }

      expect(geoTypes.size).toBeGreaterThan(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle single relationship type', () => {
      const gen = createSeededGenerator({
        relationshipTypes: ['spatial_adjacent'],
        examplesPerCategory: 3,
      });
      const examples = gen.generate();

      expect(examples.length).toBe(9); // 1 type x 3 difficulties x 3 examples
      for (const ex of examples) {
        expect(ex.relationshipType).toBe('spatial_adjacent');
      }
    });

    it('should handle single difficulty level', () => {
      const gen = createSeededGenerator({
        difficultyLevels: ['basic'],
        examplesPerCategory: 3,
      });
      const examples = gen.generate();

      expect(examples.length).toBe(9); // 3 types x 1 difficulty x 3 examples
      for (const ex of examples) {
        expect(ex.difficulty).toBe('basic');
      }
    });

    it('should handle examplesPerCategory = 1', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 1 });
      const examples = gen.generate();

      expect(examples.length).toBe(9); // 3 types x 3 difficulties x 1
    });

    it('should handle positiveRatio = 1.0 (all positive)', () => {
      const gen = createSeededGenerator({
        positiveRatio: 1.0,
        examplesPerCategory: 10,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(true);
      }
    });

    it('should handle positiveRatio = 0.0 (all negative)', () => {
      const gen = createSeededGenerator({
        positiveRatio: 0.0,
        examplesPerCategory: 10,
      });
      const examples = gen.generate();

      for (const ex of examples) {
        expect(ex.isPositive).toBe(false);
      }
    });

    it('should handle large generation counts', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 100,
        relationshipTypes: ['spatial_adjacent'],
        difficultyLevels: ['basic'],
      });
      const examples = gen.generate();

      expect(examples.length).toBe(100);
      // All IDs should still be unique
      const ids = new Set(examples.map((e) => e.id));
      expect(ids.size).toBe(100);
    });

    it('should not crash with zero examples per category', () => {
      const gen = createSeededGenerator({ examplesPerCategory: 0 });
      const examples = gen.generate();

      expect(examples.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration: full pipeline
  // ---------------------------------------------------------------------------

  describe('full pipeline integration', () => {
    it('should generate, export, and parse a complete JSONL dataset', () => {
      const gen = new SpatialTrainingDataGenerator({
        seed: 12345,
        examplesPerCategory: 5,
        relationshipTypes: ['spatial_adjacent', 'spatial_contains', 'spatial_reachable'],
        difficultyLevels: ['basic', 'intermediate', 'advanced'],
        positiveRatio: 0.5,
        includeContext: true,
      });

      // Generate
      const examples = gen.generate();
      expect(examples.length).toBe(45); // 3 types x 3 difficulties x 5 examples

      // Export JSONL
      const jsonl = gen.exportJSONL(examples);
      const lines = jsonl.split('\n');
      expect(lines.length).toBe(45);

      // Verify each line is valid
      for (const line of lines) {
        const entry = JSON.parse(line) as SpatialTrainingJSONLEntry;
        expect(entry.instruction.length).toBeGreaterThan(10);
        expect(entry.response.length).toBeGreaterThan(10);
        expect(['spatial_adjacent', 'spatial_contains', 'spatial_reachable']).toContain(
          entry.metadata.relationship_type
        );
        expect(['basic', 'intermediate', 'advanced']).toContain(entry.metadata.difficulty);
      }

      // Get stats
      const stats = gen.getStats(examples);
      expect(stats.totalExamples).toBe(45);
      expect(stats.byRelationship.spatial_adjacent).toBe(15);
      expect(stats.byRelationship.spatial_contains).toBe(15);
      expect(stats.byRelationship.spatial_reachable).toBe(15);
      expect(stats.byDifficulty.basic).toBe(15);
      expect(stats.byDifficulty.intermediate).toBe(15);
      expect(stats.byDifficulty.advanced).toBe(15);
    });

    it('should produce training-quality instruction-response pairs', () => {
      const gen = createSeededGenerator({
        examplesPerCategory: 5,
        includeContext: true,
      });

      const examples = gen.generate();

      for (const ex of examples) {
        // Instructions should be questions or directives
        expect(ex.instruction.length).toBeGreaterThan(10);
        // Responses should be informative answers
        expect(ex.response.length).toBeGreaterThan(10);
        // Context should be valid HoloScript
        expect(ex.context).toContain('composition');

        // Responses for positive examples should indicate success/satisfaction
        if (ex.isPositive) {
          expect(ex.response.toLowerCase()).toMatch(
            /yes|satisf|pass|within|clear|contain|inside|proper|reach|no violation|maintain|unobstructed|unblocked|direct|measur/i
          );
        }
      }
    });
  });
});
