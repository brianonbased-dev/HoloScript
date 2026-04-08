import { describe, it, expect, vi, beforeEach } from 'vitest';
import { npcAIHandler } from '../traits/NPCAITrait';
import { registerAIAdapter, unregisterAIAdapter, type AIAdapter } from '../ai/AIAdapter';

describe('NPCAI Trait', () => {
  beforeEach(() => {
    unregisterAIAdapter('mock-ai');
  });

  it('should call registered AI adapter on prompt', async () => {
    const mockAdapter: AIAdapter = {
      id: 'mock-ai',
      name: 'Mock AI',
      isReady: () => true,
      chat: vi.fn().mockResolvedValue('Hello, user!'),
    };
    registerAIAdapter(mockAdapter, true);

    const mockNode = { properties: {} };
    const mockConfig = npcAIHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;

    npcAIHandler.onAttach!(mockNode as any, mockConfig, mockContext);

    // Simulate prompt event
    npcAIHandler.onEvent!(mockNode as any, mockConfig, mockContext, {
      type: 'npc_ai_prompt',
      prompt: 'Hello NPC',
    });

    const state = (mockNode as any).__npcAIState;
    expect(state.isThinking).toBe(true);
    expect(state.conversationHistory).toHaveLength(1);

    // Wait for the async promise in onEvent
    await vi.waitFor(() =>
      expect(mockContext.emit).toHaveBeenCalledWith('npc_ai_response', expect.anything())
    );

    expect(mockAdapter.chat).toHaveBeenCalledWith('Hello NPC', undefined, expect.anything());
  });

  it('should fallback to stub if no adapter is registered', async () => {
    // Ensure no adapter is set as default
    unregisterAIAdapter('openai'); // Common default
    unregisterAIAdapter('mock-ai');

    const mockNode = { properties: {} };
    const mockConfig = npcAIHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;

    npcAIHandler.onAttach!(mockNode as any, mockConfig, mockContext);

    // Simulate prompt
    npcAIHandler.onEvent!(mockNode as any, mockConfig, mockContext, {
      type: 'npc_ai_prompt',
      prompt: 'Hello',
    });

    // Wait for the stub timeout
    await vi.waitFor(
      () =>
        expect(mockContext.emit).toHaveBeenCalledWith(
          'npc_ai_response',
          expect.objectContaining({
            text: expect.stringContaining('[STUB]'),
          })
        ),
      { timeout: 1000 }
    );
  });
});

