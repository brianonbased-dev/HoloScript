/**
 * V6 Semantic 2D Traits — Unit Tests
 *
 * Tests trait handler registration, default configs, and onAttach behavior
 * for all 8 semantic-2d trait handlers.
 */

import { describe, it, expect } from 'vitest';
import {
  V6_SEMANTIC_2D_TRAIT_HANDLERS,
  v6Canvas2DHandler,
  v6SemanticEntityHandler,
  v6SemanticLayoutHandler,
  v6DynamicVisualHandler,
  v6ParticleFeedbackHandler,
  v6AgentAttentionHandler,
  v6IntentDrivenHandler,
  v6LiveMetricHandler,
} from './V6Semantic2DTraits';

describe('V6_SEMANTIC_2D_TRAIT_HANDLERS', () => {
  it('should export exactly 8 trait handlers', () => {
    expect(V6_SEMANTIC_2D_TRAIT_HANDLERS).toHaveLength(8);
  });

  it('should have unique names across all handlers', () => {
    const names = V6_SEMANTIC_2D_TRAIT_HANDLERS.map((h) => h.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should include all expected trait names', () => {
    const names = V6_SEMANTIC_2D_TRAIT_HANDLERS.map((h) => h.name);
    expect(names).toContain('2d_canvas');
    expect(names).toContain('semantic_entity');
    expect(names).toContain('semantic_layout');
    expect(names).toContain('dynamic_visual');
    expect(names).toContain('particle_feedback');
    expect(names).toContain('agent_attention');
    expect(names).toContain('intent_driven');
    expect(names).toContain('live_metric');
  });
});

describe('v6Canvas2DHandler', () => {
  it('should have name "2d_canvas"', () => {
    expect(v6Canvas2DHandler.name).toBe('2d_canvas');
  });

  it('should have correct default config', () => {
    expect(v6Canvas2DHandler.defaultConfig).toEqual({
      projection: 'flat-semantic',
      responsive: true,
      economy_enabled: true,
    });
  });

  it('should set __isV6Canvas and __v6Canvas on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { projection: 'hybrid' as const, title: 'Test Canvas' };
    v6Canvas2DHandler.onAttach!(node, config, {} as never);
    expect(node.__isV6Canvas).toBe(true);
    expect(node.__v6Canvas).toEqual(config);
  });
});

describe('v6SemanticEntityHandler', () => {
  it('should have name "semantic_entity"', () => {
    expect(v6SemanticEntityHandler.name).toBe('semantic_entity');
  });

  it('should default priority to 1.0', () => {
    expect(v6SemanticEntityHandler.defaultConfig).toEqual({ priority: 1.0 });
  });

  it('should set __isV6Entity and __v6Entity on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { type: 'metric-card', meaning: 'revenue', priority: 2.0 };
    v6SemanticEntityHandler.onAttach!(node, config, {} as never);
    expect(node.__isV6Entity).toBe(true);
    expect(node.__v6Entity).toEqual(config);
  });
});

describe('v6SemanticLayoutHandler', () => {
  it('should have name "semantic_layout"', () => {
    expect(v6SemanticLayoutHandler.name).toBe('semantic_layout');
  });

  it('should have correct default config with wrap, spacing, and adaptive_scale', () => {
    expect(v6SemanticLayoutHandler.defaultConfig).toEqual({
      wrap: true,
      spacing: 12,
      adaptive_scale: true,
    });
  });

  it('should set __v6SemanticLayout on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { flow: 'radial' as const, spacing: 24 };
    v6SemanticLayoutHandler.onAttach!(node, config, {} as never);
    expect(node.__v6SemanticLayout).toEqual(config);
  });
});

describe('v6DynamicVisualHandler', () => {
  it('should have name "dynamic_visual" with empty default config', () => {
    expect(v6DynamicVisualHandler.name).toBe('dynamic_visual');
    expect(v6DynamicVisualHandler.defaultConfig).toEqual({});
  });

  it('should set __v6DynamicVisual on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { scale: 2.0, opacity: 0.8 };
    v6DynamicVisualHandler.onAttach!(node, config, {} as never);
    expect(node.__v6DynamicVisual).toEqual(config);
  });
});

describe('v6ParticleFeedbackHandler', () => {
  it('should default intensity to 1.0', () => {
    expect(v6ParticleFeedbackHandler.defaultConfig).toEqual({ intensity: 1.0 });
  });

  it('should set __v6ParticleFeedback on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { on: 'hover' as const, type: 'burst' as const, intensity: 0.5 };
    v6ParticleFeedbackHandler.onAttach!(node, config, {} as never);
    expect(node.__v6ParticleFeedback).toEqual(config);
  });
});

describe('v6AgentAttentionHandler', () => {
  it('should default swarm_size to 3 and bounty_threshold to 50', () => {
    expect(v6AgentAttentionHandler.defaultConfig).toEqual({
      swarm_size: 3,
      bounty_threshold: 50,
    });
  });

  it('should set __v6AgentAttention on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { swarm_size: 10, bounty_threshold: 100 };
    v6AgentAttentionHandler.onAttach!(node, config, {} as never);
    expect(node.__v6AgentAttention).toEqual(config);
  });
});

describe('v6IntentDrivenHandler', () => {
  it('should default intents to empty array', () => {
    expect(v6IntentDrivenHandler.defaultConfig).toEqual({ intents: [] });
  });

  it('should set __v6IntentDriven on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { intents: ['navigate', 'purchase'] };
    v6IntentDrivenHandler.onAttach!(node, config, {} as never);
    expect(node.__v6IntentDriven).toEqual(config);
  });
});

describe('v6LiveMetricHandler', () => {
  it('should default adaptive_color to true', () => {
    expect(v6LiveMetricHandler.defaultConfig).toEqual({ adaptive_color: true });
  });

  it('should set __v6LiveMetric on attach', () => {
    const node: Record<string, unknown> = {};
    const config = { format: 'currency', threshold_alert: 1000 };
    v6LiveMetricHandler.onAttach!(node, config, {} as never);
    expect(node.__v6LiveMetric).toEqual(config);
  });
});
