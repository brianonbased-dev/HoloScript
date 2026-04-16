/**
 * @holoscript/framework AI Module
 *
 * Provider-agnostic AI integration, game AI systems (behavior trees, state machines,
 * steering, perception, utility AI), and generation pipeline.
 *
 * Canonical home for all AI subsystems (moved from @holoscript/core in A.011.02c).
 *
 * @packageDocumentation
 */

// Core adapter interface and registry
export {
  // Types
  type AIAdapter,
  type GenerateResult,
  type ExplainResult,
  type OptimizeResult,
  type FixResult,
  type GenerateOptions,

  // Registry functions
  registerAIAdapter,
  getAIAdapter,
  getDefaultAIAdapter,
  setDefaultAIAdapter,
  listAIAdapters,
  unregisterAIAdapter,

  // Convenience functions (use default adapter)
  generateHoloScript,
  explainHoloScript,
  optimizeHoloScript,
  fixHoloScript,
} from './AIAdapter';

// Built-in adapters
export {
  // Adapter classes
  OpenAIAdapter,
  AnthropicAdapter,
  OllamaAdapter,
  LMStudioAdapter,
  GeminiAdapter,
  XAIAdapter,
  TogetherAdapter,
  FireworksAdapter,
  NVIDIAAdapter,

  // Config types
  type OpenAIAdapterConfig,
  type AnthropicAdapterConfig,
  type OllamaAdapterConfig,
  type LMStudioAdapterConfig,
  type GeminiAdapterConfig,
  type XAIAdapterConfig,
  type TogetherAdapterConfig,
  type FireworksAdapterConfig,
  type NVIDIAAdapterConfig,

  // Factory functions (create + register in one call)
  useOpenAI,
  useAnthropic,
  useOllama,
  useLMStudio,
  useGemini,
  useXAI,
  useGrok,
  useTogether,
  useFireworks,
  useNVIDIA,
} from './adapters';

export { SemanticSearchService, type SearchResult } from './SemanticSearchService';

// AI game systems (behavior trees, state machines, blackboards, steering, etc.)
export { BehaviorTree } from './BehaviorTree';
export type { BTContext as BTTreeContext, BTTreeDef } from './BehaviorTree';

export {
  BTNode,
  SequenceNode,
  SelectorNode,
  ParallelNode,
  InverterNode,
  RepeaterNode,
  GuardNode,
  ActionNode,
  ConditionNode,
  WaitNode,
} from './BTNodes';
export type { BTStatus } from './BTNodes';

export { Blackboard } from './Blackboard';

export { StateMachine } from './StateMachine';
export type { StateConfig, TransitionConfig, StateAction, GuardFn } from './StateMachine';

// Steering & navigation
export { SteeringBehavior } from './SteeringBehavior';
export { SteeringBehaviors } from './SteeringBehaviors';
export { NavMesh } from './NavMesh';

// Perception & influence
export { PerceptionSystem } from './PerceptionSystem';
export { InfluenceMap } from './InfluenceMap';

// Utility AI & behavior selection
export { UtilityAI } from './UtilityAI';
export { BehaviorSelector } from './BehaviorSelector';

// Goal planning
export { GoalPlanner } from './GoalPlanner';

// Generation pipeline
export {
  HoloScriptGenerator,
  generateHoloScript as generateHoloScriptWithAdapter,
  generateBatch,
  validateBatch,
} from './HoloScriptGenerator';
export { GenerationCache, cachedGenerate } from './GenerationCache';
export { GenerationAnalytics, createAnalytics } from './GenerationAnalytics';
export {
  TrainingDataGenerator,
  createTrainingDataGenerator,
  ALL_CATEGORIES,
} from './TrainingDataGenerator';
export { PromptTemplateSystem, QuickPrompts } from './PromptTemplates';
export type { PromptTemplate, TemplateContext } from './PromptTemplates';

// AI copilot & validation
export { AICopilot, type CopilotResponse, type CopilotSuggestion } from './AICopilot';
export { validateAIOutput, isAISafe } from './AIOutputValidator';
