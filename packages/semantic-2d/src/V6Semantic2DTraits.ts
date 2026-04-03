/**
 * @holoscript/core/traits — V6 Semantic 2D Traits (The 2D UI Revolution)
 *
 * Implements the new declarative paradigm where traditional flat interfaces
 * (dashboards, forms, apps) are living, agent-native, physics-aware projections
 * of the universal semantic platform.
 */

import type { TraitHandler } from '@holoscript/core';

// ============================================================================
// CONFIGURATION INTERFACES (Semantic2D Trait Pack)
// ============================================================================

export interface V6Canvas2DConfig {
  title?: string;
  projection?: 'flat-semantic' | 'hybrid' | 'immersive';
  background?: Record<string, unknown> | string;
  responsive?: boolean;
  economy_enabled?: boolean;
}

export interface V6SemanticEntityConfig {
  id?: string;
  type?: string;
  meaning?: string;
  priority?: number;
  layout?: Record<string, unknown>;
  children?: any[];
}

export interface V6SemanticLayoutConfig {
  flow?: 'semantic' | 'priority' | 'radial' | 'cluster';
  alignment?: 'meaning-aware' | 'gravity';
  wrap?: boolean;
  spacing?: number;
  adaptive_scale?: boolean;
}

export interface V6DynamicVisualConfig {
  color?: Record<string, unknown> | string;
  scale?: number | Record<string, unknown>;
  opacity?: number | Record<string, unknown>;
  distortion?: Record<string, unknown>;
}

export interface V6ParticleFeedbackConfig {
  on?: 'hover' | 'intent' | 'bounty' | 'success' | 'error';
  type?: 'burst' | 'ripple' | 'swarm' | 'spark';
  intensity?: number;
}

export interface V6AgentAttentionConfig {
  swarm_size?: number;
  bounty_threshold?: number;
  response_trait?: Record<string, unknown>;
}

export interface V6IntentDrivenConfig {
  intents?: string[];
  handler?: Record<string, unknown>;
}

export interface V6LiveMetricConfig {
  stream?: Record<string, unknown>;
  format?: string;
  adaptive_color?: boolean;
  threshold_alert?: number;
}

// ============================================================================
// HANDLERS
// ============================================================================

export const v6Canvas2DHandler: TraitHandler<V6Canvas2DConfig> = {
  name: '2d_canvas',
  defaultConfig: { projection: 'flat-semantic', responsive: true, economy_enabled: true },
  onAttach(node: any, config: any) {
    node.__isV6Canvas = true;
    node.__v6Canvas = config;
  },
};

export const v6SemanticEntityHandler: TraitHandler<V6SemanticEntityConfig> = {
  name: 'semantic_entity',
  defaultConfig: { priority: 1.0 },
  onAttach(node: any, config: any) {
    node.__isV6Entity = true;
    node.__v6Entity = config;
  },
};

export const v6SemanticLayoutHandler: TraitHandler<V6SemanticLayoutConfig> = {
  name: 'semantic_layout',
  defaultConfig: { wrap: true, spacing: 12, adaptive_scale: true },
  onAttach(node: any, config: any) {
    node.__v6SemanticLayout = config;
  },
};

export const v6DynamicVisualHandler: TraitHandler<V6DynamicVisualConfig> = {
  name: 'dynamic_visual',
  defaultConfig: {},
  onAttach(node: any, config: any) {
    node.__v6DynamicVisual = config;
  },
};

export const v6ParticleFeedbackHandler: TraitHandler<V6ParticleFeedbackConfig> = {
  name: 'particle_feedback',
  defaultConfig: { intensity: 1.0 },
  onAttach(node: any, config: any) {
    node.__v6ParticleFeedback = config;
  },
};

export const v6AgentAttentionHandler: TraitHandler<V6AgentAttentionConfig> = {
  name: 'agent_attention',
  defaultConfig: { swarm_size: 3, bounty_threshold: 50 },
  onAttach(node: any, config: any) {
    node.__v6AgentAttention = config;
  },
};

export const v6IntentDrivenHandler: TraitHandler<V6IntentDrivenConfig> = {
  name: 'intent_driven',
  defaultConfig: { intents: [] },
  onAttach(node: any, config: any) {
    node.__v6IntentDriven = config;
  },
};

export const v6LiveMetricHandler: TraitHandler<V6LiveMetricConfig> = {
  name: 'live_metric',
  defaultConfig: { adaptive_color: true },
  onAttach(node: any, config: any) {
    node.__v6LiveMetric = config;
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export const V6_SEMANTIC_2D_TRAIT_HANDLERS = [
  v6Canvas2DHandler,
  v6SemanticEntityHandler,
  v6SemanticLayoutHandler,
  v6DynamicVisualHandler,
  v6ParticleFeedbackHandler,
  v6AgentAttentionHandler,
  v6IntentDrivenHandler,
  v6LiveMetricHandler,
];
