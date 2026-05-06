import type { LLMProviderName, TokenUsage } from '@holoscript/llm-provider';

export interface AgentIdentity {
  handle: string;
  surface: string;
  wallet: string;
  x402Bearer: string;
  llmProvider: LLMProviderName;
  llmModel: string;
  brainPath: string;
  budgetUsdPerDay: number;
  teamId: string;
  meshApiBase: string;
}

export interface RuntimeBrainConfig {
  brainPath: string;
  systemPrompt: string;
  capabilityTags: string[];
  domain: string;
  scopeTier: 'cold' | 'warm' | 'hot';
  /**
   * Capability keys (from `Capabilities` in @holoscript/llm-provider) that
   * this brain MUST have. Router refuses to assign the brain to a provider
   * whose manifest doesn't satisfy every entry. Empty array (default) =
   * open routing — matches today's behavior, backward-compatible.
   *
   * Per founder ruling 2026-05-06 (universal+segregated foundation): brains
   * declare needs as data; router does set arithmetic at session start.
   * `HOLOSCRIPT_AGENT_PROVIDER` env becomes override, not source-of-truth.
   */
  requires: string[];
  /**
   * Capability keys this brain prefers but doesn't require. Router uses
   * to break ties between candidates that all satisfy `requires`.
   * Empty array (default) = no preference.
   */
  prefers: string[];
  /**
   * Capability keys this brain explicitly avoids. Router excludes any
   * provider whose manifest declares any of these capabilities (e.g.
   * a privacy-sensitive brain may avoid `liveWebSearch`).
   * Empty array (default) = no exclusions.
   */
  avoids: string[];
}

export interface CostState {
  date: string;
  spentUsd: number;
  promptTokens: number;
  completionTokens: number;
  callCount: number;
}

export interface ModelPricer {
  (model: string, usage: TokenUsage): number;
}

export interface BoardTask {
  id: string;
  title: string;
  description: string;
  priority: string | number;
  tags: string[];
  status: 'open' | 'claimed' | 'done';
  source?: string;
  claimedBy?: string;
}

export interface TickResult {
  action:
    | 'heartbeat-only'
    | 'over-budget'
    | 'no-claimable-task'
    | 'claimed'
    | 'executed'
    | 'errored'
    | 'no-artifact';
  taskId?: string;
  spentUsd: number;
  remainingUsd: number;
  message?: string;
}

export interface ExecutionResult {
  taskId: string;
  responseText: string;
  usage: TokenUsage;
  costUsd: number;
  durationMs: number;
}
