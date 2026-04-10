/**
 * Complexity Metrics Tests
 *
 * Sprint 5 Priority 4: Complexity Metrics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ComplexityAnalyzer,
  createComplexityAnalyzer,
  analyzeComplexity,
  DEFAULT_THRESHOLDS,
} from './ComplexityMetrics';

describe('ComplexityAnalyzer', () => {
  let analyzer: ComplexityAnalyzer;

  beforeEach(() => {
    analyzer = createComplexityAnalyzer();
  });

  describe('Line Metrics', () => {
    it('should count total lines', () => {
      const source = `line 1
line 2
line 3`;
      const result = analyzer.analyze(source);
      expect(result.lines.total).toBe(3);
    });

    it('should count code lines', () => {
      const source = `const x = 1;
const y = 2;
// comment
const z = 3;`;
      const result = analyzer.analyze(source);
      expect(result.lines.code).toBe(3);
    });

    it('should count comment lines', () => {
      const source = `// comment 1
const x = 1;
// comment 2
/* block comment */`;
      const result = analyzer.analyze(source);
      expect(result.lines.comments).toBe(3);
    });

    it('should count blank lines', () => {
      const source = `line 1

line 2

line 3`;
      const result = analyzer.analyze(source);
      expect(result.lines.blank).toBe(2);
    });

    it('should calculate comment ratio', () => {
      const source = `const x = 1;
// comment
const y = 2;`;
      const result = analyzer.analyze(source);
      expect(result.lines.commentRatio).toBe(0.5); // 1 comment / 2 code
    });
  });

  describe('Nesting Metrics', () => {
    it('should calculate max nesting depth', () => {
      const source = `{
  {
    {
      code
    }
  }
}`;
      const result = analyzer.analyze(source);
      expect(result.nesting.maxDepth).toBe(3);
    });

    it('should track deep locations', () => {
      const analyzer = createComplexityAnalyzer({ maxNesting: 2 });
      const source = `{
  {
    {
      too deep
    }
  }
}`;
      const result = analyzer.analyze(source);
      expect(result.nesting.deepLocations.length).toBeGreaterThan(0);
    });

    it('should calculate average depth', () => {
      const source = `{
  code
}
{
  {
    code
  }
}`;
      const result = analyzer.analyze(source);
      expect(result.nesting.averageDepth).toBeGreaterThan(0);
    });
  });

  describe('Function Complexity', () => {
    it('should detect functions', () => {
      const source = `
function myFunc(a, b) {
  return a + b;
}
`;
      const result = analyzer.analyze(source);
      expect(result.functions.length).toBe(1);
      expect(result.functions[0].name).toBe('myFunc');
    });

    it('should count parameters', () => {
      const source = `
function threeParams(a, b, c) {
  return a + b + c;
}
`;
      const result = analyzer.analyze(source);
      expect(result.functions[0].parameters).toBe(3);
    });

    it('should calculate cyclomatic complexity for if statements', () => {
      const source = `
function complex() {
  if (a) {
    doA();
  } else if (b) {
    doB();
  }
}
`;
      const result = analyzer.analyze(source);
      expect(result.functions[0].cyclomatic).toBeGreaterThan(1);
    });

    it('should calculate cyclomatic complexity for loops', () => {
      const source = `
function withLoops() {
  for (i = 0; i < 10; i++) {
    while (cond) {
      process();
    }
  }
}
`;
      const result = analyzer.analyze(source);
      expect(result.functions[0].cyclomatic).toBeGreaterThanOrEqual(3);
    });

    it('should calculate cyclomatic complexity for logical operators', () => {
      const source = `
function withLogic() {
  if (a && b || c) {
    doSomething();
  }
}
`;
      const result = analyzer.analyze(source);
      // Base 1 + if + && + || = 4
      expect(result.functions[0].cyclomatic).toBeGreaterThanOrEqual(3);
    });

    it('should count function lines', () => {
      const source = `
function longFunc() {
  line1();
  line2();
  line3();
  line4();
  line5();
}
`;
      const result = analyzer.analyze(source);
      expect(result.functions[0].lines).toBeGreaterThan(5);
    });
  });

  describe('Object Metrics', () => {
    it('should count orbs', () => {
      const source = `
orb "Object1" { }
orb "Object2" { }
orb "Object3" { }
`;
      const result = analyzer.analyze(source);
      expect(result.objects.totalObjects).toBe(3);
    });

    it('should count templates', () => {
      const source = `
template "Template1" { }
template "Template2" { }
`;
      const result = analyzer.analyze(source);
      expect(result.objects.totalTemplates).toBe(2);
    });

    it('should track objects per spatial group', () => {
      const source = `
spatial_group "Group1" {
  orb "Obj1" { }
  orb "Obj2" { }
}
spatial_group "Group2" {
  orb "Obj3" { }
}
`;
      const result = analyzer.analyze(source);
      expect(result.objects.objectsPerGroup.get('Group1')).toBe(2);
      expect(result.objects.objectsPerGroup.get('Group2')).toBe(1);
    });

    it('should track traits per object', () => {
      const source = `
orb "MultiTrait" {
  @grabbable
  @throwable
  @hoverable
}
`;
      const result = analyzer.analyze(source);
      expect(result.objects.traitsPerObject.get('MultiTrait')).toBe(3);
    });

    it('should identify complex objects', () => {
      const source = `
orb "Complex" {
  @grabbable
  @throwable
  @hoverable
  @physics
  color: "red"
  position: [0, 0, 0]
  scale: [1, 1, 1]
}
`;
      const result = analyzer.analyze(source);
      expect(result.objects.complexObjects.length).toBeGreaterThan(0);
      expect(result.objects.complexObjects[0].name).toBe('Complex');
    });
  });

  describe('Trait Metrics', () => {
    it('should count total trait usages', () => {
      const source = `
@grabbable
@throwable
@grabbable
`;
      const result = analyzer.analyze(source);
      expect(result.traits.totalUsages).toBe(3);
    });

    it('should count unique traits', () => {
      const source = `
@grabbable
@throwable
@grabbable
`;
      const result = analyzer.analyze(source);
      expect(result.traits.uniqueTraits).toBe(2);
    });

    it('should track usage by trait', () => {
      const source = `
@grabbable
@throwable
@grabbable
@grabbable
`;
      const result = analyzer.analyze(source);
      expect(result.traits.usagesByTrait.get('grabbable')).toBe(3);
      expect(result.traits.usagesByTrait.get('throwable')).toBe(1);
    });

    it('should identify top traits', () => {
      const source = `
@grabbable
@grabbable
@grabbable
@throwable
@hoverable
`;
      const result = analyzer.analyze(source);
      expect(result.traits.topTraits[0].trait).toBe('grabbable');
      expect(result.traits.topTraits[0].count).toBe(3);
    });
  });

  describe('Issues Detection', () => {
    it('should detect nesting issues', () => {
      const analyzer = createComplexityAnalyzer({ maxNesting: 2 });
      const source = `{
  {
    {
      {
        too deep
      }
    }
  }
}`;
      const result = analyzer.analyze(source);
      const nestingIssues = result.issues.filter((i) => i.type === 'nesting');
      expect(nestingIssues.length).toBeGreaterThan(0);
    });

    it('should detect high cyclomatic complexity', () => {
      const analyzer = createComplexityAnalyzer({ maxCyclomatic: 3 });
      const source = `
function complex() {
  if (a) { }
  if (b) { }
  if (c) { }
  if (d) { }
  while (e) { }
}
`;
      const result = analyzer.analyze(source);
      const cyclomaticIssues = result.issues.filter((i) => i.type === 'cyclomatic');
      expect(cyclomaticIssues.length).toBeGreaterThan(0);
    });

    it('should detect long functions', () => {
      const analyzer = createComplexityAnalyzer({ maxLinesPerFunction: 5 });
      const lines = Array(20).fill('  doSomething();').join('\n');
      const source = `function long() {
${lines}
}`;
      const result = analyzer.analyze(source);
      const lengthIssues = result.issues.filter(
        (i) => i.type === 'length' && i.message.includes('Function')
      );
      expect(lengthIssues.length).toBeGreaterThan(0);
    });

    it('should detect high object density', () => {
      const analyzer = createComplexityAnalyzer({ maxObjectsPerGroup: 3 });
      const source = `
spatial_group "Dense" {
  orb "O1" { }
  orb "O2" { }
  orb "O3" { }
  orb "O4" { }
  orb "O5" { }
}
`;
      const result = analyzer.analyze(source);
      const densityIssues = result.issues.filter((i) => i.type === 'object-density');
      expect(densityIssues.length).toBeGreaterThan(0);
    });

    it('should detect high trait density', () => {
      const analyzer = createComplexityAnalyzer({ maxTraitsPerObject: 3 });
      const source = `
orb "TraitHeavy" {
  @grabbable
  @throwable
  @hoverable
  @pointable
  @physics
  @audio
}
`;
      const result = analyzer.analyze(source);
      const traitIssues = result.issues.filter((i) => i.type === 'trait-density');
      expect(traitIssues.length).toBeGreaterThan(0);
    });
  });

  describe('Overall Score and Grade', () => {
    it('should calculate overall score', () => {
      const source = `
orb "Simple" {
  @grabbable
  position: [0, 0, 0]
}
`;
      const result = analyzer.analyze(source);
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
    });

    it('should assign A grade for simple code', () => {
      const source = `
orb "Simple" {
  @grabbable
}
`;
      const result = analyzer.analyze(source);
      expect(result.grade).toBe('A');
    });

    it('should assign lower grades for complex code', () => {
      const analyzer = createComplexityAnalyzer({
        maxNesting: 2,
        maxCyclomatic: 3,
        maxLinesPerFile: 20,
      });

      const complexSource = `
function complex() {
  if (a) {
    if (b) {
      if (c) {
        if (d) {
          doSomething();
        }
      }
    }
  }
}
function another() {
  if (x) { } else if (y) { } else if (z) { }
  while (w) { for (i) { } }
}
`;
      const result = analyzer.analyze(complexSource);
      expect(['B', 'C', 'D', 'F']).toContain(result.grade);
    });
  });

  describe('Summary Statistics', () => {
    it('should calculate average cyclomatic complexity', () => {
      const source = `
function f1() {
  if (a) { }
}
function f2() {
  if (b) { }
  if (c) { }
}
`;
      const result = analyzer.analyze(source);
      expect(result.summary.avgCyclomatic).toBeGreaterThan(0);
    });

    it('should calculate maintainability index', () => {
      const source = `
function simple() {
  return 1;
}
`;
      const result = analyzer.analyze(source);
      expect(result.summary.maintainabilityIndex).toBeGreaterThanOrEqual(0);
      expect(result.summary.maintainabilityIndex).toBeLessThanOrEqual(100);
    });
  });

  describe('Report Generation', () => {
    it('should generate a readable report', () => {
      const source = `
orb "Test" {
  @grabbable
  position: [0, 0, 0]
}

function process() {
  if (condition) {
    doSomething();
  }
}
`;
      const result = analyzer.analyze(source, 'test.holo');
      const report = analyzer.generateReport(result);

      expect(report).toContain('Complexity Report for test.holo');
      expect(report).toContain('Overall Score');
      expect(report).toContain('Line Metrics');
      expect(report).toContain('Nesting Metrics');
      expect(report).toContain('Object Metrics');
      expect(report).toContain('Trait Usage');
    });

    it('should include issues in report', () => {
      const analyzer = createComplexityAnalyzer({ maxNesting: 1 });
      const source = `{
  {
    too deep
  }
}`;
      const result = analyzer.analyze(source);
      const report = analyzer.generateReport(result);

      expect(report).toContain('Issues');
    });
  });

  describe('Threshold Configuration', () => {
    it('should use default thresholds', () => {
      const thresholds = analyzer.getThresholds();
      expect(thresholds.maxCyclomatic).toBe(DEFAULT_THRESHOLDS.maxCyclomatic);
    });

    it('should accept custom thresholds', () => {
      const analyzer = createComplexityAnalyzer({ maxCyclomatic: 5 });
      const thresholds = analyzer.getThresholds();
      expect(thresholds.maxCyclomatic).toBe(5);
    });

    it('should allow updating thresholds', () => {
      analyzer.setThresholds({ maxNesting: 10 });
      const thresholds = analyzer.getThresholds();
      expect(thresholds.maxNesting).toBe(10);
    });
  });
});

describe('Factory Functions', () => {
  it('createComplexityAnalyzer() should create instance', () => {
    const analyzer = createComplexityAnalyzer();
    expect(analyzer).toBeInstanceOf(ComplexityAnalyzer);
  });

  it('analyzeComplexity() helper should work', () => {
    const source = 'orb "Test" { @grabbable }';
    const result = analyzeComplexity(source);
    expect(result.objects.totalObjects).toBe(1);
  });
});

describe('Edge Cases', () => {
  let analyzer: ComplexityAnalyzer;

  beforeEach(() => {
    analyzer = createComplexityAnalyzer();
  });

  it('should handle empty source', () => {
    const result = analyzer.analyze('');
    expect(result.lines.total).toBe(1);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
  });

  it('should handle source with only comments', () => {
    const source = `// comment 1
// comment 2
/* block */`;
    const result = analyzer.analyze(source);
    expect(result.lines.comments).toBe(3);
    expect(result.lines.code).toBe(0);
  });

  it('should handle deeply nested braces', () => {
    const depth = 10;
    let source = '';
    for (let i = 0; i < depth; i++) source += '{ ';
    source += 'code';
    for (let i = 0; i < depth; i++) source += ' }';

    const result = analyzer.analyze(source);
    expect(result.nesting.maxDepth).toBe(depth);
  });

  it('should handle malformed function (no closing brace)', () => {
    const source = `
function unclosed() {
  doSomething();
`;
    const result = analyzer.analyze(source);
    expect(result.functions.length).toBe(1);
  });
});
