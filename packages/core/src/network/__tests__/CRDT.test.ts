import { describe, it, expect, beforeEach } from 'vitest';
import { LWWRegister, PNCounter, ORSet, isCRDT } from '../CRDT';

// =============================================================================
// LWWRegister
// =============================================================================

describe('LWWRegister', () => {
  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------

  it('initializes with value and default timestamp', () => {
    const reg = new LWWRegister('hello');
    expect(reg.value).toBe('hello');
    expect(reg.timestamp).toBeGreaterThan(0);
  });

  it('initializes with explicit timestamp', () => {
    const reg = new LWWRegister(42, 1000);
    expect(reg.value).toBe(42);
    expect(reg.timestamp).toBe(1000);
  });

  it('initializes with null value', () => {
    const reg = new LWWRegister(null, 100);
    expect(reg.value).toBeNull();
  });

  it('initializes with undefined value', () => {
    const reg = new LWWRegister(undefined, 100);
    expect(reg.value).toBeUndefined();
  });

  it('initializes with complex object value', () => {
    const obj = { x: 1, y: 2, nested: { z: 3 } };
    const reg = new LWWRegister(obj, 100);
    expect(reg.value).toEqual(obj);
  });

  // ---------------------------------------------------------------------------
  // Merge — newer timestamp wins
  // ---------------------------------------------------------------------------

  it('merge updates value when other has newer timestamp', () => {
    const reg1 = new LWWRegister('a', 100);
    const reg2 = new LWWRegister('b', 200);
    reg1.merge(reg2);
    expect(reg1.value).toBe('b');
    expect(reg1.timestamp).toBe(200);
  });

  it('merge keeps value when other has older timestamp', () => {
    const reg1 = new LWWRegister('a', 200);
    const reg2 = new LWWRegister('b', 100);
    reg1.merge(reg2);
    expect(reg1.value).toBe('a');
    expect(reg1.timestamp).toBe(200);
  });

  // ---------------------------------------------------------------------------
  // Merge — equal timestamp (deterministic tiebreak)
  // ---------------------------------------------------------------------------

  it('merge with equal timestamp uses lexical tiebreak — larger value wins', () => {
    const reg1 = new LWWRegister('a', 100);
    const reg2 = new LWWRegister('b', 100);
    reg1.merge(reg2);
    // JSON.stringify("b") > JSON.stringify("a"), so "b" wins
    expect(reg1.value).toBe('b');
  });

  it('merge with equal timestamp keeps current if current is lexically larger', () => {
    const reg1 = new LWWRegister('z', 100);
    const reg2 = new LWWRegister('a', 100);
    reg1.merge(reg2);
    // JSON.stringify("a") < JSON.stringify("z"), so "z" stays
    expect(reg1.value).toBe('z');
  });

  it('merge with equal timestamp and identical values is a no-op', () => {
    const reg1 = new LWWRegister('same', 100);
    const reg2 = new LWWRegister('same', 100);
    reg1.merge(reg2);
    expect(reg1.value).toBe('same');
    expect(reg1.timestamp).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // Merge with numeric values
  // ---------------------------------------------------------------------------

  it('merge with numeric values respects timestamp', () => {
    const reg1 = new LWWRegister(10, 100);
    const reg2 = new LWWRegister(20, 200);
    reg1.merge(reg2);
    expect(reg1.value).toBe(20);
  });

  // ---------------------------------------------------------------------------
  // Merge commutativity
  // ---------------------------------------------------------------------------

  it('merge is commutative (same result regardless of merge order)', () => {
    const reg1a = new LWWRegister('a', 100);
    const reg2a = new LWWRegister('b', 200);
    reg1a.merge(reg2a);

    const reg1b = new LWWRegister('b', 200);
    const reg2b = new LWWRegister('a', 100);
    reg1b.merge(reg2b);

    expect(reg1a.value).toBe(reg1b.value);
    expect(reg1a.timestamp).toBe(reg1b.timestamp);
  });

  // ---------------------------------------------------------------------------
  // Merge with zero timestamp
  // ---------------------------------------------------------------------------

  it('merge with zero timestamps uses tiebreak', () => {
    const reg1 = new LWWRegister('a', 0);
    const reg2 = new LWWRegister('b', 0);
    reg1.merge(reg2);
    expect(reg1.value).toBe('b');
  });
});

// =============================================================================
// PNCounter
// =============================================================================

describe('PNCounter', () => {
  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------

  it('initializes with zero value by default', () => {
    const counter = new PNCounter();
    expect(counter.value()).toBe(0);
  });

  it('initializes with provided increments', () => {
    const counter = new PNCounter({ actor1: 5 });
    expect(counter.value()).toBe(5);
  });

  it('initializes with provided decrements', () => {
    const counter = new PNCounter(undefined, { actor1: 3 });
    expect(counter.value()).toBe(-3);
  });

  it('initializes with both increments and decrements', () => {
    const counter = new PNCounter({ a: 10 }, { a: 3 });
    expect(counter.value()).toBe(7);
  });

  it('initializes with multiple actors', () => {
    const counter = new PNCounter({ a: 5, b: 3 }, { a: 1, b: 2 });
    // (5+3) - (1+2) = 5
    expect(counter.value()).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // Increment
  // ---------------------------------------------------------------------------

  it('increment increases value', () => {
    const counter = new PNCounter();
    counter.increment('a');
    expect(counter.value()).toBe(1);
  });

  it('increment by custom amount', () => {
    const counter = new PNCounter();
    counter.increment('a', 5);
    expect(counter.value()).toBe(5);
  });

  it('increment uses Math.abs for negative amounts', () => {
    const counter = new PNCounter();
    counter.increment('a', -3);
    expect(counter.value()).toBe(3);
  });

  it('multiple increments accumulate', () => {
    const counter = new PNCounter();
    counter.increment('a', 3);
    counter.increment('a', 2);
    expect(counter.value()).toBe(5);
  });

  it('increments from different actors accumulate', () => {
    const counter = new PNCounter();
    counter.increment('a', 3);
    counter.increment('b', 4);
    expect(counter.value()).toBe(7);
  });

  // ---------------------------------------------------------------------------
  // Decrement
  // ---------------------------------------------------------------------------

  it('decrement decreases value', () => {
    const counter = new PNCounter();
    counter.decrement('a');
    expect(counter.value()).toBe(-1);
  });

  it('decrement by custom amount', () => {
    const counter = new PNCounter();
    counter.decrement('a', 5);
    expect(counter.value()).toBe(-5);
  });

  it('decrement uses Math.abs for negative amounts', () => {
    const counter = new PNCounter();
    counter.decrement('a', -3);
    expect(counter.value()).toBe(-3);
  });

  // ---------------------------------------------------------------------------
  // Increment + Decrement
  // ---------------------------------------------------------------------------

  it('increment and decrement cancel out', () => {
    const counter = new PNCounter();
    counter.increment('a', 5);
    counter.decrement('a', 5);
    expect(counter.value()).toBe(0);
  });

  it('counter can go negative', () => {
    const counter = new PNCounter();
    counter.increment('a', 2);
    counter.decrement('a', 5);
    expect(counter.value()).toBe(-3);
  });

  // ---------------------------------------------------------------------------
  // Merge
  // ---------------------------------------------------------------------------

  it('merge takes max of each actor counter', () => {
    const c1 = new PNCounter({ a: 5 });
    const c2 = new PNCounter({ a: 3 });
    c1.merge(c2);
    expect(c1.value()).toBe(5); // max(5,3) = 5
  });

  it('merge combines counters from different actors', () => {
    const c1 = new PNCounter({ a: 5 });
    const c2 = new PNCounter({ b: 3 });
    c1.merge(c2);
    expect(c1.value()).toBe(8); // 5 + 3
  });

  it('merge handles decrement counters', () => {
    const c1 = new PNCounter({ a: 10 }, { a: 2 });
    const c2 = new PNCounter({ a: 8 }, { a: 5 });
    c1.merge(c2);
    // p: max(10,8)=10, n: max(2,5)=5 → 10-5 = 5
    expect(c1.value()).toBe(5);
  });

  it('merge is commutative', () => {
    const c1a = new PNCounter({ a: 5, b: 3 });
    const c2a = new PNCounter({ a: 7, c: 1 });
    c1a.merge(c2a);

    const c1b = new PNCounter({ a: 7, c: 1 });
    const c2b = new PNCounter({ a: 5, b: 3 });
    c1b.merge(c2b);

    expect(c1a.value()).toBe(c1b.value());
  });

  it('merge is idempotent', () => {
    const c1 = new PNCounter({ a: 5 });
    const c2 = new PNCounter({ a: 3 });
    c1.merge(c2);
    const val1 = c1.value();
    c1.merge(c2);
    expect(c1.value()).toBe(val1);
  });

  it('merge with empty counter is identity', () => {
    const c1 = new PNCounter({ a: 5 }, { a: 2 });
    const c2 = new PNCounter();
    const before = c1.value();
    c1.merge(c2);
    expect(c1.value()).toBe(before);
  });
});

// =============================================================================
// ORSet
// =============================================================================

describe('ORSet', () => {
  let set: ORSet<string>;

  beforeEach(() => {
    set = new ORSet<string>();
  });

  // ---------------------------------------------------------------------------
  // Constructor / Initialization
  // ---------------------------------------------------------------------------

  it('initializes empty', () => {
    expect(set.value()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Add
  // ---------------------------------------------------------------------------

  it('add inserts an element', () => {
    set.add('hello', 'id1');
    expect(set.value()).toContain('hello');
  });

  it('add same element with different IDs does not duplicate in value', () => {
    set.add('hello', 'id1');
    set.add('hello', 'id2');
    const val = set.value();
    expect(val.filter(v => v === 'hello').length).toBe(1);
  });

  it('add multiple different elements', () => {
    set.add('a', 'id1');
    set.add('b', 'id2');
    set.add('c', 'id3');
    const val = set.value();
    expect(val).toContain('a');
    expect(val).toContain('b');
    expect(val).toContain('c');
    expect(val.length).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Remove
  // ---------------------------------------------------------------------------

  it('remove deletes an element', () => {
    set.add('hello', 'id1');
    set.remove('hello');
    expect(set.value()).not.toContain('hello');
    expect(set.value().length).toBe(0);
  });

  it('remove only removes existing observations (add-wins semantics)', () => {
    set.add('hello', 'id1');
    set.remove('hello');
    // Re-add after remove — should appear again (new observation)
    set.add('hello', 'id2');
    expect(set.value()).toContain('hello');
  });

  it('remove of nonexistent element is no-op', () => {
    set.add('a', 'id1');
    set.remove('b');
    expect(set.value()).toEqual(['a']);
  });

  it('remove all observations of an element', () => {
    set.add('x', 'id1');
    set.add('x', 'id2');
    set.remove('x');
    expect(set.value()).not.toContain('x');
  });

  // ---------------------------------------------------------------------------
  // Merge
  // ---------------------------------------------------------------------------

  it('merge combines two sets', () => {
    const set2 = new ORSet<string>();
    set.add('a', 'id1');
    set2.add('b', 'id2');
    set.merge(set2);
    const val = set.value();
    expect(val).toContain('a');
    expect(val).toContain('b');
  });

  it('merge preserves remove information', () => {
    const set2 = new ORSet<string>();
    set.add('a', 'id1');
    set2.add('a', 'id1');
    set2.remove('a');
    set.merge(set2);
    // The remove from set2 should remove the observation with id1
    expect(set.value()).not.toContain('a');
  });

  it('merge is commutative', () => {
    const s1 = new ORSet<string>();
    const s2 = new ORSet<string>();
    s1.add('a', 'id1');
    s2.add('b', 'id2');

    const s1copy = new ORSet<string>();
    s1copy.add('a', 'id1');
    const s2copy = new ORSet<string>();
    s2copy.add('b', 'id2');

    s1.merge(s2);
    s2copy.merge(s1copy);

    expect(s1.value().sort()).toEqual(s2copy.value().sort());
  });

  it('merge with empty set is identity', () => {
    set.add('a', 'id1');
    const empty = new ORSet<string>();
    set.merge(empty);
    expect(set.value()).toEqual(['a']);
  });

  // ---------------------------------------------------------------------------
  // Numeric elements
  // ---------------------------------------------------------------------------

  it('works with numeric elements', () => {
    const numSet = new ORSet<number>();
    numSet.add(1, 'id1');
    numSet.add(2, 'id2');
    numSet.add(3, 'id3');
    expect(numSet.value().sort()).toEqual([1, 2, 3]);
    numSet.remove(2);
    expect(numSet.value().sort()).toEqual([1, 3]);
  });

  // ---------------------------------------------------------------------------
  // Object elements
  // ---------------------------------------------------------------------------

  it('works with object elements (uses JSON comparison)', () => {
    const objSet = new ORSet<{ name: string }>();
    objSet.add({ name: 'alice' }, 'id1');
    objSet.add({ name: 'bob' }, 'id2');
    expect(objSet.value().length).toBe(2);
    objSet.remove({ name: 'alice' });
    expect(objSet.value().length).toBe(1);
    expect(objSet.value()[0].name).toBe('bob');
  });
});

// =============================================================================
// isCRDT type guard
// =============================================================================

describe('isCRDT', () => {
  it('returns true for LWWRegister', () => {
    expect(isCRDT(new LWWRegister('x'))).toBe(true);
  });

  it('returns true for PNCounter', () => {
    expect(isCRDT(new PNCounter())).toBe(true);
  });

  it('returns true for ORSet', () => {
    expect(isCRDT(new ORSet())).toBe(true);
  });

  it('returns true for any object with a merge function', () => {
    expect(isCRDT({ merge: () => {} })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isCRDT(null)).toBeFalsy();
  });

  it('returns false for undefined', () => {
    expect(isCRDT(undefined)).toBeFalsy();
  });

  it('returns false for plain object without merge', () => {
    expect(isCRDT({ value: 42 })).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isCRDT(42)).toBe(false);
    expect(isCRDT('string')).toBe(false);
    expect(isCRDT(true)).toBe(false);
  });

  it('returns false when merge is not a function', () => {
    expect(isCRDT({ merge: 'not a function' })).toBe(false);
  });
});
