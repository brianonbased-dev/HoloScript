/**
 * @holoscript/studio - GenerativeJobMonitor
 *
 * Consumes AI generative-pipeline events emitted by AiInpainting, AiTextureGen,
 * ControlNet, and DiffusionRealtime traits (combined void-event count from stub-audit
 * Phase 3.5). Bridges them to job-tracking, progress reporting, and error handling
 * so Studio UI components can display live generative-AI job state.
 *
 * Pattern E consumer infrastructure — closes the missing listener side for 4 traits.
 */

import type { EventBus } from '@holoscript/runtime';

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface InpaintRequest {
  node: string;
  jobId: string;
  maskDataUrl: string;
  promptText: string;
  seed?: number;
  steps?: number;
}

export interface TextureGenRequest {
  node: string;
  jobId: string;
  promptText: string;
  resolution?: number;
  targetMesh?: string;
}

export interface ControlNetRequest {
  node: string;
  jobId: string;
  conditionType: 'depth' | 'canny' | 'pose' | 'normal' | string;
  promptText: string;
  inputImageUrl?: string;
  steps?: number;
}

export interface DiffusionRealtimeFrame {
  node: string;
  jobId: string;
  frameIndex: number;
  framePng: string;
  latency?: number;
}

export interface GenerativeJobProgress {
  node: string;
  jobId: string;
  progress: number; // 0-100
  stage?: string;
}

export interface GenerativeJobComplete {
  node: string;
  jobId: string;
  resultUrl?: string;
  resultData?: unknown;
  durationMs?: number;
}

export interface GenerativeJobError {
  node: string;
  jobId: string;
  error: string;
  retryable?: boolean;
}

// ---------------------------------------------------------------------------
// Job tracking
// ---------------------------------------------------------------------------

export type GenerativeJobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface GenerativeJobRecord {
  jobId: string;
  node: string;
  type: 'inpaint' | 'texture_gen' | 'controlnet' | 'diffusion_realtime' | string;
  status: GenerativeJobStatus;
  progress: number;
  enqueuedAt: number;
  startedAt?: number;
  completedAt?: number;
  resultUrl?: string;
  resultData?: unknown;
  error?: string;
  frames: DiffusionRealtimeFrame[];
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type JobEventHandler = (job: GenerativeJobRecord) => void;

export interface GenerativeJobMonitorOptions {
  bus: EventBus;
  /** Max completed/failed jobs to retain. Default 200. */
  maxHistory?: number;
  onJobQueued?: JobEventHandler;
  onJobProgress?: JobEventHandler;
  onJobComplete?: JobEventHandler;
  onJobFailed?: JobEventHandler;
}

// ---------------------------------------------------------------------------
// GenerativeJobMonitor
// ---------------------------------------------------------------------------

/**
 * Central monitor for AI generative-pipeline job events.
 *
 * ```ts
 * import { eventBus } from '@holoscript/runtime';
 * const monitor = new GenerativeJobMonitor({ bus: eventBus });
 * monitor.start();
 *
 * monitor.onComplete((job) => toast(`Texture generated: ${job.resultUrl}`));
 * const active = monitor.getActiveJobs();
 * ```
 */
export class GenerativeJobMonitor {
  private readonly bus: EventBus;
  private readonly maxHistory: number;
  private readonly opts: GenerativeJobMonitorOptions;
  private readonly jobs: Map<string, GenerativeJobRecord> = new Map();
  private completedHandlers: Set<JobEventHandler> = new Set();
  private failedHandlers: Set<JobEventHandler> = new Set();
  private progressHandlers: Set<JobEventHandler> = new Set();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: GenerativeJobMonitorOptions) {
    this.bus = options.bus;
    this.maxHistory = options.maxHistory ?? 200;
    this.opts = options;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  start(): void {
    if (this._started) return;
    this._started = true;

    // AiInpainting trait events
    this.unsubscribers.push(
      this.bus.on<InpaintRequest>('ai_inpaint:requested', (e) =>
        this.enqueue(e.jobId, e.node, 'inpaint')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobProgress>('ai_inpaint:progress', (e) => this.progress(e))
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobComplete>('ai_inpaint:complete', (e) =>
        this.complete(e, 'inpaint')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobError>('ai_inpaint:error', (e) => this.fail(e))
    );

    // AiTextureGen trait events
    this.unsubscribers.push(
      this.bus.on<TextureGenRequest>('ai_texture_gen:requested', (e) =>
        this.enqueue(e.jobId, e.node, 'texture_gen')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobProgress>('ai_texture_gen:progress', (e) => this.progress(e))
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobComplete>('ai_texture_gen:complete', (e) =>
        this.complete(e, 'texture_gen')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobError>('ai_texture_gen:error', (e) => this.fail(e))
    );

    // ControlNet trait events
    this.unsubscribers.push(
      this.bus.on<ControlNetRequest>('controlnet:requested', (e) =>
        this.enqueue(e.jobId, e.node, 'controlnet')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobProgress>('controlnet:progress', (e) => this.progress(e))
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobComplete>('controlnet:complete', (e) =>
        this.complete(e, 'controlnet')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobError>('controlnet:error', (e) => this.fail(e))
    );

    // DiffusionRealtime trait — streaming frames
    this.unsubscribers.push(
      this.bus.on<DiffusionRealtimeFrame>('diffusion_realtime:frame', (e) =>
        this.addFrame(e)
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobComplete>('diffusion_realtime:complete', (e) =>
        this.complete(e, 'diffusion_realtime')
      )
    );
    this.unsubscribers.push(
      this.bus.on<GenerativeJobError>('diffusion_realtime:error', (e) => this.fail(e))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  // -------------------------------------------------------------------------
  // Internal state machine
  // -------------------------------------------------------------------------

  private getOrCreate(jobId: string, node: string, type: string): GenerativeJobRecord {
    if (!this.jobs.has(jobId)) {
      this.jobs.set(jobId, {
        jobId,
        node,
        type,
        status: 'pending',
        progress: 0,
        enqueuedAt: Date.now(),
        frames: [],
      });
    }
    return this.jobs.get(jobId)!;
  }

  private enqueue(jobId: string, node: string, type: string): void {
    const job = this.getOrCreate(jobId, node, type);
    job.status = 'pending';
    this.opts.onJobQueued?.(job);
    this.bus.emit('gen_monitor:queued', job);
  }

  private progress(evt: GenerativeJobProgress): void {
    const job = this.jobs.get(evt.jobId);
    if (!job) return;
    job.status = 'running';
    job.progress = Math.min(100, Math.max(0, evt.progress));
    if (!job.startedAt) job.startedAt = Date.now();
    this.opts.onJobProgress?.(job);
    this.progressHandlers.forEach((h) => h(job));
    this.bus.emit('gen_monitor:progress', job);
  }

  private complete(evt: GenerativeJobComplete, type: string): void {
    const job = this.getOrCreate(evt.jobId, evt.node ?? '', type);
    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    if (evt.resultUrl) job.resultUrl = evt.resultUrl;
    if (evt.resultData !== undefined) job.resultData = evt.resultData;
    this.prune();
    this.opts.onJobComplete?.(job);
    this.completedHandlers.forEach((h) => h(job));
    this.bus.emit('gen_monitor:complete', job);
  }

  private fail(evt: GenerativeJobError): void {
    const job = this.jobs.get(evt.jobId);
    if (!job) return;
    job.status = 'failed';
    job.error = evt.error;
    job.completedAt = Date.now();
    this.prune();
    this.opts.onJobFailed?.(job);
    this.failedHandlers.forEach((h) => h(job));
    this.bus.emit('gen_monitor:failed', job);
  }

  private addFrame(evt: DiffusionRealtimeFrame): void {
    const job = this.getOrCreate(evt.jobId, evt.node, 'diffusion_realtime');
    if (!job.startedAt) job.startedAt = Date.now();
    job.status = 'running';
    job.frames.push(evt);
    this.bus.emit('gen_monitor:frame', { job, frame: evt });
  }

  private prune(): void {
    const finished = Array.from(this.jobs.values()).filter(
      (j) => j.status === 'completed' || j.status === 'failed'
    );
    if (finished.length > this.maxHistory) {
      finished
        .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
        .slice(0, finished.length - this.maxHistory)
        .forEach((j) => this.jobs.delete(j.jobId));
    }
  }

  // -------------------------------------------------------------------------
  // Handler registration
  // -------------------------------------------------------------------------

  onComplete(handler: JobEventHandler): () => void {
    this.completedHandlers.add(handler);
    return () => this.completedHandlers.delete(handler);
  }

  onFailed(handler: JobEventHandler): () => void {
    this.failedHandlers.add(handler);
    return () => this.failedHandlers.delete(handler);
  }

  onProgress(handler: JobEventHandler): () => void {
    this.progressHandlers.add(handler);
    return () => this.progressHandlers.delete(handler);
  }

  // -------------------------------------------------------------------------
  // Query API
  // -------------------------------------------------------------------------

  getJob(jobId: string): GenerativeJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  getActiveJobs(): GenerativeJobRecord[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.status === 'pending' || j.status === 'running'
    );
  }

  getCompletedJobs(): GenerativeJobRecord[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === 'completed');
  }

  getFailedJobs(): GenerativeJobRecord[] {
    return Array.from(this.jobs.values()).filter((j) => j.status === 'failed');
  }

  getByType(type: string): GenerativeJobRecord[] {
    return Array.from(this.jobs.values()).filter((j) => j.type === type);
  }

  get totalJobs(): number {
    return this.jobs.size;
  }

  get started(): boolean {
    return this._started;
  }

  clearHistory(): void {
    for (const [id, job] of this.jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        this.jobs.delete(id);
      }
    }
  }
}
