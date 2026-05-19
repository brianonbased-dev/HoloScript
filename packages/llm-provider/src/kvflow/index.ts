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