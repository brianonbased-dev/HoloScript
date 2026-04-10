import { describe, it, expect, beforeEach } from 'vitest';
import { BaseMailbox } from '../BaseMailbox';

describe('BaseMailbox', () => {
  let mailbox: BaseMailbox<string>;

  beforeEach(() => {
    mailbox = new BaseMailbox<string>();
  });

  // ---- Enqueue / Dequeue ----

  it('enqueue and dequeue returns message', () => {
    mailbox.enqueue('hello');
    expect(mailbox.dequeue()).toBe('hello');
  });

  it('dequeue returns undefined when empty', () => {
    expect(mailbox.dequeue()).toBeUndefined();
  });

  it('peek returns first without removing', () => {
    mailbox.enqueue('a');
    mailbox.enqueue('b');
    expect(mailbox.peek()).toBe('a');
    expect(mailbox.size()).toBe(2);
  });

  // ---- Priority ----

  it('high priority comes before normal', () => {
    mailbox.enqueue('normal', 'normal');
    mailbox.enqueue('high', 'high');
    expect(mailbox.dequeue()).toBe('high');
  });

  it('normal comes before low', () => {
    mailbox.enqueue('low', 'low');
    mailbox.enqueue('normal', 'normal');
    expect(mailbox.dequeue()).toBe('normal');
  });

  it('same priority preserves order', () => {
    mailbox.enqueue('first', 'normal');
    mailbox.enqueue('second', 'normal');
    expect(mailbox.dequeue()).toBe('first');
  });

  // ---- Overflow ----

  it('drops low-priority when at maxSize', () => {
    const small = new BaseMailbox<string>({ maxSize: 2 });
    small.enqueue('low1', 'low');
    small.enqueue('normal1', 'normal');
    small.enqueue('high1', 'high'); // Should drop 'low1'
    expect(small.size()).toBe(2);
    const msgs = small.getAll();
    expect(msgs).not.toContain('low1');
  });

  it('drops oldest when full with no low-priority', () => {
    const small = new BaseMailbox<string>({ maxSize: 2 });
    small.enqueue('a', 'high');
    small.enqueue('b', 'high');
    small.enqueue('c', 'high'); // Should drop 'a'
    expect(small.size()).toBe(2);
  });

  // ---- Queries ----

  it('size returns count', () => {
    mailbox.enqueue('a');
    mailbox.enqueue('b');
    expect(mailbox.size()).toBe(2);
  });

  it('isEmpty returns true when empty', () => {
    expect(mailbox.isEmpty()).toBe(true);
    mailbox.enqueue('a');
    expect(mailbox.isEmpty()).toBe(false);
  });

  it('getAll returns all messages', () => {
    mailbox.enqueue('a');
    mailbox.enqueue('b');
    expect(mailbox.getAll()).toEqual(['a', 'b']);
  });

  it('clear empties queue', () => {
    mailbox.enqueue('a');
    mailbox.enqueue('b');
    mailbox.clear();
    expect(mailbox.isEmpty()).toBe(true);
  });

  // ---- Stats ----

  it('stats returns priority breakdown', () => {
    mailbox.enqueue('h', 'high');
    mailbox.enqueue('n', 'normal');
    mailbox.enqueue('l', 'low');
    const s = mailbox.stats();
    expect(s.size).toBe(3);
    expect(s.highPriority).toBe(1);
    expect(s.normalPriority).toBe(1);
    expect(s.lowPriority).toBe(1);
  });
});
