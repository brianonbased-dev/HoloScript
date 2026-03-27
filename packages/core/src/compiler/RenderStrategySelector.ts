/**
 * RenderStrategySelector — Pre-Frame Rendering Strategy Auto-Selection
 *
 * Decides the optimal rendering approach per draw group based on:
 * - Shape count (1 → 1M+)
 * - Geometry homogeneity (all same type vs mixed)
 * - Screen coverage (tiny particles vs large objects)
 * - GPU tier (low/medium/high/ultra)
 * - Available API (WebGL2 vs WebGPU)
 *
 * @see HS-GEO-5: Pre-Frame Strategy Selector
 * @see W.240: Strategy selector decision tree
 * @see G.SEC.GEO.002: CPU-GPU transfer bottleneck at 50K
 */

// =============================================================================
// Types
// =============================================================================

export type RenderStrategy =
  | 'standard_mesh'
  | 'batched_mesh'
  | 'instanced'
  | 'sdf_raymarch'
  | 'compute_rasterize';

export type GPUTier = 'low' | 'medium' | 'high' | 'ultra';

export interface DrawGroup {
  /** Total shapes in this group */
  shapeCount: number;
  /** Whether all shapes share the same geometry type */
  homogeneous: boolean;
  /** Geometry type (if homogeneous) */
  geometryType?: string;
  /** Average screen coverage per shape (0-1, fraction of viewport) */
  avgScreenCoverage?: number;
  /** Whether shapes are mathematically defined (SDF-compatible) */
  isMathematical?: boolean;
  /** Total unique materials */
  materialCount?: number;
  /** Whether the group is animated */
  animated?: boolean;
}

export interface StrategyContext {
  /** GPU capability tier */
  gpuTier: GPUTier;
  /** Whether WebGPU is available */
  hasWebGPU: boolean;
  /** Target frame time in ms */
  targetFrameTime?: number;
  /** Available GPU memory estimate in MB */
  gpuMemoryMB?: number;
}

export interface StrategyResult {
  strategy: RenderStrategy;
  reason: string;
  estimatedDrawCalls: number;
  estimatedGPUTimeMs: number;
  warnings: string[];
}

// =============================================================================
// GPU Tier Defaults
// =============================================================================

const GPU_TIER_LIMITS: Record<GPUTier, { maxInstances: number; maxDrawCalls: number; maxTriangles: number }> = {
  low: { maxInstances: 10_000, maxDrawCalls: 100, maxTriangles: 500_000 },
  medium: { maxInstances: 100_000, maxDrawCalls: 500, maxTriangles: 5_000_000 },
  high: { maxInstances: 500_000, maxDrawCalls: 2000, maxTriangles: 20_000_000 },
  ultra: { maxInstances: 2_000_000, maxDrawCalls: 10000, maxTriangles: 100_000_000 },
};

// =============================================================================
// Strategy Selection
// =============================================================================

/**
 * Select the optimal rendering strategy for a draw group.
 *
 * Decision tree:
 * 1. < 1K shapes → standard_mesh (simplest, no setup overhead)
 * 2. 1K-50K mixed geometry → batched_mesh (merge into single VBO)
 * 3. > 50K same geometry → instanced (GPU instanced mesh)
 * 4. Mathematical/organic shapes → sdf_raymarch (ray marching shader)
 * 5. > 1M shapes + WebGPU → compute_rasterize (compute shader path)
 */
export function selectStrategy(group: DrawGroup, context: StrategyContext): StrategyResult {
  const warnings: string[] = [];
  const limits = GPU_TIER_LIMITS[context.gpuTier];
  const count = group.shapeCount;

  // SDF check: mathematical shapes are best served by ray marching
  if (group.isMathematical && count <= 100) {
    return {
      strategy: 'sdf_raymarch',
      reason: `Mathematical geometry with ${count} shapes — SDF ray marching gives pixel-perfect quality`,
      estimatedDrawCalls: 1,
      estimatedGPUTimeMs: estimateSDFTime(count, context),
      warnings,
    };
  }

  // Compute rasterize: massive counts with WebGPU
  if (count > 1_000_000 && context.hasWebGPU) {
    if (count > limits.maxInstances) {
      warnings.push(`Shape count ${count} exceeds tier ${context.gpuTier} limit of ${limits.maxInstances}`);
    }
    return {
      strategy: 'compute_rasterize',
      reason: `${count} shapes + WebGPU available — compute shader rasterization`,
      estimatedDrawCalls: Math.ceil(count / 1_000_000),
      estimatedGPUTimeMs: estimateComputeTime(count, context),
      warnings,
    };
  }

  // Instanced: high count, same geometry
  if (count > 50_000 && group.homogeneous) {
    if (count > limits.maxInstances) {
      warnings.push(`Shape count ${count} may exceed GPU tier ${context.gpuTier} capacity`);
    }
    return {
      strategy: 'instanced',
      reason: `${count} homogeneous ${group.geometryType || 'shapes'} — GPU instanced rendering`,
      estimatedDrawCalls: 1,
      estimatedGPUTimeMs: estimateInstancedTime(count, context),
      warnings,
    };
  }

  // Instanced: moderate count but same geometry
  if (count > 1_000 && group.homogeneous) {
    return {
      strategy: 'instanced',
      reason: `${count} homogeneous shapes — instanced mesh (single draw call)`,
      estimatedDrawCalls: 1,
      estimatedGPUTimeMs: estimateInstancedTime(count, context),
      warnings,
    };
  }

  // Batched: moderate count, mixed geometry
  if (count > 1_000 && !group.homogeneous) {
    const materialGroups = group.materialCount || 1;
    return {
      strategy: 'batched_mesh',
      reason: `${count} mixed shapes with ${materialGroups} materials — batched into merged VBOs`,
      estimatedDrawCalls: materialGroups,
      estimatedGPUTimeMs: estimateBatchedTime(count, context),
      warnings,
    };
  }

  // Standard: small counts
  return {
    strategy: 'standard_mesh',
    reason: `${count} shapes — standard mesh rendering (low overhead)`,
    estimatedDrawCalls: count,
    estimatedGPUTimeMs: estimateStandardTime(count, context),
    warnings,
  };
}

// =============================================================================
// Cost Estimation
// =============================================================================

function estimateStandardTime(count: number, ctx: StrategyContext): number {
  const baseCostPerDraw = ctx.gpuTier === 'low' ? 0.05 : ctx.gpuTier === 'medium' ? 0.02 : 0.01;
  return count * baseCostPerDraw;
}

function estimateInstancedTime(count: number, ctx: StrategyContext): number {
  const baseCost = ctx.gpuTier === 'low' ? 2.0 : ctx.gpuTier === 'medium' ? 1.0 : 0.5;
  return baseCost + count * 0.000015;
}

function estimateBatchedTime(count: number, ctx: StrategyContext): number {
  const baseCost = ctx.gpuTier === 'low' ? 1.5 : ctx.gpuTier === 'medium' ? 0.8 : 0.3;
  return baseCost + count * 0.00005;
}

function estimateSDFTime(count: number, ctx: StrategyContext): number {
  const baseCost = ctx.gpuTier === 'low' ? 3.0 : ctx.gpuTier === 'medium' ? 1.5 : 0.8;
  return baseCost + count * 0.05;
}

function estimateComputeTime(count: number, ctx: StrategyContext): number {
  const baseCost = ctx.gpuTier === 'high' ? 2.0 : 1.0;
  return baseCost + count * 0.000002;
}

/**
 * Select strategies for multiple draw groups and return them sorted by priority.
 */
export function selectStrategies(
  groups: DrawGroup[],
  context: StrategyContext,
): StrategyResult[] {
  return groups
    .map(g => selectStrategy(g, context))
    .sort((a, b) => a.estimatedGPUTimeMs - b.estimatedGPUTimeMs);
}

/**
 * Get default strategy context based on GPU tier detection.
 */
export function getDefaultContext(tier?: GPUTier): StrategyContext {
  return {
    gpuTier: tier || 'medium',
    hasWebGPU: typeof navigator !== 'undefined' && 'gpu' in navigator,
    targetFrameTime: 16.67,
    gpuMemoryMB: tier === 'ultra' ? 8192 : tier === 'high' ? 4096 : tier === 'medium' ? 2048 : 1024,
  };
}
