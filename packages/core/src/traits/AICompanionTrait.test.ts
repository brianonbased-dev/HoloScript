/**
 * @ai_companion Trait Test Suite
 *
 * Comprehensive tests for AI companion NPC behavior with emotion decay,
 * RAG integration, SNN support, and personality-driven interactions.
 *
 * @module traits/__tests__
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { aiCompanionHandler } from './AICompanionTrait';

describe('AICompanionTrait', () => {
  let mockNode: Partial<HSPlusNode>;
  let mockContext: any;

  beforeEach(() => {
    mockNode = {
      id: 'test-companion',
      __aiCompanionState: undefined,
    };

    mockContext = {
      emit: vi.fn(),
    };
  });

  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(aiCompanionHandler.name).toBe('ai_companion');
    });

    it('should provide default configuration', () => {
      const defaultConfig = aiCompanionHandler.defaultConfig;
      expect(defaultConfig.personality).toBe('friendly');
      expect(defaultConfig.interaction_range).toBe(10);
      expect(defaultConfig.response_latency).toBe(0.5);
      expect(defaultConfig.memory_capacity).toBe(100);
      expect(defaultConfig.use_rag).toBe(true);
      expect(defaultConfig.use_snn).toBe(true);
      expect(defaultConfig.idle_behavior).toBe('wander');
      expect(defaultConfig.emotion_decay).toBe(0.01);
    });

    it('should expose lifecycle methods', () => {
      expect(typeof aiCompanionHandler.onAttach).toBe('function');
      expect(typeof aiCompanionHandler.onUpdate).toBe('function');
      expect(typeof aiCompanionHandler.onDetach).toBe('function');
      expect(typeof aiCompanionHandler.onEvent).toBe('function');
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize state with default emotions', () => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const state = mockNode.__aiCompanionState as any;
      expect(state.active).toBe(true);
      expect(state.emotion.happiness).toBe(0.5);
      expect(state.emotion.curiosity).toBe(0.5);
      expect(state.emotion.fear).toBe(0);
      expect(state.emotion.trust).toBe(0.5);
    });

    it('should set initial state values', () => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const state = mockNode.__aiCompanionState as any;
      expect(state.memoryCount).toBe(0);
      expect(state.currentAction).toBe('idle');
      expect(state.interactingWith).toBeNull();
      expect(state.lastResponseTime).toBe(0);
    });

    it('should emit ai_companion_create event', () => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('ai_companion_create', {
        personality: 'friendly',
        interactionRange: 10,
        idleBehavior: 'wander',
        useRAG: true,
        useSNN: true,
      });
    });

    it('should handle custom personality', () => {
      const config = { ...aiCompanionHandler.defaultConfig, personality: 'grumpy' };
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_companion_create',
        expect.objectContaining({ personality: 'grumpy' })
      );
    });

    it('should support all idle behaviors on attach', () => {
      const behaviors: Array<'wander' | 'patrol' | 'stationary'> = ['wander', 'patrol', 'stationary'];

      for (const behavior of behaviors) {
        mockContext.emit.mockClear();
        const config = { ...aiCompanionHandler.defaultConfig, idle_behavior: behavior };
        aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

        expect(mockContext.emit).toHaveBeenCalledWith(
          'ai_companion_create',
          expect.objectContaining({ idleBehavior: behavior })
        );
      }
    });
  });

  describe('lifecycle: onDetach', () => {
    it('should emit ai_companion_destroy event', () => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();

      aiCompanionHandler.onDetach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('ai_companion_destroy', {
        nodeId: mockNode.id,
      });
    });

    it('should clean up state', () => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      aiCompanionHandler.onDetach(mockNode as HSPlusNode, config, mockContext);

      expect(mockNode.__aiCompanionState).toBeUndefined();
    });

    it('should handle detach gracefully when no state exists', () => {
      const config = aiCompanionHandler.defaultConfig;
      mockNode.__aiCompanionState = undefined;

      expect(() => aiCompanionHandler.onDetach(mockNode as HSPlusNode, config, mockContext)).not.toThrow();
    });
  });

  describe('lifecycle: onUpdate', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should apply emotion decay over time', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      // Set emotions to extreme values
      state.emotion.happiness = 1.0;
      state.emotion.curiosity = 0.0;

      const delta = 1.0; // 1 second
      aiCompanionHandler.onUpdate(mockNode as HSPlusNode, config, mockContext, delta);

      // Happiness should decay toward neutral (0.5)
      // Formula: value += (0.5 - value) * decay * delta = value + (0.5 - value) * 0.01 * 1
      const expectedHappiness = 1.0 + (0.5 - 1.0) * 0.01 * 1; // 0.995
      expect(state.emotion.happiness).toBeLessThan(1.0);
      expect(state.emotion.happiness).toBeCloseTo(expectedHappiness, 2);

      // Curiosity should decay toward neutral (0.5)
      const expectedCuriosity = 0.0 + (0.5 - 0.0) * 0.01 * 1;
      expect(state.emotion.curiosity).toBeGreaterThan(0.0);
      expect(state.emotion.curiosity).toBeCloseTo(expectedCuriosity, 2);
    });

    it('should exponentially decay fear emotion', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      state.emotion.fear = 0.8;
      const decay = config.emotion_decay * 1.0; // delta = 1.0

      aiCompanionHandler.onUpdate(mockNode as HSPlusNode, config, mockContext, 1.0);

      // Fear decays with: fear *= (1 - decay)
      const expectedFear = 0.8 * (1 - decay);
      expect(state.emotion.fear).toBeCloseTo(expectedFear, 2);
    });

    it('should emit ai_companion_update event', () => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onUpdate(mockNode as HSPlusNode, config, mockContext, 0.016);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_companion_update',
        expect.objectContaining({
          deltaTime: 0.016,
          emotion: expect.any(Object),
          currentAction: 'idle',
          interactingWith: null,
        })
      );
    });

    it('should not update when inactive', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      state.active = false;

      mockContext.emit.mockClear();
      aiCompanionHandler.onUpdate(mockNode as HSPlusNode, config, mockContext, 0.016);

      expect(mockContext.emit).not.toHaveBeenCalled();
    });

    it('should respect custom emotion decay rates', () => {
      const config = { ...aiCompanionHandler.defaultConfig, emotion_decay: 0.05 };
      const state = mockNode.__aiCompanionState as any;

      state.emotion.happiness = 1.0;
      const initialHappiness = state.emotion.happiness;

      aiCompanionHandler.onUpdate(mockNode as HSPlusNode, config, mockContext, 1.0);

      const expectedHappiness = initialHappiness + (0.5 - initialHappiness) * 0.05 * 1.0;
      expect(state.emotion.happiness).toBeCloseTo(expectedHappiness, 2);
    });
  });

  describe('event handling: ai_companion_interact', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should set interactingWith on interact event', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_interact',
          playerId: 'player123',
          message: 'Hello companion!',
        }
      );

      expect(state.interactingWith).toBe('player123');
      expect(state.currentAction).toBe('interacting');
    });

    it('should increase curiosity on interaction', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      state.emotion.curiosity = 0.3;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_interact',
          playerId: 'player123',
          message: 'Hello!',
        }
      );

      expect(state.emotion.curiosity).toBe(0.5); // 0.3 + 0.2, clamped to max 1.0
    });

    it('should emit ai_companion_response_start', () => {
      const config = aiCompanionHandler.defaultConfig;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_interact',
          playerId: 'player456',
          message: 'How are you?',
        }
      );

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_companion_response_start',
        expect.objectContaining({
          playerId: 'player456',
          message: 'How are you?',
          latency: 0.5,
        })
      );
    });

    it('should handle null playerId in interact event', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_interact',
          playerId: null,
          message: 'Test',
        }
      );

      expect(state.interactingWith).toBeNull();
    });
  });

  describe('event handling: ai_companion_response', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should increment memory count on response', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_response',
          text: 'I am doing well!',
        }
      );

      expect(state.memoryCount).toBe(1);
    });

    it('should cap memory count at memory_capacity', () => {
      const config = { ...aiCompanionHandler.defaultConfig, memory_capacity: 5 };
      const state = mockNode.__aiCompanionState as any;
      state.memoryCount = 5;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_response',
          text: 'Response text',
        }
      );

      expect(state.memoryCount).toBe(5); // Should not exceed capacity
    });

    it('should emit on_ai_companion_speak event', () => {
      const config = aiCompanionHandler.defaultConfig;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_response',
          text: 'Hello player!',
        }
      );

      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_ai_companion_speak',
        expect.objectContaining({
          text: 'Hello player!',
          emotion: expect.any(Object),
        })
      );
    });

    it('should update lastResponseTime', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      const before = Date.now();

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_response',
          text: 'Test',
        }
      );

      const after = Date.now();
      expect(state.lastResponseTime).toBeGreaterThanOrEqual(before);
      expect(state.lastResponseTime).toBeLessThanOrEqual(after);
    });
  });

  describe('event handling: ai_companion_emotion_stimulus', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should apply happiness stimulus', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      const initialHappiness = state.emotion.happiness;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_emotion_stimulus',
          happiness: 0.2,
        }
      );

      expect(state.emotion.happiness).toBe(initialHappiness + 0.2);
    });

    it('should apply fear stimulus', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_emotion_stimulus',
          fear: 0.3,
        }
      );

      expect(state.emotion.fear).toBe(0.3);
    });

    it('should apply trust stimulus', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_emotion_stimulus',
          trust: 0.15,
        }
      );

      expect(state.emotion.trust).toBe(0.65); // 0.5 + 0.15
    });

    it('should clamp emotions to [0, 1] range', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_emotion_stimulus',
          happiness: 2.0,
          fear: -1.0,
          trust: 0.5,
        }
      );

      expect(state.emotion.happiness).toBe(1.0); // Clamped to max
      expect(state.emotion.fear).toBe(0); // Clamped to min
      expect(state.emotion.trust).toBe(1.0); // 0.5 + 0.5 = 1.0
    });

    it('should handle partial stimulus', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      const originalCuriosity = state.emotion.curiosity;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_emotion_stimulus',
          happiness: 0.1,
          // curiosity not specified, should remain unchanged
        }
      );

      expect(state.emotion.curiosity).toBe(originalCuriosity);
    });
  });

  describe('event handling: ai_companion_set_action', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should set custom action', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_set_action',
          action: 'dancing',
        }
      );

      expect(state.currentAction).toBe('dancing');
    });

    it('should handle null action', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_set_action',
          action: null,
        }
      );

      expect(state.currentAction).toBe('idle');
    });
  });

  describe('event handling: ai_companion_end_interaction', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should clear interactingWith on end interaction', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      state.interactingWith = 'player123';

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_end_interaction',
        }
      );

      expect(state.interactingWith).toBeNull();
    });

    it('should return to wander behavior on end interaction (default)', () => {
      const config = aiCompanionHandler.defaultConfig; // idle_behavior: 'wander'
      const state = mockNode.__aiCompanionState as any;
      state.currentAction = 'interacting';

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_end_interaction',
        }
      );

      expect(state.currentAction).toBe('wander');
    });

    it('should return to patrol behavior on end interaction when configured', () => {
      const config = { ...aiCompanionHandler.defaultConfig, idle_behavior: 'patrol' };
      const state = mockNode.__aiCompanionState as any;
      state.currentAction = 'interacting';

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_end_interaction',
        }
      );

      expect(state.currentAction).toBe('patrol');
    });

    it('should return to idle for stationary behavior', () => {
      const config = { ...aiCompanionHandler.defaultConfig, idle_behavior: 'stationary' };
      const state = mockNode.__aiCompanionState as any;
      state.currentAction = 'interacting';

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_end_interaction',
        }
      );

      expect(state.currentAction).toBe('idle');
    });
  });

  describe('event handling: unknown event types', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should ignore unknown events gracefully', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;
      const stateSnapshot = JSON.parse(JSON.stringify(state));

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'unknown_event_type',
        }
      );

      expect(state).toEqual(stateSnapshot);
      expect(mockContext.emit).not.toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    beforeEach(() => {
      const config = aiCompanionHandler.defaultConfig;
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should maintain separate state for multiple nodes', () => {
      const node1: Partial<HSPlusNode> = { id: 'companion1' };
      const node2: Partial<HSPlusNode> = { id: 'companion2' };
      const config = aiCompanionHandler.defaultConfig;

      aiCompanionHandler.onAttach(node1 as HSPlusNode, config, mockContext);
      aiCompanionHandler.onAttach(node2 as HSPlusNode, config, mockContext);

      const state1 = node1.__aiCompanionState as any;
      const state2 = node2.__aiCompanionState as any;

      state1.emotion.happiness = 0.8;
      state2.emotion.happiness = 0.2;

      expect(state1.emotion.happiness).toBe(0.8);
      expect(state2.emotion.happiness).toBe(0.2);
    });

    it('should handle rapid state changes', () => {
      const config = aiCompanionHandler.defaultConfig;
      const state = mockNode.__aiCompanionState as any;

      // Simulate rapid interactions: start at 0.5, add 0.05 each time
      // 10 iterations: 0.5 + (10 * 0.05) = 1.0
      for (let i = 0; i < 10; i++) {
        aiCompanionHandler.onEvent(
          mockNode as HSPlusNode,
          config,
          mockContext,
          {
            type: 'ai_companion_emotion_stimulus',
            happiness: 0.05,
          }
        );
      }

      expect(state.emotion.happiness).toBeCloseTo(1.0, 5); // Clamped to max after 10 iterations
    });
  });

  describe('configuration variations', () => {
    it('should work with custom response latency', () => {
      const config = { ...aiCompanionHandler.defaultConfig, response_latency: 2.0 };
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();

      aiCompanionHandler.onEvent(
        mockNode as HSPlusNode,
        config,
        mockContext,
        {
          type: 'ai_companion_interact',
          playerId: 'player',
          message: 'Hi',
        }
      );

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_companion_response_start',
        expect.objectContaining({ latency: 2.0 })
      );
    });

    it('should handle RAG disabled configuration', () => {
      const config = { ...aiCompanionHandler.defaultConfig, use_rag: false };
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_companion_create',
        expect.objectContaining({ useRAG: false })
      );
    });

    it('should handle SNN disabled configuration', () => {
      const config = { ...aiCompanionHandler.defaultConfig, use_snn: false };
      aiCompanionHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_companion_create',
        expect.objectContaining({ useSNN: false })
      );
    });
  });
});
