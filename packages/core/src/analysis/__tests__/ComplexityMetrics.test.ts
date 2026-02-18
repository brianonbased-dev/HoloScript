import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer, analyzeComplexity, DEFAULT_THRESHOLDS } from '../ComplexityMetrics';

const SIMPLE_SOURCE = `
// A comment
function greet(name) {
  return "hello " + name;
}
`;

const COMPLEX_SOURCE = `
function process(data) {
  if (data.type === 'a') {
    for (let i = 0; i < data.items.length; i++) {
      if (data.items[i].active) {
        while (data.items[i].pending) {
          if (data.items[i].retry && data.items[i].count > 0) {
            data.items[i].count--;
          }
        }
      }
    }
  } else if (data.type === 'b') {
    return data.fallback || data.default;
  }
}
`;

const OBJ_SOURCE = `
spatial_group "world"
orb "player"
  @position
  @physics
  @health
  name: "hero"
  speed: 10

orb "enemy"
  @position
  @ai
`;

describe('ComplexityAnalyzer', () => {
  it('analyzes line counts', () => {
    const r = analyzeComplexity(SIMPLE_SOURCE);
    expect(r.lines.total).toBeGreaterThan(0);
    expect(r.lines.comments).toBeGreaterThanOrEqual(1);
    expect(r.lines.blank).toBeGreaterThanOrEqual(1);
    expect(r.lines.code).toBeGreaterThan(0);
  });

  it('computes commentRatio', () => {
    const r = analyzeComplexity(SIMPLE_SOURCE);
    expect(r.lines.commentRatio).toBeGreaterThan(0);
  });

  it('detects functions', () => {
    const r = analyzeComplexity(SIMPLE_SOURCE);
    expect(r.functions.length).toBe(1);
    expect(r.functions[0].name).toBe('greet');
    expect(r.functions[0].parameters).toBe(1);
  });

  it('base cyclomatic is 1 for simple function', () => {
    const r = analyzeComplexity(SIMPLE_SOURCE);
    expect(r.functions[0].cyclomatic).toBe(1);
  });

  it('higher cyclomatic for complex function', () => {
    const r = analyzeComplexity(COMPLEX_SOURCE);
    const fn = r.functions.find(f => f.name === 'process');
    expect(fn).toBeDefined();
    expect(fn!.cyclomatic).toBeGreaterThan(5);
  });

  it('detects nesting depth', () => {
    const r = analyzeComplexity(COMPLEX_SOURCE);
    expect(r.nesting.maxDepth).toBeGreaterThanOrEqual(4);
  });

  it('detects orbs and objects', () => {
    const r = analyzeComplexity(OBJ_SOURCE);
    expect(r.objects.totalObjects).toBe(2);
  });

  it('detects traits on objects', () => {
    const r = analyzeComplexity(OBJ_SOURCE);
    expect(r.traits.totalUsages).toBeGreaterThanOrEqual(4); // position, physics, health, position, ai
    expect(r.traits.uniqueTraits).toBeGreaterThanOrEqual(4);
  });

  it('generates grade A for simple code', () => {
    const r = analyzeComplexity(SIMPLE_SOURCE);
    expect(['A', 'B']).toContain(r.grade);
    expect(r.overallScore).toBeGreaterThanOrEqual(80);
  });

  it('findIssues for deep nesting', () => {
    const r = analyzeComplexity(COMPLEX_SOURCE);
    const nestingIssues = r.issues.filter(i => i.type === 'nesting');
    expect(nestingIssues.length).toBeGreaterThan(0);
  });

  it('findIssues for high cyclomatic', () => {
    const a = new ComplexityAnalyzer({ maxCyclomatic: 2 });
    const r = a.analyze(COMPLEX_SOURCE);
    const cyclIssues = r.issues.filter(i => i.type === 'cyclomatic');
    expect(cyclIssues.length).toBeGreaterThan(0);
  });

  it('custom thresholds override defaults', () => {
    const a = new ComplexityAnalyzer({ maxNesting: 2 });
    expect(a.getThresholds().maxNesting).toBe(2);
    expect(a.getThresholds().maxCyclomatic).toBe(DEFAULT_THRESHOLDS.maxCyclomatic);
  });

  it('setThresholds updates at runtime', () => {
    const a = new ComplexityAnalyzer();
    a.setThresholds({ maxLinesPerFile: 100 });
    expect(a.getThresholds().maxLinesPerFile).toBe(100);
  });

  it('generateReport produces string output', () => {
    const a = new ComplexityAnalyzer();
    const r = a.analyze(SIMPLE_SOURCE);
    const report = a.generateReport(r);
    expect(report).toContain('Complexity Report');
    expect(report).toContain('Overall Score');
    expect(report).toContain('Line Metrics');
  });

  it('summary stats are computed', () => {
    const r = analyzeComplexity(COMPLEX_SOURCE);
    expect(r.summary.avgCyclomatic).toBeGreaterThan(0);
    expect(r.summary.avgFunctionLength).toBeGreaterThan(0);
    expect(r.summary.maintainabilityIndex).toBeGreaterThanOrEqual(0);
  });

  it('filePath is preserved', () => {
    const r = analyzeComplexity(SIMPLE_SOURCE, 'test.holo');
    expect(r.filePath).toBe('test.holo');
  });

  it('block comments are counted', () => {
    const src = '/* block\ncomment */\nlet x = 1;';
    const r = analyzeComplexity(src);
    expect(r.lines.comments).toBe(2);
    expect(r.lines.code).toBe(1);
  });
});
