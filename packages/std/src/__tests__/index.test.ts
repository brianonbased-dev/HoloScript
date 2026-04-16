import { describe, it, expect } from 'vitest';
import * as std from '../index.js';

describe('std/index', () => {
  it('should export standard types and math', () => {
    expect(std).toBeDefined();
    expect(std.PI).toBeGreaterThan(3.14);
  });

  it('should export string utilities', () => {
    expect(std.capitalize('holo')).toBe('Holo');
    expect(typeof std.lerp).toBe('function');
  });
});
