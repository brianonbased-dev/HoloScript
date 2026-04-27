/**
 * @ai_texture_gen Trait Test Suite
 *
 * Comprehensive tests for AI-driven procedural texture generation with
 * PBR material support, tiling, and asynchronous generation workflows.
 *
 * @module traits/__tests__
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { aiTextureGenHandler, type AiTextureGenConfig, type TextureStyle, type TextureResolution, type MaterialType } from './AiTextureGenTrait';

describe('AiTextureGenTrait', () => {
  let mockNode: Partial<HSPlusNode>;
  let mockContext: any;

  beforeEach(() => {
    mockNode = {
      id: 'test-textgen',
    };

    mockContext = {
      setState: vi.fn(),
      getState: vi.fn().mockReturnValue({}),
      emit: vi.fn(),
    };
  });

  describe('handler properties', () => {
    it('should have correct trait name', () => {
      expect(aiTextureGenHandler.name).toBe('ai_texture_gen');
    });

    it('should provide default configuration', () => {
      const defaultConfig = aiTextureGenHandler.defaultConfig;
      expect(defaultConfig.style).toBe('photorealistic');
      expect(defaultConfig.resolution).toBe(1024);
      expect(defaultConfig.seamless).toBe(true);
      expect(defaultConfig.tiling_factor).toBe(1.0);
      expect(defaultConfig.uv_space).toBe('object');
      expect(defaultConfig.material_type).toBe('pbr');
      expect(defaultConfig.generate_normal_map).toBe(true);
      expect(defaultConfig.generate_roughness_map).toBe(true);
    });

    it('should provide sensible defaults for all config fields', () => {
      const config = aiTextureGenHandler.defaultConfig;
      expect(config).toHaveProperty('style');
      expect(config).toHaveProperty('resolution');
      expect(config).toHaveProperty('seamless');
      expect(config).toHaveProperty('tiling_factor');
      expect(config).toHaveProperty('uv_space');
      expect(config).toHaveProperty('material_type');
      expect(config).toHaveProperty('generate_normal_map');
      expect(config).toHaveProperty('generate_roughness_map');
    });

    it('should expose lifecycle methods', () => {
      expect(typeof aiTextureGenHandler.onAttach).toBe('function');
      expect(typeof aiTextureGenHandler.onDetach).toBe('function');
      expect(typeof aiTextureGenHandler.onEvent).toBe('function');
    });
  });

  describe('lifecycle: onAttach', () => {
    it('should initialize texture generation state', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.setState).toHaveBeenCalled();
      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiTextureGen).toBeDefined();
    });

    it('should set isGenerating to false initially', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiTextureGen.isGenerating).toBe(false);
    });

    it('should initialize empty queue', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiTextureGen.queue).toEqual([]);
    });

    it('should initialize empty textures map', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiTextureGen.textures instanceof Map).toBe(true);
      expect(stateArg.aiTextureGen.textures.size).toBe(0);
    });

    it('should set activeTextureId to null initially', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiTextureGen.activeTextureId).toBeNull();
    });

    it('should initialize counters to zero', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      expect(stateArg.aiTextureGen.totalGenerated).toBe(0);
      expect(stateArg.aiTextureGen.avgGenTimeMs).toBe(0);
    });

    it('should emit texture_gen:ready event', () => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:ready', {
        style: 'photorealistic',
        resolution: 1024,
      });
    });

    it('should emit ready event with config style and resolution', () => {
      const config: AiTextureGenConfig = {
        ...aiTextureGenHandler.defaultConfig,
        style: 'stylized',
        resolution: 2048,
      };
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:ready', {
        style: 'stylized',
        resolution: 2048,
      });
    });
  });

  describe('lifecycle: onDetach', () => {
    beforeEach(() => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);
      mockContext.emit.mockClear();
    });

    it('should emit texture_gen:cancelled when generating', () => {
      const state = {
        aiTextureGen: {
          isGenerating: true,
          queue: [],
          textures: new Map(),
          activeTextureId: null,
          totalGenerated: 0,
          avgGenTimeMs: 0,
        },
      };
      mockContext.getState.mockReturnValue(state);

      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onDetach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:cancelled');
    });

    it('should not emit cancelled when not generating', () => {
      const state = {
        aiTextureGen: {
          isGenerating: false,
          queue: [],
          textures: new Map(),
          activeTextureId: null,
          totalGenerated: 0,
          avgGenTimeMs: 0,
        },
      };
      mockContext.getState.mockReturnValue(state);

      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onDetach(mockNode as HSPlusNode, config, mockContext);

      expect(mockContext.emit).not.toHaveBeenCalledWith('texture_gen:cancelled');
    });

    it('should handle missing state gracefully', () => {
      mockContext.getState.mockReturnValue({});

      const config = aiTextureGenHandler.defaultConfig;
      expect(() => {
        aiTextureGenHandler.onDetach(mockNode as HSPlusNode, config, mockContext);
      }).not.toThrow();
    });
  });

  describe('event handling: texture_gen:generate', () => {
    beforeEach(() => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should start generation when not generating', () => {
      const config = aiTextureGenHandler.defaultConfig;
      const event = { type: 'texture_gen:generate', payload: { prompt: 'marble texture' } };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'texture_gen:started',
        expect.objectContaining({ prompt: 'marble texture' })
      );
    });

    it('should queue generation when already generating', () => {
      const stateArg = mockContext.getState();
      stateArg.aiTextureGen.isGenerating = true;

      const config = aiTextureGenHandler.defaultConfig;
      const event = { type: 'texture_gen:generate', payload: { prompt: 'wood texture' } };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'texture_gen:queued',
        expect.objectContaining({ queueLength: 1 })
      );
    });

    it('should emit texture_gen:started with full context', () => {
      const config: AiTextureGenConfig = {
        ...aiTextureGenHandler.defaultConfig,
        style: 'fantasy',
        resolution: 512,
      };
      const event = {
        type: 'texture_gen:generate',
        payload: { prompt: 'fantasy stone', requestId: 'req123' },
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:started', {
        requestId: 'req123',
        prompt: 'fantasy stone',
        resolution: 512,
        style: 'fantasy',
      });
    });

    it('should generate requestId when not provided', () => {
      const config = aiTextureGenHandler.defaultConfig;
      vi.useFakeTimers();
      vi.setSystemTime(1000);

      const event = { type: 'texture_gen:generate', payload: { prompt: 'auto-id test' } };
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith(
        'texture_gen:started',
        expect.objectContaining({ requestId: 'req_1000' })
      );

      vi.useRealTimers();
    });

    it('should handle empty payload', () => {
      const config = aiTextureGenHandler.defaultConfig;
      const event = { type: 'texture_gen:generate', payload: {} };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:started', expect.any(Object));
    });

    it('should handle missing payload', () => {
      const config = aiTextureGenHandler.defaultConfig;
      const event = { type: 'texture_gen:generate' };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:started', expect.any(Object));
    });

    it('should allow multiple generations to queue', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      stateArg.aiTextureGen.isGenerating = true;

      for (let i = 0; i < 3; i++) {
        aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'texture_gen:generate',
          payload: { prompt: `texture_${i}`, requestId: `req_${i}` },
        } as any);
      }

      expect(stateArg.aiTextureGen.queue.length).toBe(3);
      expect(mockContext.emit).toHaveBeenCalledTimes(3);
    });
  });

  describe('event handling: texture_gen:complete', () => {
    beforeEach(() => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should add texture to textures map', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      const event = {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'tex123',
          prompt: 'marble',
          diffuseUrl: 'https://example.com/diffuse.png',
        },
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(stateArg.aiTextureGen.textures.has('tex123')).toBe(true);
    });

    it('should store complete texture data', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      const event = {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'tex456',
          prompt: 'wood texture',
          diffuseUrl: 'https://example.com/wood_diffuse.png',
          normalUrl: 'https://example.com/wood_normal.png',
          roughnessUrl: 'https://example.com/wood_roughness.png',
          elapsedMs: 5000,
        },
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      const texture = stateArg.aiTextureGen.textures.get('tex456');
      expect(texture?.prompt).toBe('wood texture');
      expect(texture?.diffuseUrl).toBe('https://example.com/wood_diffuse.png');
      expect(texture?.normalUrl).toBe('https://example.com/wood_normal.png');
      expect(texture?.roughnessUrl).toBe('https://example.com/wood_roughness.png');
    });

    it('should set active texture', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      const event = {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex789', diffuseUrl: 'url' },
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(stateArg.aiTextureGen.activeTextureId).toBe('tex789');
    });

    it('should set isGenerating to false', () => {
      const stateArg = mockContext.getState();
      stateArg.aiTextureGen.isGenerating = true;

      const config = aiTextureGenHandler.defaultConfig;
      const event = {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex', diffuseUrl: 'url' },
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(stateArg.aiTextureGen.isGenerating).toBe(false);
    });

    it('should increment total generated counter', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      for (let i = 0; i < 3; i++) {
        aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'texture_gen:complete',
          payload: { requestId: `tex_${i}`, diffuseUrl: 'url' },
        } as any);
      }

      expect(stateArg.aiTextureGen.totalGenerated).toBe(3);
    });

    it('should calculate average generation time', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex1', diffuseUrl: 'url', elapsedMs: 1000 },
      } as any);

      expect(stateArg.aiTextureGen.avgGenTimeMs).toBe(1000);

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex2', diffuseUrl: 'url', elapsedMs: 3000 },
      } as any);

      expect(stateArg.aiTextureGen.avgGenTimeMs).toBe(2000); // (1000 + 3000) / 2
    });

    it('should emit texture_gen:applied event', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      const event = {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'tex',
          diffuseUrl: 'https://example.com/diffuse.png',
          elapsedMs: 2500,
        },
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, event as any);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:applied', {
        textureId: 'tex',
        diffuseUrl: 'https://example.com/diffuse.png',
        elapsedMs: 2500,
      });
    });

    it('should process queue after completion', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      // Queue multiple requests
      stateArg.aiTextureGen.isGenerating = true;
      stateArg.aiTextureGen.queue = ['req_queued_1', 'req_queued_2'];

      mockContext.emit.mockClear();

      // Complete current generation
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex_current', diffuseUrl: 'url' },
      } as any);

      // Should start next from queue
      expect(mockContext.emit).toHaveBeenCalledWith(
        'texture_gen:started',
        expect.objectContaining({ requestId: 'req_queued_1' })
      );
      expect(stateArg.aiTextureGen.queue.length).toBe(1);
    });

    it('should respect generate_normal_map config', () => {
      const stateArg = mockContext.getState();
      const config: AiTextureGenConfig = {
        ...aiTextureGenHandler.defaultConfig,
        generate_normal_map: false,
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'tex_no_normal',
          diffuseUrl: 'url',
          normalUrl: 'https://example.com/normal.png',
        },
      } as any);

      const texture = stateArg.aiTextureGen.textures.get('tex_no_normal');
      expect(texture?.normalUrl).toBeNull();
    });

    it('should respect generate_roughness_map config', () => {
      const stateArg = mockContext.getState();
      const config: AiTextureGenConfig = {
        ...aiTextureGenHandler.defaultConfig,
        generate_roughness_map: false,
      };

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'tex_no_rough',
          diffuseUrl: 'url',
          roughnessUrl: 'https://example.com/roughness.png',
        },
      } as any);

      const texture = stateArg.aiTextureGen.textures.get('tex_no_rough');
      expect(texture?.roughnessUrl).toBeNull();
    });

    it('should handle missing payload gracefully', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
      } as any);

      expect(stateArg.aiTextureGen.totalGenerated).toBe(1);
    });
  });

  describe('event handling: texture_gen:apply', () => {
    beforeEach(() => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should apply existing texture', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      // Add a texture first
      stateArg.aiTextureGen.textures.set('tex_existing', {
        id: 'tex_existing',
        prompt: 'stone',
        diffuseUrl: 'url',
        normalUrl: null,
        roughnessUrl: null,
        generatedAt: Date.now(),
      });

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:apply',
        payload: { textureId: 'tex_existing' },
      } as any);

      expect(stateArg.aiTextureGen.activeTextureId).toBe('tex_existing');
    });

    it('should emit texture_gen:applied when applying', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      stateArg.aiTextureGen.textures.set('tex_to_apply', {
        id: 'tex_to_apply',
        prompt: 'brick',
        diffuseUrl: 'url',
        normalUrl: null,
        roughnessUrl: null,
        generatedAt: Date.now(),
      });

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:apply',
        payload: { textureId: 'tex_to_apply' },
      } as any);

      expect(mockContext.emit).toHaveBeenCalledWith('texture_gen:applied', {
        textureId: 'tex_to_apply',
      });
    });

    it('should not apply non-existent texture', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      stateArg.aiTextureGen.activeTextureId = null;

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:apply',
        payload: { textureId: 'nonexistent' },
      } as any);

      expect(stateArg.aiTextureGen.activeTextureId).toBeNull();
      expect(mockContext.emit).not.toHaveBeenCalled();
    });

    it('should handle missing textureId', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      stateArg.aiTextureGen.activeTextureId = 'some_texture';

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:apply',
        payload: {},
      } as any);

      expect(stateArg.aiTextureGen.activeTextureId).toBe('some_texture'); // Unchanged
      expect(mockContext.emit).not.toHaveBeenCalled();
    });

    it('should handle missing payload', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:apply',
      } as any);

      expect(mockContext.emit).not.toHaveBeenCalled();
    });
  });

  describe('event handling: unknown events', () => {
    beforeEach(() => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should ignore unknown event types', () => {
      const stateArg = mockContext.getState();
      const config = aiTextureGenHandler.defaultConfig;
      const stateSnapshot = JSON.parse(JSON.stringify({
        isGenerating: stateArg.aiTextureGen.isGenerating,
        queue: stateArg.aiTextureGen.queue,
        totalGenerated: stateArg.aiTextureGen.totalGenerated,
      }));

      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'unknown:event',
      } as any);

      expect(stateArg.aiTextureGen.isGenerating).toBe(stateSnapshot.isGenerating);
      expect(stateArg.aiTextureGen.queue).toEqual(stateSnapshot.queue);
      expect(mockContext.emit).not.toHaveBeenCalled();
    });

    it('should handle missing state gracefully', () => {
      mockContext.getState.mockReturnValue({});
      const config = aiTextureGenHandler.defaultConfig;

      expect(() => {
        aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'texture_gen:generate',
          payload: { prompt: 'test' },
        } as any);
      }).not.toThrow();
    });
  });

  describe('configuration variations', () => {
    it('should support all texture styles', () => {
      const styles: TextureStyle[] = ['photorealistic', 'stylized', 'cartoon', 'sci-fi', 'fantasy', 'abstract'];

      for (const style of styles) {
        mockContext.emit.mockClear();
        const config: AiTextureGenConfig = {
          ...aiTextureGenHandler.defaultConfig,
          style,
        };

        aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

        expect(mockContext.emit).toHaveBeenCalledWith(
          'texture_gen:ready',
          expect.objectContaining({ style })
        );
      }
    });

    it('should support all texture resolutions', () => {
      const resolutions: TextureResolution[] = [256, 512, 1024, 2048, 4096];

      for (const resolution of resolutions) {
        mockContext.emit.mockClear();
        const config: AiTextureGenConfig = {
          ...aiTextureGenHandler.defaultConfig,
          resolution,
        };

        aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

        expect(mockContext.emit).toHaveBeenCalledWith(
          'texture_gen:ready',
          expect.objectContaining({ resolution })
        );
      }
    });

    it('should support all material types', () => {
      const materialTypes: MaterialType[] = ['diffuse', 'pbr', 'emissive', 'transparent'];

      for (const materialType of materialTypes) {
        const config: AiTextureGenConfig = {
          ...aiTextureGenHandler.defaultConfig,
          material_type: materialType,
        };

        expect(config.material_type).toBe(materialType);
      }
    });

    it('should support all uv_space options', () => {
      const uvSpaces = ['object', 'world', 'triplanar'];

      for (const space of uvSpaces) {
        const config: AiTextureGenConfig = {
          ...aiTextureGenHandler.defaultConfig,
          uv_space: space as any,
        };

        expect(config.uv_space).toBe(space);
      }
    });

    it('should support tiling_factor range', () => {
      const factors = [0.5, 1.0, 2.0, 4.0, 10.0];

      for (const factor of factors) {
        const config: AiTextureGenConfig = {
          ...aiTextureGenHandler.defaultConfig,
          tiling_factor: factor,
        };

        expect(config.tiling_factor).toBe(factor);
      }
    });

    it('should handle all boolean flag combinations', () => {
      const combinations = [
        { normal: true, roughness: true },
        { normal: true, roughness: false },
        { normal: false, roughness: true },
        { normal: false, roughness: false },
      ];

      for (const combo of combinations) {
        const config: AiTextureGenConfig = {
          ...aiTextureGenHandler.defaultConfig,
          generate_normal_map: combo.normal,
          generate_roughness_map: combo.roughness,
        };

        expect(config.generate_normal_map).toBe(combo.normal);
        expect(config.generate_roughness_map).toBe(combo.roughness);
      }
    });
  });

  describe('state management', () => {
    it('should maintain independent state for each node', () => {
      const node1: Partial<HSPlusNode> = { id: 'node1' };
      const node2: Partial<HSPlusNode> = { id: 'node2' };

      const ctx1 = { setState: vi.fn(), getState: vi.fn(), emit: vi.fn() };
      const ctx2 = { setState: vi.fn(), getState: vi.fn(), emit: vi.fn() };

      const config = aiTextureGenHandler.defaultConfig;

      aiTextureGenHandler.onAttach(node1 as HSPlusNode, config, ctx1);
      aiTextureGenHandler.onAttach(node2 as HSPlusNode, config, ctx2);

      const state1Arg = ctx1.setState.mock.calls[0][0];
      const state2Arg = ctx2.setState.mock.calls[0][0];

      expect(state1Arg.aiTextureGen).not.toBe(state2Arg.aiTextureGen);
    });

    it('should track multiple textures independently', () => {
      const stateArg = mockContext.getState();
      mockContext.getState.mockReturnValue({
        aiTextureGen: {
          isGenerating: false,
          queue: [],
          textures: new Map(),
          activeTextureId: null,
          totalGenerated: 0,
          avgGenTimeMs: 0,
        },
      });

      const config = aiTextureGenHandler.defaultConfig;

      for (let i = 0; i < 5; i++) {
        aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'texture_gen:complete',
          payload: {
            requestId: `tex_${i}`,
            diffuseUrl: `url_${i}`,
          },
        } as any);
      }

      const stateArg2 = mockContext.getState();
      expect(stateArg2.aiTextureGen.textures.size).toBe(5);
    });
  });

  describe('complex workflows', () => {
    beforeEach(() => {
      const config = aiTextureGenHandler.defaultConfig;
      aiTextureGenHandler.onAttach(mockNode as HSPlusNode, config, mockContext);

      const stateArg = mockContext.setState.mock.calls[0][0];
      mockContext.getState.mockReturnValue(stateArg);
      mockContext.emit.mockClear();
    });

    it('should handle generate → complete → generate → apply workflow', () => {
      const config = aiTextureGenHandler.defaultConfig;
      const state = mockContext.getState().aiTextureGen;

      // Generate texture 1
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:generate',
        payload: { prompt: 'texture1', requestId: 'req1' },
      } as any);
      expect(state.isGenerating).toBe(true);

      // Complete texture 1
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex1', diffuseUrl: 'url1' },
      } as any);
      expect(state.activeTextureId).toBe('tex1');
      expect(state.totalGenerated).toBe(1);

      // Generate texture 2
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:generate',
        payload: { prompt: 'texture2', requestId: 'req2' },
      } as any);

      // Apply texture 1
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:apply',
        payload: { textureId: 'tex1' },
      } as any);
      expect(state.activeTextureId).toBe('tex1');
    });

    it('should handle queue overflow with proper FIFO ordering', () => {
      const config = aiTextureGenHandler.defaultConfig;
      const state = mockContext.getState().aiTextureGen;

      // Start generating
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:generate',
        payload: { requestId: 'req0' },
      } as any);
      expect(state.isGenerating).toBe(true);

      // Queue more requests
      for (let i = 1; i <= 3; i++) {
        aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'texture_gen:generate',
          payload: { requestId: `req${i}` },
        } as any);
      }

      expect(state.queue).toEqual(['req1', 'req2', 'req3']);

      // Complete current
      aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
        type: 'texture_gen:complete',
        payload: { requestId: 'tex0' },
      } as any);

      // Next should be req1
      expect(mockContext.emit).toHaveBeenCalledWith(
        'texture_gen:started',
        expect.objectContaining({ requestId: 'req1' })
      );
      expect(state.queue).toEqual(['req2', 'req3']);
    });

    it('should calculate running average generation time correctly', () => {
      const config = aiTextureGenHandler.defaultConfig;
      const state = mockContext.getState().aiTextureGen;

      const times = [1000, 2000, 3000, 4000, 5000];

      for (let i = 0; i < times.length; i++) {
        aiTextureGenHandler.onEvent(mockNode as HSPlusNode, config, mockContext, {
          type: 'texture_gen:complete',
          payload: { requestId: `tex${i}`, diffuseUrl: 'url', elapsedMs: times[i] },
        } as any);
      }

      const expected = times.reduce((a, b) => a + b, 0) / times.length;
      expect(state.avgGenTimeMs).toBe(expected);
    });
  });
});
