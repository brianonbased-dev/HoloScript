import { describe, it, expect } from 'vitest';
import { CyclomaticComplexity } from '../analyze/metrics/CyclomaticComplexity.js';
import { NestingDepth } from '../analyze/metrics/NestingDepth.js';
import { ComplexityAnalyzer } from '../analyze/ComplexityAnalyzer.js';
import { ComplexityReporter } from '../analyze/ComplexityReporter.js';

describe('CyclomaticComplexity', () => {
  const cc = new CyclomaticComplexity();

  it('base=1 for empty source', () => {
    expect(cc.calculate('')).toBe(1);
  });
  it('base=1 for no decision points', () => {
    expect(cc.calculate('const x = 42;')).toBe(1);
  });
  it('adds 1 for if', () => {
    expect(cc.calculate('if (a) { x = 1; }')).toBe(2);
  });
  it('adds 1 for else if', () => {
    const src = 'if (a) { x=1; } else if (b) { x=2; }';
    expect(cc.calculate(src)).toBe(3);
  });
  it('adds 1 for &&', () => {
    expect(cc.calculate('if (a && b) {}')).toBe(3);
  });
  it('adds 1 for ||', () => {
    expect(cc.calculate('if (a || b) {}')).toBe(3);
  });
  it('adds 1 for ??', () => {
    expect(cc.calculate('const v = a ?? b;')).toBe(2);
  });
  it('adds 1 for for', () => {
    expect(cc.calculate('for (let i=0;i<10;i++) {}')).toBe(2);
  });
  it('adds 1 for while', () => {
    expect(cc.calculate('while (true) {}')).toBe(2);
  });
  it('adds 1 for match', () => {
    expect(cc.calculate('match (x) { case 1: break; }')).toBe(2);
  });
  it('calculates complex source correctly', () => {
    const src = [
      'if (a) {',
      '  for (let i=0; i<n; i++) {',
      '    if (b && c) {',
      '      while (d || e) {}',
      '    }',
      '  }',
      '} else if (f) {}',
    ].join('\n');
    expect(cc.calculate(src)).toBe(8);
  });
  it('analyzeFile falls back to filename', () => {
    const results = cc.analyzeFile('const x = 1;', 'foo/bar.ts');
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('bar');
    expect(results[0].complexity).toBe(1);
  });
  it('analyzeFile extracts per-composition complexity', () => {
    const src = [
      'composition Simple {',
      '  x = 1;',
      '}',
      'composition Complex {',
      '  if (a) {}',
      '  if (b) {}',
      '}',
    ].join('\n');
    const results = cc.analyzeFile(src, 'test.hs');
    expect(results.length).toBeGreaterThanOrEqual(2);
    const names = results.map((r) => r.name);
    expect(names).toContain('Simple');
    expect(names).toContain('Complex');
    const complex = results.find((r) => r.name === 'Complex') as { name: string; complexity: number };
    const simple = results.find((r) => r.name === 'Simple') as { name: string; complexity: number };
    expect(complex.complexity).toBeGreaterThan(simple.complexity);
  });
});

describe('NestingDepth', () => {
  const nd = new NestingDepth();

  it('maxDepth 0 for flat source', () => {
    const r = nd.calculate('const x = 1;');
    expect(r.maxDepth).toBe(0);
  });
  it('maxDepth 1 for single nesting', () => {
    const r = nd.calculate('function foo() { return 1; }');
    expect(r.maxDepth).toBe(1);
  });
  it('maxDepth 2 for two levels', () => {
    const r = nd.calculate('function foo() { if (x) { return 1; } }');
    expect(r.maxDepth).toBe(2);
  });
  it('maxDepth 5 for deeply nested code', () => {
    const src = '{ { { { { x = 1; } } } } }';
    const r = nd.calculate(src);
    expect(r.maxDepth).toBe(5);
  });
  it('returns deepestLine when maxDepth > 0', () => {
    const src = [
      'line1',
      'function foo() {',
      '  if (x) {',
      '  }',
      '}',
    ].join('\n');
    const r = nd.calculate(src);
    expect(r.maxDepth).toBe(2);
    expect(r.deepestLine).toBeDefined();
  });
  it('averageDepth is a number', () => {
    const r = nd.calculate('function foo() { return 1; }');
    expect(typeof r.averageDepth).toBe('number');
  });
  it('averageDepth is 0 for empty source', () => {
    const r = nd.calculate('');
    expect(r.averageDepth).toBe(0);
    expect(r.maxDepth).toBe(0);
  });
});

describe('ComplexityAnalyzer', () => {
  const analyzer = new ComplexityAnalyzer();

  it('returns empty report for empty map', () => {
    const report = analyzer.analyze(new Map());
    expect(report.files).toHaveLength(0);
    expect(report.averageCC).toBe(0);
    expect(report.overallGrade).toBe('A');
  });
  it('gives grade A for simple files', () => {
    const files = new Map([['simple.ts', 'const x = 1;']]);
    const report = analyzer.analyze(files);
    expect(report.files[0].grade).toBe('A');
  });
  it('gives grade C/D/F for complex files', () => {
    const parts: string[] = [];
    for (let i = 0; i < 12; i++) parts.push(`if (cond${i}) { x = ${i}; }`);
    const src = parts.join('\n');
    const files = new Map([['complex.ts', src]]);
    const report = analyzer.analyze(files);
    expect(['C', 'D', 'F']).toContain(report.files[0].grade);
  });
  it('calculates correct averageCC', () => {
    const files = new Map([
      ['a.ts', 'const x = 1;'],
      ['b.ts', 'if (a) {} if (b) {}'],
    ]);
    const report = analyzer.analyze(files);
    expect(report.averageCC).toBe(2);
  });
  it('includes filePath in results', () => {
    const files = new Map([['my/file.ts', 'const x = 1;']]);
    const report = analyzer.analyze(files);
    expect(report.files[0].filePath).toBe('my/file.ts');
  });
  it('includes lineCount in results', () => {
    const src = [
      'line1',
      'line2',
      'line3',
    ].join('\n');
    const files = new Map([['f.ts', src]]);
    const report = analyzer.analyze(files);
    expect(report.files[0].lineCount).toBe(3);
  });
  it('generates recommendations for high CC', () => {
    const parts: string[] = [];
    for (let i = 0; i < 10; i++) parts.push(`if(c${i}){}`);
    const files = new Map([['heavy.ts', parts.join('\n')]]);
    const report = analyzer.analyze(files);
    expect(report.files[0].recommendations.length).toBeGreaterThan(0);
  });
  it('generates recommendations for deep nesting', () => {
    const deep = '{ { { { { x=1; } } } } }';
    const files = new Map([['nested.ts', deep]]);
    const custom = new ComplexityAnalyzer({ depthThreshold: 3 });
    const report = custom.analyze(files);
    expect(report.files[0].recommendations.some((r) => r.includes('nesting'))).toBe(true);
  });
  it('summary mentions file count', () => {
    const files = new Map([['a.ts', 'const x=1;'], ['b.ts', 'const y=2;']]);
    const report = analyzer.analyze(files);
    expect(report.summary).toMatch(/\d/);
  });
});

describe('ComplexityAnalyzer.gradeFor', () => {
  it('returns A for CC=5 depth=2', () => {
    expect(ComplexityAnalyzer.gradeFor(5, 2)).toBe('A');
  });
  it('returns B for CC=6 depth=2', () => {
    expect(ComplexityAnalyzer.gradeFor(6, 2)).toBe('B');
  });
  it('returns B for CC=5 depth=3', () => {
    expect(ComplexityAnalyzer.gradeFor(5, 3)).toBe('B');
  });
  it('returns C for CC=9 depth=2', () => {
    expect(ComplexityAnalyzer.gradeFor(9, 2)).toBe('C');
  });
  it('returns C for CC=5 depth=4', () => {
    expect(ComplexityAnalyzer.gradeFor(5, 4)).toBe('C');
  });
  it('returns D for CC=13 depth=2', () => {
    expect(ComplexityAnalyzer.gradeFor(13, 2)).toBe('D');
  });
  it('returns D for CC=5 depth=5', () => {
    expect(ComplexityAnalyzer.gradeFor(5, 5)).toBe('D');
  });
  it('returns F for CC=21', () => {
    expect(ComplexityAnalyzer.gradeFor(21, 0)).toBe('F');
  });
  it('returns F for depth=6', () => {
    expect(ComplexityAnalyzer.gradeFor(1, 6)).toBe('F');
  });
});

describe('ComplexityReporter', () => {
  const reporter = new ComplexityReporter();
  const analyzer = new ComplexityAnalyzer();

  function makeReport() {
    const files = new Map([
      ['src/foo.ts', 'const x = 1;'],
      ['src/bar.ts', 'if (a) {} if (b) {}'],
    ]);
    return analyzer.analyze(files);
  }

  it('formatTable contains file names', () => {
    const report = makeReport();
    const table = reporter.formatTable(report);
    expect(table).toContain('src/foo.ts');
    expect(table).toContain('src/bar.ts');
  });
  it('formatTable contains grade column', () => {
    const report = makeReport();
    const table = reporter.formatTable(report);
    expect(table).toMatch(/Grade/i);
  });
  it('formatTable contains overall grade', () => {
    const report = makeReport();
    const table = reporter.formatTable(report);
    expect(table).toContain(report.overallGrade);
  });
  it('formatJSON returns valid JSON', () => {
    const report = makeReport();
    const json = reporter.formatJSON(report);
    expect(() => JSON.parse(json)).not.toThrow();
  });
  it('formatJSON contains files array', () => {
    const report = makeReport();
    const parsed = JSON.parse(reporter.formatJSON(report));
    expect(Array.isArray(parsed.files)).toBe(true);
  });
  it('formatTable works when recommendations present', () => {
    const parts: string[] = [];
    for (let i = 0; i < 12; i++) parts.push(`if(c${i}){}`);
    const report = analyzer.analyze(new Map([['heavy.ts', parts.join('\n')]]));
    const table = reporter.formatTable(report);
    expect(typeof table).toBe('string');
    expect(table.length).toBeGreaterThan(0);
  });
});
