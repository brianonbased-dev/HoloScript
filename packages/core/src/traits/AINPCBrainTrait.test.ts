/**
 * Comprehensive test suite for AINPCBrainTrait
 *
 * Covers:
 * - Handler properties (name, defaultConfig, lifecycle methods)
 * - Lifecycle: onAttach with personality variants, onDetach, onUpdate
 * - Event handling: dialogue range, interaction, relationship changes
 * - Personality system and dialogue variations
 * - State management and isolation
 * - Relationship decay mechanics
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ainpcBrainHandler, type AINPCBrainConfig } from './AINPCBrainTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

describe('AINPCBrainTrait', () => {
  let mockNode: Partial<HSPlusNode>;
  let mockContext: Partial<TraitContext>;

  beforeEach(() => {
    mockNode = {};

    mockContext = {
      emit: vi.fn(),
      setState: vi.fn(),
      getState: vi.fn(() => ({})),
    };
  });

  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(ainpcBrainHandler.name).toBe('ai_npc_brain');
    });

    it('should provide default configuration', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      expect(config.dialogue_range).toBe(5.0);
      expect(config.voice_enabled).toBe(true);
      expect(config.personality).toBe('helpful');
      expect(config.memory_size).toBe(20);
      expect(config.conversation_history).toBe(true);
      expect(config.player_relationship).toBe(0.5);
      expect(config.idle_behavior).toBe('static');
    });

    it('should expose all lifecycle methods', () => {
      expect(typeof ainpcBrainHandler.onAttach).toBe('function');
      expect(typeof ainpcBrainHandler.onDetach).toBe('function');
      expect(typeof ainpcBrainHandler.onUpdate).toBe('function');
      expect(typeof ainpcBrainHandler.onEvent).toBe('function');
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize NPC state', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const npcState = mockNode.__npcState as any;
      expect(npcState).toBeDefined();
      expect(npcState.in_dialogue).toBe(false);
      expect(npcState.last_interaction_time).toBe(0);
      expect(npcState.conversation_count).toBe(0);
      expect(npcState.relationship_delta).toBe(0);
    });

    it('should emit ainpc_init event', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('ainpc_init', {
        node: mockNode,
        personality: 'helpful',
        dialogueRange: 5.0,
        voiceEnabled: true,
        systemPrompt: expect.stringContaining('helpful'),
      });
    });

    it('should support all personality types', () => {
      const personalities = ['helpful', 'sarcastic', 'wise', 'cheerful', 'mysterious'];

      for (const personality of personalities) {
        mockNode = {};
        mockContext.emit?.mockClear();

        const config = {
          ...(ainpcBrainHandler.defaultConfig as AINPCBrainConfig),
          personality: personality as any,
        };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
        expect(callArgs).toBeDefined();
        expect(callArgs[1].personality).toBe(personality);
        expect(callArgs[1].systemPrompt).toContain(personality.toLowerCase());
      }
    });

    it('should generate correct system prompt for helpful personality', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, personality: 'helpful' };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].systemPrompt).toContain('helpful NPC');
      expect(callArgs[1].systemPrompt).toContain('friendly');
    });

    it('should generate correct system prompt for sarcastic personality', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, personality: 'sarcastic' };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].systemPrompt).toContain('sarcastic');
      expect(callArgs[1].systemPrompt).toContain('wit');
    });

    it('should generate correct system prompt for wise personality', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, personality: 'wise' };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].systemPrompt).toContain('wise elder');
      expect(callArgs[1].systemPrompt).toContain('riddles');
    });

    it('should generate correct system prompt for cheerful personality', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, personality: 'cheerful' };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].systemPrompt).toContain('cheerful');
      expect(callArgs[1].systemPrompt).toContain('upbeat');
    });

    it('should generate correct system prompt for mysterious personality', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, personality: 'mysterious' };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].systemPrompt).toContain('mysterious');
      expect(callArgs[1].systemPrompt).toContain('vague');
    });

    it('should emit init with custom dialogue range', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, dialogue_range: 10.0 };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].dialogueRange).toBe(10.0);
    });

    it('should emit init with voice settings', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, voice_enabled: false };
      mockContext.emit?.mockClear();

      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
      expect(callArgs[1].voiceEnabled).toBe(false);
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
    });

    it('should delete NPC state', () => {
      ainpcBrainHandler.onDetach?.(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect(mockNode.__npcState).toBeUndefined();
    });
  });

  describe('lifecycle: onUpdate', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
    });

    it('should decay relationship_delta over time', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      const npcState = mockNode.__npcState as any;
      npcState.relationship_delta = 0.5;

      ainpcBrainHandler.onUpdate?.(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.016);

      // Delta should decay by 99% (multiply by 0.99)
      expect(npcState.relationship_delta).toBeCloseTo(0.5 * 0.99, 5);
    });

    it('should not decay relationship_delta if zero', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      const npcState = mockNode.__npcState as any;
      npcState.relationship_delta = 0;

      ainpcBrainHandler.onUpdate?.(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.016);

      expect(npcState.relationship_delta).toBe(0);
    });

    it('should handle missing NPC state gracefully', () => {
      delete mockNode.__npcState;
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;

      expect(() => {
        ainpcBrainHandler.onUpdate?.(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.016);
      }).not.toThrow();
    });
  });

  describe('event handling: player_enter_dialogue_range', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should emit on_player_nearby when not in dialogue', () => {
      const event: TraitEvent = {
        type: 'player_enter_dialogue_range',
        playerId: 'player_123',
        distance: 3.5,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_player_nearby', {
        node: mockNode,
        playerId: 'player_123',
        distance: 3.5,
      });
    });

    it('should NOT emit on_player_nearby when already in dialogue', () => {
      const npcState = mockNode.__npcState as any;
      npcState.in_dialogue = true;

      mockContext.emit?.mockClear();

      const event: TraitEvent = {
        type: 'player_enter_dialogue_range',
        playerId: 'player_123',
        distance: 3.5,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(mockContext.emit).not.toHaveBeenCalledWith('on_player_nearby', expect.any(Object));
    });
  });

  describe('event handling: player_exit_dialogue_range', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should emit on_dialogue_end when in dialogue', () => {
      const npcState = mockNode.__npcState as any;
      npcState.in_dialogue = true;

      const event: TraitEvent = {
        type: 'player_exit_dialogue_range',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_dialogue_end', { node: mockNode });
    });

    it('should set in_dialogue to false on exit', () => {
      const npcState = mockNode.__npcState as any;
      npcState.in_dialogue = true;

      const event: TraitEvent = {
        type: 'player_exit_dialogue_range',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(npcState.in_dialogue).toBe(false);
    });

    it('should NOT emit on_dialogue_end when not in dialogue', () => {
      const npcState = mockNode.__npcState as any;
      npcState.in_dialogue = false;

      mockContext.emit?.mockClear();

      const event: TraitEvent = {
        type: 'player_exit_dialogue_range',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(mockContext.emit).not.toHaveBeenCalledWith('on_dialogue_end', expect.any(Object));
    });
  });

  describe('event handling: player_interact', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should set in_dialogue to true', () => {
      const npcState = mockNode.__npcState as any;
      npcState.in_dialogue = false;

      const event: TraitEvent = {
        type: 'player_interact',
        playerId: 'player_456',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(npcState.in_dialogue).toBe(true);
    });

    it('should update last_interaction_time', () => {
      const npcState = mockNode.__npcState as any;
      const beforeTime = Date.now();

      const event: TraitEvent = {
        type: 'player_interact',
        playerId: 'player_456',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      const afterTime = Date.now();

      expect(npcState.last_interaction_time).toBeGreaterThanOrEqual(beforeTime);
      expect(npcState.last_interaction_time).toBeLessThanOrEqual(afterTime);
    });

    it('should increment conversation_count', () => {
      const npcState = mockNode.__npcState as any;
      npcState.conversation_count = 5;

      const event: TraitEvent = {
        type: 'player_interact',
        playerId: 'player_456',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(npcState.conversation_count).toBe(6);
    });

    it('should emit on_dialogue_start with correct conversation count', () => {
      const event: TraitEvent = {
        type: 'player_interact',
        playerId: 'player_789',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_dialogue_start', {
        node: mockNode,
        playerId: 'player_789',
        conversationCount: 1,
      });
    });

    it('should track multiple interactions', () => {
      for (let i = 1; i <= 3; i++) {
        mockContext.emit?.mockClear();

        const event: TraitEvent = {
          type: 'player_interact',
          playerId: `player_${i}`,
        };

        ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);

        const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'on_dialogue_start');
        expect(callArgs[1].conversationCount).toBe(i);
      }
    });
  });

  describe('event handling: relationship_change', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should update player_relationship by delta', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.5 };

      const event: TraitEvent = {
        type: 'relationship_change',
        delta: 0.2,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(config.player_relationship).toBeCloseTo(0.7, 5);
    });

    it('should clamp relationship to [-1, 1] on positive overflow', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.9 };

      const event: TraitEvent = {
        type: 'relationship_change',
        delta: 0.5,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(config.player_relationship).toBe(1);
    });

    it('should clamp relationship to [-1, 1] on negative overflow', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: -0.8 };

      const event: TraitEvent = {
        type: 'relationship_change',
        delta: -0.5,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(config.player_relationship).toBe(-1);
    });

    it('should set relationship_delta in state', () => {
      const npcState = mockNode.__npcState as any;
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig };

      const event: TraitEvent = {
        type: 'relationship_change',
        delta: -0.1,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(npcState.relationship_delta).toBe(-0.1);
    });

    it('should emit on_relationship_updated event', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.5 };

      const event: TraitEvent = {
        type: 'relationship_change',
        delta: 0.25,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_relationship_updated', {
        node: mockNode,
        relationship: 0.75,
        delta: 0.25,
      });
    });

    it('should handle negative relationship changes', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.5 };

      const event: TraitEvent = {
        type: 'relationship_change',
        delta: -0.3,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(config.player_relationship).toBeCloseTo(0.2, 5);
      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_relationship_updated',
        expect.objectContaining({ relationship: 0.2, delta: -0.3 })
      );
    });
  });

  describe('event handling: unknown events', () => {
    beforeEach(() => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);
    });

    it('should ignore unknown events without crashing', () => {
      const event: TraitEvent = { type: 'some_random_event' };

      expect(() => {
        ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, {}, mockContext as TraitContext, event);
      }).not.toThrow();
    });
  });

  describe('configuration variations', () => {
    it('should support different dialogue ranges', () => {
      const ranges = [1.0, 5.0, 10.0, 20.0];

      for (const range of ranges) {
        mockNode = {};
        mockContext.emit?.mockClear();

        const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, dialogue_range: range };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
        expect(callArgs[1].dialogueRange).toBe(range);
      }
    });

    it('should support voice enabled/disabled', () => {
      for (const enabled of [true, false]) {
        mockNode = {};
        mockContext.emit?.mockClear();

        const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, voice_enabled: enabled };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const callArgs = (mockContext.emit as any).mock.calls.find((c: any) => c[0] === 'ainpc_init');
        expect(callArgs[1].voiceEnabled).toBe(enabled);
      }
    });

    it('should support different memory sizes', () => {
      const sizes = [5, 10, 20, 50, 100];

      for (const size of sizes) {
        mockNode = {};
        const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, memory_size: size };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        expect(mockNode.__npcState).toBeDefined();
      }
    });

    it('should support conversation history enabled/disabled', () => {
      for (const enabled of [true, false]) {
        mockNode = {};
        const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, conversation_history: enabled };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        expect(mockNode.__npcState).toBeDefined();
      }
    });

    it('should support different idle behaviors', () => {
      const behaviors: Array<'static' | 'wander' | 'patrol'> = ['static', 'wander', 'patrol'];

      for (const behavior of behaviors) {
        mockNode = {};
        const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, idle_behavior: behavior };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        expect(mockNode.__npcState).toBeDefined();
      }
    });

    it('should support initial relationship variations', () => {
      const relationships = [-1.0, -0.5, 0.0, 0.5, 1.0];

      for (const rel of relationships) {
        mockNode = {};
        const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: rel };

        ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

        expect(mockNode.__npcState).toBeDefined();
      }
    });
  });

  describe('complex workflows', () => {
    it('should handle complete dialogue workflow', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      mockContext.emit?.mockClear();

      // Player enters dialogue range
      let event: TraitEvent = {
        type: 'player_enter_dialogue_range',
        playerId: 'player_1',
        distance: 3.0,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_player_nearby', expect.any(Object));

      mockContext.emit?.mockClear();

      // Player interacts
      event = {
        type: 'player_interact',
        playerId: 'player_1',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_dialogue_start', expect.any(Object));

      const npcState = mockNode.__npcState as any;
      expect(npcState.in_dialogue).toBe(true);

      mockContext.emit?.mockClear();

      // Relationship improves during dialogue
      event = {
        type: 'relationship_change',
        delta: 0.2,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_relationship_updated', expect.any(Object));

      mockContext.emit?.mockClear();

      // Player exits dialogue range
      event = {
        type: 'player_exit_dialogue_range',
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('on_dialogue_end', expect.any(Object));
      expect(npcState.in_dialogue).toBe(false);
    });

    it('should handle multiple player interactions', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const npcState = mockNode.__npcState as any;

      // Multiple interactions
      for (let i = 1; i <= 3; i++) {
        mockContext.emit?.mockClear();

        const event: TraitEvent = {
          type: 'player_interact',
          playerId: `player_${i}`,
        };

        ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

        expect(npcState.conversation_count).toBe(i);
      }
    });

    it('should handle relationship decay workflow', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.5 };
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const npcState = mockNode.__npcState as any;

      // Increase relationship
      let event: TraitEvent = {
        type: 'relationship_change',
        delta: 0.3,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(npcState.relationship_delta).toBeCloseTo(0.3, 5);

      // Update 50 times to simulate significant decay
      for (let i = 0; i < 50; i++) {
        ainpcBrainHandler.onUpdate?.(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.016);
      }

      // Relationship delta should decay: 0.3 * (0.99^50) ≈ 0.18
      // So it should be less than 0.25 after 50 updates
      expect(npcState.relationship_delta).toBeLessThan(0.25);
      expect(npcState.relationship_delta).toBeGreaterThan(0);
    });

    it('should handle hostile relationship workflow', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.5 };
      ainpcBrainHandler.onAttach?.(mockNode as HSPlusNode, config, mockContext as TraitContext);

      mockContext.emit?.mockClear();

      // Decrease relationship significantly
      const event: TraitEvent = {
        type: 'relationship_change',
        delta: -0.7,
      };

      ainpcBrainHandler.onEvent?.(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      // Should be clamped to -1.0
      expect(config.player_relationship).toBeLessThanOrEqual(0.0);
      expect(config.player_relationship).toBeGreaterThanOrEqual(-1.0);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_relationship_updated',
        expect.objectContaining({
          delta: -0.7,
        })
      );
    });
  });

  describe('state isolation', () => {
    it('should maintain independent state for each NPC node', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      const node1 = {} as HSPlusNode;
      const node2 = {} as HSPlusNode;

      const ctx = { emit: vi.fn() } as any;

      ainpcBrainHandler.onAttach?.(node1, config, ctx);
      ainpcBrainHandler.onAttach?.(node2, config, ctx);

      const state1 = node1.__npcState as any;
      const state2 = node2.__npcState as any;

      // Modify state1
      state1.in_dialogue = true;
      state1.conversation_count = 5;
      state1.relationship_delta = 0.2;

      // state2 should be unaffected
      expect(state2.in_dialogue).toBe(false);
      expect(state2.conversation_count).toBe(0);
      expect(state2.relationship_delta).toBe(0);
    });

    it('should not share conversation counts between nodes', () => {
      const config = ainpcBrainHandler.defaultConfig as AINPCBrainConfig;
      const node1 = {} as HSPlusNode;
      const node2 = {} as HSPlusNode;

      const ctx = { emit: vi.fn() } as any;

      ainpcBrainHandler.onAttach?.(node1, config, ctx);
      ainpcBrainHandler.onAttach?.(node2, config, ctx);

      // Interact with node1 multiple times
      for (let i = 0; i < 3; i++) {
        const event: TraitEvent = {
          type: 'player_interact',
          playerId: 'player',
        };

        ainpcBrainHandler.onEvent?.(node1, config, ctx, event);
      }

      const state1 = node1.__npcState as any;
      const state2 = node2.__npcState as any;

      expect(state1.conversation_count).toBe(3);
      expect(state2.conversation_count).toBe(0);
    });

    it('should isolate relationship tracking per node', () => {
      const config = { ...ainpcBrainHandler.defaultConfig as AINPCBrainConfig, player_relationship: 0.5 };
      const node1 = { ...config } as any;
      const node2 = { ...config } as any;

      const ctx = { emit: vi.fn() } as any;

      ainpcBrainHandler.onAttach?.(node1, node1 as AINPCBrainConfig, ctx);
      ainpcBrainHandler.onAttach?.(node2, node2 as AINPCBrainConfig, ctx);

      // Change node1 relationship
      const event: TraitEvent = {
        type: 'relationship_change',
        delta: 0.3,
      };

      ainpcBrainHandler.onEvent?.(node1 as HSPlusNode, node1 as AINPCBrainConfig, ctx, event);

      // node2 should be unchanged
      expect((node1 as any).player_relationship).toBeCloseTo(0.8, 5);
      expect((node2 as any).player_relationship).toBeCloseTo(0.5, 5);
    });
  });
});
