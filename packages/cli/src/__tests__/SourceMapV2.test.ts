/**
 * SourceMapV2 Tests - Sprint 4
 *
 * Tests for enhanced source map generation with column-level mapping,
 * variable name preservation, and scope information.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SourceMapV2, vlqEncode, vlqDecode } from '../build/SourceMapV2';

// =============================================================================
// VLQ encoding
// =============================================================================

describe('VLQ encoding', () => {
  it('encodes zero', () => {
    expect(vlqEncode(0)).toBe('A');
  });

  it('encodes positive integers', () => {
    // VLQ encoding is well-defined: 1→C, 2→E, 15→e, 16→gB
    expect(vlqEncode(1)).toBe('C');
    expect(vlqEncode(2)).toBe('E');
  });

  it('encodes negative integers', () => {
    expect(vlqEncode(-1)).toBe('D');
    expect(vlqEncode(-2)).toBe('F');
  });

  it('decodes back to original', () => {
    for (const n of [-16, -1, 0, 1, 15, 100, 1000]) {
      const encoded = vlqEncode(n);
      const { value } = vlqDecode(encoded);
      expect(value).toBe(n);
    }
  });

  it('encode-decode roundtrip for various values', () => {
    const values = [0, 1, -1, 15, 16, -15, -16, 100, -100, 500, -500];
    for (const v of values) {
      expect(vlqDecode(vlqEncode(v)).value).toBe(v);
    }
  });
});

// =============================================================================
// SourceMapV2
// =============================================================================

describe('SourceMapV2', () => {
  let map: SourceMapV2;

  beforeEach(() => {
    map = new SourceMapV2({ file: 'output.js' });
  });

  describe('source registration', () => {
    it('registers source files', () => {
      const idx = map.addSource('src/scene.hsplus');
      expect(idx).toBe(0);
      expect(map.sourceCount).toBe(1);
    });

    it('returns same index for duplicate source', () => {
      const i1 = map.addSource('src/scene.hsplus');
      const i2 = map.addSource('src/scene.hsplus');
      expect(i1).toBe(i2);
      expect(map.sourceCount).toBe(1);
    });

    it('registers multiple sources with sequential indices', () => {
      expect(map.addSource('a.hsplus')).toBe(0);
      expect(map.addSource('b.hsplus')).toBe(1);
      expect(map.addSource('c.hsplus')).toBe(2);
      expect(map.sourceCount).toBe(3);
    });

    it('stores source content when provided', () => {
      map.addSource('scene.hsplus', 'orb "Test" {}');
      const json = map.toJSON() as any;
      // With includeSourceContent: false (default), no sourcesContent
      expect(json.sourcesContent).toBeUndefined();
    });
  });

  describe('name registration', () => {
    it('registers variable names', () => {
      const idx = map.addName('position');
      expect(idx).toBe(0);
      expect(map.nameCount).toBe(1);
    });

    it('deduplicates names', () => {
      const i1 = map.addName('color');
      const i2 = map.addName('color');
      expect(i1).toBe(i2);
      expect(map.nameCount).toBe(1);
    });
  });

  describe('mappings', () => {
    it('adds mappings', () => {
      const src = map.addSource('a.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 5, column: 10 }, src);
      expect(map.mappingCount).toBe(1);
    });

    it('adds mapping with name', () => {
      const src = map.addSource('a.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 3, column: 5 }, src, 'position');
      expect(map.nameCount).toBe(1);
      expect(map.mappingCount).toBe(1);
    });

    it('multiple mappings on same line', () => {
      const src = map.addSource('a.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 1, column: 0 }, src);
      map.addMapping({ line: 1, column: 10 }, { line: 1, column: 15 }, src);
      map.addMapping({ line: 1, column: 20 }, { line: 2, column: 0 }, src);
      expect(map.mappingCount).toBe(3);
    });
  });

  describe('scope info', () => {
    it('records scopes', () => {
      map.addScope('composition cube', { line: 1, column: 0 }, { line: 20, column: 1 });
      const json = map.toJSON() as any;
      expect(json['x_scopes']).toBeDefined();
      expect(json['x_scopes']).toHaveLength(1);
      expect(json['x_scopes'][0].name).toBe('composition cube');
    });

    it('omits x_scopes when no scopes', () => {
      const json = map.toJSON() as any;
      expect(json['x_scopes']).toBeUndefined();
    });
  });

  describe('toJSON', () => {
    it('produces valid v3 source map structure', () => {
      const src = map.addSource('scene.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 1, column: 0 }, src);
      const json = map.toJSON() as any;

      expect(json.version).toBe(3);
      expect(Array.isArray(json.sources)).toBe(true);
      expect(Array.isArray(json.names)).toBe(true);
      expect(typeof json.mappings).toBe('string');
    });

    it('includes file when specified', () => {
      const json = map.toJSON() as any;
      expect(json.file).toBe('output.js');
    });

    it('includes sourceRoot when specified', () => {
      const m = new SourceMapV2({ sourceRoot: '/src' });
      m.addSource('scene.hsplus');
      const json = m.toJSON() as any;
      expect(json.sourceRoot).toBe('/src');
      expect(json.sources[0]).toContain('scene.hsplus');
    });

    it('includes sourcesContent when option set', () => {
      const m = new SourceMapV2({ includeSourceContent: true });
      m.addSource('scene.hsplus', 'orb "Test" { color: "red" }');
      const json = m.toJSON() as any;
      expect(json.sourcesContent).toBeDefined();
      expect(json.sourcesContent[0]).toContain('orb');
    });

    it('empty map produces valid output', () => {
      const json = map.toJSON() as any;
      expect(json.version).toBe(3);
      expect(json.mappings).toBe('');
    });
  });

  describe('toString and inline', () => {
    it('toString returns JSON string', () => {
      const str = map.toString();
      expect(() => JSON.parse(str)).not.toThrow();
    });

    it('toInlineComment contains base64 data URL', () => {
      const comment = map.toInlineComment();
      expect(comment).toMatch(
        /^\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,/
      );
    });

    it('toInlineComment is decodable', () => {
      const src = map.addSource('test.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 1, column: 0 }, src);
      const comment = map.toInlineComment();
      const base64 = comment.replace(
        '//# sourceMappingURL=data:application/json;charset=utf-8;base64,',
        ''
      );
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded);
      expect(parsed.version).toBe(3);
    });

    it('toExternalComment references the map file', () => {
      const comment = map.toExternalComment('output.js.map');
      expect(comment).toBe('//# sourceMappingURL=output.js.map');
    });
  });

  describe('column-level mapping precision', () => {
    it('preserves column offsets', () => {
      const src = map.addSource('scene.hsplus');
      map.addMapping({ line: 1, column: 5 }, { line: 3, column: 10 }, src, 'position');
      map.addMapping({ line: 1, column: 20 }, { line: 3, column: 25 }, src, 'color');

      const json = map.toJSON() as any;
      // Mappings should be non-empty
      expect(json.mappings.length).toBeGreaterThan(0);
      // Names should contain our variables
      expect(json.names).toContain('position');
      expect(json.names).toContain('color');
    });

    it('multiple lines produce semicolons in mappings', () => {
      const src = map.addSource('a.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 1, column: 0 }, src);
      map.addMapping({ line: 2, column: 0 }, { line: 2, column: 0 }, src);
      map.addMapping({ line: 3, column: 0 }, { line: 3, column: 0 }, src);

      const json = map.toJSON() as any;
      // Should have 2 semicolons for 3 lines
      expect((json.mappings.match(/;/g) || []).length).toBe(2);
    });
  });

  describe('variable names preserved', () => {
    it('names array contains registered names', () => {
      const src = map.addSource('scene.hsplus');
      map.addMapping({ line: 1, column: 0 }, { line: 5, column: 0 }, src, 'position');
      map.addMapping({ line: 1, column: 10 }, { line: 5, column: 10 }, src, 'color');
      map.addMapping({ line: 2, column: 0 }, { line: 6, column: 0 }, src, 'rotation');

      const json = map.toJSON() as any;
      expect(json.names).toContain('position');
      expect(json.names).toContain('color');
      expect(json.names).toContain('rotation');
    });
  });
});
