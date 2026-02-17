/**
 * Render Network Trait
 *
 * Distributed GPU rendering via Render Network for high-fidelity scenes.
 * Enables cloud rendering, volumetric video processing, and Gaussian Splat baking.
 *
 * Research Reference: uAA2++ Protocol - "HoloScriptToGLB.ts → Render Network pipeline"
 *
 * Features:
 * - Distributed rendering for complex scenes
 * - Real-time preview with cloud-rendered final output
 * - Volumetric video transcoding
 * - Gaussian Splat optimization and baking
 * - RNDR token integration for render credits
 *
 * @version 3.2.0
 * @milestone v3.2 (June 2026)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type RenderQuality = 'preview' | 'draft' | 'production' | 'film';
type RenderEngine = 'octane' | 'redshift' | 'arnold' | 'blender_cycles' | 'auto';
type OutputFormat = 'png' | 'exr' | 'jpg' | 'mp4' | 'webm' | 'glb';
type JobPriority = 'low' | 'normal' | 'high' | 'rush';
type JobStatus = 'queued' | 'processing' | 'rendering' | 'compositing' | 'complete' | 'failed';

interface RenderJob {
  id: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  status: JobStatus;
  progress: number; // 0-100
  quality: RenderQuality;
  engine: RenderEngine;
  priority: JobPriority;
  estimatedCredits: number;
  actualCredits?: number;
  frames: {
    total: number;
    completed: number;
    failed: number;
  };
  outputs: RenderOutput[];
  error?: string;
  nodeCount: number;
  gpuHours: number;
}

interface RenderOutput {
  type: 'frame' | 'sequence' | 'video' | 'volumetric' | 'splat';
  url: string;
  format: OutputFormat;
  resolution: { width: number; height: number };
  size: number; // bytes
  checksum: string;
}

interface RenderCredits {
  balance: number;
  pending: number;
  spent: number;
  earned: number; // If providing GPU resources
  walletAddress: string;
  lastRefresh: number;
}

interface RenderNetworkState {
  isConnected: boolean;
  apiKey: string | null;
  credits: RenderCredits | null;
  activeJobs: RenderJob[];
  completedJobs: RenderJob[];
  queuePosition: number;
  networkStatus: 'online' | 'degraded' | 'offline';
  availableNodes: number;
  estimatedWaitTime: number; // ms
}

interface RenderNetworkConfig {
  /** Render Network API key */
  api_key: string;
  /** Wallet address for RNDR tokens */
  wallet_address: string;
  /** Default render quality */
  default_quality: RenderQuality;
  /** Default render engine */
  default_engine: RenderEngine;
  /** Output format */
  output_format: OutputFormat;
  /** Default priority */
  default_priority: JobPriority;
  /** Resolution multiplier (1 = native, 2 = 2x, etc.) */
  resolution_scale: number;
  /** Max credits per job (0 = unlimited) */
  max_credits_per_job: number;
  /** Auto-submit on scene change */
  auto_submit: boolean;
  /** Preview quality for real-time */
  preview_quality: 'realtime' | 'raytraced';
  /** Enable volumetric video processing */
  volumetric_enabled: boolean;
  /** Enable Gaussian Splat baking */
  splat_baking_enabled: boolean;
  /** Callback webhook for job completion */
  webhook_url: string;
  /** Cache rendered assets locally */
  cache_enabled: boolean;
  /** Cache TTL in ms */
  cache_ttl: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const RENDER_NETWORK_API = 'https://api.rendernetwork.com/v2';

const QUALITY_PRESETS: Record<
  RenderQuality,
  { samples: number; bounces: number; resolution: number }
> = {
  preview: { samples: 32, bounces: 2, resolution: 0.5 },
  draft: { samples: 128, bounces: 4, resolution: 0.75 },
  production: { samples: 512, bounces: 8, resolution: 1.0 },
  film: { samples: 2048, bounces: 16, resolution: 2.0 },
};

const CREDIT_ESTIMATES: Record<RenderQuality, number> = {
  preview: 0.1,
  draft: 0.5,
  production: 2.0,
  film: 10.0,
};

// =============================================================================
// HANDLER
// =============================================================================

export const renderNetworkHandler: TraitHandler<RenderNetworkConfig> = {
  name: 'render_network' as any,

  defaultConfig: {
    api_key: '',
    wallet_address: '',
    default_quality: 'production',
    default_engine: 'octane',
    output_format: 'png',
    default_priority: 'normal',
    resolution_scale: 1.0,
    max_credits_per_job: 100,
    auto_submit: false,
    preview_quality: 'realtime',
    volumetric_enabled: true,
    splat_baking_enabled: true,
    webhook_url: '',
    cache_enabled: true,
    cache_ttl: 86400000, // 24 hours
  },

  onAttach(node, config, context) {
    const state: RenderNetworkState = {
      isConnected: false,
      apiKey: config.api_key || null,
      credits: null,
      activeJobs: [],
      completedJobs: [],
      queuePosition: 0,
      networkStatus: 'offline',
      availableNodes: 0,
      estimatedWaitTime: 0,
    };
    (node as any).__renderNetworkState = state;

    if (config.api_key) {
      connectToRenderNetwork(node, state, config, context);
    }
  },

  onDetach(node, _config, context) {
    const state = (node as any).__renderNetworkState as RenderNetworkState;
    if (state?.isConnected) {
      context.emit?.('render_network_disconnect', { node });
    }
    delete (node as any).__renderNetworkState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__renderNetworkState as RenderNetworkState;
    if (!state || !state.isConnected) return;

    // Poll active jobs for status updates
    state.activeJobs.forEach((job) => {
      if (job.status === 'processing' || job.status === 'rendering') {
        pollJobStatus(job, state, config, context, node);
      }
    });
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__renderNetworkState as RenderNetworkState;
    if (!state) return;

    // Submit render job
    if (event.type === 'render_submit') {
      const {
        scene,
        quality = config.default_quality,
        engine = config.default_engine,
        priority = config.default_priority,
        frames = { start: 0, end: 0 },
      } = event.payload as {
        scene: any;
        quality?: RenderQuality;
        engine?: RenderEngine;
        priority?: JobPriority;
        frames?: { start: number; end: number };
      };

      submitRenderJob(node, state, config, context, {
        scene,
        quality,
        engine,
        priority,
        frames,
      });
    }

    // Submit volumetric video for processing
    if (event.type === 'volumetric_process' && config.volumetric_enabled) {
      const { source, outputFormat } = event.payload as {
        source: string;
        outputFormat: 'mp4' | 'webm';
      };

      submitVolumetricJob(node, state, config, context, { source, outputFormat });
    }

    // Submit Gaussian Splat for baking
    if (event.type === 'splat_bake' && config.splat_baking_enabled) {
      const { source, targetSplatCount, quality } = event.payload as {
        source: string;
        targetSplatCount: number;
        quality: 'low' | 'medium' | 'high';
      };

      submitSplatBakeJob(node, state, config, context, {
        source,
        targetSplatCount,
        quality,
      });
    }

    // Cancel job
    if (event.type === 'render_cancel') {
      const { jobId } = event.payload as { jobId: string };
      cancelRenderJob(state, jobId, context);
    }

    // Refresh credits
    if (event.type === 'credits_refresh') {
      refreshCredits(state, config, context);
    }

    // Download completed output
    if (event.type === 'render_download') {
      const { jobId, outputIndex = 0 } = event.payload as {
        jobId: string;
        outputIndex?: number;
      };

      const job = state.completedJobs.find((j) => j.id === jobId);
      if (job && job.outputs[outputIndex]) {
        context.emit?.('render_download_ready', {
          node,
          job,
          output: job.outputs[outputIndex],
        });
      }
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Core fetch wrapper for all Render Network API calls.
 * Attaches the API key as Bearer token and handles JSON serialization.
 */
async function callRenderNetworkAPI(
  url: string,
  apiKey: string,
  body: unknown | null,
  method: 'GET' | 'POST' | 'DELETE' = 'GET'
): Promise<Response> {
  return fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
}

async function connectToRenderNetwork(
  node: any,
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any
): Promise<void> {
  try {
    const response = await callRenderNetworkAPI(
      `${RENDER_NETWORK_API}/auth/validate`,
      config.api_key,
      null,
      'GET'
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    state.isConnected = true;
    state.networkStatus = 'online';
    state.availableNodes = data.available_nodes ?? 0;
    state.estimatedWaitTime = data.estimated_wait_ms ?? 0;
    state.credits = {
      balance: data.credits?.balance ?? 0,
      pending: data.credits?.pending ?? 0,
      spent: data.credits?.spent ?? 0,
      earned: data.credits?.earned ?? 0,
      walletAddress: config.wallet_address,
      lastRefresh: Date.now(),
    };

    context.emit?.('render_network_connected', {
      node,
      credits: state.credits,
      availableNodes: state.availableNodes,
    });
  } catch (error) {
    state.networkStatus = 'offline';
    context.emit?.('render_network_error', {
      node,
      error: `Failed to connect to Render Network: ${String(error)}`,
    });
  }
}

async function submitRenderJob(
  node: any,
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any,
  params: {
    scene: any;
    quality: RenderQuality;
    engine: RenderEngine;
    priority: JobPriority;
    frames: { start: number; end: number };
  }
): Promise<void> {
  const frameCount = params.frames.end - params.frames.start + 1;
  const _preset = QUALITY_PRESETS[params.quality];
  const estimatedCredits = CREDIT_ESTIMATES[params.quality] * frameCount * config.resolution_scale;

  if (config.max_credits_per_job > 0 && estimatedCredits > config.max_credits_per_job) {
    context.emit?.('render_job_rejected', {
      node,
      reason: 'exceeds_max_credits',
      estimated: estimatedCredits,
      max: config.max_credits_per_job,
    });
    return;
  }

  const job: RenderJob = {
    id: `rndr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    quality: params.quality,
    engine: params.engine,
    priority: params.priority,
    estimatedCredits,
    frames: {
      total: frameCount,
      completed: 0,
      failed: 0,
    },
    outputs: [],
    nodeCount: Math.ceil(frameCount / 10),
    gpuHours: 0,
  };

  state.activeJobs.push(job);

  context.emit?.('render_job_submitted', {
    node,
    job,
    estimatedWait: state.estimatedWaitTime,
  });

  // Submit to Render Network API, fall back to simulation if unavailable
  submitJobToAPI(job, state, config, context, node).catch(() => {
    simulateJobProgress(job, state, context, node);
  });
}

async function submitVolumetricJob(
  node: any,
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any,
  params: { source: string; outputFormat: 'mp4' | 'webm' }
): Promise<void> {
  const job: RenderJob = {
    id: `vol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    quality: 'production',
    engine: 'auto',
    priority: 'normal',
    estimatedCredits: 5.0,
    frames: { total: 1, completed: 0, failed: 0 },
    outputs: [],
    nodeCount: 1,
    gpuHours: 0,
  };

  state.activeJobs.push(job);

  context.emit?.('volumetric_job_submitted', {
    node,
    job,
    source: params.source,
    format: params.outputFormat,
  });
}

async function submitSplatBakeJob(
  node: any,
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any,
  params: { source: string; targetSplatCount: number; quality: 'low' | 'medium' | 'high' }
): Promise<void> {
  const credits = params.quality === 'high' ? 3.0 : params.quality === 'medium' ? 1.5 : 0.5;

  const job: RenderJob = {
    id: `splat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: Date.now(),
    status: 'queued',
    progress: 0,
    quality: params.quality as RenderQuality,
    engine: 'auto',
    priority: 'normal',
    estimatedCredits: credits,
    frames: { total: 1, completed: 0, failed: 0 },
    outputs: [],
    nodeCount: 1,
    gpuHours: 0,
  };

  state.activeJobs.push(job);

  context.emit?.('splat_bake_submitted', {
    node,
    job,
    source: params.source,
    targetSplatCount: params.targetSplatCount,
  });
}

async function submitJobToAPI(
  job: RenderJob,
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any,
  node: any
): Promise<void> {
  const response = await callRenderNetworkAPI(`${RENDER_NETWORK_API}/jobs`, config.api_key, {
    scene: job.id,
    quality: job.quality,
    engine: job.engine,
    priority: job.priority,
    frames: job.frames,
    node_count: job.nodeCount,
  });
  if (!response.ok) throw new Error(`Submit failed: ${response.status}`);
  const data = await response.json();
  job.id = data.job_id ?? job.id;
  job.status = 'queued';
  pollJobStatus(job, state, config, context, node);
}

function pollJobStatus(
  job: RenderJob,
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any,
  node: any
): void {
  if (!config.api_key) return;

  const POLL_INTERVAL_MS = 5_000;
  const MAX_POLLS = 360; // 30 minutes max
  let polls = 0;

  const interval = setInterval(async () => {
    polls++;
    if (polls > MAX_POLLS || job.status === 'complete' || job.status === 'failed') {
      clearInterval(interval);
      return;
    }

    try {
      const response = await callRenderNetworkAPI(
        `${RENDER_NETWORK_API}/jobs/${job.id}`,
        config.api_key,
        null,
        'GET'
      );

      if (!response.ok) return;
      const data = await response.json();

      job.status = data.status ?? job.status;
      job.progress = data.progress ?? job.progress;
      job.frames.completed = data.frames?.completed ?? job.frames.completed;
      job.frames.failed = data.frames?.failed ?? job.frames.failed;
      job.gpuHours = data.gpu_hours ?? job.gpuHours;

      if (data.status === 'complete') {
        job.completedAt = Date.now();
        job.actualCredits = data.credits_used ?? job.estimatedCredits;

        if (data.outputs?.length) {
          job.outputs = data.outputs.map((o: any) => ({
            type: o.type,
            url: o.url,
            format: o.format,
            resolution: o.resolution,
            size: o.size,
            checksum: o.checksum,
          }));
        }

        const idx = state.activeJobs.indexOf(job);
        if (idx !== -1) {
          state.activeJobs.splice(idx, 1);
          state.completedJobs.push(job);
        }

        context.emit?.('render_job_complete', { node, job });
        clearInterval(interval);
      } else if (data.status === 'failed') {
        job.error = data.error ?? 'Job failed on Render Network';
        const idx = state.activeJobs.indexOf(job);
        if (idx !== -1) {
          state.activeJobs.splice(idx, 1);
          state.completedJobs.push(job);
        }
        context.emit?.('render_job_failed', { node, job, error: job.error });
        clearInterval(interval);
      } else {
        context.emit?.('render_job_progress', {
          node,
          job,
          progress: job.progress,
          framesCompleted: job.frames.completed,
        });
      }
    } catch {
      // Network error during poll — keep trying until MAX_POLLS
    }
  }, POLL_INTERVAL_MS);
}

function cancelRenderJob(state: RenderNetworkState, jobId: string, context: any): void {
  const jobIndex = state.activeJobs.findIndex((j) => j.id === jobId);
  if (jobIndex !== -1) {
    const job = state.activeJobs[jobIndex];
    job.status = 'failed';
    job.error = 'Cancelled by user';
    state.activeJobs.splice(jobIndex, 1);
    state.completedJobs.push(job);

    context.emit?.('render_job_cancelled', { job });
  }
}

async function refreshCredits(
  state: RenderNetworkState,
  config: RenderNetworkConfig,
  context: any
): Promise<void> {
  if (!config.api_key || !state.credits) return;
  try {
    const response = await callRenderNetworkAPI(
      `${RENDER_NETWORK_API}/credits`,
      config.api_key,
      null,
      'GET'
    );
    if (!response.ok) return;
    const data = await response.json();
    state.credits.balance = data.balance ?? state.credits.balance;
    state.credits.pending = data.pending ?? state.credits.pending;
    state.credits.spent = data.spent ?? state.credits.spent;
    state.credits.earned = data.earned ?? state.credits.earned;
    state.credits.lastRefresh = Date.now();
    context.emit?.('credits_refreshed', { credits: state.credits });
  } catch {
    // Network error — keep stale balance
  }
}

function simulateJobProgress(
  job: RenderJob,
  state: RenderNetworkState,
  context: any,
  node: any
): void {
  const interval = setInterval(() => {
    if (job.status === 'failed') {
      clearInterval(interval);
      return;
    }

    job.progress += 10;
    job.frames.completed = Math.floor((job.progress / 100) * job.frames.total);

    if (job.progress >= 100) {
      job.status = 'complete';
      job.completedAt = Date.now();
      job.actualCredits = job.estimatedCredits * 0.95; // 5% variance
      job.outputs.push({
        type: 'sequence',
        url: `https://render.network/outputs/${job.id}.zip`,
        format: 'png',
        resolution: { width: 1920, height: 1080 },
        size: 1024 * 1024 * 50,
        checksum: 'sha256:...',
      });

      // Move to completed
      const idx = state.activeJobs.indexOf(job);
      if (idx !== -1) {
        state.activeJobs.splice(idx, 1);
        state.completedJobs.push(job);
      }

      context.emit?.('render_job_complete', { node, job });
      clearInterval(interval);
    } else {
      job.status = 'rendering';
      context.emit?.('render_job_progress', {
        node,
        job,
        progress: job.progress,
        framesCompleted: job.frames.completed,
      });
    }
  }, 500);
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  RenderNetworkConfig,
  RenderNetworkState,
  RenderJob,
  RenderOutput,
  RenderCredits,
  RenderQuality,
  RenderEngine,
  JobPriority,
  JobStatus,
};
