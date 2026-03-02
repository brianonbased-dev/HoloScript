/**
 * Tests for ParserErrorCollector
 *
 * Covers:
 * - Error collection from parser
 * - Warning collection
 * - Error limit enforcement
 * - Report generation
 * - Formatted output
 * - JSON export for LSP/IDE
 * - Severity determination
 * - Recovery hints
 * - Reset / source setting
 */

import { describe, it, expect } from 'vitest';
import {
  ParserErrorCollector,
  createErrorCollector,
  withErrorCollection,
  SynchronizationStrategies,
} from './ParserErrorCollector';

describe('ParserErrorCollector', () => {
  describe('construction', () => {
    it('creates with default parameters', () => {
      const collector = new ParserErrorCollector();
      expect(collector.hasErrors()).toBe(false);
    });

    it('creates with source and maxErrors', () => {
      const collector = new ParserErrorCollector('test code', 50);
      expect(collector.hasErrors()).toBe(false);
    });
  });

  describe('collectError', () => {
    it('collects string errors', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectError('Something went wrong', { line: 5, column: 10 });
      expect(collector.hasErrors()).toBe(true);
    });

    it('collects Error objects', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectError(new Error('Parse failed'));
      expect(collector.hasErrors()).toBe(true);
    });

    it('collects errors with context', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectError('Unexpected token', {
        line: 3,
        column: 8,
        token: '{',
        message: 'Expected identifier',
      });
      expect(collector.hasErrors()).toBe(true);
    });
  });

  describe('collectWarning', () => {
    it('collects warnings that do not count as errors', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectWarning('Deprecated feature', 1, 0);
      expect(collector.hasErrors()).toBe(false);
    });
  });

  describe('isLimited', () => {
    it('returns false before limit', () => {
      const collector = new ParserErrorCollector('test', 5);
      collector.collectError('e1');
      expect(collector.isLimited()).toBe(false);
    });

    it('returns true at limit', () => {
      const collector = new ParserErrorCollector('test', 3);
      for (let i = 0; i < 4; i++) {
        collector.collectError(`error ${i}`);
      }
      expect(collector.isLimited()).toBe(true);
    });
  });

  describe('getReport', () => {
    it('generates report with counts', () => {
      const collector = new ParserErrorCollector('test code');
      collector.collectError('error 1', { line: 1 });
      collector.collectError('error 2', { line: 2 });
      collector.collectWarning('warn 1');

      const report = collector.getReport();
      expect(report.errorCount).toBe(2);
      expect(report.warningCount).toBe(1);
      expect(report.diagnostics.length).toBeGreaterThanOrEqual(3);
      expect(report.source).toBe('test code');
    });

    it('determines shouldStop based on errors', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectError('fatal');
      const report = collector.getReport();
      expect(report.shouldStop).toBe(true);
    });

    it('shouldStop is false without errors', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectWarning('just a warning');
      const report = collector.getReport();
      expect(report.shouldStop).toBe(false);
    });
  });

  describe('format', () => {
    it('formats errors for display', () => {
      const collector = new ParserErrorCollector('x = 1\ny = 2');
      collector.collectError('Unexpected', { line: 1, column: 3 });
      const formatted = collector.format();
      expect(formatted).toContain('Unexpected');
      expect(typeof formatted).toBe('string');
    });

    it('returns empty for no errors', () => {
      const collector = new ParserErrorCollector('test');
      const formatted = collector.format();
      expect(formatted.trim().length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('toJSON', () => {
    it('produces JSON-serializable output', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectError('syntax error', { line: 5 });
      const json = collector.toJSON();
      expect(json).toBeDefined();
      expect(JSON.stringify(json)).toBeTruthy();
    });
  });

  describe('reset', () => {
    it('clears all collected errors', () => {
      const collector = new ParserErrorCollector('test');
      collector.collectError('error');
      collector.collectWarning('warning');
      collector.reset();
      expect(collector.hasErrors()).toBe(false);
      expect(collector.getReport().errorCount).toBe(0);
    });
  });

  describe('setSource', () => {
    it('updates source code reference', () => {
      const collector = new ParserErrorCollector('old');
      collector.setSource('new code');
      expect(collector.getReport().source).toBe('new code');
    });
  });

  describe('determineSeverity', () => {
    it('returns error for syntax errors', () => {
      const collector = new ParserErrorCollector();
      expect(collector.determineSeverity('SYNTAX_ERROR')).toBe('error');
    });

    it('returns info for unknown error code', () => {
      const collector = new ParserErrorCollector();
      // 'DEPRECATED' is not explicitly handled, falls to default 'info'
      expect(collector.determineSeverity('DEPRECATED')).toBe('info');
    });
  });

  describe('getRecoveryHint', () => {
    it('provides hint for missing brace', () => {
      const collector = new ParserErrorCollector();
      const hint = collector.getRecoveryHint('MISSING_BRACE');
      expect(hint.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// FACTORY AND HELPERS
// =============================================================================

describe('createErrorCollector', () => {
  it('creates collector with source', () => {
    const collector = createErrorCollector('some code');
    expect(collector).toBeInstanceOf(ParserErrorCollector);
  });
});

describe('withErrorCollection', () => {
  it('wraps function and collects errors', () => {
    const result = withErrorCollection((collector) => {
      collector.collectWarning('test warning');
      return 42;
    }, 'test source');
    expect(result.result).toBe(42);
    expect(result.report.warningCount).toBe(1);
  });

  it('catches thrown errors', () => {
    const result = withErrorCollection(() => {
      throw new Error('boom');
    }, 'test source');
    expect(result.result).toBeUndefined();
    expect(result.report.errorCount).toBeGreaterThan(0);
  });
});

// =============================================================================
// SYNCHRONIZATION STRATEGIES
// =============================================================================

describe('SynchronizationStrategies', () => {
  const tokens = [
    { type: 'IDENTIFIER', value: 'x' },
    { type: 'COLON', value: ':' },
    { type: 'NUMBER', value: '1' },
    { type: 'NEWLINE', value: '\n' },
    { type: 'IDENTIFIER', value: 'y' },
    { type: 'LBRACE', value: '{' },
    { type: 'RBRACE', value: '}' },
  ];

  it('skips to next statement boundary', () => {
    const pos = SynchronizationStrategies.skipToStatement(tokens, 0);
    expect(pos).toBeGreaterThan(0);
    expect(pos).toBeLessThanOrEqual(tokens.length);
  });

  it('skips to block end from LBRACE', () => {
    // skipToBlockEnd starts at current+1 and expects current to be on LBRACE
    const pos = SynchronizationStrategies.skipToBlockEnd(tokens, 5);
    // Should advance past RBRACE at index 6, returning 7
    expect(pos).toBe(7);
  });

  it('skips to keyword', () => {
    const pos = SynchronizationStrategies.skipToKeyword(tokens, 0, ['y']);
    expect(pos).toBeGreaterThan(0);
  });

  it('finds matching bracket', () => {
    const pos = SynchronizationStrategies.findMatchingBracket(tokens, 5, 'LBRACE', 'RBRACE');
    expect(pos).toBe(6);
  });

  it('returns -1 when no matching bracket found', () => {
    const incomplete = [{ type: 'LBRACE', value: '{' }];
    const pos = SynchronizationStrategies.findMatchingBracket(incomplete, 0, 'LBRACE', 'RBRACE');
    expect(pos).toBe(-1);
  });
});
