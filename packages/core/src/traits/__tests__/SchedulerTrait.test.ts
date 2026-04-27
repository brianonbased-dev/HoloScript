/**
 * SchedulerTrait — comprehensive tests
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  schedulerHandler,
  type SchedulerConfig,
  type SchedulerJob,
} from '../SchedulerTrait';
import type { HSPlusNode, TraitContext } from '../TraitTypes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type SchedulerNode = HSPlusNode & { __schedulerState?: any };

function makeNode(): SchedulerNode {
  return {} as SchedulerNode;
}

function makeContext() {
  const emitted: Array<{ type: string; payload: unknown }> = [];
  const context: TraitContext = {
    emit: (type: string, payload?: unknown) => emitted.push({ type, payload }),
  };
  return { context, emitted };
}

const BASE_CONFIG: SchedulerConfig = {
  ...(schedulerHandler.defaultConfig as SchedulerConfig),
};

function setup(configOverrides: Partial<SchedulerConfig> = {}) {
  const node = makeNode();
  const { context, emitted } = makeContext();
  const config: SchedulerConfig = { ...BASE_CONFIG, ...configOverrides };
  schedulerHandler.onAttach?.(node, config, context);
  emitted.length = 0;
  return { node, config, context, emitted };
}

function addJob(
  node: SchedulerNode,
  config: SchedulerConfig,
  context: TraitContext,
  job: Partial<SchedulerJob>
) {
  schedulerHandler.onEvent?.(node, config, context, {
    type: 'scheduler:add_job',
    payload: {
      id: job.id ?? 'job1',
      interval_ms: job.interval_ms ?? 1000,
      action: job.action ?? 'do_work',
      params: job.params ?? {},
      mode: job.mode ?? 'repeat',
      max_executions: job.max_executions ?? 0,
      paused: job.paused ?? false,
    },
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
// onAttach / defaults
// ---------------------------------------------------------------------------

describe('schedulerHandler onAttach/defaults', () => {
  it('has name scheduler', () => {
    expect(schedulerHandler.name).toBe('scheduler');
  });

  it('default max_jobs is 50', () => {
    expect(BASE_CONFIG.max_jobs).toBe(50);
  });

  it('default poll_interval_ms is 1000', () => {
    expect(BASE_CONFIG.poll_interval_ms).toBe(1000);
  });

  it('default jobs is empty array', () => {
    expect(Array.isArray(BASE_CONFIG.jobs)).toBe(true);
    expect(BASE_CONFIG.jobs.length).toBe(0);
  });

  it('creates scheduler state on attach', () => {
    const { node } = setup();
    expect(node.__schedulerState).toBeDefined();
    expect(node.__schedulerState.jobs).toBeDefined();
  });

  it('registers preconfigured jobs on attach', () => {
    const preJob: SchedulerJob = {
      id: 'pre',
      interval_ms: 1000,
      action: 'pre_action',
      params: {},
      mode: 'repeat',
      max_executions: 0,
      paused: false,
    };
    const { node } = setup({ jobs: [preJob] });
    expect(node.__schedulerState.jobs.size).toBe(1);
    expect(node.__schedulerState.jobs.has('pre')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// add/remove jobs
// ---------------------------------------------------------------------------

describe('add/remove jobs', () => {
  it('adds a job and emits scheduler:job_added', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act' });
    expect(node.__schedulerState.jobs.has('j1')).toBe(true);
    expect(emitted.some(e => e.type === 'scheduler:job_added')).toBe(true);
  });

  it('job_added payload includes interval and mode', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', interval_ms: 2500, mode: 'once', action: 'act' });
    const ev = emitted.find(e => e.type === 'scheduler:job_added');
    expect((ev!.payload as any).interval).toBe(2500);
    expect((ev!.payload as any).mode).toBe('once');
  });

  it('ignores add_job without id', () => {
    const { node, config, context } = setup();
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:add_job',
      payload: { action: 'act' },
    } as any);
    expect(node.__schedulerState.jobs.size).toBe(0);
  });

  it('ignores add_job without action', () => {
    const { node, config, context } = setup();
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:add_job',
      payload: { id: 'j1' },
    } as any);
    expect(node.__schedulerState.jobs.size).toBe(0);
  });

  it('enforces max_jobs and emits scheduler:job_error', () => {
    const { node, config, context, emitted } = setup({ max_jobs: 1 });
    addJob(node, config, context, { id: 'j1', action: 'a1' });
    addJob(node, config, context, { id: 'j2', action: 'a2' });
    expect(node.__schedulerState.jobs.size).toBe(1);
    expect(emitted.some(e => e.type === 'scheduler:job_error')).toBe(true);
  });

  it('remove_job clears timer and emits scheduler:job_removed', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act' });
    emitted.length = 0;
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:remove_job',
      payload: { jobId: 'j1' },
    } as any);
    expect(node.__schedulerState.jobs.has('j1')).toBe(false);
    expect(emitted.some(e => e.type === 'scheduler:job_removed')).toBe(true);
  });

  it('remove_job accepts payload.id alias', () => {
    const { node, config, context } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act' });
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:remove_job',
      payload: { id: 'j1' },
    } as any);
    expect(node.__schedulerState.jobs.has('j1')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pause/resume
// ---------------------------------------------------------------------------

describe('pause/resume', () => {
  it('pause_job pauses active job and emits event', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act' });
    emitted.length = 0;
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:pause_job',
      payload: { jobId: 'j1' },
    } as any);
    const js = node.__schedulerState.jobs.get('j1');
    expect(js.paused).toBe(true);
    expect(js.timer).toBeNull();
    expect(emitted.some(e => e.type === 'scheduler:job_paused')).toBe(true);
  });

  it('resume_job resumes paused job and emits event', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act', paused: true });
    emitted.length = 0;
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:resume_job',
      payload: { jobId: 'j1' },
    } as any);
    const js = node.__schedulerState.jobs.get('j1');
    expect(js.paused).toBe(false);
    expect(js.timer).not.toBeNull();
    expect(emitted.some(e => e.type === 'scheduler:job_resumed')).toBe(true);
  });

  it('pause_job accepts payload.id alias', () => {
    const { node, config, context } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act' });
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:pause_job',
      payload: { id: 'j1' },
    } as any);
    expect(node.__schedulerState.jobs.get('j1').paused).toBe(true);
  });

  it('resume_job accepts payload.id alias', () => {
    const { node, config, context } = setup();
    addJob(node, config, context, { id: 'j1', action: 'act', paused: true });
    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:resume_job',
      payload: { id: 'j1' },
    } as any);
    expect(node.__schedulerState.jobs.get('j1').paused).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// triggering behavior
// ---------------------------------------------------------------------------

describe('job triggering behavior', () => {
  it('repeat job triggers on interval', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, {
      id: 'j1',
      interval_ms: 1000,
      action: 'do_work',
      params: { x: 1 },
      mode: 'repeat',
    });
    emitted.length = 0;

    vi.advanceTimersByTime(1000);

    expect(emitted.some(e => e.type === 'scheduler:job_triggered')).toBe(true);
    expect(emitted.some(e => e.type === 'do_work')).toBe(true);
    expect(node.__schedulerState.totalTriggered).toBe(1);
  });

  it('emits action payload with __schedulerJobId', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, {
      id: 'j2',
      interval_ms: 500,
      action: 'perform',
      params: { foo: 'bar' },
    });
    emitted.length = 0;

    vi.advanceTimersByTime(500);

    const ev = emitted.find(e => e.type === 'perform');
    expect((ev!.payload as any).foo).toBe('bar');
    expect((ev!.payload as any).__schedulerJobId).toBe('j2');
  });

  it('once mode auto-removes after first trigger', () => {
    const { node, config, context } = setup();
    addJob(node, config, context, {
      id: 'once1',
      interval_ms: 1000,
      action: 'once_action',
      mode: 'once',
    });

    vi.advanceTimersByTime(1000);

    expect(node.__schedulerState.jobs.has('once1')).toBe(false);
  });

  it('max_executions stops repeated job timer', () => {
    const { node, config, context } = setup();
    addJob(node, config, context, {
      id: 'limit1',
      interval_ms: 200,
      action: 'tick',
      mode: 'repeat',
      max_executions: 2,
    });

    vi.advanceTimersByTime(1000);

    const js = node.__schedulerState.jobs.get('limit1');
    expect(js.executionCount).toBe(2);
    expect(js.timer).toBeNull();
  });

  it('paused job does not trigger until resumed', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, {
      id: 'paused1',
      interval_ms: 300,
      action: 'hit',
      paused: true,
    });
    emitted.length = 0;

    vi.advanceTimersByTime(900);
    expect(emitted.some(e => e.type === 'hit')).toBe(false);

    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:resume_job',
      payload: { jobId: 'paused1' },
    } as any);

    vi.advanceTimersByTime(300);
    expect(emitted.some(e => e.type === 'hit')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// status / detach
// ---------------------------------------------------------------------------

describe('status and detach', () => {
  it('get_status emits scheduler:status', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', action: 'a1' });

    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:get_status',
      payload: {},
    } as any);

    const status = emitted.find(e => e.type === 'scheduler:status');
    expect(status).toBeDefined();
    expect((status!.payload as any).jobCount).toBe(1);
    expect(Array.isArray((status!.payload as any).jobs)).toBe(true);
  });

  it('status includes totalTriggered', () => {
    const { node, config, context, emitted } = setup();
    addJob(node, config, context, { id: 'j1', action: 'a1', interval_ms: 100 });
    vi.advanceTimersByTime(100);

    schedulerHandler.onEvent?.(node, config, context, {
      type: 'scheduler:get_status',
      payload: {},
    } as any);

    const status = emitted.find(e => e.type === 'scheduler:status');
    expect((status!.payload as any).totalTriggered).toBeGreaterThanOrEqual(1);
  });

  it('onDetach clears all timers and jobs', () => {
    const { node, config, context } = setup();
    addJob(node, config, context, { id: 'j1', action: 'a1' });
    addJob(node, config, context, { id: 'j2', action: 'a2' });

    schedulerHandler.onDetach?.(node, config, context);

    expect(node.__schedulerState).toBeUndefined();
  });

  it('onDetach is safe when state missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() => schedulerHandler.onDetach?.(node, BASE_CONFIG, context)).not.toThrow();
  });

  it('onUpdate does nothing (timer-driven)', () => {
    const { node, config, context } = setup();
    expect(() => schedulerHandler.onUpdate?.(node, config, context, 0.016)).not.toThrow();
  });

  it('onEvent no-ops when state missing', () => {
    const node = makeNode();
    const { context } = makeContext();
    expect(() =>
      schedulerHandler.onEvent?.(node, BASE_CONFIG, context, { type: 'scheduler:get_status' } as any)
    ).not.toThrow();
  });
});
