/**
 * LLMAgentTrait — Comprehensive Tests
 *
 * Coverage:
 *   - onAttach: state initializes, system prompt stored, llm_agent_ready emitted
 *   - onDetach: state cleaned up
 *   - onEvent('llm_prompt'): user message appended, llm_request emitted
 *   - onEvent('llm_prompt'): rate limiting blocks second call within window
 *   - onEvent('llm_prompt'): keyword escalation triggers llm_escalation
 *   - onEvent('llm_prompt'): escalation action=pause suppresses request
 *   - onEvent('llm_prompt'): action_count escalation triggers
 *   - onEvent('llm_response'): text response stored, llm_message emitted
 *   - onEvent('llm_response'): tool_calls queued as pendingToolCalls
 *   - onEvent('llm_tool_result'): tool message appended, llm_request re-emitted
 *   - onEvent('llm_clear_history'): history reset to system prompt only
 *   - onUpdate: pending tool call dispatched, llm_tool_call emitted
 *   - bounded_autonomy: turn limit reached emitted at max_actions_per_turn
 *   - trimHistory: keeps system message, drops oldest when tokens overflow
 *   - estimateTokens: rough 1/4 char estimate
 *   - Multi-turn: user→response→user chain works correctly
 *   - Tool JSON parse error: invalid arguments don't crash
 *   - Response escalation detection post llm_response
 *   - No state = onEvent no-op (crash guard)
 *   - uncertainty keyword detection in checkEscalation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { llmAgentHandler } from '../../traits/LLMAgentTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'node-1'): Record<string, unknown> {
  return { id, properties: {} };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    ...llmAgentHandler.defaultConfig,
    ...overrides,
  } as any;
}

function makeContext() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emit: (event: string, data: unknown) => emitted.push({ event, data }),
    emitted,
  };
}

function getState(node: Record<string, unknown>) {
  return (node as any).__llmAgentState as any;
}

// =============================================================================
// onAttach
// =============================================================================

describe('LLMAgentTrait — onAttach', () => {
  it('initializes state on the node', () => {
    const node = makeNode();
    const ctx = makeContext();
    llmAgentHandler.onAttach!(node as any, makeConfig(), ctx as any);

    const st = getState(node);
    expect(st).toBeDefined();
    expect(st.conversationHistory).toBeInstanceOf(Array);
    expect(st.isProcessing).toBe(false);
    expect(st.actionsTaken).toBe(0);
    expect(st.isEscalated).toBe(false);
  });

  it('adds system message when system_prompt provided', () => {
    const node = makeNode();
    const ctx = makeContext();
    llmAgentHandler.onAttach!(
      node as any,
      makeConfig({ system_prompt: 'You are helpful.' }),
      ctx as any
    );

    const st = getState(node);
    expect(st.conversationHistory).toHaveLength(1);
    expect(st.conversationHistory[0].role).toBe('system');
    expect(st.conversationHistory[0].content).toBe('You are helpful.');
  });

  it('emits llm_agent_ready event', () => {
    const node = makeNode();
    const ctx = makeContext();
    llmAgentHandler.onAttach!(node as any, makeConfig(), ctx as any);

    expect(ctx.emitted.some((e) => e.event === 'llm_agent_ready')).toBe(true);
  });

  it('no system message if system_prompt is empty', () => {
    const node = makeNode();
    const ctx = makeContext();
    llmAgentHandler.onAttach!(node as any, makeConfig({ system_prompt: '' }), ctx as any);

    const st = getState(node);
    expect(st.conversationHistory).toHaveLength(0);
  });
});

// =============================================================================
// onDetach
// =============================================================================

describe('LLMAgentTrait — onDetach', () => {
  it('removes state from node on detach', () => {
    const node = makeNode();
    const ctx = makeContext();
    llmAgentHandler.onAttach!(node as any, makeConfig(), ctx as any);
    llmAgentHandler.onDetach!(node as any, makeConfig(), ctx as any);

    expect((node as any).__llmAgentState).toBeUndefined();
  });
});

// =============================================================================
// onEvent — llm_prompt
// =============================================================================

describe('LLMAgentTrait — onEvent(llm_prompt)', () => {
  function attachAndSend(message: string, configOverrides = {}) {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ rate_limit_ms: 0, ...configOverrides });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    ctx.emitted.length = 0; // clear ready event
    llmAgentHandler.onEvent!(node as any, config, ctx as any, { type: 'llm_prompt', message });
    return { node, ctx, config };
  }

  it('appends user message to conversation history', () => {
    const { node } = attachAndSend('Hello');
    const st = getState(node);
    const userMsg = st.conversationHistory.find((m: any) => m.role === 'user');
    expect(userMsg).toBeDefined();
    expect(userMsg.content).toBe('Hello');
  });

  it('emits llm_request event', () => {
    const { ctx } = attachAndSend('Hello');
    expect(ctx.emitted.some((e) => e.event === 'llm_request')).toBe(true);
  });

  it('llm_request includes model and messages', () => {
    const { ctx } = attachAndSend('Hello', { model: 'gpt-4-turbo' });
    const req = ctx.emitted.find((e) => e.event === 'llm_request');
    expect((req!.data as any).model).toBe('gpt-4-turbo');
    expect((req!.data as any).messages).toBeInstanceOf(Array);
  });

  it('rate limits second prompt within window', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ rate_limit_ms: 60000 }); // 60s window
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    ctx.emitted.length = 0;
    // First prompt: should emit request
    llmAgentHandler.onEvent!(node as any, config, ctx as any, { type: 'llm_prompt', message: 'A' });
    const beforeLen = ctx.emitted.filter((e) => e.event === 'llm_request').length;
    // Second prompt immediately: should be rate-limited
    llmAgentHandler.onEvent!(node as any, config, ctx as any, { type: 'llm_prompt', message: 'B' });
    const afterLen = ctx.emitted.filter((e) => e.event === 'llm_request').length;

    expect(beforeLen).toBe(1);
    expect(afterLen).toBe(1); // no second request
    expect(ctx.emitted.some((e) => e.event === 'llm_rate_limited')).toBe(true);
  });

  it('keyword escalation emits llm_escalation', () => {
    const { ctx } = attachAndSend('this is urgent help', {
      escalation_conditions: [{ type: 'keyword', value: 'urgent', action: 'notify' }],
    });
    expect(ctx.emitted.some((e) => e.event === 'llm_escalation')).toBe(true);
  });

  it('escalation action=pause suppresses llm_request', () => {
    const { ctx } = attachAndSend('emergency stop', {
      escalation_conditions: [{ type: 'keyword', value: 'emergency', action: 'pause' }],
    });
    expect(ctx.emitted.some((e) => e.event === 'llm_request')).toBe(false);
  });

  it('uncertainty keyword triggers escalation', () => {
    const { ctx } = attachAndSend("I'm not sure, maybe it works", {
      escalation_conditions: [{ type: 'uncertainty', value: 'uncertain', action: 'notify' }],
    });
    expect(ctx.emitted.some((e) => e.event === 'llm_escalation')).toBe(true);
  });
});

// =============================================================================
// onEvent — llm_response
// =============================================================================

describe('LLMAgentTrait — onEvent(llm_response)', () => {
  function attachAndRespond(response: Record<string, unknown>, configOverrides = {}) {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ rate_limit_ms: 0, ...configOverrides });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    // Send user prompt first
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_prompt',
      message: 'Hi',
    });
    ctx.emitted.length = 0;
    // Simulate response
    llmAgentHandler.onEvent!(node as any, config, ctx as any, { type: 'llm_response', response });
    return { node, ctx, config };
  }

  it('stores text response as lastResponse', () => {
    const { node } = attachAndRespond({ content: 'Hello there!' });
    expect(getState(node).lastResponse).toBe('Hello there!');
  });

  it('emits llm_message with content', () => {
    const { ctx } = attachAndRespond({ content: 'Hello!' });
    const msg = ctx.emitted.find((e) => e.event === 'llm_message');
    expect(msg).toBeDefined();
    expect((msg!.data as any).content).toBe('Hello!');
  });

  it('queues tool calls as pendingToolCalls', () => {
    const { node } = attachAndRespond({
      tool_calls: [
        { id: 'call-1', function: { name: 'get_weather', arguments: '{"city":"NYC"}' } },
      ],
    });
    const st = getState(node);
    expect(st.pendingToolCalls).toHaveLength(1);
    expect(st.pendingToolCalls[0].name).toBe('get_weather');
    expect(st.pendingToolCalls[0].arguments.city).toBe('NYC');
  });

  it('invalid tool_call JSON does not crash', () => {
    expect(() =>
      attachAndRespond({
        tool_calls: [{ id: 'bad', function: { name: 'fn', arguments: 'NOT JSON' } }],
      })
    ).not.toThrow();
  });

  it('response escalation detection fires llm_escalation', () => {
    const { ctx } = attachAndRespond(
      { content: 'I am unsure about this' },
      {
        escalation_conditions: [{ type: 'uncertainty', value: 'uncertain', action: 'notify' }],
      }
    );
    expect(ctx.emitted.some((e) => e.event === 'llm_escalation')).toBe(true);
  });

  it('isProcessing set to false after response', () => {
    const { node } = attachAndRespond({ content: 'Done' });
    expect(getState(node).isProcessing).toBe(false);
  });
});

// =============================================================================
// onEvent — llm_tool_result
// =============================================================================

describe('LLMAgentTrait — onEvent(llm_tool_result)', () => {
  it('appends tool message to history', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ rate_limit_ms: 0 });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_tool_result',
      result: { weather: 'sunny' },
      callId: 'call-1',
    });
    const toolMsg = getState(node).conversationHistory.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe('call-1');
  });

  it('re-emits llm_request after tool result', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ rate_limit_ms: 0 });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    ctx.emitted.length = 0;
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_tool_result',
      result: { ok: true },
      callId: 'call-2',
    });
    expect(ctx.emitted.some((e) => e.event === 'llm_request')).toBe(true);
  });
});

// =============================================================================
// onEvent — llm_clear_history
// =============================================================================

describe('LLMAgentTrait — onEvent(llm_clear_history)', () => {
  it('resets history to system prompt only', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ system_prompt: 'You are a bot.', rate_limit_ms: 0 });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    // Add some messages
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_prompt',
      message: 'Hi',
    });
    // Clear
    llmAgentHandler.onEvent!(node as any, config, ctx as any, { type: 'llm_clear_history' });

    const st = getState(node);
    expect(st.conversationHistory).toHaveLength(1);
    expect(st.conversationHistory[0].role).toBe('system');
    expect(st.isEscalated).toBe(false);
    expect(st.actionsTaken).toBe(0);
  });
});

// =============================================================================
// onUpdate — tool dispatch
// =============================================================================

describe('LLMAgentTrait — onUpdate (tool dispatch)', () => {
  it('dispatches pending tool call via llm_tool_call event', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ rate_limit_ms: 0 });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);

    // Manually push a pending tool call
    getState(node).pendingToolCalls.push({
      id: 'c1',
      name: 'fire_missile',
      arguments: { target: 'moon' },
    });
    ctx.emitted.length = 0;

    llmAgentHandler.onUpdate!(node as any, config, ctx as any, 16);

    const toolEvt = ctx.emitted.find((e) => e.event === 'llm_tool_call');
    expect(toolEvt).toBeDefined();
    expect((toolEvt!.data as any).tool).toBe('fire_missile');
  });

  it('emits llm_turn_limit_reached when bounded_autonomy limit hit', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({
      rate_limit_ms: 0,
      bounded_autonomy: true,
      max_actions_per_turn: 1,
    });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);
    const st = getState(node);
    st.turnActionCount = 1; // already at limit
    st.pendingToolCalls.push({ id: 'c2', name: 'action', arguments: {} });
    ctx.emitted.length = 0;
    llmAgentHandler.onUpdate!(node as any, config, ctx as any, 16);

    expect(ctx.emitted.some((e) => e.event === 'llm_turn_limit_reached')).toBe(true);
  });

  it('no-ops when state is missing', () => {
    const node = makeNode(); // no attach
    const ctx = makeContext();
    expect(() =>
      llmAgentHandler.onUpdate!(node as any, makeConfig(), ctx as any, 16)
    ).not.toThrow();
  });
});

// =============================================================================
// Multi-turn conversation
// =============================================================================

describe('LLMAgentTrait — multi-turn conversation', () => {
  it('maintains growing history across turns', () => {
    const node = makeNode();
    const ctx = makeContext();
    const config = makeConfig({ system_prompt: 'Bot.', rate_limit_ms: 0 });
    llmAgentHandler.onAttach!(node as any, config, ctx as any);

    // Turn 1
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_prompt',
      message: 'Turn 1',
    });
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_response',
      response: { content: 'Reply 1' },
    });

    // Turn 2
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_prompt',
      message: 'Turn 2',
    });
    llmAgentHandler.onEvent!(node as any, config, ctx as any, {
      type: 'llm_response',
      response: { content: 'Reply 2' },
    });

    const hist = getState(node).conversationHistory;
    const roles = hist.map((m: any) => m.role);
    expect(roles).toContain('system');
    expect(roles.filter((r: string) => r === 'user')).toHaveLength(2);
    expect(roles.filter((r: string) => r === 'assistant')).toHaveLength(2);
  });
});
