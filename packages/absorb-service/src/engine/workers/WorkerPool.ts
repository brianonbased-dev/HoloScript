/**
 * Worker Pool — Parallel Job Execution with Worker Threads
 *
 * Manages a pool of worker threads for parallel tree-sitter parsing.
 * Distributes parse jobs across N workers (N = CPU cores - 2 by default).
 *
 * Features:
 *   - Automatic job queuing and distribution
 *   - Worker availability tracking
 *   - Promise-based API for easy async/await usage
 *   - Auto-cleanup on termination
 *
 * Usage:
 * ```ts
 * const pool = new WorkerPool('./parse-worker.js', 4);
 * const result = await pool.execute({ filePath, content, language });
 * await pool.terminate();
 * ```
 */

import { Worker } from 'worker_threads';
import * as os from 'os';

function isReadySignal(msg: unknown): msg is { type: 'ready' } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as { type?: unknown }).type === 'ready'
  );
}

function isWorkerJobMessage(msg: unknown): msg is { jobId: string } {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    typeof (msg as { jobId?: unknown }).jobId === 'string'
  );
}

interface QueuedJob {
  jobId: string;
  data: unknown;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  startAt: number;
}

export interface WorkerPoolTelemetry {
  stats: {
    poolSize: number;
    availableWorkers: number;
    queuedJobs: number;
    pendingJobs: number;
    maxQueueDepth: number;
    totalJobs: number;
    completedJobs: number;
    failedJobs: number;
    avgJobDurationMs: number;
  };
  recentLogs: string[];
  lastError?: string;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private jobQueue: QueuedJob[] = [];
  private pendingJobs = new Map<string, QueuedJob>();
  private workerFile: string;
  private telemetry: WorkerPoolTelemetry = {
    stats: {
      poolSize: 0,
      availableWorkers: 0,
      queuedJobs: 0,
      pendingJobs: 0,
      maxQueueDepth: 0,
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      avgJobDurationMs: 0,
    },
    recentLogs: [],
  };
  private shuttingDown = false;

  private logTelemetry(message: string): void {
    const line = `[${new Date().toISOString()}] ${message}`;
    this.telemetry.recentLogs.push(line);
    if (this.telemetry.recentLogs.length > 50) {
      this.telemetry.recentLogs.shift();
    }
  }

  private refreshCounts(): void {
    this.telemetry.stats.poolSize = this.workers.length;
    this.telemetry.stats.availableWorkers = this.availableWorkers.length;
    this.telemetry.stats.queuedJobs = this.jobQueue.length;
    this.telemetry.stats.pendingJobs = this.pendingJobs.size;
  }

  constructor(workerFile: string, poolSize?: number) {
    this.workerFile = workerFile;
    const size = poolSize ?? Math.max(2, os.cpus().length - 2); // Leave 2 cores free

    for (let i = 0; i < size; i++) {
      const worker = new Worker(this.workerFile);

      worker.on('message', (raw: unknown) => {
        if (isReadySignal(raw)) {
          this.availableWorkers.push(worker);
          this.refreshCounts();
          this.logTelemetry('worker-ready');
          this.processQueue();
          return;
        }

        if (!isWorkerJobMessage(raw)) {
          return;
        }

        const jobId = raw.jobId;
        const job = this.pendingJobs.get(jobId);
        if (job) {
          this.pendingJobs.delete(jobId);
          this.availableWorkers.push(worker);
          this.telemetry.stats.completedJobs += 1;
          const durationMs = Math.max(0, Date.now() - job.startAt);
          const completed = this.telemetry.stats.completedJobs;
          const prevAvg = this.telemetry.stats.avgJobDurationMs;
          this.telemetry.stats.avgJobDurationMs =
            completed === 1 ? durationMs : (prevAvg * (completed - 1) + durationMs) / completed;
          this.refreshCounts();
          this.logTelemetry(`job-complete:${jobId}:${durationMs}ms`);
          job.resolve(raw);
          this.processQueue();
        }
      });

      worker.on('error', (err) => {
        console.error('[WorkerPool] Worker error:', err);
        this.telemetry.stats.failedJobs += this.pendingJobs.size;
        this.telemetry.lastError = err.message;
        this.logTelemetry(`worker-error:${err.message}`);
        // Find and reject all pending jobs for this worker
        for (const [jobId, job] of this.pendingJobs) {
          job.reject(err);
          this.pendingJobs.delete(jobId);
        }
        this.refreshCounts();
      });

      worker.on('exit', (code) => {
        if (code !== 0 && !this.shuttingDown) {
          console.error(`[WorkerPool] Worker exited with code ${code}`);
          this.logTelemetry(`worker-exit:${code}`);
        }
      });

      this.workers.push(worker);
    }

    this.refreshCounts();
    this.logTelemetry(`pool-started:size=${size}`);
  }

  /**
   * Execute a job on an available worker.
   * Returns a Promise that resolves with the worker's result.
   */
  execute<T>(data: unknown): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const payload =
        typeof data === 'object' && data !== null
          ? { jobId, ...(data as Record<string, unknown>) }
          : { jobId, value: data };
      const job: QueuedJob = {
        jobId,
        data: payload,
        resolve: (result: unknown) => resolve(result as T),
        reject,
        startAt: Date.now(),
      };

      this.jobQueue.push(job);
      this.telemetry.stats.totalJobs += 1;
      this.telemetry.stats.maxQueueDepth = Math.max(
        this.telemetry.stats.maxQueueDepth,
        this.jobQueue.length
      );
      this.refreshCounts();
      this.logTelemetry(`job-queued:${jobId}`);
      this.processQueue();
    });
  }

  /**
   * Process the job queue. Distributes queued jobs to available workers.
   */
  private processQueue(): void {
    while (this.jobQueue.length > 0 && this.availableWorkers.length > 0) {
      const job = this.jobQueue.shift()!;
      const worker = this.availableWorkers.shift()!;

      this.pendingJobs.set(job.jobId, job);
      this.refreshCounts();
      this.logTelemetry(`job-dispatched:${job.jobId}`);
      worker.postMessage(job.data);
    }
  }

  /**
   * Terminate all workers and clean up resources.
   */
  async terminate(): Promise<void> {
    this.shuttingDown = true;
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.jobQueue = [];
    this.pendingJobs.clear();
    this.refreshCounts();
    this.logTelemetry('pool-terminated');
  }

  /**
   * Get the number of workers in the pool.
   */
  getPoolSize(): number {
    return this.workers.length;
  }

  /**
   * Get the number of currently available workers.
   */
  getAvailableCount(): number {
    return this.availableWorkers.length;
  }

  /**
   * Get the number of pending jobs (waiting + executing).
   */
  getPendingCount(): number {
    return this.jobQueue.length + this.pendingJobs.size;
  }

  /**
   * Snapshot worker-pool telemetry for tests and diagnostics.
   */
  getTelemetry(): WorkerPoolTelemetry {
    this.refreshCounts();
    return {
      stats: { ...this.telemetry.stats },
      recentLogs: [...this.telemetry.recentLogs],
      lastError: this.telemetry.lastError,
    };
  }
}
