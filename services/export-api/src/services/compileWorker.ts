/**
 * Compile Worker Service
 *
 * Manages async compilation jobs for HoloScript source code.
 * ADR-002: All compilations are async (202 Accepted, no sync mode).
 *
 * Job lifecycle:
 * 1. Submit: Source validated, job created with status 'pending'
 * 2. Process: Worker picks up job, sets status 'processing'
 * 3. Complete: Compilation result stored, status 'completed'
 * 4. Error: Compilation failed, status 'failed' with error details
 *
 * In production, this would use a proper job queue (BullMQ/Redis)
 * and worker processes. The scaffold uses in-memory simulation.
 */

import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { config } from '../config.js';

/** Compile job status */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/** Compile job record */
export interface CompileJob {
  /** Unique job ID */
  id: string;
  /** Job status */
  status: JobStatus;
  /** Export target */
  target: string;
  /** SHA-256 hash of the source code */
  sourceHash: string;
  /** Compilation options */
  options: Record<string, unknown>;
  /** Idempotency key (optional) */
  idempotencyKey?: string;
  /** Creator identity */
  createdBy: string;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
  /** Start processing timestamp */
  startedAt?: string;
  /** Completion timestamp */
  completedAt?: string;
  /** Output download URL (signed, temporary) */
  outputUrl?: string;
  /** Output size in bytes */
  outputSizeBytes?: number;
  /** Output content type */
  outputContentType?: string;
  /** Error message (if failed) */
  error?: string;
  /** Processing duration in ms */
  durationMs?: number;
}

/** In-memory job store (replace with database in production) */
class JobStore {
  private jobs: Map<string, CompileJob> = new Map();
  private idempotencyIndex: Map<string, string> = new Map();

  create(job: CompileJob): void {
    this.jobs.set(job.id, job);
    if (job.idempotencyKey) {
      this.idempotencyIndex.set(job.idempotencyKey, job.id);
    }
  }

  get(id: string): CompileJob | undefined {
    return this.jobs.get(id);
  }

  update(id: string, updates: Partial<CompileJob>): CompileJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    return updated;
  }

  findByIdempotencyKey(key: string): CompileJob | undefined {
    const id = this.idempotencyIndex.get(key);
    return id ? this.jobs.get(id) : undefined;
  }

  listByCreator(createdBy: string, limit: number = 50): CompileJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.createdBy === createdBy)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }
}

const jobStore = new JobStore();

/** Supported export targets */
export const SUPPORTED_TARGETS = [
  'unity', 'unreal', 'godot', 'vrchat', 'openxr',
  'android', 'ios', 'visionos',
  'ar', 'babylon', 'webgpu', 'r3f', 'wasm', 'playcanvas',
  'urdf', 'sdf', 'usd', 'usdz',
  'dtdl', 'vrr',
] as const;

export type ExportTarget = (typeof SUPPORTED_TARGETS)[number];

export class CompileWorkerService {
  /**
   * Submit a new compilation job.
   * ADR-002: Returns 202 Accepted with job ID immediately.
   */
  async submit(params: {
    source: string;
    target: string;
    options?: Record<string, unknown>;
    idempotencyKey?: string;
    createdBy: string;
  }): Promise<CompileJob> {
    const { source, target, options = {}, idempotencyKey, createdBy } = params;

    // Check idempotency
    if (idempotencyKey) {
      const existing = jobStore.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ jobId: existing.id, idempotencyKey }, 'Returning existing job (idempotency hit)');
        return existing;
      }
    }

    // Validate target
    if (!SUPPORTED_TARGETS.includes(target as ExportTarget)) {
      throw new Error(`Unsupported target: ${target}. Supported: ${SUPPORTED_TARGETS.join(', ')}`);
    }

    // Create job
    const now = new Date().toISOString();
    const sourceHash = crypto.createHash('sha256').update(source).digest('hex');

    const job: CompileJob = {
      id: crypto.randomUUID(),
      status: 'pending',
      target,
      sourceHash,
      options,
      idempotencyKey,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };

    jobStore.create(job);

    logger.info({
      jobId: job.id,
      target,
      sourceHash: sourceHash.slice(0, 12),
      createdBy,
    }, 'Compile job submitted');

    // Simulate async processing (in production: enqueue to BullMQ)
    this.processJob(job.id, source).catch((err) => {
      logger.error({ jobId: job.id, error: err.message }, 'Compile job processing error');
    });

    return job;
  }

  /**
   * Get job status.
   */
  getJob(jobId: string): CompileJob | undefined {
    return jobStore.get(jobId);
  }

  /**
   * List jobs for a creator.
   */
  listJobs(createdBy: string, limit?: number): CompileJob[] {
    return jobStore.listByCreator(createdBy, limit);
  }

  /**
   * Cancel a pending job.
   */
  cancelJob(jobId: string, requestedBy: string): CompileJob | undefined {
    const job = jobStore.get(jobId);
    if (!job) return undefined;
    if (job.status !== 'pending') return job; // Can only cancel pending jobs

    return jobStore.update(jobId, {
      status: 'cancelled',
      error: `Cancelled by ${requestedBy}`,
    });
  }

  /**
   * Get list of supported export targets.
   */
  getTargets(): { targets: typeof SUPPORTED_TARGETS; count: number } {
    return { targets: SUPPORTED_TARGETS, count: SUPPORTED_TARGETS.length };
  }

  // ===========================================================================
  // PRIVATE: Job Processing (simulated)
  // ===========================================================================

  private async processJob(jobId: string, source: string): Promise<void> {
    // Simulate processing delay
    await new Promise((resolve) => setTimeout(resolve, 100));

    jobStore.update(jobId, {
      status: 'processing',
      startedAt: new Date().toISOString(),
    });

    try {
      // Simulate compilation (in production: invoke @holoscript/core compiler)
      const startTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 2000 + 500));
      const durationMs = Date.now() - startTime;

      // Simulate output
      const outputSize = Math.floor(source.length * (0.5 + Math.random()));
      const outputUrl = `/api/v1/compile/${jobId}/output`; // In production: signed S3 URL

      jobStore.update(jobId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        outputUrl,
        outputSizeBytes: outputSize,
        outputContentType: 'application/octet-stream',
        durationMs,
      });

      logger.info({
        jobId,
        durationMs,
        outputSizeBytes: outputSize,
      }, 'Compile job completed');
    } catch (error) {
      jobStore.update(jobId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logger.error({
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Compile job failed');
    }
  }
}

export const compileWorkerService = new CompileWorkerService();
