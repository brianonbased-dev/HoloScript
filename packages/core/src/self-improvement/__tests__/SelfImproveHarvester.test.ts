import { describe, it, expect } from 'vitest';
import { SelfImproveHarvester, type HarvestResult } from '../SelfImproveHarvester.js';

describe('SelfImproveHarvester', () => {
  describe('constructor', () => {
    it('creates instance with default outputFile containing memory://', () => {
      const h = new SelfImproveHarvester();
      const stats = h.getStats();
      expect(stats.currentFile).toContain('memory://');
    });

    it('accepts custom outputFile', () => {
      const h = new SelfImproveHarvester({ outputFile: 'custom-output.jsonl' });
      expect(h.getStats().currentFile).toBe('custom-output.jsonl');
    });

    it('starts with zero entries', () => {
      const h = new SelfImproveHarvester();
      expect(h.getStats().entryCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('returns entryCount and currentFile', () => {
      const h = new SelfImproveHarvester({ outputFile: 'test.jsonl' });
      const stats = h.getStats();
      expect(typeof stats.entryCount).toBe('number');
      expect(typeof stats.currentFile).toBe('string');
    });
  });

  describe('harvestFromCycle', () => {
    it('increments entryCount after one call', () => {
      const h = new SelfImproveHarvester();
      h.harvestFromCycle('instruction text', 'output text', 'pass', 0.9);
      expect(h.getStats().entryCount).toBe(1);
    });

    it('increments entryCount for multiple calls', () => {
      const h = new SelfImproveHarvester();
      h.harvestFromCycle('a', 'b', 'pass', 0.8);
      h.harvestFromCycle('c', 'd', 'fail', 0.3);
      h.harvestFromCycle('e', 'f', 'skip', 0.5);
      expect(h.getStats().entryCount).toBe(3);
    });

    const results: HarvestResult[] = ['pass', 'fail', 'skip', 'error'];
    for (const result of results) {
      it(`accepts testResult: ${result}`, () => {
        const h = new SelfImproveHarvester();
        expect(() => h.harvestFromCycle('instr', 'out', result, 0.5)).not.toThrow();
        expect(h.getStats().entryCount).toBe(1);
      });
    }

    it('accepts quality scores from 0.0 to 1.0', () => {
      const h = new SelfImproveHarvester();
      for (const score of [0.0, 0.25, 0.5, 0.75, 1.0]) {
        h.harvestFromCycle('instr', 'out', 'pass', score);
      }
      expect(h.getStats().entryCount).toBe(5);
    });

    it('accepts optional metadata', () => {
      const h = new SelfImproveHarvester();
      expect(() =>
        h.harvestFromCycle('instr', 'out', 'pass', 0.9, { source: 'test', run: 42 })
      ).not.toThrow();
      expect(h.getStats().entryCount).toBe(1);
    });

    it('works without metadata parameter', () => {
      const h = new SelfImproveHarvester();
      expect(() => h.harvestFromCycle('instr', 'out', 'pass', 0.9)).not.toThrow();
    });

    it('works with null/undefined metadata (falsy — no metadata field stored)', () => {
      const h = new SelfImproveHarvester();
      expect(() => h.harvestFromCycle('instr', 'out', 'pass', 0.9, undefined)).not.toThrow();
      expect(h.getStats().entryCount).toBe(1);
    });

    it('entryCount is cumulative across multiple harvests', () => {
      const h = new SelfImproveHarvester();
      for (let i = 0; i < 10; i++) {
        h.harvestFromCycle(`instruction-${i}`, `output-${i}`, 'pass', i / 10);
      }
      expect(h.getStats().entryCount).toBe(10);
    });
  });

  describe('isolation', () => {
    it('two harvesters do not share state', () => {
      const h1 = new SelfImproveHarvester();
      const h2 = new SelfImproveHarvester();
      h1.harvestFromCycle('a', 'b', 'pass', 1.0);
      h1.harvestFromCycle('c', 'd', 'pass', 1.0);
      expect(h1.getStats().entryCount).toBe(2);
      expect(h2.getStats().entryCount).toBe(0);
    });
  });
});
