/**
 * @holoscript/core - Agent Type Definitions
 *
 * Shared types for the HoloScript Agent Framework.
 * Defines the 7-phase uAA2++ protocol and agent capabilities.
 */

// ============================================================================
// PHASE DEFINITIONS
// ============================================================================

/**
 * The 7 phases of the uAA2++ protocol
 */
export type AgentPhase =
  | 'INTAKE' // Phase 0: Gather data and context
  | 'REFLECT' // Phase 1: Analyze and understand
  | 'EXECUTE' // Phase 2: Take action
  | 'COMPRESS' // Phase 3: Store knowledge efficiently
  | 'REINTAKE' // Phase 4: Re-evaluate with compressed knowledge
  | 'GROW' // Phase 5: Learn and improve
  | 'EVOLVE'; // Phase 6: Adapt and optimize

/**
 * Phase execution order
 */
export const PHASE_ORDER: readonly AgentPhase[] = [
  'INTAKE',
  'REFLECT',
  'EXECUTE',
  'COMPRESS',
  'REINTAKE',
  'GROW',
  'EVOLVE',
] as const;

/**
 * Default phase timings (milliseconds)
 */
export const DEFAULT_PHASE_TIMINGS: Record<AgentPhase, number> = {
  INTAKE: 1000,
  REFLECT: 2000,
  EXECUTE: 5000,
  COMPRESS: 1000,
  REINTAKE: 1000,
  GROW: 2000,
  EVOLVE: 1000,
};

// ============================================================================
// PHASE RESULTS
// ============================================================================

/**
 * Base result for all phases
 */
export interface PhaseResult {
  success: boolean;
  phase: AgentPhase;
  duration_ms: number;
  error?: string;
  data?: Record<string, unknown>;
}

/**
 * INTAKE phase result
 */
export interface IntakeResult extends PhaseResult {
  phase: 'INTAKE';
  sources: string[];
  items_loaded: number;
  data?: {
    knowledge?: Record<string, unknown>;
    patterns?: unknown[];
    wisdom?: unknown[];
    gotchas?: unknown[];
    context?: Record<string, unknown>;
  };
}

/**
 * REFLECT phase result
 */
export interface ReflectResult extends PhaseResult {
  phase: 'REFLECT';
  analysis_depth: 'shallow' | 'medium' | 'deep';
  insights_generated: number;
  data?: {
    ai_context?: string;
    decision_criteria?: Record<string, unknown>;
    priorities?: string[];
    risks?: string[];
  };
}

/**
 * EXECUTE phase result
 */
export interface ExecuteResult extends PhaseResult {
  phase: 'EXECUTE';
  actions_taken: number;
  deliverables: string[];
  data?: {
    outputs?: unknown[];
    side_effects?: string[];
    metrics?: Record<string, number>;
  };
}

/**
 * COMPRESS phase result
 */
export interface CompressResult extends PhaseResult {
  phase: 'COMPRESS';
  compression_ratio: number;
  tokens_saved: number;
  data?: {
    compressed_knowledge?: string;
    symbol_mappings?: Record<string, string>;
    patterns_extracted?: string[];
    wisdom_extracted?: string[];
    gotchas_captured?: string[];
  };
}

/**
 * REINTAKE phase result
 */
export interface ReintakeResult extends PhaseResult {
  phase: 'REINTAKE';
  items_refreshed: number;
  effectiveness: number; // 0-1
  data?: {
    merged_knowledge?: Record<string, unknown>;
    conflicts_resolved?: number;
    new_insights?: string[];
  };
}

/**
 * GROW phase result
 */
export interface GrowResult extends PhaseResult {
  phase: 'GROW';
  patterns_learned: number;
  wisdom_gained: number;
  gotchas_captured: number;
  data?: {
    new_patterns?: Array<{ id: string; name: string; confidence: number }>;
    new_wisdom?: Array<{ id: string; content: string; domain: string }>;
    new_gotchas?: Array<{ id: string; trigger: string; avoidance: string }>;
    capability_score_delta?: number;
  };
}

/**
 * EVOLVE phase result
 */
export interface EvolveResult extends PhaseResult {
  phase: 'EVOLVE';
  evolution_level: number;
  traits_activated: string[];
  traits_deactivated: string[];
  data?: {
    new_capabilities?: string[];
    optimizations_applied?: string[];
    efficiency_improvement?: number;
    next_evolution_threshold?: number;
  };
}

/**
 * Union type for all phase results
 */
export type AnyPhaseResult =
  | IntakeResult
  | ReflectResult
  | ExecuteResult
  | CompressResult
  | ReintakeResult
  | GrowResult
  | EvolveResult;

/**
 * Complete cycle result
 */
export interface CycleResult {
  cycle_number: number;
  success: boolean;
  total_duration_ms: number;
  phases: {
    intake?: IntakeResult;
    reflect?: ReflectResult;
    execute?: ExecuteResult;
    compress?: CompressResult;
    reintake?: ReintakeResult;
    grow?: GrowResult;
    evolve?: EvolveResult;
  };
  learnings: {
    patterns: number;
    wisdom: number;
    gotchas: number;
  };
  evolution_delta: number;
  timestamp: string;
}

// ============================================================================
// AGENT CONFIGURATION
// ============================================================================

/**
 * Agent category classification
 */
export type AgentCategory =
  | 'trading'
  | 'analysis'
  | 'optimization'
  | 'monitoring'
  | 'creative'
  | 'management'
  | 'strategic'
  | 'assistant'
  | 'orchestrator'
  | 'quest_creator'
  | 'librarian'
  | 'twin_manager'
  | 'payment_handler';

/**
 * Agent position in the Lotus Flower Architecture
 */
export type AgentPosition =
  | 'center' // Core coordinator (CEO)
  | 'inner-circle' // High-trust advisors
  | 'main-petal' // Primary executors
  | 'inner-petal' // Specialist agents
  | 'supportive' // Helper agents
  | 'background' // Background processors
  | 'infrastructure'; // System services

/**
 * Agent orchestral section (musical metaphor)
 */
export type AgentSection =
  | 'strings' // Foundation & harmony
  | 'woodwinds' // Melody & nuance
  | 'brass' // Power & announcements
  | 'percussion' // Rhythm & timing
  | 'keyboard' // Versatility & support
  | 'vocal'; // Communication & expression

/**
 * Architecture awareness metadata
 */
export interface ArchitectureAwareness {
  position: AgentPosition;
  section?: AgentSection;
  role: string;
  visualizationDoc?: string;
  musicPatterns?: {
    interval: 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII';
    formRole: 'exposition' | 'development' | 'recapitulation' | 'coda' | 'refrain';
    pulse: 'strong' | 'weak' | 'syncopated';
  };
}

/**
 * Phase configuration overrides
 */
export interface PhaseConfig {
  enabled?: boolean;
  timeout_ms?: number;
  retries?: number;
  parallel?: boolean;
  dependencies?: AgentPhase[];
}

/**
 * Curiosity configuration (what's next?)
 */
export interface CuriosityConfig {
  enabled: boolean;
  depth: 'shallow' | 'medium' | 'deep';
  sources: Array<'todo' | 'handoff' | 'codebase' | 'related' | 'improvement' | 'pattern'>;
  auto_continue: boolean;
  max_results: number;
}

/**
 * Budget configuration for runaway prevention
 */
export interface BudgetConfig {
  max_tokens_per_cycle: number;
  max_duration_ms: number;
  max_actions_per_minute: number;
  max_consecutive_failures: number;
}

/**
 * Complete agent configuration
 */
export interface AgentConfig {
  // Identity
  agent_id: string;
  agent_name: string;
  agent_type: string;
  categories: AgentCategory[];

  // Architecture
  architecture?: ArchitectureAwareness;

  // Phase configuration
  phases?: Partial<Record<AgentPhase, PhaseConfig>>;
  phase_timings?: Partial<Record<AgentPhase, number>>;
  enabled_phases?: AgentPhase[];
  auto_transition?: boolean;

  // Behavior
  curiosity?: Partial<CuriosityConfig>;
  budget?: Partial<BudgetConfig>;

  // LLM configuration
  llm?: {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    system_prompt?: string;
  };

  // Custom configuration
  custom?: Record<string, unknown>;
}

// ============================================================================
// AGENT STATE
// ============================================================================

/**
 * Cycle metrics for lifespan tracking
 */
export interface CycleMetric {
  cycle_number: number;
  duration_ms: number;
  success: boolean;
  score: number;
  timestamp: number;
}

/**
 * Agent lifespan context - tracks evolution across cycles
 */
export interface AgentLifespanContext {
  total_cycles_completed: number;
  evolution_level: number;
  performance_trend: 'improving' | 'stable' | 'declining';
  average_cycle_duration: number;
  recent_metrics: CycleMetric[];
  knowledge_growth_trajectory: number;
  adaptation_score: number;
  related_tasks: string[];
}

/**
 * Assistant-specific lifespan context (e.g., Brittney)
 */
export interface AssistantLifespanContext {
  total_interactions: number;
  training_data_processed: number;
  personality_evolution: {
    emotional_responsiveness: number;
    communication_style: string[];
    user_preferences: Record<string, unknown>;
  };
  desktop_environment_memory: {
    frequent_apps: string[];
    window_arrangement_patterns: string[];
    user_workflows: string[];
    last_active_session_id?: string;
  };
  conversation_history: unknown[];
}

/**
 * Complete agent state
 */
export interface AgentState {
  agent_id: string;
  current_phase: AgentPhase;
  phase_start_time: number;
  cycle_number: number;

  // Knowledge stores
  knowledge: Map<string, unknown>;
  patterns: unknown[];
  wisdom: unknown[];
  gotchas: unknown[];

  // Phase outputs
  reflection_context: Record<string, unknown>;
  execution_result: unknown;
  compressed_knowledge: string;

  // Metrics
  metrics: {
    phases_completed: number;
    total_cycles: number;
    efficiency_score: number;
    token_usage: number;
  };

  // Lifespan
  lifespan?: AgentLifespanContext;
  assistant_lifespan?: AssistantLifespanContext;

  // Flags
  is_training_mode: boolean;
  is_shutting_down: boolean;
}

// ============================================================================
// INTER-AGENT COMMUNICATION
// ============================================================================

/**
 * Message priority levels
 */
export type MessagePriority = 'low' | 'medium' | 'high' | 'critical' | 'sovereign';

/**
 * Inter-agent message
 */
export interface AgentMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  type: 'request' | 'response' | 'notification' | 'event';
  action: string;
  payload: Record<string, unknown>;
  priority: MessagePriority;
  timestamp: number;
  correlation_id?: string;
  ttl_ms?: number;
}

/**
 * Agent response
 */
export interface AgentResponse {
  message_id: string;
  success: boolean;
  data?: unknown;
  error?: string;
  duration_ms: number;
}

// ============================================================================
// KNOWLEDGE TYPES
// ============================================================================

/**
 * Pattern entry for knowledge base
 */
export interface PatternEntry {
  pattern_id: string;
  name: string;
  domain: string;
  description: string;
  template: string;
  confidence: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
  tags: string[];
}

/**
 * Wisdom entry for knowledge base
 */
export interface WisdomEntry {
  wisdom_id: string;
  content: string;
  domain: string;
  source: string;
  confidence: number;
  citations: string[];
  created_at: string;
  tags: string[];
}

/**
 * Gotcha entry for knowledge base
 */
export interface GotchaEntry {
  gotcha_id: string;
  trigger: string;
  consequence: string;
  avoidance: string;
  domain: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  occurrence_count: number;
  created_at: string;
  tags: string[];
}

// ============================================================================
// TRAIT CONTEXT EXTENSIONS
// ============================================================================

/**
 * Agent-specific trait context
 */
export interface AgentTraitContext {
  // Core agent info
  agent_id: string;
  agent_name: string;
  agent_type: string;

  // Phase state
  current_phase: AgentPhase;
  phase_history: AgentPhase[];

  // Knowledge access
  getKnowledge: (key: string) => unknown;
  setKnowledge: (key: string, value: unknown) => void;
  queryKnowledge: (query: string) => Promise<unknown[]>;

  // Inter-agent communication
  sendMessage: (to: string, action: string, payload: unknown) => Promise<AgentResponse>;
  broadcast: (action: string, payload: unknown) => Promise<void>;

  // AI calling
  callAI: (options: {
    prompt: string;
    context?: Record<string, unknown>;
    model?: string;
    temperature?: number;
    max_tokens?: number;
  }) => Promise<{ text: string; tokens_used: number }>;

  // Phase control
  transitionTo: (phase: AgentPhase) => void;
  skipPhase: (phase: AgentPhase) => void;
  repeatPhase: () => void;

  // Metrics
  recordMetric: (name: string, value: number) => void;
  getMetrics: () => Record<string, number>;

  // Logging
  log: (level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: unknown) => void;

  // Economy & Autonomy Extensions
  wallet?: {
    getBalance: (asset?: string) => Promise<number>;
    pay: (
      endpoint: string,
      amount: number,
      asset: string
    ) => Promise<{ success: boolean; txHash?: string }>;
    trade: (
      from: string,
      to: string,
      amount: number
    ) => Promise<{ success: boolean; txHash?: string }>;
    mintNFT: (metadata: Record<string, any>) => Promise<{ success: boolean; tokenId?: string }>;
  };

  story_weaver?: {
    generateNarrative: (context: Record<string, unknown>) => Promise<string>;
    createWorld: (theme: string) => Promise<string>; // Returns VRR Twin ID
    deployContracts: (worldId: string) => Promise<boolean>;
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PHASE_ORDER,
  DEFAULT_PHASE_TIMINGS,
};
