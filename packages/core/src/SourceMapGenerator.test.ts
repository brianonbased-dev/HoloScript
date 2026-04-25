/**
 * Tests for HoloScript SourceMapGenerator
 *
 * Covers:
 * - Base64 VLQ encoding/decoding
 * - Source registration
 * - Mapping generation
 * - Source map v3 output format
 * - Consumer (reverse lookup)
 * - v4.2 domain block mapping
 */

import { describe, it, expect } from 'vitest';
import { readJson } from './errors/safeJsonParse';
import { SourceMapGenerator, SourceMapConsumer } from './SourceMapGenerator';

describe('SourceMapGenerator', () => {
  describe('constructor', () => {
    it('creates generator with file name', () => {
      const gen = new SourceMapGenerator({ file: 'output.js' });
      const map = gen.generate();
      expect(map.version).toBe(3);
      expect(map.file).toBe('output.js');
    });

    it('creates generator with source root', () => {
      const gen = new SourceMapGenerator({ file: 'out.js', sourceRoot: '/src/' });
      const map = gen.generate();
      expect(map.sourceRoot).toBe('/src/');
    });
  });

  describe('addSource', () => {
    it('adds source and returns index', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const idx = gen.addSource('input.holo');
      expect(idx).toBe(0);
    });

    it('returns same index for duplicate source', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const idx1 = gen.addSource('input.holo');
      const idx2 = gen.addSource('input.holo');
      expect(idx1).toBe(idx2);
    });

    it('stores source content when provided', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      gen.addSource('input.holo', 'sensor "S" { }');
      const map = gen.generate();
      expect(map.sourcesContent![0]).toBe('sensor "S" { }');
    });
  });

  describe('addName', () => {
    it('adds name and returns index', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const idx = gen.addName('myVariable');
      expect(idx).toBe(0);
    });

    it('returns same index for duplicate name', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const idx1 = gen.addName('foo');
      const idx2 = gen.addName('foo');
      expect(idx1).toBe(idx2);
    });
  });

  describe('addMapping', () => {
    it('adds mapping with generated position only', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      gen.addMapping({ generated: { line: 1, column: 0 } });
      const map = gen.generate();
      expect(map.mappings).toBeDefined();
      expect(map.mappings.length).toBeGreaterThan(0);
    });

    it('adds mapping with original position', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      gen.addSource('input.holo');
      gen.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 0 },
        source: 'input.holo',
      });
      const map = gen.generate();
      expect(map.mappings).toBeDefined();
    });

    it('adds mapping with name', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      gen.addSource('input.holo');
      gen.addMapping({
        generated: { line: 1, column: 5 },
        original: { line: 2, column: 3 },
        source: 'input.holo',
        name: 'myVariable',
      });
      const map = gen.generate();
      expect(map.names).toContain('myVariable');
    });
  });

  describe('VLQ round-trip', () => {
    it('mappings are correctly generated and decodable', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      gen.addSource('a.holo', 'content');
      gen.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 0 },
        source: 'a.holo',
        name: 'foo',
      });
      gen.addMapping({
        generated: { line: 2, column: 5 },
        original: { line: 3, column: 10 },
        source: 'a.holo',
        name: 'bar',
      });
      const map = gen.generate();
      const consumer = new SourceMapConsumer(map);

      // Round-trip: lookup generated → original
      const pos1 = consumer.originalPositionFor({ line: 1, column: 0 });
      expect(pos1.source).toBe('a.holo');
      expect(pos1.line).toBe(1);
      expect(pos1.column).toBe(0);
      expect(pos1.name).toBe('foo');

      const pos2 = consumer.originalPositionFor({ line: 2, column: 5 });
      expect(pos2.source).toBe('a.holo');
      expect(pos2.line).toBe(3);
      expect(pos2.column).toBe(10);
      expect(pos2.name).toBe('bar');
    });

    it('returns null for unmapped positions', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const consumer = new SourceMapConsumer(gen.generate());
      const pos = consumer.originalPositionFor({ line: 99, column: 0 });
      expect(pos.source).toBeNull();
    });
  });

  describe('generate', () => {
    it('produces valid v3 source map', () => {
      const gen = new SourceMapGenerator({ file: 'scene.js' });
      gen.addSource('scene.holo', 'sensor "Temp" { type: "DHT22" }');
      gen.addMapping({
        generated: { line: 1, column: 0 },
        original: { line: 1, column: 0 },
        source: 'scene.holo',
      });
      const map = gen.generate();
      expect(map.version).toBe(3);
      expect(map.file).toBe('scene.js');
      expect(map.sources).toContain('scene.holo');
      expect(typeof map.mappings).toBe('string');
    });
  });

  describe('toString / toDataURL / toComment', () => {
    it('produces JSON string', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const json = gen.toString();
      const parsed = readJson(json) as { version: number; sources: string[] };
      expect(parsed.version).toBe(3);
    });

    it('produces data URL for inline source maps', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const url = gen.toDataURL();
      expect(url).toMatch(/^data:application\/json;charset=utf-8;base64,/);
    });

    it('produces source map comment', () => {
      const gen = new SourceMapGenerator({ file: 'out.js' });
      const comment = gen.toComment();
      expect(comment).toContain('sourceMappingURL');
    });
  });

  describe('addDomainBlockMapping (v4.2)', () => {
    it('adds domain block mapping', () => {
      const gen = new SourceMapGenerator({ file: 'scene.js' });
      gen.addDomainBlockMapping({
        domain: 'iot',
        blockName: 'TempSensor',
        source: 'factory.holo',
        originalLine: 5,
        originalColumn: 4,
        generatedLine: 10,
        generatedColumn: 0,
      });
      const map = gen.generate();
      expect(map.sources).toContain('factory.holo');
      expect(map.names).toContain('iot:TempSensor');
    });
  });
});

// =============================================================================
// SOURCE MAP CONSUMER
// =============================================================================

describe('SourceMapConsumer', () => {
  it('constructs from source map object', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    gen.addSource('input.holo', 'sensor "S" { }');
    gen.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 1, column: 0 },
      source: 'input.holo',
    });
    const map = gen.generate();
    const consumer = new SourceMapConsumer(map);
    expect(consumer.sources).toContain('input.holo');
  });

  it('constructs from JSON string', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    gen.addSource('input.holo');
    const consumer = new SourceMapConsumer(gen.toString());
    expect(consumer.sources).toContain('input.holo');
  });

  it('returns source content', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    gen.addSource('input.holo', 'sensor "S" { }');
    const map = gen.generate();
    const consumer = new SourceMapConsumer(map);
    expect(consumer.sourceContentFor('input.holo')).toBe('sensor "S" { }');
  });

  it('returns null for unknown source content', () => {
    const gen = new SourceMapGenerator({ file: 'out.js' });
    gen.addSource('input.holo');
    const consumer = new SourceMapConsumer(gen.generate());
    expect(consumer.sourceContentFor('nonexistent.holo')).toBeNull();
  });
});
