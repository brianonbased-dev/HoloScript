/**
 * Parser Error Collector Tests
 *
 * Tests for multi-error collection, error enrichment, and recovery hints
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  ParserErrorCollector,
  withErrorCollection,
  SynchronizationStrategies,
} from '../parser/ParserErrorCollector';

describe('ParserErrorCollector', () => {
  let collector: ParserErrorCollector;

  beforeEach(() => {
    collector = new ParserErrorCollector('test source');
  });

  describe('Error Collection', () => {
    test('should collect single error', () => {
      collector.collectError('Test error', { line: 1, column: 0 });

      expect(collector.hasErrors()).toBe(true);
      const report = collector.getReport();
      expect(report.errorCount).toBe(1);
      expect(report.diagnostics[0].message).toBe('Test error');
    });

    test('should collect multiple errors', () => {
      collector.collectError('Error 1', { line: 1, column: 0 });
      collector.collectError('Error 2', { line: 2, column: 5 });
      collector.collectError('Error 3', { line: 3, column: 10 });

      const report = collector.getReport();
      expect(report.errorCount).toBe(3);
      expect(report.diagnostics).toHaveLength(3);
    });

    test('should reject errors exceeding max limit', () => {
      const limitedCollector = new ParserErrorCollector('source', 5);

      for (let i = 0; i < 10; i++) {
        limitedCollector.collectError(`Error ${i}`, { line: i });
      }

      const report = limitedCollector.getReport();
      expect(report.errorCount).toBe(5);
      expect(limitedCollector.isLimited()).toBe(true);
    });

    test('should collect Error objects', () => {
      const error = new Error('Test error message');
      collector.collectError(error, { line: 5, column: 10 });

      const report = collector.getReport();
      expect(report.diagnostics[0].message).toBe('Test error message');
      expect(report.diagnostics[0].line).toBe(5);
    });

    test('should collect ParseError objects', () => {
      collector.collectError({
        code: 'MISSING_BRACE',
        message: 'Expected closing brace',
        line: 10,
        column: 20,
      });

      const report = collector.getReport();
      expect(report.diagnostics[0].code).toBe('MISSING_BRACE');
      expect(report.diagnostics[0].message).toBe('Expected closing brace');
    });
  });

  describe('Warning Collection', () => {
    test('should collect warnings separately', () => {
      collector.collectError('Error', { line: 1 });
      collector.collectWarning('Warning', 2);

      const report = collector.getReport();
      expect(report.errorCount).toBe(1);
      expect(report.warningCount).toBe(1);
    });

    test('should distinguish severity levels', () => {
      collector.collectError('Critical error', { line: 1 });
      collector.collectWarning('Minor issue', 2);

      const report = collector.getReport();
      expect(report.diagnostics[0].severity).toBe('error');
      expect(report.diagnostics[1].severity).toBe('warning');
    });
  });

  describe('Error Report', () => {
    test('should generate accurate report', () => {
      collector.collectError('Syntax error', { line: 1, column: 0 });
      collector.collectError('Type error', { line: 3, column: 5 });
      collector.collectWarning('Unused variable', 2);

      const report = collector.getReport();

      expect(report.errorCount).toBe(2);
      expect(report.warningCount).toBe(1);
      expect(report.diagnostics).toHaveLength(3);
      expect(report.shouldStop).toBe(true);
    });

    test('should set shouldStop to false when no errors', () => {
      const report = collector.getReport();
      expect(report.shouldStop).toBe(false);
      expect(report.errorCount).toBe(0);
    });

    test('should include source in report', () => {
      const source = 'orb { color: "red" }';
      const collector2 = new ParserErrorCollector(source);
      collector2.collectError('Test', { line: 1 });

      const report = collector2.getReport();
      expect(report.source).toBe(source);
    });
  });

  describe('Error Formatting', () => {
    test('should format multiple errors for display', () => {
      collector.collectError('Missing brace', { line: 1, column: 0 });
      collector.collectWarning('Unused variable x', 2);

      const formatted = collector.format();

      expect(formatted).toContain('❌');
      expect(formatted).toContain('⚠️');
      expect(formatted).toContain('Missing brace');
      expect(formatted).toContain('Unused variable');
    });

    test('should format with line numbers', () => {
      collector.collectError('Error on line 5', { line: 5, column: 10 });

      const formatted = collector.format();
      expect(formatted).toContain('Line 5:10');
    });

    test('should include recovery hints in format', () => {
      collector.collectError('Missing brace at end', { line: 10, column: 0 });

      const formatted = collector.format();
      expect(formatted).toContain('🔧');
      expect(formatted).toContain('Add a closing }');
    });

    test('should show "No errors" when empty', () => {
      const formatted = collector.format();
      expect(formatted).toBe('No errors found');
    });
  });

  describe('Quick Fixes', () => {
    test('should generate quick fixes for common errors', () => {
      collector.collectError(
        { code: 'MISSING_BRACE', message: 'Missing }', line: 1, column: 0 },
        { line: 1 }
      );

      const report = collector.getReport();
      const diagnostic = report.diagnostics[0];

      expect(diagnostic.quickFixes).toBeDefined();
      expect(diagnostic.quickFixes?.length).toBeGreaterThan(0);
    });
  });

  describe('Error Severity', () => {
    test('should classify errors by severity', () => {
      collector.collectError('Unexpected token', { line: 1 });
      collector.collectError({ code: 'UNKNOWN_GEOMETRY', message: 'Unknown', line: 2, column: 0 });
      collector.collectError({ code: 'INVALID_VALUE', message: 'Bad value', line: 3, column: 0 });

      const report = collector.getReport();

      expect(report.diagnostics[0].severity).toBe('error');
      expect(report.diagnostics[1].severity).toBe('warning');
      expect(report.diagnostics[2].severity).toBe('info');
    });
  });

  describe('JSON Output', () => {
    test('should export diagnostics as JSON', () => {
      collector.collectError('Test error', { line: 5, column: 10 });
      collector.collectWarning('Warning', 6);

      const json = collector.toJSON();

      expect(json.success).toBe(false);
      expect(json.errors).toBe(1);
      expect(json.warnings).toBe(1);
      expect(json.diagnostics).toBeDefined();
      expect(Array.isArray(json.diagnostics)).toBe(true);
    });

    test('should format diagnostics for LSP', () => {
      collector.collectError('Test', { line: 1, column: 5 });

      const json = collector.toJSON();
      const diag = json.diagnostics[0];

      expect(diag.range).toBeDefined();
      expect(diag.range.start.line).toBe(0); // 0-indexed
      expect(diag.range.start.character).toBe(5);
      expect(diag.severity).toBeDefined();
      expect(diag.code).toBeDefined();
      expect(diag.message).toBeDefined();
    });
  });

  describe('State Management', () => {
    test('should reset collected errors', () => {
      collector.collectError('Error 1');
      collector.collectError('Error 2');

      expect(collector.hasErrors()).toBe(true);

      collector.reset();

      expect(collector.hasErrors()).toBe(false);
      expect(collector.getReport().errorCount).toBe(0);
    });

    test('should update source code', () => {
      collector.setSource('new source code');

      const report = collector.getReport();
      expect(report.source).toBe('new source code');
    });
  });

  describe('withErrorCollection Helper', () => {
    test('should collect errors from function', () => {
      const { result, report } = withErrorCollection((collector) => {
        collector.collectError('Error in function');
        return 'result';
      }, 'source');

      expect(result).toBe('result');
      expect(report.errorCount).toBe(1);
    });

    test('should catch thrown errors', () => {
      const { result, report } = withErrorCollection(() => {
        throw new Error('Thrown error');
      }, 'source');

      expect(result).toBeUndefined();
      expect(report.errorCount).toBe(1);
      expect(report.diagnostics[0].message).toContain('Thrown error');
    });
  });

  describe('SynchronizationStrategies', () => {
    test('skipToStatement should find next semicolon', () => {
      const tokens = [
        { type: 'IDENTIFIER', value: 'x' },
        { type: 'EQUAL', value: '=' },
        { type: 'NUMBER', value: '10' },
        { type: 'SEMICOLON', value: ';' },
        { type: 'IDENTIFIER', value: 'y' },
      ];

      const nextPos = SynchronizationStrategies.skipToStatement(tokens, 0);
      expect(nextPos).toBe(4); // After semicolon
    });

    test('skipToBlockEnd should find matching brace', () => {
      const tokens = [
        { type: 'LBRACE', value: '{' },
        { type: 'IDENTIFIER', value: 'x' },
        { type: 'RBRACE', value: '}' },
        { type: 'IDENTIFIER', value: 'after' },
      ];

      const nextPos = SynchronizationStrategies.skipToBlockEnd(tokens, 0);
      expect(nextPos).toBeGreaterThan(0);
    });

    test('skipToKeyword should find keyword', () => {
      const tokens = [
        { type: 'ERROR', value: 'bad' },
        { type: 'IDENTIFIER', value: 'something' },
        { type: 'KEYWORD', value: 'composition' },
        { type: 'OTHER', value: 'more' },
      ];

      const nextPos = SynchronizationStrategies.skipToKeyword(tokens, 0, ['composition']);
      expect(tokens[nextPos].value).toBe('composition');
    });

    test('findMatchingBracket should locate closing bracket', () => {
      const tokens = [
        { type: 'LBRACE', value: '{' },
        { type: 'IDENTIFIER', value: 'x' },
        { type: 'LBRACE', value: '{' },
        { type: 'IDENTIFIER', value: 'y' },
        { type: 'RBRACE', value: '}' },
        { type: 'RBRACE', value: '}' },
        { type: 'IDENTIFIER', value: 'after' },
      ];

      const closing = SynchronizationStrategies.findMatchingBracket(tokens, 0, 'LBRACE', 'RBRACE');
      expect(closing).toBe(5);
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle interleaved errors and warnings', () => {
      collector.collectError('Error 1', { line: 1 });
      collector.collectWarning('Warning 1', 2);
      collector.collectError('Error 2', { line: 3 });
      collector.collectWarning('Warning 2', 4);
      collector.collectError('Error 3', { line: 5 });

      const report = collector.getReport();
      expect(report.errorCount).toBe(3);
      expect(report.warningCount).toBe(2);
      expect(report.diagnostics).toHaveLength(5);
    });

    test('should preserve error context and suggestions', () => {
      collector.collectError(
        {
          code: 'MISSING_BRACE',
          message: 'Missing closing brace',
          line: 10,
          column: 5,
          suggestions: [{ description: 'Add }', fix: '}' }],
        },
        { token: '}' }
      );

      const report = collector.getReport();
      const error = report.diagnostics[0];

      expect(error.suggestions).toBeDefined();
      expect(error.suggestions?.[0].description).toBe('Add }');
    });
  });
});
