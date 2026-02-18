import { describe, it, expect, beforeEach } from 'vitest';
import {
  ParserErrorCollector,
  SynchronizationStrategies,
  createErrorCollector,
  withErrorCollection,
} from '../ParserErrorCollector';

describe('ParserErrorCollector', () => {
  let collector: ParserErrorCollector;

  beforeEach(() => {
    collector = new ParserErrorCollector('const x = 42;');
  });

  // =========== Constructor & basics ===========

  it('starts with no errors', () => {
    expect(collector.hasErrors()).toBe(false);
    expect(collector.isLimited()).toBe(false);
  });

  it('format returns "No errors found" when empty', () => {
    expect(collector.format()).toBe('No errors found');
  });

  it('getReport returns clean report when empty', () => {
    const report = collector.getReport();
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
    expect(report.shouldStop).toBe(false);
    expect(report.diagnostics).toHaveLength(0);
    expect(report.source).toBe('const x = 42;');
  });

  // =========== collectError ===========

  it('collects a string error and detects MISSING_BRACE code', () => {
    collector.collectError('missing closing brace }');
    expect(collector.hasErrors()).toBe(true);
    const report = collector.getReport();
    expect(report.errorCount).toBe(1);
    expect(report.diagnostics[0].code).toBe('MISSING_BRACE');
    expect(report.diagnostics[0].severity).toBe('error');
  });

  it('collects MISSING_COLON from string', () => {
    collector.collectError('missing colon after property');
    const report = collector.getReport();
    expect(report.diagnostics[0].code).toBe('MISSING_COLON');
  });

  it('collects MISSING_QUOTE from string', () => {
    collector.collectError('unterminated string literal');
    const report = collector.getReport();
    expect(report.diagnostics[0].code).toBe('MISSING_QUOTE');
  });

  it('defaults to SYNTAX_ERROR for generic strings', () => {
    collector.collectError('something went wrong');
    const report = collector.getReport();
    expect(report.diagnostics[0].code).toBe('SYNTAX_ERROR');
    expect(report.diagnostics[0].severity).toBe('error');
  });

  it('collects Error instances', () => {
    collector.collectError(new Error('parse failed'), { line: 5, column: 10 });
    const report = collector.getReport();
    expect(report.diagnostics[0].message).toBe('parse failed');
    expect(report.diagnostics[0].line).toBe(5);
    expect(report.diagnostics[0].column).toBe(10);
  });

  it('collects ParseError objects and preserves code', () => {
    collector.collectError({
      code: 'UNKNOWN_TRAIT',
      message: 'Unknown trait: foo',
      line: 3,
      column: 5,
    } as any);
    const report = collector.getReport();
    expect(report.diagnostics[0].code).toBe('UNKNOWN_TRAIT');
    expect(report.diagnostics[0].severity).toBe('warning');
  });

  it('collects context line/column when no error has them', () => {
    collector.collectError('oops', { line: 10, column: 3 });
    expect(collector.getReport().diagnostics[0].line).toBe(10);
    expect(collector.getReport().diagnostics[0].column).toBe(3);
  });

  it('stops collecting after maxErrors', () => {
    const small = new ParserErrorCollector('', 3);
    for (let i = 0; i < 10; i++) {
      small.collectError(`error ${i}`);
    }
    expect(small.isLimited()).toBe(true);
    expect(small.getReport().errorCount).toBe(3);
  });

  // =========== collectWarning ===========

  it('collects warnings', () => {
    collector.collectWarning('unused variable', 2, 5, 'INVALID_VALUE');
    const report = collector.getReport();
    expect(report.warningCount).toBe(1);
    expect(report.diagnostics).toHaveLength(1);
    expect(report.diagnostics[0].severity).toBe('warning');
  });

  it('warning limit is half of maxErrors', () => {
    const small = new ParserErrorCollector('', 4);
    for (let i = 0; i < 10; i++) {
      small.collectWarning(`warn ${i}`);
    }
    expect(small.getReport().warningCount).toBe(2); // 4 / 2 = 2
  });

  // =========== hasErrors / shouldStop ===========

  it('hasErrors is true with errors, shouldStop is true', () => {
    collector.collectError('bad');
    expect(collector.hasErrors()).toBe(true);
    expect(collector.getReport().shouldStop).toBe(true);
  });

  it('warnings alone do not set shouldStop', () => {
    collector.collectWarning('warning only');
    expect(collector.hasErrors()).toBe(false);
    expect(collector.getReport().shouldStop).toBe(false);
  });

  // =========== format ===========

  it('format includes error lines with emoji', () => {
    collector.collectError('bad token');
    const formatted = collector.format();
    expect(formatted).toContain('❌');
    expect(formatted).toContain('bad token');
  });

  it('format includes warnings with emoji', () => {
    collector.collectWarning('deprecated usage');
    const formatted = collector.format();
    expect(formatted).toContain('⚠️');
    expect(formatted).toContain('deprecated usage');
  });

  it('format includes recovery hints', () => {
    collector.collectError('missing closing brace }');
    const formatted = collector.format();
    expect(formatted).toContain('🔧');
    expect(formatted).toContain('Add a closing }');
  });

  // =========== toJSON ===========

  it('toJSON returns LSP-compatible structure', () => {
    collector.collectError('bad', { line: 5, column: 2 });
    const json = collector.toJSON();
    expect(json.success).toBe(false);
    expect(json.errors).toBe(1);
    expect(json.diagnostics[0].range.start.line).toBe(4); // 0-indexed
    expect(json.diagnostics[0].range.start.character).toBe(2);
    expect(json.diagnostics[0].severity).toBe(1); // error = 1
  });

  it('toJSON success is true when no errors', () => {
    expect(collector.toJSON().success).toBe(true);
  });

  // =========== reset / setSource ===========

  it('reset clears all errors and warnings', () => {
    collector.collectError('err');
    collector.collectWarning('warn');
    collector.reset();
    expect(collector.hasErrors()).toBe(false);
    expect(collector.getReport().warningCount).toBe(0);
  });

  it('setSource updates source', () => {
    collector.setSource('new code');
    expect(collector.getReport().source).toBe('new code');
  });
});

// =============================================================================
// Helper functions
// =============================================================================

describe('createErrorCollector', () => {
  it('creates a collector with source', () => {
    const c = createErrorCollector('test source');
    expect(c.getReport().source).toBe('test source');
  });
});

describe('withErrorCollection', () => {
  it('returns result and report on success', () => {
    const { result, report } = withErrorCollection((c) => {
      c.collectWarning('minor issue');
      return 42;
    }, 'code');
    expect(result).toBe(42);
    expect(report.warningCount).toBe(1);
  });

  it('catches thrown errors and returns report', () => {
    const { result, report } = withErrorCollection(() => {
      throw new Error('crash');
    }, 'code');
    expect(result).toBeUndefined();
    expect(report.errorCount).toBe(1);
    expect(report.shouldStop).toBe(true);
  });
});

// =============================================================================
// SynchronizationStrategies
// =============================================================================

describe('SynchronizationStrategies', () => {
  const tok = (type: string, value?: string) => ({ type, value: value ?? '' });

  it('skipToStatement finds next SEMICOLON', () => {
    const tokens = [tok('IDENT'), tok('IDENT'), tok('SEMICOLON'), tok('IDENT')];
    expect(SynchronizationStrategies.skipToStatement(tokens, 0)).toBe(3);
  });

  it('skipToStatement finds NEWLINE', () => {
    const tokens = [tok('IDENT'), tok('NEWLINE')];
    expect(SynchronizationStrategies.skipToStatement(tokens, 0)).toBe(2);
  });

  it('skipToStatement returns end if no boundary', () => {
    const tokens = [tok('IDENT'), tok('IDENT')];
    expect(SynchronizationStrategies.skipToStatement(tokens, 0)).toBe(2);
  });

  it('skipToBlockEnd skips matching braces', () => {
    const tokens = [
      tok('LBRACE'), // start (current points here)
      tok('IDENT'),
      tok('LBRACE'),
      tok('RBRACE'),
      tok('RBRACE'),
      tok('IDENT'),
    ];
    expect(SynchronizationStrategies.skipToBlockEnd(tokens, 0)).toBe(5);
  });

  it('skipToKeyword finds target keyword', () => {
    const tokens = [
      tok('IDENT', 'foo'),
      tok('IDENT', 'bar'),
      tok('IDENT', 'composition'),
    ];
    expect(SynchronizationStrategies.skipToKeyword(tokens, 0, ['composition'])).toBe(2);
  });

  it('skipToKeyword returns end if not found', () => {
    const tokens = [tok('IDENT', 'foo')];
    expect(SynchronizationStrategies.skipToKeyword(tokens, 0, ['nope'])).toBe(1);
  });

  it('findMatchingBracket finds matching close', () => {
    const tokens = [
      tok('LPAREN'),
      tok('IDENT'),
      tok('LPAREN'),
      tok('RPAREN'),
      tok('RPAREN'),
    ];
    expect(SynchronizationStrategies.findMatchingBracket(tokens, 0, 'LPAREN', 'RPAREN')).toBe(4);
  });

  it('findMatchingBracket returns -1 if unmatched', () => {
    const tokens = [tok('LPAREN'), tok('IDENT')];
    expect(SynchronizationStrategies.findMatchingBracket(tokens, 0, 'LPAREN', 'RPAREN')).toBe(-1);
  });
});
