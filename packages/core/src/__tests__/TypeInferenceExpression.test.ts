/**
 * Sprint 5 — inferTypeExpression Tests
 *
 * Tests the new string-expression-based type inference method added
 * to HoloScriptTypeChecker for Sprint 5.
 */

import { describe, it, expect } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';

describe('HoloScriptTypeChecker.inferTypeExpression', () => {
  const checker = new HoloScriptTypeChecker();

  it('infers vec3 from a 3-element numeric array', () => {
    expect(checker.inferTypeExpression('[0, 1, 0]')).toBe('vec3');
  });

  it('infers vec3 from floats', () => {
    expect(checker.inferTypeExpression('[1.5, 2.0, 3.14]')).toBe('vec3');
  });

  it('infers vec2 from a 2-element numeric array', () => {
    expect(checker.inferTypeExpression('[10, 20]')).toBe('vec2');
  });

  it('infers float from a decimal number', () => {
    expect(checker.inferTypeExpression('3.14')).toBe('float');
  });

  it('infers int from an integer literal', () => {
    expect(checker.inferTypeExpression('42')).toBe('int');
  });

  it('infers int from zero', () => {
    expect(checker.inferTypeExpression('0')).toBe('int');
  });

  it('infers int from negative integer', () => {
    expect(checker.inferTypeExpression('-7')).toBe('int');
  });

  it('infers float from negative float', () => {
    expect(checker.inferTypeExpression('-3.14')).toBe('float');
  });

  it('infers bool from true', () => {
    expect(checker.inferTypeExpression('true')).toBe('bool');
  });

  it('infers bool from false', () => {
    expect(checker.inferTypeExpression('false')).toBe('bool');
  });

  it('infers string from double-quoted literal', () => {
    expect(checker.inferTypeExpression('"hello"')).toBe('string');
  });

  it('infers string from single-quoted literal', () => {
    expect(checker.inferTypeExpression("'world'")).toBe('string');
  });

  it('returns any for unknown expression', () => {
    expect(checker.inferTypeExpression('foo + bar')).toBe('any');
  });

  it('returns any for empty string', () => {
    expect(checker.inferTypeExpression('')).toBe('any');
  });

  it('returns any for 4-element array (not a recognized vector)', () => {
    expect(checker.inferTypeExpression('[1, 2, 3, 4]')).toBe('any');
  });

  it('returns any for mixed-type array', () => {
    expect(checker.inferTypeExpression('[1, "hello", true]')).toBe('any');
  });
});
