import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait, sendEvent } from './traitTestHelpers';

// Mock AIAdapter
const mockChat = vi.fn().mockResolvedValue('Hello, how can I help?');
vi.mock('@holoscript/framework/ai', () => ({
  getDefaultAIAdapter: vi.fn(() => ({
    chat: mockChat,
  })),
}));

import { npcAIHandler } from '../NPCAITrait';

describe('NPCAITrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model: 'hermes-3-70b',
    systemPrompt: 'You are an NPC.',
    intelligence_tier: 'advanced' as const,
    perception_range: 10.0,
    learning_rate: 0.1,
    personality_profile: 'professional',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('npc');
    ctx = createMockContext();
    attachTrait(npcAIHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__npcAIState;
    expect(s).toBeDefined();
    expect(s.isThinking).toBe(false);
    expect(s.lastResponse).toBe('');
    expect(s.emotionalState).toBe('neutral');
    expect(s.conversationHistory).toEqual([]);
    expect(s.goals).toContain('wait_for_interaction');
  });

  it('emits npc_ai_initialized on attach', () => {
    expect(ctx.emittedEvents.some((e) => e.event === 'npc_ai_initialized')).toBe(true);
  });

  it('cleans up on detach', () => {
    npcAIHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__npcAIState).toBeUndefined();
  });

  it('handles prompt event and sets isThinking', () => {
    sendEvent(npcAIHandler, node, cfg, ctx, {
      type: 'npc_ai_prompt',
      prompt: 'What is your name?',
    });
    const s = (node as any).__npcAIState;
    expect(s.isThinking).toBe(true);
    expect(s.conversationHistory.length).toBe(1);
    expect(s.conversationHistory[0].role).toBe('user');
  });

  it('invokes AI adapter on prompt', () => {
    sendEvent(npcAIHandler, node, cfg, ctx, {
      type: 'npc_ai_prompt',
      prompt: 'Hello',
    });
    expect(mockChat).toHaveBeenCalledWith('Hello', undefined, []);
  });

  it('handles npc_ai_response event and updates state', () => {
    sendEvent(npcAIHandler, node, cfg, ctx, {
      type: 'npc_ai_response',
      text: 'I am here to help.',
    });
    const s = (node as any).__npcAIState;
    expect(s.isThinking).toBe(false);
    expect(s.lastResponse).toBe('I am here to help.');
    expect(s.conversationHistory.length).toBe(1);
    expect(s.conversationHistory[0].role).toBe('assistant');
  });

  it('handles set_goal event', () => {
    sendEvent(npcAIHandler, node, cfg, ctx, {
      type: 'npc_ai_set_goal',
      goals: ['patrol', 'interact'],
    });
    expect((node as any).__npcAIState.goals).toEqual(['patrol', 'interact']);
  });

  it('parses action tags from AI response', () => {
    sendEvent(npcAIHandler, node, cfg, ctx, {
      type: 'npc_ai_response',
      text: 'Sure! <action type="wave" speed="fast" />',
    });
    const actionEvents = ctx.emittedEvents.filter((e) => e.event === 'npc_action');
    expect(actionEvents.length).toBe(1);
    expect((actionEvents[0].data as any).type).toBe('wave');
  });

  it('does nothing on update when not thinking', () => {
    // onUpdate just checks isThinking — should not throw
    npcAIHandler.onUpdate?.(node as any, cfg as any, ctx as any, 0.016);
  });

  it('has correct default config', () => {
    expect(npcAIHandler.defaultConfig).toBeDefined();
    expect((npcAIHandler.defaultConfig as any).model).toBe('hermes-3-70b');
  });
});
