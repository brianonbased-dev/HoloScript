/**
 * ImportPipeline — Multi-stage asset import with validation and batch processing
 *
 * @version 1.0.0
 */

import { ModelImporter, type ImportResult } from './ModelImporter';
import { TextureProcessor, type TextureInput, type ProcessedTexture } from './TextureProcessor';

export type PipelineStage = 'validate' | 'parse' | 'process' | 'optimize' | 'finalize';

export interface PipelineJob {
  id: string;
  filename: string;
  type: 'model' | 'texture';
  data: ArrayBuffer | string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  result?: ImportResult | ProcessedTexture;
  error?: string;
  stage: PipelineStage;
}

export interface PipelineStats {
  totalJobs: number;
  completed: number;
  failed: number;
  queued: number;
}

export class ImportPipeline {
  private jobs: Map<string, PipelineJob> = new Map();
  private modelImporter: ModelImporter = new ModelImporter();
  private textureProcessor: TextureProcessor = new TextureProcessor();
  private jobId: number = 0;

  /**
   * Add a model import job
   */
  addModelJob(filename: string, data: ArrayBuffer | string): string {
    const id = `job_${this.jobId++}`;
    this.jobs.set(id, { id, filename, type: 'model', data, status: 'queued', stage: 'validate' });
    return id;
  }

  /**
   * Add a texture processing job
   */
  addTextureJob(filename: string, input: TextureInput): string {
    const id = `job_${this.jobId++}`;
    this.jobs.set(id, {
      id,
      filename,
      type: 'texture',
      data: JSON.stringify(input),
      status: 'queued',
      stage: 'validate',
    });
    return id;
  }

  /**
   * Run all queued jobs
   */
  runAll(): PipelineStats {
    for (const job of this.jobs.values()) {
      if (job.status !== 'queued') continue;
      this.runJob(job);
    }
    return this.getStats();
  }

  /**
   * Run a single job
   */
  private runJob(job: PipelineJob): void {
    job.status = 'running';

    try {
      // Validate
      job.stage = 'validate';
      if (!job.filename) throw new Error('Missing filename');

      // Parse
      job.stage = 'parse';
      if (job.type === 'model') {
        const result = this.modelImporter.import(job.filename, job.data);
        if (result.errors.length > 0) {
          throw new Error(result.errors.join('; '));
        }
        job.stage = 'process';
        job.stage = 'finalize';
        job.result = result;
      } else {
        job.stage = 'process';
        const input = JSON.parse(job.data as string) as TextureInput;
        job.result = this.textureProcessor.process(input);
        job.stage = 'finalize';
      }

      job.status = 'completed';
    } catch (err) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Get job by ID
   */
  getJob(id: string): PipelineJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get pipeline stats
   */
  getStats(): PipelineStats {
    let completed = 0,
      failed = 0,
      queued = 0;
    for (const job of this.jobs.values()) {
      if (job.status === 'completed') completed++;
      else if (job.status === 'failed') failed++;
      else if (job.status === 'queued') queued++;
    }
    return { totalJobs: this.jobs.size, completed, failed, queued };
  }

  /**
   * Clear all jobs
   */
  clear(): void {
    this.jobs.clear();
  }
  getJobCount(): number {
    return this.jobs.size;
  }
}
