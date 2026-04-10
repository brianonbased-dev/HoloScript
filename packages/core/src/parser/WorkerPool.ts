/**
 * WorkerPool - Manages a pool of worker threads for parallel parsing
 *
 * Features:
 * - Configurable pool size (defaults to CPU cores)
 * - Worker reuse across parse operations
 * - Graceful shutdown and cleanup
 * - Memory-bounded worker lifecycle
 *
 * @version 1.0.0
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { EventEmitter } from 'events';

export interface WorkerTask<T = unknown, R = unknown> {
  id: string;
  type: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
}

export interface WorkerPoolOptions {
  /** Number of workers in the pool (defaults to CPU cores) */
  poolSize?: number;
  /** Path to the worker script */
  workerPath: string;
  /** Maximum tasks per worker before recycling */
  maxTasksPerWorker?: number;
  /** Worker idle timeout in ms before termination */
  idleTimeout?: number;
  /** Enable debug logging */
  debug?: boolean;
}

interface PooledWorker {
  worker: Worker;
  busy: boolean;
  taskCount: number;
  createdAt: number;
  lastActiveAt: number;
}

export interface WorkerPoolStats {
  poolSize: number;
  activeWorkers: number;
  busyWorkers: number;
  idleWorkers: number;
  totalTasksProcessed: number;
  queuedTasks: number;
  avgTaskTime: number;
}

/**
 * WorkerPool manages a pool of worker threads for parallel task execution
 */
export class WorkerPool extends EventEmitter {
  private workers: PooledWorker[] = [];
  private taskQueue: WorkerTask[] = [];
  private options: Required<WorkerPoolOptions>;
  private totalTasksProcessed: number = 0;
  private totalTaskTime: number = 0;
  private isShuttingDown: boolean = false;
  private idleTimers: Map<Worker, NodeJS.Timeout> = new Map();

  constructor(options: WorkerPoolOptions) {
    super();

    this.options = {
      poolSize: options.poolSize ?? cpus().length,
      workerPath: options.workerPath,
      maxTasksPerWorker: options.maxTasksPerWorker ?? 1000,
      idleTimeout: options.idleTimeout ?? 30000,
      debug: options.debug ?? false,
    };

    this.log(`Initializing worker pool with ${this.options.poolSize} workers`);
  }

  /**
   * Initialize the worker pool by spawning workers
   */
  async initialize(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.options.poolSize; i++) {
      promises.push(this.spawnWorker());
    }

    await Promise.all(promises);
    this.log(`Worker pool initialized with ${this.workers.length} workers`);
  }

  /**
   * Execute a task in the worker pool
   */
  execute<T, R>(type: string, data: T): Promise<R> {
    return new Promise((resolve, reject) => {
      if (this.isShuttingDown) {
        reject(new Error('Worker pool is shutting down'));
        return;
      }

      const task: WorkerTask = {
        id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        data,
        resolve: resolve as (result: unknown) => void,
        reject,
      };

      this.queueTask(task);
    });
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeAll<T, R>(type: string, dataItems: T[]): Promise<R[]> {
    const promises = dataItems.map((data) => this.execute<T, R>(type, data));
    return Promise.all(promises);
  }

  /**
   * Get pool statistics
   */
  getStats(): WorkerPoolStats {
    const busyWorkers = this.workers.filter((w) => w.busy).length;

    return {
      poolSize: this.options.poolSize,
      activeWorkers: this.workers.length,
      busyWorkers,
      idleWorkers: this.workers.length - busyWorkers,
      totalTasksProcessed: this.totalTasksProcessed,
      queuedTasks: this.taskQueue.length,
      avgTaskTime: this.totalTasksProcessed > 0 ? this.totalTaskTime / this.totalTasksProcessed : 0,
    };
  }

  /**
   * Gracefully shutdown the worker pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    this.log('Shutting down worker pool...');

    // Clear idle timers
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    // Reject queued tasks
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool shutdown'));
    }
    this.taskQueue = [];

    // Terminate all workers
    const terminationPromises = this.workers.map((pooledWorker) =>
      this.terminateWorker(pooledWorker)
    );

    await Promise.all(terminationPromises);
    this.workers = [];
    this.log('Worker pool shutdown complete');
  }

  /**
   * Spawn a new worker
   */
  private async spawnWorker(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.options.workerPath);

        const pooledWorker: PooledWorker = {
          worker,
          busy: false,
          taskCount: 0,
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        };

        worker.on('online', () => {
          this.log(`Worker ${worker.threadId} online`);
          this.workers.push(pooledWorker);
          this.startIdleTimer(pooledWorker);
          resolve();
        });

        worker.on('error', (error) => {
          this.log(`Worker ${worker.threadId} error: ${error.message}`);
          this.emit('workerError', error, worker.threadId);
          this.handleWorkerFailure(pooledWorker, error);
        });

        worker.on('exit', (code) => {
          this.log(`Worker ${worker.threadId} exited with code ${code}`);
          this.removeWorker(pooledWorker);

          // Replace worker if not shutting down
          if (!this.isShuttingDown && this.workers.length < this.options.poolSize) {
            this.spawnWorker().catch((err) => {
              this.emit('error', err);
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Queue a task for execution
   */
  private queueTask(task: WorkerTask): void {
    const availableWorker = this.workers.find((w) => !w.busy);

    if (availableWorker) {
      this.assignTask(availableWorker, task);
    } else {
      this.taskQueue.push(task);
      this.log(`Task ${task.id} queued (queue size: ${this.taskQueue.length})`);
    }
  }

  /**
   * Assign a task to a worker
   */
  private assignTask(pooledWorker: PooledWorker, task: WorkerTask): void {
    pooledWorker.busy = true;
    pooledWorker.lastActiveAt = Date.now();
    this.clearIdleTimer(pooledWorker);

    const startTime = Date.now();
    const { worker } = pooledWorker;

    const messageHandler = (message: { taskId: string; result?: unknown; error?: string }) => {
      if (message.taskId !== task.id) return;

      worker.off('message', messageHandler);

      const taskTime = Date.now() - startTime;
      this.totalTasksProcessed++;
      this.totalTaskTime += taskTime;
      pooledWorker.taskCount++;
      pooledWorker.busy = false;
      pooledWorker.lastActiveAt = Date.now();

      if (message.error) {
        task.reject(new Error(message.error));
      } else {
        task.resolve(message.result);
      }

      // Check if worker should be recycled
      if (pooledWorker.taskCount >= this.options.maxTasksPerWorker) {
        this.recycleWorker(pooledWorker);
      } else {
        this.processQueue();
        this.startIdleTimer(pooledWorker);
      }
    };

    worker.on('message', messageHandler);

    worker.postMessage({
      taskId: task.id,
      type: task.type,
      data: task.data,
    });

    this.log(`Task ${task.id} assigned to worker ${worker.threadId}`);
  }

  /**
   * Process queued tasks
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0) {
      const availableWorker = this.workers.find((w) => !w.busy);
      if (!availableWorker) break;

      const task = this.taskQueue.shift()!;
      this.assignTask(availableWorker, task);
    }
  }

  /**
   * Recycle a worker that has processed too many tasks
   */
  private async recycleWorker(pooledWorker: PooledWorker): Promise<void> {
    this.log(
      `Recycling worker ${pooledWorker.worker.threadId} after ${pooledWorker.taskCount} tasks`
    );

    await this.terminateWorker(pooledWorker);
    this.removeWorker(pooledWorker);

    if (!this.isShuttingDown) {
      await this.spawnWorker();
    }
  }

  /**
   * Handle worker failure
   */
  private handleWorkerFailure(pooledWorker: PooledWorker, _error: Error): void {
    this.removeWorker(pooledWorker);

    // Respawn worker if not shutting down
    if (!this.isShuttingDown) {
      this.spawnWorker().catch((err) => {
        this.emit('error', err);
      });
    }
  }

  /**
   * Terminate a worker
   */
  private async terminateWorker(pooledWorker: PooledWorker): Promise<void> {
    this.clearIdleTimer(pooledWorker);

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        pooledWorker.worker.terminate();
        resolve();
      }, 5000);

      pooledWorker.worker.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      pooledWorker.worker.postMessage({ type: 'shutdown' });
    });
  }

  /**
   * Remove a worker from the pool
   */
  private removeWorker(pooledWorker: PooledWorker): void {
    const index = this.workers.indexOf(pooledWorker);
    if (index !== -1) {
      this.workers.splice(index, 1);
    }
    this.clearIdleTimer(pooledWorker);
  }

  /**
   * Start idle timer for a worker
   */
  private startIdleTimer(pooledWorker: PooledWorker): void {
    if (this.options.idleTimeout <= 0) return;

    const timer = setTimeout(() => {
      if (!pooledWorker.busy && this.workers.length > 1) {
        this.log(`Worker ${pooledWorker.worker.threadId} idle timeout, terminating`);
        this.terminateWorker(pooledWorker).then(() => {
          this.removeWorker(pooledWorker);
        });
      }
    }, this.options.idleTimeout);

    this.idleTimers.set(pooledWorker.worker, timer);
  }

  /**
   * Clear idle timer for a worker
   */
  private clearIdleTimer(pooledWorker: PooledWorker): void {
    const timer = this.idleTimers.get(pooledWorker.worker);
    if (timer) {
      clearTimeout(timer);
      this.idleTimers.delete(pooledWorker.worker);
    }
  }

  /**
   * Log debug message
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[WorkerPool] ${message}`);
    }
  }
}

/**
 * Create a worker pool with default options
 */
export function createWorkerPool(
  workerPath: string,
  options?: Partial<WorkerPoolOptions>
): WorkerPool {
  return new WorkerPool({
    workerPath,
    ...options,
  });
}
