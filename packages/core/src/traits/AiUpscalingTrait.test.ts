/**
 * Comprehensive test suite for AiUpscalingTrait
 *
 * Covers:
 * - Handler properties (name, defaultConfig, lifecycle methods)
 * - Lifecycle: onAttach, onDetach, onUpdate
 * - Event handling: result, request, error
 * - Configuration variations (all models, scale factors, sources)
 * - Cache management and state isolation
 * - Processing state transitions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  aiUpscalingHandler,
  neuralUpscalingHandler,
  type AiUpscalingConfig,
} from './AiUpscalingTrait';
import type { HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

describe('AiUpscalingTrait', () => {
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
      expect(aiUpscalingHandler.name).toBe('ai_upscaling');
    });

    it('should provide default configuration', () => {
      const config = aiUpscalingHandler.defaultConfig;
      expect(config).toHaveProperty('upscale_model', 'realesrgan');
      expect(config).toHaveProperty('scale_factor', 4);
      expect(config).toHaveProperty('tile_size', 512);
      expect(config).toHaveProperty('denoise_strength', 0.5);
      expect(config).toHaveProperty('input_source', 'texture');
      expect(config).toHaveProperty('preserve_details', true);
      expect(config).toHaveProperty('apply_to_material', true);
    });

    it('should expose all lifecycle methods', () => {
      expect(typeof aiUpscalingHandler.onAttach).toBe('function');
      expect(typeof aiUpscalingHandler.onDetach).toBe('function');
      expect(typeof aiUpscalingHandler.onUpdate).toBe('function');
      expect(typeof aiUpscalingHandler.onEvent).toBe('function');
    });

    it('should provide neural_upscaling alias handler', () => {
      expect(neuralUpscalingHandler.name).toBe('neural_upscaling');
      expect(neuralUpscalingHandler.defaultConfig.upscale_model).toBe('swinir');
      expect(neuralUpscalingHandler.defaultConfig.preserve_details).toBe(true);
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize state with correct default values', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;
      expect(state).toBeDefined();
      expect(state.is_processing).toBe(true); // Starts processing for texture source
      expect(state.output_texture).toBeNull();
      expect(state.processing_time).toBe(0);
      expect(state.last_upscale).toBe(0);
      expect(state.cache).toBeInstanceOf(Map);
    });

    it('should emit ai_upscaling_init event', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('ai_upscaling_init', {
        node: mockNode,
        model: 'realesrgan',
        scaleFactor: 4,
        tileSize: 512,
      });
    });

    it('should emit ai_upscaling_request for texture source', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'texture' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_upscaling_request',
        expect.objectContaining({
          node: mockNode,
          model: 'realesrgan',
          scaleFactor: 4,
        })
      );
    });

    it('should emit ai_upscaling_request for rendertarget source', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'rendertarget' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    });

    it('should NOT emit ai_upscaling_request immediately for live source', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'live' as const };
      mockContext.emit?.mockClear();
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      // Should only have init event, not request
      const calls = (mockContext.emit as any).mock.calls;
      expect(calls.some((c: any) => c[0] === 'ai_upscaling_request')).toBe(false);
    });

    it('should handle missing emit gracefully', () => {
      const config = aiUpscalingHandler.defaultConfig;
      const contextNoEmit = { ...mockContext, emit: undefined };

      expect(() => {
        aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, contextNoEmit as TraitContext);
      }).not.toThrow();

      expect(mockNode.__aiUpscalingState).toBeDefined();
    });

    it('should include output_resolution in request when specified', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, output_resolution: 2048 };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const callArgs = (mockContext.emit as any).mock.calls.find(
        (c: any) => c[0] === 'ai_upscaling_request'
      );
      expect(callArgs[1]).toHaveProperty('outputResolution', 2048);
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(() => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should emit ai_upscaling_cancel when processing', () => {
      aiUpscalingHandler.onDetach(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect(mockContext.emit).toHaveBeenCalledWith('ai_upscaling_cancel', { node: mockNode });
    });

    it('should clear cache on detach', () => {
      const state = mockNode.__aiUpscalingState as any;
      state.cache.set('test_key', { texture: 'test', timestamp: Date.now() });

      aiUpscalingHandler.onDetach(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect(state.cache.size).toBe(0);
    });

    it('should delete state from node', () => {
      aiUpscalingHandler.onDetach(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect(mockNode.__aiUpscalingState).toBeUndefined();
    });

    it('should NOT emit cancel when not processing', () => {
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false;

      mockContext.emit?.mockClear();
      aiUpscalingHandler.onDetach(mockNode as HSPlusNode, {}, mockContext as TraitContext);

      expect(mockContext.emit).not.toHaveBeenCalledWith('ai_upscaling_cancel', expect.any(Object));
    });

    it('should handle missing state gracefully', () => {
      delete mockNode.__aiUpscalingState;

      expect(() => {
        aiUpscalingHandler.onDetach(mockNode as HSPlusNode, {}, mockContext as TraitContext);
      }).not.toThrow();
    });
  });

  describe('lifecycle: onUpdate', () => {
    it('should not process for non-live sources', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'texture' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();

      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.016);

      expect(mockContext.emit).not.toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    });

    it('should track elapsed time for live mode', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'live' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false; // Allow update to proceed

      mockContext.emit?.mockClear();
      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 1.0); // 1 second

      expect(state.last_upscale).toBeCloseTo(1000, 0);
    });

    it('should not request if time < 2 seconds in live mode', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'live' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false;

      mockContext.emit?.mockClear();
      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 1.0); // 1 second

      expect(mockContext.emit).not.toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    });

    it('should request when time >= 2 seconds in live mode', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'live' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false;
      state.last_upscale = 2500; // 2.5 seconds

      mockContext.emit?.mockClear();
      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.1);

      expect(mockContext.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
      expect(state.is_processing).toBe(true);
      expect(state.last_upscale).toBe(0); // Reset after request
    });

    it('should not request when already processing in live mode', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'live' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = true;
      state.last_upscale = 2500;

      mockContext.emit?.mockClear();
      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.1);

      // Should not request because already processing
      const hasMidUpdate = (mockContext.emit as any).mock.calls.some((c: any) =>
        c[0].includes('ai_upscaling_request')
      );
      expect(hasMidUpdate).toBe(false);
    });

    it('should handle missing state gracefully', () => {
      delete mockNode.__aiUpscalingState;
      const config = aiUpscalingHandler.defaultConfig;

      expect(() => {
        aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.016);
      }).not.toThrow();
    });
  });

  describe('event handling: ai_upscaling_result', () => {
    beforeEach(() => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should update output_texture from event', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'upscaled_texture_url',
        processingTime: 1500,
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__aiUpscalingState as any;
      expect(state.output_texture).toBe('upscaled_texture_url');
    });

    it('should set is_processing to false', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'test',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__aiUpscalingState as any;
      expect(state.is_processing).toBe(false);
    });

    it('should update processing_time', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'test',
        processingTime: 2345,
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__aiUpscalingState as any;
      expect(state.processing_time).toBe(2345);
    });

    it('should cache result by model and scale key', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'cached_texture',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__aiUpscalingState as any;
      const cacheKey = 'realesrgan_4x';
      expect(state.cache.has(cacheKey)).toBe(true);
      expect(state.cache.get(cacheKey).texture).toBe('cached_texture');
    });

    it('should emit material_set_texture when apply_to_material is true', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, apply_to_material: true };
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'new_texture',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith('material_set_texture', {
        node: mockNode,
        texture: 'new_texture',
      });
    });

    it('should NOT emit material_set_texture when apply_to_material is false', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, apply_to_material: false };
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'new_texture',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).not.toHaveBeenCalledWith(
        'material_set_texture',
        expect.any(Object)
      );
    });

    it('should emit on_upscaling_complete event', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'result_texture',
        processingTime: 1500,
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_upscaling_complete',
        expect.objectContaining({
          node: mockNode,
          texture: 'result_texture',
          model: 'realesrgan',
          scaleFactor: 4,
        })
      );
    });

    it('should handle missing processingTime gracefully', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'test',
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__aiUpscalingState as any;
      expect(state.processing_time).toBe(0);
    });
  });

  describe('event handling: ai_upscaling_request', () => {
    beforeEach(() => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should trigger upscaling if not already processing', () => {
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false;

      const event: TraitEvent = { type: 'ai_upscaling_request' };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(state.is_processing).toBe(true);
      expect(mockContext.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    });

    it('should not request if already processing', () => {
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = true;

      mockContext.emit?.mockClear();
      const event: TraitEvent = { type: 'ai_upscaling_request' };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const hasMidRequest = (mockContext.emit as any).mock.calls.some((c: any) =>
        c[0] === 'ai_upscaling_request'
      );
      expect(hasMidRequest).toBe(false);
    });

    it('should include all config details in emitted request', () => {
      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false;

      const config = {
        ...aiUpscalingHandler.defaultConfig,
        scale_factor: 2 as const,
        tile_size: 256,
        preserve_details: false,
      };

      mockContext.emit?.mockClear();
      const event: TraitEvent = { type: 'ai_upscaling_request' };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'ai_upscaling_request',
        expect.objectContaining({
          scaleFactor: 2,
          tileSize: 256,
          preserveDetails: false,
        })
      );
    });
  });

  describe('event handling: ai_upscaling_error', () => {
    beforeEach(() => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
      mockContext.emit?.mockClear();
    });

    it('should set is_processing to false on error', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_error',
        error: 'Model loading failed',
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      const state = mockNode.__aiUpscalingState as any;
      expect(state.is_processing).toBe(false);
    });

    it('should emit on_upscaling_error event with error details', () => {
      const event: TraitEvent = {
        type: 'ai_upscaling_error',
        error: 'VRAM exceeded',
      };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(mockContext.emit).toHaveBeenCalledWith(
        'on_upscaling_error',
        expect.objectContaining({
          node: mockNode,
          error: 'VRAM exceeded',
          model: 'realesrgan',
        })
      );
    });

    it('should handle missing error gracefully', () => {
      const event: TraitEvent = { type: 'ai_upscaling_error' };

      expect(() => {
        aiUpscalingHandler.onEvent(
          mockNode as HSPlusNode,
          aiUpscalingHandler.defaultConfig,
          mockContext as TraitContext,
          event
        );
      }).not.toThrow();

      const state = mockNode.__aiUpscalingState as any;
      expect(state.is_processing).toBe(false);
    });
  });

  describe('event handling: unknown events', () => {
    beforeEach(() => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
    });

    it('should ignore unknown event types', () => {
      const state = mockNode.__aiUpscalingState as any;
      const originalProcessing = state.is_processing;

      const event: TraitEvent = { type: 'unknown_event_type' };

      aiUpscalingHandler.onEvent(
        mockNode as HSPlusNode,
        aiUpscalingHandler.defaultConfig,
        mockContext as TraitContext,
        event
      );

      expect(state.is_processing).toBe(originalProcessing);
    });

    it('should handle missing state gracefully', () => {
      delete mockNode.__aiUpscalingState;

      const event: TraitEvent = { type: 'ai_upscaling_result', texture: 'test' };

      expect(() => {
        aiUpscalingHandler.onEvent(
          mockNode as HSPlusNode,
          aiUpscalingHandler.defaultConfig,
          mockContext as TraitContext,
          event
        );
      }).not.toThrow();
    });
  });

  describe('configuration variations', () => {
    it('should support all upscale models', () => {
      const models: Array<any> = ['esrgan', 'realesrgan', 'swinir', 'real_esrgan_x4', 'ldm'];

      for (const model of models) {
        mockNode = {};
        const config = { ...aiUpscalingHandler.defaultConfig, upscale_model: model };

        expect(() => {
          aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
        }).not.toThrow();

        const state = mockNode.__aiUpscalingState as any;
        expect(state).toBeDefined();
      }
    });

    it('should support all scale factors', () => {
      const factors: Array<2 | 3 | 4> = [2, 3, 4];

      for (const factor of factors) {
        mockNode = {};
        mockContext.emit?.mockClear();
        const config = { ...aiUpscalingHandler.defaultConfig, scale_factor: factor };

        aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const calls = (mockContext.emit as any).mock.calls;
        const requestCall = calls.find((c: any) => c[0] === 'ai_upscaling_request');
        expect(requestCall[1].scaleFactor).toBe(factor);
      }
    });

    it('should support all input sources', () => {
      const sources: Array<'live' | 'texture' | 'rendertarget'> = ['live', 'texture', 'rendertarget'];

      for (const source of sources) {
        mockNode = {};
        mockContext.emit?.mockClear();
        const config = { ...aiUpscalingHandler.defaultConfig, input_source: source };

        aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const state = mockNode.__aiUpscalingState as any;
        if (source === 'live') {
          expect(state.is_processing).toBe(false);
        } else {
          expect(state.is_processing).toBe(true);
        }
      }
    });

    it('should support numeric configuration ranges', () => {
      const configs = [
        { tile_size: 256, denoise_strength: 0.0, scale_factor: 2 as const },
        { tile_size: 512, denoise_strength: 0.5, scale_factor: 3 as const },
        { tile_size: 1024, denoise_strength: 1.0, scale_factor: 4 as const },
      ];

      for (const partial of configs) {
        mockNode = {};
        const config = { ...aiUpscalingHandler.defaultConfig, ...partial };

        expect(() => {
          aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);
        }).not.toThrow();
      }
    });

    it('should support preserve_details boolean variations', () => {
      for (const preserve of [true, false]) {
        mockNode = {};
        const config = { ...aiUpscalingHandler.defaultConfig, preserve_details: preserve };

        aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const state = mockNode.__aiUpscalingState as any;
        expect(state).toBeDefined();
      }
    });

    it('should support apply_to_material boolean variations', () => {
      for (const apply of [true, false]) {
        mockNode = {};
        mockContext.emit?.mockClear();
        const config = { ...aiUpscalingHandler.defaultConfig, apply_to_material: apply };

        aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

        const state = mockNode.__aiUpscalingState as any;
        expect(state).toBeDefined();
      }
    });
  });

  describe('complex workflows', () => {
    it('should handle complete upscaling workflow', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;
      expect(state.is_processing).toBe(true);

      mockContext.emit?.mockClear();

      // Simulate upscaling result
      const resultEvent: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'upscaled_url',
        processingTime: 2000,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, resultEvent);

      expect(state.is_processing).toBe(false);
      expect(state.output_texture).toBe('upscaled_url');
      expect(state.processing_time).toBe(2000);
      expect(mockContext.emit).toHaveBeenCalledWith('on_upscaling_complete', expect.any(Object));
    });

    it('should handle multiple sequential upscaling requests', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;

      // First result
      const result1: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'texture1',
        processingTime: 1500,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, result1);
      expect(state.output_texture).toBe('texture1');
      expect(state.is_processing).toBe(false);

      // Request next upscaling
      const requestEvent: TraitEvent = { type: 'ai_upscaling_request' };
      mockContext.emit?.mockClear();

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, requestEvent);
      expect(state.is_processing).toBe(true);

      // Second result
      const result2: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'texture2',
        processingTime: 1800,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, result2);
      expect(state.output_texture).toBe('texture2');
      expect(state.is_processing).toBe(false);
    });

    it('should handle error recovery workflow', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;

      mockContext.emit?.mockClear();

      // Error occurs during processing
      const errorEvent: TraitEvent = {
        type: 'ai_upscaling_error',
        error: 'Model loading timeout',
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, errorEvent);

      expect(state.is_processing).toBe(false);
      expect(mockContext.emit).toHaveBeenCalledWith('on_upscaling_error', expect.any(Object));

      // Retry after error
      const retryEvent: TraitEvent = { type: 'ai_upscaling_request' };
      mockContext.emit?.mockClear();

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, retryEvent);

      expect(state.is_processing).toBe(true);
      expect(mockContext.emit).toHaveBeenCalledWith('ai_upscaling_request', expect.any(Object));
    });

    it('should handle live mode periodic upscaling', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, input_source: 'live' as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;
      state.is_processing = false;
      state.last_upscale = 2100; // Just past threshold

      mockContext.emit?.mockClear();

      // First update triggers request
      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.1);
      expect(state.is_processing).toBe(true);

      // Process result
      const resultEvent: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'live_texture1',
        processingTime: 1200,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, resultEvent);

      // Timer reset, check next update doesn't trigger immediately
      expect(state.last_upscale).toBe(0);
      expect(state.is_processing).toBe(false);

      mockContext.emit?.mockClear();
      aiUpscalingHandler.onUpdate(mockNode as HSPlusNode, config, mockContext as TraitContext, 0.5);

      // Should not request again (only 500ms elapsed)
      const hasRequest = (mockContext.emit as any).mock.calls.some((c: any) =>
        c[0] === 'ai_upscaling_request'
      );
      expect(hasRequest).toBe(false);
    });
  });

  describe('cache management', () => {
    it('should populate cache with model_scale key', () => {
      const config = { ...aiUpscalingHandler.defaultConfig, upscale_model: 'swinir', scale_factor: 3 as const };
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;

      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'cached_texture',
        processingTime: 1500,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      const cacheKey = 'swinir_3x';
      expect(state.cache.has(cacheKey)).toBe(true);
      expect(state.cache.get(cacheKey).texture).toBe('cached_texture');
    });

    it('should include timestamp in cache entries', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;
      const beforeTime = Date.now();

      const event: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'test',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event);

      const afterTime = Date.now();
      const cacheKey = 'realesrgan_4x';
      const entry = state.cache.get(cacheKey);

      expect(entry.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(entry.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should overwrite existing cache entries', () => {
      const config = aiUpscalingHandler.defaultConfig;
      aiUpscalingHandler.onAttach(mockNode as HSPlusNode, config, mockContext as TraitContext);

      const state = mockNode.__aiUpscalingState as any;
      const cacheKey = 'realesrgan_4x';

      // First entry
      const event1: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'texture1',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event1);
      expect(state.cache.get(cacheKey).texture).toBe('texture1');

      // Second entry (overwrites)
      const event2: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'texture2',
        processingTime: 1000,
      };

      aiUpscalingHandler.onEvent(mockNode as HSPlusNode, config, mockContext as TraitContext, event2);
      expect(state.cache.get(cacheKey).texture).toBe('texture2');
      expect(state.cache.size).toBe(1); // Still only one entry
    });
  });

  describe('state isolation', () => {
    it('should maintain independent state for each node', () => {
      const config = aiUpscalingHandler.defaultConfig;
      const node1 = {} as HSPlusNode;
      const node2 = {} as HSPlusNode;

      const ctx = { ...mockContext, emit: vi.fn() } as any;

      aiUpscalingHandler.onAttach(node1, config, ctx);
      aiUpscalingHandler.onAttach(node2, config, ctx);

      const state1 = node1.__aiUpscalingState as any;
      const state2 = node2.__aiUpscalingState as any;

      // Modify state1
      state1.output_texture = 'node1_texture';
      state1.processing_time = 1500;

      // state2 should be unaffected
      expect(state2.output_texture).toBeNull();
      expect(state2.processing_time).toBe(0);

      // Modify cache on node1
      state1.cache.set('test_key', { texture: 'test', timestamp: Date.now() });

      // node2 cache should still be empty
      expect(state2.cache.size).toBe(0);
    });

    it('should not share state between concurrent event processing', () => {
      const config = aiUpscalingHandler.defaultConfig;
      const node1 = {} as HSPlusNode;
      const node2 = {} as HSPlusNode;

      const ctx = { ...mockContext, emit: vi.fn() } as any;

      aiUpscalingHandler.onAttach(node1, config, ctx);
      aiUpscalingHandler.onAttach(node2, config, ctx);

      // Process event for node1
      const event1: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'result1',
        processingTime: 2000,
      };

      aiUpscalingHandler.onEvent(node1, config, ctx, event1);

      // Process event for node2
      const event2: TraitEvent = {
        type: 'ai_upscaling_result',
        texture: 'result2',
        processingTime: 3000,
      };

      aiUpscalingHandler.onEvent(node2, config, ctx, event2);

      const state1 = node1.__aiUpscalingState as any;
      const state2 = node2.__aiUpscalingState as any;

      expect(state1.output_texture).toBe('result1');
      expect(state1.processing_time).toBe(2000);

      expect(state2.output_texture).toBe('result2');
      expect(state2.processing_time).toBe(3000);
    });
  });

  describe('neural_upscaling alias handler', () => {
    it('should have correct alias name', () => {
      expect(neuralUpscalingHandler.name).toBe('neural_upscaling');
    });

    it('should default to swinir model', () => {
      expect(neuralUpscalingHandler.defaultConfig.upscale_model).toBe('swinir');
    });

    it('should preserve preserve_details default', () => {
      expect(neuralUpscalingHandler.defaultConfig.preserve_details).toBe(true);
    });

    it('should inherit other config defaults from main handler', () => {
      expect(neuralUpscalingHandler.defaultConfig.scale_factor).toBe(
        aiUpscalingHandler.defaultConfig.scale_factor
      );
      expect(neuralUpscalingHandler.defaultConfig.input_source).toBe(
        aiUpscalingHandler.defaultConfig.input_source
      );
    });

    it('should work with same lifecycle as main handler', () => {
      const node = {} as HSPlusNode;
      const ctx = { emit: vi.fn() } as any;

      expect(() => {
        neuralUpscalingHandler.onAttach(node, neuralUpscalingHandler.defaultConfig, ctx);
      }).not.toThrow();

      expect(node.__aiUpscalingState).toBeDefined();
    });
  });
});
