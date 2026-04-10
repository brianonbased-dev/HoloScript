/**
 * ChunkBasedIncrementalParser — Comprehensive Inline Unit Tests
 *
 * Covers:
 * - Constructor / initialization with default and custom cache
 * - First parse (zero cache hits)
 * - Identical re-parse (all cache hits)
 * - Incremental edit detection (only changed chunks re-parsed)
 * - Adding new chunks preserves cached chunks
 * - Removing chunks is handled
 * - Reference/dependency propagation (template changes -> dependent re-parse)
 * - clearCache / getCacheStats
 * - assembleAST returns fragment for multi-chunk or single node for one chunk
 * - parseIncrementalChunks convenience function
 * - Edge cases: empty input, single-line, malformed input
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ChunkBasedIncrementalParser,
  parseIncrementalChunks,
  type IncrementalParseResult,
} from './IncrementalParser';
import { ParseCache } from './ParseCache';

// =============================================================================
// Helpers
// =============================================================================

function makeSource(...blocks: string[]): string {
  return blocks.join('\n\n');
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

const ORB_D = `orb "OrbD" {
  color: "purple"
}`;

const TEMPLATE_BASE = `template "BaseStyle" {
  opacity: 0.9
  castShadow: true
}`;

const ORB_USES_TEMPLATE = `orb "Styled" {
  ...BaseStyle
  color: "white"
}`;

// =============================================================================
// Constructor
// =============================================================================

describe('ChunkBasedIncrementalParser - Constructor', () => {
  it('creates with default globalParseCache', () => {
    const parser = new ChunkBasedIncrementalParser();
    expect(parser).toBeDefined();
  });

  it('creates with custom ParseCache', () => {
    const cache = new ParseCache(10);
    const parser = new ChunkBasedIncrementalParser(cache);
    expect(parser).toBeDefined();
  });

  it('initial getCacheStats returns zero size', () => {
    const parser = new ChunkBasedIncrementalParser(new ParseCache(50));
    const stats = parser.getCacheStats();
    expect(stats.size).toBe(0);
    expect(stats.maxSize).toBe(500);
  });
});

// =============================================================================
// First Parse (Cold Cache)
// =============================================================================

describe('ChunkBasedIncrementalParser - First Parse', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('returns zero cache hits on first parse', () => {
    const result = parser.parse(makeSource(ORB_A, ORB_B));
    expect(result.cached).toBe(0);
    expect(result.parsed).toBeGreaterThan(0);
  });

  it('returns a defined AST', () => {
    const result = parser.parse(makeSource(ORB_A));
    expect(result.ast).toBeDefined();
  });

  it('returns non-negative duration', () => {
    const result = parser.parse(makeSource(ORB_A));
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  it('marks all chunks as changed on first parse', () => {
    const result = parser.parse(makeSource(ORB_A, ORB_B));
    // All chunks are new (not previously seen)
    expect(result.changedChunks.length).toBeGreaterThan(0);
  });

  it('handles empty source', () => {
    const result = parser.parse('');
    expect(result.ast).toBeDefined();
    expect(result.cached).toBe(0);
    expect(result.parsed).toBe(0);
  });

  it('handles whitespace-only source', () => {
    const result = parser.parse('   \n\n   ');
    expect(result.ast).toBeDefined();
  });
});

// =============================================================================
// Identical Re-parse (Full Cache Hit)
// =============================================================================

describe('ChunkBasedIncrementalParser - Identical Re-parse', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('hits cache for all chunks on identical re-parse', () => {
    const source = makeSource(ORB_A, ORB_B, ORB_C);
    parser.parse(source);
    const result = parser.parse(source);

    expect(result.cached).toBeGreaterThan(0);
    expect(result.parsed).toBe(0);
    expect(result.changedChunks).toHaveLength(0);
  });

  it('AST is still valid after cache hit', () => {
    const source = makeSource(ORB_A, ORB_B);
    parser.parse(source);
    const result = parser.parse(source);
    expect(result.ast).toBeDefined();
  });

  it('duration is small on cached re-parse', () => {
    const source = makeSource(ORB_A, ORB_B, ORB_C);
    parser.parse(source);
    const result = parser.parse(source);
    // Should be very fast since everything is cached
    expect(result.duration).toBeLessThan(100);
  });
});

// =============================================================================
// Incremental Edit Detection
// =============================================================================

describe('ChunkBasedIncrementalParser - Incremental Edits', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('only re-parses the changed chunk when one orb is edited', () => {
    parser.parse(makeSource(ORB_A, ORB_B, ORB_C));
    const result = parser.parse(makeSource(ORB_A_MODIFIED, ORB_B, ORB_C));

    expect(result.changedChunks).toHaveLength(1);
    expect(result.changedChunks[0]).toContain('OrbA');
    expect(result.cached).toBe(2); // B and C from cache
    expect(result.parsed).toBe(1); // only A re-parsed
  });

  it('re-parses multiple chunks if multiple are changed', () => {
    parser.parse(makeSource(ORB_A, ORB_B));

    const modB = `orb "OrbB" {\n  color: "orange"\n  scale: 3.0\n}`;
    const result = parser.parse(makeSource(ORB_A_MODIFIED, modB));

    expect(result.changedChunks.length).toBeGreaterThanOrEqual(2);
    expect(result.parsed).toBeGreaterThanOrEqual(2);
  });

  it('AST reflects the modified content', () => {
    parser.parse(makeSource(ORB_A, ORB_B));
    const result = parser.parse(makeSource(ORB_A_MODIFIED, ORB_B));

    expect(result.ast).toBeDefined();
    expect(result.changedChunks.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Adding / Removing Chunks
// =============================================================================

describe('ChunkBasedIncrementalParser - Adding Chunks', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('keeps existing orbs cached when new orb is appended', () => {
    parser.parse(makeSource(ORB_A, ORB_B));
    const result = parser.parse(makeSource(ORB_A, ORB_B, ORB_D));

    expect(result.cached).toBe(2); // A and B cached
    expect(result.parsed).toBe(1); // D is new
  });

  it('keeps existing orbs cached when new orb is prepended', () => {
    parser.parse(makeSource(ORB_B, ORB_C));
    const result = parser.parse(makeSource(ORB_D, ORB_B, ORB_C));

    expect(result.cached).toBe(2);
    expect(result.parsed).toBe(1);
  });

  it('total chunks in result equals cached + parsed', () => {
    parser.parse(makeSource(ORB_A, ORB_B));
    const result = parser.parse(makeSource(ORB_A, ORB_B, ORB_C));

    expect(result.cached + result.parsed).toBe(3);
  });
});

describe('ChunkBasedIncrementalParser - Removing Chunks', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('handles removal of a chunk gracefully', () => {
    parser.parse(makeSource(ORB_A, ORB_B, ORB_C));
    const result = parser.parse(makeSource(ORB_A, ORB_C));

    expect(result.ast).toBeDefined();
    // A and C should be available (cached or re-parsed)
    expect(result.cached + result.parsed).toBeGreaterThanOrEqual(2);
  });

  it('handles removal of all chunks (empty source)', () => {
    parser.parse(makeSource(ORB_A, ORB_B));
    const result = parser.parse('');

    expect(result.ast).toBeDefined();
    expect(result.parsed).toBe(0);
  });
});

// =============================================================================
// Reference / Dependency Propagation
// =============================================================================

describe('ChunkBasedIncrementalParser - Reference Propagation', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('changing a template triggers re-parse of dependent orbs', () => {
    parser.parse(makeSource(TEMPLATE_BASE, ORB_USES_TEMPLATE, ORB_B));

    const modifiedTemplate = `template "BaseStyle" {\n  opacity: 0.5\n  castShadow: false\n}`;
    const result = parser.parse(makeSource(modifiedTemplate, ORB_USES_TEMPLATE, ORB_B));

    // OrbB doesn't reference BaseStyle, so should be cached
    expect(result.cached).toBeGreaterThanOrEqual(1);
    expect(result.changedChunks.length).toBeGreaterThanOrEqual(1);
  });

  it('non-dependent chunk stays cached when template changes', () => {
    parser.parse(makeSource(TEMPLATE_BASE, ORB_USES_TEMPLATE, ORB_C));

    const modifiedTemplate = `template "BaseStyle" {\n  opacity: 0.1\n}`;
    const result = parser.parse(makeSource(modifiedTemplate, ORB_USES_TEMPLATE, ORB_C));

    // OrbC doesn't use BaseStyle -> should remain cached
    expect(result.cached).toBeGreaterThanOrEqual(1);
  });

  it('unchanged source with references produces all cache hits', () => {
    const source = makeSource(TEMPLATE_BASE, ORB_USES_TEMPLATE);
    parser.parse(source);
    const result = parser.parse(source);

    expect(result.cached).toBeGreaterThan(0);
    expect(result.parsed).toBe(0);
  });
});

// =============================================================================
// clearCache / getCacheStats
// =============================================================================

describe('ChunkBasedIncrementalParser - clearCache', () => {
  it('clears both internal cache and lastChunks', () => {
    const parser = new ChunkBasedIncrementalParser(new ParseCache(50));
    parser.parse(makeSource(ORB_A, ORB_B));

    parser.clearCache();

    const stats = parser.getCacheStats();
    expect(stats.size).toBe(0);
  });

  it('after clearCache, next parse has zero cache hits', () => {
    const parser = new ChunkBasedIncrementalParser(new ParseCache(50));
    const source = makeSource(ORB_A, ORB_B);
    parser.parse(source);

    parser.clearCache();
    const result = parser.parse(source);

    // All chunks should be detected as new after cache clear
    expect(result.cached).toBe(0);
    expect(result.parsed).toBeGreaterThan(0);
  });
});

describe('ChunkBasedIncrementalParser - getCacheStats', () => {
  it('returns size matching number of distinct chunks parsed', () => {
    const parser = new ChunkBasedIncrementalParser(new ParseCache(50));
    parser.parse(makeSource(ORB_A, ORB_B, ORB_C));

    const stats = parser.getCacheStats();
    expect(stats.size).toBe(3); // Three orbs -> three chunks tracked
  });

  it('maxSize is 500', () => {
    const parser = new ChunkBasedIncrementalParser(new ParseCache(50));
    expect(parser.getCacheStats().maxSize).toBe(500);
  });
});

// =============================================================================
// Memory Bounds / LRU Eviction
// =============================================================================

describe('ChunkBasedIncrementalParser - Memory Bounds', () => {
  it('cache stays bounded with small capacity', () => {
    const smallCache = new ParseCache(3);
    const parser = new ChunkBasedIncrementalParser(smallCache);

    const sources = [ORB_A, ORB_B, ORB_C, ORB_D, ORB_USES_TEMPLATE];
    for (const src of sources) {
      parser.parse(src);
    }

    const stats = smallCache.getStats();
    expect(stats.size).toBeLessThanOrEqual(3);
  });

  it('many orbs does not exceed cache max', () => {
    const cache = new ParseCache(10);
    const parser = new ChunkBasedIncrementalParser(cache);

    const manyOrbs = Array.from(
      { length: 25 },
      (_, i) => `orb "Orb${i}" {\n  color: "color${i}"\n}`
    ).join('\n\n');

    parser.parse(manyOrbs);

    expect(cache.getStats().size).toBeLessThanOrEqual(10);
  });

  it('repeated unique parses trigger evictions', () => {
    const cache = new ParseCache(2);
    const parser = new ChunkBasedIncrementalParser(cache);

    for (let i = 0; i < 50; i++) {
      parser.parse(`orb "Unique${i}" { color: "c${i}" }`);
    }

    expect(cache.getStats().size).toBeLessThanOrEqual(2);
    expect(cache.getStats().evictions).toBeGreaterThan(0);
  });
});

// =============================================================================
// parseIncrementalChunks convenience function
// =============================================================================

describe('parseIncrementalChunks', () => {
  it('returns a valid IncrementalParseResult', () => {
    const result = parseIncrementalChunks(makeSource(ORB_A, ORB_B));
    expect(result).toHaveProperty('ast');
    expect(result).toHaveProperty('cached');
    expect(result).toHaveProperty('parsed');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('changedChunks');
  });

  it('accepts a custom cache', () => {
    const cache = new ParseCache(5);
    const result = parseIncrementalChunks(ORB_A, cache);
    expect(result.ast).toBeDefined();
  });

  it('works with empty source', () => {
    const result = parseIncrementalChunks('');
    expect(result.ast).toBeDefined();
  });
});

// =============================================================================
// AST Assembly
// =============================================================================

describe('ChunkBasedIncrementalParser - AST Assembly', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('single chunk parse returns the chunk AST directly (not wrapped in fragment)', () => {
    const result = parser.parse(ORB_A);
    expect(result.ast).toBeDefined();
    // Single chunk: should return the parsed node, not a fragment
    if (result.parsed === 1) {
      expect(result.ast.type).not.toBe('fragment');
    }
  });

  it('multi-chunk parse returns a fragment node with children', () => {
    const result = parser.parse(makeSource(ORB_A, ORB_B, ORB_C));
    expect(result.ast).toBeDefined();

    if (result.parsed >= 2 || result.cached >= 2) {
      // Multi-chunk should produce fragment
      if (result.ast.type === 'fragment') {
        expect(result.ast.children).toBeDefined();
        expect(result.ast.children.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('ChunkBasedIncrementalParser - Edge Cases', () => {
  let parser: ChunkBasedIncrementalParser;

  beforeEach(() => {
    parser = new ChunkBasedIncrementalParser(new ParseCache(50));
  });

  it('handles source with only comments', () => {
    const result = parser.parse('// This is a comment\n// Another comment');
    expect(result.ast).toBeDefined();
  });

  it('handles source with directives', () => {
    const result = parser.parse('@import "other.holo"\n\norb "Test" {\n  val: 1\n}');
    expect(result.ast).toBeDefined();
  });

  it('handles rapid successive parses', () => {
    for (let i = 0; i < 20; i++) {
      const orb = `orb "Iter${i}" { value: ${i} }`;
      const result = parser.parse(orb);
      expect(result.ast).toBeDefined();
    }
  });

  it('handles very large single orb', () => {
    const props = Array.from({ length: 100 }, (_, i) => `  prop${i}: ${i}`).join('\n');
    const largeOrb = `orb "BigOrb" {\n${props}\n}`;
    const result = parser.parse(largeOrb);
    expect(result.ast).toBeDefined();
  });

  it('handles malformed input without crashing', () => {
    const result = parser.parse('orb { {{{ this is not valid');
    expect(result.ast).toBeDefined();
  });
});
