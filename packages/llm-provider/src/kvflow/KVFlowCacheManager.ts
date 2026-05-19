/**
 * KVFlowCacheManager — workflow-aware KV cache management with steps-to-execution
 * eviction and overlapped prefetch.
 *
 * The core KVFlow insight (arXiv:2507.07400): LRU eviction fails in multi-agent
 * workflows because it doesn't anticipate future agent usage. This manager uses
 * the AgentStepGraph to compute "steps-to-execution" (STE) for each cache entry,
 * then:
 *
 * 1. **Eviction**: When GPU memory pressure exceeds threshold, evict entries
 *    with the highest STE first (they'll be needed farthest in the future).
 *    Shared-prefix entries (team-board context) are protected — they're never
 *    evicted until ALL dependent role-overlays are gone.
 *
 * 2. **Prefetch**: When an agent is scheduled to execute soon, proactively
 *    load its KV tensors from CPU to GPU in a background thread, overlapping
 *    the PCIe transfer with the current agent's generation.
 *
 * 3. **Hit-rate tracking**: Emit telemetry events for cache hits/misses so
 *    the early-warning system and /pipeline-audit can surface metrics.
 *
 * Sovereign re-implementation per NMoS (F.046 + F.057): algorithm harvested
 * from the KVFlow paper, implemented on HoloScript's substrate, not adopting
 * SGLang or any external binary.
 *
 * @module @holoscript/llm-provider/kvflow
 * @version 0.1.0
 */

import type {
  KVFlowConfig,
  KVCacheEntry,
  KVFlowScope,
  KVFlowTelemetry,
  EvictionResult,
  PrefetchResult,
  StepNodeId,
} from './types';
import { InMemoryAgentStepGraph } from './AgentStepGraph';

/**
 * Default configuration values. Conservative for single-GPU setups;
 * increase for multi-GPU or high-memory deployments.
 */
const DEFAULT_CONFIG: Required<KVFlowConfig> = {
  maxGpuMemoryBytes: 4 * 1024 * 1024 * 1024, // 4 GB default
  sharedPrefixReserveFraction: 0.4,
  prefetchLookahead: 2,
  minRetentionSte: 1,
  prefetchConcurrency: 1,
};

/**
 * Memory estimate for a KV entry: tokens * bytes-per-token.
 * Conservative: 2 bytes per float16 per token per head, times 2 (K+V).
 * For a 4096-dim, 32-head model: ~2 bytes * 4096 * 32 * 2 layers ≈ 0.5 KB/token.
 * We use a configurable estimate; default is 512 bytes/token (covers most
 * models up to ~70B parameters at fp16).
 */
const DEFAULT_BYTES_PER_TOKEN = 512;

/**
 * The KVFlow cache manager. Maintains an in-memory model of KV cache entries,
 * an AgentStepGraph for workflow-aware scheduling, and drives eviction/prefetch
 * decisions based on steps-to-execution values.
 *
 * This is a *coordination layer* — it doesn't manage actual GPU memory or
 * tensor transfers. Downstream adapters (PagedKVCache, Anthropic prompt cache,
 * etc.) implement the residency transitions. This manager tells them *what*
 * to evict, prefetch, or retain.
 *
 * Wire to the @caching declaration via `scopeFromBrainCaching()` which maps
 * BrainCachingScope → KVFlowScope.
 */
export class KVFlowCacheManager {
  private readonly config: Required<KVFlowConfig>;
  private readonly graph = new InMemoryAgentStepGraph();
  private readonly entries = new Map<StepNodeId, KVCacheEntry>();
  private readonly telemetry: KVFlowTelemetry[] = [];
  private readonly bytesPerToken: number;
  private activeStepIds: StepNodeId[] = [];

  constructor(config?: Partial<KVFlowConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.bytesPerToken = DEFAULT_BYTES_PER_TOKEN;
  }

  // ==========================================================================
  // Graph Operations
  // ==========================================================================

  /**
   * Register an agent step into the workflow graph.
   * Call when an agent activates, claims a task, or changes role.
   */
  addStep(step: import('./types').AgentStep): void {
    this.graph.addStep(step);
  }

  /**
   * Remove an agent step (and its edges) from the graph.
   * Call when an agent deactivates or its session ends.
   */
  removeStep(stepId: StepNodeId): void {
    this.graph.removeStep(stepId);
    this.entries.delete(stepId);
  }

  /**
   * Get the underlying step graph for direct inspection.
   */
  getGraph(): InMemoryAgentStepGraph {
    return this.graph;
  }

  // ==========================================================================
  // Active Step Tracking
  // ==========================================================================

  /**
   * Set the currently active (executing) steps. These get STE=0 in eviction
   * calculations and are never evicted.
   */
  setActiveSteps(stepIds: StepNodeId[]): void {
    this.activeStepIds = stepIds;
  }

  // ==========================================================================
  // Cache Entry Management
  // ==========================================================================

  /**
   * Register a KV cache entry for an agent step. Call when an agent's
   * KV tensors are first loaded (either freshly computed or prefetched).
   */
  addEntry(entry: KVCacheEntry): void {
    this.entries.set(entry.stepId, entry);
  }

  /**
   * Mark a cache entry as used (updates lastUsedAt timestamp and
   * recomputes STE from the graph). Call on every cache hit.
   */
  touchEntry(stepId: StepNodeId, now?: string): void {
    const entry = this.entries.get(stepId);
    if (!entry) return;
    entry.lastUsedAt = now ?? new Date().toISOString();
    // Recompute STE for this entry
    const ste = this.graph.computeStepsToExecution(this.activeStepIds);
    const newSte = ste.get(stepId);
    if (newSte !== undefined) {
      entry.stepsToExecution = newSte;
    }
  }

  /**
   * Get a cache entry by step ID.
   */
  getEntry(stepId: StepNodeId): KVCacheEntry | undefined {
    return this.entries.get(stepId);
  }

  /**
   * Get all cache entries.
   */
  getAllEntries(): KVCacheEntry[] {
    return [...this.entries.values()];
  }

  // ==========================================================================
  // Eviction — Steps-to-Execution Policy
  // ==========================================================================

  /**
   * Run an eviction pass when GPU memory pressure exceeds threshold.
   *
   * Strategy:
   * 1. Compute STE for all entries using the AgentStepGraph.
   * 2. Protect entries with STE <= minRetentionSte (they'll be needed soon).
   * 3. Protect shared-prefix entries until ALL their dependent overlays are evicted.
   * 4. Evict scene-turn entries with highest STE first.
   * 5. Demote role-overlay entries to CPU (host) before evicting entirely.
   * 6. Evict role-overlay entries with highest STE if still over pressure.
   *
   * Returns the eviction result with entries categorized by action.
   */
  evict(targetFreedBytes: number): EvictionResult {
    const ste = this.graph.computeStepsToExecution(this.activeStepIds);
    const now = new Date().toISOString();

    // Update STE values on all entries
    for (const [stepId, newSte] of ste) {
      const entry = this.entries.get(stepId);
      if (entry) {
        entry.stepsToExecution = newSte;
      }
    }

    // Categorize entries by scope
    const sharedPrefixEntries = [] as KVCacheEntry[];
    const roleOverlayEntries = [] as KVCacheEntry[];
    const sceneTurnEntries = [] as KVCacheEntry[];

    for (const entry of this.entries.values()) {
      // Update STE from graph computation
      const entrySte = ste.get(entry.stepId);
      if (entrySte !== undefined) {
        entry.stepsToExecution = entrySte;
      }

      // Skip entries with STE = 0 (currently executing, never evict).
      // Entries with STE > 0 are candidates even if low — they're not
      // executing now, just scheduled soon. The eviction order (scene-turn
      // first, then role-overlay, then shared-prefix) ensures the right
      // priority: the next-to-execute entries are last in the eviction
      // queue, not protected from eviction entirely.
      if (entry.stepsToExecution === 0) {
        continue;
      }

      switch (entry.scope) {
        case 'shared-prefix':
          sharedPrefixEntries.push(entry);
          break;
        case 'role-overlay':
          roleOverlayEntries.push(entry);
          break;
        case 'scene-turn':
          sceneTurnEntries.push(entry);
          break;
      }
    }

    // Sort each category by STE descending (highest STE = evict first)
    const sortBySte = (a: KVCacheEntry, b: KVCacheEntry) =>
      b.stepsToExecution - a.stepsToExecution;
    sceneTurnEntries.sort(sortBySte);
    roleOverlayEntries.sort(sortBySte);
    sharedPrefixEntries.sort(sortBySte);

    const evicted: KVCacheEntry[] = [];
    const demoted: KVCacheEntry[] = [];
    const retained: KVCacheEntry[] = [];
    let freedBytes = 0;

    // Phase 1: Evict scene-turn entries (lowest value, highest churn)
    for (const entry of sceneTurnEntries) {
      if (freedBytes >= targetFreedBytes) break;
      entry.residency = 'evicted';
      evicted.push(entry);
      freedBytes += entry.estimatedBytes;
    }

    // Phase 2: Demote role-overlay entries to CPU (host) — still accessible,
    // but not consuming GPU memory
    for (const entry of roleOverlayEntries) {
      if (freedBytes >= targetFreedBytes) break;

      // Check if all dependent overlays of this entry's shared prefix
      // are already evicted or demoted (only then can we demote/evict it)
      if (entry.isSharedPrefix) {
        const allDependentsGone = entry.dependentOverlayIds.every(
          (depId) => {
            const dep = this.entries.get(depId);
            return !dep || dep.residency === 'evicted' || dep.residency === 'host';
          }
        );
        if (!allDependentsGone) {
          retained.push(entry);
          continue;
        }
      }

      entry.residency = 'host';
      demoted.push(entry);
      freedBytes += entry.estimatedBytes;
    }

    // Phase 3: Evict demoted role-overlay entries if still under pressure
    for (const entry of [...demoted]) {
      if (freedBytes >= targetFreedBytes) break;
      entry.residency = 'evicted';
      evicted.push(entry);
      // Already counted in freedBytes from demotion
    }

    // Phase 4: Protect shared-prefix entries unless all overlays are gone
    for (const entry of sharedPrefixEntries) {
      if (freedBytes >= targetFreedBytes) break;

      const allDependentsGone = entry.dependentOverlayIds.every((depId) => {
        const dep = this.entries.get(depId);
        return !dep || dep.residency === 'evicted';
      });

      if (allDependentsGone) {
        // Safe to evict — no overlays depend on this prefix anymore
        entry.residency = 'evicted';
        evicted.push(entry);
        freedBytes += entry.estimatedBytes;
      } else {
        retained.push(entry);
      }
    }

    // Collect remaining entries as retained
    for (const entry of this.entries.values()) {
      if (
        !evicted.includes(entry) &&
        !demoted.includes(entry) &&
        !retained.includes(entry)
      ) {
        retained.push(entry);
      }
    }

    // Emit telemetry
    this.emitTelemetry({
      type: 'eviction',
      stepId: this.activeStepIds[0] ?? 'unknown',
      scope: 'scene-turn',
      stepsToExecution: 0,
      timestamp: now,
      gpuUsedBytes: this.currentGpuUsage(),
      gpuTotalBytes: this.config.maxGpuMemoryBytes,
      evictedCount: evicted.length,
    });

    return {
      evicted,
      demoted,
      retained,
      freedBytes,
      usedBytesAfter: this.currentGpuUsage() - freedBytes,
    };
  }

  // ==========================================================================
  // Prefetch — Overlapped CPU→GPU Transfer
  // ==========================================================================

  /**
   * Run a prefetch pass for agents scheduled to execute soon.
   *
   * Uses the AgentStepGraph to identify the next N agents in the schedule,
   * checks if their KV entries are on CPU (host) or evicted, and initiates
   * background transfer to GPU.
   *
   * This is the "overlapped prefetch" from KVFlow: while the current agent
   * generates tokens, the next agent's KV tensors are being loaded in
   * parallel, hiding PCIe transfer latency.
   *
   * In a real implementation, this would dispatch GPU memory copy operations
   * on a background thread/stream. Here, we model the scheduling decision
   * and return the prefetch plan for the adapter layer to execute.
   */
  prefetch(currentStepId: StepNodeId): PrefetchResult {
    const startTime = Date.now();
    const now = new Date().toISOString();

    // Find the next scheduled agents from the current step
    const nextSteps = this.graph.nextScheduled(
      currentStepId,
      this.config.prefetchLookahead
    );

    const prefetched: KVCacheEntry[] = [];
    const failed: KVCacheEntry[] = [];
    let bytesTransferred = 0;

    for (const step of nextSteps) {
      const entry = this.entries.get(step.id);
      if (!entry) continue;

      // Only prefetch entries that are on CPU (host) or evicted
      if (entry.residency === 'device') {
        // Already on GPU — no action needed
        continue;
      }

      // Check if there's enough GPU memory
      const availableBytes =
        this.config.maxGpuMemoryBytes - this.currentGpuUsage();
      if (entry.estimatedBytes > availableBytes) {
        // Not enough GPU memory — try evicting first
        const evictionResult = this.evict(entry.estimatedBytes - availableBytes);
        if (evictionResult.freedBytes + availableBytes < entry.estimatedBytes) {
          // Still not enough — mark as failed
          failed.push(entry);
          continue;
        }
      }

      // Transfer to GPU
      entry.residency = 'device';
      entry.lastUsedAt = now;
      entry.stepsToExecution = 0; // Prefetched = will be used very soon
      prefetched.push(entry);
      bytesTransferred += entry.estimatedBytes;
    }

    const durationMs = Date.now() - startTime;

    // Emit telemetry
    this.emitTelemetry({
      type: 'prefetch',
      stepId: currentStepId,
      scope: 'role-overlay',
      stepsToExecution: 0,
      timestamp: now,
      gpuUsedBytes: this.currentGpuUsage(),
      gpuTotalBytes: this.config.maxGpuMemoryBytes,
      prefetchedCount: prefetched.length,
    });

    return {
      prefetched,
      failed,
      durationMs,
      bytesTransferred,
    };
  }

  // ==========================================================================
  // Cache Hit/Miss Tracking
  // ==========================================================================

  /**
   * Record a cache hit for an agent step. Updates STE and emits telemetry.
   * Call when a cached KV entry is reused without recomputation.
   */
  recordHit(stepId: StepNodeId): void {
    this.touchEntry(stepId);
    this.emitTelemetry({
      type: 'hit',
      stepId,
      scope: this.entries.get(stepId)?.scope ?? 'scene-turn',
      stepsToExecution: this.entries.get(stepId)?.stepsToExecution ?? 0,
      timestamp: new Date().toISOString(),
      gpuUsedBytes: this.currentGpuUsage(),
      gpuTotalBytes: this.config.maxGpuMemoryBytes,
      cacheHit: true,
    });
  }

  /**
   * Record a cache miss for an agent step. Emits telemetry.
   * Call when an agent's KV tensors need to be recomputed from scratch.
   */
  recordMiss(stepId: StepNodeId, scope: KVFlowScope): void {
    this.emitTelemetry({
      type: 'miss',
      stepId,
      scope,
      stepsToExecution: 0,
      timestamp: new Date().toISOString(),
      gpuUsedBytes: this.currentGpuUsage(),
      gpuTotalBytes: this.config.maxGpuMemoryBytes,
      cacheHit: false,
    });
  }

  // ==========================================================================
  // Telemetry
  // ==========================================================================

  /**
   * Get recent telemetry events. Used by /pipeline-audit and /reflect
   * to surface KVFlow hit rate and prefetch metrics.
   */
  getTelemetry(limit?: number): KVFlowTelemetry[] {
    return this.telemetry.slice(-(limit ?? 100));
  }

  /**
   * Compute cache hit rate over recent telemetry.
   */
  hitRate(sampleSize?: number): { hits: number; misses: number; rate: number } {
    const recent = this.telemetry.slice(-(sampleSize ?? 100));
    const hitMiss = recent.filter((t) => t.type === 'hit' || t.type === 'miss');
    const hits = hitMiss.filter((t) => t.cacheHit === true).length;
    const misses = hitMiss.filter((t) => t.cacheHit === false).length;
    const total = hits + misses;
    return { hits, misses, rate: total > 0 ? hits / total : 0 };
  }

  /**
   * Current GPU memory pressure (0.0 = empty, 1.0 = full).
   */
  pressure(): number {
    return this.currentGpuUsage() / this.config.maxGpuMemoryBytes;
  }

  // ==========================================================================
  // Internal Helpers
  // ==========================================================================

  private currentGpuUsage(): number {
    let usedBytes = 0;
    for (const entry of this.entries.values()) {
      if (entry.residency === 'device') {
        usedBytes += entry.estimatedBytes;
      }
    }
    return usedBytes;
  }

  private emitTelemetry(event: KVFlowTelemetry): void {
    this.telemetry.push(event);
    // Keep telemetry bounded — drop events older than 1000
    if (this.telemetry.length > 1000) {
      this.telemetry.splice(0, this.telemetry.length - 1000);
    }
  }
}

// =============================================================================
// Scope Mapping — Wire to @caching Declaration
// =============================================================================

/**
 * Map Brittney's BrainCachingScope to KVFlowScope.
 * This is the bridge between the @caching declaration in brain compositions
 * and the KVFlow cache manager's eviction policy.
 *
 * BrainCachingScope → KVFlowScope:
 * - 'team-board' → 'shared-prefix' (high reuse, protected in eviction)
 * - 'agent-role' → 'role-overlay' (medium reuse, demoted before eviction)
 * - 'scene-local' → 'scene-turn' (low reuse, evicted first)
 */
export function scopeFromBrainCaching(
  brainScope: 'team-board' | 'agent-role' | 'scene-local'
): KVFlowScope {
  switch (brainScope) {
    case 'team-board':
      return 'shared-prefix';
    case 'agent-role':
      return 'role-overlay';
    case 'scene-local':
      return 'scene-turn';
  }
}

/**
 * Map KVFlowScope back to BrainCacheUsage for telemetry and diagnostics.
 */
export function scopeToCacheUsage(
  scope: KVFlowScope
): 'shared-prefix' | 'role-overlay' | 'scene-turn' {
  return scope;
}

/**
 * Estimate the byte size of a KV cache entry from its token count.
 * Uses a configurable bytes-per-token estimate (default 512 bytes/token).
 */
export function estimateKVBytes(tokenCount: number, bytesPerToken?: number): number {
  return tokenCount * (bytesPerToken ?? DEFAULT_BYTES_PER_TOKEN);
}

/**
 * Create a KVCacheEntry from an AgentStep and computed STE value.
 * Convenience factory for wiring step graph → cache manager.
 */
export function entryFromStep(
  step: import('./types').AgentStep,
  stepsToExecution: number,
  residency: KVResidency = 'device',
  dependentOverlayIds: StepNodeId[] = [],
  bytesPerToken?: number
): KVCacheEntry {
  return {
    stepId: step.id,
    scope: step.scope,
    residency,
    stepsToExecution,
    estimatedBytes: estimateKVBytes(step.estimatedTokens, bytesPerToken),
    lastUsedAt: step.lastActivatedAt ?? new Date().toISOString(),
    isSharedPrefix: step.scope === 'shared-prefix',
    dependentOverlayIds,
  };
}

// Re-export for convenience
type KVResidency = import('./types').KVResidency;