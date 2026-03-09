/**
 * ComplexityAnalyzer — Production Test Suite
 *
 * Covers: analyze (line metrics, nesting, functions, objects, traits),
 * issues, generateReport, setThresholds, getThresholds, edge cases.
 */
import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer, DEFAULT_THRESHOLDS } from '../ComplexityMetrics';

// Uses HoloScript syntax that the regex-based analyzer actually recognizes:
// - object "name" (not `prefab Name`)
// - template "name"
// - @trait directives
const SAMPLE = `
world "testWorld" {
  object "Player" {
    @health
    @movement
    speed: 5
    hp: 100
  }
  object "Enemy" {
    @health
    @combat
    damage: 10
  }
}

template "Bullet" {
  speed: 50
}

function movePlayer(dx, dy) {
  if (dx > 0) {
    if (dy > 0) {
      // nested
    }
  }
}

function attack(target) {
  target.health -= 1
}
`.trim();

describe('ComplexityAnalyzer — Production', () => {
  const analyzer = new ComplexityAnalyzer();

  // ─── Basic Analysis ────────────────────────────────────────────────
  it('analyze returns ComplexityResult', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.filePath).toBe('input.holo');
    expect(typeof result.overallScore).toBe('number');
    expect(typeof result.grade).toBe('string');
  });

  it('analyze with custom filePath', () => {
    const result = analyzer.analyze(SAMPLE, 'game.holo');
    expect(result.filePath).toBe('game.holo');
  });

  // ─── Line Metrics ─────────────────────────────────────────────────
  it('line metrics count total/code/comments/blank', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.lines.total).toBeGreaterThan(0);
    expect(result.lines.code).toBeGreaterThan(0);
    expect(result.lines.comments).toBeGreaterThanOrEqual(1); // has "// nested"
    expect(typeof result.lines.blank).toBe('number');
    expect(typeof result.lines.commentRatio).toBe('number');
  });

  // ─── Nesting Metrics ──────────────────────────────────────────────
  it('nesting metrics detect depth', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.nesting.maxDepth).toBeGreaterThanOrEqual(2);
    expect(typeof result.nesting.averageDepth).toBe('number');
  });

  // ─── Function Metrics ─────────────────────────────────────────────
  it('function metrics detect functions', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.functions.length).toBeGreaterThanOrEqual(2);
    const fnNames = result.functions.map((f) => f.name);
    expect(fnNames).toContain('movePlayer');
    expect(fnNames).toContain('attack');
  });

  it('function metrics include cyclomatic complexity', () => {
    const result = analyzer.analyze(SAMPLE);
    const moveFn = result.functions.find((f) => f.name === 'movePlayer')!;
    expect(moveFn.cyclomatic).toBeGreaterThanOrEqual(1);
    expect(moveFn.lines).toBeGreaterThan(0);
  });

  // ─── Object Metrics ───────────────────────────────────────────────
  it('object metrics detect objects', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.objects.totalObjects).toBeGreaterThanOrEqual(2);
  });

  it('object metrics detect templates', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.objects.totalTemplates).toBeGreaterThanOrEqual(1);
  });

  // ─── Trait Metrics ────────────────────────────────────────────────
  it('trait metrics detect trait usage', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(result.traits.totalUsages).toBeGreaterThanOrEqual(2);
  });

  // ─── Summary ──────────────────────────────────────────────────────
  it('summary has maintainability index', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(typeof result.summary.maintainabilityIndex).toBe('number');
    expect(typeof result.summary.avgCyclomatic).toBe('number');
  });

  // ─── Issues ───────────────────────────────────────────────────────
  it('issues array is present in result', () => {
    const result = analyzer.analyze(SAMPLE);
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('strict thresholds produce issues', () => {
    const strict = new ComplexityAnalyzer({
      maxCyclomatic: 1,
      maxNesting: 1,
      maxLinesPerFile: 1,
      maxLinesPerFunction: 1,
      maxObjectsPerGroup: 1,
      maxTraitsPerObject: 0,
    });
    const result = strict.analyze(SAMPLE);
    expect(result.issues.length).toBeGreaterThan(0);
    const issue = result.issues[0];
    expect(issue.severity).toMatch(/warning|error/);
    expect(typeof issue.message).toBe('string');
    expect(typeof issue.value).toBe('number');
    expect(typeof issue.threshold).toBe('number');
  });

  // ─── generateReport ───────────────────────────────────────────────
  it('generateReport returns string report', () => {
    const result = analyzer.analyze(SAMPLE);
    const report = analyzer.generateReport(result);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  // ─── Threshold Management ─────────────────────────────────────────
  it('getThresholds returns defaults', () => {
    const t = analyzer.getThresholds();
    expect(t.maxCyclomatic).toBe(DEFAULT_THRESHOLDS.maxCyclomatic);
  });

  it('setThresholds updates thresholds', () => {
    const a = new ComplexityAnalyzer();
    a.setThresholds({ maxCyclomatic: 42 });
    expect(a.getThresholds().maxCyclomatic).toBe(42);
  });

  // ─── Edge Cases ───────────────────────────────────────────────────
  it('empty code returns zeroed metrics', () => {
    const result = analyzer.analyze('');
    expect(result.functions.length).toBe(0);
  });

  it('comment-only code counts comments', () => {
    const result = analyzer.analyze('// just a comment\n// another one');
    expect(result.lines.comments).toBe(2);
    expect(result.lines.code).toBe(0);
  });
});
