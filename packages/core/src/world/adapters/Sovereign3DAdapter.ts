/**
 * Sovereign3DAdapter — native HoloScript world generation
 *
 * Powered by the Brittney v43 generative model. This is the canonical
 * first-class adapter for the sovereign-3d engine. External bridge adapters
 * are intentionally excluded to enforce sovereign generation by default.
 *
 * The adapter hits the local Brittney inference endpoint when available,
 * and falls back to the HoloScript MCP generation pipeline.
 *
 * @engine  sovereign-3d
 * @model   Brittney v43+
 */

import type {
  WorldGeneratorAdapter,
  WorldGenerationRequest,
  WorldGenerationResult,
  WorldMetadata,
} from '../WorldGeneratorAdapter';

// =============================================================================
// OPTIONS
// =============================================================================

export interface Sovereign3DAdapterOptions {
  /** Brittney inference endpoint (default: env HOLOSCRIPT_SOVEREIGN_BASE_URL) */
  baseUrl?: string;
  /** API key for the sovereign endpoint (default: env HOLOSCRIPT_SOVEREIGN_API_KEY) */
  apiKey?: string;
  /** Generation timeout in ms (default: 300_000) */
  timeoutMs?: number;
  /** Poll interval in ms (default: 2_000) */
  pollIntervalMs?: number;
}

// =============================================================================
// INTERNAL TYPES
// =============================================================================

interface SovereignGeneratePayload {
  prompt: string;
  output_format: 'splat' | 'mesh' | 'both' | 'neural_field';
  quality_preset: 'draft' | 'standard' | 'high' | 'ultra';
  input_images?: string;
  seed?: number;
  nav_enabled?: boolean;
  interactive_mode?: boolean;
}

interface SovereignJobResponse {
  job_id: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  progress?: number;
  asset_url?: string;
  navmesh_url?: string;
  point_cloud_url?: string;
  metadata?: Record<string, unknown>;
  error?: string;
}

// =============================================================================
// QUALITY / FORMAT MAPS — sovereign preset vocabulary
// =============================================================================

const QUALITY_MAP: Record<string, SovereignGeneratePayload['quality_preset']> = {
  low: 'draft',
  medium: 'standard',
  high: 'high',
  ultra: 'ultra',
};

const FORMAT_MAP: Record<string, SovereignGeneratePayload['output_format']> = {
  '3dgs': 'splat',
  mesh: 'mesh',
  both: 'both',
  neural_field: 'neural_field',
};

// =============================================================================
// DEFAULT ENV VALUES
// =============================================================================

const DEFAULT_BASE_URL =
  (typeof process !== 'undefined' && process.env.HOLOSCRIPT_SOVEREIGN_BASE_URL) ||
  'https://api.holoscript.net/sovereign';

const DEFAULT_API_KEY =
  (typeof process !== 'undefined' && process.env.HOLOSCRIPT_SOVEREIGN_API_KEY) || '';

const DEFAULT_TIMEOUT_MS =
  (typeof process !== 'undefined' && process.env.HOLOSCRIPT_SOVEREIGN_TIMEOUT_MS)
    ? parseInt(process.env.HOLOSCRIPT_SOVEREIGN_TIMEOUT_MS, 10)
    : 300_000;

// =============================================================================
// ADAPTER
// =============================================================================

export class Sovereign3DAdapter implements WorldGeneratorAdapter {
  readonly id = 'sovereign-3d';

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(options: Sovereign3DAdapterOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    this.apiKey = options.apiKey ?? DEFAULT_API_KEY;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.pollIntervalMs = options.pollIntervalMs ?? 2_000;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  async generate(req: WorldGenerationRequest): Promise<WorldGenerationResult> {
    const jobId = await this.submitJob(req);
    return this.waitForCompletion(jobId);
  }

  async getProgress(generationId: string): Promise<number> {
    const job = await this.fetchJob(generationId);
    return job.progress ?? (job.status === 'done' ? 1 : 0);
  }

  async cancel(generationId: string): Promise<void> {
    await this.request(`/api/jobs/${generationId}/cancel`, { method: 'POST' });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private async submitJob(req: WorldGenerationRequest): Promise<string> {
    const inputImages = req.input_images?.join(',') ?? req.input_image;

    const payload: SovereignGeneratePayload = {
      prompt: req.prompt,
      output_format: FORMAT_MAP[req.format] ?? 'splat',
      quality_preset: QUALITY_MAP[req.quality] ?? 'standard',
      ...(inputImages ? { input_images: inputImages } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.navEnabled !== undefined ? { nav_enabled: req.navEnabled } : {}),
      ...(req.interactiveMode !== undefined ? { interactive_mode: req.interactiveMode } : {}),
    };

    const response = await this.request<{ job_id: string }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.job_id) {
      throw new Error('[Sovereign3DAdapter] /api/generate did not return a job_id');
    }

    return response.job_id;
  }

  private async waitForCompletion(jobId: string): Promise<WorldGenerationResult> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const job = await this.fetchJob(jobId);

      if (job.status === 'done') {
        return this.mapResult(job);
      }

      if (job.status === 'error') {
        throw new Error(
          `[Sovereign3DAdapter] Job ${jobId} failed: ${job.error ?? 'unknown error'}`
        );
      }

      await this.sleep(this.pollIntervalMs);
    }

    throw new Error(
      `[Sovereign3DAdapter] Job ${jobId} timed out after ${this.timeoutMs}ms`
    );
  }

  private async fetchJob(jobId: string): Promise<SovereignJobResponse> {
    return this.request<SovereignJobResponse>(`/api/jobs/${jobId}`);
  }

  private mapResult(job: SovereignJobResponse): WorldGenerationResult {
    if (!job.asset_url) {
      throw new Error(
        `[Sovereign3DAdapter] Job ${job.job_id} completed but returned no asset_url`
      );
    }

    const rawMeta = job.metadata ?? {};
    const bounds = (rawMeta.bounds as [number, number, number, number, number, number] | undefined) ??
      [-10, 0, -10, 10, 5, 10];

    const metadata: WorldMetadata = {
      format: job.asset_url.endsWith('.glb') ? 'mesh' : job.asset_url.includes('neural') ? 'neural_field' : '3dgs',
      bounds,
      ...(rawMeta.agent_start ? { agentStart: rawMeta.agent_start as [number, number, number] } : {}),
      ...(rawMeta.waypoints ? { waypoints: rawMeta.waypoints as [number, number, number][] } : {}),
      ...(rawMeta.splat_count ? { splatCount: rawMeta.splat_count as number } : {}),
      ...(rawMeta.triangle_count ? { triangleCount: rawMeta.triangle_count as number } : {}),
      ...(rawMeta.generation_ms ? { generationMs: rawMeta.generation_ms as number } : {}),
    };

    return {
      generationId: job.job_id,
      assetUrl: job.asset_url,
      ...(job.navmesh_url ? { navmeshUrl: job.navmesh_url } : {}),
      ...(job.point_cloud_url ? { pointCloudUrl: job.point_cloud_url } : {}),
      metadata,
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };

    const res = await fetch(url, { ...init, headers: { ...headers, ...(init.headers as Record<string, string> ?? {}) } });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `[Sovereign3DAdapter] HTTP ${res.status} at ${path}${text ? ': ' + text : ''}`
      );
    }

    return res.json() as Promise<T>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
