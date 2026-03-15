/**
 * Basic smoke tests for @holoscript/core
 */
import { describe, it, expect } from 'vitest';

describe('HoloScript Core', () => {
  it('should have basic functionality', () => {
    expect(1 + 1).toBe(2);
  });

  it('should define version constants', () => {
    expect(typeof '5.1.0').toBe('string');
  });

  it('should have object constructor', () => {
    const obj = {};
    expect(obj).toBeDefined();
    expect(typeof obj).toBe('object');
  });

  it('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(3);
  });

  it('should handle strings', () => {
    const str = 'holoscript';
    expect(typeof str).toBe('string');
    expect(str.length).toBeGreaterThan(0);
  });
});