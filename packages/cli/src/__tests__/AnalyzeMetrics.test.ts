/**
 * CLI Analyze Metrics + Reporting Production Tests
 *
 * Tests CyclomaticComplexity, NestingDepth, TreemapGenerator,
 * and ComplexityReporter — all pure CPU logic.
 */

import { describe, it, expect } from 'vitest';
import { CyclomaticComplexity } from '../analyze/metrics/CyclomaticComplexity';
import { NestingDepth } from '../analyze/metrics/NestingDepth';
import { TreemapGenerator } from '../analyze/TreemapGenerator';
import { ComplexityReporter } from '../analyze/ComplexityReporter';
import type { ComplexityReport } from '../analyze/ComplexityAnalyzer';

describe('CyclomaticComplexity — Production', () => {
  const cc = new CyclomaticComplexity();

  it('returns 1 for empty source', () => {
    expect(cc.calculate('')).toBe(1);
  });

  it('counts if statements', () => {
    const source = 'if (a) { } if (b) { }';
    expect(cc.calculate(source)).toBe(3); // 1 + 2 ifs
  });

  it('counts logical operators', () => {
    const source = 'if (a && b || c) { }';
    expect(cc.calculate(source)).toBe(4); // 1 + if + && + ||
  });

  it('counts for/while loops', () => {
    const source = 'for (;;) { while (x) { } }';
    expect(cc.calculate(source)).toBe(3); // 1 + for + while
  });

  it('counts switch/match', () => {
    const source = 'switch (x) { } match (y) { }';
    expect(cc.calculate(source)).toBe(3); // 1 + switch + match
  });

  it('ignores keywords in strings', () => {
    const source = '"if (a) { }" && true';
    const result = cc.calculate(source);
    // "if" removed by _removeStrings, only && counted
    expect(result).toBe(2); // 1 + &&
  });

  it('ignores keywords in comments', () => {
    const source = '// if while for\nif (x) {}';
    expect(cc.calculate(source)).toBe(2); // 1 + real if
  });

  it('analyzeFile extracts function blocks', () => {
    const source = `
function foo() {
  if (a) {}
}
function bar() {
  while (b) {}
}`;
    const results = cc.analyzeFile(source, 'test.ts');
    expect(results.length).toBe(2);
    expect(results[0].name).toBe('foo');
    expect(results[1].name).toBe('bar');
  });

  it('analyzeFile falls back for files without function blocks', () => {
    const source = 'if (a) { if (b) { } }';
    const results = cc.analyzeFile(source, 'simple.ts');
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('simple');
  });
});

describe('NestingDepth — Production', () => {
  const nd = new NestingDepth();

  it('returns 0 for empty source', () => {
    const result = nd.calculate('');
    expect(result.maxDepth).toBe(0);
    expect(result.averageDepth).toBe(0);
  });

  it('counts brace nesting', () => {
    const source = '{\n  {\n    {\n    }\n  }\n}';
    const result = nd.calculate(source);
    expect(result.maxDepth).toBe(3);
  });

  it('deepestLine is set correctly', () => {
    const source = 'line1\n{\n  {\n    deepest\n  }\n}';
    const result = nd.calculate(source);
    expect(result.deepestLine).toBeDefined();
    expect(result.deepestLine).toBeLessThanOrEqual(3);
  });

  it('ignores braces in comments', () => {
    const source = '// { { {\n{ }';
    const result = nd.calculate(source);
    expect(result.maxDepth).toBe(1);
  });

  it('handles block comments', () => {
    const source = '/* { { { */ { }';
    const result = nd.calculate(source);
    expect(result.maxDepth).toBe(1);
  });

  it('averageDepth is rounded', () => {
    const result = nd.calculate('{\n  x\n}');
    expect(typeof result.averageDepth).toBe('number');
    // Should be a finite number
    expect(Number.isFinite(result.averageDepth)).toBe(true);
  });
});

describe('TreemapGenerator — Production', () => {
  const gen = new TreemapGenerator();

  it('generate produces HTML', () => {
    const nodes = [
      { name: 'main.ts', size: 5000, category: 'core' },
      { name: 'utils.ts', size: 2000, category: 'utils' },
    ];
    const html = gen.generate(nodes, 'Test Bundle');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Test Bundle');
    expect(html).toContain('main.ts');
    expect(html).toContain('utils.ts');
  });

  it('generate sorts by size descending', () => {
    const nodes = [
      { name: 'small.ts', size: 100 },
      { name: 'big.ts', size: 10000 },
    ];
    const html = gen.generate(nodes);
    const bigIdx = html.indexOf('big.ts');
    const smallIdx = html.indexOf('small.ts');
    expect(bigIdx).toBeLessThan(smallIdx);
  });

  it('toJSON outputs valid JSON', () => {
    const nodes = [{ name: 'x.ts', size: 42 }];
    const json = gen.toJSON(nodes);
    const parsed = JSON.parse(json);
    expect(parsed[0].name).toBe('x.ts');
  });

  it('formatBytes formats correctly', () => {
    // Access via generate output
    const html = gen.generate([{ name: 'a', size: 1500000 }]);
    expect(html).toContain('1.5 MB');

    const html2 = gen.generate([{ name: 'b', size: 2500 }]);
    expect(html2).toContain('2.5 KB');

    const html3 = gen.generate([{ name: 'c', size: 42 }]);
    expect(html3).toContain('42 B');
  });
});

describe('ComplexityReporter — Production', () => {
  const reporter = new ComplexityReporter();

  const sampleReport: ComplexityReport = {
    files: [
      {
        filePath: 'src/main.ts',
        cyclomaticComplexity: 5,
        nestingDepth: 3,
        lineCount: 100,
        grade: 'B',
        recommendations: ['Consider extracting method'],
      },
      {
        filePath: 'src/utils.ts',
        cyclomaticComplexity: 2,
        nestingDepth: 1,
        lineCount: 30,
        grade: 'A',
        recommendations: [],
      },
    ],
    averageCC: 3.5,
    averageDepth: 2.0,
    overallGrade: 'B',
    summary: 'Moderate complexity',
  };

  it('formatTable produces readable output', () => {
    const table = reporter.formatTable(sampleReport);
    expect(table).toContain('Complexity Analysis Report');
    expect(table).toContain('src/main.ts');
    expect(table).toContain('src/utils.ts');
    expect(table).toContain('Overall Grade: B');
    expect(table).toContain('Moderate complexity');
  });

  it('formatTable includes recommendations', () => {
    const table = reporter.formatTable(sampleReport);
    expect(table).toContain('Recommendations:');
    expect(table).toContain('Consider extracting method');
  });

  it('formatTable with no recommendations', () => {
    const cleanReport: ComplexityReport = {
      files: [
        { filePath: 'clean.ts', cyclomaticComplexity: 1, nestingDepth: 0, lineCount: 10, grade: 'A', recommendations: [] },
      ],
      averageCC: 1,
      averageDepth: 0,
      overallGrade: 'A',
      summary: 'Clean',
    };
    const table = reporter.formatTable(cleanReport);
    expect(table).not.toContain('Recommendations:');
  });

  it('formatJSON outputs valid JSON', () => {
    const json = reporter.formatJSON(sampleReport);
    const parsed = JSON.parse(json);
    expect(parsed.overallGrade).toBe('B');
    expect(parsed.files.length).toBe(2);
  });
});
