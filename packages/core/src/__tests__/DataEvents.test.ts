import { describe, it, expect } from 'vitest';
import { EventChannel, ChannelManager } from '../events/EventChannel';
import { ReactiveProperty, ComputedProperty, DataBindingManager } from '../events/DataBinding';
import { CommandSystem, type Command } from '../events/CommandSystem';

describe('Cycle 149: Data-Driven Events', () => {
  // -------------------------------------------------------------------------
  // EventChannel
  // -------------------------------------------------------------------------

  it('should filter events and throttle emissions', () => {
    const ch = new EventChannel<{ type: string; value: number }>({ throttleMs: 0 });

    const received: number[] = [];
    ch.subscribe(
      (data) => received.push(data.value),
      (data) => data.type === 'damage' // Only damage events
    );

    ch.emit({ type: 'damage', value: 10 });
    ch.emit({ type: 'heal', value: 5 }); // Filtered out
    ch.emit({ type: 'damage', value: 20 });

    expect(received).toEqual([10, 20]);
    expect(ch.getEmitCount()).toBe(3);
  });

  it('should replay buffer for late subscribers', () => {
    const ch = new EventChannel<string>({ replayBufferSize: 3 });
    ch.emit('a');
    ch.emit('b');
    ch.emit('c');

    const late: string[] = [];
    ch.subscribe((v) => late.push(v));

    expect(late).toEqual(['a', 'b', 'c']); // Replayed
  });

  it('should bridge channels through ChannelManager', () => {
    const mgr = new ChannelManager();
    const src = mgr.createChannel<number>('source');
    const tgt = mgr.createChannel<number>('target');

    mgr.bridge('source', 'target', (v) => (v as number) * 2);

    const results: number[] = [];
    tgt.subscribe((v) => results.push(v));
    src.emit(5);

    expect(results).toEqual([10]);
  });

  // -------------------------------------------------------------------------
  // DataBinding
  // -------------------------------------------------------------------------

  it('should react to property changes and compute derived values', () => {
    const width = new ReactiveProperty(10);
    const height = new ReactiveProperty(5);
    const area = new ComputedProperty(
      () => width.value * height.value,
      [width as ReactiveProperty<unknown>, height as ReactiveProperty<unknown>]
    );

    expect(area.value).toBe(50);

    width.value = 20;
    expect(area.value).toBe(100);
  });

  it('should support two-way binding', () => {
    const source = new ReactiveProperty(42);
    const target = new ReactiveProperty(0);
    const mgr = new DataBindingManager();

    mgr.bind('sync', source, target, true);
    source.value = 100;
    expect(target.value).toBe(100);

    target.value = 200;
    expect(source.value).toBe(200);

    mgr.unbind('sync');
  });

  // -------------------------------------------------------------------------
  // CommandSystem
  // -------------------------------------------------------------------------

  it('should execute, undo, and redo commands', () => {
    const cs = new CommandSystem();
    let counter = 0;

    cs.execute({ id: 'c1', name: 'inc', execute: () => counter++, undo: () => counter-- });
    cs.execute({ id: 'c2', name: 'inc', execute: () => counter++, undo: () => counter-- });

    expect(counter).toBe(2);

    cs.undo();
    expect(counter).toBe(1);

    cs.redo();
    expect(counter).toBe(2);
  });

  it('should batch commands into a single undo step', () => {
    const cs = new CommandSystem();
    let val = 0;

    cs.beginBatch();
    cs.execute({ id: 'b1', name: 'add', execute: () => (val += 10), undo: () => (val -= 10) });
    cs.execute({ id: 'b2', name: 'add', execute: () => (val += 20), undo: () => (val -= 20) });
    cs.endBatch('addBoth');

    expect(val).toBe(30);
    expect(cs.getUndoStackSize()).toBe(1); // Single batch command

    cs.undo();
    expect(val).toBe(0); // Both undone at once
  });
});
