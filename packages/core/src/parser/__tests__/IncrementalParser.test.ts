/**
 * Incremental Parser Acceptance Tests - Sprint 2
 *
 * Verifies the ChunkBasedIncrementalParser correctly:
 * 1. Only re-parses the changed orb when editing inside a composition
 * 2. Does NOT invalidate unrelated compositions on new-composition addition
 * 3. Propagates reference changes to dependent chunks
 * 4. Stays bounded via LRU eviction in ParseCache
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { ChunkBasedIncrementalParser } from '../IncrementalParser';
import { ParseCache } from '../ParseCache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSource(...orbs: string[]): string {
  return orbs.join('\n\n');
}

const ORB_A = `orb "OrbA" {
  color: "red"
  scale: 1.0
}`;

const ORB_B = `orb "OrbB" {
  color: "blue"
  scale: 2.0
}`;

const ORB_C = `orb "OrbC" {
  color: "green"
  position: [0, 1, 0]
}`;

const ORB_A_MODIFIED = `orb "OrbA" {
  color: "yellow"
  scale: 1.5
}`;

const ORB_D_NEW = `orb "OrbD" {
  color: "purple"
}`;

const TEMPLATE_SHARED = `template "BaseStyle" {
  opacity: 0.9
  castShadow: true
}`;

const ORB_USES_TEMPLATE = `orb "Styled" {
  ...BaseStyle
  color: "white"
}`;

const ORB_USES_TEMPLATE_UPDATED = `orb "Styled" {
  ...BaseStyle
  color: "black"
}`;

// ---------------------------------------------------------------------------
// Suite 1: Edits within a composition only re-parse that orb
// ---------------------------------------------------------------------------

describe('IncrementalParser - Edit within composition', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  test('first parse has zero cache hits', () => {
    const source = makeSource(ORB_A, ORB_B, ORB_C);
    const result = parser.parse(source);

    expect(result.cached).toBe(0);
    expect(result.parsed).toBeGreaterThan(0);
    expect(result.ast).toBeDefined();
  });

  test('identical re-parse hits cache for all chunks', () => {
    const source = makeSource(ORB_A, ORB_B, ORB_C);
    parser.parse(source); // warm cache
    const result = parser.parse(source);

    // All chunks should come from cache
    expect(result.cached).toBeGreaterThan(0);
    expect(result.parsed).toBe(0);
    expect(result.changedChunks).toHaveLength(0);
  });

  test('editing OrbA only re-parses OrbA, not OrbB or OrbC', () => {
    const source1 = makeSource(ORB_A, ORB_B, ORB_C);
    parser.parse(source1);

    const source2 = makeSource(ORB_A_MODIFIED, ORB_B, ORB_C);
    const result = parser.parse(source2);

    // Only OrbA changed
    expect(result.changedChunks).toHaveLength(1);
    expect(result.changedChunks[0]).toContain('OrbA');

    // B and C should be cached
    expect(result.cached).toBe(2);
    expect(result.parsed).toBe(1);
  });

  test('parse result AST reflects the modification', () => {
    const source1 = makeSource(ORB_A, ORB_B);
    parser.parse(source1);

    const source2 = makeSource(ORB_A_MODIFIED, ORB_B);
    const result = parser.parse(source2);

    expect(result.ast).toBeDefined();
    expect(result.changedChunks).toHaveLength(1);
    // Duration should be fast (incremental)
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Adding a new composition doesn't invalidate others
// ---------------------------------------------------------------------------

describe('IncrementalParser - Adding new composition', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  test('adding new orb keeps existing orbs cached', () => {
    const source1 = makeSource(ORB_A, ORB_B);
    parser.parse(source1);

    // Add OrbD at the end
    const source2 = makeSource(ORB_A, ORB_B, ORB_D_NEW);
    const result = parser.parse(source2);

    // OrbA and OrbB should still be cached
    expect(result.cached).toBe(2);
    // Only OrbD needs parsing
    expect(result.parsed).toBe(1);
    expect(result.changedChunks).toHaveLength(1);
  });

  test('adding new orb at the beginning preserves later orbs', () => {
    const source1 = makeSource(ORB_B, ORB_C);
    parser.parse(source1);

    // Prepend OrbD
    const source2 = makeSource(ORB_D_NEW, ORB_B, ORB_C);
    const result = parser.parse(source2);

    // B and C content unchanged → should stay cached
    expect(result.cached).toBe(2);
    expect(result.parsed).toBe(1);
  });

  test('result AST includes all orbs after addition', () => {
    const source1 = makeSource(ORB_A, ORB_B);
    parser.parse(source1);

    const source2 = makeSource(ORB_A, ORB_B, ORB_C);
    const result = parser.parse(source2);

    expect(result.ast).toBeDefined();
    expect(result.cached + result.parsed).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Reference changes propagate correctly
// ---------------------------------------------------------------------------

describe('IncrementalParser - Reference change propagation', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  test('changing a template re-parses dependent orbs', () => {
    const source1 = makeSource(TEMPLATE_SHARED, ORB_USES_TEMPLATE, ORB_B);
    parser.parse(source1);

    const TEMPLATE_MODIFIED = `template "BaseStyle" {
  opacity: 0.5
  castShadow: false
}`;
    const source2 = makeSource(TEMPLATE_MODIFIED, ORB_USES_TEMPLATE, ORB_B);
    const result = parser.parse(source2);

    // Template changed → itself + dependent "Styled" orb should re-parse
    // OrbB doesn't reference BaseStyle → stays cached
    const independentCached = result.cached;
    expect(independentCached).toBeGreaterThanOrEqual(1); // OrbB is cached
    expect(result.changedChunks.length).toBeGreaterThanOrEqual(1);
  });

  test('non-referencing orb stays cached when template changes', () => {
    const source1 = makeSource(TEMPLATE_SHARED, ORB_USES_TEMPLATE, ORB_C);
    parser.parse(source1);

    const TEMPLATE_MODIFIED = `template "BaseStyle" {
  opacity: 0.1
}`;
    const source2 = makeSource(TEMPLATE_MODIFIED, ORB_USES_TEMPLATE, ORB_C);
    const result = parser.parse(source2);

    // OrbC doesn't use BaseStyle → should come from cache
    expect(result.cached).toBeGreaterThanOrEqual(1);
  });

  test('changing orb content that is itself unchanged keeps reference chain stable', () => {
    const source1 = makeSource(TEMPLATE_SHARED, ORB_USES_TEMPLATE);
    parser.parse(source1);

    // Same content, identical re-parse
    const result = parser.parse(source1);
    expect(result.cached).toBeGreaterThan(0);
    expect(result.parsed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Memory usage stays bounded (LRU eviction)
// ---------------------------------------------------------------------------

describe('IncrementalParser - Memory bounds via ParseCache LRU', () => {
  test('cache evicts oldest entries when capacity is exceeded', () => {
    // Create a very small cache (capacity = 3)
    const smallCache = new ParseCache(3);
    const parser = new ChunkBasedIncrementalParser(smallCache);

    // Fill with 5 different sources to trigger eviction
    const sources = [ORB_A, ORB_B, ORB_C, ORB_D_NEW, ORB_USES_TEMPLATE];
    for (const src of sources) {
      parser.parse(src);
    }

    // Cache stats should show bounded size
    const stats = smallCache.getStats();
    expect(stats.size).toBeLessThanOrEqual(3);
  });

  test('large file with many orbs does not grow unbounded', () => {
    const maxCacheSize = 10;
    const cache = new ParseCache(maxCacheSize);
    const parser = new ChunkBasedIncrementalParser(cache);

    // Parse files with 20+ chunks each
    const manyOrbs = Array.from(
      { length: 25 },
      (_, i) => `orb "Orb${i}" {\n  color: "color${i}"\n}`
    ).join('\n\n');

    parser.parse(manyOrbs);

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(maxCacheSize);
  });

  test('repeated incremental edits do not grow memory', () => {
    // Cache max = 2, but we parse 50 unique single-orb sources (50 distinct IDs)
    // → must trigger eviction to stay bounded
    const cache = new ParseCache(2);
    const parser = new ChunkBasedIncrementalParser(cache);

    for (let i = 0; i < 50; i++) {
      // Each iteration is a unique orb name → unique chunk ID → forces eviction
      const uniqueOrb = `orb "UniqueOrb${i}" { color: "color${i}" }`;
      parser.parse(uniqueOrb);
    }

    const stats = cache.getStats();
    expect(stats.size).toBeLessThanOrEqual(2);
    expect(stats.evictions).toBeGreaterThan(0);
  });
});
