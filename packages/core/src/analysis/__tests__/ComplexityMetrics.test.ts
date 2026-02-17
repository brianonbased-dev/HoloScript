import { describe, it, expect, beforeEach } from 'vitest';
import { ComplexityAnalyzer } from '../ComplexityMetrics';

describe('ComplexityAnalyzer', () => {
  let analyzer: ComplexityAnalyzer;

  beforeEach(() => { analyzer = new ComplexityAnalyzer(); });

  // ---------------------------------------------------------------------------
  // Basic Analysis
  // ---------------------------------------------------------------------------

  it('analyze returns a ComplexityResult', () => {
    const result = analyzer.analyze('orb "Player" { }');
    expect(result.filePath).toBe('input.holo');
    expect(result.lines).toBeDefined();
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('analyze with custom filePath', () => {
    const result = analyzer.analyze('orb "X" { }', 'test.holo');
    expect(result.filePath).toBe('test.holo');
  });

  // ---------------------------------------------------------------------------
  // Line Metrics
  // ---------------------------------------------------------------------------

  it('line metrics count total lines', () => {
    const source = 'line1\nline2\nline3\n';
    const result = analyzer.analyze(source);
    expect(result.lines.total).toBeGreaterThanOrEqual(3);
  });

  it('line metrics detect comments', () => {
    const source = '// comment\ncode\n/* block */\n';
    const result = analyzer.analyze(source);
    expect(result.lines.comments).toBeGreaterThanOrEqual(1);
  });

  it('line metrics detect blank lines', () => {
    const source = 'code\n\n\ncode\n';
    const result = analyzer.analyze(source);
    expect(result.lines.blank).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Nesting
  // ---------------------------------------------------------------------------

  it('nesting metrics detect depth', () => {
    const source = 'if (x) {\n  if (y) {\n    if (z) {\n    }\n  }\n}\n';
    const result = analyzer.analyze(source);
    expect(result.nesting.maxDepth).toBeGreaterThanOrEqual(3);
  });

  // ---------------------------------------------------------------------------
  // Function Analysis (regex expects `function` keyword)
  // ---------------------------------------------------------------------------

  it('detects function definitions', () => {
    const source = 'function doSomething() {\n  if (x) { }\n  if (y) { }\n}\n';
    const result = analyzer.analyze(source);
    expect(result.functions.length).toBeGreaterThanOrEqual(1);
    expect(result.functions[0].name).toBe('doSomething');
  });

  it('cyclomatic complexity increases with branches', () => {
    const simpleSrc = 'function simple() {\n}\n';
    const complexSrc = 'function complex() {\n  if (a) { }\n  if (b) { }\n  while (c) { }\n  for (d) { }\n}\n';
    const simple = analyzer.analyze(simpleSrc);
    const complex = analyzer.analyze(complexSrc);
    const simpleCyclo = simple.functions[0]?.cyclomatic ?? 1;
    const complexCyclo = complex.functions[0]?.cyclomatic ?? 1;
    expect(complexCyclo).toBeGreaterThan(simpleCyclo);
  });

  // ---------------------------------------------------------------------------
  // Object Metrics (regex expects orb 'Name' or orb "Name")
  // ---------------------------------------------------------------------------

  it('detects objects/orbs', () => {
    const source = 'orb "Player" { }\norb "Enemy" { }\n';
    const result = analyzer.analyze(source);
    expect(result.objects.totalObjects).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Overall Score & Issues
  // ---------------------------------------------------------------------------

  it('overall score is computed', () => {
    const result = analyzer.analyze('orb "X" { }');
    expect(typeof result.overallScore).toBe('number');
  });

  it('issues array is populated for complex code', () => {
    const lines = [];
    for (let i = 0; i < 600; i++) lines.push(`line${i}`);
    const result = analyzer.analyze(lines.join('\n'));
    expect(result.issues.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  it('generateReport returns a string', () => {
    const result = analyzer.analyze('orb "X" { }');
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Threshold Configuration
  // ---------------------------------------------------------------------------

  it('setThresholds / getThresholds', () => {
    analyzer.setThresholds({ maxCyclomatic: 5 });
    expect(analyzer.getThresholds().maxCyclomatic).toBe(5);
  });

  it('custom thresholds affect issue detection', () => {
    analyzer.setThresholds({ maxLinesPerFile: 5 });
    const source = 'a\nb\nc\nd\ne\nf\ng\n';
    const result = analyzer.analyze(source);
    expect(result.issues.some(i => i.type === 'length')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Trait Analysis
  // ---------------------------------------------------------------------------

  it('detects trait usage', () => {
    const source = 'orb "X" {\n  @visible\n  @collidable\n}\n';
    const result = analyzer.analyze(source);
    expect(result.traits.totalUsages).toBeGreaterThanOrEqual(2);
  });
});
