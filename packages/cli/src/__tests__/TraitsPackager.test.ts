/**
 * Traits Utilities + Packager Pure Methods — Production Tests
 *
 * Tests trait data integrity, getTraitsByCategory, getCategories,
 * formatTrait, and packager pure methods (getTarballName, isExcluded).
 */

import { describe, it, expect } from 'vitest';
import { TRAITS, getTraitsByCategory, getCategories, formatTrait } from '../traits';
import { PackagePackager } from '../publish/packager';

// ─── Traits Data + Utilities ─────────────────────────────────────────────

describe('TRAITS Data — Integrity', () => {
  it('has at least one trait with no duplicate keys', () => {
    // Live count, no hardcoded stat — per CLAUDE.md "Zero Hardcoded Stats" rule.
    // Invariants: non-empty registry, keys are unique (Object.keys guarantees
    // this by construction, but we assert for intent).
    const keys = Object.keys(TRAITS);
    expect(keys.length).toBeGreaterThan(0);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('every trait has required fields', () => {
    for (const [key, trait] of Object.entries(TRAITS)) {
      expect(trait.name, `${key} missing name`).toBeDefined();
      expect(trait.category, `${key} missing category`).toBeDefined();
      expect(trait.description, `${key} missing description`).toBeDefined();
      expect(trait.example, `${key} missing example`).toBeDefined();
    }
  });

  it('trait names match keys', () => {
    for (const [key, trait] of Object.entries(TRAITS)) {
      expect(trait.name).toBe(key);
    }
  });

  it('categories are valid (every trait category appears in getCategories)', () => {
    // Invariant (not a hardcoded list): the set of categories declared on
    // traits must be exactly the set returned by getCategories(). New
    // categories are valid automatically as long as this invariant holds —
    // we do NOT pin to a static allowlist, which would drift.
    const declaredCategories = new Set(Object.values(TRAITS).map((t) => t.category));
    const reportedCategories = new Set(getCategories().map((c) => c.name));
    expect(reportedCategories).toEqual(declaredCategories);
  });
});

describe('getTraitsByCategory — Production', () => {
  it('returns interaction traits', () => {
    const traits = getTraitsByCategory('interaction');
    expect(traits.length).toBeGreaterThan(0);
    expect(traits.every((t) => t.category === 'interaction')).toBe(true);
  });

  it('returns physics traits', () => {
    const traits = getTraitsByCategory('physics');
    expect(traits.length).toBeGreaterThan(0);
    expect(traits.every((t) => t.category === 'physics')).toBe(true);
  });

  it('returns traits for every declared category', () => {
    // Derive the live category list from TRAITS rather than hardcoding —
    // new categories are covered automatically.
    const categories = Array.from(new Set(Object.values(TRAITS).map((t) => t.category)));
    expect(categories.length).toBeGreaterThan(0);
    for (const cat of categories) {
      const traits = getTraitsByCategory(cat);
      expect(traits.length, `${cat} should have traits`).toBeGreaterThan(0);
    }
  });
});

describe('getCategories — Production', () => {
  it('returns exactly one entry per distinct trait category', () => {
    const cats = getCategories();
    const distinct = new Set(Object.values(TRAITS).map((t) => t.category));
    expect(cats.length).toBe(distinct.size);
    // Every reported category is actually used by at least one trait.
    for (const cat of cats) {
      expect(distinct.has(cat.name)).toBe(true);
    }
  });

  it('counts sum to total trait count', () => {
    const cats = getCategories();
    const total = cats.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(Object.keys(TRAITS).length);
  });

  it('each category has name and count', () => {
    const cats = getCategories();
    for (const cat of cats) {
      expect(cat.name).toBeDefined();
      expect(cat.count).toBeGreaterThan(0);
    }
  });
});

describe('formatTrait — Production', () => {
  it('includes trait name and category', () => {
    const output = formatTrait(TRAITS.grabbable);
    expect(output).toContain('@grabbable');
    expect(output).toContain('interaction');
  });

  it('includes description', () => {
    const output = formatTrait(TRAITS.glowing);
    expect(output).toContain(TRAITS.glowing.description);
  });

  it('verbose mode includes params', () => {
    const output = formatTrait(TRAITS.physics, true);
    expect(output).toContain('Parameters:');
  });

  it('verbose mode includes example', () => {
    const output = formatTrait(TRAITS.grabbable, true);
    expect(output).toContain('Example:');
  });

  it('verbose mode includes required traits', () => {
    const output = formatTrait(TRAITS.throwable, true);
    expect(output).toContain('Requires:');
    expect(output).toContain('@grabbable');
  });
});

// ─── PackagePackager Pure Methods ────────────────────────────────────────

describe('PackagePackager — Pure Methods', () => {
  // Use any-cast to access private methods
  const packager = new PackagePackager('/tmp/test') as any;

  it('getTarballName formats correctly', () => {
    expect(packager.getTarballName('my-package', '1.0.0')).toBe('my-package-1.0.0.tgz');
  });

  it('getTarballName handles scoped packages', () => {
    const name = packager.getTarballName('@holoscript/core', '2.0.0');
    expect(name).toContain('holoscript');
    expect(name).toContain('2.0.0');
    expect(name).toContain('.tgz');
  });

  it('isExcluded matches basic patterns', () => {
    expect(packager.isExcluded('node_modules/pkg/index.js', ['node_modules'])).toBe(true);
    expect(packager.isExcluded('src/index.ts', ['node_modules'])).toBe(false);
  });

  it('isExcluded matches glob-like patterns', () => {
    expect(packager.isExcluded('.git/config', ['.git'])).toBe(true);
    expect(packager.isExcluded('test/foo.test.ts', ['*.test.*'])).toBe(true);
  });

  it('createTarHeader produces 512-byte header', () => {
    const header = packager.createTarHeader('file.txt', 100, 0o644, new Date());
    expect(header.length).toBe(512);
  });
});
