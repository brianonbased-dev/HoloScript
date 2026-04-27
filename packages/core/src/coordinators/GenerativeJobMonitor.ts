/**
 * GenerativeJobMonitor — third consumer-bus that closes Pattern E for
 * the generative-AI trait cluster: AiInpainting + AiTextureGen +
 * ControlNet + DiffusionRealtime. /stub-audit Phase 3.5 found ~23
 * lifecycle events across these 4 traits with zero downstream listeners
 * (task_1777281302813_eezs).
 *
 * Follows the canonical AssetLoadCoordinator template:
 *   - Duck-typed `EventSource` ({ on(event, handler) })
 *   - Subscribes once at construction to the full job-lifecycle vocabulary
 *   - Per-job state aggregates by traitKind (inpainting/texture_gen/controlnet/diffusion_rt)
 *   - Throughput stats (jobs running, queue depth, success/failure ratio)
 *   - Unified `subscribe(listener)` surface for downstream consumers
 *   - Bus discipline: a thrown listener never crashes other listeners
 *
 * **Why these 4 traits share one bus**:
 * They all emit a parallel job-lifecycle vocabulary —
 *   `<kind>:ready` (trait initialized)
 *   `<kind>:started` (job actually running)
 *   `<kind>:queued` (waiting — texture_gen only)
 *   `<kind>:applied` / `<kind>:result` / `<kind>:frame_ready` (success)
 *   `<kind>:cancelled` / `<kind>:stopped` (user-cancelled)
 *   `<kind>:error` (failure)
 *   `<kind>:mask_set` / `<kind>:map_requested` / `<kind>:prompt_updated` (config)
 * — so a single bus can track active jobs across all 4 with one shape and
 * power downstream consumers (loading spinners, throttling logic, GPU
 * budget enforcement, latency dashboards) without re-correlating events.
 *
 * **Downstream consumers** (this bus exists so they can be built):
 *   - Studio progress overlays (in-flight inpainting/texture_gen jobs)
 *   - GPU budget enforcement (cancel queued jobs when over budget)
 *   - Latency dashboards (success/failure rates, time-to-result histograms)
 *   - Realtime-diffusion FPS display (diffusion_rt:frame_ready cadence)
 *
 * Subscribe via `traitRuntime.generativeJobMonitor.subscribe(listener)`.
 */

/** Duck-typed event source — TraitContextFactory matches this shape. */
export interface GenerativeJobEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

/** Which generative trait emitted this event. */
export type GenerativeJobKind = 'inpainting' | 'texture_gen' | 'controlnet' | 'diffusion_rt';

/** Lifecycle status of a single job. */
export type GenerativeJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'cancelled'
  | 'errored';

/** Single tracked generative job. */
export interface GenerativeJobState {
  /** Stable job identifier — requestId / textureId / sessionId / nodeId. */
  jobId: string;
  kind: GenerativeJobKind;
  status: GenerativeJobStatus;
  /** When the job was first observed (ms epoch). */
  startedAt: number;
  /** When the job last transitioned (ms epoch). */
  updatedAt: number;
  /** Set on completion / error — duration in ms from started→completed. */
  durationMs?: number;
  /** Error message when status === 'errored'. */
  error?: string;
}

/** Per-trait-kind aggregate counts. */
export interface GenerativeJobKindStats {
  queued: number;
  running: number;
  completed: number;
  cancelled: number;
  errored: number;
  /** Mean ms from started → completed across completed jobs. */
  meanLatencyMs: number;
}

export interface GenerativeJobStats {
  total: number;
  byKind: Record<GenerativeJobKind, GenerativeJobKindStats>;
  /** True when at least one trait kind has fired its `ready` event. */
  anyReady: boolean;
}

export type GenerativeJobListener = (state: GenerativeJobState) => void;

/**
 * Full generative-job event vocabulary the bus subscribes to. Sourced
 * from emit-call audit (2026-04-27).
 */
const GENERATIVE_JOB_EVENTS = [
  // --- AiInpainting ---
  'inpainting:ready',
  'inpainting:cancelled',
  'inpainting:mask_set',
  'inpainting:started',
  'inpainting:result',
  'inpainting:original_restored',
  'inpainting:error',
  // --- AiTextureGen ---
  'texture_gen:ready',
  'texture_gen:cancelled',
  'texture_gen:queued',
  'texture_gen:started',
  'texture_gen:applied',
  // --- ControlNet ---
  'controlnet:ready',
  'controlnet:cancelled',
  'controlnet:started',
  'controlnet:result',
  'controlnet:error',
  'controlnet:map_requested',
  // --- DiffusionRealtime ---
  'diffusion_rt:ready',
  'diffusion_rt:stopped',
  'diffusion_rt:started',
  'diffusion_rt:frame_ready',
  'diffusion_rt:prompt_updated',
] as const;

const KIND_PREFIXES: Array<[string, GenerativeJobKind]> = [
  ['inpainting:', 'inpainting'],
  ['texture_gen:', 'texture_gen'],
  ['controlnet:', 'controlnet'],
  ['diffusion_rt:', 'diffusion_rt'],
];

export class GenerativeJobMonitor {
  private jobs = new Map<string, GenerativeJobState>();
  private listeners = new Set<GenerativeJobListener>();
  /** Tracks which trait kinds have fired their `<kind>:ready` event. */
  private readyKinds = new Set<GenerativeJobKind>();

  constructor(source: GenerativeJobEventSource) {
    for (const event of GENERATIVE_JOB_EVENTS) {
      source.on(event, (payload: unknown) => this.handleEvent(event, payload));
    }
  }

  // ---- Event ingestion ---------------------------------------------------

  private handleEvent(event: string, payload: unknown): void {
    const kind = this.kindFromEvent(event);
    if (!kind) return;
    const phase = this.phaseFromEvent(event);
    const observedAt = Date.now();

    if (phase === 'ready') {
      this.readyKinds.add(kind);
      // Notify listeners so downstream UI consumers refresh `isReady(kind)`.
      // The synthetic state has jobId=`__ready:${kind}` and is NOT persisted
      // to the jobs map — listeners that just refetch via getStats() (the
      // canonical Studio panel pattern) handle this transparently. Listeners
      // that filter on `state.status` see 'completed' and skip it.
      this.notifyListeners({
        jobId: `__ready:${kind}`,
        kind,
        status: 'completed',
        startedAt: observedAt,
        updatedAt: observedAt,
      });
      return;
    }
    // Config events (mask_set, map_requested, prompt_updated) don't mutate
    // job state — they're observation-only for downstream consumers (which
    // can subscribe directly via the listener).
    if (phase === 'config') return;

    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;
    const jobId = this.jobIdFromPayload(p, kind);
    if (!jobId) return;

    const existing = this.jobs.get(jobId);
    const startedAt = existing?.startedAt ?? observedAt;
    let status: GenerativeJobStatus | null = null;
    let durationMs: number | undefined = existing?.durationMs;
    let error: string | undefined = existing?.error;

    if (phase === 'queued') {
      status = 'queued';
    } else if (phase === 'started') {
      status = 'running';
    } else if (phase === 'success') {
      status = 'completed';
      durationMs = observedAt - startedAt;
    } else if (phase === 'cancelled') {
      status = 'cancelled';
      durationMs = observedAt - startedAt;
    } else if (phase === 'error') {
      status = 'errored';
      durationMs = observedAt - startedAt;
      error = typeof p.error === 'string' ? p.error : typeof p.message === 'string' ? p.message : 'unknown error';
    }

    if (status === null) return;

    const next: GenerativeJobState = {
      jobId,
      kind,
      status,
      startedAt,
      updatedAt: observedAt,
      durationMs,
      error,
    };
    this.jobs.set(jobId, next);
    this.notifyListeners(next);
  }

  private kindFromEvent(event: string): GenerativeJobKind | null {
    for (const [prefix, kind] of KIND_PREFIXES) {
      if (event.startsWith(prefix)) return kind;
    }
    return null;
  }

  private phaseFromEvent(
    event: string
  ): 'ready' | 'queued' | 'started' | 'success' | 'cancelled' | 'error' | 'config' | 'unknown' {
    // Stripped to the suffix after `<kind>:`
    const suffix = event.slice(event.indexOf(':') + 1);
    if (suffix === 'ready') return 'ready';
    if (suffix === 'queued') return 'queued';
    if (suffix === 'started') return 'started';
    // Success-shape events vary per trait:
    //   inpainting:result / inpainting:original_restored
    //   texture_gen:applied
    //   controlnet:result
    //   diffusion_rt:frame_ready
    if (
      suffix === 'result' ||
      suffix === 'applied' ||
      suffix === 'original_restored' ||
      suffix === 'frame_ready'
    )
      return 'success';
    if (suffix === 'cancelled' || suffix === 'stopped') return 'cancelled';
    if (suffix === 'error') return 'error';
    // Config-shape events: mask_set / map_requested / prompt_updated
    if (suffix === 'mask_set' || suffix === 'map_requested' || suffix === 'prompt_updated') return 'config';
    return 'unknown';
  }

  /**
   * Resolve the stable job ID from a payload, falling back across the
   * fields each trait happens to use. Mirrors the heuristic in
   * AssetLoadCoordinator.handleEvent.
   */
  private jobIdFromPayload(p: Record<string, unknown>, kind: GenerativeJobKind): string | undefined {
    // diffusion_rt with a frame number → synthesize per-frame ID FIRST so
    // each frame is its own job (otherwise sessionId would collapse all
    // frames into a single overwriting job).
    if (kind === 'diffusion_rt' && typeof p.frameNumber === 'number') {
      const sid = typeof p.sessionId === 'string' ? p.sessionId : 'rt';
      return `${sid}:${p.frameNumber}`;
    }
    const candidates = [p.requestId, p.jobId, p.textureId, p.sessionId, p.nodeId, p.id];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
    return undefined;
  }

  private notifyListeners(state: GenerativeJobState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (_) {
        // Bus discipline — see AssetLoadCoordinator.notifyListeners.
      }
    }
  }

  // ---- Public API --------------------------------------------------------

  /** Subscribe to all job-state changes. Returns an unsubscribe function. */
  subscribe(listener: GenerativeJobListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getJob(jobId: string): GenerativeJobState | undefined {
    return this.jobs.get(jobId);
  }

  getAllJobs(): GenerativeJobState[] {
    return Array.from(this.jobs.values());
  }

  getJobsByKind(kind: GenerativeJobKind): GenerativeJobState[] {
    return Array.from(this.jobs.values()).filter((j) => j.kind === kind);
  }

  isReady(kind: GenerativeJobKind): boolean {
    return this.readyKinds.has(kind);
  }

  getStats(): GenerativeJobStats {
    const empty = (): GenerativeJobKindStats => ({
      queued: 0,
      running: 0,
      completed: 0,
      cancelled: 0,
      errored: 0,
      meanLatencyMs: 0,
    });
    const byKind: Record<GenerativeJobKind, GenerativeJobKindStats> = {
      inpainting: empty(),
      texture_gen: empty(),
      controlnet: empty(),
      diffusion_rt: empty(),
    };

    const latencyTotals: Record<GenerativeJobKind, { sum: number; count: number }> = {
      inpainting: { sum: 0, count: 0 },
      texture_gen: { sum: 0, count: 0 },
      controlnet: { sum: 0, count: 0 },
      diffusion_rt: { sum: 0, count: 0 },
    };

    for (const job of this.jobs.values()) {
      const stats = byKind[job.kind];
      if (job.status === 'queued') stats.queued++;
      else if (job.status === 'running') stats.running++;
      else if (job.status === 'completed') {
        stats.completed++;
        if (typeof job.durationMs === 'number') {
          latencyTotals[job.kind].sum += job.durationMs;
          latencyTotals[job.kind].count++;
        }
      } else if (job.status === 'cancelled') stats.cancelled++;
      else if (job.status === 'errored') stats.errored++;
    }

    for (const k of Object.keys(byKind) as GenerativeJobKind[]) {
      const t = latencyTotals[k];
      byKind[k].meanLatencyMs = t.count > 0 ? t.sum / t.count : 0;
    }

    return {
      total: this.jobs.size,
      byKind,
      anyReady: this.readyKinds.size > 0,
    };
  }

  /** Clear all tracked jobs — typically called on scene change. */
  reset(): void {
    this.jobs.clear();
    this.readyKinds.clear();
  }

  /** Number of distinct event types this monitor subscribes to (diagnostic). */
  get subscribedEventCount(): number {
    return GENERATIVE_JOB_EVENTS.length;
  }
}
