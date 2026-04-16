import { describe, it, expect } from 'vitest';
import * as ARTraits from '../ARTraits.js';

describe('ARTraits', () => {
  it('should export AR primitives if any', () => {
    expect(ARTraits).toBeDefined();
  });
});
