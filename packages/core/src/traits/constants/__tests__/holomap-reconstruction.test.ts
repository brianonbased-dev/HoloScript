/**
 * HoloMap reconstruction trait family tests.
 *
 * Sprint 1: trait registration + naming + VR_TRAITS membership.
 * Sprint 3 (2026-04-25): decorator-to-trait resolution + composition contract.
 *
 * Pattern mirrors `geo-anchor.test.ts` for the trait-side checks; decorator
 * tests are HoloMap-specific (other families don't use the decorator-sugar
 * pattern yet).
 *
 * Closes board task task_1776664517766_xn9o (Sprint-3 Foundations slice).
 */

import { describe, it, expect } from 'vitest';
import {
  HOLOMAP_RECONSTRUCTION_TRAITS,
  HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES,
  HOLOMAP_RECONSTRUCTION_DECORATORS,
  isReconstructionDecorator,
  getReconstructionTraitsFromDecorators,
  type HolomapReconstructionTraitName,
} from '../holomap-reconstruction';
import { VR_TRAITS } from '../index';

describe('HoloMap Reconstruction Traits — Sprint 1 (registration)', () => {
  it('exports 5 traits', () => {
    expect(HOLOMAP_RECONSTRUCTION_TRAITS).toHaveLength(5);
  });

  it('contains the canonical reconstruction trait', () => {
    expect(HOLOMAP_RECONSTRUCTION_TRAITS).toContain('holomap_reconstruct');
  });

  it('contains trajectory + anchor traits', () => {
    expect(HOLOMAP_RECONSTRUCTION_TRAITS).toContain('holomap_camera_trajectory');
    expect(HOLOMAP_RECONSTRUCTION_TRAITS).toContain('holomap_anchor_context');
  });

  it('contains drift correction + splat output traits', () => {
    expect(HOLOMAP_RECONSTRUCTION_TRAITS).toContain('holomap_drift_correction');
    expect(HOLOMAP_RECONSTRUCTION_TRAITS).toContain('holomap_splat_output');
  });

  it('all traits are included in VR_TRAITS', () => {
    for (const trait of HOLOMAP_RECONSTRUCTION_TRAITS) {
      expect(VR_TRAITS).toContain(trait);
    }
  });

  it('has no duplicate traits', () => {
    const unique = new Set(HOLOMAP_RECONSTRUCTION_TRAITS);
    expect(unique.size).toBe(HOLOMAP_RECONSTRUCTION_TRAITS.length);
  });

  it('all trait names follow snake_case + holomap_ prefix convention', () => {
    for (const trait of HOLOMAP_RECONSTRUCTION_TRAITS) {
      expect(trait).toMatch(/^holomap_[a-z][a-z0-9_]*$/);
    }
  });
});

describe('HoloMap Reconstruction Decorators — Sprint 3 (composition sugar)', () => {
  it('exports 3 decorator names', () => {
    expect(HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES).toHaveLength(3);
  });

  it('decorator name list matches mapping keys exactly', () => {
    const namesFromList = new Set(HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES);
    const keysFromMap = new Set(Object.keys(HOLOMAP_RECONSTRUCTION_DECORATORS));
    expect(keysFromMap).toEqual(namesFromList);
  });

  it('every decorator resolves to at least one trait', () => {
    for (const decorator of HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES) {
      const traits = HOLOMAP_RECONSTRUCTION_DECORATORS[decorator];
      expect(traits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every resolved trait is a member of HOLOMAP_RECONSTRUCTION_TRAITS', () => {
    const allowedTraits = new Set<string>(HOLOMAP_RECONSTRUCTION_TRAITS);
    for (const decorator of HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES) {
      for (const trait of HOLOMAP_RECONSTRUCTION_DECORATORS[decorator]) {
        expect(allowedTraits.has(trait)).toBe(true);
      }
    }
  });

  it('decorator names follow snake_case (no holomap_ prefix — that is for traits)', () => {
    for (const decorator of HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES) {
      expect(decorator).toMatch(/^[a-z][a-z0-9_]*$/);
      // Decorators don't use the holomap_ prefix — that's reserved for traits
      // so the runtime can distinguish "raw trait name" from "decorator alias".
      expect(decorator).not.toMatch(/^holomap_/);
    }
  });

  it('reconstruction_source resolves to the full session trio', () => {
    const traits = HOLOMAP_RECONSTRUCTION_DECORATORS.reconstruction_source;
    expect(traits).toContain('holomap_reconstruct');
    expect(traits).toContain('holomap_camera_trajectory');
    expect(traits).toContain('holomap_anchor_context');
  });

  it('acceptance_video resolves to reconstruct + splat output', () => {
    const traits = HOLOMAP_RECONSTRUCTION_DECORATORS.acceptance_video;
    expect(traits).toContain('holomap_reconstruct');
    expect(traits).toContain('holomap_splat_output');
  });

  it('drift_corrected resolves to the single drift-correction trait', () => {
    const traits = HOLOMAP_RECONSTRUCTION_DECORATORS.drift_corrected;
    expect(traits).toEqual(['holomap_drift_correction']);
  });
});

describe('isReconstructionDecorator — predicate', () => {
  it('returns true for canonical decorator names', () => {
    expect(isReconstructionDecorator('reconstruction_source')).toBe(true);
    expect(isReconstructionDecorator('acceptance_video')).toBe(true);
    expect(isReconstructionDecorator('drift_corrected')).toBe(true);
  });

  it('strips leading @ before testing', () => {
    expect(isReconstructionDecorator('@reconstruction_source')).toBe(true);
    expect(isReconstructionDecorator('@acceptance_video')).toBe(true);
    expect(isReconstructionDecorator('@drift_corrected')).toBe(true);
  });

  it('returns false for non-HoloMap decorators', () => {
    expect(isReconstructionDecorator('npc')).toBe(false);
    expect(isReconstructionDecorator('@npc')).toBe(false);
    expect(isReconstructionDecorator('llm_agent')).toBe(false);
    expect(isReconstructionDecorator('geo_anchor')).toBe(false); // a trait, not a decorator
  });

  it('returns false for unrelated strings', () => {
    expect(isReconstructionDecorator('')).toBe(false);
    expect(isReconstructionDecorator('@')).toBe(false);
    expect(isReconstructionDecorator('reconstruction')).toBe(false); // close but not exact
    expect(isReconstructionDecorator('Reconstruction_Source')).toBe(false); // case-sensitive
  });

  it('returns false for raw trait names (those are NOT decorators)', () => {
    for (const trait of HOLOMAP_RECONSTRUCTION_TRAITS) {
      expect(isReconstructionDecorator(trait)).toBe(false);
    }
  });
});

describe('getReconstructionTraitsFromDecorators — resolver', () => {
  it('resolves a single decorator to its trait list', () => {
    const result = getReconstructionTraitsFromDecorators(['reconstruction_source']);
    expect(result).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
    ]);
  });

  it('unions traits across multiple decorators in first-seen order', () => {
    const result = getReconstructionTraitsFromDecorators([
      'reconstruction_source',
      'drift_corrected',
    ]);
    expect(result).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
      'holomap_drift_correction',
    ]);
  });

  it('deduplicates traits when overlapping decorators are applied', () => {
    // reconstruction_source contains holomap_reconstruct;
    // acceptance_video also contains holomap_reconstruct — the union should
    // contain it exactly once (first-seen order from reconstruction_source).
    const result = getReconstructionTraitsFromDecorators([
      'reconstruction_source',
      'acceptance_video',
    ]);
    const reconstructIndices = result
      .map((t, i) => (t === 'holomap_reconstruct' ? i : -1))
      .filter((i) => i >= 0);
    expect(reconstructIndices).toHaveLength(1);
    expect(result).toContain('holomap_splat_output');
  });

  it('preserves first-seen order across complex decorator sequences', () => {
    const result = getReconstructionTraitsFromDecorators([
      'drift_corrected',
      'acceptance_video',
      'reconstruction_source',
    ]);
    // drift_correction appears first because drift_corrected was applied first
    expect(result[0]).toBe('holomap_drift_correction');
    // holomap_reconstruct appears second because acceptance_video resolves to
    // [reconstruct, splat_output] and reconstruct hasn't been seen yet
    expect(result[1]).toBe('holomap_reconstruct');
  });

  it('strips leading @ from each decorator name', () => {
    const result = getReconstructionTraitsFromDecorators([
      '@reconstruction_source',
      '@drift_corrected',
    ]);
    expect(result).toContain('holomap_reconstruct');
    expect(result).toContain('holomap_drift_correction');
  });

  it('silently skips unknown decorators', () => {
    const result = getReconstructionTraitsFromDecorators([
      'npc',
      'reconstruction_source',
      'totally_made_up_decorator',
    ]);
    // Only the HoloMap decorator's traits should be present
    expect(result).toEqual([
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(getReconstructionTraitsFromDecorators([])).toEqual([]);
  });

  it('returns empty array when only unknown decorators are passed', () => {
    expect(getReconstructionTraitsFromDecorators(['foo', 'bar', '@baz'])).toEqual([]);
  });

  it('every trait returned is a valid HolomapReconstructionTraitName', () => {
    const result = getReconstructionTraitsFromDecorators([
      'reconstruction_source',
      'acceptance_video',
      'drift_corrected',
    ]);
    const allowed = new Set<string>(HOLOMAP_RECONSTRUCTION_TRAITS);
    for (const trait of result) {
      expect(allowed.has(trait)).toBe(true);
    }
  });

  it('union of all 3 decorators covers all 5 underlying traits', () => {
    const result = getReconstructionTraitsFromDecorators(
      Array.from(HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES)
    );
    // Should resolve to all 5 unique traits
    expect(new Set(result)).toEqual(new Set(HOLOMAP_RECONSTRUCTION_TRAITS));
    expect(result).toHaveLength(HOLOMAP_RECONSTRUCTION_TRAITS.length);
  });
});

describe('Type-level contract — Sprint 3', () => {
  it('HolomapReconstructionTraitName is the union of HOLOMAP_RECONSTRUCTION_TRAITS members', () => {
    // Compile-time check via assignment — if this widens, TS will complain.
    const traits: HolomapReconstructionTraitName[] = [
      'holomap_reconstruct',
      'holomap_camera_trajectory',
      'holomap_anchor_context',
      'holomap_drift_correction',
      'holomap_splat_output',
    ];
    expect(traits).toHaveLength(HOLOMAP_RECONSTRUCTION_TRAITS.length);
  });
});
