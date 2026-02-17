import { describe, it, expect, beforeEach } from 'vitest';
import { ComplexityAnalyzer, DEFAULT_THRESHOLDS } from '../ComplexityMetrics';

describe('ComplexityAnalyzer', () => {
  let analyzer: ComplexityAnalyzer;

  beforeEach(() => { analyzer = new ComplexityAnalyzer(); });

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  it('creates with default thresholds', () => {
    const thresholds = analyzer.getThresholds();
    expect(thresholds).toEqual(DEFAULT_THRESHOLDS);
  });

  it('creates with custom thresholds', () => {
    const custom = new ComplexityAnalyzer({ maxCyclomatic: 20 });
    expect(custom.getThresholds().maxCyclomatic).toBe(20);
    expect(custom.getThresholds().maxNesting).toBe(DEFAULT_THRESHOLDS.maxNesting);
  });

  it('setThresholds updates thresholds', () => {
    analyzer.setThresholds({ maxNesting: 8 });
    expect(analyzer.getThresholds().maxNesting).toBe(8);
  });

  // ---------------------------------------------------------------------------
  // Line Metrics
  // ---------------------------------------------------------------------------

  it('analyze counts lines correctly', () => {
    const source = [
      '// comment',
      'orb "Player" {',
      '  health: 100',
      '',
      '  // another comment',
      '}',
    ].join('\n');
    const result = analyzer.analyze(source);
    expect(result.lines.total).toBe(6);
    expect(result.lines.comments).toBe(2);
    expect(result.lines.blank).toBe(1);
    expect(result.lines.code).toBe(3);
  });

  it('analyze single-line source has total 1', () => {
    const result = analyzer.analyze('orb "A" {}');
    expect(result.lines.total).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Nesting Metrics
  // ---------------------------------------------------------------------------

  it('analyze detects nesting depth from braces', () => {
    const source = [
      'orb "Game" {',
      '  function init() {',
      '    if (true) {',
      '      if (true) {',
      '        doSomething()',
      '      }',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const result = analyzer.analyze(source);
    expect(result.nesting.maxDepth).toBeGreaterThanOrEqual(4);
  });

  // ---------------------------------------------------------------------------
  // Function Analysis
  // ---------------------------------------------------------------------------

  it('analyze detects functions using function keyword', () => {
    const source = [
      'function greet(name) {',
      '  return "Hello"',
      '}',
      '',
      'function compute(a, b) {',
      '  if (a > b) {',
      '    return a',
      '  }',
      '  return b',
      '}',
    ].join('\n');
    const result = analyzer.analyze(source);
    expect(result.functions.length).toBe(2);
  });

  it('function cyclomatic increases with decision points', () => {
    const source = [
      'function complex(a, b, c) {',
      '  if (a) {',
      '    if (b) {',
      '      if (c) {',
      '        return 1',
      '      }',
      '    }',
      '  } else if (a > 0) {',
      '    return 0',
      '  }',
      '  return -1',
      '}',
    ].join('\n');
    const result = analyzer.analyze(source);
    const fn = result.functions.find(f => f.name === 'complex');
    expect(fn).toBeDefined();
    expect(fn!.cyclomatic).toBeGreaterThanOrEqual(4); // 1 base + 3 ifs + 1 else if
  });

  // ---------------------------------------------------------------------------
  // Object Metrics (uses orb "Name" pattern with quotes)
  // ---------------------------------------------------------------------------

  it('analyze detects orb definitions with quoted names', () => {
    const source = [
      'orb "Player" {',
      '  health: 100',
      '}',
      '',
      'orb "Enemy" {',
      '  damage: 10',
      '}',
    ].join('\n');
    const result = analyzer.analyze(source);
    expect(result.objects.totalObjects).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Trait Metrics (uses @Trait pattern)
  // ---------------------------------------------------------------------------

  it('analyze detects trait usage with @ prefix', () => {
    const source = [
      'orb "Player" {',
      '  @Renderable',
      '  @Collidable',
      '  @Networked',
      '}',
    ].join('\n');
    const result = analyzer.analyze(source);
    expect(result.traits.totalUsages).toBe(3);
    expect(result.traits.uniqueTraits).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Overall Score & Issues
  // ---------------------------------------------------------------------------

  it('overallScore is a number between 0 and 100', () => {
    const source = 'orb "A" { x: 1 }';
    const result = analyzer.analyze(source);
    expect(typeof result.overallScore).toBe('number');
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('grade is a letter grade', () => {
    const result = analyzer.analyze('orb "A" {}');
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade);
  });

  // ---------------------------------------------------------------------------
  // Summary & Report
  // ---------------------------------------------------------------------------

  it('summary has maintainability index', () => {
    const result = analyzer.analyze('orb "A" { x: 1 }');
    expect(result.summary.maintainabilityIndex).toBeDefined();
    expect(typeof result.summary.maintainabilityIndex).toBe('number');
  });

  it('generateReport returns a non-empty string', () => {
    const result = analyzer.analyze('orb "A" { x: 1 }');
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('filePath is preserved in result', () => {
    const result = analyzer.analyze('orb "A" {}', 'test.holo');
    expect(result.filePath).toBe('test.holo');
  });
});
