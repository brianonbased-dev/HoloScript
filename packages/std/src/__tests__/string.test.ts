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
} from '../string.js';

describe('isBlank', () => {
  it('should return true for empty string', () => {
    expect(isBlank('')).toBe(true);
  });

  it('should return true for whitespace only', () => {
    expect(isBlank('   ')).toBe(true);
    expect(isBlank('\t\n')).toBe(true);
  });

  it('should return false for non-empty string', () => {
    expect(isBlank('hello')).toBe(false);
    expect(isBlank(' hello ')).toBe(false);
  });
});

describe('isNotBlank', () => {
  it('should return false for empty string', () => {
    expect(isNotBlank('')).toBe(false);
  });

  it('should return false for whitespace only', () => {
    expect(isNotBlank('   ')).toBe(false);
  });

  it('should return true for non-empty string', () => {
    expect(isNotBlank('hello')).toBe(true);
  });
});

describe('capitalize', () => {
  it('should capitalize first letter', () => {
    expect(capitalize('hello')).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(capitalize('')).toBe('');
  });

  it('should handle already capitalized', () => {
    expect(capitalize('Hello')).toBe('Hello');
  });

  it('should handle single character', () => {
    expect(capitalize('a')).toBe('A');
  });
});

describe('titleCase', () => {
  it('should capitalize each word', () => {
    expect(titleCase('hello world')).toBe('Hello World');
  });

  it('should handle multiple spaces', () => {
    expect(titleCase('hello  world')).toBe('Hello World');
  });

  it('should handle single word', () => {
    expect(titleCase('hello')).toBe('Hello');
  });
});

describe('camelCase', () => {
  it('should convert space-separated to camelCase', () => {
    expect(camelCase('hello world')).toBe('helloWorld');
  });

  it('should convert kebab-case to camelCase', () => {
    expect(camelCase('hello-world')).toBe('helloWorld');
  });

  it('should convert snake_case to camelCase', () => {
    expect(camelCase('hello_world')).toBe('helloWorld');
  });

  it('should lowercase first letter of PascalCase', () => {
    expect(camelCase('HelloWorld')).toBe('helloWorld');
  });

  it('should handle empty string', () => {
    expect(camelCase('')).toBe('');
  });
});

describe('pascalCase', () => {
  it('should convert space-separated to PascalCase', () => {
    expect(pascalCase('hello world')).toBe('HelloWorld');
  });

  it('should convert kebab-case to PascalCase', () => {
    expect(pascalCase('hello-world')).toBe('HelloWorld');
  });

  it('should convert snake_case to PascalCase', () => {
    expect(pascalCase('hello_world')).toBe('HelloWorld');
  });

  it('should handle empty string', () => {
    expect(pascalCase('')).toBe('');
  });
});

describe('snakeCase', () => {
  it('should convert space-separated to snake_case', () => {
    expect(snakeCase('hello world')).toBe('hello_world');
  });

  it('should convert camelCase to snake_case', () => {
    expect(snakeCase('helloWorld')).toBe('hello_world');
  });

  it('should convert PascalCase to snake_case', () => {
    expect(snakeCase('HelloWorld')).toBe('hello_world');
  });

  it('should convert kebab-case to snake_case', () => {
    expect(snakeCase('hello-world')).toBe('hello_world');
  });
});

describe('kebabCase', () => {
  it('should convert space-separated to kebab-case', () => {
    expect(kebabCase('hello world')).toBe('hello-world');
  });

  it('should convert camelCase to kebab-case', () => {
    expect(kebabCase('helloWorld')).toBe('hello-world');
  });

  it('should convert PascalCase to kebab-case', () => {
    expect(kebabCase('HelloWorld')).toBe('hello-world');
  });

  it('should convert snake_case to kebab-case', () => {
    expect(kebabCase('hello_world')).toBe('hello-world');
  });
});

describe('constantCase', () => {
  it('should convert to SCREAMING_SNAKE_CASE', () => {
    expect(constantCase('hello world')).toBe('HELLO_WORLD');
  });

  it('should convert camelCase to SCREAMING_SNAKE_CASE', () => {
    expect(constantCase('helloWorld')).toBe('HELLO_WORLD');
  });

  it('should convert kebab-case to SCREAMING_SNAKE_CASE', () => {
    expect(constantCase('hello-world')).toBe('HELLO_WORLD');
  });
});
