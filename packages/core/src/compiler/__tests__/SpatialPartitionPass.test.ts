/**
 * SpatialPartitionPass Tests
 *
 * Validates that the compile-time SpatialPartitionPass correctly lowers a
 * HoloComposition AST into a SpatialPartitionResult whose anchors are
 * ready for OctreeLODSystem.bulkInsert() in packages/engine.
 *
 * Test scope (idea-run-17 BUILD-1 acceptance criteria):
 *  1. Empty composition → valid empty result, no anchors.
 *  2. Single gaussian_splat object → one anchor at correct lodLevel.
 *  3. Multi-object scene → coarser (high-splat) objects get lower lodLevel,
 *     finer (low-splat) objects get higher lodLevel.
 *  4. Position is propagated; missing position defaults to origin.
 *  5. Anchors sorted coarsest-first (lodLevel ascending) in output.
 *  6. Bounds AABB encloses all anchor positions.
 *  7. merkleRoot is stable (same input → same root; different input → different root).
 *  8. schema, compositionName, generatedAt, stats are populated.
 *  9. Nested children + spatialGroups + conditionals are walked.
 * 10. Non-gaussian_splat traits are ignored.
 *
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SpatialPartitionPass,
  spatialPartition,
  type SpatialPartitionResult,
  type SpatialAnchor,
} from '../SpatialPartitionPass';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
} from '../../parser/HoloCompositionTypes';

// =============================================================================
// HELPERS
// =============================================================================

function emptyComposition(name = 'TestScene'): HoloComposition {
  return {
    type: 'Composition',
    name,
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

function gaussianObject(
  name: string,
  maxSplats: number,
  pos?: { x: number; y: number; z: number },
  srcFile?: string
): HoloObjectDecl {
  return {
    type: 'ObjectDecl',
    name,
    objectType: 'object',
    properties: [],
    traits: [
      {
        type: 'Trait',
        name: 'gaussian_splat',
        config: {
          src: srcFile,
          max_splats: maxSplats,
        } as any,
      },
    ],
    children: [],
    handlers: [],
    ...(pos ? { position: pos } : {}),
  };
}

function nonGaussianObject(name: string): HoloObjectDecl {
  return {
    type: 'ObjectDecl',
    name,
    objectType: 'object',
    properties: [],
    traits: [
      {
        type: 'Trait',
        name: 'physics',
        config: { mass: 1 } as any,
      },
    ],
    children: [],
    handlers: [],
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('SpatialPartitionPass', () => {
  // ---------------------------------------------------------------------------
  // 1. Empty composition
  // ---------------------------------------------------------------------------

  describe('empty composition', () => {
    it('returns valid empty result with no anchors', () => {
      const result = spatialPartition(emptyComposition());
      expect(result.schema).toBe('spatial-partition/v1');
      expect(result.anchors).toHaveLength(0);
      expect(result.totalGaussians).toBe(0);
      expect(result.merkleRoot).toBe('0'.repeat(64));
      expect(result.bounds.halfSize).toBe(0);
    });

    it('populates compositionName and generatedAt', () => {
      const result = spatialPartition(emptyComposition('MyScene'));
      expect(result.compositionName).toBe('MyScene');
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Single object
  // ---------------------------------------------------------------------------

  describe('single gaussian_splat object', () => {
    it('emits one anchor', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('Cloud', 10_000)];
      const result = spatialPartition(comp);
      expect(result.anchors).toHaveLength(1);
      expect(result.totalGaussians).toBe(10_000);
    });

    it('anchor id contains object name and lodLevel', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('Dust', 5_000)];
      const result = spatialPartition(comp);
      const anchor = result.anchors[0]!;
      expect(anchor.id).toContain('Dust');
      expect(anchor.id).toContain(`l${anchor.lodLevel}`);
    });

    it('anchor gaussianCount matches max_splats', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('Volume', 80_000)];
      const result = spatialPartition(comp);
      expect(result.anchors[0]!.gaussianCount).toBe(80_000);
    });

    it('anchor has provenanceHash (64 hex chars)', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('Obj', 1_000, undefined, 'scene.ply')];
      const result = spatialPartition(comp);
      expect(result.anchors[0]!.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. LOD level ordering (coarser = lower level)
  // ---------------------------------------------------------------------------

  describe('LOD level assignment', () => {
    it('coarser object (more splats) gets a lower lodLevel than finer object', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('LargeCloud', 2_000_000),  // coarsest
        gaussianObject('SmallDust',  10),          // finest
      ];
      const result = spatialPartition(comp);
      const large = result.anchors.find((a) => a.id.includes('LargeCloud'))!;
      const small = result.anchors.find((a) => a.id.includes('SmallDust'))!;
      expect(large.lodLevel).toBeLessThan(small.lodLevel);
    });

    it('same-splat-count objects get the same lodLevel', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('A', 50_000),
        gaussianObject('B', 50_000),
      ];
      const result = spatialPartition(comp);
      const [a, b] = result.anchors;
      expect(a!.lodLevel).toBe(b!.lodLevel);
    });

    it('lodLevel is in range [0, maxDepth-1]', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('Huge', 10_000_000),
        gaussianObject('Tiny', 1),
      ];
      const result = spatialPartition(comp);
      for (const a of result.anchors) {
        expect(a.lodLevel).toBeGreaterThanOrEqual(0);
        expect(a.lodLevel).toBeLessThanOrEqual(7); // MAX_DEPTH - 1 = 7
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Position propagation
  // ---------------------------------------------------------------------------

  describe('position propagation', () => {
    it('uses declared position on the object', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('G', 1_000, { x: 3, y: 7, z: -2 })];
      const result = spatialPartition(comp);
      expect(result.anchors[0]!.position).toEqual({ x: 3, y: 7, z: -2 });
    });

    it('defaults to origin when position is missing', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('G', 1_000)]; // no position
      const result = spatialPartition(comp);
      expect(result.anchors[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Sorted coarsest-first
  // ---------------------------------------------------------------------------

  describe('anchor sort order', () => {
    it('anchors are sorted lodLevel ascending (coarsest first)', () => {
      const comp = emptyComposition();
      // Add in random order
      comp.objects = [
        gaussianObject('Fine',    100),
        gaussianObject('Coarse',  500_000),
        gaussianObject('Medium',  10_000),
      ];
      const result = spatialPartition(comp);
      for (let i = 1; i < result.anchors.length; i++) {
        expect(result.anchors[i]!.lodLevel).toBeGreaterThanOrEqual(
          result.anchors[i - 1]!.lodLevel
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Bounding box
  // ---------------------------------------------------------------------------

  describe('bounding box', () => {
    it('bounds enclose all anchor positions', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('A', 1_000, { x: -10, y: 0, z: 0 }),
        gaussianObject('B', 1_000, { x: 10,  y: 0, z: 0 }),
        gaussianObject('C', 1_000, { x: 0,   y: 5, z: 0 }),
      ];
      const result = spatialPartition(comp);
      for (const a of result.anchors) {
        expect(a.position.x).toBeGreaterThanOrEqual(result.bounds.min.x - a.scale);
        expect(a.position.x).toBeLessThanOrEqual(result.bounds.max.x + a.scale);
        expect(a.position.y).toBeGreaterThanOrEqual(result.bounds.min.y - a.scale);
        expect(a.position.y).toBeLessThanOrEqual(result.bounds.max.y + a.scale);
      }
    });

    it('halfSize is the max of half-extents', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('A', 1_000, { x: -20, y: 0, z: 0 }),
        gaussianObject('B', 1_000, { x:  20, y: 0, z: 0 }),
      ];
      const result = spatialPartition(comp);
      expect(result.bounds.halfSize).toBeGreaterThan(0);
      expect(result.bounds.center.x).toBeCloseTo(0, 3);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Merkle root stability
  // ---------------------------------------------------------------------------

  describe('merkleRoot', () => {
    it('is a 64-char hex string', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('G', 1_000)];
      const result = spatialPartition(comp);
      expect(result.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic (same input → same root)', () => {
      const comp1 = emptyComposition('S');
      const comp2 = emptyComposition('S');
      comp1.objects = [gaussianObject('Obj', 5_000, { x: 1, y: 2, z: 3 }, 'a.ply')];
      comp2.objects = [gaussianObject('Obj', 5_000, { x: 1, y: 2, z: 3 }, 'a.ply')];
      expect(spatialPartition(comp1).merkleRoot).toBe(spatialPartition(comp2).merkleRoot);
    });

    it('changes when anchor set changes', () => {
      const comp1 = emptyComposition('S');
      const comp2 = emptyComposition('S');
      comp1.objects = [gaussianObject('Obj', 5_000, undefined, 'a.ply')];
      comp2.objects = [gaussianObject('Obj', 9_999, undefined, 'b.ply')];
      expect(spatialPartition(comp1).merkleRoot).not.toBe(spatialPartition(comp2).merkleRoot);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Stats
  // ---------------------------------------------------------------------------

  describe('stats', () => {
    it('objectsWalked counts all traversed objects', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('A', 1_000),
        gaussianObject('B', 2_000),
        nonGaussianObject('C'), // no gaussian_splat
      ];
      const result = spatialPartition(comp);
      // A and B have gaussian_splat; C does not but the walk visits it
      expect(result.stats.objectsWalked).toBeGreaterThanOrEqual(2);
    });

    it('anchorsEmitted matches anchors array length', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('A', 1_000), gaussianObject('B', 2_000)];
      const result = spatialPartition(comp);
      expect(result.stats.anchorsEmitted).toBe(result.anchors.length);
    });

    it('lodLevelDistribution sums to anchorsEmitted', () => {
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('A', 500_000),
        gaussianObject('B', 10_000),
        gaussianObject('C', 100),
      ];
      const result = spatialPartition(comp);
      const distSum = Object.values(result.stats.lodLevelDistribution).reduce(
        (s, v) => s + v,
        0
      );
      expect(distSum).toBe(result.stats.anchorsEmitted);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Nested walk coverage
  // ---------------------------------------------------------------------------

  describe('AST walk coverage', () => {
    it('walks object children', () => {
      const comp = emptyComposition();
      const parent: HoloObjectDecl = {
        type: 'ObjectDecl',
        name: 'Parent',
        objectType: 'object',
        properties: [],
        traits: [],
        children: [gaussianObject('Child', 10_000)],
        handlers: [],
      };
      comp.objects = [parent];
      const result = spatialPartition(comp);
      expect(result.anchors).toHaveLength(1);
      expect(result.anchors[0]!.id).toContain('Child');
    });

    it('walks spatialGroups', () => {
      const comp = emptyComposition();
      const group: HoloSpatialGroup = {
        type: 'SpatialGroup',
        name: 'Group1',
        objects: [gaussianObject('InGroup', 5_000)],
        groups: [],
      };
      comp.spatialGroups = [group];
      const result = spatialPartition(comp);
      expect(result.anchors).toHaveLength(1);
    });

    it('walks conditional both/else branches', () => {
      const comp = emptyComposition();
      (comp as any).conditionals = [
        {
          type: 'Conditional',
          condition: true,
          objects: [gaussianObject('ThenObj', 1_000)],
          elseObjects: [gaussianObject('ElseObj', 2_000)],
        },
      ];
      const result = spatialPartition(comp);
      expect(result.anchors).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Non-gaussian traits ignored
  // ---------------------------------------------------------------------------

  describe('non-gaussian traits', () => {
    it('ignores objects without gaussian_splat', () => {
      const comp = emptyComposition();
      comp.objects = [nonGaussianObject('PhysBox')];
      const result = spatialPartition(comp);
      expect(result.anchors).toHaveLength(0);
    });

    it('picks up gaussian_splat alongside other traits on same object', () => {
      const comp = emptyComposition();
      comp.objects = [
        {
          type: 'ObjectDecl',
          name: 'Mixed',
          objectType: 'object',
          properties: [],
          traits: [
            { type: 'Trait', name: 'physics', config: { mass: 1 } as any },
            {
              type: 'Trait',
              name: 'gaussian_splat',
              config: { max_splats: 20_000 } as any,
            },
            { type: 'Trait', name: 'audio', config: {} as any },
          ],
          children: [],
          handlers: [],
        },
      ];
      const result = spatialPartition(comp);
      expect(result.anchors).toHaveLength(1);
      expect(result.anchors[0]!.gaussianCount).toBe(20_000);
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Custom options
  // ---------------------------------------------------------------------------

  describe('SpatialPartitionPass options', () => {
    it('respects custom maxDepth', () => {
      const pass = new SpatialPartitionPass({ maxDepth: 4 });
      const comp = emptyComposition();
      comp.objects = [gaussianObject('Tiny', 1)];
      const result = pass.run(comp);
      expect(result.anchors[0]!.lodLevel).toBeLessThanOrEqual(3); // maxDepth-1
    });

    it('includeUnpositioned: false excludes objects without position', () => {
      const pass = new SpatialPartitionPass({ includeUnpositioned: false });
      const comp = emptyComposition();
      comp.objects = [
        gaussianObject('WithPos', 1_000, { x: 1, y: 2, z: 3 }),
        gaussianObject('NoPos', 2_000), // no position → excluded
      ];
      const result = pass.run(comp);
      expect(result.anchors).toHaveLength(1);
      expect(result.anchors[0]!.id).toContain('WithPos');
    });
  });

  // ---------------------------------------------------------------------------
  // 12. Functional wrapper
  // ---------------------------------------------------------------------------

  describe('spatialPartition() convenience wrapper', () => {
    it('returns the same result as new SpatialPartitionPass().run()', () => {
      const comp = emptyComposition();
      comp.objects = [gaussianObject('G', 50_000)];
      const via_wrapper = spatialPartition(comp);
      const via_class = new SpatialPartitionPass().run(comp);
      expect(via_wrapper.anchors.length).toBe(via_class.anchors.length);
      expect(via_wrapper.merkleRoot).toBe(via_class.merkleRoot);
    });
  });
});
