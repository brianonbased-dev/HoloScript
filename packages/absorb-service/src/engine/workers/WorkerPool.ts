import { Worker } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';

interface QueuedJob<T = unknown> {
  jobId: string;
  data: unknown;
  resolve: (result: T) => void;
  reject: (error: Error) => void;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private jobQueue: QueuedJob[] = [];
  private pendingJobs = new Map<string, QueuedJob & { startTime: number }>();
  private workerFile: string;

  private stats = {
    totalJobsProcessed: 0,
    totalDurationMs: 0,
    peakQueueLength: 0,
    peakActiveWorkers: 0,
    startTime: Date.now(),
  };

  constructor(workerFile: string, poolSize?: number) {
    this.workerFile = path.isAbsolute(workerFile) ? workerFile : path.resolve(workerFile);
    const size = poolSize ?? Math.max(2, os.cpus().length - 2);

    for (let i = 0; i < size; i++) {
      const worker = new Worker(pathToFileURL(this.workerFile).href, { stderr: true });

      worker.stderr?.on('data', (data) => {
        console.error(`[WorkerPool] Worker stderr: ${data}`);
      });

      worker.on('message', (result: { type?: string; jobId?: string; [key: string]: unknown }) => {
        if (result.type === 'ready') {
          this.availableWorkers.push(worker);
          this.processQueue();
          return;
        }

        if (result.jobId) {
          const job = this.pendingJobs.get(result.jobId);
          if (job) {
            this.stats.totalJobsProcessed++;
            this.stats.totalDurationMs += Date.now() - job.startTime;
            this.pendingJobs.delete(result.jobId);
            this.availableWorkers.push(worker);
            job.resolve(result as unknown);
            this.processQueue();
          }
        }
      });

      worker.on('error', (err) => {
        console.error('[WorkerPool] Worker error:', err);
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

  execute<T>(data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const job: QueuedJob<T> = {
        jobId,
        data: { jobId, ...(data as Record<string, unknown>) },
        resolve,
        reject,
      };

      this.jobQueue.push(job);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.jobQueue.length > this.stats.peakQueueLength) {
      this.stats.peakQueueLength = this.jobQueue.length;
    }

    while (this.jobQueue.length > 0 && this.availableWorkers.length > 0) {
      const job = this.jobQueue.shift()!;
      const worker = this.availableWorkers.shift()!;

      this.pendingJobs.set(job.jobId, { ...job, startTime: Date.now() });
      worker.postMessage(job.data);

      const active = this.workers.length - this.availableWorkers.length;
      if (active > this.stats.peakActiveWorkers) {
        this.stats.peakActiveWorkers = active;
      }
    }
  }

  async terminate(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.jobQueue = [];
    this.pendingJobs.clear();
  }

  getPoolSize(): number {
    return this.workers.length;
  }

  getAvailableCount(): number {
    return this.availableWorkers.length;
  }

  getPendingCount(): number {
    return this.jobQueue.length + this.pendingJobs.size;
  }

  getTelemetry() {
    const uptime = (Date.now() - this.stats.startTime) / 1000;
    const avgDuration = this.stats.totalJobsProcessed > 0 
      ? this.stats.totalDurationMs / this.stats.totalJobsProcessed 
      : 0;
    const throughput = this.stats.totalJobsProcessed > 0
      ? this.stats.totalJobsProcessed / uptime
      : 0;

    return {
      poolSize: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      activeWorkers: this.workers.length - this.availableWorkers.length,
      queueLength: this.jobQueue.length,
      stats: {
        totalJobs: this.stats.totalJobsProcessed,
        avgDurationMs: Math.round(avgDuration * 100) / 100,
        throughputJobsPerSec: Math.round(throughput * 100) / 100,
        peakQueue: this.stats.peakQueueLength,
        peakActiveWorkers: this.stats.peakActiveWorkers,
      },
      uptimeSec: Math.round(uptime),
    };
  }
}
