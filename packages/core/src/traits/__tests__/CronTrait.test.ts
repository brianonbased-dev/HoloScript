/**
 * CronTrait.test.ts — v4.0
 * Tests: cron parsing, register, trigger, cancel, enable/disable, missed jobs, max_runs
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cronHandler } from '../CronTrait';
import type { CronConfig } from '../CronTrait';

function makeCtx() {
  const events: { type: string; payload: unknown }[] = [];
  return {
    emit: (type: string, payload: unknown) => events.push({ type, payload }),
    events,
    of: (type: string) => events.filter(e => e.type === type),
    last: () => events[events.length - 1],
  };
}

const BASE_CONFIG: CronConfig = {
  timezone: 'UTC',
  max_jobs: 50,
  poll_interval_ms: 100, // fast for tests
  missed_job_strategy: 'run_once',
  persist: false, // no IndexedDB in tests
};

async function attach(extra: Partial<CronConfig> = {}) {
  const node = {} as any;
  const ctx = makeCtx();
  const config = { ...BASE_CONFIG, ...extra };
  await cronHandler.onAttach(node, config, ctx);
  return { node, ctx, config };
}

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('CronTrait — onAttach', () => {
  it('emits cron_ready', async () => {
    const { ctx } = await attach();
    expect(ctx.of('cron_ready').length).toBe(1);
  });

  it('initializes empty job map', async () => {
    const { node } = await attach();
    expect(node.__cronState.jobs.size).toBe(0);
  });
});

// ─── Register ────────────────────────────────────────────────────────────────

describe('CronTrait — register', () => {
  it('registers a valid cron job', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, {
      type: 'cron_register',
      payload: { name: 'hourly_render', expression: '0 * * * *', targetEvent: 'render_scene', targetPayload: { quality: 'hd' } },
    });
    expect(ctx.of('cron_registered').length).toBe(1);
    const job = (ctx.of('cron_registered')[0].payload as any).job;
    expect(job.name).toBe('hourly_render');
    expect(job.expression).toBe('0 * * * *');
    expect(node.__cronState.jobs.size).toBe(1);
  });

  it('rejects invalid cron expression', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, {
      type: 'cron_register',
      payload: { name: 'bad', expression: 'not-a-cron', targetEvent: 'x' },
    });
    expect(ctx.of('cron_registered').length).toBe(0);
    expect(ctx.of('cron_error').length).toBe(1);
  });

  it('enforces max_jobs limit', async () => {
    const { node, ctx, config } = await attach({ max_jobs: 2 });
    for (let i = 0; i < 3; i++) {
      cronHandler.onEvent(node, config, ctx, {
        type: 'cron_register',
        payload: { name: `job${i}`, expression: '* * * * *', targetEvent: 'x' },
      });
    }
    expect(node.__cronState.jobs.size).toBe(2);
    expect(ctx.of('cron_error').length).toBe(1);
  });

  it('requires name, expression, and targetEvent', async () => {
    const { ctx, config, node } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { expression: '* * * * *' } });
    expect(ctx.of('cron_registered').length).toBe(0);
  });

  it('handles step cron ("*/5 * * * *")', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, {
      type: 'cron_register',
      payload: { name: 'every5', expression: '*/5 * * * *', targetEvent: 'tick' },
    });
    expect(ctx.of('cron_registered').length).toBe(1);
  });
});

// ─── Cancel ──────────────────────────────────────────────────────────────────

describe('CronTrait — cancel', () => {
  it('cancels a registered job', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, {
      type: 'cron_register',
      payload: { name: 'to-cancel', expression: '0 9 * * 1', targetEvent: 'x' },
    });
    const jobId = (ctx.of('cron_registered')[0].payload as any).job.id;
    cronHandler.onEvent(node, config, ctx, { type: 'cron_cancel', payload: { jobId } });
    expect(node.__cronState.jobs.has(jobId)).toBe(false);
    expect(ctx.of('cron_cancelled').length).toBe(1);
  });

  it('ignores cancel for unknown jobId', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_cancel', payload: { jobId: 'ghost_id' } });
    expect(ctx.of('cron_cancelled').length).toBe(0);
  });
});

// ─── Enable / Disable ────────────────────────────────────────────────────────

describe('CronTrait — enable / disable', () => {
  it('disables a job', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { name: 'j', expression: '* * * * *', targetEvent: 'x' } });
    const jobId = (ctx.of('cron_registered')[0].payload as any).job.id;
    cronHandler.onEvent(node, config, ctx, { type: 'cron_disable', payload: { jobId } });
    expect(node.__cronState.jobs.get(jobId)?.enabled).toBe(false);
  });

  it('re-enables a disabled job', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { name: 'j', expression: '* * * * *', targetEvent: 'x' } });
    const jobId = (ctx.of('cron_registered')[0].payload as any).job.id;
    cronHandler.onEvent(node, config, ctx, { type: 'cron_disable', payload: { jobId } });
    cronHandler.onEvent(node, config, ctx, { type: 'cron_enable', payload: { jobId } });
    expect(node.__cronState.jobs.get(jobId)?.enabled).toBe(true);
  });
});

// ─── Run Now ─────────────────────────────────────────────────────────────────

describe('CronTrait — run_now', () => {
  it('triggers a job immediately', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { name: 'j', expression: '0 3 * * *', targetEvent: 'morning_scene' } });
    const jobId = (ctx.of('cron_registered')[0].payload as any).job.id;
    cronHandler.onEvent(node, config, ctx, { type: 'cron_run_now', payload: { jobId } });
    expect(ctx.of('cron_triggered').length).toBe(1);
    expect(ctx.of('morning_scene').length).toBe(1);
  });

  it('re-emits target event with _cronTriggered flag', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { name: 'j', expression: '0 0 * * *', targetEvent: 'do_thing', targetPayload: { foo: 'bar' } } });
    const jobId = (ctx.of('cron_registered')[0].payload as any).job.id;
    cronHandler.onEvent(node, config, ctx, { type: 'cron_run_now', payload: { jobId } });
    const emitted = ctx.of('do_thing')[0].payload as any;
    expect(emitted._cronTriggered).toBe(true);
    expect(emitted.foo).toBe('bar');
  });
});

// ─── max_runs ────────────────────────────────────────────────────────────────

describe('CronTrait — max_runs', () => {
  it('disables job after max_runs reached', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, {
      type: 'cron_register',
      payload: { name: 'once', expression: '0 0 * * *', targetEvent: 'x', maxRuns: 2 },
    });
    const jobId = (ctx.of('cron_registered')[0].payload as any).job.id;
    cronHandler.onEvent(node, config, ctx, { type: 'cron_run_now', payload: { jobId } });
    cronHandler.onEvent(node, config, ctx, { type: 'cron_run_now', payload: { jobId } });
    expect(node.__cronState.jobs.get(jobId)?.enabled).toBe(false);
    const cancelled = ctx.of('cron_cancelled');
    expect(cancelled.some((e: any) => e.payload.reason === 'max_runs_reached')).toBe(true);
  });
});

// ─── List ─────────────────────────────────────────────────────────────────────

describe('CronTrait — list', () => {
  it('lists all jobs', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { name: 'a', expression: '* * * * *', targetEvent: 'x' } });
    cronHandler.onEvent(node, config, ctx, { type: 'cron_register', payload: { name: 'b', expression: '0 * * * *', targetEvent: 'y' } });
    cronHandler.onEvent(node, config, ctx, { type: 'cron_list' });
    const jobs = (ctx.of('cron_list')[0].payload as any).jobs;
    expect(jobs.length).toBe(2);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('CronTrait — onDetach', () => {
  it('emits cron_stopped and clears state', async () => {
    const { node, ctx, config } = await attach();
    cronHandler.onDetach(node, config, ctx);
    expect(ctx.of('cron_stopped').length).toBe(1);
    expect(node.__cronState).toBeUndefined();
  });
});
