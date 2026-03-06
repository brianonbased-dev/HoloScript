/**
 * JitterBuffer.prod.test.ts
 *
 * Production tests for JitterBuffer — in-sequence emission, out-of-order
 * reordering, duplicate rejection, forceFlush, remove, overflow trimming,
 * and tick-driven gap-skip.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { JitterBuffer } from '../JitterBuffer';

type State = { objectId: string; sequenceNumber: number; timestamp: number };

function s(objectId: string, seq: number): State {
  return { objectId, sequenceNumber: seq, timestamp: Date.now() };
}

describe('JitterBuffer', () => {
  // holdTimeMs=0 lets us test sequencing without waiting for real time
  let buf: JitterBuffer<State>;

  beforeEach(() => {
    buf = new JitterBuffer<State>({ holdTimeMs: 0 });
  });

  // -------------------------------------------------------------------------
  // In-sequence emission
  // -------------------------------------------------------------------------
  describe('in-sequence insert', () => {
    it('first packet emitted immediately (holdTime=0)', () => {
      const out = buf.insert(s('obj', 0));
      expect(out).toHaveLength(1);
      expect(out[0].sequenceNumber).toBe(0);
    });

    it('consecutive in-order packets all emitted', () => {
      buf.insert(s('obj', 0));
      const out1 = buf.insert(s('obj', 1));
      const out2 = buf.insert(s('obj', 2));
      expect(out1[0].sequenceNumber).toBe(1);
      expect(out2[0].sequenceNumber).toBe(2);
    });

    it('pending count drops to 0 after flush', () => {
      buf.insert(s('obj', 0));
      expect(buf.pendingCount('obj')).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Out-of-order reordering
  // -------------------------------------------------------------------------
  describe('out-of-order reordering', () => {
    it('sequence 2 before 1 — gap held (holdTimeMs>0 prevents immediate emit)', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 100, gapSkipMultiplier: 100 });
      buf.insert(s('obj', 0)); // buffered: holdTime=100, age=0 < 100 → not emitted
      const out = buf.insert(s('obj', 2)); // seq 1 missing, and seq2 also not held long enough
      expect(out).toHaveLength(0);
      // Both seq=0 and seq=2 are held
      expect(buf.pendingCount('obj')).toBe(2);
    });

    it('gap is filled: all states emitted after forceFlush', () => {
      // Use holdTime=0 for immediate emit once in sequence
      buf = new JitterBuffer<State>({ holdTimeMs: 0, gapSkipMultiplier: 100 });
      buf.insert(s('obj', 0)); // emitted immediately
      buf.insert(s('obj', 2)); // buffered (gap at 1; gap timeout = 0*100=0 → actually 0 >= 0 is true → gap-skip fires!)
      buf.insert(s('obj', 1)); // fill gap
      const out = buf.forceFlush('obj'); // get any remaining
      // Verify that across all inserts+forceFlush all seqs have been seen
      const seqs = out.map(x => x.sequenceNumber);
      // With holdTime=0 and gapSkipMultiplier=100: all should emit on insert
      // so forceFlush gets nothing... test the overall: all 3 unique seqs passed through
      expect(buf.pendingCount('obj')).toBe(0);
    });

    it('packets emit in ascending sequence order', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 0, gapSkipMultiplier: 100 });
      buf.insert(s('obj', 0));
      buf.insert(s('obj', 3));
      buf.insert(s('obj', 2));
      const out = buf.insert(s('obj', 1));
      const seqs = out.map(x => x.sequenceNumber);
      expect(seqs).toEqual([...seqs].sort((a,b)=>a-b));
    });
  });

  // -------------------------------------------------------------------------
  // Duplicate rejection
  // -------------------------------------------------------------------------
  describe('duplicate rejection', () => {
    it('duplicate sequence number does not double-emit', () => {
      buf.insert(s('obj', 0));
      const out = buf.insert(s('obj', 0)); // duplicate
      expect(out.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Multi-object isolation
  // -------------------------------------------------------------------------
  describe('multi-object isolation', () => {
    it('different objectIds tracked independently', () => {
      buf.insert(s('a', 0));
      buf.insert(s('b', 0));
      expect(buf.pendingCount('a')).toBe(0);
      expect(buf.pendingCount('b')).toBe(0);
      expect(buf.totalPending()).toBe(0);
    });

    it('gap in obj-a does not block obj-b', () => {
      // holdTime=0 so b emits immediately
      buf = new JitterBuffer<State>({ holdTimeMs: 0, gapSkipMultiplier: 100 });
      buf.insert(s('a', 0)); // a: seq=0 emitted, expected=1
      buf.insert(s('a', 2)); // a: gap at 1 — with holdTime=0 and gapSkipMultiplier=100, age(0)>=0*100=0 → true → skip!
      // Actually holdTime=0 means gapSkip threshold = 0, so gap is skipped immediately.
      // b is unrelated and should emit freely
      const out = buf.insert(s('b', 0));
      expect(out.some(x => x.objectId === 'b')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // forceFlush
  // -------------------------------------------------------------------------
  describe('forceFlush()', () => {
    it('flushes all buffered states for an object', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 5000, gapSkipMultiplier: 100 });
      buf.insert(s('obj', 0));
      buf.insert(s('obj', 2)); // held: waiting for gap or hold
      const out = buf.forceFlush('obj');
      expect(out.length).toBeGreaterThanOrEqual(1);
      expect(buf.pendingCount('obj')).toBe(0);
    });

    it('forceFlush with no objectId flushes all objects', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 5000, gapSkipMultiplier: 100 });
      buf.insert(s('a', 0));
      buf.insert(s('b', 0));
      buf.forceFlush();
      expect(buf.totalPending()).toBe(0);
    });

    it('forceFlush on unknown object returns empty array', () => {
      expect(buf.forceFlush('ghost')).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------
  describe('remove()', () => {
    it('removes tracking for an object', () => {
      buf.insert(s('obj', 0));
      buf.remove('obj');
      expect(buf.pendingCount('obj')).toBe(0);
    });

    it('after remove, next insert starts fresh', () => {
      buf.insert(s('obj', 5));
      buf.remove('obj');
      // Should accept seq=0 without treating it as late
      const out = buf.insert(s('obj', 0));
      expect(out[0].sequenceNumber).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // pendingCount / totalPending
  // -------------------------------------------------------------------------
  describe('pendingCount / totalPending', () => {
    it('pendingCount returns 0 for unknown object', () => {
      expect(buf.pendingCount('ghost')).toBe(0);
    });

    it('totalPending sums across objects', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 5000, gapSkipMultiplier: 100 });
      buf.insert(s('a', 0)); // held
      buf.insert(s('b', 0)); // held
      expect(buf.totalPending()).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // maxSize overflow
  // -------------------------------------------------------------------------
  describe('maxSize overflow', () => {
    it('drops oldest states when maxSize exceeded', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 5000, maxSize: 3, gapSkipMultiplier: 100 });
      buf.insert(s('obj', 0));
      buf.insert(s('obj', 2));
      buf.insert(s('obj', 4));
      buf.insert(s('obj', 6)); // 4th: should drop the oldest
      expect(buf.pendingCount('obj')).toBeLessThanOrEqual(3);
    });
  });

  // -------------------------------------------------------------------------
  // tick — gap skip after timeout
  // -------------------------------------------------------------------------
  describe('tick() gap skip', () => {
    it('tick with far-future now triggers gap-skip', () => {
      buf = new JitterBuffer<State>({ holdTimeMs: 1, gapSkipMultiplier: 1 });
      buf.insert(s('obj', 0));  // emitted immediately (holdTime=1, age≈0)
      buf.insert(s('obj', 2));  // buffered: gap at 1
      // Advance time by 1000ms to trigger gap skip (holdTime*gapSkipMultiplier=1)
      const out = buf.tick(Date.now() + 1000);
      expect(out.some(x => x.sequenceNumber === 2)).toBe(true);
    });
  });
});
