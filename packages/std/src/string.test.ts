/**
 * @fileoverview Comprehensive tests for @holoscript/std string utilities
 */

import { describe, it, expect } from 'vitest';
import {
  isBlank,
  isNotBlank,
  capitalize,
  titleCase,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  constantCase,
  padLeft,
  padRight,
  center,
  truncate,
  truncateMiddle,
  repeat,
  reverse,
  count,
  containsIgnoreCase,
  startsWithIgnoreCase,
  endsWithIgnoreCase,
  removeWhitespace,
  collapseWhitespace,
  removePrefix,
  removeSuffix,
  wrap,
  unwrap,
  lines,
  words,
  chars,
  join,
  format,
  formatNumber,
  numberWithCommas,
  formatBytes,
  formatDuration,
  escapeHtml,
  unescapeHtml,
  escapeRegex,
  slugify,
  isValidIdentifier,
  isNumeric,
  isAlphanumeric,
  isAlpha,
  randomString,
  uuid,
  indent,
  dedent,
  wordWrap,
  levenshtein,
  similarity,
  extractTraits
} from './string.js';

describe('@holoscript/std string utilities', () => {
  describe('formatBytes', () => {
    it('should format bytes correctly with default 2 decimals', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(1023)).toBe('1023 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });

    it('should respect custom decimal precision', () => {
      expect(formatBytes(1536, 0)).toBe('2 KB');
      expect(formatBytes(1536, 1)).toBe('1.5 KB');
      expect(formatBytes(1536, 3)).toBe('1.5 KB');
      expect(formatBytes(1677721, 3)).toBe('1.6 MB');
    });

    it('should handle edge cases', () => {
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(1025)).toBe('1 KB');
      expect(formatBytes(-100)).toBe('-100 B');
    });

    it('should handle very large numbers', () => {
      expect(formatBytes(1125899906842624)).toBe('1 PB'); // 1 petabyte
      expect(formatBytes(2251799813685248)).toBe('2 PB');
    });
  });

  describe('formatDuration', () => {
    it('should format milliseconds correctly', () => {
      expect(formatDuration(0)).toBe('0ms');
      expect(formatDuration(100)).toBe('100ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds correctly', () => {
      expect(formatDuration(1000)).toBe('1.0s');
      expect(formatDuration(1500)).toBe('1.5s');
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format minutes correctly', () => {
      expect(formatDuration(60000)).toBe('1.0m');
      expect(formatDuration(90000)).toBe('1.5m');
      expect(formatDuration(3599999)).toBe('60.0m');
    });

    it('should format hours correctly', () => {
      expect(formatDuration(3600000)).toBe('1.0h');
      expect(formatDuration(5400000)).toBe('1.5h');
    });
  });

  describe('case conversion', () => {
    const testString = 'hello world test';

    it('capitalize should capitalize first letter', () => {
      expect(capitalize('')).toBe('');
      expect(capitalize('hello')).toBe('Hello');
      expect(capitalize(testString)).toBe('Hello world test');
    });

    it('titleCase should capitalize each word', () => {
      expect(titleCase(testString)).toBe('Hello World Test');
      expect(titleCase('')).toBe('');
      expect(titleCase('a')).toBe('A');
    });

    it('camelCase should convert to camelCase', () => {
      expect(camelCase(testString)).toBe('helloWorldTest');
      expect(camelCase('Hello World')).toBe('helloWorld');
      expect(camelCase('')).toBe('');
    });

    it('pascalCase should convert to PascalCase', () => {
      expect(pascalCase(testString)).toBe('HelloWorldTest');
      expect(pascalCase('hello world')).toBe('HelloWorld');
      expect(pascalCase('')).toBe('');
    });

    it('snakeCase should convert to snake_case', () => {
      expect(snakeCase(testString)).toBe('hello_world_test');
      expect(snakeCase('HelloWorld')).toBe('hello_world');
      expect(snakeCase('')).toBe('');
    });

    it('kebabCase should convert to kebab-case', () => {
      expect(kebabCase(testString)).toBe('hello-world-test');
      expect(kebabCase('HelloWorld')).toBe('hello-world');
      expect(kebabCase('')).toBe('');
    });

    it('constantCase should convert to CONSTANT_CASE', () => {
      expect(constantCase(testString)).toBe('HELLO_WORLD_TEST');
      expect(constantCase('HelloWorld')).toBe('HELLO_WORLD');
      expect(constantCase('')).toBe('');
    });
  });

  describe('padding and alignment', () => {
    it('padLeft should pad on the left', () => {
      expect(padLeft('test', 8)).toBe('    test');
      expect(padLeft('test', 8, '*')).toBe('****test');
      expect(padLeft('test', 2)).toBe('test'); // No padding if already long enough
    });

    it('padRight should pad on the right', () => {
      expect(padRight('test', 8)).toBe('test    ');
      expect(padRight('test', 8, '*')).toBe('test****');
      expect(padRight('test', 2)).toBe('test');
    });

    it('center should center text', () => {
      expect(center('test', 8)).toBe('  test  ');
      expect(center('test', 9)).toBe('  test   ');
      expect(center('test', 8, '*')).toBe('**test**');
    });
  });

  describe('validation functions', () => {
    describe('isBlank/isNotBlank', () => {
      it('should detect blank strings', () => {
        expect(isBlank('')).toBe(true);
        expect(isBlank('   ')).toBe(true);
        expect(isBlank('\t\n')).toBe(true);
        expect(isBlank('test')).toBe(false);
        
        expect(isNotBlank('')).toBe(false);
        expect(isNotBlank('   ')).toBe(false);
        expect(isNotBlank('test')).toBe(true);
      });
    });

    it('isValidIdentifier should validate identifiers', () => {
      expect(isValidIdentifier('validName')).toBe(true);
      expect(isValidIdentifier('_validName')).toBe(true);
      expect(isValidIdentifier('$validName')).toBe(true);
      expect(isValidIdentifier('123invalid')).toBe(false);
      expect(isValidIdentifier('invalid-name')).toBe(false);
      expect(isValidIdentifier('')).toBe(false);
    });

    it('isNumeric should validate numeric strings', () => {
      expect(isNumeric('123')).toBe(true);
      expect(isNumeric('123.45')).toBe(true);
      expect(isNumeric('-123')).toBe(true);
      expect(isNumeric('abc')).toBe(false);
      expect(isNumeric('')).toBe(false);
    });

    it('isAlphanumeric should validate alphanumeric strings', () => {
      expect(isAlphanumeric('abc123')).toBe(true);
      expect(isAlphanumeric('ABC')).toBe(true);
      expect(isAlphanumeric('123')).toBe(true);
      expect(isAlphanumeric('abc-123')).toBe(false);
      expect(isAlphanumeric('')).toBe(false);
    });

    it('isAlpha should validate alphabetic strings', () => {
      expect(isAlpha('abc')).toBe(true);
      expect(isAlpha('ABC')).toBe(true);
      expect(isAlpha('abc123')).toBe(false);
      expect(isAlpha('')).toBe(false);
    });
  });

  describe('string manipulation', () => {
    it('truncate should truncate with ellipsis', () => {
      expect(truncate('hello world', 5)).toBe('he...');
      expect(truncate('hello', 10)).toBe('hello');
      expect(truncate('hello world', 8, '---')).toBe('hello---');
    });

    it('truncateMiddle should truncate in middle', () => {
      expect(truncateMiddle('hello world test', 10)).toBe('hel...test');
      expect(truncateMiddle('short', 10)).toBe('short');
    });

    it('repeat should repeat strings', () => {
      expect(repeat('abc', 3)).toBe('abcabcabc');
      expect(repeat('x', 0)).toBe('');
      expect(repeat('', 5)).toBe('');
    });

    it('reverse should reverse strings', () => {
      expect(reverse('hello')).toBe('olleh');
      expect(reverse('')).toBe('');
      expect(reverse('a')).toBe('a');
    });
  });

  describe('HTML utilities', () => {
    it('escapeHtml should escape HTML entities', () => {
      expect(escapeHtml('<div>test</div>')).toBe('&lt;div&gt;test&lt;/div&gt;');
      expect(escapeHtml('a & b')).toBe('a &amp; b');
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('unescapeHtml should unescape HTML entities', () => {
      expect(unescapeHtml('&lt;div&gt;test&lt;/div&gt;')).toBe('<div>test</div>');
      expect(unescapeHtml('a &amp; b')).toBe('a & b');
      expect(unescapeHtml('&quot;quoted&quot;')).toBe('"quoted"');
    });
  });

  describe('utility functions', () => {
    it('count should count substring occurrences', () => {
      expect(count('hello world hello', 'hello')).toBe(2);
      expect(count('aaa', 'aa')).toBe(2); // Overlapping matches
      expect(count('test', 'xyz')).toBe(0);
    });

    it('uuid should generate valid UUIDs', () => {
      const id1 = uuid();
      const id2 = uuid();
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(id2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(id1).not.toBe(id2); // Should be unique
    });

    it('randomString should generate random strings', () => {
      const str1 = randomString(10);
      const str2 = randomString(10);
      expect(str1.length).toBe(10);
      expect(str2.length).toBe(10);
      expect(str1).not.toBe(str2); // Should be different
      
      const customStr = randomString(5, 'ABC');
      expect(customStr.length).toBe(5);
      expect(customStr).toMatch(/^[ABC]+$/);
    });

    it('levenshtein should calculate edit distance', () => {
      expect(levenshtein('', '')).toBe(0);
      expect(levenshtein('hello', 'hello')).toBe(0);
      expect(levenshtein('hello', 'helo')).toBe(1);
      expect(levenshtein('kitten', 'sitting')).toBe(3);
    });

    it('similarity should calculate similarity score', () => {
      expect(similarity('hello', 'hello')).toBe(1);
      expect(similarity('', '')).toBe(1);
      expect(similarity('hello', 'world')).toBeLessThan(0.5);
      expect(similarity('hello', 'helo')).toBeGreaterThan(0.8);
    });
  });

  describe('format utilities', () => {
    it('numberWithCommas should add commas to numbers', () => {
      expect(numberWithCommas(1000)).toBe('1,000');
      expect(numberWithCommas(1234567)).toBe('1,234,567');
      expect(numberWithCommas(100)).toBe('100');
    });

    it('format should template strings', () => {
      expect(format('Hello {name}!', { name: 'World' })).toBe('Hello World!');
      expect(format('{a} + {b} = {sum}', { a: 1, b: 2, sum: 3 })).toBe('1 + 2 = 3');
    });
  });

  describe('extractTraits', () => {
    it('should extract trait syntax from code', () => {
      const code = `
        <Entity position="[1,2,3]" rotation="[0,0,0,1]">
          <Cube color="#ff0000" />
        </Entity>
      `;
      const traits = extractTraits(code);
      expect(traits).toEqual(['Entity', 'Cube']);
    });
  });
});