import { describe, it, expect } from 'vitest';
import { ComplexityAnalyzer, DEFAULT_THRESHOLDS } from '../analysis/ComplexityMetrics';

// =============================================================================
// C220 — Complexity Metrics
// =============================================================================

// Objects/templates must use quoted names: orb "Name" / template "Name"
// Traits are detected via @TraitName syntax, not "trait Keyword"
const SIMPLE_CODE = `
orb "Player" {
  position: (0, 0, 0)
  health: 100
}
`;

const COMPLEX_CODE = `
// Game manager
orb "GameManager" {
  state: "idle"
  score: 0

  on start {
    if (state == "idle") {
      if (score > 0) {
        if (score > 100) {
          state = "high_score"
        }
      }
    }
  }

  function update(dt) {
    if (state == "playing") {
      score = score + 1
    } else if (state == "paused") {
      // do nothing
    } else if (state == "game_over") {
      reset()
    } else {
      start()
    }
  }

  function reset() {
    score = 0
    state = "idle"
  }
}

template "Enemy" {
  @Rigidbody
  @Health
  @AI

  health: 50
  speed: 3
}
`;

describe('ComplexityAnalyzer', () => {
  it('constructor uses default thresholds', () => {
    const ca = new ComplexityAnalyzer();
    expect(ca.getThresholds()).toEqual(DEFAULT_THRESHOLDS);
  });

  it('constructor accepts partial threshold overrides', () => {
    const ca = new ComplexityAnalyzer({ maxCyclomatic: 20 });
    expect(ca.getThresholds().maxCyclomatic).toBe(20);
    expect(ca.getThresholds().maxNesting).toBe(4); // default
  });

  it('setThresholds updates thresholds', () => {
    const ca = new ComplexityAnalyzer();
    ca.setThresholds({ maxNesting: 10 });
    expect(ca.getThresholds().maxNesting).toBe(10);
  });

  it('analyze returns ComplexityResult with filePath', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(SIMPLE_CODE, 'test.holo');
    expect(result.filePath).toBe('test.holo');
  });

  it('analyze counts lines correctly', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(SIMPLE_CODE);
    expect(result.lines.total).toBeGreaterThan(0);
    expect(result.lines.code).toBeGreaterThan(0);
    expect(result.lines.blank).toBeGreaterThanOrEqual(0);
  });

  it('analyze detects nesting depth', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.nesting.maxDepth).toBeGreaterThanOrEqual(3);
  });

  it('analyze detects functions', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.functions.length).toBeGreaterThanOrEqual(2); // update, reset
  });

  it('analyze calculates cyclomatic complexity for update', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    const updateFn = result.functions.find((f) => f.name === 'update');
    expect(updateFn).toBeDefined();
    expect(updateFn!.cyclomatic).toBeGreaterThanOrEqual(2);
  });

  it('analyze detects orb objects', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.objects.totalObjects).toBeGreaterThanOrEqual(1); // "GameManager"
  });

  it('analyze detects templates', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.objects.totalTemplates).toBeGreaterThanOrEqual(1); // "Enemy"
  });

  it('analyze detects @trait usage', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.traits.totalUsages).toBeGreaterThanOrEqual(3); // @Rigidbody, @Health, @AI
    expect(result.traits.uniqueTraits).toBeGreaterThanOrEqual(3);
  });

  it('analyze produces overallScore', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.overallScore).toBeGreaterThan(0);
  });

  it('analyze produces summary with maintainabilityIndex', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.summary.maintainabilityIndex).toBeGreaterThanOrEqual(0);
    expect(result.summary.avgCyclomatic).toBeGreaterThanOrEqual(0);
  });

  it('analyze detects issues for complex code', () => {
    const ca = new ComplexityAnalyzer({ maxNesting: 2 }); // strict threshold
    const result = ca.analyze(COMPLEX_CODE);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('generateReport returns non-empty string', () => {
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(COMPLEX_CODE);
    const report = ca.generateReport(result);
    expect(report.length).toBeGreaterThan(0);
  });

  it('line metrics calculate commentRatio', () => {
    const codeWithComments = `
// This is a comment
orb "Foo" {
  // Another comment
  x: 1
}
`;
    const ca = new ComplexityAnalyzer();
    const result = ca.analyze(codeWithComments);
    expect(result.lines.comments).toBeGreaterThanOrEqual(2);
    expect(result.lines.commentRatio).toBeGreaterThan(0);
  });
});
