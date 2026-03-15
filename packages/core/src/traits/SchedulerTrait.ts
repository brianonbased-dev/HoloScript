/**
 * SchedulerTrait — v5.1
 *
 * Multi-job scheduler with named jobs, cron-like patterns, and
 * one-shot / repeating modes. Extends beyond CronTrait by supporting
 * named job management (add/remove/pause/resume) and job dependencies.
 *
 * Events:
 *  scheduler:job_added       { jobId, interval, mode }
 *  scheduler:job_removed     { jobId }
 *  scheduler:job_triggered   { jobId, executionCount, scheduledAt }
 *  scheduler:job_paused      { jobId }
 *  scheduler:job_resumed     { jobId }
 *  scheduler:job_error       { jobId, error }
 *  scheduler:add_job         (command) Register a named job
 *  scheduler:remove_job      (command) Remove a named job
 *  scheduler:pause_job       (command) Pause a named job
 *  scheduler:resume_job      (command) Resume a named job
 *  scheduler:get_status      (command) Get scheduler status
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface SchedulerJob {
  /** Unique job identifier */
  id: string;
  /** Interval in ms between executions */
  interval_ms: number;
  /** Action event to emit on trigger */
  action: string;
  /** Parameters to pass with the action */
  params: Record<string, unknown>;
  /** 'repeat' keeps running, 'once' runs once then auto-removes */
  mode: 'repeat' | 'once';
  /** Maximum number of executions (0 = unlimited) */
  max_executions: number;
  /** Whether the job starts paused */
  paused: boolean;
}

export interface SchedulerConfig {
  /** Pre-configured jobs to register on attach */
  jobs: SchedulerJob[];
  /** Maximum concurrent jobs allowed */
  max_jobs: number;
  /** Polling interval for job checks (ms) */
  poll_interval_ms: number;
}

export interface SchedulerJobState {
  job: SchedulerJob;
  paused: boolean;
  executionCount: number;
  lastTriggeredAt: number;
  nextTriggerAt: number;
  timer: ReturnType<typeof setInterval> | null;
}

export interface SchedulerState {
  jobs: Map<string, SchedulerJobState>;
  totalTriggered: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const schedulerHandler: TraitHandler<SchedulerConfig> = {
  name: 'scheduler' as any,

  defaultConfig: {
    jobs: [],
    max_jobs: 50,
    poll_interval_ms: 1000,
  },

  onAttach(node: any, config: SchedulerConfig, context: any): void {
    const state: SchedulerState = {
      jobs: new Map(),
      totalTriggered: 0,
    };
    node.__schedulerState = state;

    // Register pre-configured jobs
    for (const job of config.jobs) {
      addJob(state, job, config, context);
    }
  },

  onDetach(node: any, _config: SchedulerConfig, _context: any): void {
    const state: SchedulerState | undefined = node.__schedulerState;
    if (state) {
      for (const [, js] of state.jobs) {
        if (js.timer) clearInterval(js.timer);
      }
      state.jobs.clear();
    }
    delete node.__schedulerState;
  },

  onUpdate(_node: any, _config: SchedulerConfig, _context: any, _delta: number): void {
    // Timer-driven, no per-frame work
  },

  onEvent(node: any, config: SchedulerConfig, context: any, event: any): void {
    const state: SchedulerState | undefined = node.__schedulerState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      case 'scheduler:add_job': {
        const job: SchedulerJob = {
          id: payload.id as string,
          interval_ms: (payload.interval_ms as number) ?? 1000,
          action: (payload.action as string) ?? '',
          params: (payload.params as Record<string, unknown>) ?? {},
          mode: (payload.mode as 'repeat' | 'once') ?? 'repeat',
          max_executions: (payload.max_executions as number) ?? 0,
          paused: (payload.paused as boolean) ?? false,
        };
        if (!job.id || !job.action) break;
        addJob(state, job, config, context);
        break;
      }

      case 'scheduler:remove_job': {
        const jobId = payload.jobId as string ?? payload.id as string;
        const js = state.jobs.get(jobId);
        if (js) {
          if (js.timer) clearInterval(js.timer);
          state.jobs.delete(jobId);
          context.emit?.('scheduler:job_removed', { jobId });
        }
        break;
      }

      case 'scheduler:pause_job': {
        const jobId = payload.jobId as string ?? payload.id as string;
        const js = state.jobs.get(jobId);
        if (js && !js.paused) {
          js.paused = true;
          if (js.timer) {
            clearInterval(js.timer);
            js.timer = null;
          }
          context.emit?.('scheduler:job_paused', { jobId });
        }
        break;
      }

      case 'scheduler:resume_job': {
        const jobId = payload.jobId as string ?? payload.id as string;
        const js = state.jobs.get(jobId);
        if (js && js.paused) {
          js.paused = false;
          startJobTimer(state, js, context);
          context.emit?.('scheduler:job_resumed', { jobId });
        }
        break;
      }

      case 'scheduler:get_status': {
        const jobSummaries = Array.from(state.jobs.values()).map(js => ({
          id: js.job.id,
          paused: js.paused,
          executionCount: js.executionCount,
          lastTriggeredAt: js.lastTriggeredAt,
          nextTriggerAt: js.nextTriggerAt,
        }));
        context.emit?.('scheduler:status', {
          jobCount: state.jobs.size,
          totalTriggered: state.totalTriggered,
          jobs: jobSummaries,
        });
        break;
      }
    }
  },
};

function addJob(
  state: SchedulerState,
  job: SchedulerJob,
  config: SchedulerConfig,
  context: any,
): void {
  if (state.jobs.size >= config.max_jobs) {
    context.emit?.('scheduler:job_error', {
      jobId: job.id,
      error: `Max jobs (${config.max_jobs}) reached`,
    });
    return;
  }

  // Remove existing job with same id
  const existing = state.jobs.get(job.id);
  if (existing?.timer) clearInterval(existing.timer);

  const js: SchedulerJobState = {
    job,
    paused: job.paused,
    executionCount: 0,
    lastTriggeredAt: 0,
    nextTriggerAt: Date.now() + job.interval_ms,
    timer: null,
  };
  state.jobs.set(job.id, js);

  context.emit?.('scheduler:job_added', {
    jobId: job.id,
    interval: job.interval_ms,
    mode: job.mode,
  });

  if (!job.paused) {
    startJobTimer(state, js, context);
  }
}

function startJobTimer(state: SchedulerState, js: SchedulerJobState, context: any): void {
  js.timer = setInterval(() => {
    if (js.paused) return;

    js.executionCount++;
    js.lastTriggeredAt = Date.now();
    js.nextTriggerAt = Date.now() + js.job.interval_ms;
    state.totalTriggered++;

    context.emit?.('scheduler:job_triggered', {
      jobId: js.job.id,
      executionCount: js.executionCount,
      scheduledAt: js.lastTriggeredAt,
    });

    // Emit the configured action
    context.emit?.(js.job.action, { ...js.job.params, __schedulerJobId: js.job.id });

    // Check max executions
    if (js.job.max_executions > 0 && js.executionCount >= js.job.max_executions) {
      if (js.timer) clearInterval(js.timer);
      js.timer = null;
      if (js.job.mode === 'once') {
        state.jobs.delete(js.job.id);
      }
    }

    // One-shot auto-remove
    if (js.job.mode === 'once') {
      if (js.timer) clearInterval(js.timer);
      js.timer = null;
      state.jobs.delete(js.job.id);
    }
  }, js.job.interval_ms);
}

export default schedulerHandler;
