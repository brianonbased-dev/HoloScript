/**
 * @fileoverview Basic test to verify formatBytes function
 */

import { describe, it, expect } from 'vitest';
import { formatBytes } from './string.js';

describe('formatBytes basic test', () => {
  it('should format bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
  });
});
