/**
 * Traits Utilities + Packager Pure Methods — Production Tests
 *
 * Tests trait data integrity, getTraitsByCategory, getCategories,
 * formatTrait, and packager pure methods (getTarballName, isExcluded).
 */

import { describe, it, expect } from 'vitest';
import {
  TRAITS,
  getTraitsByCategory,
  getCategories,
  formatTrait,
} from '../traits';
import { PackagePackager } from '../publish/packager';

// ─── Traits Data + Utilities ─────────────────────────────────────────────

describe('TRAITS Data — Integrity', () => {
  it('has 49 traits', () => {
    expect(Object.keys(TRAITS).length).toBe(49);
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

  it('categories are valid', () => {
    const validCategories = ['interaction', 'physics', 'visual', 'networking', 'behavior', 'spatial', 'audio', 'state'];
    for (const [key, trait] of Object.entries(TRAITS)) {
      expect(validCategories, `${key} has invalid category: ${trait.category}`).toContain(trait.category);
    }
  });
});

describe('getTraitsByCategory — Production', () => {
  it('returns interaction traits', () => {
    const traits = getTraitsByCategory('interaction');
    expect(traits.length).toBeGreaterThan(0);
    expect(traits.every(t => t.category === 'interaction')).toBe(true);
  });

  it('returns physics traits', () => {
    const traits = getTraitsByCategory('physics');
    expect(traits.length).toBeGreaterThan(0);
    expect(traits.every(t => t.category === 'physics')).toBe(true);
  });

  it('returns all categories', () => {
    const categories = ['interaction', 'physics', 'visual', 'networking', 'behavior', 'spatial', 'audio', 'state'] as const;
    for (const cat of categories) {
      const traits = getTraitsByCategory(cat);
      expect(traits.length, `${cat} should have traits`).toBeGreaterThan(0);
    }
  });
});

describe('getCategories — Production', () => {
  it('returns all 8 categories', () => {
    const cats = getCategories();
    expect(cats.length).toBe(8);
  });

  it('counts sum to 49', () => {
    const cats = getCategories();
    const total = cats.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBe(49);
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
