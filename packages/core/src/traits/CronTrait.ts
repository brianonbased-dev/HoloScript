/**
 * CronTrait
 *
 * Scheduled execution of HoloScript trait events — like OpenClaw's cron, but spatial-aware.
 * Register cron jobs that emit any event on a schedule.
 *
 * Cron syntax: standard 5-field (min hour dom mon dow)
 * e.g. "0 9 * * 1" = every Monday 9am
 *
 * Events emitted by this trait:
 *  cron_registered  { node, job }
 *  cron_triggered   { node, job, at }
 *  cron_cancelled   { node, jobId }
 *  cron_missed      { node, job, missedCount }
 *  cron_error       { node, jobId, error }
 *  cron_list        { node, jobs }
 *
 * @version 4.0.0
 * @milestone HoloScript v4.0 — OpenClaw Competitor
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  expression: string;           // 5-field cron
  targetEvent: string;          // Event type to emit when triggered
  targetPayload: unknown;       // Payload for the target event
  timezone: string;
  enabled: boolean;
  createdAt: number;
  lastRun: number | null;
  nextRun: number;
  runCount: number;
  maxRuns: number | null;       // null = unlimited
  missedJobStrategy: 'run_once' | 'skip' | 'run_all';
}

export interface CronConfig {
  /** IANA timezone (e.g. 'America/Denver') */
  timezone: string;
  /** Maximum number of registered jobs */
  max_jobs: number;
  /** Poll interval in ms (how often to check schedules) */
  poll_interval_ms: number;
  /** Default missed job strategy */
  missed_job_strategy: 'run_once' | 'skip' | 'run_all';
  /** Persist jobs to IndexedDB */
  persist: boolean;
}

export interface CronState {
  jobs: Map<string, CronJob>;
  lastPoll: number;
  db: IDBDatabase | null;
  totalTriggered: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: CronConfig = {
  timezone: 'UTC',
  max_jobs: 100,
  poll_interval_ms: 30_000,
  missed_job_strategy: 'run_once',
  persist: true,
};

// ─── Cron Parser (minimal 5-field) ────────────────────────────────────────────

interface ParsedCron {
  minutes: number[];
  hours: number[];
  daysOfMonth: number[];
  months: number[];
  daysOfWeek: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  if (field === '*') {
    const all: number[] = [];
    for (let i = min; i <= max; i++) all.push(i);
    return all;
  }
  if (field.includes('/')) {
    const [rangeStr, stepStr] = field.split('/');
    const step = parseInt(stepStr, 10);
    const range = rangeStr === '*' ? [min, max] : rangeStr.split('-').map(Number);
    const result: number[] = [];
    for (let i = range[0]; i <= (range[1] ?? max); i += step) result.push(i);
    return result;
  }
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(Number);
    const result: number[] = [];
    for (let i = start; i <= end; i++) result.push(i);
    return result;
  }
  if (field.includes(',')) {
    return field.split(',').map(Number);
  }
  return [parseInt(field, 10)];
}

function parseCron(expression: string): ParsedCron | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  try {
    return {
      minutes:    parseField(parts[0], 0, 59),
      hours:      parseField(parts[1], 0, 23),
      daysOfMonth:parseField(parts[2], 1, 31),
      months:     parseField(parts[3], 1, 12),
      daysOfWeek: parseField(parts[4], 0, 6),
    };
  } catch {
    return null;
  }
}

function getNextRun(expression: string, after = Date.now()): number {
  const parsed = parseCron(expression);
  if (!parsed) return Infinity;

  // Search forward minute by minute (max 366 days)
  const MAX_ITERATIONS = 366 * 24 * 60;
  let t = new Date(after);
  t.setSeconds(0, 0);
  t = new Date(t.getTime() + 60_000); // start at next minute

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const min = t.getUTCMinutes();
    const hr  = t.getUTCHours();
    const dom = t.getUTCDate();
    const mon = t.getUTCMonth() + 1;
    const dow = t.getUTCDay();

    if (
      parsed.months.includes(mon) &&
      parsed.daysOfMonth.includes(dom) &&
      parsed.daysOfWeek.includes(dow) &&
      parsed.hours.includes(hr) &&
      parsed.minutes.includes(min)
    ) return t.getTime();

    t = new Date(t.getTime() + 60_000);
  }

  return Infinity;
}

function isValidCron(expression: string): boolean {
  return parseCron(expression) !== null;
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

async function openCronDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    const req = indexedDB.open('holoscript-cron', 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('jobs')) {
        db.createObjectStore('jobs', { keyPath: 'id' });
      }
    };
    req.onsuccess = (e) => resolve((e.target as IDBOpenDBRequest).result);
    req.onerror = () => resolve(null);
  });
}

async function persistJob(db: IDBDatabase | null, job: CronJob): Promise<void> {
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('jobs', 'readwrite');
    tx.objectStore('jobs').put(job);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function removeJob(db: IDBDatabase | null, id: string): Promise<void> {
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction('jobs', 'readwrite');
    tx.objectStore('jobs').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

async function loadAllJobs(db: IDBDatabase | null): Promise<CronJob[]> {
  if (!db) return [];
  return new Promise((resolve) => {
    const tx = db.transaction('jobs', 'readonly');
    const req = tx.objectStore('jobs').getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => resolve([]);
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const cronHandler = {
  defaultConfig: DEFAULT_CONFIG,

  async onAttach(node: any, config: CronConfig, ctx: any): Promise<void> {
    const db = config.persist ? await openCronDB() : null;
    const savedJobs = await loadAllJobs(db);

    const jobs = new Map<string, CronJob>();
    for (const job of savedJobs) {
      if (job.enabled) {
        // Recalculate nextRun in case of downtime
        job.nextRun = getNextRun(job.expression);
        jobs.set(job.id, job);
      }
    }

    const state: CronState = {
      jobs,
      db,
      lastPoll: Date.now(),
      totalTriggered: 0,
    };

    node.__cronState = state;

    ctx.emit('cron_ready', { node, jobCount: jobs.size });
  },

  onDetach(node: any, _config: CronConfig, ctx: any): void {
    const state: CronState | undefined = node.__cronState;
    if (!state) return;
    if (state.db) state.db.close();
    ctx.emit('cron_stopped', { node, totalTriggered: state.totalTriggered });
    delete node.__cronState;
  },

  onEvent(node: any, config: CronConfig, ctx: any, event: any): void {
    const state: CronState | undefined = node.__cronState;
    if (!state) return;

    switch (event.type) {
      case 'cron_register': {
        const { name, expression, targetEvent, targetPayload = {}, maxRuns = null, missedJobStrategy } = event.payload ?? {};
        if (!name || !expression || !targetEvent) return;
        if (!isValidCron(expression)) {
          ctx.emit('cron_error', { node, jobId: null, error: `Invalid cron expression: "${expression}"` });
          return;
        }
        if (state.jobs.size >= config.max_jobs) {
          ctx.emit('cron_error', { node, jobId: null, error: 'max_jobs limit reached' });
          return;
        }

        const job: CronJob = {
          id: `cron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name,
          expression,
          targetEvent,
          targetPayload,
          timezone: config.timezone,
          enabled: true,
          createdAt: Date.now(),
          lastRun: null,
          nextRun: getNextRun(expression),
          runCount: 0,
          maxRuns,
          missedJobStrategy: missedJobStrategy ?? config.missed_job_strategy,
        };

        state.jobs.set(job.id, job);
        if (config.persist) persistJob(state.db, job);
        ctx.emit('cron_registered', { node, job });
        break;
      }

      case 'cron_cancel': {
        const { jobId } = event.payload ?? {};
        if (!jobId || !state.jobs.has(jobId)) return;
        state.jobs.delete(jobId);
        if (config.persist) removeJob(state.db, jobId);
        ctx.emit('cron_cancelled', { node, jobId });
        break;
      }

      case 'cron_enable': {
        const job = state.jobs.get(event.payload?.jobId);
        if (job) { job.enabled = true; if (config.persist) persistJob(state.db, job); }
        break;
      }

      case 'cron_disable': {
        const job = state.jobs.get(event.payload?.jobId);
        if (job) { job.enabled = false; if (config.persist) persistJob(state.db, job); }
        break;
      }

      case 'cron_list':
        ctx.emit('cron_list', { node, jobs: [...state.jobs.values()] });
        break;

      case 'cron_run_now': {
        const job = state.jobs.get(event.payload?.jobId);
        if (job) this._triggerJob(state, node, config, ctx, job);
        break;
      }
    }
  },

  onUpdate(node: any, config: CronConfig, ctx: any, _dt: number): void {
    const state: CronState | undefined = node.__cronState;
    if (!state) return;

    const now = Date.now();
    if (now - state.lastPoll < config.poll_interval_ms) return;
    state.lastPoll = now;

    for (const job of state.jobs.values()) {
      if (!job.enabled) continue;
      if (now < job.nextRun) continue;

      // Count how many runs were missed
      const missedMs = now - job.nextRun;
      const intervalMs = getNextRun(job.expression, job.nextRun) - job.nextRun;
      const missedCount = intervalMs > 0 ? Math.floor(missedMs / intervalMs) : 0;

      if (missedCount > 0) {
        ctx.emit('cron_missed', { node, job, missedCount });
        if (job.missedJobStrategy === 'skip') {
          job.nextRun = getNextRun(job.expression);
          continue;
        }
        if (job.missedJobStrategy === 'run_all') {
          for (let i = 0; i < missedCount; i++) this._triggerJob(state, node, config, ctx, job);
        }
        // run_once: fall through to trigger once
      }

      this._triggerJob(state, node, config, ctx, job);
    }
  },

  _triggerJob(state: CronState, node: any, config: CronConfig, ctx: any, job: CronJob): void {
    const now = Date.now();
    job.lastRun = now;
    job.runCount++;
    job.nextRun = getNextRun(job.expression, now);
    state.totalTriggered++;

    ctx.emit('cron_triggered', { node, job, at: now });
    // Re-emit the target event
    ctx.emit(job.targetEvent, { ...(job.targetPayload as object ?? {}), _cronTriggered: true, _cronJobId: job.id });

    if (job.maxRuns !== null && job.runCount >= job.maxRuns) {
      job.enabled = false;
      ctx.emit('cron_cancelled', { node, jobId: job.id, reason: 'max_runs_reached' });
    }

    if (config.persist) persistJob(state.db, job);
  },
} as const;
