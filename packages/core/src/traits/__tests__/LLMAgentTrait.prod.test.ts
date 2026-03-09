/**
 * LLMAgentTrait Production Tests
 *
 * Comprehensive coverage for tool calling, bounded autonomy, message history,
 * token estimation, escalation/safety guardrails, rate limiting, and history trimming.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { llmAgentHandler } from '../LLMAgentTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'node-1') {
  return { id } as any;
}

function makeConfig(overrides: Partial<Parameters<typeof llmAgentHandler.onAttach>[1]> = {}) {
  return { ...llmAgentHandler.defaultConfig, ...overrides };
}

function makeContext() {
  return { emit: vi.fn() };
}

/** Quick attach → returns state shortcut */
function attachAndGetState(node: any, config: any, ctx: any) {
  llmAgentHandler.onAttach(node, config, ctx);
  return (node as any).__llmAgentState;
}

// =============================================================================
// TESTS
// =============================================================================

describe('LLMAgentTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
  });

  afterEach(() => {
    delete (node as any).__llmAgentState;
  });

  // ======== CONSTRUCTION & DEFAULTS ========

  describe('construction & defaults', () => {
    it('initializes empty state on attach', () => {
      const state = attachAndGetState(node, config, ctx);
      expect(state.conversationHistory).toEqual([]);
      expect(state.isProcessing).toBe(false);
      expect(state.actionsTaken).toBe(0);
      expect(state.turnActionCount).toBe(0);
      expect(state.lastResponse).toBeNull();
      expect(state.pendingToolCalls).toEqual([]);
      expect(state.isEscalated).toBe(false);
      expect(state.tokenCount).toBe(0);
    });

    it('adds system prompt to history when configured', () => {
      const cfg = makeConfig({ system_prompt: 'You are a helpful assistant.' });
      const state = attachAndGetState(node, cfg, ctx);
      expect(state.conversationHistory).toHaveLength(1);
      expect(state.conversationHistory[0].role).toBe('system');
      expect(state.conversationHistory[0].content).toBe('You are a helpful assistant.');
    });

    it('does NOT add system message when prompt is empty', () => {
      const state = attachAndGetState(node, config, ctx);
      expect(state.conversationHistory).toHaveLength(0);
    });

    it('emits llm_agent_ready on attach', () => {
      llmAgentHandler.onAttach(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('llm_agent_ready', { node });
    });

    it('handler name is llm_agent', () => {
      expect(llmAgentHandler.name).toBe('llm_agent');
    });

    it('has sensible default config', () => {
      const d = llmAgentHandler.defaultConfig;
      expect(d.model).toBe('gpt-4');
      expect(d.context_window).toBe(4096);
      expect(d.temperature).toBe(0.7);
      expect(d.max_actions_per_turn).toBe(3);
      expect(d.bounded_autonomy).toBe(true);
      expect(d.rate_limit_ms).toBe(1000);
      expect(d.max_history_length).toBe(50);
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('clears state on detach', () => {
      attachAndGetState(node, config, ctx);
      expect((node as any).__llmAgentState).toBeDefined();
      llmAgentHandler.onDetach!(node, config, ctx);
      expect((node as any).__llmAgentState).toBeUndefined();
    });
  });

  // ======== PROMPT & REQUEST ========

  describe('prompt → request flow', () => {
    it('adds user message to history and emits llm_request', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_prompt',
        message: 'Hello agent',
      });

      const state = (node as any).__llmAgentState;
      expect(state.conversationHistory).toHaveLength(1);
      expect(state.conversationHistory[0].role).toBe('user');
      expect(state.conversationHistory[0].content).toBe('Hello agent');

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_request',
        expect.objectContaining({
          node,
          model: 'gpt-4',
          temperature: 0.7,
        })
      );
    });

    it('sets isProcessing and resets turnActionCount', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_prompt',
        message: 'Go',
      });

      const state = (node as any).__llmAgentState;
      expect(state.isProcessing).toBe(true);
      expect(state.turnActionCount).toBe(0);
    });

    it('includes tools in request when configured', () => {
      const tools = [{ name: 'search', description: 'Search the web', parameters: {} }];
      const cfg = makeConfig({ tools });
      attachAndGetState(node, cfg, ctx);

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_prompt',
        message: 'Find info',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_request',
        expect.objectContaining({
          tools,
        })
      );
    });

    it('omits tools from request when tools array is empty', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_prompt',
        message: 'Hi',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_request',
        expect.objectContaining({
          tools: undefined,
        })
      );
    });
  });

  // ======== RESPONSE HANDLING ========

  describe('response handling', () => {
    it('stores text response in history and emits llm_message', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_prompt',
        message: 'Hello',
      });

      ctx.emit.mockClear();

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_response',
        response: { content: 'Hello! How can I help?' },
      });

      const state = (node as any).__llmAgentState;
      expect(state.lastResponse).toBe('Hello! How can I help?');
      expect(ctx.emit).toHaveBeenCalledWith('llm_message', {
        node,
        content: 'Hello! How can I help?',
      });
    });

    it('clears isProcessing after response', () => {
      const state = attachAndGetState(node, config, ctx);
      state.isProcessing = true;

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_response',
        response: { content: 'Done' },
      });

      expect(state.isProcessing).toBe(false);
    });
  });

  // ======== TOOL CALLING ========

  describe('tool calling', () => {
    it('queues tool calls from response', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_response',
        response: {
          content: '',
          tool_calls: [
            {
              id: 'tc1',
              function: {
                name: 'search',
                arguments: '{"query":"HoloScript"}',
              },
            },
          ],
        },
      });

      const state = (node as any).__llmAgentState;
      expect(state.pendingToolCalls).toHaveLength(1);
      expect(state.pendingToolCalls[0]).toEqual({
        id: 'tc1',
        name: 'search',
        arguments: { query: 'HoloScript' },
      });
    });

    it('processes pending tool call on update', () => {
      const state = attachAndGetState(node, config, ctx);
      state.pendingToolCalls.push({ id: 'tc1', name: 'search', arguments: { q: 'test' } });

      ctx.emit.mockClear();
      llmAgentHandler.onUpdate!(node, config, ctx, 16);

      expect(ctx.emit).toHaveBeenCalledWith('llm_tool_call', {
        node,
        tool: 'search',
        arguments: { q: 'test' },
        callId: 'tc1',
      });

      expect(state.actionsTaken).toBe(1);
      expect(state.turnActionCount).toBe(1);
      expect(state.pendingToolCalls).toHaveLength(0);
    });

    it('handles tool result and re-sends llm_request', () => {
      attachAndGetState(node, config, ctx);

      ctx.emit.mockClear();
      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_tool_result',
        callId: 'tc1',
        result: { data: 'found it' },
      });

      const state = (node as any).__llmAgentState;
      expect(state.conversationHistory.at(-1).role).toBe('tool');
      expect(state.conversationHistory.at(-1).tool_call_id).toBe('tc1');

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_request',
        expect.objectContaining({ node, model: 'gpt-4' })
      );
    });

    it('ignores invalid JSON in tool_call arguments', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_response',
        response: {
          tool_calls: [{ id: 'tc_bad', function: { name: 'parse', arguments: '{{invalid' } }],
        },
      });

      const state = (node as any).__llmAgentState;
      expect(state.pendingToolCalls).toHaveLength(0); // skipped due to JSON error
    });
  });

  // ======== BOUNDED AUTONOMY ========

  describe('bounded autonomy', () => {
    it('emits llm_turn_limit_reached after max actions', () => {
      const cfg = makeConfig({ max_actions_per_turn: 2, bounded_autonomy: true });
      const state = attachAndGetState(node, cfg, ctx);

      // Queue 2 tool calls
      state.pendingToolCalls.push(
        { id: 'a', name: 'toolA', arguments: {} },
        { id: 'b', name: 'toolB', arguments: {} }
      );

      ctx.emit.mockClear();
      llmAgentHandler.onUpdate!(node, cfg, ctx, 16); // processes 1st
      llmAgentHandler.onUpdate!(node, cfg, ctx, 16); // processes 2nd → limit hit

      expect(ctx.emit).toHaveBeenCalledWith('llm_turn_limit_reached', {
        node,
        actionsThisTurn: 2,
      });
    });

    it('does NOT emit turn limit when bounded_autonomy is false', () => {
      const cfg = makeConfig({ max_actions_per_turn: 1, bounded_autonomy: false });
      const state = attachAndGetState(node, cfg, ctx);
      state.pendingToolCalls.push({ id: 'a', name: 'x', arguments: {} });

      ctx.emit.mockClear();
      llmAgentHandler.onUpdate!(node, cfg, ctx, 16);

      expect(ctx.emit).not.toHaveBeenCalledWith('llm_turn_limit_reached', expect.anything());
    });
  });

  // ======== RATE LIMITING ========

  describe('rate limiting', () => {
    it('emits llm_rate_limited when requests are too fast', () => {
      attachAndGetState(node, config, ctx);

      // First prompt goes through
      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_prompt',
        message: 'First',
      });

      ctx.emit.mockClear();

      // Immediate second prompt should be rate limited
      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_prompt',
        message: 'Second',
      });

      expect(ctx.emit).toHaveBeenCalledWith('llm_rate_limited', { node });
      // Should NOT emit llm_request for the second one
      expect(ctx.emit).not.toHaveBeenCalledWith('llm_request', expect.anything());
    });
  });

  // ======== ESCALATION & SAFETY ========

  describe('escalation & safety guardrails', () => {
    it('escalates on keyword match in user prompt', () => {
      const cfg = makeConfig({
        escalation_conditions: [{ type: 'keyword', value: 'emergency', action: 'escalate' }],
      });
      attachAndGetState(node, cfg, ctx);
      ctx.emit.mockClear();

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_prompt',
        message: 'This is an EMERGENCY situation',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_escalation',
        expect.objectContaining({
          node,
          condition: expect.objectContaining({ type: 'keyword', value: 'emergency' }),
          message: 'This is an EMERGENCY situation',
        })
      );
    });

    it('pauses processing when escalation action is pause', () => {
      const cfg = makeConfig({
        escalation_conditions: [{ type: 'keyword', value: 'stop', action: 'pause' }],
      });
      attachAndGetState(node, cfg, ctx);
      ctx.emit.mockClear();

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_prompt',
        message: 'Please stop immediately',
      });

      expect(ctx.emit).toHaveBeenCalledWith('llm_escalation', expect.anything());
      // Should NOT emit llm_request (processing paused)
      expect(ctx.emit).not.toHaveBeenCalledWith('llm_request', expect.anything());
    });

    it('escalates on uncertainty markers', () => {
      const cfg = makeConfig({
        escalation_conditions: [{ type: 'uncertainty', value: '0.5', action: 'notify' }],
      });
      attachAndGetState(node, cfg, ctx);
      ctx.emit.mockClear();

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_prompt',
        message: "I'm unsure about this approach",
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_escalation',
        expect.objectContaining({
          condition: expect.objectContaining({ type: 'uncertainty' }),
        })
      );
    });

    it('escalates on action_count threshold', () => {
      const cfg = makeConfig({
        escalation_conditions: [{ type: 'action_count', value: 2, action: 'escalate' }],
      });
      const state = attachAndGetState(node, cfg, ctx);
      state.actionsTaken = 3;

      ctx.emit.mockClear();
      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_prompt',
        message: 'Continue working',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_escalation',
        expect.objectContaining({
          condition: expect.objectContaining({ type: 'action_count' }),
        })
      );
    });

    it('escalates on uncertainty keywords in LLM response', () => {
      const cfg = makeConfig({
        escalation_conditions: [{ type: 'uncertainty', value: '', action: 'notify' }],
      });
      attachAndGetState(node, cfg, ctx);
      ctx.emit.mockClear();

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_response',
        response: { content: "I don't know the answer to that" },
      });

      expect(ctx.emit).toHaveBeenCalledWith('llm_escalation', expect.anything());
    });
  });

  // ======== HISTORY MANAGEMENT ========

  describe('message history', () => {
    it('trims history when exceeding max_history_length', () => {
      // context_window of 20 tokens means ~80 chars — force trim by adding long messages
      const cfg = makeConfig({ max_history_length: 3, context_window: 20 });
      attachAndGetState(node, cfg, ctx);
      const state = (node as any).__llmAgentState;

      // Add messages with enough content to exceed 20 token budget
      for (let i = 0; i < 5; i++) {
        state.conversationHistory.push({
          role: 'user',
          content: `This is a longer message number ${i} with enough content to consume tokens`,
          timestamp: Date.now(),
        });
      }

      const originalLength = state.conversationHistory.length; // 5

      // Trigger trim via llm_response (trimming happens after adding response)
      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_response',
        response: { content: 'Here is my detailed response with plenty of content to use' },
      });

      // After trim, history should be shorter because the token budget is exhausted
      expect(state.conversationHistory.length).toBeLessThan(originalLength + 1);
    });

    it('always preserves system message during trim', () => {
      const cfg = makeConfig({
        system_prompt: 'System instructions',
        max_history_length: 2,
        context_window: 10000,
      });
      const state = attachAndGetState(node, cfg, ctx);

      // Fill history beyond limit
      for (let i = 0; i < 3; i++) {
        state.conversationHistory.push({
          role: 'user',
          content: `question ${i}`,
          timestamp: Date.now(),
        });
      }

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_response',
        response: { content: 'answer' },
      });

      // System message should still be first
      const systemMsg = state.conversationHistory.find((m: any) => m.role === 'system');
      expect(systemMsg).toBeDefined();
      expect(systemMsg.content).toBe('System instructions');
    });

    it('clears history on llm_clear_history', () => {
      const cfg = makeConfig({ system_prompt: 'sys prompt' });
      const state = attachAndGetState(node, cfg, ctx);

      state.conversationHistory.push(
        { role: 'user', content: 'hi', timestamp: Date.now() },
        { role: 'assistant', content: 'hello', timestamp: Date.now() }
      );
      state.isEscalated = true;
      state.actionsTaken = 5;

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_clear_history',
      });

      expect(state.conversationHistory).toHaveLength(1);
      expect(state.conversationHistory[0].role).toBe('system');
      expect(state.isEscalated).toBe(false);
      expect(state.actionsTaken).toBe(0);
    });

    it('clears to empty array when no system prompt', () => {
      const cfg = makeConfig({ system_prompt: '' });
      const state = attachAndGetState(node, cfg, ctx);
      state.conversationHistory.push({ role: 'user', content: 'test', timestamp: Date.now() });

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_clear_history',
      });

      expect(state.conversationHistory).toHaveLength(0);
    });
  });

  // ======== MODEL SELECTION ========

  describe('model selection', () => {
    it('passes configured model in request', () => {
      const cfg = makeConfig({ model: 'claude-3-opus' });
      attachAndGetState(node, cfg, ctx);

      llmAgentHandler.onEvent!(node, cfg, ctx, {
        type: 'llm_prompt',
        message: 'Hello',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'llm_request',
        expect.objectContaining({ model: 'claude-3-opus' })
      );
    });
  });

  // ======== UPDATE LIFECYCLE ========

  describe('update lifecycle', () => {
    it('skips when no state', () => {
      const bare = makeNode('bare');
      llmAgentHandler.onUpdate!(bare, config, ctx, 16);
      // No error
    });

    it('skips when no pending tool calls', () => {
      attachAndGetState(node, config, ctx);
      ctx.emit.mockClear();
      llmAgentHandler.onUpdate!(node, config, ctx, 16);
      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('skips processing while isProcessing is true', () => {
      const state = attachAndGetState(node, config, ctx);
      state.isProcessing = true;
      state.pendingToolCalls.push({ id: 'a', name: 'x', arguments: {} });

      ctx.emit.mockClear();
      llmAgentHandler.onUpdate!(node, config, ctx, 16);
      expect(ctx.emit).not.toHaveBeenCalledWith('llm_tool_call', expect.anything());
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('ignores events when state is uninitialized', () => {
      const bare = makeNode('bare');
      llmAgentHandler.onEvent!(bare, config, ctx, {
        type: 'llm_prompt',
        message: 'Hello',
      });
      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('handles response with both content and tool_calls (tool_calls take precedence)', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_response',
        response: {
          content: 'Let me search for that',
          tool_calls: [{ id: 'tc99', function: { name: 'search', arguments: '{"q":"test"}' } }],
        },
      });

      const state = (node as any).__llmAgentState;
      expect(state.pendingToolCalls).toHaveLength(1);
      // When tool_calls are present, lastResponse is NOT updated
      expect(state.lastResponse).toBeNull();
    });

    it('stores assistant message with tool_calls in history', () => {
      attachAndGetState(node, config, ctx);

      llmAgentHandler.onEvent!(node, config, ctx, {
        type: 'llm_response',
        response: {
          content: 'Thinking...',
          tool_calls: [{ id: 'tc1', function: { name: 'analyze', arguments: '{}' } }],
        },
      });

      const state = (node as any).__llmAgentState;
      const lastMsg = state.conversationHistory.at(-1);
      expect(lastMsg.role).toBe('assistant');
      expect(lastMsg.tool_calls).toHaveLength(1);
      expect(lastMsg.tool_calls[0].name).toBe('analyze');
    });
  });
});
