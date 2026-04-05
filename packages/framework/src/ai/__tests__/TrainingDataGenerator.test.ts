import { describe, it, expect } from 'vitest';
import {
  TrainingDataGenerator,
  createTrainingDataGenerator,
  ALL_CATEGORIES,
  type TrainingExample,
  type TrainingCategory,
} from '../TrainingDataGenerator';

describe('TrainingDataGenerator', () => {
  describe('initialization', () => {
    it('should create generator', () => {
      const generator = new TrainingDataGenerator();
      expect(generator).toBeDefined();
    });

    it('should create generator via factory', () => {
      const generator = createTrainingDataGenerator();
      expect(generator).toBeDefined();
    });
  });

  describe('generateAll', () => {
    it('should return all examples', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generateAll();

      expect(examples.length).toBeGreaterThan(40);
    });

    it('should have required fields for each example', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generateAll();

      for (const ex of examples) {
        expect(ex.id).toBeDefined();
        expect(ex.category).toBeDefined();
        expect(ex.description).toBeDefined();
        expect(ex.holoScript).toBeDefined();
        expect(ex.tags).toBeDefined();
        expect(ex.complexity).toBeDefined();
      }
    });

    it('should have valid HoloScript code', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generateAll();

      for (const ex of examples) {
        expect(ex.holoScript.length).toBeGreaterThan(10);
        // Should contain at least one keyword
        const hasKeyword = ['object', 'composition', 'template', 'ui_', 'zone'].some((kw) =>
          ex.holoScript.includes(kw)
        );
        expect(hasKeyword).toBe(true);
      }
    });
  });

  describe('generate with options', () => {
    it('should filter by category', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generate({ categories: ['geometry'] });

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.category).toBe('geometry');
      }
    });

    it('should filter by multiple categories', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generate({ categories: ['geometry', 'materials'] });

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(['geometry', 'materials']).toContain(ex.category);
      }
    });

    it('should filter by complexity', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generate({ complexityFilter: ['basic'] });

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.complexity).toBe('basic');
      }
    });

    it('should limit count', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generate({ count: 5 });

      expect(examples.length).toBe(5);
    });

    it('should combine filters', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generate({
        categories: ['physics'],
        complexityFilter: ['basic', 'intermediate'],
        count: 3,
      });

      expect(examples.length).toBeLessThanOrEqual(3);
      for (const ex of examples) {
        expect(ex.category).toBe('physics');
        expect(['basic', 'intermediate']).toContain(ex.complexity);
      }
    });
  });

  describe('getByCategory', () => {
    it('should return geometry examples', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByCategory('geometry');

      expect(examples.length).toBeGreaterThan(5);
      for (const ex of examples) {
        expect(ex.category).toBe('geometry');
      }
    });

    it('should return UI examples', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByCategory('ui');

      expect(examples.length).toBeGreaterThan(3);
    });

    it('should return physics examples', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByCategory('physics');

      expect(examples.length).toBeGreaterThan(3);
    });
  });

  describe('getByComplexity', () => {
    it('should return basic examples', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByComplexity('basic');

      expect(examples.length).toBeGreaterThan(5);
      for (const ex of examples) {
        expect(ex.complexity).toBe('basic');
      }
    });

    it('should return advanced examples', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByComplexity('advanced');

      expect(examples.length).toBeGreaterThan(5);
      for (const ex of examples) {
        expect(ex.complexity).toBe('advanced');
      }
    });
  });

  describe('getByTag', () => {
    it('should return examples by tag', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByTag('physics');

      expect(examples.length).toBeGreaterThan(0);
      for (const ex of examples) {
        expect(ex.tags).toContain('physics');
      }
    });

    it('should find VR-related examples', () => {
      const generator = new TrainingDataGenerator();
      const vrExamples = generator.getByTag('vr');

      expect(vrExamples.length).toBeGreaterThan(0);
    });
  });

  describe('getStats', () => {
    it('should return category counts', () => {
      const generator = new TrainingDataGenerator();
      const stats = generator.getStats();

      expect(stats.geometry).toBeGreaterThan(0);
      expect(stats.materials).toBeGreaterThan(0);
      expect(stats.physics).toBeGreaterThan(0);
      expect(stats.interactions).toBeGreaterThan(0);
    });

    it('should have all categories represented', () => {
      const generator = new TrainingDataGenerator();
      const stats = generator.getStats();

      const categories = Object.keys(stats);
      expect(categories.length).toBeGreaterThanOrEqual(10);
    });
  });

  describe('export', () => {
    it('should export as JSON', () => {
      const generator = new TrainingDataGenerator();
      const json = generator.exportJSON();

      expect(json).toBeDefined();
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('should export as JSONL', () => {
      const generator = new TrainingDataGenerator();
      const jsonl = generator.exportJSONL();

      expect(jsonl).toBeDefined();
      const lines = jsonl.split('\n');
      expect(lines.length).toBeGreaterThan(0);

      // Each line should be valid JSON
      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });
  });

  describe('ALL_CATEGORIES constant', () => {
    it('should include all expected categories', () => {
      expect(ALL_CATEGORIES).toContain('geometry');
      expect(ALL_CATEGORIES).toContain('materials');
      expect(ALL_CATEGORIES).toContain('physics');
      expect(ALL_CATEGORIES).toContain('interactions');
      expect(ALL_CATEGORIES).toContain('audio');
      expect(ALL_CATEGORIES).toContain('ui');
      expect(ALL_CATEGORIES).toContain('composition');
      expect(ALL_CATEGORIES).toContain('state');
      expect(ALL_CATEGORIES).toContain('logic');
      expect(ALL_CATEGORIES).toContain('traits');
      expect(ALL_CATEGORIES).toContain('animations');
      expect(ALL_CATEGORIES).toContain('ar_vr');
    });
  });

  describe('Example content quality', () => {
    it('should have diverse examples for geometry', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.getByCategory('geometry');

      const geometryTypes = new Set(
        examples.map((ex) => {
          const match = ex.holoScript.match(/geometry:\s*"(\w+)"/);
          return match ? match[1] : null;
        })
      );

      // Should have multiple geometry types
      expect(geometryTypes.size).toBeGreaterThan(3);
    });

    it('should have examples with traits', () => {
      const generator = new TrainingDataGenerator();
      const allExamples = generator.generateAll();

      const examplesWithTraits = allExamples.filter((ex) => ex.holoScript.includes('@'));
      expect(examplesWithTraits.length).toBeGreaterThan(10);
    });

    it('should have examples with logic blocks', () => {
      const generator = new TrainingDataGenerator();
      const allExamples = generator.generateAll();

      const examplesWithLogic = allExamples.filter((ex) => ex.holoScript.includes('logic {'));
      expect(examplesWithLogic.length).toBeGreaterThan(5);
    });

    it('should have unique IDs', () => {
      const generator = new TrainingDataGenerator();
      const examples = generator.generateAll();

      const ids = examples.map((ex) => ex.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
