/**
 * NPCAITrait — Production Test Suite
 *
 * Dependencies mocked:
 * - getDefaultAIAdapter from '../../ai/AIAdapter' — provides chat() mock
 *
 * Key behaviours:
 * 1. defaultConfig — 6 fields
 * 2. onAttach — creates __npcAIState; emits npc_ai_initialized; initial state values
 * 3. onDetach — removes state; no throw
 * 4. onUpdate — no-op; does not throw
 * 5. onEvent 'npc_ai_prompt' (adapter available):
 *    - sets isThinking=true, appends to conversationHistory
 *    - emits npc_ai_think_begin
 *    - calls adapter.chat; on resolve → emits npc_ai_response
 *    - on reject → clears isThinking + emits npc_ai_error
 * 6. onEvent 'npc_ai_prompt' (no adapter):
 *    - falls back to stub: emits npc_ai_response via setTimeout
 * 7. onEvent 'npc_ai_response':
 *    - isThinking=false; lastResponse set; history append role:assistant
 *    - emits npc_ai_think_end
 *    - action tag parsing: <action type="wave" /> → emits npc_behavior_wave + npc_action
 *    - multiple actions parsed correctly
 *    - always emits npc_ai_speak
 * 8. onEvent 'npc_ai_set_goal' — updates goals array
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock AIAdapter ───────────────────────────────────────────────────────────
let _mockAdapter: any = null;
vi.mock('../../ai/AIAdapter', () => ({
  getDefaultAIAdapter: () => _mockAdapter,
}));

import { npcAIHandler } from '../NPCAITrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode() { return { id: `npc_${++_nodeId}` }; }
function makeCtx() { return { emit: vi.fn() }; }
function makeConfig(o: any = {}) { return { ...npcAIHandler.defaultConfig!, ...o }; }

function attach(o: any = {}) {
  const node = makeNode(); const ctx = makeCtx(); const config = makeConfig(o);
  npcAIHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) { return (node as any).__npcAIState; }

beforeEach(() => {
  vi.clearAllMocks();
  _mockAdapter = null;
});

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('npcAIHandler.defaultConfig', () => {
  const d = npcAIHandler.defaultConfig!;
  it('model = hermes-3-70b', () => expect(d.model).toBe('hermes-3-70b'));
  it('systemPrompt = helpful holographic assistant', () => expect(d.systemPrompt).toContain('helpful holographic assistant'));
  it('intelligence_tier = advanced', () => expect(d.intelligence_tier).toBe('advanced'));
  it('perception_range = 10.0', () => expect(d.perception_range).toBe(10.0));
  it('learning_rate = 0.1', () => expect(d.learning_rate).toBe(0.1));
  it('personality_profile = professional', () => expect(d.personality_profile).toBe('professional'));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('npcAIHandler.onAttach', () => {
  it('creates __npcAIState', () => {
    const { node } = attach();
    expect(getState(node)).toBeDefined();
  });
  it('isThinking = false', () => { const { node } = attach(); expect(getState(node).isThinking).toBe(false); });
  it('lastResponse = ""', () => { const { node } = attach(); expect(getState(node).lastResponse).toBe(''); });
  it('emotionalState = neutral', () => { const { node } = attach(); expect(getState(node).emotionalState).toBe('neutral'); });
  it('goals = ["wait_for_interaction"]', () => { const { node } = attach(); expect(getState(node).goals).toEqual(['wait_for_interaction']); });
  it('conversationHistory starts empty', () => { const { node } = attach(); expect(getState(node).conversationHistory).toEqual([]); });
  it('emits npc_ai_initialized', () => {
    const { ctx } = attach();
    expect(ctx.emit).toHaveBeenCalledWith('npc_ai_initialized', expect.any(Object));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('npcAIHandler.onDetach', () => {
  it('removes __npcAIState', () => {
    const { node, ctx, config } = attach();
    npcAIHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() => npcAIHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('npcAIHandler.onUpdate', () => {
  it('does not throw and emits nothing', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    expect(() => npcAIHandler.onUpdate!(node as any, config, ctx as any, 0.016)).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when isThinking=true', () => {
    const { node, ctx, config } = attach();
    getState(node).isThinking = true;
    ctx.emit.mockClear();
    expect(() => npcAIHandler.onUpdate!(node as any, config, ctx as any, 0.016)).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent 'npc_ai_prompt' — with adapter ───────────────────────────────────
describe("onEvent 'npc_ai_prompt' (with adapter)", () => {
  it('sets isThinking=true and appends to conversationHistory', () => {
    _mockAdapter = { chat: vi.fn().mockResolvedValue('Hello!') };
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_prompt', prompt: 'Hi NPC' });
    const state = getState(node);
    expect(state.isThinking).toBe(true);
    expect(state.conversationHistory).toContainEqual({ role: 'user', content: 'Hi NPC' });
  });

  it('emits npc_ai_think_begin', () => {
    _mockAdapter = { chat: vi.fn().mockResolvedValue('OK') };
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_prompt', prompt: 'test' });
    expect(ctx.emit).toHaveBeenCalledWith('npc_ai_think_begin', expect.objectContaining({ prompt: 'test' }));
  });

  it('calls adapter.chat and then emits npc_ai_response on resolve', async () => {
    _mockAdapter = { chat: vi.fn().mockResolvedValue('I am well.') };
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_prompt', prompt: 'How are you?' });
    await vi.waitFor(() => expect(ctx.emit).toHaveBeenCalledWith('npc_ai_response', expect.objectContaining({ text: 'I am well.' })));
  });

  it('clears isThinking and emits npc_ai_error on rejection', async () => {
    _mockAdapter = { chat: vi.fn().mockRejectedValue(new Error('adapter_down')) };
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_prompt', prompt: 'Fail test' });
    await vi.waitFor(() => expect(ctx.emit).toHaveBeenCalledWith('npc_ai_error', expect.objectContaining({ error: 'adapter_down' })));
    expect(getState(node).isThinking).toBe(false);
  });
});

// ─── onEvent 'npc_ai_prompt' — stub fallback (no adapter) ────────────────────
describe("onEvent 'npc_ai_prompt' (no adapter — stub fallback)", () => {
  it('emits stub npc_ai_response via setTimeout', async () => {
    _mockAdapter = null;
    vi.useFakeTimers();
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_prompt', prompt: 'Hello' });
    await vi.runAllTimersAsync();
    expect(ctx.emit).toHaveBeenCalledWith('npc_ai_response',
      expect.objectContaining({ text: expect.stringContaining('[STUB]') })
    );
    vi.useRealTimers();
  });
});

// ─── onEvent 'npc_ai_response' ────────────────────────────────────────────────
describe("onEvent 'npc_ai_response'", () => {
  function fireResponse(node: any, config: any, ctx: any, text: string) {
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_response', text });
  }

  it('sets isThinking=false and lastResponse', () => {
    const { node, ctx, config } = attach();
    getState(node).isThinking = true;
    fireResponse(node, config, ctx, 'Response text');
    const state = getState(node);
    expect(state.isThinking).toBe(false);
    expect(state.lastResponse).toBe('Response text');
  });

  it('appends assistant message to conversationHistory', () => {
    const { node, ctx, config } = attach();
    fireResponse(node, config, ctx, 'My answer');
    expect(getState(node).conversationHistory).toContainEqual({ role: 'assistant', content: 'My answer' });
  });

  it('emits npc_ai_think_end', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fireResponse(node, config, ctx, 'Think end test');
    expect(ctx.emit).toHaveBeenCalledWith('npc_ai_think_end', expect.objectContaining({ response: 'Think end test' }));
  });

  it('always emits npc_ai_speak', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fireResponse(node, config, ctx, 'Hello world');
    expect(ctx.emit).toHaveBeenCalledWith('npc_ai_speak', expect.objectContaining({ text: 'Hello world' }));
  });

  it('parses <action type="wave" /> and emits npc_behavior_wave + npc_action', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fireResponse(node, config, ctx, 'I wave hello! <action type="wave" />');
    expect(ctx.emit).toHaveBeenCalledWith('npc_behavior_wave', expect.objectContaining({ params: {}, source: 'ai_synthesis' }));
    expect(ctx.emit).toHaveBeenCalledWith('npc_action', expect.objectContaining({ type: 'wave' }));
  });

  it('parses action with params: <action type="move" speed="fast" direction="north" />', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fireResponse(node, config, ctx, '<action type="move" speed="fast" direction="north" />');
    const behaviorCall = ctx.emit.mock.calls.find(([ev]) => ev === 'npc_behavior_move');
    expect(behaviorCall).toBeDefined();
    expect(behaviorCall![1].params).toEqual({ speed: 'fast', direction: 'north' });
  });

  it('parses multiple actions in a single response', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fireResponse(node, config, ctx, '<action type="wave" /> then <action type="nod" />');
    const actionCalls = ctx.emit.mock.calls.filter(([ev]) => ev === 'npc_action');
    expect(actionCalls.length).toBe(2);
    expect(actionCalls[0][1].type).toBe('wave');
    expect(actionCalls[1][1].type).toBe('nod');
  });

  it('no action emit when no action tags in response', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    fireResponse(node, config, ctx, 'Just a normal response with no tags.');
    const actionCalls = ctx.emit.mock.calls.filter(([ev]) => ev === 'npc_action');
    expect(actionCalls.length).toBe(0);
  });
});

// ─── onEvent 'npc_ai_set_goal' ────────────────────────────────────────────────
describe("onEvent 'npc_ai_set_goal'", () => {
  it('replaces goals array', () => {
    const { node, ctx, config } = attach();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_set_goal', goals: ['patrol', 'defend'] });
    expect(getState(node).goals).toEqual(['patrol', 'defend']);
  });

  it('keeps existing goals when undefined passed', () => {
    const { node, ctx, config } = attach();
    npcAIHandler.onEvent!(node as any, config, ctx as any, { type: 'npc_ai_set_goal', goals: undefined });
    expect(getState(node).goals).toEqual(['wait_for_interaction']);
  });
});
