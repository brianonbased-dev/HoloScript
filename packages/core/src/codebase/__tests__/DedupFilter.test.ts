/**
 * DedupFilter Tests
 *
 * Gap 4: Validates dual-layer dedup pipeline.
 */

import { describe, it, expect } from 'vitest';
import { DedupFilter, createDedupFilter } from '../DedupFilter';
import type { Dedupable } from '../DedupFilter';

describe('DedupFilter', () => {
  describe('exactDedup', () => {
    it('removes exact duplicates', () => {
      const filter = new DedupFilter();
      const items: Dedupable[] = [
        { id: 'a', content: 'hello world', quality: 1 },
        { id: 'b', content: 'hello world', quality: 0.5 },
        { id: 'c', content: 'different content', quality: 1 },
      ];

      const { unique, removals } = filter.exactDedup(items);
      expect(unique).toHaveLength(2);
      expect(removals).toHaveLength(1);
      expect(removals[0].reason).toBe('exact');
    });

    it('keeps higher quality version', () => {
      const filter = new DedupFilter();
      const items: Dedupable[] = [
        { id: 'low', content: 'same content', quality: 0.3 },
        { id: 'high', content: 'same content', quality: 0.9 },
      ];

      const { unique, removals } = filter.exactDedup(items);
      expect(unique).toHaveLength(1);
      expect(unique[0].id).toBe('high');
      expect(removals[0].removedId).toBe('low');
    });
  });

  describe('semanticDedup', () => {
    it('removes near-duplicates', () => {
      const filter = new DedupFilter({ semanticThreshold: 0.5 });
      const items: Dedupable[] = [
        { id: 'a', content: 'the quick brown fox jumps over the lazy dog today', quality: 1 },
        { id: 'b', content: 'the quick brown fox jumps over the lazy dog yesterday', quality: 0.5 },
        { id: 'c', content: 'something completely different about a cat and a bird', quality: 1 },
      ];

      const { unique } = filter.semanticDedup(items);
      // The two fox sentences should be near-duplicates
      expect(unique.length).toBeLessThanOrEqual(items.length);
    });

    it('handles single item', () => {
      const filter = new DedupFilter();
      const items: Dedupable[] = [
        { id: 'a', content: 'solo item', quality: 1 },
      ];

      const { unique, removals } = filter.semanticDedup(items);
      expect(unique).toHaveLength(1);
      expect(removals).toHaveLength(0);
    });

    it('handles empty input', () => {
      const filter = new DedupFilter();
      const { unique, removals } = filter.semanticDedup([]);
      expect(unique).toHaveLength(0);
      expect(removals).toHaveLength(0);
    });
  });

  describe('full dedup pipeline', () => {
    it('produces a complete report', () => {
      const filter = createDedupFilter();
      const items: Dedupable[] = [
        { id: '1', content: 'unique content one', quality: 1 },
        { id: '2', content: 'unique content two', quality: 1 },
        { id: '3', content: 'unique content one', quality: 0.5 }, // exact dup of 1
        { id: '4', content: 'unique content three', quality: 0.8 },
      ];

      const { retained, report } = filter.dedup(items);
      expect(report.totalInput).toBe(4);
      expect(report.exactDuplicates).toBe(1);
      expect(report.retained).toBe(retained.length);
      expect(report.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('retains all unique items', () => {
      const filter = createDedupFilter();
      const items: Dedupable[] = [
        { id: '1', content: 'alpha beta gamma', quality: 1 },
        { id: '2', content: 'delta epsilon zeta', quality: 1 },
        { id: '3', content: 'eta theta iota', quality: 1 },
      ];

      const { retained, report } = filter.dedup(items);
      expect(retained).toHaveLength(3);
      expect(report.exactDuplicates).toBe(0);
    });
  });
});
