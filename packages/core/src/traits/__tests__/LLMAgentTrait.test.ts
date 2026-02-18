import { describe, it, expect, beforeEach } from 'vitest';
import { llmAgentHandler } from '../LLMAgentTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('LLMAgentTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model: 'gpt-4',
    system_prompt: 'You are a helpful assistant.',
    context_window: 4096,
    temperature: 0.7,
    tools: [] as any[],
    max_actions_per_turn: 3,
    bounded_autonomy: true,
    escalation_conditions: [
      { type: 'keyword' as const, value: 'help', action: 'escalate' as const },
    ],
    rate_limit_ms: 100,
    max_history_length: 50,
  };

  beforeEach(() => {
    node = createMockNode('llm');
    ctx = createMockContext();
    attachTrait(llmAgentHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__llmAgentState;
    expect(state).toBeDefined();
    expect(state.isProcessing).toBe(false);
    expect(state.actionsTaken).toBe(0);
    expect(state.isEscalated).toBe(false);
  });

  it('system prompt added to history', () => {
    const state = (node as any).__llmAgentState;
    expect(state.conversationHistory).toHaveLength(1);
    expect(state.conversationHistory[0].role).toBe('system');
    expect(state.conversationHistory[0].content).toBe('You are a helpful assistant.');
  });

  it('emits llm_agent_ready on attach', () => {
    expect(getEventCount(ctx, 'llm_agent_ready')).toBe(1);
  });

  it('llm_prompt adds user message and emits request', () => {
    sendEvent(llmAgentHandler, node, cfg, ctx, {
      type: 'llm_prompt', message: 'Hello',
    });
    const state = (node as any).__llmAgentState;
    expect(state.conversationHistory).toHaveLength(2);
    expect(state.isProcessing).toBe(true);
    expect(getEventCount(ctx, 'llm_request')).toBe(1);
  });

  it('llm_prompt triggers escalation on keyword', () => {
    sendEvent(llmAgentHandler, node, cfg, ctx, {
      type: 'llm_prompt', message: 'I need help with this',
    });
    expect((node as any).__llmAgentState.isEscalated).toBe(true);
    expect(getEventCount(ctx, 'llm_escalation')).toBe(1);
  });

  it('llm_response stores response and emits llm_message', () => {
    sendEvent(llmAgentHandler, node, cfg, ctx, {
      type: 'llm_prompt', message: 'Hi',
    });
    sendEvent(llmAgentHandler, node, cfg, ctx, {
      type: 'llm_response', response: { content: 'Hello there!' },
    });
    const state = (node as any).__llmAgentState;
    expect(state.lastResponse).toBe('Hello there!');
    expect(state.isProcessing).toBe(false);
    expect(getEventCount(ctx, 'llm_message')).toBe(1);
  });

  it('llm_response with tool_calls queues them', () => {
    sendEvent(llmAgentHandler, node, cfg, ctx, {
      type: 'llm_prompt', message: 'Search for this',
    });
    sendEvent(llmAgentHandler, node, cfg, ctx, {
      type: 'llm_response',
      response: {
        content: '',
        tool_calls: [{ id: 'tc1', function: { name: 'search', arguments: '{"q":"test"}' } }],
      },
    });
    expect((node as any).__llmAgentState.pendingToolCalls).toHaveLength(1);
  });

  it('llm_clear_history resets conversation', () => {
    sendEvent(llmAgentHandler, node, cfg, ctx, { type: 'llm_prompt', message: 'Hi' });
    sendEvent(llmAgentHandler, node, cfg, ctx, { type: 'llm_clear_history' });
    const state = (node as any).__llmAgentState;
    expect(state.conversationHistory).toHaveLength(1); // system prompt only
    expect(state.isEscalated).toBe(false);
  });

  it('detach cleans up', () => {
    llmAgentHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__llmAgentState).toBeUndefined();
  });
});
