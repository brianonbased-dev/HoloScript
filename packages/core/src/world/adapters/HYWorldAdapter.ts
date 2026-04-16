/**
 * HYWorldAdapter — HY-World 2.0 backend client
 *
 * Drives Tencent HunyuanVideo's world generation pipeline.
 *
 * Access tiers today (April 2026):
 *   WorldMirror 2.0   → public weights + REST API on HF Spaces (usable now)
 *   Full pipeline      → apply-for-access gate (HY-Pano, WorldNav, WorldStereo, WorldLens)
 *
 * Configuration (env vars):
 *   HOLOSCRIPT_HY_WORLD_BASE_URL   default: https://huggingface.co/spaces/tencent/HunyuanWorld-1
 *   HOLOSCRIPT_HY_WORLD_API_KEY    optional bearer token (required for non-public deployments)
 *   HOLOSCRIPT_HY_WORLD_TIMEOUT_MS default: 300000 (5 min — generation is slow)
 *
 * Local inference:
 *   Set HOLOSCRIPT_HY_WORLD_BASE_URL=http://localhost:7860 to target a local ComfyUI/Gradio instance.
 */

import type {
  WorldGeneratorAdapter,
  WorldGenerationRequest,
  WorldGenerationResult,
  WorldMetadata,
} from './WorldGeneratorAdapter';

// =============================================================================
// INTERNAL TYPES (HY-World 2.0 REST schema)
// =============================================================================

interface HYGeneratePayload {
  prompt: string;
  /** Comma-separated paths/URLs for multi-view mode */
  input_images?: string;
  output_format: 'splat' | 'mesh' | 'both';
  /** Maps to HY-World resolution preset: 'draft'|'standard'|'fine'|'ultra' */
  quality_preset: string;
  seed?: number;
  /** Enable WorldNav navmesh output (full pipeline only) */
  nav_enabled?: boolean;
  /** Enable WorldLens interactive/physics mode (full pipeline only) */
  interactive_mode?: boolean;
}

interface HYJobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress?: number;
  asset_url?: string;
  navmesh_url?: string;
  point_cloud_url?: string;
  metadata?: {
    bounds?: number[];
    agent_start?: number[];
    waypoints?: number[][];
    splat_count?: number;
    triangle_count?: number;
    generation_ms?: number;
  };
  error?: string;
}

// =============================================================================
// QUALITY MAP
// =============================================================================

const QUALITY_MAP: Record<string, string> = {
  low: 'draft',
  medium: 'standard',
  high: 'fine',
  ultra: 'ultra',
};

const FORMAT_MAP: Record<string, 'splat' | 'mesh' | 'both'> = {
  '3dgs': 'splat',
  mesh: 'mesh',
  both: 'both',
};

// =============================================================================
// ADAPTER
// =============================================================================

export interface HYWorldAdapterOptions {
  baseUrl?: string;
  apiKey?: string;
  /** Max ms to wait for job completion (default 300 000) */
  timeoutMs?: number;
  /** Poll interval in ms (default 2 000) */
  pollIntervalMs?: number;
}

export class HYWorldAdapter implements WorldGeneratorAdapter {
  readonly id = 'hy-world-2.0';

  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly pollIntervalMs: number;

  constructor(options: HYWorldAdapterOptions = {}) {
    this.baseUrl = (
      options.baseUrl ??
      process.env['HOLOSCRIPT_HY_WORLD_BASE_URL'] ??
      'https://huggingface.co/spaces/tencent/HunyuanWorld-1'
    ).replace(/\/$/, '');

    this.apiKey =
      options.apiKey ?? process.env['HOLOSCRIPT_HY_WORLD_API_KEY'];

    this.timeoutMs =
      options.timeoutMs ??
      Number(process.env['HOLOSCRIPT_HY_WORLD_TIMEOUT_MS'] ?? '300000');

    this.pollIntervalMs = options.pollIntervalMs ?? 2000;
  }

  // ---------------------------------------------------------------------------
  // PUBLIC API
  // ---------------------------------------------------------------------------

  async generate(req: WorldGenerationRequest): Promise<WorldGenerationResult> {
    const jobId = await this.submitJob(req);
    const result = await this.waitForCompletion(jobId);
    return result;
  }

  async getProgress(generationId: string): Promise<number> {
    const job = await this.fetchJob(generationId);
    return job.progress ?? (job.status === 'done' ? 1 : 0);
  }

  async cancel(generationId: string): Promise<void> {
    await this.request(`/api/jobs/${generationId}/cancel`, {
      method: 'POST',
    });
  }

  // ---------------------------------------------------------------------------
  // PRIVATE HELPERS
  // ---------------------------------------------------------------------------

  private async submitJob(req: WorldGenerationRequest): Promise<string> {
    const inputImages = req.input_images?.join(',') ?? req.input_image;

    const payload: HYGeneratePayload = {
      prompt: req.prompt,
      output_format: FORMAT_MAP[req.format] ?? 'splat',
      quality_preset: QUALITY_MAP[req.quality] ?? 'standard',
      ...(inputImages ? { input_images: inputImages } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.navEnabled !== undefined ? { nav_enabled: req.navEnabled } : {}),
      ...(req.interactiveMode !== undefined
        ? { interactive_mode: req.interactiveMode }
        : {}),
    };

    const response = await this.request<{ job_id: string }>('/api/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!response.job_id) {
      throw new Error('[HYWorldAdapter] /api/generate did not return a job_id');
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
          `[HYWorldAdapter] Job ${jobId} failed: ${job.error ?? 'unknown error'}`
        );
      }

      await this.sleep(this.pollIntervalMs);
    }

    throw new Error(
      `[HYWorldAdapter] Job ${jobId} timed out after ${this.timeoutMs}ms`
    );
  }

  private async fetchJob(jobId: string): Promise<HYJobResponse> {
    return this.request<HYJobResponse>(`/api/jobs/${jobId}`);
  }

  private mapResult(job: HYJobResponse): WorldGenerationResult {
    if (!job.asset_url) {
      throw new Error(
        `[HYWorldAdapter] Job ${job.job_id} completed but returned no asset_url`
      );
    }

    const rawMeta = job.metadata ?? {};
    const bounds = (rawMeta.bounds as [number, number, number, number, number, number] | undefined) ??
      [-10, 0, -10, 10, 5, 10];

    const metadata: WorldMetadata = {
      format: job.asset_url.endsWith('.glb') ? 'mesh' : '3dgs',
      bounds,
      ...(rawMeta.agent_start
        ? { agentStart: rawMeta.agent_start as [number, number, number] }
        : {}),
      ...(rawMeta.waypoints
        ? { waypoints: rawMeta.waypoints as [number, number, number][] }
        : {}),
      ...(rawMeta.splat_count ? { splatCount: rawMeta.splat_count } : {}),
      ...(rawMeta.triangle_count ? { triangleCount: rawMeta.triangle_count } : {}),
      ...(rawMeta.generation_ms ? { generationMs: rawMeta.generation_ms } : {}),
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

    const response = await fetch(url, {
      ...init,
      headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `[HYWorldAdapter] HTTP ${response.status} from ${url}: ${body}`
      );
    }

    return response.json() as Promise<T>;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default HYWorldAdapter;
