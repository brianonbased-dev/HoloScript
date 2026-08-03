/**
 * KVFlow — workflow-aware KV cache management for multi-agent systems.
 *
 * Inspired by KVFlow (arXiv:2507.07400): Agent Step Graph, steps-to-execution
 * eviction, and overlapped prefetch. Sovereign re-implementation on HoloScript's
 * substrate — NOT an adoption of the SGLang binary or radix cache.
 *
 * @module @holoscript/llm-provider/kvflow
 * @version 0.1.0
 */

// Types
export type {
  StepNodeId,
  KVFlowScope,
  KVResidency,
  AgentStep,
  AgentStepGraph,
  KVCacheEntry,
  KVFlowConfig,
  EvictionResult,
  PrefetchResult,
  KVFlowTelemetry,
} from './types';

// Agent Step Graph
export { InMemoryAgentStepGraph } from './AgentStepGraph';

// Cache Manager + scope mapping + utilities
export {
  KVFlowCacheManager,
  scopeFromBrainCaching,
  scopeToCacheUsage,
  estimateKVBytes,
  entryFromStep,
} from './KVFlowCacheManager';

// Early Warning — carousel-pattern detection and per-brain metrics
export {
  KVFlowCarouselDetector,
  checkCarouselEarlyWarning,
  defaultCarouselDetector,
} from './KVFlowEarlyWarning';

export type {
  BrainMetrics,
  CarouselSeverity,
  CarouselWarning,
  WorkflowDrift,
  CarouselEarlyWarningReport,
  CarouselSummary,
  CarouselEarlyWarningConfig,
} from './KVFlowEarlyWarning';

// Breakpoint planning — the bridge from KVFlow scheduling knowledge to
// provider-side cache breakpoint placement. Backend-agnostic by design:
// Anthropic's prompt cache is the first consumer, HoloLlama and HoloServe
// face the same "which prefix spans stay hot" question.
export { planCacheBreakpoints } from './breakpoint-planner';
export type { CacheBreakpointHint } from './breakpoint-planner';
