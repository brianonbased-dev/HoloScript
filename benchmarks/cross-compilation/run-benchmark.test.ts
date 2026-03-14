/**
 * @fileoverview Tests for benchmark utility functions
 */

import { describe, it, expect } from 'vitest';

// Extract utility functions for testing
function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

describe('Benchmark Utilities', () => {
  describe('formatBytes', () => {
    it('should format bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(100)).toBe('100 B');
      expect(formatBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.0 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10.0 KB');
      expect(formatBytes(1048575)).toBe('1024.0 KB'); // Just under 1MB
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1048576)).toBe('1.0 MB'); // Exactly 1MB
      expect(formatBytes(1572864)).toBe('1.5 MB'); // 1.5MB
      expect(formatBytes(10485760)).toBe('10.0 MB'); // 10MB
    });

    it('should handle decimal precision correctly', () => {
      expect(formatBytes(1536)).toBe('1.5 KB'); // 1.5KB exactly
      expect(formatBytes(1638)).toBe('1.6 KB'); // Should round to 1.6KB
      expect(formatBytes(1677721)).toBe('1.6 MB'); // Should round to 1.6MB
    });

    it('should handle large numbers', () => {
      expect(formatBytes(1073741824)).toBe('1024.0 MB'); // 1GB in MB
      expect(formatBytes(2147483648)).toBe('2048.0 MB'); // 2GB in MB
    });

    it('should handle edge cases', () => {
      expect(formatBytes(1)).toBe('1 B');
      expect(formatBytes(1025)).toBe('1.0 KB'); // Just over 1KB threshold
    });
  });
});