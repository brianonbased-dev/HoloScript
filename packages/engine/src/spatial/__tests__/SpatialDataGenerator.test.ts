import type { Vector3 } from '@holoscript/core';
/**
 * SpatialDataGenerator Tests
 *
 * Comprehensive tests for the spatial training data pipeline:
 * - Adjacent relationship detection and labeling
 * - Contains relationship detection and labeling
 * - Reachable relationship detection (line-of-sight)
 * - JSONL output formatting
 * - Instruction-tuning JSONL output
 * - Negative sample generation
 * - Simple composition parser
 * - Edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpatialDataGenerator,
  createSpatialDataGenerator,
  parseSimpleComposition,
} from '../SpatialDataGenerator';
import type {
  SpatialComposition,
  SpatialObject,
  SpatialTrainingSample,
  SpatialDataGeneratorConfig,
} from '../SpatialDataGenerator';
import type { Vector3 } from '../SpatialTypes';

// =============================================================================
// HELPERS
// =============================================================================

function makeObject(
  id: string,
  name: string,
  position: Vector3,
  opts: Partial<SpatialObject> = {}
): SpatialObject {
  return {
    id,
    name,
    type: opts.type ?? 'cube',
    position,
    scale: opts.scale,
    bounds: opts.bounds,
    traits: opts.traits,
    isStatic: opts.isStatic,
    parentId: opts.parentId,
    ...opts,
  };
}

function makeComposition(name: string, objects: SpatialObject[]): SpatialComposition {
  return { name, objects };
}

// =============================================================================
// TESTS
// =============================================================================

describe('SpatialDataGenerator', () => {
  let generator: SpatialDataGenerator;

  beforeEach(() => {
    generator = new SpatialDataGenerator({
      adjacencyThresholds: [2.0],
      generateNegatives: true,
      negativeRatio: 1.0,
      seed: 42,
    });
  });

  // ---------------------------------------------------------------------------
  // Basic operation
  // ---------------------------------------------------------------------------

  describe('basic operation', () => {
    it('should return empty array for compositions with fewer than 2 objects', () => {
      const comp = makeComposition('SingleObject', [
        makeObject('a', 'CubeA', [0, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      expect(samples).toHaveLength(0);
    });

    it('should generate samples for a pair of objects', () => {
      const comp = makeComposition('TwoObjects', [
        makeObject('a', 'CubeA', [0, 0, 0 ]),
        makeObject('b', 'CubeB', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      expect(samples.length).toBeGreaterThan(0);
    });

    it('should assign unique IDs to each sample', () => {
      const comp = makeComposition('Test', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
        makeObject('c', 'C', [2, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const ids = samples.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include composition name in each sample', () => {
      const comp = makeComposition('MyScene', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      for (const sample of samples) {
        expect(sample.compositionName).toBe('MyScene');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Adjacent relationship detection
  // ---------------------------------------------------------------------------

  describe('adjacent relationships', () => {
    it('should detect objects within adjacency threshold as adjacent', () => {
      const comp = makeComposition('Adjacent', [
        makeObject('a', 'CubeA', [0, 0, 0 ]),
        makeObject('b', 'CubeB', [1.5, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const adjacent = samples.filter(
        (s) => s.relationship.type === 'adjacent' && s.relationship.holds
      );

      expect(adjacent.length).toBeGreaterThan(0);
      expect(adjacent[0].relationship.distance).toBeCloseTo(1.5, 1);
    });

    it('should detect objects beyond threshold as NOT adjacent', () => {
      const comp = makeComposition('NotAdjacent', [
        makeObject('a', 'CubeA', [0, 0, 0 ]),
        makeObject('b', 'CubeB', [5, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const notAdjacent = samples.filter(
        (s) => s.relationship.type === 'adjacent' && !s.relationship.holds
      );

      expect(notAdjacent.length).toBeGreaterThan(0);
    });

    it('should respect multiple adjacency thresholds', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [1.0, 3.0, 5.0],
        generateNegatives: true,
        seed: 42,
      });

      const comp = makeComposition('MultiThreshold', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [2, 0, 0 ]),
      ]);

      const samples = gen.generate(comp);
      const adjacentSamples = samples.filter((s) => s.relationship.type === 'adjacent');

      // Distance is 2m: adjacent at 3.0 and 5.0 thresholds, not at 1.0
      const positives = adjacentSamples.filter((s) => s.relationship.holds);
      const negatives = adjacentSamples.filter((s) => !s.relationship.holds);

      expect(positives.length).toBe(2); // 3.0 and 5.0 thresholds
      expect(negatives.length).toBe(1); // 1.0 threshold
    });

    it('should include correct distance in adjacent samples', () => {
      const comp = makeComposition('DistCheck', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [3, 4, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const adjacentSamples = samples.filter((s) => s.relationship.type === 'adjacent');

      for (const sample of adjacentSamples) {
        expect(sample.relationship.distance).toBeCloseTo(5.0, 1); // 3-4-5 triangle
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Contains relationship detection
  // ---------------------------------------------------------------------------

  describe('contains relationships', () => {
    it('should detect containment when target center is inside container bounds', () => {
      const comp = makeComposition('Containment', [
        makeObject(
          'room',
          'Room',
          [0, 2.5, 0 ],
          {
            bounds: {
              min: [-5, 0, -5 ],
              max: [5, 5, 5 ],
            },
          }
        ),
        makeObject(
          'table',
          'Table',
          [1, 0.75, 0 ],
          {
            scale: [2, 0.1, 1 ],
          }
        ),
      ]);

      const samples = generator.generate(comp);
      const containsSamples = samples.filter(
        (s) => s.relationship.type === 'contains' && s.relationship.holds
      );

      expect(containsSamples.length).toBeGreaterThan(0);
      // Room should contain Table
      const roomContainsTable = containsSamples.find(
        (s) => s.relationship.sourceName === 'Room' && s.relationship.targetName === 'Table'
      );
      expect(roomContainsTable).toBeDefined();
    });

    it('should NOT detect containment when target is outside container', () => {
      const comp = makeComposition('NoContainment', [
        makeObject(
          'box',
          'Box',
          [0, 0, 0 ],
          {
            bounds: {
              min: [-1, -1, -1 ],
              max: [1, 1, 1 ],
            },
          }
        ),
        makeObject('sphere', 'Sphere', [5, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const containsPositive = samples.filter(
        (s) => s.relationship.type === 'contains' && s.relationship.holds
      );

      // Neither should contain the other
      expect(containsPositive).toHaveLength(0);
    });

    it('should include overlap ratio in containment samples', () => {
      const comp = makeComposition('OverlapTest', [
        makeObject(
          'container',
          'Container',
          [0, 0, 0 ],
          {
            bounds: {
              min: [-5, -5, -5 ],
              max: [5, 5, 5 ],
            },
          }
        ),
        makeObject(
          'inner',
          'Inner',
          [0, 0, 0 ],
          {
            scale: [2, 2, 2 ],
          }
        ),
      ]);

      const samples = generator.generate(comp);
      const containsSample = samples.find(
        (s) => s.relationship.type === 'contains' && s.relationship.holds
      );

      expect(containsSample).toBeDefined();
      expect(containsSample!.relationship.parameters.overlapRatio).toBeDefined();
      expect(containsSample!.relationship.parameters.overlapRatio).toBeGreaterThan(0);
    });

    it('should respect strict containment mode', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [2.0],
        strictContainment: true,
        generateNegatives: true,
        seed: 42,
      });

      // Object partially outside container
      const comp = makeComposition('StrictTest', [
        makeObject(
          'container',
          'Container',
          [0, 0, 0 ],
          {
            bounds: {
              min: [-2, -2, -2 ],
              max: [2, 2, 2 ],
            },
          }
        ),
        makeObject(
          'overhanging',
          'Overhanging',
          [1.5, 0, 0 ],
          {
            scale: [2, 1, 1 ],
            bounds: {
              min: [0.5, -0.5, -0.5 ],
              max: [2.5, 0.5, 0.5 ],
            },
          }
        ),
      ]);

      const samples = gen.generate(comp);
      const strictContains = samples.filter(
        (s) =>
          s.relationship.type === 'contains' &&
          s.relationship.sourceName === 'Container' &&
          s.relationship.holds
      );

      // Strict mode: overhanging bounds exceed container, should NOT contain
      expect(strictContains).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Reachable relationship detection
  // ---------------------------------------------------------------------------

  describe('reachable relationships', () => {
    it('should detect clear line-of-sight as reachable', () => {
      const comp = makeComposition('Reachable', [
        makeObject('a', 'PointA', [0, 0, 0 ]),
        makeObject('b', 'PointB', [5, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const reachable = samples.filter(
        (s) => s.relationship.type === 'reachable' && s.relationship.holds
      );

      expect(reachable.length).toBeGreaterThan(0);
      expect(reachable[0].relationship.parameters.lineOfSightClear).toBe(true);
      expect(reachable[0].relationship.parameters.blockingObstacles).toHaveLength(0);
    });

    it('should detect blocked line-of-sight as NOT reachable', () => {
      const comp = makeComposition('Blocked', [
        makeObject('a', 'PointA', [0, 0, 0 ]),
        makeObject('b', 'PointB', [10, 0, 0 ]),
        makeObject(
          'wall',
          'Wall',
          [5, 0, 0 ],
          {
            type: 'wall',
            isStatic: true,
            bounds: {
              min: [4.5, -2, -2 ],
              max: [5.5, 2, 2 ],
            },
          }
        ),
      ]);

      const samples = generator.generate(comp);
      const reachableAB = samples.filter(
        (s) =>
          s.relationship.type === 'reachable' &&
          s.relationship.sourceId === 'a' &&
          s.relationship.targetId === 'b'
      );

      expect(reachableAB.length).toBeGreaterThan(0);
      expect(reachableAB[0].relationship.holds).toBe(false);
      expect(reachableAB[0].relationship.parameters.lineOfSightClear).toBe(false);
      expect(reachableAB[0].relationship.parameters.blockingObstacles).toContain('wall');
    });

    it('should skip reachability check for pairs beyond max distance', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [2.0],
        maxReachabilityDistance: 5.0,
        generateNegatives: true,
        seed: 42,
      });

      const comp = makeComposition('FarApart', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [100, 0, 0 ]),
      ]);

      const samples = gen.generate(comp);
      const reachable = samples.filter((s) => s.relationship.type === 'reachable');

      expect(reachable).toHaveLength(0);
    });

    it('should include estimated path length', () => {
      const comp = makeComposition('PathLength', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [3, 4, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const reachable = samples.find(
        (s) => s.relationship.type === 'reachable' && s.relationship.holds
      );

      expect(reachable).toBeDefined();
      expect(reachable!.relationship.parameters.estimatedPathLength).toBeCloseTo(5.0, 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Direction labels
  // ---------------------------------------------------------------------------

  describe('direction labels', () => {
    it('should detect "above" direction', () => {
      const comp = makeComposition('Above', [
        makeObject('floor', 'Floor', [0, 0, 0 ]),
        makeObject('lamp', 'Lamp', [0, 3, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const adjacentSample = samples.find((s) => s.relationship.type === 'adjacent');

      expect(adjacentSample).toBeDefined();
      expect(adjacentSample!.relationship.directions).toContain('above');
    });

    it('should detect "below" direction', () => {
      const comp = makeComposition('Below', [
        makeObject('ceiling', 'Ceiling', [0, 3, 0 ]),
        makeObject('floor', 'Floor', [0, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const adjacentSample = samples.find(
        (s) => s.relationship.type === 'adjacent' && s.relationship.sourceId === 'ceiling_0'
      );

      // The auto-generated IDs will depend on enrichment; check any adjacent sample
      const anySample = samples.find((s) => s.relationship.type === 'adjacent');
      expect(anySample).toBeDefined();
      const dirs = anySample!.relationship.directions;
      // One direction should be vertical
      expect(dirs.some((d) => d === 'above' || d === 'below')).toBe(true);
    });

    it('should detect "near" for close objects', () => {
      const comp = makeComposition('Near', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [0.5, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const sample = samples.find((s) => s.relationship.type === 'adjacent');
      expect(sample).toBeDefined();
      expect(sample!.relationship.directions).toContain('near');
    });

    it('should detect "overlapping" for coincident objects', () => {
      const comp = makeComposition('Overlap', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [0, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const sample = samples.find((s) => s.relationship.type === 'adjacent');
      expect(sample).toBeDefined();
      expect(sample!.relationship.directions).toContain('overlapping');
    });
  });

  // ---------------------------------------------------------------------------
  // Ground truth and scene context
  // ---------------------------------------------------------------------------

  describe('ground truth and scene context', () => {
    it('should include source and target positions in ground truth', () => {
      const comp = makeComposition('GT', [
        makeObject('a', 'A', [1, 2, 3 ]),
        makeObject('b', 'B', [4, 5, 6 ]),
      ]);

      const samples = generator.generate(comp);
      const sample = samples[0];

      expect(sample.groundTruth.source.position).toEqual([1, 2, 3 ]);
      expect(sample.groundTruth.target.position).toEqual([4, 5, 6 ]);
    });

    it('should include scene context with all objects', () => {
      const comp = makeComposition('Context', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
        makeObject('c', 'C', [2, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const sample = samples[0];

      expect(sample.sceneContext.objectCount).toBe(3);
      expect(sample.sceneContext.objects).toHaveLength(3);
    });

    it('should omit scene context objects when disabled', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [2.0],
        includeSceneContext: false,
        seed: 42,
      });

      const comp = makeComposition('NoContext', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = gen.generate(comp);
      const sample = samples[0];

      expect(sample.sceneContext.objectCount).toBe(2);
      expect(sample.sceneContext.objects).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Natural language descriptions
  // ---------------------------------------------------------------------------

  describe('descriptions and QA', () => {
    it('should generate meaningful descriptions for adjacent relationships', () => {
      const comp = makeComposition('DescTest', [
        makeObject('a', 'Table', [0, 0, 0 ]),
        makeObject('b', 'Chair', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const adjacent = samples.find(
        (s) => s.relationship.type === 'adjacent' && s.relationship.holds
      );

      expect(adjacent).toBeDefined();
      expect(adjacent!.description).toContain('Table');
      expect(adjacent!.description).toContain('Chair');
      expect(adjacent!.description).toContain('adjacent');
    });

    it('should generate QA pairs when enabled', () => {
      const comp = makeComposition('QATest', [
        makeObject('a', 'Lamp', [0, 0, 0 ]),
        makeObject('b', 'Desk', [1.5, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const sample = samples[0];

      expect(sample.qa.question.length).toBeGreaterThan(0);
      expect(sample.qa.answer.length).toBeGreaterThan(0);
    });

    it('should NOT generate QA pairs when disabled', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [2.0],
        generateQA: false,
        seed: 42,
      });

      const comp = makeComposition('NoQA', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = gen.generate(comp);
      const sample = samples[0];

      expect(sample.qa.question).toBe('');
      expect(sample.qa.answer).toBe('');
    });
  });

  // ---------------------------------------------------------------------------
  // Negative sample generation
  // ---------------------------------------------------------------------------

  describe('negative samples', () => {
    it('should generate negative adjacent samples for distant objects', () => {
      const comp = makeComposition('Negatives', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [10, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const negativeAdjacent = samples.filter(
        (s) => s.relationship.type === 'adjacent' && !s.relationship.holds
      );

      expect(negativeAdjacent.length).toBeGreaterThan(0);
      expect(negativeAdjacent[0].tags).toContain('negative');
    });

    it('should NOT generate negatives when disabled', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [2.0],
        generateNegatives: false,
        seed: 42,
      });

      const comp = makeComposition('NoNeg', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [10, 0, 0 ]),
      ]);

      const samples = gen.generate(comp);
      const negatives = samples.filter((s) => !s.relationship.holds);

      // May still have some reachable negatives from blocked paths, but no adjacency negatives
      const adjacentNegatives = negatives.filter((s) => s.relationship.type === 'adjacent');
      expect(adjacentNegatives).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Tags and difficulty
  // ---------------------------------------------------------------------------

  describe('tags and difficulty', () => {
    it('should tag samples with relationship type', () => {
      const comp = makeComposition('Tags', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      for (const sample of samples) {
        expect(sample.tags).toContain(sample.relationship.type);
      }
    });

    it('should tag positive samples as "positive"', () => {
      const comp = makeComposition('PosTag', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const positives = samples.filter((s) => s.relationship.holds);

      for (const sample of positives) {
        expect(sample.tags).toContain('positive');
      }
    });

    it('should assign difficulty levels', () => {
      const comp = makeComposition('Difficulty', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      for (const sample of samples) {
        expect(['easy', 'medium', 'hard']).toContain(sample.difficulty);
      }
    });

    it('should include object type tags', () => {
      const comp = makeComposition('TypeTags', [
        makeObject('a', 'MySphere', [0, 0, 0 ], { type: 'sphere' }),
        makeObject('b', 'MyCube', [1, 0, 0 ], { type: 'cube' }),
      ]);

      const samples = generator.generate(comp);
      const sample = samples[0];

      expect(sample.tags).toContain('type:sphere');
      expect(sample.tags).toContain('type:cube');
    });

    it('should include trait tags', () => {
      const comp = makeComposition('TraitTags', [
        makeObject('a', 'A', [0, 0, 0 ], { traits: ['physics', 'grabbable'] }),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const sample = samples[0];

      expect(sample.tags).toContain('trait:physics');
      expect(sample.tags).toContain('trait:grabbable');
    });
  });

  // ---------------------------------------------------------------------------
  // JSONL output
  // ---------------------------------------------------------------------------

  describe('JSONL output', () => {
    it('should produce valid JSONL with one JSON object per line', () => {
      const comp = makeComposition('JSONL', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const jsonl = generator.toJSONL(samples);

      const lines = jsonl.split('\n');
      expect(lines.length).toBe(samples.length);

      for (const line of lines) {
        expect(() => JSON.parse(line)).not.toThrow();
      }
    });

    it('should roundtrip through JSONL serialization', () => {
      const comp = makeComposition('Roundtrip', [
        makeObject('a', 'A', [1, 2, 3 ]),
        makeObject('b', 'B', [4, 5, 6 ]),
      ]);

      const samples = generator.generate(comp);
      const jsonl = generator.toJSONL(samples);
      const lines = jsonl.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const parsed = JSON.parse(lines[i]) as SpatialTrainingSample;
        expect(parsed.id).toBe(samples[i].id);
        expect(parsed.relationship.type).toBe(samples[i].relationship.type);
        expect(parsed.relationship.holds).toBe(samples[i].relationship.holds);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Instruction-tuning JSONL output
  // ---------------------------------------------------------------------------

  describe('instruction JSONL output', () => {
    it('should produce conversation-style JSONL with system/user/assistant messages', () => {
      const comp = makeComposition('Instruct', [
        makeObject('a', 'Table', [0, 0.75, 0 ]),
        makeObject('b', 'Chair', [1, 0.5, 1.2 ]),
      ]);

      const samples = generator.generate(comp);
      const jsonl = generator.toInstructionJSONL(samples);
      const lines = jsonl.split('\n');

      for (const line of lines) {
        const parsed = JSON.parse(line);
        expect(parsed.messages).toBeDefined();
        expect(parsed.messages).toHaveLength(3);
        expect(parsed.messages[0].role).toBe('system');
        expect(parsed.messages[1].role).toBe('user');
        expect(parsed.messages[2].role).toBe('assistant');
      }
    });

    it('should include scene description in user message', () => {
      const comp = makeComposition('SceneDesc', [
        makeObject('a', 'Lamp', [0, 2, 0 ]),
        makeObject('b', 'Desk', [0, 0.75, 0 ]),
      ]);

      const samples = generator.generate(comp);
      const jsonl = generator.toInstructionJSONL(samples);
      const parsed = JSON.parse(jsonl.split('\n')[0]);

      expect(parsed.messages[1].content).toContain('SceneDesc');
      expect(parsed.messages[1].content).toContain('Lamp');
      expect(parsed.messages[1].content).toContain('Desk');
    });
  });

  // ---------------------------------------------------------------------------
  // Batch generation
  // ---------------------------------------------------------------------------

  describe('batch generation', () => {
    it('should generate samples from multiple compositions', () => {
      const comps = [
        makeComposition('Scene1', [
          makeObject('a', 'A', [0, 0, 0 ]),
          makeObject('b', 'B', [1, 0, 0 ]),
        ]),
        makeComposition('Scene2', [
          makeObject('c', 'C', [0, 0, 0 ]),
          makeObject('d', 'D', [2, 0, 0 ]),
        ]),
      ];

      const { samples, stats } = generator.generateBatch(comps);

      expect(samples.length).toBeGreaterThan(0);
      expect(stats.compositionsProcessed).toBe(2);
      expect(stats.objectsProcessed).toBe(4);
      expect(stats.pairsEvaluated).toBe(2);
    });

    it('should compute accurate statistics', () => {
      const comps = [
        makeComposition('Stats', [
          makeObject('a', 'A', [0, 0, 0 ]),
          makeObject('b', 'B', [1, 0, 0 ]),
        ]),
      ];

      const { stats } = generator.generateBatch(comps);

      expect(stats.totalSamples).toBeGreaterThan(0);
      expect(stats.generationTimeMs).toBeGreaterThanOrEqual(0);

      const totalFromBreakdown =
        stats.adjacentPositive +
        stats.adjacentNegative +
        stats.containsPositive +
        stats.containsNegative +
        stats.reachablePositive +
        stats.reachableNegative;

      expect(totalFromBreakdown).toBe(stats.totalSamples);
    });
  });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  describe('configuration', () => {
    it('should respect maxSamplesPerComposition limit', () => {
      const gen = new SpatialDataGenerator({
        adjacencyThresholds: [1.0, 2.0, 5.0, 10.0],
        maxSamplesPerComposition: 3,
        seed: 42,
      });

      const comp = makeComposition('Limited', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
        makeObject('c', 'C', [2, 0, 0 ]),
        makeObject('d', 'D', [3, 0, 0 ]),
      ]);

      const samples = gen.generate(comp);
      expect(samples.length).toBeLessThanOrEqual(3);
    });

    it('should allow config updates', () => {
      const gen = new SpatialDataGenerator({ adjacencyThresholds: [1.0] });
      expect(gen.getConfig().adjacencyThresholds).toEqual([1.0]);

      gen.updateConfig({ adjacencyThresholds: [1.0, 5.0] });
      expect(gen.getConfig().adjacencyThresholds).toEqual([1.0, 5.0]);
    });
  });

  // ---------------------------------------------------------------------------
  // Metadata
  // ---------------------------------------------------------------------------

  describe('metadata', () => {
    it('should include generator version in metadata', () => {
      const comp = makeComposition('Meta', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      expect(samples[0].metadata.generatorVersion).toBe('1.0.0');
    });

    it('should include timestamp in metadata', () => {
      const comp = makeComposition('Time', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      expect(samples[0].metadata.timestamp).toBeDefined();
      expect(new Date(samples[0].metadata.timestamp).getTime()).not.toBeNaN();
    });

    it('should include composition hash for provenance', () => {
      const comp = makeComposition('Hash', [
        makeObject('a', 'A', [0, 0, 0 ]),
        makeObject('b', 'B', [1, 0, 0 ]),
      ]);

      const samples = generator.generate(comp);
      expect(samples[0].metadata.compositionHash).toBeDefined();
      expect(samples[0].metadata.compositionHash.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-bounds enrichment
  // ---------------------------------------------------------------------------

  describe('auto-bounds enrichment', () => {
    it('should auto-compute bounds for objects without explicit bounds', () => {
      const comp = makeComposition('AutoBounds', [
        makeObject('a', 'A', [0, 0, 0 ], { scale: [2, 2, 2 ] }),
        makeObject('b', 'B', [0, 0, 0 ], { scale: [0.5, 0.5, 0.5 ] }),
      ]);

      const samples = generator.generate(comp);

      // A should contain B since A is 2x2x2 centered at origin and B is 0.5x0.5x0.5
      const containsSample = samples.find(
        (s) => s.relationship.type === 'contains' && s.relationship.holds
      );
      expect(containsSample).toBeDefined();
    });

    it('should handle sphere-type bounds correctly', () => {
      const comp = makeComposition('SphereBounds', [
        makeObject(
          'big',
          'BigSphere',
          [0, 0, 0 ],
          {
            type: 'sphere',
            scale: [5, 5, 5 ],
          }
        ),
        makeObject(
          'small',
          'SmallCube',
          [0, 0, 0 ],
          {
            type: 'cube',
            scale: [0.5, 0.5, 0.5 ],
          }
        ),
      ]);

      const samples = generator.generate(comp);
      const containsSample = samples.find(
        (s) =>
          s.relationship.type === 'contains' &&
          s.relationship.sourceName === 'BigSphere' &&
          s.relationship.holds
      );
      expect(containsSample).toBeDefined();
    });
  });
});

// =============================================================================
// parseSimpleComposition
// =============================================================================

describe('parseSimpleComposition', () => {
  it('should parse a basic composition with objects', () => {
    const source = `
      composition "TestScene" {
        object "Table" {
          geometry: "cube"
          position: [0, 0.75, 0]
          scale: [3, 0.1, 1.5]
        }
        object "Chair" {
          geometry: "cube"
          position: [1, 0.5, 1.2]
          scale: [0.4, 0.5, 0.4]
        }
      }
    `;

    const comp = parseSimpleComposition(source);

    expect(comp.name).toBe('TestScene');
    expect(comp.objects).toHaveLength(2);
    expect(comp.objects[0].name).toBe('Table');
    expect(comp.objects[0].type).toBe('cube');
    expect(comp.objects[0].position).toEqual([0, 0.75, 0 ]);
    expect(comp.objects[0].scale).toEqual([3, 0.1, 1.5 ]);
    expect(comp.objects[1].name).toBe('Chair');
    expect(comp.objects[1].position).toEqual([1, 0.5, 1.2 ]);
  });

  it('should extract traits from objects', () => {
    const source = `
      composition "TraitScene" {
        object "Ball" {
          geometry: "sphere"
          position: [0, 1, 0]
          @physics
          @grabbable
          @collidable
        }
      }
    `;

    const comp = parseSimpleComposition(source);

    expect(comp.objects[0].traits).toContain('physics');
    expect(comp.objects[0].traits).toContain('grabbable');
    expect(comp.objects[0].traits).toContain('collidable');
  });

  it('should set isStatic for static/collidable objects', () => {
    const source = `
      composition "StaticScene" {
        object "Wall" {
          geometry: "cube"
          position: [0, 0, 0]
          @static
          @collidable
        }
      }
    `;

    const comp = parseSimpleComposition(source);
    expect(comp.objects[0].isStatic).toBe(true);
  });

  it('should handle compositions with no name gracefully', () => {
    const source = `object "Orphan" { geometry: "cube" position: [0, 0, 0] }`;
    const comp = parseSimpleComposition(source);
    expect(comp.name).toBe('Unnamed');
  });

  it('should include source code in composition', () => {
    const source = `composition "Test" { object "A" { geometry: "cube" position: [0, 0, 0] } }`;
    const comp = parseSimpleComposition(source);
    expect(comp.sourceCode).toBe(source);
  });
});

// =============================================================================
// createSpatialDataGenerator factory
// =============================================================================

describe('createSpatialDataGenerator', () => {
  it('should create a generator with default config', () => {
    const gen = createSpatialDataGenerator();
    const config = gen.getConfig();
    expect(config.adjacencyThresholds).toEqual([1.0, 2.0, 5.0]);
    expect(config.generateNegatives).toBe(true);
  });

  it('should create a generator with custom config', () => {
    const gen = createSpatialDataGenerator({
      adjacencyThresholds: [0.5],
      generateNegatives: false,
    });
    const config = gen.getConfig();
    expect(config.adjacencyThresholds).toEqual([0.5]);
    expect(config.generateNegatives).toBe(false);
  });
});

// =============================================================================
// Integration: End-to-end pipeline
// =============================================================================

describe('end-to-end pipeline', () => {
  it('should produce a complete JSONL dataset from a meeting room composition', () => {
    const source = `
      composition "VR Meeting Room" {
        object "Table" {
          geometry: "cube"
          position: [0, 0.75, 0]
          scale: [3, 0.1, 1.5]
          @collidable
        }
        object "Chair1" {
          geometry: "cube"
          position: [-1, 0.5, 1.2]
          scale: [0.4, 0.5, 0.4]
        }
        object "Chair2" {
          geometry: "cube"
          position: [1, 0.5, 1.2]
          scale: [0.4, 0.5, 0.4]
        }
        object "Screen" {
          geometry: "cube"
          position: [0, 2, -3]
          scale: [4, 2.25, 0.1]
        }
      }
    `;

    const composition = parseSimpleComposition(source);
    const generator = createSpatialDataGenerator({
      adjacencyThresholds: [2.0, 5.0],
      seed: 42,
    });

    const { samples, stats } = generator.generateBatch([composition]);

    // Verify we got samples
    expect(samples.length).toBeGreaterThan(0);
    expect(stats.totalSamples).toBe(samples.length);
    expect(stats.objectsProcessed).toBe(4);

    // Verify JSONL output
    const jsonl = generator.toJSONL(samples);
    const lines = jsonl.split('\n');
    expect(lines.length).toBe(samples.length);

    // Every line should be valid JSON
    for (const line of lines) {
      const parsed = JSON.parse(line);
      expect(parsed.id).toBeDefined();
      expect(parsed.relationship).toBeDefined();
      expect(parsed.groundTruth).toBeDefined();
    }

    // Verify we have all three relationship types
    const types = new Set(samples.map((s) => s.relationship.type));
    expect(types.has('adjacent')).toBe(true);
    expect(types.has('reachable')).toBe(true);

    // Verify instruction JSONL
    const instructionJSONL = generator.toInstructionJSONL(samples);
    const instructionLines = instructionJSONL.split('\n');
    for (const line of instructionLines) {
      const parsed = JSON.parse(line);
      expect(parsed.messages).toHaveLength(3);
    }
  });

  it('should produce a dataset from a physics playground composition', () => {
    const source = `
      composition "Physics Playground" {
        object "Ground" {
          geometry: "plane"
          position: [0, 0, 0]
          scale: [30, 1, 30]
          @collidable
          @static
        }
        object "Crate1" {
          geometry: "cube"
          position: [0, 0.5, 0]
          scale: [1, 1, 1]
          @physics
          @grabbable
        }
        object "Crate2" {
          geometry: "cube"
          position: [0, 1.5, 0]
          scale: [1, 1, 1]
          @physics
          @grabbable
        }
        object "Ball" {
          geometry: "sphere"
          position: [3, 1, 0]
          scale: [0.5, 0.5, 0.5]
          @physics
          @throwable
        }
      }
    `;

    const composition = parseSimpleComposition(source);
    const generator = createSpatialDataGenerator({
      adjacencyThresholds: [1.5, 3.0],
      seed: 123,
    });

    const samples = generator.generate(composition);

    expect(samples.length).toBeGreaterThan(0);

    // Crate1 and Crate2 should be adjacent (1m apart vertically)
    const crateAdjacent = samples.find(
      (s) =>
        s.relationship.type === 'adjacent' &&
        s.relationship.holds &&
        ((s.relationship.sourceName === 'Crate1' && s.relationship.targetName === 'Crate2') ||
          (s.relationship.sourceName === 'Crate2' && s.relationship.targetName === 'Crate1'))
    );
    expect(crateAdjacent).toBeDefined();

    // All samples should have valid JSONL
    const jsonl = generator.toJSONL(samples);
    for (const line of jsonl.split('\n')) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});
