/**
 * GodFileDetector Tests
 *
 * Gap 4: Validates god file detection and virtual splitting.
 */

import { describe, it, expect } from 'vitest';
import { GodFileDetector, createGodFileDetector } from '../GodFileDetector';

describe('GodFileDetector', () => {
  describe('computeMetrics', () => {
    it('counts lines of code excluding comments and blanks', () => {
      const detector = new GodFileDetector();
      const content = [
        'const x = 1;',
        '// comment',
        '',
        'const y = 2;',
      ].join('\n');

      const metrics = detector.computeMetrics('test.ts', content);
      expect(metrics.loc).toBe(2);
    });

    it('counts imports', () => {
      const detector = new GodFileDetector();
      const content = [
        'import { foo } from "./foo";',
        'import type { Bar } from "./bar";',
        'import * as baz from "./baz";',
        'const x = 1;',
      ].join('\n');

      const metrics = detector.computeMetrics('test.ts', content);
      expect(metrics.importCount).toBe(3);
    });

    it('counts exports', () => {
      const detector = new GodFileDetector();
      const content = [
        'export const a = 1;',
        'export function foo() {}',
        'export class Bar {}',
      ].join('\n');

      const metrics = detector.computeMetrics('test.ts', content);
      expect(metrics.exportCount).toBe(3);
    });

    it('counts classes', () => {
      const detector = new GodFileDetector();
      const content = [
        'class Foo {}',
        'class Bar extends Foo {}',
        'export class Baz {}',
      ].join('\n');

      const metrics = detector.computeMetrics('test.ts', content);
      expect(metrics.classCount).toBe(3);
    });
  });

  describe('analyze', () => {
    it('classifies small files as normal', () => {
      const detector = new GodFileDetector();
      const content = Array(100).fill('const x = 1;').join('\n');

      const report = detector.analyze('small.ts', content);
      expect(report.classification).toBe('normal');
      expect(report.reasons).toHaveLength(0);
    });

    it('classifies medium files as warning', () => {
      const detector = createGodFileDetector();
      const content = Array(600).fill('const x = 1;').join('\n');

      const report = detector.analyze('medium.ts', content);
      expect(report.classification).toBe('warning');
      expect(report.reasons.length).toBeGreaterThan(0);
    });

    it('classifies large files as god_file', () => {
      const detector = createGodFileDetector();
      const content = Array(1200).fill('const x = 1;').join('\n');

      const report = detector.analyze('huge.ts', content);
      expect(report.classification).toBe('god_file');
      expect(report.splitPlan).toBeDefined();
    });

    it('detects god files by function count', () => {
      const detector = createGodFileDetector();
      const functions = Array(50).fill(null).map((_, i) =>
        `export function fn${i}(x: number): number { return x * ${i}; }`
      ).join('\n');

      const report = detector.analyze('many-fns.ts', functions);
      expect(report.classification).toBe('god_file');
    });
  });

  describe('suggestSplit', () => {
    it('generates split plan for god file with classes', () => {
      const detector = new GodFileDetector();
      const content = [
        'export class Alpha {',
        '  method() { return 1; }',
        '}',
        '',
        ...Array(500).fill('// filler'),
        '',
        'export class Beta {',
        '  method() { return 2; }',
        '}',
        '',
        ...Array(500).fill('// more filler'),
      ].join('\n');

      const metrics = detector.computeMetrics('test.ts', content);
      const plan = detector.suggestSplit('test.ts', content, metrics);

      expect(plan.totalSegments).toBeGreaterThan(1);
      expect(plan.originalPath).toBe('test.ts');
    });

    it('falls back to function-group splitting when no class boundaries', () => {
      const detector = new GodFileDetector();
      const content = Array(1200).fill('const x = 1;').join('\n');

      const metrics = detector.computeMetrics('test.ts', content);
      const plan = detector.suggestSplit('test.ts', content, metrics);

      expect(plan.totalSegments).toBeGreaterThan(0);
      expect(plan.segments.some(s => s.type === 'function-group')).toBe(true);
    });
  });
});
