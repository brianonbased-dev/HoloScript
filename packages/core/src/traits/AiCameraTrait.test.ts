/**
 * @ai_camera Trait Test Suite
 *
 * Comprehensive tests for AI-driven camera director trait with
 * tracking modes, framing composition, and automatic camera control.
 *
 * @module traits/__tests__
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { aiCameraHandler } from './AiCameraTrait';

describe('AiCameraTrait', () => {
  let mockNode: Partial<HSPlusNode>;
  let mockContext: any;

  beforeEach(() => {
    mockNode = {
      id: 'test-camera',
      __camState: undefined,
    };

    mockContext = {
      emit: vi.fn(),
    };
  });

  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(aiCameraHandler.name).toBe('ai_camera');
    });

    it('should provide default configuration', () => {
      const defaultConfig = aiCameraHandler.defaultConfig;
      expect(defaultConfig.tracking_speed).toBe(1.0);
    });

    it('should expose lifecycle methods', () => {
      expect(typeof aiCameraHandler.onAttach).toBe('function');
      expect(typeof aiCameraHandler.onUpdate).toBe('function');
      expect(typeof aiCameraHandler.onDetach).toBe('function');
      expect(typeof aiCameraHandler.onEvent).toBe('function');
    });

    it('onUpdate should exist but be a no-op', () => {
      const result = aiCameraHandler.onUpdate(mockNode as HSPlusNode, { tracking_speed: 1.0 }, mockContext, 0.016);
      expect(result).toBeUndefined();
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize camera state', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);

      const state = mockNode.__camState as any;
      expect(state).toBeDefined();
      expect(state.mode).toBe('static');
      expect(state.target).toBeNull();
      expect(state.shots).toBe(0);
    });

    it('should set default mode to static', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);

      const state = mockNode.__camState as any;
      expect(state.mode).toBe('static');
    });

    it('should initialize target as null', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);

      const state = mockNode.__camState as any;
      expect(state.target).toBeNull();
    });

    it('should initialize shot counter to zero', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);

      const state = mockNode.__camState as any;
      expect(state.shots).toBe(0);
    });

    it('should attach state to node', () => {
      expect(mockNode.__camState).toBeUndefined();
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      expect(mockNode.__camState).toBeDefined();
    });

    it('should allow multiple nodes to have independent states', () => {
      const node1: Partial<HSPlusNode> = { id: 'cam1' };
      const node2: Partial<HSPlusNode> = { id: 'cam2' };

      aiCameraHandler.onAttach(node1 as HSPlusNode);
      aiCameraHandler.onAttach(node2 as HSPlusNode);

      const state1 = node1.__camState as any;
      const state2 = node2.__camState as any;

      state1.shots = 10;
      state2.shots = 5;

      expect(state1.shots).toBe(10);
      expect(state2.shots).toBe(5);
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
    });

    it('should delete camera state', () => {
      expect(mockNode.__camState).toBeDefined();
      aiCameraHandler.onDetach(mockNode as HSPlusNode);
      expect(mockNode.__camState).toBeUndefined();
    });

    it('should handle detach gracefully when no state exists', () => {
      mockNode.__camState = undefined;
      expect(() => aiCameraHandler.onDetach(mockNode as HSPlusNode)).not.toThrow();
    });

    it('should clean up all state properties', () => {
      const state = mockNode.__camState as any;
      state.mode = 'tracking';
      state.target = 'actor1';
      state.shots = 42;

      aiCameraHandler.onDetach(mockNode as HSPlusNode);

      expect(mockNode.__camState).toBeUndefined();
    });
  });

  describe('event handling: cam:track', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();
    });

    it('should set mode to tracking on cam:track event', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:track', targetId: 'actor1' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      const state = mockNode.__camState as any;
      expect(state.mode).toBe('tracking');
    });

    it('should set target to event targetId', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:track', targetId: 'player1' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      const state = mockNode.__camState as any;
      expect(state.target).toBe('player1');
    });

    it('should emit cam:tracking event with target and speed', () => {
      const config = { tracking_speed: 2.5 };
      const event = { type: 'cam:track', targetId: 'npc3' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('cam:tracking', {
        target: 'npc3',
        speed: 2.5,
      });
    });

    it('should respect tracking_speed configuration', () => {
      const config = { tracking_speed: 0.5 };
      const event = { type: 'cam:track', targetId: 'boss' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:tracking',
        expect.objectContaining({ speed: 0.5 })
      );
    });

    it('should update target when tracking new actor', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'actor1',
      });
      expect(state.target).toBe('actor1');

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'actor2',
      });
      expect(state.target).toBe('actor2');
    });

    it('should handle null/undefined targetId', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:track', targetId: null };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      const state = mockNode.__camState as any;
      expect(state.target).toBeNull();
    });

    it('should transition from static to tracking mode', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      expect(state.mode).toBe('static');

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'target',
      });

      expect(state.mode).toBe('tracking');
    });

    it('should maintain shot count during tracking', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;
      state.shots = 5;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'actor',
      });

      expect(state.shots).toBe(5); // Unchanged
    });
  });

  describe('event handling: cam:frame', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();
    });

    it('should increment shot counter on cam:frame event', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:frame', composition: 'portrait' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      const state = mockNode.__camState as any;
      expect(state.shots).toBe(1);
    });

    it('should emit cam:framed event with composition and shot count', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:frame', composition: 'wide' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('cam:framed', {
        composition: 'wide',
        shotCount: 1,
      });
    });

    it('should accumulate shot count across multiple frames', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      for (let i = 1; i <= 5; i++) {
        aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'cam:frame',
          composition: `shot_${i}`,
        });
        expect(state.shots).toBe(i);
      }
    });

    it('should include correct shot count in each frame event', () => {
      const config = aiCameraHandler.defaultConfig;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'close-up',
      });

      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:framed',
        expect.objectContaining({ shotCount: 1 })
      );

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'wide-shot',
      });

      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:framed',
        expect.objectContaining({ shotCount: 2 })
      );
    });

    it('should support different composition types', () => {
      const config = aiCameraHandler.defaultConfig;
      const compositions = ['portrait', 'landscape', 'square', 'widescreen', 'imax'];

      for (const comp of compositions) {
        mockContext.emit.mockClear();
        aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'cam:frame',
          composition: comp,
        });

        expect(mockContext.emit).toHaveBeenCalledWith(
          'cam:framed',
          expect.objectContaining({ composition: comp })
        );
      }
    });

    it('should handle null composition', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:frame', composition: null };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:framed',
        expect.objectContaining({ composition: null })
      );
    });

    it('should not affect camera mode when framing', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      state.mode = 'tracking';
      state.target = 'actor';

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'cinematic',
      });

      expect(state.mode).toBe('tracking');
      expect(state.target).toBe('actor');
    });

    it('should work during any camera mode', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      // Frame in static mode
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'static-frame',
      });
      expect(state.shots).toBe(1);

      // Frame in tracking mode
      state.mode = 'tracking';
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'tracking-frame',
      });
      expect(state.shots).toBe(2);

      // Frame in auto mode
      state.mode = 'auto';
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'auto-frame',
      });
      expect(state.shots).toBe(3);
    });
  });

  describe('event handling: cam:auto', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();
    });

    it('should set mode to auto on cam:auto event', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:auto' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      const state = mockNode.__camState as any;
      expect(state.mode).toBe('auto');
    });

    it('should emit cam:auto_mode event', () => {
      const config = aiCameraHandler.defaultConfig;
      const event = { type: 'cam:auto' };

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('cam:auto_mode', { mode: 'auto' });
    });

    it('should transition from static to auto', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      expect(state.mode).toBe('static');

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:auto',
      });

      expect(state.mode).toBe('auto');
    });

    it('should transition from tracking to auto', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      state.mode = 'tracking';
      state.target = 'actor';

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:auto',
      });

      expect(state.mode).toBe('auto');
    });

    it('should preserve shot count when switching to auto', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;
      state.shots = 15;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:auto',
      });

      expect(state.shots).toBe(15);
    });

    it('should emit consistent auto mode message', () => {
      const config = aiCameraHandler.defaultConfig;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:auto',
      });

      expect(mockContext.emit).toHaveBeenCalledWith('cam:auto_mode', {
        mode: 'auto',
      });
    });
  });

  describe('event handling: string events', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();
    });

    it('should handle string event type cam:track', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      // String events don't carry targetId, but should still be handled
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, 'cam:track' as any);

      // Mode should change to tracking
      expect(state.mode).toBe('tracking');
    });

    it('should handle string event type cam:frame', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, 'cam:frame' as any);

      expect(state.shots).toBe(1);
    });

    it('should handle string event type cam:auto', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, 'cam:auto' as any);

      expect(state.mode).toBe('auto');
    });
  });

  describe('event handling: unknown events', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();
    });

    it('should ignore unknown event types gracefully', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;
      const stateSnapshot = JSON.parse(JSON.stringify(state));

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'unknown:event',
      });

      expect(state).toEqual(stateSnapshot);
      expect(mockContext.emit).not.toHaveBeenCalled();
    });

    it('should handle events when no state exists', () => {
      const config = aiCameraHandler.defaultConfig;
      mockNode.__camState = undefined;

      expect(() => {
        aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'cam:track',
          targetId: 'actor',
        });
      }).not.toThrow();
    });
  });

  describe('state management', () => {
    it('should initialize fresh state for each node', () => {
      const node1: Partial<HSPlusNode> = { id: 'camera1' };
      const node2: Partial<HSPlusNode> = { id: 'camera2' };

      aiCameraHandler.onAttach(node1 as HSPlusNode);
      aiCameraHandler.onAttach(node2 as HSPlusNode);

      const state1 = node1.__camState as any;
      const state2 = node2.__camState as any;

      expect(state1).not.toBe(state2); // Different objects
      expect(state1.mode).toBe(state2.mode); // Same initial values
      expect(state1.target).toBe(state2.target);
      expect(state1.shots).toBe(state2.shots);
    });

    it('should allow concurrent camera operations on different nodes', () => {
      const node1: Partial<HSPlusNode> = { id: 'cam1' };
      const node2: Partial<HSPlusNode> = { id: 'cam2' };
      const config = aiCameraHandler.defaultConfig;
      const ctx = { emit: vi.fn() };

      aiCameraHandler.onAttach(node1 as HSPlusNode);
      aiCameraHandler.onAttach(node2 as HSPlusNode);

      aiCameraHandler.onEvent(node1 as HSPlusNode, config, ctx, {
        type: 'cam:track',
        targetId: 'actor1',
      });

      aiCameraHandler.onEvent(node2 as HSPlusNode, config, ctx, {
        type: 'cam:frame',
        composition: 'wide',
      });

      const state1 = node1.__camState as any;
      const state2 = node2.__camState as any;

      expect(state1.mode).toBe('tracking');
      expect(state1.target).toBe('actor1');
      expect(state2.mode).toBe('static');
      expect(state2.shots).toBe(1);
    });

    it('should maintain mode, target, and shot state independently', () => {
      const config = aiCameraHandler.defaultConfig;
      aiCameraHandler.onAttach(mockNode as HSPlusNode);

      const state = mockNode.__camState as any;

      // Set tracking mode
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'actor1',
      });

      // Frame some shots
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'wide',
      });

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'close',
      });

      // Check all state preserved
      expect(state.mode).toBe('tracking');
      expect(state.target).toBe('actor1');
      expect(state.shots).toBe(2);
    });
  });

  describe('configuration variations', () => {
    it('should support tracking_speed from 0 to infinity', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      const speeds = [0, 0.1, 1.0, 5.0, 100.0];

      for (const speed of speeds) {
        mockContext.emit.mockClear();
        aiCameraHandler.onEvent(mockNode as HSPlusNode, { tracking_speed: speed }, mockContext, {
          type: 'cam:track',
          targetId: 'actor',
        });

        expect(mockContext.emit).toHaveBeenCalledWith(
          'cam:tracking',
          expect.objectContaining({ speed })
        );
      }
    });

    it('should handle negative tracking_speed', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();

      aiCameraHandler.onEvent(mockNode as HSPlusNode, { tracking_speed: -1.5 }, mockContext, {
        type: 'cam:track',
        targetId: 'actor',
      });

      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:tracking',
        expect.objectContaining({ speed: -1.5 })
      );
    });

    it('should handle zero tracking_speed', () => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();

      aiCameraHandler.onEvent(mockNode as HSPlusNode, { tracking_speed: 0 }, mockContext, {
        type: 'cam:track',
        targetId: 'actor',
      });

      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:tracking',
        expect.objectContaining({ speed: 0 })
      );
    });
  });

  describe('mode transitions', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
      mockContext.emit.mockClear();
    });

    it('should transition through all modes: static → tracking → auto → static', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      expect(state.mode).toBe('static');

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'actor',
      });
      expect(state.mode).toBe('tracking');

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:auto',
      });
      expect(state.mode).toBe('auto');

      // Explicit transition back to tracking
      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'other',
      });
      expect(state.mode).toBe('tracking');
    });

    it('should allow repeated transitions between modes', () => {
      const config = aiCameraHandler.defaultConfig;
      const state = mockNode.__camState as any;

      for (let i = 0; i < 5; i++) {
        aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'cam:auto',
        });
        expect(state.mode).toBe('auto');

        aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'cam:track',
          targetId: `actor${i}`,
        });
        expect(state.mode).toBe('tracking');
      }
    });
  });

  describe('event emission', () => {
    beforeEach(() => {
      aiCameraHandler.onAttach(mockNode as HSPlusNode);
    });

    it('should emit appropriate events for each operation', () => {
      const config = aiCameraHandler.defaultConfig;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:track',
        targetId: 'actor1',
      });
      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:tracking',
        expect.objectContaining({ target: 'actor1' })
      );

      mockContext.emit.mockClear();

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:frame',
        composition: 'wide',
      });
      expect(mockContext.emit).toHaveBeenCalledWith(
        'cam:framed',
        expect.objectContaining({ composition: 'wide' })
      );

      mockContext.emit.mockClear();

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'cam:auto',
      });
      expect(mockContext.emit).toHaveBeenCalledWith('cam:auto_mode', { mode: 'auto' });
    });

    it('should not emit for unknown events', () => {
      const config = aiCameraHandler.defaultConfig;

      aiCameraHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'unknown:event',
      });

      expect(mockContext.emit).not.toHaveBeenCalled();
    });

    it('should handle missing emit gracefully', () => {
      const config = aiCameraHandler.defaultConfig;
      const contextNoEmit = { emit: undefined };

      expect(() => {
        aiCameraHandler.onEvent(mockNode as HSPlusNode, config, contextNoEmit, {
          type: 'cam:track',
          targetId: 'actor',
        });
      }).not.toThrow();
    });
  });
});
