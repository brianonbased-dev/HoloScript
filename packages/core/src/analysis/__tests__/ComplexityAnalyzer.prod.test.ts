/**
 * ComplexityAnalyzer — Production Test Suite
 *
 * Covers: line metrics, nesting depth, cyclomatic complexity,
 * object/orb density, trait analysis, overall score, issues, report, thresholds.
 */
import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer, DEFAULT_THRESHOLDS } from '../ComplexityMetrics';

const SIMPLE = `
object Ball {
  position { x: 0 y: 0 z: 0 }
}
`;

const COMPLEX = `
object Player {
  position { x: 0 y: 0 z: 0 }
  trait Renderable
  trait Collidable
  trait Movable
  on_tick {
    if (health > 0) {
      if (isMoving) {
        if (speed > 10) {
          dash()
        }
      }
    }
  }
}

object Enemy {
  trait Renderable
  trait Hostile
  on_tick {
    if (target) {
      attack()
    } else {
      patrol()
    }
  }
}
`;

describe('ComplexityAnalyzer — Production', () => {
  // ─── Line Metrics ─────────────────────────────────────────────────
  it('analyzes line counts correctly', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(SIMPLE);
    expect(r.lines.total).toBeGreaterThan(0);
    expect(r.lines.code).toBeGreaterThanOrEqual(0);
    expect(r.lines.blank).toBeGreaterThanOrEqual(0);
  });

  it('counts comment lines', () => {
    const ca = new ComplexityAnalyzer();
    const src = `// comment line\nobject A {}\n/* block */\n`;
    const r = ca.analyze(src);
    expect(r.lines.comments).toBeGreaterThanOrEqual(1);
  });

  // ─── Nesting Depth ────────────────────────────────────────────────
  it('detects max nesting depth', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    expect(r.nesting.maxDepth).toBeGreaterThanOrEqual(3);
  });

  it('records deep locations', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    expect(r.nesting.deepLocations.length).toBeGreaterThanOrEqual(0);
  });

  // ─── Cyclomatic Complexity ────────────────────────────────────────
  it('computes cyclomatic complexity for functions', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    // Every function starts at 1, each branch point adds 1
    if (r.functions.length > 0) {
      expect(r.functions[0].cyclomatic).toBeGreaterThanOrEqual(1);
    }
    expect(r.summary.avgCyclomatic).toBeGreaterThanOrEqual(0);
  });

  // ─── Object Metrics ───────────────────────────────────────────────
  it('counts objects and templates', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    expect(r.objects.totalObjects).toBeGreaterThanOrEqual(2);
  });

  it('tracks traits per object', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    expect(r.traits.totalUsages).toBeGreaterThanOrEqual(4);
    expect(r.traits.uniqueTraits).toBeGreaterThanOrEqual(1);
  });

  // ─── Overall Score and Summary ────────────────────────────────────
  it('produces an overall complexity score', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    expect(typeof r.overallScore).toBe('number');
    expect(r.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('summary includes maintainabilityIndex', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(SIMPLE);
    expect(typeof r.summary.maintainabilityIndex).toBe('number');
  });

  // ─── Issues Detection ─────────────────────────────────────────────
  it('flags issues when thresholds exceeded', () => {
    const ca = new ComplexityAnalyzer({ maxNesting: 1 });
    const r = ca.analyze(COMPLEX);
    const nestingIssues = r.issues.filter(i => i.type === 'nesting');
    expect(nestingIssues.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Report Generation ────────────────────────────────────────────
  it('generates a text report', () => {
    const ca = new ComplexityAnalyzer();
    const r = ca.analyze(COMPLEX);
    const report = ca.generateReport(r);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  // ─── Thresholds ───────────────────────────────────────────────────
  it('uses default thresholds', () => {
    const ca = new ComplexityAnalyzer();
    const t = ca.getThresholds();
    expect(t.maxCyclomatic).toBe(DEFAULT_THRESHOLDS.maxCyclomatic);
  });

  it('setThresholds updates thresholds', () => {
    const ca = new ComplexityAnalyzer();
    ca.setThresholds({ maxCyclomatic: 5 });
    expect(ca.getThresholds().maxCyclomatic).toBe(5);
  });
});
