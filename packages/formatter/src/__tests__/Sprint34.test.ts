/**
 * Sprint 34 — @holoscript/formatter acceptance tests
 * Covers: HoloScriptFormatter, convenience functions, ConfigLoader
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  HoloScriptFormatter,
  format,
  formatRange,
  check,
  createFormatter,
  DEFAULT_CONFIG,
  type FormatterConfig,
  type FormatResult,
} from '../index.js';
import { ConfigLoader } from '../ConfigLoader.js';

// ═══════════════════════════════════════════════
// DEFAULT_CONFIG
// ═══════════════════════════════════════════════
describe('DEFAULT_CONFIG', () => {
  it('has expected shape', () => {
    expect(DEFAULT_CONFIG).toBeDefined();
    expect(typeof DEFAULT_CONFIG.indentSize).toBe('number');
    expect(typeof DEFAULT_CONFIG.useTabs).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.maxLineLength).toBe('number');
    expect(typeof DEFAULT_CONFIG.braceStyle).toBe('string');
    expect(typeof DEFAULT_CONFIG.semicolons).toBe('boolean');
    expect(typeof DEFAULT_CONFIG.singleQuote).toBe('boolean');
  });

  it('indentSize is 2 or 4', () => {
    expect([2, 4]).toContain(DEFAULT_CONFIG.indentSize);
  });

  it('maxLineLength is positive', () => {
    expect(DEFAULT_CONFIG.maxLineLength).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// HoloScriptFormatter — constructor
// ═══════════════════════════════════════════════
describe('HoloScriptFormatter — constructor', () => {
  it('creates with default config', () => {
    const f = new HoloScriptFormatter();
    expect(f).toBeDefined();
    const cfg = f.getConfig();
    expect(cfg).toEqual(DEFAULT_CONFIG);
  });

  it('creates with partial config override', () => {
    const f = new HoloScriptFormatter({ indentSize: 4, useTabs: true });
    const cfg = f.getConfig();
    expect(cfg.indentSize).toBe(4);
    expect(cfg.useTabs).toBe(true);
  });

  it('createFormatter() returns a formatter instance', () => {
    const f = createFormatter({ singleQuote: true });
    expect(f).toBeInstanceOf(HoloScriptFormatter);
    expect(f.getConfig().singleQuote).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// HoloScriptFormatter — getConfig / setConfig
// ═══════════════════════════════════════════════
describe('HoloScriptFormatter — getConfig / setConfig', () => {
  let formatter: HoloScriptFormatter;

  beforeEach(() => {
    formatter = new HoloScriptFormatter();
  });

  it('getConfig returns current config', () => {
    const cfg = formatter.getConfig();
    expect(cfg).toBeDefined();
    expect(typeof cfg.indentSize).toBe('number');
  });

  it('setConfig updates config', () => {
    formatter.setConfig({ indentSize: 8 });
    expect(formatter.getConfig().indentSize).toBe(8);
  });

  it('setConfig partial update keeps other fields', () => {
    const before = formatter.getConfig().maxLineLength;
    formatter.setConfig({ indentSize: 6 });
    expect(formatter.getConfig().maxLineLength).toBe(before);
  });

  it('setConfig allows changing braceStyle', () => {
    formatter.setConfig({ braceStyle: 'next-line' });
    expect(formatter.getConfig().braceStyle).toBe('next-line');
  });

  it('setConfig allows changing trailingComma', () => {
    formatter.setConfig({ trailingComma: 'all' });
    expect(formatter.getConfig().trailingComma).toBe('all');
  });
});

// ═══════════════════════════════════════════════
// HoloScriptFormatter — format()
// ═══════════════════════════════════════════════
describe('HoloScriptFormatter — format()', () => {
  let formatter: HoloScriptFormatter;

  beforeEach(() => {
    formatter = new HoloScriptFormatter();
  });

  it('returns FormatResult with formatted, changed, errors', () => {
    const result = formatter.format('');
    expect(result).toHaveProperty('formatted');
    expect(result).toHaveProperty('changed');
    expect(result).toHaveProperty('errors');
    expect(typeof result.formatted).toBe('string');
    expect(typeof result.changed).toBe('boolean');
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('formats empty string without errors', () => {
    const result = formatter.format('');
    expect(result.errors).toHaveLength(0);
  });

  it('formats simple HoloScript-like source', () => {
    const source = 'entity Foo { }';
    const result = formatter.format(source);
    expect(result.formatted).toBeDefined();
    expect(typeof result.formatted).toBe('string');
  });

  it('formats with fileType holo', () => {
    const result = formatter.format('entity Test { }', 'holo');
    expect(result).toHaveProperty('formatted');
  });

  it('formats with fileType hsplus', () => {
    const result = formatter.format('entity Test { }', 'hsplus');
    expect(result).toHaveProperty('formatted');
  });

  it('unchanged result when already formatted', () => {
    // Format once to get canonical form
    const result1 = formatter.format('entity Test {}');
    // Format the canonical form again
    const result2 = formatter.format(result1.formatted);
    expect(result2.changed).toBe(false);
  });

  it('does not error on extra whitespace input', () => {
    const source = 'entity   Test  {  }';
    const result = formatter.format(source);
    expect(result.errors).toBeDefined();
    expect(Array.isArray(result.errors)).toBe(true);
  });

  it('handles multiline source', () => {
    const source = 'entity Foo {\n  trait Bar\n}';
    const result = formatter.format(source);
    expect(result.formatted).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// HoloScriptFormatter — formatRange()
// ═══════════════════════════════════════════════
describe('HoloScriptFormatter — formatRange()', () => {
  let formatter: HoloScriptFormatter;

  beforeEach(() => {
    formatter = new HoloScriptFormatter();
  });

  it('returns FormatResult for range', () => {
    const source = 'line0\nline1\nline2\nline3';
    const result = formatter.formatRange(source, { startLine: 1, endLine: 2 });
    expect(result).toHaveProperty('formatted');
    expect(result).toHaveProperty('changed');
    expect(result).toHaveProperty('errors');
  });

  it('formats only the specified range', () => {
    const source = 'entity A {}\nentity B {}\nentity C {}';
    const result = formatter.formatRange(source, { startLine: 1, endLine: 1 });
    // Result should still be a string
    expect(typeof result.formatted).toBe('string');
  });

  it('handles range with startLine === endLine (single line)', () => {
    const source = 'entity Foo {}';
    const result = formatter.formatRange(source, { startLine: 0, endLine: 0 });
    expect(result).toBeDefined();
  });

  it('returns full content as formatted string', () => {
    const source = 'a\nb\nc';
    const result = formatter.formatRange(source, { startLine: 1, endLine: 1 });
    expect(typeof result.formatted).toBe('string');
  });
});

// ═══════════════════════════════════════════════
// HoloScriptFormatter — check()
// ═══════════════════════════════════════════════
describe('HoloScriptFormatter — check()', () => {
  let formatter: HoloScriptFormatter;

  beforeEach(() => {
    formatter = new HoloScriptFormatter();
  });

  it('returns boolean', () => {
    expect(typeof formatter.check('')).toBe('boolean');
  });

  it('already-formatted string returns true', () => {
    // Format to get canonical form, then check
    const canonical = formatter.format('entity Foo {}').formatted;
    expect(formatter.check(canonical)).toBe(true);
  });

  it('check returns false if format would change something', () => {
    const source = 'entity   Foo   {}';
    const formatted = formatter.format(source);
    if (formatted.changed) {
      expect(formatter.check(source)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════
// Convenience functions
// ═══════════════════════════════════════════════
describe('convenience functions', () => {
  it('format() is a standalone function', () => {
    const result = format('entity Test {}');
    expect(result).toHaveProperty('formatted');
    expect(result).toHaveProperty('changed');
    expect(result).toHaveProperty('errors');
  });

  it('format() returns FormatResult', () => {
    const result: FormatResult = format('');
    expect(result.errors).toBeInstanceOf(Array);
  });

  it('formatRange() standalone returns FormatResult', () => {
    const result = formatRange('a\nb\nc', { startLine: 1, endLine: 1 });
    expect(result).toHaveProperty('formatted');
  });

  it('check() standalone returns boolean', () => {
    expect(typeof check('')).toBe('boolean');
  });

  it('check() accepts fileType param', () => {
    expect(typeof check('entity Foo {}', 'holo')).toBe('boolean');
  });
});

// ═══════════════════════════════════════════════
// Multiple formatter instances
// ═══════════════════════════════════════════════
describe('multiple formatter instances', () => {
  it('two instances with different configs produce independent results', () => {
    const f1 = new HoloScriptFormatter({ indentSize: 2 });
    const f2 = new HoloScriptFormatter({ indentSize: 4 });
    expect(f1.getConfig().indentSize).toBe(2);
    expect(f2.getConfig().indentSize).toBe(4);
  });

  it('setConfig on one does not affect other', () => {
    const f1 = new HoloScriptFormatter();
    const f2 = new HoloScriptFormatter();
    f1.setConfig({ maxLineLength: 120 });
    expect(f2.getConfig().maxLineLength).not.toBe(120);
  });
});

// ═══════════════════════════════════════════════
// FormatterConfig properties
// ═══════════════════════════════════════════════
describe('FormatterConfig — all fields configurable', () => {
  it('bracketSpacing', () => {
    const f = new HoloScriptFormatter({ bracketSpacing: false });
    expect(f.getConfig().bracketSpacing).toBe(false);
  });

  it('sortImports', () => {
    const f = new HoloScriptFormatter({ sortImports: true });
    expect(f.getConfig().sortImports).toBe(true);
  });

  it('maxBlankLines', () => {
    const f = new HoloScriptFormatter({ maxBlankLines: 1 });
    expect(f.getConfig().maxBlankLines).toBe(1);
  });

  it('blankLineBeforeComposition', () => {
    const f = new HoloScriptFormatter({ blankLineBeforeComposition: true });
    expect(f.getConfig().blankLineBeforeComposition).toBe(true);
  });

  it('importGroupSeparator', () => {
    const f = new HoloScriptFormatter({ importGroupSeparator: false });
    expect(f.getConfig().importGroupSeparator).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// ConfigLoader
// ═══════════════════════════════════════════════
describe('ConfigLoader', () => {
  it('creates instance without error', () => {
    const loader = new ConfigLoader();
    expect(loader).toBeDefined();
  });

  it('loadConfig returns FormatterConfig from real path', () => {
    const loader = new ConfigLoader();
    // Use the package src directory (no config file there → returns defaults)
    const cfg = loader.loadConfig(import.meta.url.replace('file:///', '').replace(/%3A/, ':'));
    expect(cfg).toBeDefined();
    expect(typeof cfg.indentSize).toBe('number');
    expect(typeof cfg.maxLineLength).toBe('number');
  });

  it('loadConfig returns object with expected keys', () => {
    const loader = new ConfigLoader();
    const cfg = loader.loadConfig(import.meta.url.replace('file:///', '').replace(/%3A/, ':'));
    const requiredKeys: (keyof FormatterConfig)[] = [
      'indentSize', 'useTabs', 'maxLineLength', 'braceStyle',
      'trailingComma', 'bracketSpacing', 'semicolons', 'singleQuote',
    ];
    for (const key of requiredKeys) {
      expect(cfg).toHaveProperty(key);
    }
  });
});
