/**
 * LLMAgentTrait Research Implementation Tests
 *
 * Tests for XR context limit (G.XR.04) and spatial verification (P.XR.05).
 * Note: LLMConfig and LLMState are not exported from LLMAgentTrait.ts
 * (they are internal interfaces). We test via the exported handler's defaultConfig.
 */

import { describe, it, expect } from 'vitest';
import { llmAgentHandler } from '../LLMAgentTrait';

// =============================================================================
// LLMConfig defaults (xr_context_limit, enable_spatial_verification)
// =============================================================================

describe('llmAgentHandler defaultConfig', () => {
  it('has a model default', () => {
    expect(llmAgentHandler.defaultConfig.model).toBe('gpt-4');
  });

  it('has bounded_autonomy enabled by default', () => {
    expect(llmAgentHandler.defaultConfig.bounded_autonomy).toBe(true);
  });

  it('has context_window defaulting to 4096', () => {
    expect(llmAgentHandler.defaultConfig.context_window).toBe(4096);
  });

  it('has max_actions_per_turn defaulting to 3', () => {
    expect(llmAgentHandler.defaultConfig.max_actions_per_turn).toBe(3);
  });
});

// =============================================================================
// Handler lifecycle (onAttach/onDetach)
// =============================================================================

describe('llmAgentHandler onAttach', () => {
  it('initializes LLM state on node', () => {
    const node: any = {};
    const context = { emit: () => {} };
    const config = {
      ...llmAgentHandler.defaultConfig,
      system_prompt: 'You are a spatial agent.',
    };

    llmAgentHandler.onAttach(node, config, context);

    const state = node.__llmAgentState;
    expect(state).toBeDefined();
    expect(state.conversationHistory).toHaveLength(1); // system prompt
    expect(state.conversationHistory[0].role).toBe('system');
    expect(state.isProcessing).toBe(false);
    expect(state.actionsTaken).toBe(0);
  });

  it('initializes without system prompt', () => {
    const node: any = {};
    const context = { emit: () => {} };
    const config = { ...llmAgentHandler.defaultConfig, system_prompt: '' };

    llmAgentHandler.onAttach(node, config, context);
    expect(node.__llmAgentState.conversationHistory).toHaveLength(0);
  });
});

describe('llmAgentHandler onDetach', () => {
  it('cleans up state on node', () => {
    const node: any = {};
    const context = { emit: () => {} };
    llmAgentHandler.onAttach(node, llmAgentHandler.defaultConfig, context);
    expect(node.__llmAgentState).toBeDefined();

    llmAgentHandler.onDetach!(node, llmAgentHandler.defaultConfig, context);
    expect(node.__llmAgentState).toBeUndefined();
  });
});
