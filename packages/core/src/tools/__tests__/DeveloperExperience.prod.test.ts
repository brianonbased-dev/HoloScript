/**
 * ErrorFormatter + SourceMapGenerator Production Tests
 *
 * Pure string/data manipulation from DeveloperExperience.ts.
 */

import { describe, it, expect } from 'vitest';
import { ErrorFormatter, SourceMapGenerator } from '../DeveloperExperience';

describe('ErrorFormatter — Production', () => {
  it('formats error with message', () => {
    const output = ErrorFormatter.formatError({ message: 'Boom' });
    expect(output).toContain('Boom');
  });

  it('formats error with location', () => {
    const output = ErrorFormatter.formatError({
      message: 'Err',
      location: { line: 3, column: 5 },
    });
    expect(output).toContain('line 3');
    expect(output).toContain('column 5');
  });

  it('formats error with source context', () => {
    const src = 'line1\nline2\nline3\nline4';
    const output = ErrorFormatter.formatError(
      { message: 'Err', location: { line: 3, column: 1 } },
      src
    );
    expect(output).toContain('line3');
  });

  it('formats error with suggestion', () => {
    const output = ErrorFormatter.formatError({ message: 'Bad', suggestion: 'Try X' });
    expect(output).toContain('Try X');
  });

  it('formats multiple errors', () => {
    const errors = [{ message: 'Error1' }, { message: 'Error2' }];
    const output = ErrorFormatter.formatErrors(errors);
    expect(output).toContain('Error1');
    expect(output).toContain('Error2');
    expect(output).toContain('2 errors');
  });

  it('formatErrors returns empty for no errors', () => {
    expect(ErrorFormatter.formatErrors([])).toBe('');
  });

  it('formats success message', () => {
    const output = ErrorFormatter.formatSuccess('Compiled OK');
    expect(output).toContain('Compiled OK');
    expect(output).toContain('✅');
  });

  it('formats success with object details', () => {
    const output = ErrorFormatter.formatSuccess('Done', { lines: 42 });
    expect(output).toContain('Done');
    expect(output).toContain('42');
  });

  it('formats help text', () => {
    const output = ErrorFormatter.formatHelp();
    expect(output).toContain('REPL');
    expect(output).toContain('help');
  });
});

describe('SourceMapGenerator — Production', () => {
  it('addMapping + generate produces standard fields', () => {
    const gen = new SourceMapGenerator();
    gen.addMapping(1, 0, 1, 0, 'foo');
    const map = gen.generate('source.holo', 'output.js');
    expect(map.version).toBe(3);
    expect(map.sources).toContain('source.holo');
    expect(map.file).toBe('output.js');
    expect(typeof map.mappings).toBe('string');
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  it('empty generator produces empty mappings', () => {
    const gen = new SourceMapGenerator();
    const map = gen.generate('a.holo', 'b.js');
    expect(map.mappings).toBe('');
  });

  it('multiple mappings joined by semicolon', () => {
    const gen = new SourceMapGenerator();
    gen.addMapping(1, 0, 1, 0);
    gen.addMapping(2, 5, 3, 10);
    const map = gen.generate('a.holo', 'b.js');
    expect(map.mappings).toContain(';');
  });
});
