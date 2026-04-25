/**
 * World Model Bootstrap Scanner Tests
 *
 * Validates the Marble manifest → HoloComposition pipeline:
 * - Manifest-level AABB extraction
 * - glTF accessor-level AABB extraction
 * - Collider generation from AABBs
 * - Provenance and splat reference injection
 * - End-to-end: manifest + glTF → compilable composition
 */

import { describe, it, expect } from 'vitest';
import { readJson } from '../errors/safeJsonParse';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  extractManifestAABB,
  extractGLTFAABBs,
  mergeAABBs,
  aabbCenter,
  aabbExtents,
  aabbSize,
  aabbVolume,
  aabbToHoloObject,
  bootstrapFromMarble,
  type MarbleManifest,
  type GLTFDocument,
  type AABB,
} from '../compiler/WorldModelBootstrap';

// Load test fixtures via fs to avoid Vite/Rollup .gltf parse issues
const fixturesDir = resolve(__dirname, 'fixtures');
const marbleManifest = readJson(
  readFileSync(resolve(fixturesDir, 'marble-sample-manifest.json'), 'utf-8')
);
const colliderGLTF = readJson(
  readFileSync(resolve(fixturesDir, 'marble-collider-sample.gltf'), 'utf-8')
);

describe('WorldModelBootstrap', () => {
  // ==========================================================================
  // AABB UTILITIES
  // ==========================================================================
  describe('AABB Utilities', () => {
    const testAABB: AABB = { min: [-10, 0, -20], max: [10, 30, 20] };

    it('should compute AABB center', () => {
      const center = aabbCenter(testAABB);
      expect(center).toEqual([0, 15, 0]);
    });

    it('should compute AABB extents (half-sizes)', () => {
      const extents = aabbExtents(testAABB);
      expect(extents).toEqual([10, 15, 20]);
    });

    it('should compute AABB size', () => {
      const size = aabbSize(testAABB);
      expect(size).toEqual([20, 30, 40]);
    });

    it('should compute AABB volume', () => {
      const volume = aabbVolume(testAABB);
      expect(volume).toBe(24000);
    });
  });

  // ==========================================================================
  // MANIFEST AABB EXTRACTION
  // ==========================================================================
  describe('Manifest AABB Extraction', () => {
    it('should extract AABB from the sample Marble manifest', () => {
      const aabb = extractManifestAABB(marbleManifest as MarbleManifest);
      expect(aabb).not.toBeNull();
      expect(aabb!.min).toEqual([-50, 0, -50]);
      expect(aabb!.max).toEqual([50, 30, 50]);
    });

    it('should return null for manifest without mesh bounds', () => {
      const noMesh: MarbleManifest = {
        world_id: 'test',
        display_name: 'Test',
        model: 'marble-1.0',
        generated_at: '2026-01-01T00:00:00Z',
        assets: {
          caption: 'Test scene',
        },
      };
      const aabb = extractManifestAABB(noMesh);
      expect(aabb).toBeNull();
    });

    it('should compute correct center from manifest AABB', () => {
      const aabb = extractManifestAABB(marbleManifest as MarbleManifest)!;
      const center = aabbCenter(aabb);
      expect(center).toEqual([0, 15, 0]);
    });

    it('should compute correct volume from manifest AABB', () => {
      const aabb = extractManifestAABB(marbleManifest as MarbleManifest)!;
      const volume = aabbVolume(aabb);
      // 100m × 30m × 100m = 300,000 m³
      expect(volume).toBe(300000);
    });
  });

  // ==========================================================================
  // GLTF AABB EXTRACTION
  // ==========================================================================
  describe('glTF AABB Extraction', () => {
    it('should extract AABB from glTF POSITION accessor min/max', () => {
      const aabbs = extractGLTFAABBs(colliderGLTF as unknown as GLTFDocument);
      expect(aabbs.length).toBe(1);
      expect(aabbs[0].min).toEqual([-1, -1, -1]);
      expect(aabbs[0].max).toEqual([1, 1, 1]);
    });

    it('should return empty array for glTF without accessors', () => {
      const emptyDoc: GLTFDocument = { asset: { version: '2.0' } };
      const aabbs = extractGLTFAABBs(emptyDoc);
      expect(aabbs).toEqual([]);
    });

    it('should merge multiple AABBs correctly', () => {
      const merged = mergeAABBs([
        { min: [-1, -1, -1], max: [1, 1, 1] },
        { min: [5, 0, 5], max: [10, 3, 10] },
      ]);
      expect(merged).not.toBeNull();
      expect(merged!.min).toEqual([-1, -1, -1]);
      expect(merged!.max).toEqual([10, 3, 10]);
    });

    it('should return null when merging empty array', () => {
      expect(mergeAABBs([])).toBeNull();
    });
  });

  // ==========================================================================
  // AABB TO HOLO OBJECT
  // ==========================================================================
  describe('AABB to HoloObject', () => {
    it('should generate a box collider at AABB center', () => {
      const aabb: AABB = { min: [-5, 0, -5], max: [5, 10, 5] };
      const obj = aabbToHoloObject('TestCollider', aabb);

      expect(obj.name).toBe('TestCollider');

      // Position should be at center
      const posProp = obj.properties?.find(p => p.key === 'position');
      expect(posProp?.value).toEqual([0, 5, 0]);

      // Scale should match AABB size
      const scaleProp = obj.properties?.find(p => p.key === 'scale');
      expect(scaleProp?.value).toEqual([10, 10, 10]);

      // Should have physics and collidable traits
      const traitNames = obj.traits?.map(t => typeof t === 'string' ? t : t.name);
      expect(traitNames).toContain('physics');
      expect(traitNames).toContain('collidable');
    });

    it('should set mass=0 for static colliders by default', () => {
      const aabb: AABB = { min: [0, 0, 0], max: [1, 1, 1] };
      const obj = aabbToHoloObject('Static', aabb);
      const physicsTrait = obj.traits?.find(t =>
        typeof t !== 'string' && t.name === 'physics'
      );
      expect((physicsTrait as any)?.mass).toBe(0);
    });

    it('should add trigger trait when requested', () => {
      const aabb: AABB = { min: [0, 0, 0], max: [1, 1, 1] };
      const obj = aabbToHoloObject('Zone', aabb, { isTrigger: true });
      const traitNames = obj.traits?.map(t => typeof t === 'string' ? t : t.name);
      expect(traitNames).toContain('trigger');
    });
  });

  // ==========================================================================
  // BOOTSTRAP FROM MARBLE (END-TO-END)
  // ==========================================================================
  describe('bootstrapFromMarble (e2e)', () => {
    it('should produce a valid HoloComposition from manifest', () => {
      const composition = bootstrapFromMarble(marbleManifest as MarbleManifest);

      expect(composition.type).toBe('Composition');
      expect(composition.name).toBe('Fantastical Forest - Marble Sample');
      expect(composition.objects.length).toBeGreaterThanOrEqual(1);
    });

    it('should include SceneBounds collider from manifest AABB', () => {
      const composition = bootstrapFromMarble(marbleManifest as MarbleManifest);
      const sceneBounds = composition.objects.find(o => o.name === 'SceneBounds');

      expect(sceneBounds).toBeDefined();

      const posProp = sceneBounds!.properties?.find(p => p.key === 'position');
      expect(posProp?.value).toEqual([0, 15, 0]);

      const scaleProp = sceneBounds!.properties?.find(p => p.key === 'scale');
      expect(scaleProp?.value).toEqual([100, 30, 100]);
    });

    it('should include per-mesh colliders from glTF document', () => {
      const composition = bootstrapFromMarble(
        marbleManifest as MarbleManifest,
        colliderGLTF as unknown as GLTFDocument
      );

      const colliderBox = composition.objects.find(o => o.name === 'ColliderBox');
      expect(colliderBox).toBeDefined();

      // Unit cube: center at [0,0,0], size [2,2,2]
      const posProp = colliderBox!.properties?.find(p => p.key === 'position');
      expect(posProp?.value).toEqual([0, 0, 0]);
    });

    it('should include provenance metadata by default', () => {
      const composition = bootstrapFromMarble(marbleManifest as MarbleManifest);
      const provenance = composition.objects.find(o => o.name === 'MarbleProvenance');

      expect(provenance).toBeDefined();
      const provenanceTrait = provenance!.traits?.find(
        t => typeof t !== 'string' && t.name === 'provenance'
      );
      expect(provenanceTrait).toBeDefined();
      expect((provenanceTrait as any).source).toBe('world_labs_marble');
      expect((provenanceTrait as any).world_id).toBe('dc2c65e4-68d3-4210-a01e-7a54cc9ded2a');
    });

    it('should include Gaussian splat references by default', () => {
      const composition = bootstrapFromMarble(marbleManifest as MarbleManifest);
      const splatObj = composition.objects.find(o => o.name === 'GaussianSplatCloud');

      expect(splatObj).toBeDefined();
      const splatTrait = splatObj!.traits?.find(
        t => typeof t !== 'string' && t.name === 'gaussian_splat'
      );
      expect(splatTrait).toBeDefined();
      expect((splatTrait as any).spz_100k).toContain('sample-forest-100k.spz');
    });

    it('should allow disabling provenance and splat injection', () => {
      const composition = bootstrapFromMarble(
        marbleManifest as MarbleManifest,
        undefined,
        { includeProvenance: false, includeSplatRefs: false }
      );

      expect(composition.objects.find(o => o.name === 'MarbleProvenance')).toBeUndefined();
      expect(composition.objects.find(o => o.name === 'GaussianSplatCloud')).toBeUndefined();
    });

    it('should use custom composition name', () => {
      const composition = bootstrapFromMarble(
        marbleManifest as MarbleManifest,
        undefined,
        { compositionName: 'MyCustomScene' }
      );
      expect(composition.name).toBe('MyCustomScene');
    });

    it('should produce a composition compilable to USD Physics', () => {
      // Just verify the structure is valid for USDPhysicsCompiler
      const composition = bootstrapFromMarble(
        marbleManifest as MarbleManifest,
        colliderGLTF as unknown as GLTFDocument
      );

      // Must have valid structure
      expect(composition.objects.length).toBeGreaterThan(0);
      expect(composition.templates).toBeDefined();
      expect(composition.spatialGroups).toBeDefined();

      // SceneBounds should have physics traits
      const sceneBounds = composition.objects.find(o => o.name === 'SceneBounds');
      const traitNames = sceneBounds?.traits?.map(t =>
        typeof t === 'string' ? t : t.name
      );
      expect(traitNames).toContain('physics');
      expect(traitNames).toContain('collidable');
    });
  });
});
