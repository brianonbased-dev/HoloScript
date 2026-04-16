import { describe, it, expect } from 'vitest';
import * as strings from '../string.js';

describe('string-decoupled', () => {
  it('should export basic string utilities', () => {
    expect(strings.capitalize).toBeDefined();
    expect(strings.capitalize('hello')).toBe('Hello');
  });

  it('should handle whitespace utilities', () => {
    expect(strings.removeWhitespace(' h e l l o ')).toBe('hello');
  });
});
