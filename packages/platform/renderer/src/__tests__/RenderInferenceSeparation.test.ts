import { describe, it, expect, vi } from 'vitest';
import {
  RenderSafeInferenceReader,
  InferenceIsolationBarrier,
  FrameDeadlineEnforcer,
  InferencePriorityScheduler,
  type InferenceTask,
} from '../RenderInferenceSeparation';

describe('RenderSafeInferenceReader', () => {
  it('buffers and drains results', () => {
    const reader = new RenderSafeInferenceReader<number>();
    reader.push({ taskId: 'a', output: 1, startedAt: 0, finishedAt: 1 });
    reader.push({ taskId: 'b', output: 2, startedAt: 1, finishedAt: 2 });

    expect(reader.bufferedCount).toBe(2);
    const drained = reader.drain();
    expect(drained.length).toBe(2);
    expect(reader.bufferedCount).toBe(0);
  });

  it('drops oldest under back-pressure', () => {
    const reader = new RenderSafeInferenceReader<number>({ maxBufferedResults: 2 });
    reader.push({ taskId: 'a', output: 1, startedAt: 0, finishedAt: 1 });
    reader.push({ taskId: 'b', output: 2, startedAt: 1, finishedAt: 2 });
    reader.push({ taskId: 'c', output: 3, startedAt: 2, finishedAt: 3 });

    const drained = reader.drain();
    expect(drained.map((r) => r.taskId)).toEqual(['b', 'c']);
  });

  it('peek does not clear buffer', () => {
    const reader = new RenderSafeInferenceReader<number>();
    reader.push({ taskId: 'a', output: 1, startedAt: 0, finishedAt: 1 });
    expect(reader.peek().length).toBe(1);
    expect(reader.bufferedCount).toBe(1);
  });
});

describe('InferenceIsolationBarrier', () => {
  it('allows entry up to maxConcurrency', () => {
    const barrier = new InferenceIsolationBarrier({ maxConcurrency: 2 });
    expect(barrier.enter('a')).toBe(true);
    expect(barrier.enter('b')).toBe(true);
    expect(barrier.enter('c')).toBe(false);
    expect(barrier.activeCount).toBe(2);
    expect(barrier.remainingSlots).toBe(0);
  });

  it('releases slot on exit', () => {
    const barrier = new InferenceIsolationBarrier({ maxConcurrency: 1 });
    barrier.enter('a');
    barrier.exit('a');
    expect(barrier.activeCount).toBe(0);
    expect(barrier.remainingSlots).toBe(1);
  });
});

describe('FrameDeadlineEnforcer', () => {
  it('computes budget from defaults', () => {
    const enforcer = new FrameDeadlineEnforcer();
    expect(enforcer.targetFrameTimeMs).toBeCloseTo(16.67, 2);
    expect(enforcer.inferenceBudgetMs).toBeCloseTo(5.0, 1);
  });

  it('records hit when under budget', () => {
    const enforcer = new FrameDeadlineEnforcer({
      targetFrameTimeMs: 20,
      inferenceBudgetRatio: 0.5,
    });
    const start = 0;
    enforcer.beginFrame(start);
    const hit = enforcer.endFrame(start, 5); // 5 ms < 10 ms budget
    expect(hit).toBe(true);
    expect(enforcer.missRate).toBe(0);
  });

  it('records miss when over budget', () => {
    const enforcer = new FrameDeadlineEnforcer({
      targetFrameTimeMs: 20,
      inferenceBudgetRatio: 0.5,
    });
    const start = 0;
    enforcer.beginFrame(start);
    const hit = enforcer.endFrame(start, 15); // 15 ms > 10 ms budget
    expect(hit).toBe(false);
    expect(enforcer.missRate).toBe(1);
  });

  it('calculates remaining budget', () => {
    const enforcer = new FrameDeadlineEnforcer({
      targetFrameTimeMs: 20,
      inferenceBudgetRatio: 0.5,
    });
    const start = 0;
    enforcer.beginFrame(start);
    expect(enforcer.remainingBudgetMs(start, 3)).toBeCloseTo(7, 1);
  });
});

describe('InferencePriorityScheduler', () => {
  it('executes synchronous tasks and drains results', () => {
    const scheduler = new InferencePriorityScheduler();
    const task: InferenceTask<unknown, number> = {
      id: 't1',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => 42,
    };
    scheduler.schedule(task);
    const started = scheduler.tick();
    expect(started).toBe(1);
    expect(scheduler.getMetrics().completed).toBe(1);

    const results = scheduler.reader.drain();
    expect(results.length).toBe(1);
    expect(results[0].output).toBe(42);
  });

  it('respects priority ordering', () => {
    const scheduler = new InferencePriorityScheduler();
    const order: string[] = [];

    scheduler.schedule({
      id: 'low',
      priority: 'low',
      input: null,
      createdAt: 0,
      execute: () => { order.push('low'); return 'low'; },
    });
    scheduler.schedule({
      id: 'critical',
      priority: 'critical',
      input: null,
      createdAt: 1,
      execute: () => { order.push('critical'); return 'critical'; },
    });

    scheduler.tick();
    expect(order).toEqual(['critical', 'low']);
  });

  it('respects concurrency limit', () => {
    const scheduler = new InferencePriorityScheduler({
      barrier: new InferenceIsolationBarrier({ maxConcurrency: 1 }),
    });

    let resolveA: (v: number) => void = () => {};
    const promiseA = new Promise<number>((r) => (resolveA = r));

    scheduler.schedule({
      id: 'a',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => promiseA,
    });
    scheduler.schedule({
      id: 'b',
      priority: 'normal',
      input: null,
      createdAt: 1,
      execute: () => 2,
    });

    const started = scheduler.tick();
    // Only 'a' starts because concurrency = 1 and it hasn't finished yet.
    expect(started).toBe(1);
    expect(scheduler.getMetrics().queueDepth).toBe(1);

    resolveA(1);
  });

  it('counts dropped tasks on clear', () => {
    const scheduler = new InferencePriorityScheduler();
    scheduler.schedule({
      id: 'x',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => 1,
    });
    scheduler.clear();
    expect(scheduler.getMetrics().dropped).toBe(1);
    expect(scheduler.getMetrics().queueDepth).toBe(0);
  });

  it('handles async task errors without crashing', async () => {
    const scheduler = new InferencePriorityScheduler();
    scheduler.schedule({
      id: 'fail',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => Promise.reject(new Error('boom')),
    });
    scheduler.tick();
    // Allow microtask queue to flush
    await new Promise((r) => setTimeout(r, 10));

    expect(scheduler.getMetrics().dropped).toBe(1);
    const results = scheduler.reader.drain();
    expect(results.length).toBe(1);
    expect(results[0].output instanceof Error).toBe(true);
  });

  it('tracks deadline miss rate when budget exhausted', () => {
    const enforcer = new FrameDeadlineEnforcer({
      targetFrameTimeMs: 10,
      inferenceBudgetRatio: 0.1, // 1 ms budget
    });
    const scheduler = new InferencePriorityScheduler({ enforcer });

    // Task takes 5 ms > 1 ms budget = miss
    scheduler.schedule({
      id: 'slow',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => {
        const start = performance.now();
        while (performance.now() - start < 5) {} // spin 5 ms
        return 'done';
      },
    });

    scheduler.tick();
    const metrics = scheduler.getMetrics();
    expect(metrics.deadlineMissRate).toBeGreaterThan(0);
    expect(metrics.completed).toBe(1);
  });

  it('does not start tasks when budget is already exhausted', () => {
    const enforcer = new FrameDeadlineEnforcer({
      targetFrameTimeMs: 10,
      inferenceBudgetRatio: 0.05, // 0.5 ms budget
    });
    const scheduler = new InferencePriorityScheduler({ enforcer });

    // Slow task consumes > budget, preventing second task from starting.
    scheduler.schedule({
      id: 'slow',
      priority: 'normal',
      input: null,
      createdAt: 0,
      execute: () => {
        const start = performance.now();
        while (performance.now() - start < 2) {} // spin 2 ms > 0.5 ms budget
        return 1;
      },
    });
    scheduler.schedule({
      id: 'fast',
      priority: 'normal',
      input: null,
      createdAt: 1,
      execute: () => 2,
    });

    const started = scheduler.tick();
    // Only the slow task starts; the fast task stays queued because
    // remaining budget is negative after the slow task completes.
    expect(started).toBe(1);
    expect(scheduler.getMetrics().queueDepth).toBe(1);
    expect(scheduler.getMetrics().deadlineMissRate).toBeGreaterThan(0);
  });
});
