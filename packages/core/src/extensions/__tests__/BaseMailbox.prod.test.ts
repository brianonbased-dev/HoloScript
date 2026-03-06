/**
 * BaseMailbox — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { BaseMailbox } from '../BaseMailbox';

function makeBox<T = string>(maxSize?: number) { return new BaseMailbox<T>({ maxSize }); }

describe('BaseMailbox — construction', () => {
  it('starts empty', () => { expect(makeBox().isEmpty()).toBe(true); });
  it('size() returns 0 initially', () => { expect(makeBox().size()).toBe(0); });
  it('peek() returns undefined initially', () => { expect(makeBox().peek()).toBeUndefined(); });
  it('dequeue() returns undefined when empty', () => { expect(makeBox().dequeue()).toBeUndefined(); });
});

describe('BaseMailbox — enqueue / dequeue', () => {
  it('enqueue increases size', () => {
    const b = makeBox(); b.enqueue('a');
    expect(b.size()).toBe(1); expect(b.isEmpty()).toBe(false);
  });
  it('dequeue returns the message', () => {
    const b = makeBox(); b.enqueue('hello');
    expect(b.dequeue()).toBe('hello');
    expect(b.isEmpty()).toBe(true);
  });
  it('peek does not remove the message', () => {
    const b = makeBox(); b.enqueue('q');
    b.peek(); expect(b.size()).toBe(1);
  });
  it('FIFO within same priority', () => {
    const b = makeBox();
    b.enqueue('first', 'normal'); b.enqueue('second', 'normal');
    expect(b.dequeue()).toBe('first'); expect(b.dequeue()).toBe('second');
  });
});

describe('BaseMailbox — priority ordering', () => {
  it('high-priority message dequeued before normal', () => {
    const b = makeBox();
    b.enqueue('normal', 'normal'); b.enqueue('urgent', 'high');
    expect(b.dequeue()).toBe('urgent');
  });
  it('normal before low-priority', () => {
    const b = makeBox();
    b.enqueue('low', 'low'); b.enqueue('normal', 'normal');
    expect(b.dequeue()).toBe('normal');
  });
  it('high > normal > low ordering', () => {
    const b = makeBox();
    b.enqueue('low', 'low'); b.enqueue('high', 'high'); b.enqueue('normal', 'normal');
    expect(b.dequeue()).toBe('high');
    expect(b.dequeue()).toBe('normal');
    expect(b.dequeue()).toBe('low');
  });
});

describe('BaseMailbox — stats', () => {
  it('stats reflects priority breakdown', () => {
    const b = makeBox();
    b.enqueue('h', 'high'); b.enqueue('n', 'normal'); b.enqueue('l', 'low');
    const s = b.stats();
    expect(s.size).toBe(3);
    expect(s.highPriority).toBe(1); expect(s.normalPriority).toBe(1); expect(s.lowPriority).toBe(1);
  });
  it('stats empty gives all zeros', () => {
    const s = makeBox().stats();
    expect(s.size).toBe(0); expect(s.highPriority).toBe(0);
  });
});

describe('BaseMailbox — getAll / clear', () => {
  it('getAll returns all messages', () => {
    const b = makeBox();
    b.enqueue('a'); b.enqueue('b');
    expect(b.getAll()).toHaveLength(2);
  });
  it('getAll does not mutate queue', () => {
    const b = makeBox(); b.enqueue('x');
    b.getAll(); expect(b.size()).toBe(1);
  });
  it('clear empties the queue', () => {
    const b = makeBox(); b.enqueue('a'); b.enqueue('b'); b.clear();
    expect(b.isEmpty()).toBe(true); expect(b.size()).toBe(0);
  });
});

describe('BaseMailbox — maxSize eviction', () => {
  it('does not exceed maxSize', () => {
    const b = makeBox(3);
    b.enqueue('a', 'normal'); b.enqueue('b', 'normal'); b.enqueue('c', 'normal');
    b.enqueue('d', 'normal'); // should evict
    expect(b.size()).toBe(3);
  });
  it('evicts low-priority message first to make room for incoming', () => {
    const b = makeBox(2);
    b.enqueue('low', 'low'); b.enqueue('mid', 'normal');
    b.enqueue('new', 'high'); // should evict 'low' (lowPrio)
    const all = b.getAll();
    expect(all).not.toContain('low');
    expect(all).toContain('new');
  });
  it('maxSize=1 keeps only 1 message', () => {
    const b = makeBox(1);
    b.enqueue('first', 'normal'); b.enqueue('second', 'high');
    expect(b.size()).toBe(1);
  });
});
