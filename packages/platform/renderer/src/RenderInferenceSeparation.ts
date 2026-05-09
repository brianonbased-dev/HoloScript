/**
 * RenderInferenceSeparation
 *
 * Keeps inference work (model evaluation, trait embedding lookup, synthetic-
 * data generation, etc.) from stalling the render thread.
 *
 * Four primitives:
 *   RenderSafeInferenceReader  – non-blocking result consumption
 *   InferenceIsolationBarrier  – tracks what work is in-flight / isolated
 *   FrameDeadlineEnforcer      – per-frame CPU budget guard
 *   InferencePriorityScheduler – priority queue + preemption
 *
 * All classes are single-threaded; marshal across a worker boundary yourself
 * if you need true thread isolation.
 */

export type InferencePriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_RANK: Record<InferencePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export interface InferenceTask<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly priority: InferencePriority;
  readonly input: TInput;
  readonly createdAt: number; // performance.now() timestamp
  execute(): TOutput | Promise<TOutput>;
}

export interface InferenceResult<TOutput = unknown> {
  readonly taskId: string;
  readonly output: TOutput;
  readonly startedAt: number;
  readonly finishedAt: number;
}

export interface InferenceMetrics {
  /** Number of tasks currently queued. */
  queueDepth: number;
  /** Number of tasks actively executing (inside the barrier). */
  inFlight: number;
  /** Total completed since creation. */
  completed: number;
  /** Total dropped (deadline exceeded or pre-empted) since creation. */
  dropped: number;
  /** Average latency (ms) of the last N completed tasks. */
  averageLatencyMs: number;
  /** Percentage of frames in the recent window that missed the deadline. */
  deadlineMissRate: number;
}

/* ------------------------------------------------------------------ */
//  RenderSafeInferenceReader
/* ------------------------------------------------------------------ */

export interface RenderSafeInferenceReaderOptions {
  /** Max results to retain before back-pressure drops oldest. */
  maxBufferedResults?: number;
}

/**
 * Consumes inference results without blocking the render loop.
 * Producers push results; the renderer polls `drain()` once per frame.
 */
export class RenderSafeInferenceReader<TOutput = unknown> {
  private readonly buffer: InferenceResult<TOutput>[] = [];
  private readonly maxBuffered: number;

  constructor(options: RenderSafeInferenceReaderOptions = {}) {
    this.maxBuffered = options.maxBufferedResults ?? 64;
  }

  /** Called by the inference side when a task finishes. */
  push(result: InferenceResult<TOutput>): void {
    if (this.buffer.length >= this.maxBuffered) {
      this.buffer.shift(); // drop oldest under back-pressure
    }
    this.buffer.push(result);
  }

  /** Called once per frame by the renderer. Returns all buffered results. */
  drain(): InferenceResult<TOutput>[] {
    const out = this.buffer.slice();
    this.buffer.length = 0;
    return out;
  }

  peek(): readonly InferenceResult<TOutput>[] {
    return this.buffer;
  }

  get bufferedCount(): number {
    return this.buffer.length;
  }
}

/* ------------------------------------------------------------------ */
//  InferenceIsolationBarrier
/* ------------------------------------------------------------------ */

export interface InferenceIsolationBarrierOptions {
  /** Max concurrent inference tasks allowed. */
  maxConcurrency?: number;
}

/**
 * Tracks which tasks are currently executing inside the "isolated"
 * inference zone. Prevents render-thread re-entrancy and enforces a
 * concurrency ceiling.
 */
export class InferenceIsolationBarrier {
  private readonly maxConcurrency: number;
  private inFlight = new Set<string>();

  constructor(options: InferenceIsolationBarrierOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? 2;
  }

  /** Attempt to enter the barrier. Returns false if at capacity. */
  enter(taskId: string): boolean {
    if (this.inFlight.size >= this.maxConcurrency) return false;
    this.inFlight.add(taskId);
    return true;
  }

  exit(taskId: string): void {
    this.inFlight.delete(taskId);
  }

  get activeCount(): number {
    return this.inFlight.size;
  }

  get remainingSlots(): number {
    return Math.max(0, this.maxConcurrency - this.inFlight.size);
  }
}

/* ------------------------------------------------------------------ */
//  FrameDeadlineEnforcer
/* ------------------------------------------------------------------ */

export interface FrameDeadlineEnforcerOptions {
  /** Target frame time in ms (default 16.67 for 60 Hz). */
  targetFrameTimeMs?: number;
  /** Fraction of the frame reserved for inference (0..1). Default 0.3. */
  inferenceBudgetRatio?: number;
  /** History window for miss-rate calculation. */
  missRateWindow?: number;
}

/**
 * Ensures inference does not consume more than its allotted slice of a
 * frame. Tracks historical miss rate for telemetry.
 */
export class FrameDeadlineEnforcer {
  readonly targetFrameTimeMs: number;
  readonly inferenceBudgetMs: number;
  private readonly history: boolean[] = []; // true = hit, false = miss
  private readonly windowSize: number;

  constructor(options: FrameDeadlineEnforcerOptions = {}) {
    this.targetFrameTimeMs = options.targetFrameTimeMs ?? 16.67;
    const ratio = Math.min(1, Math.max(0, options.inferenceBudgetRatio ?? 0.3));
    this.inferenceBudgetMs = this.targetFrameTimeMs * ratio;
    this.windowSize = options.missRateWindow ?? 60;
  }

  /** Call at the start of inference work for this frame. */
  beginFrame(now = performance.now()): number {
    return now;
  }

  /**
   * Call after inference work finishes. Returns `true` if the work stayed
   * within budget, `false` if it exceeded the deadline.
   */
  endFrame(startedAt: number, now = performance.now()): boolean {
    const hit = now - startedAt <= this.inferenceBudgetMs;
    this.history.push(hit);
    if (this.history.length > this.windowSize) this.history.shift();
    return hit;
  }

  get missRate(): number {
    if (this.history.length === 0) return 0;
    const misses = this.history.filter((h) => !h).length;
    return misses / this.history.length;
  }

  /** Remaining budget for the current frame (may be negative). */
  remainingBudgetMs(startedAt: number, now = performance.now()): number {
    return this.inferenceBudgetMs - (now - startedAt);
  }
}

/* ------------------------------------------------------------------ */
//  InferencePriorityScheduler
/* ------------------------------------------------------------------ */

export interface InferencePrioritySchedulerOptions {
  barrier?: InferenceIsolationBarrier;
  reader?: RenderSafeInferenceReader;
  enforcer?: FrameDeadlineEnforcer;
  /** Latency averaging window. */
  latencyWindow?: number;
}

/**
 * Priority queue + execution loop. Tasks are ordered by priority then FIFO.
 * The scheduler respects the barrier concurrency limit and the frame deadline.
 * Completed results are pushed to the RenderSafeInferenceReader.
 */
export class InferencePriorityScheduler {
  private readonly queue: InferenceTask[] = [];
  private readonly barrier: InferenceIsolationBarrier;
  readonly reader: RenderSafeInferenceReader;
  readonly enforcer: FrameDeadlineEnforcer;
  private completed = 0;
  private dropped = 0;
  private readonly latencies: number[] = [];
  private readonly latencyWindow: number;

  constructor(options: InferencePrioritySchedulerOptions = {}) {
    this.barrier = options.barrier ?? new InferenceIsolationBarrier();
    this.reader = options.reader ?? new RenderSafeInferenceReader();
    this.enforcer = options.enforcer ?? new FrameDeadlineEnforcer();
    this.latencyWindow = options.latencyWindow ?? 32;
  }

  /** Enqueue a task. */
  schedule<TInput, TOutput>(task: InferenceTask<TInput, TOutput>): void {
    this.queue.push(task as InferenceTask);
    this.queue.sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.createdAt - b.createdAt
    );
  }

  /**
   * Run scheduling for the current frame. Returns the number of tasks
   * started. Must be called from the render loop (or a worker tick).
   */
  tick(now = performance.now()): number {
    const frameStart = this.enforcer.beginFrame(now);
    let started = 0;

    while (this.queue.length > 0 && this.barrier.remainingSlots > 0) {
      const remaining = this.enforcer.remainingBudgetMs(frameStart, performance.now());
      if (remaining <= 0) break;

      const task = this.queue.shift()!;
      if (!this.barrier.enter(task.id)) {
        // concurrency race — put it back at front
        this.queue.unshift(task);
        break;
      }

      started++;
      const startedAt = performance.now();

      // Execute synchronously or handle async result
      const resultOrPromise = task.execute();
      const onDone = (output: unknown) => {
        const finishedAt = performance.now();
        this.barrier.exit(task.id);
        this.reader.push({
          taskId: task.id,
          output,
          startedAt,
          finishedAt,
        });
        this.completed++;
        this.recordLatency(finishedAt - startedAt);
        this.enforcer.endFrame(frameStart, finishedAt);
      };

      if (resultOrPromise instanceof Promise) {
        resultOrPromise.then(onDone, (err: unknown) => {
          this.barrier.exit(task.id);
          this.dropped++;
          // Push error-shaped result so renderer sees it
          this.reader.push({
            taskId: task.id,
            output: err,
            startedAt,
            finishedAt: performance.now(),
          });
        });
      } else {
        onDone(resultOrPromise);
      }
    }

    // Count deadline misses for tasks we couldn't even start
    const anyQueued = this.queue.length > 0;
    if (anyQueued && this.enforcer.remainingBudgetMs(frameStart, performance.now()) <= 0) {
      this.enforcer.endFrame(frameStart, performance.now());
    } else if (!anyQueued) {
      this.enforcer.endFrame(frameStart, performance.now());
    }

    return started;
  }

  private recordLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > this.latencyWindow) this.latencies.shift();
  }

  getMetrics(): InferenceMetrics {
    const avg =
      this.latencies.length === 0
        ? 0
        : this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
    return {
      queueDepth: this.queue.length,
      inFlight: this.barrier.activeCount,
      completed: this.completed,
      dropped: this.dropped,
      averageLatencyMs: Math.round(avg * 100) / 100,
      deadlineMissRate: Math.round(this.enforcer.missRate * 1000) / 1000,
    };
  }

  clear(): void {
    this.dropped += this.queue.length;
    this.queue.length = 0;
  }
}
