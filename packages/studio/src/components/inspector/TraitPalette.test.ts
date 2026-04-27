import { describe, expect, it } from 'vitest';
import { HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES } from '@holoscript/core';
import { TRAIT_CATALOG } from './TraitPalette';

describe('TraitPalette / HoloMap reconstruction decorators', () => {
  const holoMapCategory = TRAIT_CATALOG.find((c) => c.category === 'HoloMap Reconstruction');

  it('registers a HoloMap Reconstruction category', () => {
    expect(holoMapCategory).toBeDefined();
  });

  it('exposes exactly the decorators declared by core', () => {
    const catalogNames = (holoMapCategory?.traits ?? []).map((t) => t.name).sort();
    const coreNames = [...HOLOMAP_RECONSTRUCTION_DECORATOR_NAMES].sort();
    expect(catalogNames).toEqual(coreNames);
  });

  it('uses bare-decorator semantics (empty defaultProps)', () => {
    for (const trait of holoMapCategory?.traits ?? []) {
      expect(trait.defaultProps).toEqual({});
    }
  });

  it('writes a non-empty description for each decorator', () => {
    for (const trait of holoMapCategory?.traits ?? []) {
      expect(trait.description.length).toBeGreaterThan(20);
    }
  });
});
