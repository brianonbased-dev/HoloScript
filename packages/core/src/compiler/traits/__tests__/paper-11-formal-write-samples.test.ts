import { describe, it, expect } from 'vitest';
import {
  PAPER11_FORMAL_WRITE_SAMPLES,
  PAPER11_FORMAL_WRITE_SAMPLE_COUNT,
} from '../paper-11-formal-write-samples';

describe('paper-11 formal write samples', () => {
  it('exports a growing curated subset with unique traits and non-empty writes', () => {
    expect(PAPER11_FORMAL_WRITE_SAMPLE_COUNT).toBe(PAPER11_FORMAL_WRITE_SAMPLES.length);
    expect(PAPER11_FORMAL_WRITE_SAMPLE_COUNT).toBeGreaterThanOrEqual(20);
    const names = new Set<string>();
    for (const row of PAPER11_FORMAL_WRITE_SAMPLES) {
      expect(row.trait.length).toBeGreaterThan(0);
      expect(names.has(row.trait)).toBe(false);
      names.add(row.trait);
      expect(row.writes.length).toBeGreaterThan(0);
      for (const w of row.writes) expect(w.length).toBeGreaterThan(0);
    }
  });
});
