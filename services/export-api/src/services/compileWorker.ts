/**
 * Compile Worker Service
 *
 * Manages async compilation jobs for HoloScript source code.
 * ADR-002: All compilations are async (202 Accepted, no sync mode).
 *
 * Job lifecycle:
 * 1. Submit: Source validated, stored on disk, job created with status 'pending'
 * 2. Process: Worker picks up job, sets status 'processing'
 * 3. Complete: Real @holoscript/core compiler output stored on disk
 * 4. Error: Compilation failed, status 'failed' with error details
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  exportComposition,
  parseHolo,
  type ExportTarget as CoreExportTarget,
} from '@holoscript/core';
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
  /** Source storage path (source bytes are not stored in the job JSON record) */
  sourcePath?: string;
  /** Output storage path */
  outputPath?: string;
  /** Output download URL (signed, temporary) */
  outputUrl?: string;
  /** Output file name */
  outputFileName?: string;
  /** Output size in bytes */
  outputSizeBytes?: number;
  /** Output SHA-256 hex digest */
  outputSha256?: string;
  /** Output content type */
  outputContentType?: string;
  /** Error message (if failed) */
  error?: string;
  /** Processing duration in ms */
  durationMs?: number;
}

export interface CompileOutput {
  readonly buffer: Buffer;
  readonly contentType: string;
  readonly fileName: string;
  readonly sizeBytes: number;
}

/** Supported export targets */
export const SUPPORTED_TARGETS = [
  'unity', 'unreal', 'godot', 'vrchat', 'openxr',
  'android', 'ios', 'visionos',
  'ar', 'babylon', 'webgpu', 'r3f', 'wasm', 'playcanvas',
  'urdf', 'sdf', 'usd', 'usdz',
  'dtdl', 'vrr',
] as const;

export type ExportTarget = (typeof SUPPORTED_TARGETS)[number];

const OUTPUT_EXTENSIONS: Record<ExportTarget, string> = {
  unity: 'cs',
  unreal: 'cpp',
  godot: 'gd',
  vrchat: 'cs',
  openxr: 'ts',
  android: 'kt',
  ios: 'swift',
  visionos: 'swift',
  ar: 'json',
  babylon: 'ts',
  webgpu: 'ts',
  r3f: 'tsx',
  wasm: 'wat',
  playcanvas: 'js',
  urdf: 'urdf',
  sdf: 'sdf',
  usd: 'usda',
  usdz: 'usdz.json',
  dtdl: 'json',
  vrr: 'json',
};

const OUTPUT_CONTENT_TYPES: Record<ExportTarget, string> = {
  unity: 'text/x-csharp; charset=utf-8',
  unreal: 'text/x-c++; charset=utf-8',
  godot: 'text/plain; charset=utf-8',
  vrchat: 'text/x-csharp; charset=utf-8',
  openxr: 'text/typescript; charset=utf-8',
  android: 'text/plain; charset=utf-8',
  ios: 'text/plain; charset=utf-8',
  visionos: 'text/plain; charset=utf-8',
  ar: 'application/json; charset=utf-8',
  babylon: 'text/typescript; charset=utf-8',
  webgpu: 'text/typescript; charset=utf-8',
  r3f: 'text/tsx; charset=utf-8',
  wasm: 'text/plain; charset=utf-8',
  playcanvas: 'text/javascript; charset=utf-8',
  urdf: 'application/xml; charset=utf-8',
  sdf: 'application/xml; charset=utf-8',
  usd: 'text/plain; charset=utf-8',
  usdz: 'application/json; charset=utf-8',
  dtdl: 'application/json; charset=utf-8',
  vrr: 'application/json; charset=utf-8',
};

function resolveDataDir(): string {
  return path.resolve(process.env.EXPORT_API_DATA_DIR ?? path.join(process.cwd(), '.data', 'export-api'));
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function serializeCompilerOutput(output: unknown): Buffer {
  if (typeof output === 'string') {
    return Buffer.from(output, 'utf8');
  }
  return Buffer.from(JSON.stringify(output, null, 2), 'utf8');
}

function formatParseErrors(result: ReturnType<typeof parseHolo>): string {
  const errors = (result as { errors?: Array<{ message?: string }> }).errors ?? [];
  if (errors.length === 0) {
    return 'unknown parse error';
  }
  return errors.map((err) => err.message ?? String(err)).join('; ');
}

class JobStore {
  private readonly jobs: Map<string, CompileJob> = new Map();
  private readonly idempotencyIndex: Map<string, string> = new Map();
  private readonly jobsPath: string;
  private readonly sourcesDir: string;
  private readonly outputsDir: string;

  constructor(private readonly dataDir: string = resolveDataDir()) {
    ensureDir(this.dataDir);
    this.sourcesDir = path.join(this.dataDir, 'sources');
    this.outputsDir = path.join(this.dataDir, 'outputs');
    this.jobsPath = path.join(this.dataDir, 'compile-jobs.json');
    ensureDir(this.sourcesDir);
    ensureDir(this.outputsDir);
    this.load();
  }

  create(job: CompileJob): void {
    this.jobs.set(job.id, job);
    if (job.idempotencyKey) {
      this.idempotencyIndex.set(job.idempotencyKey, job.id);
    }
    this.persist();
  }

  get(id: string): CompileJob | undefined {
    return this.jobs.get(id);
  }

  update(id: string, updates: Partial<CompileJob>): CompileJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    const updated = { ...job, ...updates, updatedAt: new Date().toISOString() };
    this.jobs.set(id, updated);
    if (updated.idempotencyKey) {
      this.idempotencyIndex.set(updated.idempotencyKey, id);
    }
    this.persist();
    return updated;
  }

  findByIdempotencyKey(key: string): CompileJob | undefined {
    const id = this.idempotencyIndex.get(key);
    return id ? this.jobs.get(id) : undefined;
  }

  listByCreator(createdBy: string, limit = 50): CompileJob[] {
    return Array.from(this.jobs.values())
      .filter((j) => j.createdBy === createdBy)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  listQueued(): CompileJob[] {
    return Array.from(this.jobs.values()).filter(
      (job) => job.status === 'pending' || job.status === 'processing',
    );
  }

  writeSource(jobId: string, source: string): string {
    const sourcePath = path.join(this.sourcesDir, `${jobId}.holo`);
    fs.writeFileSync(sourcePath, source, { encoding: 'utf8', mode: 0o600 });
    return sourcePath;
  }

  readSource(job: CompileJob): string {
    if (!job.sourcePath) {
      throw new Error('Job source path is missing');
    }
    return fs.readFileSync(job.sourcePath, 'utf8');
  }

  writeOutput(jobId: string, target: ExportTarget, buffer: Buffer): { outputPath: string; fileName: string } {
    const fileName = `${jobId}.${OUTPUT_EXTENSIONS[target]}`;
    const outputPath = path.join(this.outputsDir, fileName);
    fs.writeFileSync(outputPath, buffer, { mode: 0o600 });
    return { outputPath, fileName };
  }

  readOutput(job: CompileJob): CompileOutput | undefined {
    if (!job.outputPath || !job.outputContentType || !job.outputFileName) {
      return undefined;
    }
    if (!fs.existsSync(job.outputPath)) {
      return undefined;
    }
    const buffer = fs.readFileSync(job.outputPath);
    return {
      buffer,
      contentType: job.outputContentType,
      fileName: job.outputFileName,
      sizeBytes: buffer.byteLength,
    };
  }

  private load(): void {
    if (!fs.existsSync(this.jobsPath)) {
      return;
    }
    const parsed = safeJsonParse<CompileJob[]>(fs.readFileSync(this.jobsPath, 'utf8'), []);
    for (const job of parsed) {
      this.jobs.set(job.id, job);
      if (job.idempotencyKey) {
        this.idempotencyIndex.set(job.idempotencyKey, job.id);
      }
    }
  }

  private persist(): void {
    const tmp = `${this.jobsPath}.tmp`;
    const payload = JSON.stringify(Array.from(this.jobs.values()), null, 2);
    fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, this.jobsPath);
  }
}

const jobStore = new JobStore();

export class CompileWorkerService {
  private readonly activeJobs = new Set<string>();

  constructor(private readonly store: JobStore = jobStore) {
    queueMicrotask(() => this.resumeQueuedJobs());
  }

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

    if (idempotencyKey) {
      const existing = this.store.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        logger.info({ jobId: existing.id, idempotencyKey }, 'Returning existing job (idempotency hit)');
        return existing;
      }
    }

    if (!SUPPORTED_TARGETS.includes(target as ExportTarget)) {
      throw new Error(`Unsupported target: ${target}. Supported: ${SUPPORTED_TARGETS.join(', ')}`);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const sourceHash = sha256Hex(source);
    const sourcePath = this.store.writeSource(id, source);

    const job: CompileJob = {
      id,
      status: 'pending',
      target,
      sourceHash,
      sourcePath,
      options,
      idempotencyKey,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };

    this.store.create(job);

    logger.info({
      jobId: job.id,
      target,
      sourceHash: sourceHash.slice(0, 12),
      createdBy,
    }, 'Compile job submitted');

    this.enqueue(job.id);
    return job;
  }

  getJob(jobId: string): CompileJob | undefined {
    return this.store.get(jobId);
  }

  listJobs(createdBy: string, limit?: number): CompileJob[] {
    return this.store.listByCreator(createdBy, limit);
  }

  cancelJob(jobId: string, requestedBy: string): CompileJob | undefined {
    const job = this.store.get(jobId);
    if (!job) return undefined;
    if (job.status !== 'pending') return job;

    return this.store.update(jobId, {
      status: 'cancelled',
      error: `Cancelled by ${requestedBy}`,
    });
  }

  getTargets(): { targets: typeof SUPPORTED_TARGETS; count: number } {
    return { targets: SUPPORTED_TARGETS, count: SUPPORTED_TARGETS.length };
  }

  getOutput(jobId: string): CompileOutput | undefined {
    const job = this.store.get(jobId);
    return job ? this.store.readOutput(job) : undefined;
  }

  getSignedOutputUrl(job: CompileJob, expiresInMs = 3_600_000): string {
    if (!job.outputSha256) {
      throw new Error('Cannot sign output URL before output exists');
    }
    const expires = Date.now() + expiresInMs;
    const signature = this.signOutput(job.id, job.outputSha256, expires);
    return `/api/v1/compile/${job.id}/output?expires=${expires}&signature=${signature}`;
  }

  verifySignedOutputUrl(job: CompileJob, expiresRaw: unknown, signatureRaw: unknown): boolean {
    if (!job.outputSha256 || typeof signatureRaw !== 'string') {
      return false;
    }
    const expires = typeof expiresRaw === 'string' ? Number.parseInt(expiresRaw, 10) : Number.NaN;
    if (!Number.isFinite(expires) || expires < Date.now()) {
      return false;
    }
    const expected = this.signOutput(job.id, job.outputSha256, expires);
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(signatureRaw, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length &&
      crypto.timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private enqueue(jobId: string): void {
    if (this.activeJobs.has(jobId)) {
      return;
    }
    this.activeJobs.add(jobId);
    setImmediate(() => {
      this.processJob(jobId).catch((err) => {
        logger.error({ jobId, error: err.message }, 'Compile job processing error');
      });
    });
  }

  private resumeQueuedJobs(): void {
    for (const job of this.store.listQueued()) {
      this.enqueue(job.id);
    }
  }

  private async processJob(jobId: string): Promise<void> {
    const job = this.store.get(jobId);
    if (!job || job.status === 'cancelled') {
      this.activeJobs.delete(jobId);
      return;
    }

    this.store.update(jobId, {
      status: 'processing',
      startedAt: job.startedAt ?? new Date().toISOString(),
      error: undefined,
    });

    const startTime = Date.now();
    try {
      const current = this.store.get(jobId);
      if (!current) {
        throw new Error('Job disappeared during processing');
      }

      const source = this.store.readSource(current);
      const target = current.target as ExportTarget;
      const output = await this.compileSource(source, target, current.options);
      const buffer = serializeCompilerOutput(output);
      const outputSha256 = sha256Hex(buffer);
      const { outputPath, fileName } = this.store.writeOutput(jobId, target, buffer);
      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      const completed = this.store.update(jobId, {
        status: 'completed',
        completedAt,
        outputPath,
        outputFileName: fileName,
        outputSha256,
        outputSizeBytes: buffer.byteLength,
        outputContentType: OUTPUT_CONTENT_TYPES[target],
        durationMs,
      });

      if (completed) {
        this.store.update(jobId, {
          outputUrl: this.getSignedOutputUrl(completed),
        });
      }

      logger.info({
        jobId,
        durationMs,
        outputSizeBytes: buffer.byteLength,
      }, 'Compile job completed');
    } catch (error) {
      this.store.update(jobId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      logger.error({
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Compile job failed');
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  private async compileSource(
    source: string,
    target: ExportTarget,
    options: Record<string, unknown>,
  ): Promise<unknown> {
    const parsed = parseHolo(source);
    if (!parsed.success || !parsed.ast) {
      throw new Error(`Parse failed: ${formatParseErrors(parsed)}`);
    }

    const result = await exportComposition(target as CoreExportTarget, parsed.ast, {
      useCircuitBreaker: false,
      useFallback: false,
      throwOnError: true,
      compilerOptions: options,
      agentToken: 'export-api',
    });

    if (!result.success) {
      throw result.error ?? new Error(`Compilation failed for target ${target}`);
    }
    return result.output ?? '';
  }

  private signOutput(jobId: string, outputSha256: string, expires: number): string {
    return crypto
      .createHmac('sha256', config.jwtSecret)
      .update(`${jobId}.${outputSha256}.${expires}`)
      .digest('hex');
  }
}

export const compileWorkerService = new CompileWorkerService();
