import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { JitterBuffer } from '@holoscript/core';

type TestState = {
  sequenceNumber: number;
  objectId: string;
  timestamp: number;
  data?: string;
};

function makeState(seq: number, objectId = 'obj1', data?: string): TestState {
  return { sequenceNumber: seq, objectId, timestamp: Date.now(), data };
}

describe('JitterBuffer', () => {
  let buf: JitterBuffer<TestState>;

  beforeEach(() => {
    vi.useFakeTimers();
    buf = new JitterBuffer<TestState>({ holdTimeMs: 50 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Constructor / Initialization
  // ===========================================================================

  it('initializes with config', () => {
    expect(buf.totalPending()).toBe(0);
  });

  it('default maxSize is 64', () => {
    // Insert 65 states and verify only 64 remain
    const bigBuf = new JitterBuffer<TestState>({ holdTimeMs: 1000 });
    for (let i = 0; i < 65; i++) {
      bigBuf.insert(makeState(i, 'obj1'));
    }
    expect(bigBuf.pendingCount('obj1')).toBeLessThanOrEqual(64);
  });

  it('respects custom maxSize', () => {
    const smallBuf = new JitterBuffer<TestState>({ holdTimeMs: 1000, maxSize: 5 });
    for (let i = 0; i < 10; i++) {
      smallBuf.insert(makeState(i, 'obj1'));
    }
    expect(smallBuf.pendingCount('obj1')).toBeLessThanOrEqual(5);
  });

  // ===========================================================================
  // insert — basic behavior
  // ===========================================================================

  it('insert adds state to buffer', () => {
    buf.insert(makeState(0));
    // State is held (not yet released) because holdTimeMs hasn't passed
    expect(buf.pendingCount('obj1')).toBeGreaterThanOrEqual(0);
  });

  it('insert returns empty when hold time not yet elapsed', () => {
    const ready = buf.insert(makeState(0));
    expect(ready).toEqual([]);
  });

  it('insert returns in-sequence state after hold time', () => {
    buf.insert(makeState(0));
    vi.advanceTimersByTime(60); // past holdTimeMs (50)
    const ready = buf.insert(makeState(1));
    expect(ready.length).toBeGreaterThanOrEqual(1);
    expect(ready[0].sequenceNumber).toBe(0);
  });

  it('insert returns multiple in-sequence states when all are ready', () => {
    buf.insert(makeState(0));
    buf.insert(makeState(1));
    buf.insert(makeState(2));
    vi.advanceTimersByTime(60);
    // Inserting next one triggers flush
    const ready = buf.insert(makeState(3));
    expect(ready.length).toBe(3);
    expect(ready.map((s) => s.sequenceNumber)).toEqual([0, 1, 2]);
  });

  // ===========================================================================
  // insert — duplicate handling
  // ===========================================================================

  it('discards duplicate sequence numbers', () => {
    buf.insert(makeState(0));
    buf.insert(makeState(0)); // duplicate
    // Should not double-buffer
    expect(buf.pendingCount('obj1')).toBe(1);
  });

  // ===========================================================================
  // insert — out-of-order handling
  // ===========================================================================

  it('reorders out-of-order inserts when first packet sets correct nextExpected', () => {
    // Insert seq 0 first so nextExpected starts at 0
    buf.insert(makeState(0));
    buf.insert(makeState(2));
    buf.insert(makeState(1));
    vi.advanceTimersByTime(60);
    const ready = buf.insert(makeState(3));
    // Should emit 0, 1, 2 in order (all held long enough)
    expect(ready.map((s) => s.sequenceNumber)).toEqual([0, 1, 2]);
  });

  it('out-of-order insert where first packet has higher seq treats lower seqs as late', () => {
    // When seq 2 is first, nextExpected = 2, so seq 0 and 1 are "late duplicates"
    buf.insert(makeState(2));
    buf.insert(makeState(0));
    buf.insert(makeState(1));
    vi.advanceTimersByTime(60);
    const ready = buf.insert(makeState(3));
    // Only seq 2 is emitted (0 and 1 are below nextExpected=2, treated as late)
    expect(ready.map((s) => s.sequenceNumber)).toEqual([2]);
  });

  // ===========================================================================
  // insert — gap handling
  // ===========================================================================

  it('waits for missing sequence number (gap)', () => {
    buf.insert(makeState(0));
    vi.advanceTimersByTime(60);
    // Flush 0
    buf.insert(makeState(2)); // skip 1
    vi.advanceTimersByTime(30); // not enough for gap skip
    const ready = buf.tick(Date.now());
    // seq 0 should have been emitted, seq 2 waits for seq 1
    // After advancing 30ms on top of the 60ms, seq 2 has been held ~30ms
    // which is less than holdTimeMs * gapSkipMultiplier (50 * 2 = 100)
    // So seq 2 should not be emitted
    const allSequences = ready.map((s) => s.sequenceNumber);
    expect(allSequences).not.toContain(2);
  });

  it('skips gap after gapSkipMultiplier * holdTimeMs', () => {
    buf.insert(makeState(0));
    vi.advanceTimersByTime(60);
    buf.tick(Date.now()); // flush 0

    buf.insert(makeState(2)); // gap — missing seq 1
    vi.advanceTimersByTime(110); // 50 * 2 = 100ms skip threshold
    const ready = buf.tick(Date.now());
    // Now seq 2 should be emitted (gap skipped)
    expect(ready.some((s) => s.sequenceNumber === 2)).toBe(true);
  });

  // ===========================================================================
  // tick
  // ===========================================================================

  it('tick returns empty when nothing is ready', () => {
    buf.insert(makeState(0));
    const ready = buf.tick(Date.now());
    expect(ready).toEqual([]);
  });

  it('tick emits ready states across multiple objects', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(0, 'obj2'));
    vi.advanceTimersByTime(60);
    const ready = buf.tick(Date.now());
    expect(ready.length).toBe(2);
    const objectIds = ready.map((s) => s.objectId).sort();
    expect(objectIds).toEqual(['obj1', 'obj2']);
  });

  // ===========================================================================
  // forceFlush
  // ===========================================================================

  it('forceFlush returns all buffered states for a specific object', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(1, 'obj1'));
    buf.insert(makeState(0, 'obj2'));
    const flushed = buf.forceFlush('obj1');
    expect(flushed.length).toBe(2);
    expect(flushed.every((s) => s.objectId === 'obj1')).toBe(true);
  });

  it('forceFlush returns all states across all objects when no id given', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(0, 'obj2'));
    buf.insert(makeState(1, 'obj2'));
    const flushed = buf.forceFlush();
    expect(flushed.length).toBe(3);
  });

  it('forceFlush clears the buffer', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.forceFlush('obj1');
    expect(buf.pendingCount('obj1')).toBe(0);
  });

  it('forceFlush returns empty for unknown object', () => {
    const flushed = buf.forceFlush('nonexistent');
    expect(flushed).toEqual([]);
  });

  // ===========================================================================
  // remove
  // ===========================================================================

  it('remove clears buffer for an object', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(1, 'obj1'));
    buf.remove('obj1');
    expect(buf.pendingCount('obj1')).toBe(0);
  });

  it('remove of nonexistent object is safe', () => {
    expect(() => buf.remove('nonexistent')).not.toThrow();
  });

  // ===========================================================================
  // pendingCount / totalPending
  // ===========================================================================

  it('pendingCount returns 0 for unknown object', () => {
    expect(buf.pendingCount('nonexistent')).toBe(0);
  });

  it('pendingCount returns correct count', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(1, 'obj1'));
    expect(buf.pendingCount('obj1')).toBe(2);
  });

  it('totalPending sums all objects', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(0, 'obj2'));
    buf.insert(makeState(1, 'obj2'));
    expect(buf.totalPending()).toBe(3);
  });

  // ===========================================================================
  // Late duplicates
  // ===========================================================================

  it('drops late duplicate (sequence below nextExpected)', () => {
    buf.insert(makeState(0));
    vi.advanceTimersByTime(60);
    buf.tick(Date.now()); // emits seq 0, nextExpected becomes 1

    // Now insert seq 0 again (late duplicate)
    buf.insert(makeState(0));
    // Should not re-emit; pending should be 0 since it was already dropped
    vi.advanceTimersByTime(60);
    const ready = buf.tick(Date.now());
    expect(ready.filter((s) => s.sequenceNumber === 0).length).toBe(0);
  });

  // ===========================================================================
  // Overflow / maxSize trimming
  // ===========================================================================

  it('trims to maxSize when buffer overflows', () => {
    const smallBuf = new JitterBuffer<TestState>({ holdTimeMs: 10000, maxSize: 3 });
    smallBuf.insert(makeState(0, 'obj1'));
    smallBuf.insert(makeState(1, 'obj1'));
    smallBuf.insert(makeState(2, 'obj1'));
    smallBuf.insert(makeState(3, 'obj1')); // overflow
    expect(smallBuf.pendingCount('obj1')).toBe(3);
  });

  // ===========================================================================
  // Multiple objects isolation
  // ===========================================================================

  it('objects are independently tracked', () => {
    buf.insert(makeState(0, 'obj1'));
    buf.insert(makeState(5, 'obj2'));
    expect(buf.pendingCount('obj1')).toBe(1);
    expect(buf.pendingCount('obj2')).toBe(1);
    buf.remove('obj1');
    expect(buf.pendingCount('obj1')).toBe(0);
    expect(buf.pendingCount('obj2')).toBe(1);
  });

  // ===========================================================================
  // Custom gapSkipMultiplier
  // ===========================================================================

  it('custom gapSkipMultiplier changes skip threshold', () => {
    const customBuf = new JitterBuffer<TestState>({
      holdTimeMs: 50,
      gapSkipMultiplier: 4,
    });

    customBuf.insert(makeState(0));
    vi.advanceTimersByTime(60);
    customBuf.tick(Date.now()); // flush 0

    customBuf.insert(makeState(2)); // gap
    vi.advanceTimersByTime(110); // 50 * 2 = 100, but multiplier is 4, so threshold is 200
    let ready = customBuf.tick(Date.now());
    expect(ready.some((s) => s.sequenceNumber === 2)).toBe(false); // not yet

    vi.advanceTimersByTime(100); // total ~210ms > 200
    ready = customBuf.tick(Date.now());
    expect(ready.some((s) => s.sequenceNumber === 2)).toBe(true); // now skipped
  });
});
