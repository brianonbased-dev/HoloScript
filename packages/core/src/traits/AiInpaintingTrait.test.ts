/**
 * @ai_inpainting Trait Test Suite
 *
 * Comprehensive tests for AI-driven inpainting trait with mask-based
 * diffusion model integration for seamless content generation.
 *
 * @module traits/__tests__
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { aiInpaintingHandler, type AiInpaintingConfig, type InpaintModel, type MaskSource, type BlendMode } from './AiInpaintingTrait';

describe('AiInpaintingTrait', () => {
  let mockNode: Partial<HSPlusNode>;
  let mockContext: any;

  beforeEach(() => {
    mockNode = {
      id: 'test-inpainting',
    };

    mockContext = {
      setState: vi.fn(),
      getState: vi.fn().mockReturnValue({}),
      emit: vi.fn(),
    };
  });

  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(aiInpaintingHandler.name).toBe('ai_inpainting');
    });

    it('should provide default configuration', () => {
      const defaultConfig = aiInpaintingHandler.defaultConfig;
      expect(defaultConfig.model).toBe('sd-inpaint');
      expect(defaultConfig.mask_source).toBe('manual');
      expect(defaultConfig.blend_mode).toBe('seamless');
      expect(defaultConfig.strength).toBe(0.8);
      expect(defaultConfig.padding).toBe(16);
      expect(defaultConfig.guidance_scale).toBe(7.5);
      expect(defaultConfig.steps).toBe(20);
      expect(defaultConfig.preserve_original_on_mask_clear).toBe(true);
    });

    it('should expose lifecycle methods', () => {
      expect(typeof aiInpaintingHandler.onAttach).toBe('function');
      expect(typeof aiInpaintingHandler.onDetach).toBe('function');
      expect(typeof aiInpaintingHandler.onEvent).toBe('function');
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize inpainting state', () => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.setState).toHaveBeenCalled();
      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiInpainting).toBeDefined();
    });

    it('should set isProcessing to false initially', () => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiInpainting.isProcessing).toBe(false);
    });

    it('should initialize activeMask as null', () => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiInpainting.activeMask).toBeNull();
    });

    it('should initialize empty regions map', () => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiInpainting.regions instanceof Map).toBe(true);
      expect(stateArg.aiInpainting.regions.size).toBe(0);
    });

    it('should initialize counters to zero', () => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiInpainting.totalInpaints).toBe(0);
      expect(stateArg.aiInpainting.avgProcessTimeMs).toBe(0);
      expect(stateArg.aiInpainting.lastResultUrl).toBeNull();
    });

    it('should emit inpainting:ready event with model and blend_mode', () => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:ready', {
        model: 'sd-inpaint',
        blend_mode: 'seamless',
      });
    });

    it('should emit ready event with correct config values', () => {
      const config: AiInpaintingConfig = {
        ...aiInpaintingHandler.defaultConfig,
        model: 'flux-fill',
        blend_mode: 'feathered',
      };
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:ready', {
        model: 'flux-fill',
        blend_mode: 'feathered',
      });
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should emit inpainting:cancelled when processing', () => {
      const state = mockContext.getState();
      state.aiInpainting.isProcessing = true;

      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onDetach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:cancelled');
    });

    it('should not emit cancelled when not processing', () => {
      const state = mockContext.getState();
      state.aiInpainting.isProcessing = false;

      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onDetach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).not.toHaveBeenCalledWith('inpainting:cancelled');
    });

    it('should handle missing state gracefully', () => {
      mockContext.getState.mockReturnValue({});

      const config = aiInpaintingHandler.defaultConfig;
      expect(() => {
        aiInpaintingHandler.onDetach(mockNode as HSPlusNode, config, mockContext);
      }).not.toThrow();
    });
  });

  describe('event handling: inpainting:set_mask', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should set activeMask from payload', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;
      const maskData = 'data:image/png;base64,iVBORw0KGgo...';
      const event = { type: 'inpainting:set_mask', payload: { maskData } };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(state.aiInpainting.activeMask).toBe(maskData);
    });

    it('should emit inpainting:mask_set with hasMask true', () => {
      const config = aiInpaintingHandler.defaultConfig;
      const maskData = 'base64_encoded_mask';
      const event = { type: 'inpainting:set_mask', payload: { maskData } };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:mask_set', {
        hasMask: true,
        source: 'manual',
      });
    });

    it('should emit mask_set with correct source from config', () => {
      const config: AiInpaintingConfig = {
        ...aiInpaintingHandler.defaultConfig,
        mask_source: 'depth_threshold',
      };
      const event = { type: 'inpainting:set_mask', payload: { maskData: 'mask' } };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'inpainting:mask_set',
        expect.objectContaining({ source: 'depth_threshold' })
      );
    });

    it('should handle null maskData', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;
      const event = { type: 'inpainting:set_mask', payload: { maskData: null } };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(state.aiInpainting.activeMask).toBeNull();
      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:mask_set', {
        hasMask: false,
        source: 'manual',
      });
    });

    it('should handle missing payload', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;
      const event = { type: 'inpainting:set_mask' };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(state.aiInpainting.activeMask).toBeNull();
    });

    it('should allow overwriting existing mask', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask1' },
      } as any);
      expect(state.aiInpainting.activeMask).toBe('mask1');

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask2' },
      } as any);
      expect(state.aiInpainting.activeMask).toBe('mask2');
    });
  });

  describe('event handling: inpainting:process', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should emit error when no mask is set', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      expect(state.aiInpainting.activeMask).toBeNull();

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { prompt: 'fill gaps' },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:error', {
        message: 'No mask set',
      });
    });

    it('should start processing when mask is set', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      // Set mask first
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask_data' },
      } as any);

      mockContext.emit.mockClear();

      // Process
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'region1', prompt: 'brick wall' },
      } as any);

      expect(state.aiInpainting.isProcessing).toBe(true);
    });

    it('should create region with correct data', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask_base64' },
      } as any);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'reg123', prompt: 'stone floor' },
      } as any);

      const region = state.aiInpainting.regions.get('reg123');
      expect(region).toBeDefined();
      expect(region?.prompt).toBe('stone floor');
      expect(region?.maskData).toBe('mask_base64');
      expect(region?.resultUrl).toBeNull();
      expect(region?.appliedAt).toBeNull();
    });

    it('should emit inpainting:started with full context', () => {
      const config: AiInpaintingConfig = {
        ...aiInpaintingHandler.defaultConfig,
        model: 'flux-fill',
        strength: 0.9,
      };

      // Set mask
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      } as any);

      mockContext.emit.mockClear();

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'reg_test', prompt: 'detailed texture' },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:started', {
        regionId: 'reg_test',
        prompt: 'detailed texture',
        model: 'flux-fill',
        strength: 0.9,
      });
    });

    it('should generate regionId when not provided', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      } as any);

      vi.useFakeTimers();
      vi.setSystemTime(5000);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { prompt: 'auto-region' },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'inpainting:started',
        expect.objectContaining({ regionId: 'region_5000' })
      );

      vi.useRealTimers();
    });

    it('should handle empty prompt', () => {
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      } as any);

      mockContext.emit.mockClear();

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'reg_noprompt' },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'inpainting:started',
        expect.objectContaining({ prompt: '' })
      );
    });

    it('should support multiple regions', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      } as any);

      for (let i = 1; i <= 3; i++) {
        aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'inpainting:process',
          payload: { regionId: `reg_${i}`, prompt: `region_${i}` },
        } as any);
      }

      expect(state.aiInpainting.regions.size).toBe(3);
      expect(state.aiInpainting.regions.has('reg_1')).toBe(true);
      expect(state.aiInpainting.regions.has('reg_2')).toBe(true);
      expect(state.aiInpainting.regions.has('reg_3')).toBe(true);
    });
  });

  describe('event handling: inpainting:complete', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);

      // Pre-set a mask and start processing
      const state = stateArg;
      state.aiInpainting.activeMask = 'mask_data';
      state.aiInpainting.isProcessing = true;
      state.aiInpainting.regions.set('reg_test', {
        id: 'reg_test',
        maskData: 'mask_data',
        prompt: 'test prompt',
        resultUrl: null,
        appliedAt: null,
      });

      mockContext.emit.mockClear();
    });

    it('should update region with result URL', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;
      const resultUrl = 'https://example.com/inpaint_result.png';

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { regionId: 'reg_test', resultUrl, elapsedMs: 2000 },
      } as any);

      const region = state.aiInpainting.regions.get('reg_test');
      expect(region?.resultUrl).toBe(resultUrl);
      expect(region?.appliedAt).not.toBeNull();
    });

    it('should set isProcessing to false', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      expect(state.aiInpainting.isProcessing).toBe(true);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { regionId: 'reg_test', resultUrl: 'url' },
      } as any);

      expect(state.aiInpainting.isProcessing).toBe(false);
    });

    it('should update lastResultUrl', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;
      const resultUrl = 'https://example.com/result.png';

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { regionId: 'reg_test', resultUrl },
      } as any);

      expect(state.aiInpainting.lastResultUrl).toBe(resultUrl);
    });

    it('should increment totalInpaints', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      expect(state.aiInpainting.totalInpaints).toBe(0);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { regionId: 'reg_test' },
      } as any);

      expect(state.aiInpainting.totalInpaints).toBe(1);
    });

    it('should calculate average process time', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { regionId: 'reg_test', elapsedMs: 1000 },
      } as any);

      expect(state.aiInpainting.avgProcessTimeMs).toBe(1000);

      // Add another region and complete it
      state.aiInpainting.activeMask = 'mask';
      state.aiInpainting.regions.set('reg_test2', {
        id: 'reg_test2',
        maskData: 'mask',
        prompt: 'test',
        resultUrl: null,
        appliedAt: null,
      });

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { regionId: 'reg_test2', elapsedMs: 3000 },
      } as any);

      expect(state.aiInpainting.avgProcessTimeMs).toBe(2000); // (1000 + 3000) / 2
    });

    it('should emit inpainting:result with blend_mode', () => {
      const config: AiInpaintingConfig = {
        ...aiInpaintingHandler.defaultConfig,
        blend_mode: 'feathered',
      };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: {
          regionId: 'reg_test',
          resultUrl: 'https://example.com/result.png',
          elapsedMs: 2500,
        },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:result', {
        regionId: 'reg_test',
        resultUrl: 'https://example.com/result.png',
        blend_mode: 'feathered',
        elapsedMs: 2500,
      });
    });

    it('should handle missing regionId', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: { resultUrl: 'url', elapsedMs: 1000 },
      } as any);

      expect(state.aiInpainting.totalInpaints).toBe(1);
      expect(mockContext.emit).toHaveBeenCalled();
    });

    it('should handle missing payload', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
      } as any);

      expect(state.aiInpainting.totalInpaints).toBe(1);
      expect(state.aiInpainting.lastResultUrl).toBeNull();
    });
  });

  describe('event handling: inpainting:clear_mask', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);

      // Set a mask first
      stateArg.aiInpainting.activeMask = 'mask_data';
      mockContext.emit.mockClear();
    });

    it('should clear activeMask', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      expect(state.aiInpainting.activeMask).not.toBeNull();

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:clear_mask',
      } as any);

      expect(state.aiInpainting.activeMask).toBeNull();
    });

    it('should emit inpainting:original_restored when preserve_original_on_mask_clear is true', () => {
      const config: AiInpaintingConfig = {
        ...aiInpaintingHandler.defaultConfig,
        preserve_original_on_mask_clear: true,
      };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:clear_mask',
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:original_restored');
    });

    it('should not emit original_restored when preserve_original_on_mask_clear is false', () => {
      const config: AiInpaintingConfig = {
        ...aiInpaintingHandler.defaultConfig,
        preserve_original_on_mask_clear: false,
      };

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:clear_mask',
      } as any);

      expect(mockContext.emit).not.toHaveBeenCalledWith('inpainting:original_restored');
    });
  });

  describe('event handling: inpainting:error', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);

      stateArg.aiInpainting.isProcessing = true;
      mockContext.emit.mockClear();
    });

    it('should set isProcessing to false on error', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;

      expect(state.aiInpainting.isProcessing).toBe(true);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:error',
        payload: { message: 'GPU memory exhausted' },
      } as any);

      expect(state.aiInpainting.isProcessing).toBe(false);
    });

    it('should emit inpainting:error with custom message', () => {
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:error',
        payload: { message: 'Model loading failed' },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:error', {
        message: 'Model loading failed',
      });
    });

    it('should emit default error message when none provided', () => {
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:error',
        payload: {},
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:error', {
        message: 'Inpainting failed',
      });
    });

    it('should handle missing payload', () => {
      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:error',
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('inpainting:error', {
        message: 'Inpainting failed',
      });
    });
  });

  describe('event handling: unknown events', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should ignore unknown event types', () => {
      const state = mockContext.getState();
      const config = aiInpaintingHandler.defaultConfig;
      const stateSnapshot = JSON.parse(
        JSON.stringify({
          isProcessing: state.aiInpainting.isProcessing,
          activeMask: state.aiInpainting.activeMask,
        })
      );

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'unknown:event',
      } as any);

      expect(state.aiInpainting.isProcessing).toBe(stateSnapshot.isProcessing);
      expect(state.aiInpainting.activeMask).toBe(stateSnapshot.activeMask);
      expect(mockContext.emit).not.toHaveBeenCalled();
    });
  });

  describe('configuration variations', () => {
    it('should support all inpaint models', () => {
      const models: InpaintModel[] = ['sd-inpaint', 'flux-fill', 'dalle-edit', 'lama'];

      for (const model of models) {
        mockContext.emit.mockClear();
        const config: AiInpaintingConfig = {
          ...aiInpaintingHandler.defaultConfig,
          model,
        };

        aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

        expect(mockContext.emit).toHaveBeenCalledWith(
          'inpainting:ready',
          expect.objectContaining({ model })
        );
      }
    });

    it('should support all mask sources', () => {
      const sources: MaskSource[] = ['manual', 'depth_threshold', 'segmentation', 'selection'];

      for (const source of sources) {
        const config: AiInpaintingConfig = {
          ...aiInpaintingHandler.defaultConfig,
          mask_source: source,
        };

        expect(config.mask_source).toBe(source);
      }
    });

    it('should support all blend modes', () => {
      const modes: BlendMode[] = ['seamless', 'hard', 'feathered', 'alpha'];

      for (const mode of modes) {
        mockContext.emit.mockClear();
        const config: AiInpaintingConfig = {
          ...aiInpaintingHandler.defaultConfig,
          blend_mode: mode,
        };

        aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

        expect(mockContext.emit).toHaveBeenCalledWith(
          'inpainting:ready',
          expect.objectContaining({ blend_mode: mode })
        );
      }
    });

    it('should support numeric configuration ranges', () => {
      const configs = [
        { strength: 0, padding: 0, guidance_scale: 1, steps: 1 },
        { strength: 0.5, padding: 8, guidance_scale: 7.5, steps: 20 },
        { strength: 1, padding: 64, guidance_scale: 20, steps: 50 },
      ];

      for (const overrides of configs) {
        const config: AiInpaintingConfig = {
          ...aiInpaintingHandler.defaultConfig,
          ...overrides,
        };

        expect(config.strength).toBe(overrides.strength);
        expect(config.padding).toBe(overrides.padding);
        expect(config.guidance_scale).toBe(overrides.guidance_scale);
        expect(config.steps).toBe(overrides.steps);
      }
    });

    it('should support preserve_original_on_mask_clear variations', () => {
      for (const preserve of [true, false]) {
        const config: AiInpaintingConfig = {
          ...aiInpaintingHandler.defaultConfig,
          preserve_original_on_mask_clear: preserve,
        };

        expect(config.preserve_original_on_mask_clear).toBe(preserve);
      }
    });
  });

  describe('complex workflows', () => {
    beforeEach(() => {
      const config = aiInpaintingHandler.defaultConfig;
      aiInpaintingHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should handle full inpainting workflow', () => {
      const config = aiInpaintingHandler.defaultConfig;
      const state = mockContext.getState().aiInpainting;

      // Set mask
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask_base64' },
      } as any);
      expect(state.activeMask).not.toBeNull();

      mockContext.emit.mockClear();

      // Process region
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'reg1', prompt: 'fill with marble' },
      } as any);
      expect(state.isProcessing).toBe(true);

      // Complete
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:complete',
        payload: {
          regionId: 'reg1',
          resultUrl: 'https://example.com/result.png',
          elapsedMs: 3000,
        },
      } as any);
      expect(state.isProcessing).toBe(false);
      expect(state.totalInpaints).toBe(1);
      expect(state.lastResultUrl).toBe('https://example.com/result.png');

      // Clear mask
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:clear_mask',
      } as any);
      expect(state.activeMask).toBeNull();
    });

    it('should handle multi-region inpainting', () => {
      const config = aiInpaintingHandler.defaultConfig;
      const state = mockContext.getState().aiInpainting;

      // Set mask
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      } as any);

      // Process multiple regions sequentially
      for (let i = 1; i <= 3; i++) {
        aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'inpainting:process',
          payload: { regionId: `reg_${i}`, prompt: `region_${i}` },
        } as any);

        aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'inpainting:complete',
          payload: { regionId: `reg_${i}`, elapsedMs: 2000 + i * 500 },
        } as any);
      }

      expect(state.totalInpaints).toBe(3);
      expect(state.regions.size).toBe(3);
      // Average should be calculated from process times
      expect(state.avgProcessTimeMs).toBeGreaterThanOrEqual(2000);
      expect(state.avgProcessTimeMs).toBeLessThanOrEqual(3000);
    });

    it('should handle error recovery workflow', () => {
      const config = aiInpaintingHandler.defaultConfig;
      const state = mockContext.getState().aiInpainting;

      // Set mask and process
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'mask' },
      } as any);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'reg_err', prompt: 'test' },
      } as any);

      expect(state.isProcessing).toBe(true);

      // Error occurs
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:error',
        payload: { message: 'CUDA out of memory' },
      } as any);

      expect(state.isProcessing).toBe(false);

      // Can retry with same or new mask
      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'new_mask' },
      } as any);

      aiInpaintingHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'inpainting:process',
        payload: { regionId: 'reg_retry', prompt: 'retry' },
      } as any);

      expect(state.isProcessing).toBe(true);
    });
  });

  describe('state isolation', () => {
    it('should maintain independent state for each node', () => {
      const node1: Partial<HSPlusNode> = { id: 'node1' };
      const node2: Partial<HSPlusNode> = { id: 'node2' };

      const ctx1 = { setState: vi.fn(), getState: vi.fn(), emit: vi.fn() };
      const ctx2 = { setState: vi.fn(), getState: vi.fn(), emit: vi.fn() };

      const config = aiInpaintingHandler.defaultConfig;

      aiInpaintingHandler.onAttach(node1 as HSPlusNode, config, ctx1);
      aiInpaintingHandler.onAttach(node2 as HSPlusNode, config, ctx2);

      const state1 = ctx1.setState.mock.calls[0][0];
      const state2 = ctx2.setState.mock.calls[0][0];

      expect(state1.aiInpainting).not.toBe(state2.aiInpainting);
      expect(state1.aiInpainting.regions).not.toBe(state2.aiInpainting.regions);
    });
  });
});
