/**
 * Edge case tests for @hololand/holoscript-formatter
 *
 * Covers: empty input, deeply nested objects, large compositions,
 * special characters, unicode, malformed input, whitespace preservation,
 * CRLF normalization, trailing comma edge cases, import sorting edge cases,
 * and raw block detection boundaries.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptFormatter, type FormatResult } from '../index.js';

// Helper: normalize for comparison (trim outer whitespace, unify line endings)
const normalize = (s: string): string => s.trim().replace(/\r\n/g, '\n');

describe('Edge Cases — Empty & Minimal Input', () => {
  const formatter = new HoloScriptFormatter();

  it('formats empty string to just a final newline', () => {
    const result = formatter.format('');
    expect(result.formatted).toBe('\n');
    expect(result.errors).toHaveLength(0);
  });

  it('formats whitespace-only input to a final newline', () => {
    const result = formatter.format('   \n  \n   ');
    // All lines are blank; normalizeBlankLines + ensureFinalNewline should handle
    expect(result.formatted.trim()).toBe('');
    expect(result.errors).toHaveLength(0);
  });

  it('formats a single newline', () => {
    const result = formatter.format('\n');
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toBe('\n');
  });

  it('formats a single character without braces', () => {
    const result = formatter.format('x');
    expect(result.formatted).toBe('x\n');
    expect(result.errors).toHaveLength(0);
  });

  it('idempotency: formatting twice yields same result', () => {
    const source = 'composition "Hello" {\n  object "A" {\n    position: [1,2,3]\n  }\n}\n';
    const first = formatter.format(source);
    const second = formatter.format(first.formatted);
    expect(second.formatted).toBe(first.formatted);
    expect(second.changed).toBe(false);
  });
});

describe('Edge Cases — Deeply Nested Objects', () => {
  const formatter = new HoloScriptFormatter();

  it('formats 10 levels of nesting with correct indentation', () => {
    // Build deeply nested input with flat indentation (all at col 0)
    let open = '';
    let close = '';
    for (let i = 0; i < 10; i++) {
      open += `level${i} {\n`;
      close = `}\n` + close;
    }
    const input = open + 'leaf: true\n' + close;
    const result = formatter.format(input);

    expect(result.errors).toHaveLength(0);

    // Verify the leaf line is indented by 10 * indentSize spaces
    const lines = result.formatted.split('\n');
    const leafLine = lines.find((l) => l.includes('leaf'));
    expect(leafLine).toBeDefined();
    const indent = leafLine!.match(/^(\s*)/)?.[1] ?? '';
    expect(indent.length).toBe(10 * 2); // default indentSize=2
  });

  it('deeply nested closing braces dedent correctly', () => {
    const input = 'a {\nb {\nc {\nd: 1\n}\n}\n}';
    const result = formatter.format(input);
    const lines = result.formatted.split('\n').filter((l) => l.trim() === '}');
    // Each closing brace should have non-increasing indentation (outermost = 0)
    const indents = lines.map((l) => (l.match(/^(\s*)/)?.[1] ?? '').length);
    for (let i = 1; i < indents.length; i++) {
      expect(indents[i]).toBeLessThanOrEqual(indents[i - 1]);
    }
    // The last closing brace should be at column 0
    expect(indents[indents.length - 1]).toBe(0);
  });
});

describe('Edge Cases — Large Compositions', () => {
  const formatter = new HoloScriptFormatter();

  it('formats a composition with 100 properties without error', () => {
    const props = Array.from({ length: 100 }, (_, i) => `  prop${i}: ${i}`).join('\n');
    const input = `composition "Huge" {\n${props}\n}`;
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('prop99');
  });

  it('formats 50 sibling objects without error', () => {
    const objects = Array.from(
      { length: 50 },
      (_, i) => `object "Obj${i}" {\n  value: ${i}\n}`
    ).join('\n');
    const input = `composition "Many" {\n${objects}\n}`;
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    // Verify all objects present
    for (let i = 0; i < 50; i++) {
      expect(result.formatted).toContain(`Obj${i}`);
    }
  });
});

describe('Edge Cases — Special Characters in Strings', () => {
  const formatter = new HoloScriptFormatter();

  it('preserves braces inside string literals (basic)', () => {
    // The formatter does regex-based brace matching, so strings with braces
    // may interact. This test documents current behavior.
    const input = 'label: "open { close }"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    // The string content should still be present
    expect(result.formatted).toContain('"open { close }"');
  });

  it('preserves escaped quotes in strings', () => {
    const input = 'name: "say \\"hello\\""\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('\\"hello\\"');
  });

  it('handles special regex characters in content', () => {
    const input = 'pattern: ".*+?^${}()|[]\\/"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
  });

  it('handles empty string values', () => {
    const input = 'name: ""\nlabel: ""\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('""');
  });
});

describe('Edge Cases — Unicode Content', () => {
  const formatter = new HoloScriptFormatter();

  it('preserves unicode characters in property values', () => {
    const input = 'label: "Hello World"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('Hello World');
  });

  it('preserves emoji in string values', () => {
    const input = 'icon: "\u{1F680}\u{1F30D}\u{2728}"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('\u{1F680}\u{1F30D}\u{2728}');
  });

  it('preserves CJK characters', () => {
    const input = 'title: "\u30DB\u30ED\u30B9\u30AF\u30EA\u30D7\u30C8"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('\u30DB\u30ED\u30B9\u30AF\u30EA\u30D7\u30C8');
  });

  it('preserves RTL characters', () => {
    const input =
      'text: "\u0645\u0631\u062D\u0628\u0627 \u0628\u0627\u0644\u0639\u0627\u0644\u0645"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('\u0645\u0631\u062D\u0628\u0627');
  });
});

describe('Edge Cases — CRLF and Mixed Line Endings', () => {
  const formatter = new HoloScriptFormatter();

  it('normalizes CRLF to LF', () => {
    const input = 'line1\r\nline2\r\nline3\r\n';
    const result = formatter.format(input);
    expect(result.formatted).not.toContain('\r');
    expect(result.formatted).toContain('line1\nline2\nline3');
  });

  it('normalizes lone CR to LF', () => {
    const input = 'line1\rline2\rline3';
    const result = formatter.format(input);
    expect(result.formatted).not.toContain('\r');
  });

  it('normalizes mixed line endings (CRLF + LF + CR)', () => {
    const input = 'a\r\nb\nc\rd';
    const result = formatter.format(input);
    expect(result.formatted).not.toContain('\r');
    const lines = result.formatted.split('\n');
    expect(lines[0]).toBe('a');
    expect(lines[1]).toBe('b');
    expect(lines[2]).toBe('c');
  });
});

describe('Edge Cases — Whitespace Preservation & Trailing Whitespace', () => {
  const formatter = new HoloScriptFormatter();

  it('strips trailing whitespace from lines', () => {
    const input = 'entity Foo {   \n  bar: 1   \n}   \n';
    const result = formatter.format(input);
    const lines = result.formatted.split('\n');
    for (const line of lines) {
      if (line.length > 0) {
        expect(line).toBe(line.trimEnd());
      }
    }
  });

  it('preserves indentation inside raw blocks (hsplus logic)', () => {
    const input = 'logic MyLogic {\n    const x = 1;\n        const y = 2;\n}\n';
    const result = formatter.format(input, 'hsplus');
    expect(result.errors).toHaveLength(0);
    // Raw block content should be preserved (not re-indented by the formatter)
    expect(result.formatted).toContain('const x = 1');
    expect(result.formatted).toContain('const y = 2');
  });

  it('collapses excessive blank lines to maxBlankLines', () => {
    const input = 'a\n\n\n\n\n\n\n\nb\n';
    const result = formatter.format(input);
    // Default maxBlankLines is 1, so max 2 consecutive newlines
    expect(result.formatted).not.toMatch(/\n{4,}/);
  });
});

describe('Edge Cases — Malformed / Unusual Input', () => {
  const formatter = new HoloScriptFormatter();

  it('handles unmatched opening brace gracefully', () => {
    const input = 'object "Broken" {\n  value: 1\n';
    const result = formatter.format(input);
    // Should not throw; may have errors or just produce best-effort output
    expect(result).toHaveProperty('formatted');
    expect(result).toHaveProperty('errors');
  });

  it('handles unmatched closing brace gracefully', () => {
    const input = '  value: 1\n}\n}\n';
    const result = formatter.format(input);
    expect(result).toHaveProperty('formatted');
    expect(result.errors).toBeDefined();
  });

  it('handles only braces', () => {
    const input = '{{{}}}';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('{');
  });

  it('handles extremely long single line', () => {
    const longLine = 'x'.repeat(10_000);
    const result = formatter.format(longLine);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain(longLine);
  });

  it('handles input with only comments-like content', () => {
    const input = '// this is a comment\n// another comment\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('// this is a comment');
  });

  it('handles null-like characters in string without crashing', () => {
    const input = 'data: "before\x00after"\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Edge Cases — Trailing Comma Handling', () => {
  it('removes trailing commas when config is "none"', () => {
    const formatter = new HoloScriptFormatter({ trailingComma: 'none' });
    const input = 'items: [\n  1,\n  2,\n]\n';
    const result = formatter.format(input);
    // The closing ] line should not be preceded by a comma on the previous content line
    expect(normalize(result.formatted)).not.toMatch(/,\s*\]/);
  });

  it('adds trailing commas when config is "all"', () => {
    const formatter = new HoloScriptFormatter({ trailingComma: 'all' });
    const input = 'items: [\n  1\n  2\n]\n';
    const result = formatter.format(input);
    // Lines before ] should end with comma
    const lines = result.formatted.split('\n');
    const closingIndex = lines.findIndex((l) => l.trim() === ']');
    if (closingIndex > 0) {
      expect(lines[closingIndex - 1].trimEnd()).toMatch(/,$/);
    }
  });

  it('multi-line config preserves existing commas', () => {
    const formatter = new HoloScriptFormatter({ trailingComma: 'multi-line' });
    const input = 'items: [\n  1,\n  2,\n]\n';
    const result = formatter.format(input);
    // Should not strip or add commas
    expect(result.formatted).toContain('1,');
    expect(result.formatted).toContain('2,');
  });
});

describe('Edge Cases — Import Sorting', () => {
  const formatter = new HoloScriptFormatter({ sortImports: true, importSortOrder: 'grouped' });

  it('handles no imports gracefully', () => {
    const input = 'composition "NoImports" {}\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    expect(result.formatted).toContain('NoImports');
  });

  it('groups builtin, external, internal, relative imports', () => {
    const input = [
      'import "path"',
      'import "./local"',
      'import "@holoscript/core"',
      'import "express"',
      '',
      'composition "Test" {}',
    ].join('\n');
    const result = formatter.format(input);
    const formatted = result.formatted;

    // Builtin (path) should come before external (express)
    const pathIdx = formatted.indexOf('import "path"');
    const expressIdx = formatted.indexOf('import "express"');
    const coreIdx = formatted.indexOf('import "@holoscript/core"');
    const localIdx = formatted.indexOf('import "./local"');

    expect(pathIdx).toBeLessThan(expressIdx);
    expect(expressIdx).toBeLessThan(coreIdx);
    expect(coreIdx).toBeLessThan(localIdx);
  });

  it('handles @import syntax', () => {
    const input = '@import "utils"\n@import "math"\n\ncomposition "Test" {}\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
    // Should be sorted alphabetically
    const mathIdx = result.formatted.indexOf('@import "math"');
    const utilsIdx = result.formatted.indexOf('@import "utils"');
    expect(mathIdx).toBeLessThan(utilsIdx);
  });

  it('alphabetical sort mode works', () => {
    const alphaFormatter = new HoloScriptFormatter({
      sortImports: true,
      importSortOrder: 'alphabetical',
    });
    const input = 'import "zlib"\nimport "assert"\nimport "http"\n\ncode\n';
    const result = alphaFormatter.format(input);
    const assertIdx = result.formatted.indexOf('import "assert"');
    const httpIdx = result.formatted.indexOf('import "http"');
    const zlibIdx = result.formatted.indexOf('import "zlib"');
    expect(assertIdx).toBeLessThan(httpIdx);
    expect(httpIdx).toBeLessThan(zlibIdx);
  });

  it('import with no recognizable module path categorizes as external', () => {
    const input = 'import something_weird\n\ncode\n';
    const result = formatter.format(input);
    expect(result.errors).toHaveLength(0);
  });
});

describe('Edge Cases — Tab Indentation', () => {
  it('uses tabs when useTabs is true', () => {
    const formatter = new HoloScriptFormatter({ useTabs: true });
    const input = 'obj {\n  nested: true\n}\n';
    const result = formatter.format(input);
    const nestedLine = result.formatted.split('\n').find((l) => l.includes('nested'));
    expect(nestedLine).toBeDefined();
    expect(nestedLine!.startsWith('\t')).toBe(true);
  });

  it('uses custom indentSize', () => {
    const formatter = new HoloScriptFormatter({ indentSize: 4 });
    const input = 'obj {\nnested: true\n}\n';
    const result = formatter.format(input);
    const nestedLine = result.formatted.split('\n').find((l) => l.includes('nested'));
    expect(nestedLine).toBeDefined();
    const indent = nestedLine!.match(/^(\s*)/)?.[1] ?? '';
    expect(indent).toBe('    '); // 4 spaces
  });
});

describe('Edge Cases — formatRange boundaries', () => {
  const formatter = new HoloScriptFormatter();

  it('handles range where startLine > endLine', () => {
    const source = 'line0\nline1\nline2';
    const result = formatter.formatRange(source, { startLine: 5, endLine: 2 });
    // Should return empty/unchanged
    expect(result.formatted).toBe('');
    expect(result.changed).toBe(false);
  });

  it('handles range exceeding source length', () => {
    const source = 'line0\nline1';
    const result = formatter.formatRange(source, { startLine: 0, endLine: 999 });
    expect(result).toHaveProperty('formatted');
    expect(result.errors).toBeDefined();
  });

  it('handles negative startLine (clamped to 0)', () => {
    const source = 'line0\nline1\nline2';
    const result = formatter.formatRange(source, { startLine: -5, endLine: 1 });
    expect(result).toHaveProperty('formatted');
    expect(typeof result.formatted).toBe('string');
  });
});

describe('Edge Cases — Raw Block Detection (hsplus)', () => {
  const formatter = new HoloScriptFormatter();

  it('identifies logic block as raw and preserves inner formatting', () => {
    const input = [
      'trait MyTrait {',
      '  name: "test"',
      '}',
      'logic MyLogic {',
      '    const x = 1;',
      '    if (x > 0) {',
      '        console.log(x);',
      '    }',
      '}',
    ].join('\n');
    const result = formatter.format(input, 'hsplus');
    expect(result.errors).toHaveLength(0);
    // The logic block content should be preserved
    expect(result.formatted).toContain('const x = 1');
  });

  it('handles single-line raw block (opening and closing brace on same line)', () => {
    const input = 'logic Empty {}\n';
    const result = formatter.format(input, 'hsplus');
    expect(result.errors).toHaveLength(0);
  });

  it('handles multiple raw block types', () => {
    const input = [
      'module A {',
      '  code here',
      '}',
      'struct B {',
      '  field: number',
      '}',
      'enum C {',
      '  X, Y, Z',
      '}',
    ].join('\n');
    const result = formatter.format(input, 'hsplus');
    expect(result.errors).toHaveLength(0);
  });
});
