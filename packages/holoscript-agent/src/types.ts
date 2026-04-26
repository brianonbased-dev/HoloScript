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
