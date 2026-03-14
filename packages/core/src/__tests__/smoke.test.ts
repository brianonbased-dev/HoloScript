/**
 * Smoke test to verify basic HoloScript core functionality
 */

import { describe, it, expect } from 'vitest';

describe('HoloScript Core Smoke Test', () => {
  it('should pass basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should import constants', async () => {
    const constants = await import('../constants');
    expect(constants).toBeDefined();
  });

  it('should have parser available', async () => {
    const { HoloScriptPlusParser } = await import('../parser/HoloScriptPlusParser');
    expect(HoloScriptPlusParser).toBeDefined();
  });
});