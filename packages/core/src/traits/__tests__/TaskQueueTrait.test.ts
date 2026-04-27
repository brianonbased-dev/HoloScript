/**
 * TaskQueueTrait — comprehensive tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { taskQueueHandler, type TaskQueueConfig } from '../TaskQueueTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type QueueNode = HSPlusNode & { __taskQueueState?: any };

function makeNode(): QueueNode {
  return {} as QueueNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG: TaskQueueConfig = {
  ...(taskQueueHandler.defaultConfig as TaskQueueConfig),
};

function setup(configOverrides: Partial<TaskQueueConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: TaskQueueConfig = { ...BASE_CONFIG, ...configOverrides };
  taskQueueHandler.onAttach?.(node, config, context);
  emitted.length = 0;
  return { node, config, context, emitted };
}

function addTask(
  node: QueueNode,
  config: TaskQueueConfig,
  context: TraitContext,
  payload: Record<string, unknown>
) {
  taskQueueHandler.onEvent?.(node, config, context, {
    type: 'queue:add',
    payload,
  } as any);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// attach/defaults
// ---------------------------------------------------------------------------

describe('taskQueueHandler attach/defaults', () => {
  it('name is task_queue', () => {
    expect(taskQueueHandler.name).toBe('task_queue');
  });

  it('default max_concurrent is 1', () => {
    expect(BASE_CONFIG.max_concurrent).toBe(1);
  });

  it('default process_action is queue:process', () => {
    expect(BASE_CONFIG.process_action).toBe('queue:process');
  });

  it('creates state on attach', () => {
    const { node } = setup();
    expect(node.__taskQueueState).toBeDefined();
    expect(node.__taskQueueState.queue).toEqual([]);
    expect(node.__taskQueueState.active).toEqual([]);
  });

  it('onDetach removes state', () => {
    const { node, config, context } = setup();
    taskQueueHandler.onDetach?.(node, config, context);
    expect(node.__taskQueueState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// enqueue / dequeue / process
// ---------------------------------------------------------------------------

describe('enqueue/dequeue/process', () => {
  it('queue:add enqueues and emits queue:enqueue', () => {
    const { node, config, context, emitted } = setup({ max_concurrent: 0 });
    addTask(node, config, context, { taskId: 't1', priority: 0, data: { a: 1 } });
    expect(node.__taskQueueState.queue.length).toBe(1);
    expect(emitted.some(e => e.type === 'queue:enqueue')).toBe(true);
  });

  it('generates task id when taskId missing', () => {
    const { node, config, context, emitted } = setup({ max_concurrent: 0 });
    addTask(node, config, context, { priority: 0, data: {} });
    const ev = emitted.find(e => e.type === 'queue:enqueue');
    expect(String((ev!.payload as any).taskId)).toMatch(/^task_/);
  });

  it('immediately dequeues when slot available', () => {
    const { node, config, context, emitted } = setup({ max_concurrent: 1 });
    addTask(node, config, context, { taskId: 't1', data: { a: 1 } });
    expect(node.__taskQueueState.active.length).toBe(1);
    expect(node.__taskQueueState.queue.length).toBe(0);
    expect(emitted.some(e => e.type === 'queue:dequeue')).toBe(true);
    expect(emitted.some(e => e.type === config.process_action)).toBe(true);
  });

  it('process event payload includes taskId/data/retryCount', () => {
    const { node, config, context, emitted } = setup({ max_concurrent: 1, process_action: 'do_task' });
    addTask(node, config, context, { taskId: 't1', data: { x: 2 } });
    const ev = emitted.find(e => e.type === 'do_task');
    expect((ev!.payload as any).taskId).toBe('t1');
    expect((ev!.payload as any).data).toEqual({ x: 2 });
    expect((ev!.payload as any).retryCount).toBe(0);
  });

  it('respects max_concurrent > 1', () => {
    const { node, config, context } = setup({ max_concurrent: 2 });
    addTask(node, config, context, { taskId: 't1', data: {} });
    addTask(node, config, context, { taskId: 't2', data: {} });
    addTask(node, config, context, { taskId: 't3', data: {} });
    expect(node.__taskQueueState.active.length).toBe(2);
    expect(node.__taskQueueState.queue.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// priority behavior
// ---------------------------------------------------------------------------

describe('priority behavior', () => {
  it('higher priority dequeues first', () => {
    const { node, config, context, emitted } = setup({ max_concurrent: 1, priority_levels: 3 });
    // fill active slot with first task
    addTask(node, config, context, { taskId: 'active', priority: 0, data: {} });
    emitted.length = 0;

    addTask(node, config, context, { taskId: 'low', priority: 0, data: {} });
    addTask(node, config, context, { taskId: 'high', priority: 2, data: {} });

    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_done',
      payload: { taskId: 'active', result: 'ok' },
    } as any);

    const processEvents = emitted.filter(e => e.type === config.process_action);
    const latest = processEvents[processEvents.length - 1];
    expect((latest.payload as any).taskId).toBe('high');
  });

  it('clamps priority to [0, priority_levels-1]', () => {
    const { node, config, context } = setup({ max_concurrent: 0, priority_levels: 3 });
    addTask(node, config, context, { taskId: 'a', priority: -10, data: {} });
    addTask(node, config, context, { taskId: 'b', priority: 999, data: {} });
    const priorities = node.__taskQueueState.queue.map((t: any) => t.priority);
    expect(priorities).toContain(0);
    expect(priorities).toContain(2);
  });
});

// ---------------------------------------------------------------------------
// completion flow
// ---------------------------------------------------------------------------

describe('completion flow', () => {
  it('queue:task_done moves task active -> completed', () => {
    const { node, config, context, emitted } = setup();
    addTask(node, config, context, { taskId: 't1', data: {} });
    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_done',
      payload: { taskId: 't1', result: { ok: true } },
    } as any);
    expect(node.__taskQueueState.active.length).toBe(0);
    expect(node.__taskQueueState.completed.length).toBe(1);
    expect(node.__taskQueueState.totalProcessed).toBe(1);
    expect(emitted.some(e => e.type === 'queue:complete')).toBe(true);
  });

  it('caps completed history at 100', () => {
    const { node, config, context } = setup();
    // push 101 tasks through completion
    for (let i = 0; i < 101; i++) {
      const id = `t${i}`;
      addTask(node, config, context, { taskId: id, data: {} });
      taskQueueHandler.onEvent?.(node, config, context, {
        type: 'queue:task_done',
        payload: { taskId: id, result: i },
      } as any);
    }
    expect(node.__taskQueueState.completed.length).toBe(100);
  });

  it('ignores task_done for unknown task', () => {
    const { node, config, context } = setup();
    expect(() =>
      taskQueueHandler.onEvent?.(node, config, context, {
        type: 'queue:task_done',
        payload: { taskId: 'missing' },
      } as any)
    ).not.toThrow();
    expect(node.__taskQueueState.totalProcessed).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// failure / retry / dead-letter
// ---------------------------------------------------------------------------

describe('failure/retry/dead-letter', () => {
  it('task_failed emits queue:failed and queue:retry then re-enqueues after delay', () => {
    const { node, config, context, emitted } = setup({ max_retries: 3, retry_delay_ms: 1000 });
    addTask(node, config, context, { taskId: 't1', data: {} });

    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_failed',
      payload: { taskId: 't1', error: 'boom' },
    } as any);

    expect(emitted.some(e => e.type === 'queue:failed')).toBe(true);
    expect(emitted.some(e => e.type === 'queue:retry')).toBe(true);
    expect(node.__taskQueueState.queue.length).toBe(0);

    vi.advanceTimersByTime(1000);
    expect(node.__taskQueueState.queue.length + node.__taskQueueState.active.length).toBeGreaterThan(0);
  });

  it('retry delay uses exponential backoff', () => {
    const { node, config, context, emitted } = setup({ max_retries: 3, retry_delay_ms: 1000 });
    addTask(node, config, context, { taskId: 't1', data: {} });

    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_failed',
      payload: { taskId: 't1', error: 'boom1' },
    } as any);
    const firstRetry = emitted.find(e => e.type === 'queue:retry');
    expect((firstRetry!.payload as any).nextRetryMs).toBe(1000);

    vi.advanceTimersByTime(1000);
    // fail second attempt
    const activeTask = node.__taskQueueState.active[0];
    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_failed',
      payload: { taskId: activeTask.id, error: 'boom2' },
    } as any);
    const retries = emitted.filter(e => e.type === 'queue:retry');
    expect((retries[1].payload as any).nextRetryMs).toBe(2000);
  });

  it('sends to dead-letter after max_retries exceeded', () => {
    const { node, config, context, emitted } = setup({ max_retries: 0 });
    addTask(node, config, context, { taskId: 't1', data: {} });

    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_failed',
      payload: { taskId: 't1', error: 'fatal' },
    } as any);

    expect(node.__taskQueueState.deadLetter.length).toBe(1);
    expect(node.__taskQueueState.deadLetter[0].status).toBe('dead');
    expect(emitted.some(e => e.type === 'queue:dead_letter')).toBe(true);
  });

  it('caps dead-letter queue at dead_letter_max', () => {
    const { node, config, context } = setup({ max_retries: 0, dead_letter_max: 2 });

    for (let i = 0; i < 4; i++) {
      const id = `t${i}`;
      addTask(node, config, context, { taskId: id, data: {} });
      taskQueueHandler.onEvent?.(node, config, context, {
        type: 'queue:task_failed',
        payload: { taskId: id, error: 'fatal' },
      } as any);
    }

    expect(node.__taskQueueState.deadLetter.length).toBe(2);
  });

  it('ignores task_failed for unknown task', () => {
    const { node, config, context } = setup();
    expect(() =>
      taskQueueHandler.onEvent?.(node, config, context, {
        type: 'queue:task_failed',
        payload: { taskId: 'missing', error: 'x' },
      } as any)
    ).not.toThrow();
    expect(node.__taskQueueState.deadLetter.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// status, drain, misc
// ---------------------------------------------------------------------------

describe('status/drain/misc', () => {
  it('queue:get_status emits queue:status', () => {
    const { node, config, context, emitted } = setup({ max_concurrent: 0 });
    addTask(node, config, context, { taskId: 't1', data: {} });
    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:get_status',
      payload: {},
    } as any);
    const ev = emitted.find(e => e.type === 'queue:status');
    expect(ev).toBeDefined();
    expect((ev!.payload as any).pending).toBe(1);
  });

  it('queue:clear_dead_letter empties deadLetter', () => {
    const { node, config, context } = setup({ max_retries: 0 });
    addTask(node, config, context, { taskId: 't1', data: {} });
    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_failed',
      payload: { taskId: 't1', error: 'fatal' },
    } as any);
    expect(node.__taskQueueState.deadLetter.length).toBe(1);

    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:clear_dead_letter',
      payload: {},
    } as any);
    expect(node.__taskQueueState.deadLetter.length).toBe(0);
  });

  it('emits queue:drain when queue and active are empty', () => {
    const { node, config, context, emitted } = setup();
    addTask(node, config, context, { taskId: 't1', data: {} });
    emitted.length = 0;

    taskQueueHandler.onEvent?.(node, config, context, {
      type: 'queue:task_done',
      payload: { taskId: 't1', result: 'ok' },
    } as any);

    expect(emitted.some(e => e.type === 'queue:drain')).toBe(true);
  });

  it('onUpdate is no-op (event-driven)', () => {
    const { node, config, context } = setup();
    expect(() => taskQueueHandler.onUpdate?.(node, config, context, 0.016)).not.toThrow();
  });

  it('onEvent safe when state missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() =>
      taskQueueHandler.onEvent?.(node, BASE_CONFIG, context, {
        type: 'queue:get_status',
        payload: {},
      } as any)
    ).not.toThrow();
  });
});
