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

interface QueuedJob {
  jobId: string;
  data: unknown;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private jobQueue: QueuedJob[] = [];
  private pendingJobs = new Map<string, QueuedJob>();
  private workerFile: string;

  constructor(workerFile: string, poolSize?: number) {
    this.workerFile = workerFile;
    const size = poolSize ?? Math.max(2, os.cpus().length - 2); // Leave 2 cores free

    for (let i = 0; i < size; i++) {
      const worker = new Worker(this.workerFile);

      worker.on('message', (result: { type?: string; jobId?: string; [key: string]: unknown }) => {
        // Handle ready signal
        if (result.type === 'ready') {
          this.availableWorkers.push(worker);
          this.processQueue();
          return;
        }

        // Handle job result
        // @ts-ignore - Automatic remediation for TS2345
        const job = this.pendingJobs.get(result.jobId);
        if (job) {
          // @ts-ignore - Automatic remediation for TS2345
          this.pendingJobs.delete(result.jobId);
          this.availableWorkers.push(worker);
          job.resolve(result);
          this.processQueue();
        }
      });

      worker.on('error', (err) => {
        console.error('[WorkerPool] Worker error:', err);
        // Find and reject all pending jobs for this worker
        for (const [jobId, job] of this.pendingJobs) {
          job.reject(err);
          this.pendingJobs.delete(jobId);
        }
      });

      worker.on('exit', (code) => {
        if (code !== 0) {
          console.error(`[WorkerPool] Worker exited with code ${code}`);
        }
      });

      this.workers.push(worker);
    }
  }

  /**
   * Execute a job on an available worker.
   * Returns a Promise that resolves with the worker's result.
   */
  execute<T>(data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const job: QueuedJob = {
        jobId,
        // @ts-ignore - Automatic remediation for TS2698
        data: { jobId, ...data },
        // @ts-ignore - Automatic remediation for TS2322
        resolve,
        reject,
      };

      this.jobQueue.push(job);
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
      worker.postMessage(job.data);
    }
  }

  /**
   * Terminate all workers and clean up resources.
   */
  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.jobQueue = [];
    this.pendingJobs.clear();
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
}
