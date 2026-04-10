/**
 * ParserErrorCollector + SynchronizationStrategies Production Tests
 *
 * Tests error collection, warnings, severity determination, recovery hints,
 * formatting, JSON export, and token synchronization strategies.
 */

import { describe, it, expect } from 'vitest';
import {
  ParserErrorCollector,
  createErrorCollector,
  withErrorCollection,
  SynchronizationStrategies,
} from '../../parser/ParserErrorCollector';

// ─── ParserErrorCollector ────────────────────────────────────────────────

describe('ParserErrorCollector — Production', () => {
  it('starts with no errors', () => {
    const c = new ParserErrorCollector();
    expect(c.hasErrors()).toBe(false);
  });

  it('collectError from string', () => {
    const c = new ParserErrorCollector();
    c.collectError('Something broke', { line: 5, column: 3 });
    expect(c.hasErrors()).toBe(true);
    const report = c.getReport();
    expect(report.errorCount).toBe(1);
    expect(report.diagnostics[0].line).toBe(5);
  });

  it('collectError detects missing brace from string', () => {
    const c = new ParserErrorCollector();
    c.collectError('missing closing brace at end');
    const report = c.getReport();
    expect(report.diagnostics[0].code).toBe('MISSING_BRACE');
  });

  it('collectError detects missing quote from string', () => {
    const c = new ParserErrorCollector();
    c.collectError('unterminated string literal');
    const report = c.getReport();
    expect(report.diagnostics[0].code).toBe('MISSING_QUOTE');
  });

  it('collectError from Error object', () => {
    const c = new ParserErrorCollector();
    c.collectError(new Error('parse failure'), { line: 10 });
    expect(c.hasErrors()).toBe(true);
    const report = c.getReport();
    expect(report.diagnostics[0].line).toBe(10);
  });

  it('collectWarning adds warning', () => {
    const c = new ParserErrorCollector();
    c.collectWarning('Deprecated feature', 3, 1);
    expect(c.hasErrors()).toBe(false);
    const report = c.getReport();
    expect(report.warningCount).toBe(1);
  });

  it('isLimited respects maxErrors', () => {
    const c = new ParserErrorCollector('', 3);
    c.collectError('err1');
    c.collectError('err2');
    c.collectError('err3');
    expect(c.isLimited()).toBe(true);
    c.collectError('err4'); // should be ignored
    expect(c.getReport().errorCount).toBe(3);
  });

  it('getReport includes shouldStop', () => {
    const c = new ParserErrorCollector();
    expect(c.getReport().shouldStop).toBe(false);
    c.collectError('error');
    expect(c.getReport().shouldStop).toBe(true);
  });

  it('format returns "No errors found" when empty', () => {
    const c = new ParserErrorCollector();
    expect(c.format()).toBe('No errors found');
  });

  it('format includes error details', () => {
    const c = new ParserErrorCollector();
    c.collectError('bad token', { line: 1, column: 5 });
    const formatted = c.format();
    expect(formatted).toContain('Line 1:5');
  });

  it('toJSON produces LSP-compatible structure', () => {
    const c = new ParserErrorCollector();
    c.collectError('error msg', { line: 3, column: 2 });
    const json = c.toJSON();
    expect(json.success).toBe(false);
    expect(json.errors).toBe(1);
    expect(json.diagnostics[0].range.start.line).toBe(2); // 0-indexed
    expect(json.diagnostics[0].range.start.character).toBe(2);
  });

  it('reset clears all errors', () => {
    const c = new ParserErrorCollector();
    c.collectError('err');
    c.collectWarning('warn');
    c.reset();
    expect(c.hasErrors()).toBe(false);
    expect(c.getReport().warningCount).toBe(0);
  });

  it('setSource updates source', () => {
    const c = new ParserErrorCollector();
    c.setSource('new source code');
    const report = c.getReport();
    expect(report.source).toBe('new source code');
  });
});

// ─── Factory Functions ───────────────────────────────────────────────────

describe('createErrorCollector — Production', () => {
  it('creates collector with source', () => {
    const c = createErrorCollector('test source');
    expect(c.getReport().source).toBe('test source');
  });
});

describe('withErrorCollection — Production', () => {
  it('returns result on success', () => {
    const { result, report } = withErrorCollection(() => 42, '');
    expect(result).toBe(42);
    expect(report.errorCount).toBe(0);
  });

  it('catches thrown errors', () => {
    const { result, report } = withErrorCollection(() => {
      throw new Error('boom');
    }, '');
    expect(result).toBeUndefined();
    expect(report.errorCount).toBe(1);
  });
});

// ─── SynchronizationStrategies ───────────────────────────────────────────

describe('SynchronizationStrategies — Production', () => {
  const mkTokens = (...types: string[]) =>
    types.map((t, i) => ({ type: t, value: t.toLowerCase() }));

  it('skipToStatement finds SEMICOLON', () => {
    const tokens = mkTokens('IDENT', 'IDENT', 'SEMICOLON', 'IDENT');
    expect(SynchronizationStrategies.skipToStatement(tokens, 0)).toBe(3);
  });

  it('skipToStatement finds NEWLINE', () => {
    const tokens = mkTokens('IDENT', 'NEWLINE', 'IDENT');
    expect(SynchronizationStrategies.skipToStatement(tokens, 0)).toBe(2);
  });

  it('skipToStatement returns end when not found', () => {
    const tokens = mkTokens('IDENT', 'IDENT');
    expect(SynchronizationStrategies.skipToStatement(tokens, 0)).toBe(2);
  });

  it('skipToBlockEnd tracks brace depth', () => {
    const tokens = mkTokens('LBRACE', 'IDENT', 'LBRACE', 'RBRACE', 'RBRACE');
    // Starting at 0 (after initial LBRACE), braceCount=1
    const result = SynchronizationStrategies.skipToBlockEnd(tokens, 0);
    expect(result).toBe(5);
  });

  it('skipToKeyword finds target keyword', () => {
    const tokens = [
      { type: 'IDENT', value: 'foo' },
      { type: 'IDENT', value: 'bar' },
      { type: 'KEYWORD', value: 'composition' },
    ];
    expect(SynchronizationStrategies.skipToKeyword(tokens, 0, ['composition'])).toBe(2);
  });

  it('findMatchingBracket finds match', () => {
    const tokens = mkTokens('LPAREN', 'IDENT', 'RPAREN');
    expect(SynchronizationStrategies.findMatchingBracket(tokens, 0, 'LPAREN', 'RPAREN')).toBe(2);
  });

  it('findMatchingBracket returns -1 when no match', () => {
    const tokens = mkTokens('LPAREN', 'IDENT');
    expect(SynchronizationStrategies.findMatchingBracket(tokens, 0, 'LPAREN', 'RPAREN')).toBe(-1);
  });
});
