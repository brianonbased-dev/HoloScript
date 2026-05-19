/**
 * KVFlow Types — workflow-aware KV cache management for multi-agent systems.
 *
 * Inspired by KVFlow (arXiv:2507.07400): Agent Step Graph, steps-to-execution
 * eviction, and overlapped prefetch. Sovereign re-implementation on HoloScript's
 * substrate — NOT an adoption of the SGLang binary or radix cache.
 *
 * @module @holoscript/llm-provider/kvflow
 * @version 0.1.0
 */

// =============================================================================
// Agent Step Graph
// =============================================================================

/**
 * Unique identifier for an agent step node. Format: `{agentId}:{stepIndex}`
 * where `stepIndex` is the sequential activation count for that agent within
 * the current workflow.
 */
export type StepNodeId = string;

/**
 * Cache scope mirrors BrainCachingScope from brittney/caching.ts but is
 * independent so @holoscript/llm-provider doesn't depend on @holoscript/studio.
 *
 * - `shared-prefix`: team-board context (stable, reused across many agents)
 * - `role-overlay`: per-agent role composition (stable within a session)
 * - `scene-turn`: ephemeral per-turn context (low reuse, high churn)
 */
export type KVFlowScope = 'shared-prefix' | 'role-overlay' | 'scene-turn';

/**
 * Residency state of a KV cache entry. Mirrors PagedKVCache.PageRef but
 * generalized for any backing store (GPU pages, CPU pages, remote cache).
 */
export type KVResidency = 'device' | 'host' | 'evicted';

/**
 * A single step in the agent workflow graph. Each step represents one
 * activation of an agent (one LLM call cycle: prompt in → completion out).
 *
 * Steps are the scheduling unit for KVFlow — the cache manager uses the
 * graph topology to decide what to evict and what to prefetch.
 */
export interface AgentStep {
  /** Unique node id within this graph (agentId:stepIndex). */
  id: StepNodeId;

  /** Which agent this step belongs to (e.g. 'claudecode-claude-x402'). */
  agentId: string;

  /** Sequential activation index for this agent within the workflow. */
  stepIndex: number;

  /** Caching scope of the KV prefix this step uses. */
  scope: KVFlowScope;

  /** Estimated token count for this step's KV entry (prefix + overlay). */
  estimatedTokens: number;

  /**
   * Steps that must complete before this one can start.
   * Edges in the dependency graph — the KV cache uses these to compute
   * "steps-to-execution" (how many other steps will run before this agent
   * is re-activated).
   */
  dependsOn: StepNodeId[];

  /** Wall-clock priority hint (lower = higher priority for cache residency). */
  priority: number;

  /** Timestamp of the most recent activation (ISO 8601). */
  lastActivatedAt?: string;
}

/**
 * The directed graph of agent activations. Nodes are AgentSteps; edges are
 * scheduling dependencies (from `dependsOn`). The KVFlow cache manager
 * traverses this graph to compute eviction scores and prefetch targets.
 *
 * Constructed from:
 * - HoloMesh team board (which agents are active, their roles, priorities)
 * - Agent runtime tick schedule (how often each agent polls/executes)
 * - Brittney brain composition (shared-prefix vs role-overlay scope)
 */
export interface AgentStepGraph {
  /** All steps in the graph, keyed by StepNodeId. */
  steps: Map<StepNodeId, AgentStep>;

  /**
   * Register a step into the graph. Replaces any existing step with the same id.
   * Call this when an agent activates, claims a task, or changes role.
   */
  addStep(step: AgentStep): void;

  /**
   * Remove a step and all edges referencing it. Call this when an agent
   * deactivates or its session ends.
   */
  removeStep(stepId: StepNodeId): void;

  /**
   * Compute the "steps-to-execution" value for every node in the graph.
   *
   * This is the core KVFlow insight: instead of LRU eviction (which just
   * looks at recency), we look at *when each agent will be needed next*
   * based on the workflow graph topology.
   *
   * A step with STE=0 is currently executing (or about to). Higher STE
   * means "more steps before this agent runs again" — the cache manager
   * should prefer evicting high-STE entries and keeping low-STE entries.
   *
   * Computation: topological sort of the dependency graph, then for each
   * node, STE = max(1, length of longest path from any currently-active
   * node to this node). When no active nodes exist, STE = topological
   * position (fairness fallback).
   */
  computeStepsToExecution(activeStepIds: StepNodeId[]): Map<StepNodeId, number>;

  /**
   * Get the next N agents scheduled to execute after the given step.
   * Used by the prefetch scheduler to decide which KV entries to warm.
   */
  nextScheduled(stepId: StepNodeId, count: number): AgentStep[];

  /**
   * Serialize the graph to a plain object for persistence or debugging.
   */
  toJSON(): { steps: AgentStep[] };
}

// =============================================================================
// KV Cache Management
// =============================================================================

/**
 * A single KV cache entry tracked by the KVFlow manager. Each entry maps
 * to one agent step's KV tensor (shared prefix + role overlay).
 */
export interface KVCacheEntry {
  /** The agent step this entry belongs to. */
  stepId: StepNodeId;

  /** Cache scope (shared prefix vs role overlay vs scene turn). */
  scope: KVFlowScope;

  /** Current residency of this entry's KV tensors. */
  residency: KVResidency;

  /**
   * Steps-to-execution value from the AgentStepGraph. Lower = more likely
   * to be needed soon = higher cache priority.
   */
  stepsToExecution: number;

  /** Estimated GPU memory footprint in bytes. */
  estimatedBytes: number;

  /** Timestamp this entry was last used or prefetched (ISO 8601). */
  lastUsedAt: string;

  /**
   * Whether this entry shares a prefix root with other entries.
   * Shared-prefix entries (team-board scope) are protected from eviction
   * until ALL dependent overlays are evicted first.
   */
  isSharedPrefix: boolean;

  /** Step IDs that depend on this entry's prefix (only set for shared-prefix scope). */
  dependentOverlayIds: StepNodeId[];
}

/**
 * Configuration for the KVFlow cache manager.
 */
export interface KVFlowConfig {
  /** Maximum GPU memory available for KV cache, in bytes. */
  maxGpuMemoryBytes: number;

  /**
   * Fraction of max GPU memory to reserve for shared prefixes.
   * These entries are never evicted until all overlays are gone.
   * Default: 0.4 (40% for team-board context).
   */
  sharedPrefixReserveFraction: number;

  /**
   * Prefetch lookahead window — how many future steps to warm.
   * Default: 2 (prefetch KV for the next 2 agents in the schedule).
   */
  prefetchLookahead: number;

  /**
   * Minimum steps-to-execution threshold. Entries with STE below this
   * value are never evicted (they'll be needed too soon).
   * Default: 1 (currently-executing steps are always retained).
   */
  minRetentionSte: number;

  /**
   * Background prefetch concurrency. How many KV entries can be
   * loaded from CPU to GPU simultaneously.
   * Default: 1 (serial prefetch — conservative for single-GPU setups).
   */
  prefetchConcurrency: number;
}

/**
 * Result of an eviction pass. The cache manager runs this when GPU memory
 * pressure exceeds the threshold.
 */
export interface EvictionResult {
  /** Entries that were evicted from GPU (residency moved to 'evicted'). */
  evicted: KVCacheEntry[];

  /** Entries that were demoted from GPU to CPU (residency moved to 'host'). */
  demoted: KVCacheEntry[];

  /** Entries that were retained on GPU. */
  retained: KVCacheEntry[];

  /** GPU memory freed by this eviction, in bytes. */
  freedBytes: number;

  /** Current GPU memory usage after eviction, in bytes. */
  usedBytesAfter: number;
}

/**
 * Result of a prefetch pass. The cache manager runs this proactively to
 * warm KV entries for agents scheduled in the near future.
 */
export interface PrefetchResult {
  /** Entries successfully prefetched from CPU to GPU. */
  prefetched: KVCacheEntry[];

  /** Entries that couldn't be prefetched (insufficient GPU memory, etc.). */
  failed: KVCacheEntry[];

  /** Time spent on prefetch in milliseconds. */
  durationMs: number;

  /** Total bytes transferred from CPU to GPU. */
  bytesTransferred: number;
}

/**
 * Telemetry event emitted by the KVFlow manager. Wired to the early-warning
 * telemetry in holoscript-agent/cost-guard and the /pipeline-audit + /reflect
 * skill surfaces.
 */
export interface KVFlowTelemetry {
  /** Type of telemetry event. */
  type: 'eviction' | 'prefetch' | 'hit' | 'miss' | 'pressure';

  /** Agent step that triggered this event. */
  stepId: StepNodeId;

  /** Cache scope of the affected entry. */
  scope: KVFlowScope;

  /** Steps-to-execution value at the time of this event. */
  stepsToExecution: number;

  /** Timestamp (ISO 8601). */
  timestamp: string;

  /** GPU memory usage at the time of this event, in bytes. */
  gpuUsedBytes: number;

  /** Total GPU memory available, in bytes. */
  gpuTotalBytes: number;

  /** For hit/miss events: was this a cache hit or miss? */
  cacheHit?: boolean;

  /** For eviction events: entries evicted in this pass. */
  evictedCount?: number;

  /** For prefetch events: entries prefetched in this pass. */
  prefetchedCount?: number;

  /** For pressure events: current pressure ratio (0.0–1.0). */
  pressureRatio?: number;
}