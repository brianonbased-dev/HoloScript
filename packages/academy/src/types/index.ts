import type { R3FNode } from '@holoscript/core';

// Re-export canonical R3FNode from @holoscript/core to avoid type duplication
export type { R3FNode } from '@holoscript/core';

export interface SceneMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  metadata: SceneMetadata;
  thumbnail?: string;
}

export interface PipelineResult {
  r3fTree: R3FNode | null;
  errors: PipelineError[];
}

export interface PipelineError {
  message: string;
  line?: number;
  column?: number;
}

export interface GenerateRequest {
  prompt: string;
  existingCode?: string;
  model?: string;
}

export interface GenerateResponse {
  success: boolean;
  code: string;
  error?: string;
}

export type AIStatus = 'idle' | 'generating' | 'error';
export type OllamaStatus = 'connected' | 'disconnected' | 'checking';

export interface PromptEntry {
  id: string;
  prompt: string;
  code: string;
  timestamp: number;
}

export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  filename: string;
}

// ─── Re-exports from service layer ──────────────────────────────────────────
// Common types used across the studio, defined in the service layer.

export type {
  SubscriptionTier,
  AccountStatus,
  SubscriptionStatus,
  TokenBalance,
  GenerationDomain,
  CloudGenerationRequest,
  CloudGenerationResult,
  MarketplaceItem,
  CharacterData,
  CreatureConfig,
} from '@/lib/services/holoscriptCloud';
