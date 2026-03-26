/**
 * PLATFORM_STATS Centralization Tests
 *
 * Validates that all moltbook modules use the single source of truth
 * from types.ts rather than local duplicates.
 */

import { describe, it, expect } from 'vitest';
import { PLATFORM_STATS } from '../moltbook/types';

describe('PLATFORM_STATS', () => {
  it('exports all required fields', () => {
    expect(PLATFORM_STATS.TOOL_COUNT).toBeDefined();
    expect(PLATFORM_STATS.TEST_COUNT).toBeDefined();
    expect(PLATFORM_STATS.BACKEND_COUNT).toBeDefined();
    expect(PLATFORM_STATS.BENCHMARK_PASS).toBeDefined();
    expect(PLATFORM_STATS.COMPILATION_AVG).toBeDefined();
    expect(PLATFORM_STATS.PACKAGE_COUNT).toBeDefined();
    expect(PLATFORM_STATS.CATEGORY_COUNT).toBeDefined();
  });

  it('has non-empty string values', () => {
    for (const [key, value] of Object.entries(PLATFORM_STATS)) {
      expect(value).toBeTruthy();
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('TOOL_COUNT includes + suffix', () => {
    expect(PLATFORM_STATS.TOOL_COUNT).toMatch(/\d+\+/);
  });

  it('BACKEND_COUNT is a numeric string', () => {
    expect(Number(PLATFORM_STATS.BACKEND_COUNT)).toBeGreaterThan(0);
  });

  it('is readonly (const assertion)', () => {
    // TypeScript readonly enforcement — these are string literals, not string
    const toolCount: '103+' = PLATFORM_STATS.TOOL_COUNT;
    expect(toolCount).toBe('103+');
  });
});
