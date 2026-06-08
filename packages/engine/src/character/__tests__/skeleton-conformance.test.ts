/**
 * skeleton-conformance.test.ts
 *
 * Round-trip conformance fixtures for the SkeletonStandardRegistry (G3).
 *
 * Validates:
 *   1. Every registered profile has at least a minimal core-bone set.
 *   2. resolveProfileBone is consistent with the profile's own boneMap.
 *   3. buildReverseMap produces a lossless inverse of boneMap.
 *   4. matchSkeletonStandard ranks the correct profile first for each
 *      standard's own platform bone names.
 *   5. matchSkeletonStandard handles empty / partial / garbage inputs safely.
 *   6. validateProfileCoverage correctly identifies missing canonical bones.
 *   7. AssetMetadata SemanticTags fields (skeletonStandard/skeletonVersion/
 *      mappingConfidence) can be set and read back without type errors.
 */

import { describe, it, expect } from 'vitest';
import {
  SKELETON_PROFILES,
  resolveProfileBone,
  buildReverseMap,
  matchSkeletonStandard,
  validateProfileCoverage,
  type SkeletonStandardId,
} from '../SkeletonStandardRegistry';
import type { SemanticTags } from '@holoscript/core';

// =============================================================================
// Helpers
// =============================================================================

/** Minimum set of canonical bones every humanoid profile must cover. */
const CORE_BONES = [
  'hips',
  'spine',
  'neck',
  'head',
  'left_upper_arm',
  'left_forearm',
  'left_hand',
  'right_upper_arm',
  'right_forearm',
  'right_hand',
  'left_upper_leg',
  'left_lower_leg',
  'left_foot',
  'right_upper_leg',
  'right_lower_leg',
  'right_foot',
] as const;

// =============================================================================
// 1. All profiles cover the minimum core bone set
// =============================================================================

describe('SkeletonStandardRegistry — profile completeness', () => {
  for (const [id, profile] of Object.entries(SKELETON_PROFILES)) {
    it(`profile ${id} covers all core bones`, () => {
      for (const bone of CORE_BONES) {
        expect(
          profile.boneMap[bone],
          `Profile "${id}" is missing core bone "${bone}"`
        ).toBeDefined();
      }
    });

    it(`profile ${id} has valid mappingConfidence in [0, 1]`, () => {
      expect(profile.mappingConfidence).toBeGreaterThanOrEqual(0);
      expect(profile.mappingConfidence).toBeLessThanOrEqual(1);
    });

    it(`profile ${id} has a non-empty version string`, () => {
      expect(profile.version).toBeTruthy();
    });
  }
});

// =============================================================================
// 2. resolveProfileBone is consistent with boneMap
// =============================================================================

describe('resolveProfileBone', () => {
  it('returns the correct platform name for vrm1 hips', () => {
    expect(resolveProfileBone('vrm1', 'hips')).toBe('hips');
  });

  it('returns the correct platform name for mixamo hips', () => {
    expect(resolveProfileBone('mixamo', 'hips')).toBe('mixamorig:Hips');
  });

  it('returns the correct platform name for ue_mannequin hips', () => {
    expect(resolveProfileBone('ue_mannequin', 'hips')).toBe('pelvis');
  });

  it('returns undefined for a canonical bone absent in the profile', () => {
    // holoscript_65 identity profile maps root, but vrm1 does not have root
    expect(resolveProfileBone('vrm1', 'root')).toBeUndefined();
  });

  it('is consistent with the stored boneMap entry for every profile + bone', () => {
    for (const [id, profile] of Object.entries(SKELETON_PROFILES)) {
      for (const [canonical, entry] of Object.entries(profile.boneMap)) {
        const resolved = resolveProfileBone(
          id as SkeletonStandardId,
          canonical as Parameters<typeof resolveProfileBone>[1]
        );
        expect(resolved).toBe(entry.platformName);
      }
    }
  });
});

// =============================================================================
// 3. buildReverseMap is a lossless inverse
// =============================================================================

describe('buildReverseMap', () => {
  const profiles: SkeletonStandardId[] = [
    'vrm1', 'mixamo', 'rpm', 'ue_mannequin', 'holoscript_65',
  ];

  for (const id of profiles) {
    it(`reverseMap for ${id} correctly maps platform → canonical`, () => {
      const profile = SKELETON_PROFILES[id];
      const reverse = buildReverseMap(id);

      for (const [canonical, entry] of Object.entries(profile.boneMap) as [string, { platformName: string }][]) {
        const recovered = reverse.get(entry.platformName);
        expect(recovered).toBe(canonical);
      }
    });

    it(`reverseMap for ${id} has same size as boneMap`, () => {
      const profile = SKELETON_PROFILES[id];
      const reverse = buildReverseMap(id);
      // If platform names collide the reverse map can be smaller — that would
      // be a profile authoring bug. Assert equality.
      expect(reverse.size).toBe(Object.keys(profile.boneMap).length);
    });
  }
});

// =============================================================================
// 4. matchSkeletonStandard self-identification
// =============================================================================

describe('matchSkeletonStandard — self-identification', () => {
  const profilesToTest: SkeletonStandardId[] = [
    'vrm1',
    'mixamo',
    'rpm',
    'ue_mannequin',
    'holoscript_65',
    'cc3',
    'daz_genesis8',
  ];

  for (const id of profilesToTest) {
    it(`correctly identifies ${id} as the top match when given its own platform bones`, () => {
      const profile = SKELETON_PROFILES[id];
      const ownBones = Object.values(profile.boneMap).map((e) => e.platformName);
      const results = matchSkeletonStandard(ownBones);

      expect(results.length).toBeGreaterThan(0);
      const topResult = results[0];
      expect(topResult.standard).toBe(id);
      // Self-identification should achieve a perfect overlap score
      expect(topResult.overlapScore).toBe(1.0);
      // matchedBones should be all input bones
      expect(topResult.matchedBones.sort()).toEqual(ownBones.sort());
      // unmatchedBones should be empty
      expect(topResult.unmatchedBones).toHaveLength(0);
    });
  }
});

// =============================================================================
// 5. matchSkeletonStandard edge cases
// =============================================================================

describe('matchSkeletonStandard — edge cases', () => {
  it('returns results for an empty bone list without throwing', () => {
    const results = matchSkeletonStandard([]);
    expect(results).toBeInstanceOf(Array);
    // All scores are 0 for empty input
    for (const r of results) {
      expect(r.overlapScore).toBe(0);
    }
  });

  it('handles completely unknown bone names gracefully', () => {
    const results = matchSkeletonStandard(['FAKE_BONE_1', 'FAKE_BONE_2', 'GARBAGE']);
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.overlapScore).toBe(0);
      expect(r.unmatchedBones).toHaveLength(3);
    }
  });

  it('returns at most topN results', () => {
    const ownBones = Object.values(SKELETON_PROFILES.mixamo.boneMap).map((e) => e.platformName);
    const results = matchSkeletonStandard(ownBones, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('returns results sorted by weightedScore descending', () => {
    const ownBones = Object.values(SKELETON_PROFILES.vrm1.boneMap).map((e) => e.platformName);
    const results = matchSkeletonStandard(ownBones);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].weightedScore).toBeGreaterThanOrEqual(results[i].weightedScore);
    }
  });

  it('partial Mixamo rig is still identified as mixamo (relaxed threshold)', () => {
    // Use only the first 8 Mixamo bones
    const mixamoBones = Object.values(SKELETON_PROFILES.mixamo.boneMap)
      .slice(0, 8)
      .map((e) => e.platformName);
    const results = matchSkeletonStandard(mixamoBones);
    // Mixamo should be ranked highly even with partial bones
    const mixamoRank = results.findIndex((r) => r.standard === 'mixamo');
    expect(mixamoRank).toBeLessThanOrEqual(2);
  });
});

// =============================================================================
// 6. validateProfileCoverage
// =============================================================================

describe('validateProfileCoverage', () => {
  it('returns empty array when all required bones are present', () => {
    const missing = validateProfileCoverage('vrm1', ['hips', 'spine', 'head']);
    expect(missing).toHaveLength(0);
  });

  it('returns missing bones when a profile lacks them', () => {
    // vrm1 does not map 'root'
    const missing = validateProfileCoverage('vrm1', ['hips', 'root']);
    expect(missing).toContain('root');
    expect(missing).not.toContain('hips');
  });

  it('holoscript_65 covers all core bones with no missing', () => {
    const missing = validateProfileCoverage('holoscript_65', [...CORE_BONES]);
    expect(missing).toHaveLength(0);
  });
});

// =============================================================================
// 7. AssetMetadata SemanticTags type-compatibility (G2)
// =============================================================================

describe('AssetMetadata SemanticTags — skeleton fields', () => {
  it('SemanticTags accepts skeletonStandard, skeletonVersion, and mappingConfidence', () => {
    // This test is a compile-time and runtime check: if the fields are absent
    // from the SemanticTags interface, TypeScript will error here.
    const tags: SemanticTags = {
      category: 'character',
      rig: 'humanoid',
      skeletonStandard: 'vrm1',
      skeletonVersion: '1.0.0',
      mappingConfidence: 1.0,
    };

    expect(tags.skeletonStandard).toBe('vrm1');
    expect(tags.skeletonVersion).toBe('1.0.0');
    expect(tags.mappingConfidence).toBe(1.0);
  });

  it('skeletonStandard can be set to any registered profile id', () => {
    const ids: SkeletonStandardId[] = Object.keys(SKELETON_PROFILES) as SkeletonStandardId[];
    for (const id of ids) {
      const tags: SemanticTags = { skeletonStandard: id };
      expect(tags.skeletonStandard).toBe(id);
    }
  });

  it('mappingConfidence is optional and defaults to undefined when omitted', () => {
    const tags: SemanticTags = { rig: 'humanoid' };
    expect(tags.mappingConfidence).toBeUndefined();
  });
});
