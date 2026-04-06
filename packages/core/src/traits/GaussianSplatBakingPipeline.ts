/**
 * Gaussian Splat Baking Pipeline — Render Network Integration
 *
 * Full pipeline for cloud-based 3D Gaussian Splatting via Render Network:
 *   1. UPLOAD    — Chunked, resumable upload of source captures (images/video/PLY)
 *   2. TRAIN     — 3DGS training on distributed GPU nodes (Splatfacto/gsplat)
 *   3. BAKE      — Octane 2026.1 path-traced relighting + shadow baking
 *   4. COMPRESS  — SPZ v2.0 compression (90% size reduction, KHR_spz extension)
 *   5. DOWNLOAD  — Chunked download of baked .spz / .ply assets
 *
 * Integrates with:
 *   - RenderNetworkTrait.ts (job submission, credits, persistence)
 *   - GaussianSplatTrait.ts (runtime rendering, LOD, budget management)
 *   - GaussianSplatSorter.ts (WebGPU radix sort for real-time rendering)
 *
 * Research references:
 *   W.031 — SPZ compression (90% size reduction, KHR_spz_gaussian_splats_compression)
 *   W.032 — Octree-GS LOD (anchor-based level selection, TPAMI 2025)
 *   W.034 — VR Gaussian budget (~180K total on Quest 3, 60K per avatar)
 *   W.035 — Radix sort outperforms bitonic sort for N > 64K splats
 *   W.037 — Render Network GPU baking: OBh pricing, Octane 2026.1 path-traced splats
 *   G.030.04 — SPZ v2 quaternion encoding (smallest-three-components, 10-bit signed)
 *
 * Render Network pricing model:
 *   Tier 2 (Priority): 100 OBh per RENDER token, 2-4x multiplier
 *   Tier 3 (Economy):  200 OBh per RENDER token, 8-16x multiplier
 *   Cost = (localOBScore * timePerFrame * frameCount) / tierOBhRate
 *
 * @version 1.0.0
 * @milestone v3.3+ (Render Network Gaussian Pipeline)
 */

// =============================================================================
// TYPES — Pipeline Stages
// =============================================================================

/** Pipeline stages for the full baking workflow */
export type BakingStage =
  | 'idle'
  | 'uploading'
  | 'training'
  | 'baking'
  | 'compressing'
  | 'downloading'
  | 'complete'
  | 'failed';

/** Source capture format for 3DGS training input */
export type CaptureFormat =
  | 'images' // Directory of images with COLMAP poses
  | 'video' // Video file (extracted to frames + COLMAP)
  | 'polycam' // Polycam export (pre-computed poses)
  | 'record3d' // Record3D LiDAR scan
  | 'ply' // Pre-trained PLY (skip training, go to bake)
  | 'splat' // Raw .splat file
  | 'orbx'; // Octane ORBX scene package

/** Training method for 3DGS */
export type TrainingMethod =
  | 'splatfacto' // Nerfstudio Splatfacto (default, balanced)
  | 'gsplat' // NVIDIA gsplat (4x less memory, 10% faster)
  | '3dgs_original' // Original 3DGS implementation
  | 'sugar' // SuGaR (mesh-extracted Gaussians)
  | 'mip_splatting'; // Mip-Splatting (anti-aliased, multi-scale)

/** Octane render engine configuration for baking */
export type OctaneBakeMode =
  | 'path_trace' // Full path tracing (highest quality)
  | 'direct_lighting' // Direct lighting only (fastest)
  | 'path_trace_ao'; // Path trace + ambient occlusion pass

/** SPZ compression configuration */
export type SPZCompressionLevel =
  | 'none' // No compression (raw PLY output)
  | 'standard' // SPZ v1.0 (fixed-point quantization, ~10x reduction)
  | 'optimized' // SPZ v2.0 (smallest-three quaternions, ~12x reduction)
  | 'aggressive'; // SPZ v2.0 + pruning (up to 20x reduction)

/** Render Network tier for compute pricing */
export type RenderTier =
  | 'tier2_priority' // 100 OBh per RENDER, priority queue
  | 'tier3_economy'; // 200 OBh per RENDER, economy queue

// =============================================================================
// TYPES — Configuration
// =============================================================================

export interface GaussianBakingConfig {
  // --- Source ---
  /** Source capture data path or URL */
  source: string;
  /** Format of the source capture */
  captureFormat: CaptureFormat;

  // --- Training ---
  /** Training method (default: splatfacto) */
  trainingMethod: TrainingMethod;
  /** Target number of Gaussians after training (default: 500000) */
  targetGaussianCount: number;
  /** Spherical harmonics degree for view-dependent effects (0-3, default: 3) */
  shDegree: number;
  /** Training iterations (default: 30000) */
  trainingIterations: number;
  /** Densification interval (default: 100) */
  densificationInterval: number;
  /** Learning rate for positions (default: 0.00016) */
  positionLR: number;
  /** Enable anti-aliased rendering during training (default: true) */
  antiAlias: boolean;

  // --- Baking (Octane 2026.1) ---
  /** Octane bake mode (default: path_trace) */
  octaneBakeMode: OctaneBakeMode;
  /** Path tracing samples per pixel (default: 512) */
  bakeSamples: number;
  /** Max bounce depth (default: 8) */
  bakeMaxBounces: number;
  /** Enable neural radiance caching for faster convergence (default: true) */
  neuralRadianceCaching: boolean;
  /** Resolution of baked lighting (default: 2048) */
  bakeResolution: number;
  /** Enable relighting (cast/receive shadows with scene) (default: true) */
  relightingEnabled: boolean;

  // --- Compression ---
  /** SPZ compression level (default: optimized) */
  compressionLevel: SPZCompressionLevel;
  /** Target file size in MB (0 = no target, let compression decide) */
  targetFileSizeMB: number;
  /** Enable pruning of low-opacity Gaussians during compression (default: true) */
  pruneEnabled: boolean;
  /** Opacity threshold for pruning (default: 0.01) */
  pruneAlphaThreshold: number;

  // --- Network ---
  /** Render Network tier (default: tier2_priority) */
  renderTier: RenderTier;
  /** Maximum RENDER tokens to spend (0 = no limit) */
  maxCreditsBudget: number;
  /** Preferred GPU type (default: auto) */
  preferredGPU: 'auto' | 'rtx_4090' | 'rtx_3090' | 'a100' | 'h100';
  /** Number of GPU nodes for distributed training (default: auto) */
  nodeCount: number | 'auto';

  // --- Output ---
  /** Output format (default: spz) */
  outputFormat: 'ply' | 'spz' | 'splat' | 'glb';
  /** Include KHR_gaussian_splatting glTF extension metadata (default: true) */
  gltfExtension: boolean;
  /** Generate LOD hierarchy (default: true for > 100K splats) */
  generateLOD: boolean;
  /** LOD octree depth (default: auto) */
  lodOctreeDepth: number | 'auto';

  // --- Webhooks ---
  /** Webhook URL for stage completion notifications */
  webhookUrl: string;
  /** Include preview render in webhook payload (default: true) */
  webhookIncludePreview: boolean;
}

// =============================================================================
// TYPES — Job State
// =============================================================================

export interface BakingJobState {
  /** Unique job ID */
  jobId: string;
  /** Current pipeline stage */
  stage: BakingStage;
  /** Overall progress 0-100 */
  overallProgress: number;
  /** Per-stage progress tracking */
  stageProgress: Record<BakingStage, StageProgress>;
  /** Cost estimation */
  costEstimate: CostEstimate;
  /** Actual costs incurred so far */
  actualCost: number;
  /** Timestamps */
  timestamps: {
    created: number;
    uploadStarted?: number;
    uploadCompleted?: number;
    trainingStarted?: number;
    trainingCompleted?: number;
    bakingStarted?: number;
    bakingCompleted?: number;
    compressionStarted?: number;
    compressionCompleted?: number;
    downloadStarted?: number;
    downloadCompleted?: number;
  };
  /** Training metrics (populated during/after training) */
  trainingMetrics?: TrainingMetrics;
  /** Baking metrics (populated during/after baking) */
  bakingMetrics?: BakingMetrics;
  /** Compression metrics (populated after compression) */
  compressionMetrics?: CompressionMetrics;
  /** Output artifacts */
  outputs: BakingOutput[];
  /** Error information if failed */
  error?: { stage: BakingStage; message: string; code: string; retryable: boolean };
  /** Render Network job IDs for each stage */
  networkJobIds: {
    upload?: string;
    training?: string;
    baking?: string;
    compression?: string;
  };
}

export interface StageProgress {
  status: 'pending' | 'active' | 'complete' | 'failed' | 'skipped';
  progress: number; // 0-100
  message: string;
  startedAt?: number;
  completedAt?: number;
  estimatedTimeRemainingMs?: number;
}

export interface CostEstimate {
  /** Total estimated cost in RENDER tokens */
  totalRENDER: number;
  /** Per-stage breakdown */
  breakdown: {
    upload: number; // Typically 0 (included in job cost)
    training: number; // GPU hours * tier rate
    baking: number; // Octane OBh * tier rate
    compression: number; // Minimal compute cost
    download: number; // Typically 0
  };
  /** Estimated OctaneBench hours */
  estimatedOBh: number;
  /** Estimated GPU hours */
  estimatedGPUHours: number;
  /** Estimated total wall-clock time in minutes */
  estimatedTimeMins: number;
  /** Current RENDER token price (USD) for reference */
  renderTokenPriceUSD: number;
  /** Total estimated cost in USD */
  totalUSD: number;
  /** Confidence level (higher = more data points) */
  confidence: 'low' | 'medium' | 'high';
}

export interface TrainingMetrics {
  /** Final number of Gaussians */
  gaussianCount: number;
  /** Training iterations completed */
  iterationsCompleted: number;
  /** Peak GPU memory usage (MB) */
  peakGPUMemoryMB: number;
  /** Training loss (PSNR) */
  psnr: number;
  /** Structural similarity */
  ssim: number;
  /** LPIPS perceptual metric */
  lpips: number;
  /** Training wall-clock time (seconds) */
  trainingTimeSecs: number;
  /** GPU type used */
  gpuType: string;
}

export interface BakingMetrics {
  /** Octane render engine version */
  octaneVersion: string;
  /** Samples per pixel achieved */
  samplesPerPixel: number;
  /** Max bounce depth used */
  maxBounces: number;
  /** Whether neural radiance caching was used */
  neuralRadianceCachingUsed: boolean;
  /** Baking wall-clock time (seconds) */
  bakingTimeSecs: number;
  /** OctaneBench score of the node used */
  nodeOBScore: number;
  /** OctaneBench hours consumed */
  obHoursUsed: number;
}

export interface CompressionMetrics {
  /** Input file size (bytes) */
  inputSizeBytes: number;
  /** Output file size (bytes) */
  outputSizeBytes: number;
  /** Compression ratio */
  compressionRatio: number;
  /** Number of Gaussians before pruning */
  gaussiansBefore: number;
  /** Number of Gaussians after pruning */
  gaussiansAfter: number;
  /** SPZ version used */
  spzVersion: string;
  /** Quaternion encoding method */
  quaternionEncoding: 'default' | 'smallest_three';
  /** PSNR degradation from compression */
  psnrDelta: number;
}

export interface BakingOutput {
  /** Output type */
  type: 'splat' | 'preview' | 'lod_hierarchy' | 'training_log' | 'metrics';
  /** Download URL */
  url: string;
  /** File format */
  format: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SHA-256 checksum */
  checksum: string;
  /** LOD level (for lod_hierarchy type) */
  lodLevel?: number;
  /** Gaussian count in this output */
  gaussianCount?: number;
}

// =============================================================================
// CONSTANTS — Pricing & Performance
// =============================================================================

/**
 * OctaneBench hours per RENDER token by tier.
 * W.037: Render Network uses OBh-based pricing.
 */
const OBH_PER_RENDER: Record<RenderTier, number> = {
  tier2_priority: 100,
  tier3_economy: 200,
};

/**
 * Reference OctaneBench scores for common GPU types.
 * Used for cost estimation when user's local OB score is unavailable.
 */
const REFERENCE_OB_SCORES: Record<string, number> = {
  rtx_4090: 906,
  rtx_3090: 526,
  a100: 466,
  h100: 712,
  rtx_2070: 206,
  auto: 500, // Conservative average
};

/**
 * Estimated GPU hours per training configuration.
 * Based on empirical data from nerfstudio splatfacto benchmarks.
 */
const TRAINING_GPU_HOURS_ESTIMATE: Record<
  TrainingMethod,
  {
    baseHours: number; // For 500K Gaussians, 30K iterations
    scalingFactor: number; // Linear scaling per additional 100K Gaussians
  }
> = {
  splatfacto: { baseHours: 0.5, scalingFactor: 0.08 },
  gsplat: { baseHours: 0.35, scalingFactor: 0.06 },
  '3dgs_original': { baseHours: 0.75, scalingFactor: 0.12 },
  sugar: { baseHours: 1.2, scalingFactor: 0.15 },
  mip_splatting: { baseHours: 0.6, scalingFactor: 0.1 },
};

/**
 * Octane baking time estimates (OBh per 1M Gaussians).
 */
const BAKING_OBH_ESTIMATES: Record<
  OctaneBakeMode,
  {
    obhPer1MGaussians: number;
    samplesMultiplier: number; // Multiply by (samples / 512)
  }
> = {
  path_trace: { obhPer1MGaussians: 8.0, samplesMultiplier: 1.0 },
  direct_lighting: { obhPer1MGaussians: 1.5, samplesMultiplier: 0.3 },
  path_trace_ao: { obhPer1MGaussians: 10.0, samplesMultiplier: 1.2 },
};

/** Default pipeline configuration */
const DEFAULT_CONFIG: GaussianBakingConfig = {
  source: '',
  captureFormat: 'images',
  trainingMethod: 'splatfacto',
  targetGaussianCount: 500_000,
  shDegree: 3,
  trainingIterations: 30_000,
  densificationInterval: 100,
  positionLR: 0.00016,
  antiAlias: true,
  octaneBakeMode: 'path_trace',
  bakeSamples: 512,
  bakeMaxBounces: 8,
  neuralRadianceCaching: true,
  bakeResolution: 2048,
  relightingEnabled: true,
  compressionLevel: 'optimized',
  targetFileSizeMB: 0,
  pruneEnabled: true,
  pruneAlphaThreshold: 0.01,
  renderTier: 'tier2_priority',
  maxCreditsBudget: 0,
  preferredGPU: 'auto',
  nodeCount: 'auto',
  outputFormat: 'spz',
  gltfExtension: true,
  generateLOD: true,
  lodOctreeDepth: 'auto',
  webhookUrl: '',
  webhookIncludePreview: true,
};

// =============================================================================
// RENDER NETWORK API CLIENT — Gaussian Baking Extension
// =============================================================================

const RENDER_NETWORK_API = 'https://api.rendernetwork.com/v2';

/**
 * Extended API client for Gaussian Splat baking operations.
 * Builds on top of the base RenderNetworkTrait API patterns.
 */
export class GaussianBakingClient {
  private apiKey: string;
  private region: string;

  constructor(apiKey: string, region: string = 'us-west') {
    this.apiKey = apiKey;
    this.region = region;
  }

  // ---------------------------------------------------------------------------
  // Core API Methods
  // ---------------------------------------------------------------------------

  /**
   * Submit a full baking pipeline job to Render Network.
   * This creates a multi-stage job that progresses through:
   * upload -> train -> bake -> compress -> download
   */
  async submitBakingJob(config: GaussianBakingConfig): Promise<BakingJobState> {
    const jobId = `gsplat_bake_${Date.now()}_${randomId()}`;
    const costEstimate = this.estimateCost(config);

    // Validate budget
    if (config.maxCreditsBudget > 0 && costEstimate.totalRENDER > config.maxCreditsBudget) {
      throw new BakingPipelineError(
        `Estimated cost (${costEstimate.totalRENDER.toFixed(2)} RENDER) exceeds budget ` +
          `(${config.maxCreditsBudget} RENDER)`,
        'BUDGET_EXCEEDED',
        'idle',
        false
      );
    }

    // Create initial job state
    const jobState: BakingJobState = {
      jobId,
      stage: 'idle',
      overallProgress: 0,
      stageProgress: createInitialStageProgress(config),
      costEstimate,
      actualCost: 0,
      timestamps: { created: Date.now() },
      outputs: [],
      networkJobIds: {},
    };

    // Submit to Render Network
    const response = await this.apiCall('/gaussian/bake', 'POST', {
      job_id: jobId,
      region: this.region,
      config: {
        capture_format: config.captureFormat,
        training: {
          method: config.trainingMethod,
          target_gaussians: config.targetGaussianCount,
          sh_degree: config.shDegree,
          iterations: config.trainingIterations,
          densification_interval: config.densificationInterval,
          position_lr: config.positionLR,
          anti_alias: config.antiAlias,
        },
        baking: {
          engine: 'octane_2026.1',
          mode: config.octaneBakeMode,
          samples: config.bakeSamples,
          max_bounces: config.bakeMaxBounces,
          neural_radiance_caching: config.neuralRadianceCaching,
          resolution: config.bakeResolution,
          relighting: config.relightingEnabled,
        },
        compression: {
          format: config.outputFormat,
          level: config.compressionLevel,
          target_size_mb: config.targetFileSizeMB,
          prune: config.pruneEnabled,
          prune_alpha_threshold: config.pruneAlphaThreshold,
          spz_version:
            config.compressionLevel === 'optimized' || config.compressionLevel === 'aggressive'
              ? '2.0'
              : '1.0',
          quaternion_encoding:
            config.compressionLevel === 'optimized' || config.compressionLevel === 'aggressive'
              ? 'smallest_three'
              : 'default',
        },
        output: {
          format: config.outputFormat,
          gltf_extension: config.gltfExtension,
          generate_lod: config.generateLOD,
          lod_octree_depth: config.lodOctreeDepth,
        },
        network: {
          tier: config.renderTier,
          preferred_gpu: config.preferredGPU,
          node_count: config.nodeCount,
          max_budget: config.maxCreditsBudget,
        },
        webhook: config.webhookUrl
          ? {
              url: config.webhookUrl,
              include_preview: config.webhookIncludePreview,
            }
          : undefined,
      },
    });

    if (response.job_id) {
      jobState.networkJobIds.training = response.job_id;
    }

    return jobState;
  }

  /**
   * Create a resumable upload session for source capture data.
   */
  async createUploadSession(
    jobId: string,
    totalSizeBytes: number,
    captureFormat: CaptureFormat
  ): Promise<{ sessionId: string; chunkSize: number; uploadUrl: string }> {
    const response = await this.apiCall('/gaussian/uploads', 'POST', {
      job_id: jobId,
      total_size: totalSizeBytes,
      capture_format: captureFormat,
      region: this.region,
    });

    return {
      sessionId: response.session_id,
      chunkSize: response.chunk_size || 4 * 1024 * 1024, // Default 4MB chunks
      uploadUrl: response.upload_url,
    };
  }

  /**
   * Upload a chunk of source data. Supports resumable uploads.
   */
  async uploadChunk(
    sessionId: string,
    chunk: ArrayBuffer,
    offset: number,
    totalSize: number
  ): Promise<{ uploadedBytes: number; complete: boolean }> {
    const formData = new FormData();
    formData.append('chunk', new Blob([chunk]));
    formData.append('offset', String(offset));
    formData.append('total_size', String(totalSize));

    const response = await fetch(`${RENDER_NETWORK_API}/gaussian/uploads/${sessionId}/chunk`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      throw new BakingPipelineError(
        `Chunk upload failed: HTTP ${response.status}`,
        'UPLOAD_FAILED',
        'uploading',
        true
      );
    }

    const data = await response.json();
    return {
      uploadedBytes: data.uploaded_bytes,
      complete: data.complete ?? false,
    };
  }

  /**
   * Check upload session progress (for resumption after interruption).
   */
  async getUploadProgress(sessionId: string): Promise<{
    uploadedBytes: number;
    totalBytes: number;
    complete: boolean;
  }> {
    const response = await this.apiCall(`/gaussian/uploads/${sessionId}/progress`, 'GET');
    return {
      uploadedBytes: response.uploaded_bytes,
      totalBytes: response.total_bytes,
      complete: response.complete ?? false,
    };
  }

  /**
   * Poll job status across all pipeline stages.
   */
  async getJobStatus(jobId: string): Promise<BakingJobStatus> {
    const response = await this.apiCall(`/gaussian/bake/${jobId}`, 'GET');
    return parseBakingJobStatus(response);
  }

  /**
   * Cancel a running baking job. Refunds unused RENDER tokens.
   */
  async cancelJob(jobId: string): Promise<{
    cancelled: boolean;
    refundedRENDER: number;
    completedStages: BakingStage[];
  }> {
    const response = await this.apiCall(`/gaussian/bake/${jobId}`, 'DELETE');
    return {
      cancelled: response.cancelled ?? true,
      refundedRENDER: response.refunded_render ?? 0,
      completedStages: response.completed_stages ?? [],
    };
  }

  /**
   * Get download URLs for completed outputs.
   */
  async getOutputs(jobId: string): Promise<BakingOutput[]> {
    const response = await this.apiCall(`/gaussian/bake/${jobId}/outputs`, 'GET');
    return (response.outputs ?? []).map((o: unknown) => ({
      type: o.type,
      url: o.url,
      format: o.format,
      sizeBytes: o.size_bytes,
      checksum: o.checksum,
      lodLevel: o.lod_level,
      gaussianCount: o.gaussian_count,
    }));
  }

  /**
   * Download a baked output with chunked transfer and progress reporting.
   */
  async downloadOutput(
    url: string,
    onProgress?: (downloadedBytes: number, totalBytes: number) => void
  ): Promise<ArrayBuffer> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!response.ok) {
      throw new BakingPipelineError(
        `Download failed: HTTP ${response.status}`,
        'DOWNLOAD_FAILED',
        'downloading',
        true
      );
    }

    const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
    const reader = response.body?.getReader();
    if (!reader) {
      return response.arrayBuffer();
    }

    const chunks: Uint8Array[] = [];
    let downloadedBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      downloadedBytes += value.byteLength;
      onProgress?.(downloadedBytes, contentLength);
    }

    // Concatenate all chunks
    const result = new Uint8Array(downloadedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return result.buffer;
  }

  // ---------------------------------------------------------------------------
  // Cost Estimation
  // ---------------------------------------------------------------------------

  /**
   * Estimate the total cost of a baking pipeline job.
   *
   * Pricing model (W.037):
   *   - Training: GPU hours * (OB score / tier OBh rate)
   *   - Baking: OBh consumed * (1 / tier OBh rate)
   *   - Compression: Minimal (typically < 0.01 RENDER)
   *
   * @param config Pipeline configuration
   * @param localOBScore Optional local OctaneBench score for more accurate estimates
   * @param renderTokenPriceUSD Optional current RENDER token price
   */
  estimateCost(
    config: GaussianBakingConfig,
    localOBScore?: number,
    renderTokenPriceUSD: number = 2.0
  ): CostEstimate {
    const obScore =
      localOBScore ?? REFERENCE_OB_SCORES[config.preferredGPU] ?? REFERENCE_OB_SCORES.auto;
    const obhPerRender = OBH_PER_RENDER[config.renderTier];

    // Training cost estimation
    const trainingProfile = TRAINING_GPU_HOURS_ESTIMATE[config.trainingMethod];
    const gaussianScale = (config.targetGaussianCount - 500_000) / 100_000;
    const iterationScale = config.trainingIterations / 30_000;
    const rawTrainingHours =
      (trainingProfile.baseHours + Math.max(0, gaussianScale * trainingProfile.scalingFactor)) *
      iterationScale;

    // Convert GPU hours to OBh: GPU hours * OB score = OBh
    const trainingOBh = rawTrainingHours * obScore;
    const trainingRENDER = trainingOBh / obhPerRender;

    // Baking cost estimation (Octane 2026.1)
    const bakingProfile = BAKING_OBH_ESTIMATES[config.octaneBakeMode];
    const gaussianMillions = config.targetGaussianCount / 1_000_000;
    const samplesScale = config.bakeSamples / 512;
    const bakingOBh =
      bakingProfile.obhPer1MGaussians *
      gaussianMillions *
      (1 + (samplesScale - 1) * bakingProfile.samplesMultiplier);
    const bakingRENDER = bakingOBh / obhPerRender;

    // Compression cost (minimal GPU work)
    const compressionRENDER = config.compressionLevel === 'aggressive' ? 0.05 : 0.02;

    // Total
    const totalRENDER = trainingRENDER + bakingRENDER + compressionRENDER;
    const totalOBh = trainingOBh + bakingOBh;

    // Time estimation
    const trainingTimeMins = rawTrainingHours * 60;
    const bakingTimeMins = (bakingOBh / obScore) * 60;
    const compressionTimeMins = gaussianMillions * 2; // ~2 mins per 1M Gaussians
    const totalTimeMins = trainingTimeMins + bakingTimeMins + compressionTimeMins;

    // Confidence based on how many assumptions we made
    let confidence: 'low' | 'medium' | 'high' = 'medium';
    if (localOBScore) confidence = 'high';
    if (config.captureFormat === 'images' || config.captureFormat === 'video') {
      // More variability with raw captures
      confidence = localOBScore ? 'medium' : 'low';
    }

    return {
      totalRENDER: Math.round(totalRENDER * 100) / 100,
      breakdown: {
        upload: 0,
        training: Math.round(trainingRENDER * 100) / 100,
        baking: Math.round(bakingRENDER * 100) / 100,
        compression: compressionRENDER,
        download: 0,
      },
      estimatedOBh: Math.round(totalOBh * 10) / 10,
      estimatedGPUHours: Math.round(rawTrainingHours * 100) / 100,
      estimatedTimeMins: Math.round(totalTimeMins),
      renderTokenPriceUSD,
      totalUSD: Math.round(totalRENDER * renderTokenPriceUSD * 100) / 100,
      confidence,
    };
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private async apiCall(
    path: string,
    method: 'GET' | 'POST' | 'DELETE',
    body?: unknown
  ): Promise<any> {
    const maxRetries = 3;
    const backoff = [1000, 2000, 4000];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(`${RENDER_NETWORK_API}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'X-Region': this.region,
          },
          ...(body != null ? { body: JSON.stringify(body) } : {}),
        });

        if (response.ok) {
          return response.json();
        }

        // Retryable errors
        if (response.status >= 500 || response.status === 429) {
          if (attempt < maxRetries - 1) {
            await sleep(backoff[attempt]);
            continue;
          }
        }

        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errorBody}`);
      } catch (error) {
        if (attempt === maxRetries - 1) {
          throw error;
        }
        await sleep(backoff[attempt]);
      }
    }

    throw new Error('Max retries exceeded');
  }
}

// =============================================================================
// ASYNC PROGRESS TRACKER
// =============================================================================

/** Callback type for progress events */
export type ProgressCallback = (state: BakingJobState) => void;

/** Callback type for stage transition events */
export type StageTransitionCallback = (
  previousStage: BakingStage,
  newStage: BakingStage,
  state: BakingJobState
) => void;

/**
 * Async progress tracker for the baking pipeline.
 * Polls Render Network API and dispatches progress events.
 */
export class BakingProgressTracker {
  private client: GaussianBakingClient;
  private jobState: BakingJobState;
  private pollIntervalMs: number;
  private maxPollDurationMs: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private isTracking: boolean = false;

  // Event callbacks
  private onProgress: ProgressCallback | null = null;
  private onStageTransition: StageTransitionCallback | null = null;
  private onComplete: ((state: BakingJobState) => void) | null = null;
  private onError: ((error: BakingPipelineError, state: BakingJobState) => void) | null = null;

  constructor(
    client: GaussianBakingClient,
    jobState: BakingJobState,
    options: {
      pollIntervalMs?: number;
      maxPollDurationMs?: number;
    } = {}
  ) {
    this.client = client;
    this.jobState = jobState;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.maxPollDurationMs = options.maxPollDurationMs ?? 120 * 60 * 1000; // 2 hours max
  }

  /** Register progress callback */
  on(event: 'progress', cb: ProgressCallback): this;
  on(event: 'stageTransition', cb: StageTransitionCallback): this;
  on(event: 'complete', cb: (state: BakingJobState) => void): this;
  on(event: 'error', cb: (error: BakingPipelineError, state: BakingJobState) => void): this;
  on(event: string, cb: unknown): this {
    switch (event) {
      case 'progress':
        this.onProgress = cb;
        break;
      case 'stageTransition':
        this.onStageTransition = cb;
        break;
      case 'complete':
        this.onComplete = cb;
        break;
      case 'error':
        this.onError = cb;
        break;
    }
    return this;
  }

  /** Start polling for progress */
  start(): void {
    if (this.isTracking) return;
    this.isTracking = true;

    const startTime = Date.now();

    this.pollTimer = setInterval(async () => {
      // Check max duration
      if (Date.now() - startTime > this.maxPollDurationMs) {
        this.stop();
        const error = new BakingPipelineError(
          'Polling timeout exceeded',
          'POLL_TIMEOUT',
          this.jobState.stage,
          false
        );
        this.onError?.(error, this.jobState);
        return;
      }

      try {
        const status = await this.client.getJobStatus(this.jobState.jobId);
        this.updateJobState(status);
      } catch (err) {
        // Network errors during polling are non-fatal; keep polling
        console.warn(`Baking progress poll error: ${err}`);
      }
    }, this.pollIntervalMs);
  }

  /** Stop polling */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.isTracking = false;
  }

  /** Get current job state */
  getState(): BakingJobState {
    return this.jobState;
  }

  /** Update job state from API response and emit events */
  private updateJobState(status: BakingJobStatus): void {
    const previousStage = this.jobState.stage;

    // Update stage
    if (status.stage !== previousStage) {
      this.jobState.stage = status.stage;

      // Update timestamps
      const ts = this.jobState.timestamps;
      switch (status.stage) {
        case 'uploading':
          ts.uploadStarted = Date.now();
          break;
        case 'training':
          if (!ts.uploadCompleted) ts.uploadCompleted = Date.now();
          ts.trainingStarted = Date.now();
          break;
        case 'baking':
          if (!ts.trainingCompleted) ts.trainingCompleted = Date.now();
          ts.bakingStarted = Date.now();
          break;
        case 'compressing':
          if (!ts.bakingCompleted) ts.bakingCompleted = Date.now();
          ts.compressionStarted = Date.now();
          break;
        case 'downloading':
          if (!ts.compressionCompleted) ts.compressionCompleted = Date.now();
          ts.downloadStarted = Date.now();
          break;
        case 'complete':
          if (!ts.downloadCompleted) ts.downloadCompleted = Date.now();
          break;
      }

      // Update stage progress markers
      if (previousStage !== 'idle' && previousStage !== 'failed') {
        this.jobState.stageProgress[previousStage].status = 'complete';
        this.jobState.stageProgress[previousStage].progress = 100;
        this.jobState.stageProgress[previousStage].completedAt = Date.now();
      }
      if (status.stage !== 'complete' && status.stage !== 'failed') {
        this.jobState.stageProgress[status.stage].status = 'active';
        this.jobState.stageProgress[status.stage].startedAt = Date.now();
      }

      this.onStageTransition?.(previousStage, status.stage, this.jobState);
    }

    // Update progress
    if (status.stageProgress !== undefined) {
      const currentStage = this.jobState.stage;
      if (currentStage !== 'complete' && currentStage !== 'failed' && currentStage !== 'idle') {
        this.jobState.stageProgress[currentStage].progress = status.stageProgress;
        this.jobState.stageProgress[currentStage].message = status.message ?? '';
        if (status.estimatedTimeRemainingMs !== undefined) {
          this.jobState.stageProgress[currentStage].estimatedTimeRemainingMs =
            status.estimatedTimeRemainingMs;
        }
      }
    }

    // Update overall progress
    this.jobState.overallProgress = computeOverallProgress(this.jobState);

    // Update metrics
    if (status.trainingMetrics) this.jobState.trainingMetrics = status.trainingMetrics;
    if (status.bakingMetrics) this.jobState.bakingMetrics = status.bakingMetrics;
    if (status.compressionMetrics) this.jobState.compressionMetrics = status.compressionMetrics;

    // Update actual cost
    if (status.actualCost !== undefined) {
      this.jobState.actualCost = status.actualCost;
    }

    // Emit progress
    this.onProgress?.(this.jobState);

    // Handle completion
    if (status.stage === 'complete') {
      if (status.outputs) {
        this.jobState.outputs = status.outputs;
      }
      this.stop();
      this.onComplete?.(this.jobState);
    }

    // Handle failure
    if (status.stage === 'failed') {
      this.jobState.error = {
        stage: previousStage,
        message: status.error ?? 'Unknown error',
        code: status.errorCode ?? 'UNKNOWN',
        retryable: status.retryable ?? false,
      };
      this.stop();
      const error = new BakingPipelineError(
        this.jobState.error.message,
        this.jobState.error.code,
        previousStage,
        this.jobState.error.retryable
      );
      this.onError?.(error, this.jobState);
    }
  }
}

// =============================================================================
// BAKING PIPELINE ORCHESTRATOR
// =============================================================================

/**
 * High-level orchestrator for the full baking pipeline.
 * Manages the complete lifecycle: config -> submit -> track -> download.
 */
export class GaussianBakingPipeline {
  private client: GaussianBakingClient;
  private config: GaussianBakingConfig;
  private tracker: BakingProgressTracker | null = null;
  private jobState: BakingJobState | null = null;

  constructor(apiKey: string, config: Partial<GaussianBakingConfig> = {}, region?: string) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.client = new GaussianBakingClient(apiKey, region);
  }

  /**
   * Get a cost estimate without submitting a job.
   */
  estimateCost(localOBScore?: number, renderTokenPriceUSD?: number): CostEstimate {
    return this.client.estimateCost(this.config, localOBScore, renderTokenPriceUSD);
  }

  /**
   * Execute the full pipeline: submit, track, and download.
   * Returns a promise that resolves when the pipeline completes.
   */
  async execute(callbacks?: {
    onProgress?: ProgressCallback;
    onStageTransition?: StageTransitionCallback;
    onComplete?: (state: BakingJobState) => void;
    onError?: (error: BakingPipelineError, state: BakingJobState) => void;
  }): Promise<BakingJobState> {
    // Submit the job
    this.jobState = await this.client.submitBakingJob(this.config);

    // Set up progress tracking
    this.tracker = new BakingProgressTracker(this.client, this.jobState, {
      pollIntervalMs: 5_000,
      maxPollDurationMs: 120 * 60 * 1000,
    });

    return new Promise((resolve, reject) => {
      if (!this.tracker) {
        reject(new Error('Tracker not initialized'));
        return;
      }

      this.tracker
        .on('progress', (state) => {
          callbacks?.onProgress?.(state);
        })
        .on('stageTransition', (prev, next, state) => {
          callbacks?.onStageTransition?.(prev, next, state);
        })
        .on('complete', async (state) => {
          callbacks?.onComplete?.(state);

          // Auto-download outputs
          try {
            state.outputs = await this.client.getOutputs(state.jobId);
          } catch {
            // Non-fatal: outputs may already be populated
          }

          resolve(state);
        })
        .on('error', (error, state) => {
          callbacks?.onError?.(error, state);
          reject(error);
        });

      this.tracker.start();
    });
  }

  /**
   * Cancel the current pipeline job.
   */
  async cancel(): Promise<{ refundedRENDER: number }> {
    if (!this.jobState) {
      throw new Error('No active job to cancel');
    }

    this.tracker?.stop();
    const result = await this.client.cancelJob(this.jobState.jobId);
    this.jobState.stage = 'failed';
    this.jobState.error = {
      stage: this.jobState.stage,
      message: 'Cancelled by user',
      code: 'CANCELLED',
      retryable: false,
    };

    return { refundedRENDER: result.refundedRENDER };
  }

  /**
   * Get current job state.
   */
  getState(): BakingJobState | null {
    return this.tracker?.getState() ?? this.jobState;
  }

  /**
   * Get the pipeline configuration.
   */
  getConfig(): GaussianBakingConfig {
    return { ...this.config };
  }

  /**
   * Update pipeline configuration (only before execution).
   */
  updateConfig(updates: Partial<GaussianBakingConfig>): void {
    if (this.jobState && this.jobState.stage !== 'idle') {
      throw new Error('Cannot update config while pipeline is running');
    }
    this.config = { ...this.config, ...updates };
  }
}

// =============================================================================
// OCTANE 2026.1 PATH-TRACED SPLAT RENDERING INTEGRATION
// =============================================================================

/**
 * Octane 2026.1 baking configuration generator.
 *
 * Generates the Octane-specific job parameters for path-traced
 * Gaussian splat rendering with relighting, shadow baking,
 * and neural radiance caching.
 *
 * Reference: OTOY OctaneRender 2026.1 documentation
 * - Supports .PLY and .SPZ file loading
 * - Full path tracing with global illumination
 * - Relightable splats (cast and receive shadows)
 * - Neural radiance caching for faster convergence
 * - Trace sets for selective rendering
 * - All camera DoF and raytraced lens effects
 */
export function generateOctaneBakeConfig(config: GaussianBakingConfig): OctaneBakeJobConfig {
  return {
    engine_version: '2026.1',
    render_mode: mapBakeMode(config.octaneBakeMode),
    kernel: {
      type: config.octaneBakeMode === 'direct_lighting' ? 'directlighting' : 'pathtracing',
      max_samples: config.bakeSamples,
      max_bounces: config.bakeMaxBounces,
      // Octane 2026.1 path tracing kernel settings
      caustic_blur: 0.1,
      gi_clamp: 100.0,
      filter_size: 1.5,
      ray_epsilon: 0.0001,
      alpha_shadows: true,
      neural_radiance_cache: config.neuralRadianceCaching
        ? {
            enabled: true,
            training_samples: 256,
            cache_resolution: 128,
            max_cache_bounces: 4,
          }
        : { enabled: false },
    },
    gaussian_splat: {
      // Octane 2026.1 Gaussian Splat rendering parameters
      tint_color: [1.0, 1.0, 1.0],
      alpha_min: 0.01,
      intensity: 1.0,
      flip_axes: false,
      // Relighting configuration
      relighting: config.relightingEnabled
        ? {
            enabled: true,
            cast_shadows: true,
            receive_shadows: true,
            trace_set: 'default',
            // Path-traced shading with global illumination
            global_illumination: true,
          }
        : { enabled: false },
    },
    output: {
      resolution: config.bakeResolution,
      format: 'exr', // High dynamic range for baked lighting
      denoiser: 'spectral_ai', // Octane's AI denoiser
      deep_image: false,
    },
    // Meshlet streaming for large scenes (Octane 2026.1 feature)
    meshlets: {
      enabled: true,
      streaming_budget_mb: 512,
    },
  };
}

/** Octane-specific job configuration (sent to Render Network) */
export interface OctaneBakeJobConfig {
  engine_version: string;
  render_mode: string;
  kernel: {
    type: string;
    max_samples: number;
    max_bounces: number;
    caustic_blur: number;
    gi_clamp: number;
    filter_size: number;
    ray_epsilon: number;
    alpha_shadows: boolean;
    neural_radiance_cache: {
      enabled: boolean;
      training_samples?: number;
      cache_resolution?: number;
      max_cache_bounces?: number;
    };
  };
  gaussian_splat: {
    tint_color: [number, number, number];
    alpha_min: number;
    intensity: number;
    flip_axes: boolean;
    relighting?: {
      enabled: boolean;
      cast_shadows?: boolean;
      receive_shadows?: boolean;
      trace_set?: string;
      global_illumination?: boolean;
    };
  };
  output: {
    resolution: number;
    format: string;
    denoiser: string;
    deep_image: boolean;
  };
  meshlets: {
    enabled: boolean;
    streaming_budget_mb: number;
  };
}

function mapBakeMode(mode: OctaneBakeMode): string {
  switch (mode) {
    case 'path_trace':
      return 'PT';
    case 'direct_lighting':
      return 'DL';
    case 'path_trace_ao':
      return 'PT+AO';
    default:
      return 'PT';
  }
}

// =============================================================================
// INTERNAL TYPES & HELPERS
// =============================================================================

/** Parsed status from Render Network API */
interface BakingJobStatus {
  stage: BakingStage;
  stageProgress?: number;
  message?: string;
  estimatedTimeRemainingMs?: number;
  trainingMetrics?: TrainingMetrics;
  bakingMetrics?: BakingMetrics;
  compressionMetrics?: CompressionMetrics;
  actualCost?: number;
  outputs?: BakingOutput[];
  error?: string;
  errorCode?: string;
  retryable?: boolean;
}

/**
 * Custom error class for baking pipeline errors.
 */
export class BakingPipelineError extends Error {
  code: string;
  stage: BakingStage;
  retryable: boolean;

  constructor(message: string, code: string, stage: BakingStage, retryable: boolean) {
    super(message);
    this.name = 'BakingPipelineError';
    this.code = code;
    this.stage = stage;
    this.retryable = retryable;
  }
}

function randomId(): string {
  return Math.random().toString(36).substring(2, 11);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createInitialStageProgress(
  config: GaussianBakingConfig
): Record<BakingStage, StageProgress> {
  const skipTraining = config.captureFormat === 'ply' || config.captureFormat === 'splat';
  const skipCompression = config.compressionLevel === 'none';

  return {
    idle: { status: 'complete', progress: 100, message: 'Initialized' },
    uploading: { status: 'pending', progress: 0, message: 'Waiting to upload' },
    training: {
      status: skipTraining ? 'skipped' : 'pending',
      progress: skipTraining ? 100 : 0,
      message: skipTraining ? 'Skipped (pre-trained input)' : 'Waiting for training',
    },
    baking: { status: 'pending', progress: 0, message: 'Waiting for baking' },
    compressing: {
      status: skipCompression ? 'skipped' : 'pending',
      progress: skipCompression ? 100 : 0,
      message: skipCompression ? 'Skipped (no compression)' : 'Waiting for compression',
    },
    downloading: { status: 'pending', progress: 0, message: 'Waiting for download' },
    complete: { status: 'pending', progress: 0, message: '' },
    failed: { status: 'pending', progress: 0, message: '' },
  };
}

function computeOverallProgress(state: BakingJobState): number {
  // Weight each stage by its typical duration proportion
  const weights: Record<BakingStage, number> = {
    idle: 0,
    uploading: 10,
    training: 40,
    baking: 30,
    compressing: 10,
    downloading: 10,
    complete: 0,
    failed: 0,
  };

  let totalWeight = 0;
  let weightedProgress = 0;

  for (const [stage, weight] of Object.entries(weights)) {
    const sp = state.stageProgress[stage as BakingStage];
    if (sp.status === 'skipped') continue;
    if (weight === 0) continue;

    totalWeight += weight;
    weightedProgress += (sp.progress / 100) * weight;
  }

  return totalWeight > 0 ? Math.round((weightedProgress / totalWeight) * 100) : 0;
}

function parseBakingJobStatus(response: unknown): BakingJobStatus {
  return {
    stage: response.stage ?? 'idle',
    stageProgress: response.stage_progress,
    message: response.message,
    estimatedTimeRemainingMs: response.estimated_time_remaining_ms,
    trainingMetrics: response.training_metrics
      ? {
          gaussianCount: response.training_metrics.gaussian_count,
          iterationsCompleted: response.training_metrics.iterations_completed,
          peakGPUMemoryMB: response.training_metrics.peak_gpu_memory_mb,
          psnr: response.training_metrics.psnr,
          ssim: response.training_metrics.ssim,
          lpips: response.training_metrics.lpips,
          trainingTimeSecs: response.training_metrics.training_time_secs,
          gpuType: response.training_metrics.gpu_type,
        }
      : undefined,
    bakingMetrics: response.baking_metrics
      ? {
          octaneVersion: response.baking_metrics.octane_version,
          samplesPerPixel: response.baking_metrics.samples_per_pixel,
          maxBounces: response.baking_metrics.max_bounces,
          neuralRadianceCachingUsed: response.baking_metrics.neural_radiance_caching_used,
          bakingTimeSecs: response.baking_metrics.baking_time_secs,
          nodeOBScore: response.baking_metrics.node_ob_score,
          obHoursUsed: response.baking_metrics.ob_hours_used,
        }
      : undefined,
    compressionMetrics: response.compression_metrics
      ? {
          inputSizeBytes: response.compression_metrics.input_size_bytes,
          outputSizeBytes: response.compression_metrics.output_size_bytes,
          compressionRatio: response.compression_metrics.compression_ratio,
          gaussiansBefore: response.compression_metrics.gaussians_before,
          gaussiansAfter: response.compression_metrics.gaussians_after,
          spzVersion: response.compression_metrics.spz_version,
          quaternionEncoding: response.compression_metrics.quaternion_encoding,
          psnrDelta: response.compression_metrics.psnr_delta,
        }
      : undefined,
    actualCost: response.actual_cost,
    outputs: response.outputs?.map((o: unknown) => ({
      type: o.type,
      url: o.url,
      format: o.format,
      sizeBytes: o.size_bytes,
      checksum: o.checksum,
      lodLevel: o.lod_level,
      gaussianCount: o.gaussian_count,
    })),
    error: response.error,
    errorCode: response.error_code,
    retryable: response.retryable,
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  DEFAULT_CONFIG,
  OBH_PER_RENDER,
  REFERENCE_OB_SCORES,
  TRAINING_GPU_HOURS_ESTIMATE,
  BAKING_OBH_ESTIMATES,
  QUALITY_PRESETS_BAKING,
};

/** Quality preset configurations for common use cases */
const QUALITY_PRESETS_BAKING: Record<string, Partial<GaussianBakingConfig>> = {
  /** Quick preview: fast training, minimal baking, no compression */
  preview: {
    trainingMethod: 'gsplat',
    targetGaussianCount: 100_000,
    trainingIterations: 10_000,
    octaneBakeMode: 'direct_lighting',
    bakeSamples: 64,
    bakeMaxBounces: 2,
    compressionLevel: 'none',
    renderTier: 'tier3_economy',
  },
  /** Production quality: balanced training, full path tracing, SPZ v2 */
  production: {
    trainingMethod: 'splatfacto',
    targetGaussianCount: 500_000,
    trainingIterations: 30_000,
    octaneBakeMode: 'path_trace',
    bakeSamples: 512,
    bakeMaxBounces: 8,
    compressionLevel: 'optimized',
    renderTier: 'tier2_priority',
  },
  /** Film quality: maximum fidelity, highest iteration count */
  film: {
    trainingMethod: 'mip_splatting',
    targetGaussianCount: 2_000_000,
    trainingIterations: 50_000,
    shDegree: 3,
    octaneBakeMode: 'path_trace',
    bakeSamples: 2048,
    bakeMaxBounces: 16,
    neuralRadianceCaching: true,
    compressionLevel: 'optimized',
    renderTier: 'tier2_priority',
    generateLOD: true,
  },
  /** VR-optimized: budget-constrained for Quest 3 (W.034) */
  vr_quest3: {
    trainingMethod: 'gsplat',
    targetGaussianCount: 180_000, // W.034: Quest 3 budget
    trainingIterations: 20_000,
    octaneBakeMode: 'path_trace',
    bakeSamples: 256,
    bakeMaxBounces: 4,
    compressionLevel: 'aggressive',
    pruneEnabled: true,
    pruneAlphaThreshold: 0.02,
    renderTier: 'tier3_economy',
    generateLOD: true,
    lodOctreeDepth: 4,
  },
  /** Avatar scan: optimized for per-avatar budget (W.034) */
  avatar: {
    trainingMethod: 'gsplat',
    targetGaussianCount: 60_000, // W.034: per-avatar reservation
    trainingIterations: 15_000,
    octaneBakeMode: 'direct_lighting',
    bakeSamples: 128,
    bakeMaxBounces: 2,
    compressionLevel: 'aggressive',
    pruneEnabled: true,
    pruneAlphaThreshold: 0.03,
    renderTier: 'tier3_economy',
  },
};
