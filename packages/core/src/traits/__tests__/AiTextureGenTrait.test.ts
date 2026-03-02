/**
 * AiTextureGenTrait Tests
 *
 * Tests for AI texture generation trait covering initialization,
 * generation workflow, queue management, texture application, and cleanup.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { aiTextureGenHandler } from '../AiTextureGenTrait';
import type { AiTextureGenConfig } from '../AiTextureGenTrait';
import { createMockNode } from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Extended mock context with setState/getState
// ---------------------------------------------------------------------------

interface StatefulMockContext {
  emit: (event: string, data: unknown) => void;
  emittedEvents: Array<{ event: string; data: unknown }>;
  clearEvents: () => void;
  getState: () => Record<string, unknown>;
  setState: (updates: Record<string, unknown>) => void;
}

function createStatefulMockContext(): StatefulMockContext {
  const emittedEvents: Array<{ event: string; data: unknown }> = [];
  let state: Record<string, unknown> = {};
  return {
    emit(event: string, data: unknown) {
      emittedEvents.push({ event, data });
    },
    emittedEvents,
    clearEvents() {
      emittedEvents.length = 0;
    },
    getState() {
      return state;
    },
    setState(updates: Record<string, unknown>) {
      state = { ...state, ...updates };
    },
  };
}

function getLastEvent(ctx: StatefulMockContext, eventType: string) {
  for (let i = ctx.emittedEvents.length - 1; i >= 0; i--) {
    if (ctx.emittedEvents[i].event === eventType) {
      return ctx.emittedEvents[i].data;
    }
  }
  return undefined;
}

function getEventCount(ctx: StatefulMockContext, eventType: string): number {
  return ctx.emittedEvents.filter((e) => e.event === eventType).length;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AiTextureGenTrait', () => {
  let node: Record<string, unknown>;
  let ctx: StatefulMockContext;
  const defaultConfig = aiTextureGenHandler.defaultConfig;

  beforeEach(() => {
    node = createMockNode('texgen-node');
    ctx = createStatefulMockContext();
    aiTextureGenHandler.onAttach!(node as any, defaultConfig, ctx as any);
  });

  // =========================================================================
  // Default config
  // =========================================================================

  describe('default config', () => {
    it('uses photorealistic style', () => {
      expect(defaultConfig.style).toBe('photorealistic');
    });

    it('defaults to 1024 resolution', () => {
      expect(defaultConfig.resolution).toBe(1024);
    });

    it('enables seamless tiling', () => {
      expect(defaultConfig.seamless).toBe(true);
    });

    it('uses object UV space', () => {
      expect(defaultConfig.uv_space).toBe('object');
    });

    it('generates normal and roughness maps', () => {
      expect(defaultConfig.generate_normal_map).toBe(true);
      expect(defaultConfig.generate_roughness_map).toBe(true);
    });

    it('material type defaults to pbr', () => {
      expect(defaultConfig.material_type).toBe('pbr');
    });
  });

  // =========================================================================
  // onAttach
  // =========================================================================

  describe('onAttach', () => {
    it('initializes aiTextureGen state', () => {
      const state = ctx.getState().aiTextureGen as any;
      expect(state).toBeDefined();
      expect(state.isGenerating).toBe(false);
      expect(state.queue).toEqual([]);
      expect(state.totalGenerated).toBe(0);
      expect(state.activeTextureId).toBeNull();
    });

    it('emits texture_gen:ready with style and resolution', () => {
      expect(getEventCount(ctx, 'texture_gen:ready')).toBe(1);
      const data = getLastEvent(ctx, 'texture_gen:ready') as any;
      expect(data.style).toBe('photorealistic');
      expect(data.resolution).toBe(1024);
    });
  });

  // =========================================================================
  // onDetach
  // =========================================================================

  describe('onDetach', () => {
    it('emits texture_gen:cancelled when generating', () => {
      const state = ctx.getState().aiTextureGen as any;
      state.isGenerating = true;

      ctx.clearEvents();
      aiTextureGenHandler.onDetach!(node as any, defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'texture_gen:cancelled')).toBe(1);
    });

    it('does not emit when idle', () => {
      ctx.clearEvents();
      aiTextureGenHandler.onDetach!(node as any, defaultConfig, ctx as any);
      expect(getEventCount(ctx, 'texture_gen:cancelled')).toBe(0);
    });
  });

  // =========================================================================
  // texture_gen:generate event
  // =========================================================================

  describe('texture_gen:generate', () => {
    it('starts generation when idle', () => {
      ctx.clearEvents();
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { prompt: 'brick wall', requestId: 'req1' },
      });

      const state = ctx.getState().aiTextureGen as any;
      expect(state.isGenerating).toBe(true);
      expect(getEventCount(ctx, 'texture_gen:started')).toBe(1);
      const data = getLastEvent(ctx, 'texture_gen:started') as any;
      expect(data.prompt).toBe('brick wall');
      expect(data.requestId).toBe('req1');
    });

    it('queues request when already generating', () => {
      // Start first generation
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { prompt: 'wood', requestId: 'first' },
      });
      ctx.clearEvents();

      // Second request should be queued
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { prompt: 'metal', requestId: 'second' },
      });

      const state = ctx.getState().aiTextureGen as any;
      expect(state.queue).toHaveLength(1);
      expect(state.queue[0]).toBe('second');
      expect(getEventCount(ctx, 'texture_gen:queued')).toBe(1);
    });
  });

  // =========================================================================
  // texture_gen:complete event
  // =========================================================================

  describe('texture_gen:complete', () => {
    it('stores generated texture and updates state', () => {
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { prompt: 'stone', requestId: 'tex1' },
      });
      ctx.clearEvents();

      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'tex1',
          prompt: 'stone',
          diffuseUrl: 'https://cdn.example.com/stone_diffuse.png',
          normalUrl: 'https://cdn.example.com/stone_normal.png',
          roughnessUrl: 'https://cdn.example.com/stone_rough.png',
          elapsedMs: 3000,
        },
      });

      const state = ctx.getState().aiTextureGen as any;
      expect(state.isGenerating).toBe(false);
      expect(state.totalGenerated).toBe(1);
      expect(state.activeTextureId).toBe('tex1');

      const texture = state.textures.get('tex1');
      expect(texture).toBeDefined();
      expect(texture.diffuseUrl).toBe('https://cdn.example.com/stone_diffuse.png');
    });

    it('emits texture_gen:applied', () => {
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { requestId: 'r1' },
      });
      ctx.clearEvents();

      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:complete',
        payload: { requestId: 'r1', diffuseUrl: 'url', elapsedMs: 100 },
      });

      expect(getEventCount(ctx, 'texture_gen:applied')).toBe(1);
    });

    it('processes next item from queue', () => {
      // Start first
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { requestId: 'first' },
      });
      // Queue second
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:generate',
        payload: { requestId: 'second' },
      });
      ctx.clearEvents();

      // Complete first
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:complete',
        payload: { requestId: 'first', diffuseUrl: 'url1', elapsedMs: 100 },
      });

      const state = ctx.getState().aiTextureGen as any;
      expect(state.isGenerating).toBe(true); // started next from queue
      expect(state.queue).toHaveLength(0);
      // Should have texture_gen:applied + texture_gen:started for next
      expect(getEventCount(ctx, 'texture_gen:started')).toBe(1);
    });

    it('does not include normal/roughness URLs when config disables them', () => {
      const noMaps: AiTextureGenConfig = {
        ...defaultConfig,
        generate_normal_map: false,
        generate_roughness_map: false,
      };

      aiTextureGenHandler.onEvent!(node as any, noMaps, ctx as any, {
        type: 'texture_gen:generate',
        payload: { requestId: 'r1' },
      });
      aiTextureGenHandler.onEvent!(node as any, noMaps, ctx as any, {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'r1',
          diffuseUrl: 'url',
          normalUrl: 'normal_url',
          roughnessUrl: 'rough_url',
          elapsedMs: 100,
        },
      });

      const state = ctx.getState().aiTextureGen as any;
      const tex = state.textures.get('r1');
      expect(tex.normalUrl).toBeNull();
      expect(tex.roughnessUrl).toBeNull();
    });

    it('calculates rolling average generation time', () => {
      for (let i = 0; i < 2; i++) {
        const state = ctx.getState().aiTextureGen as any;
        state.isGenerating = false; // reset for next generation
        aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'texture_gen:generate',
          payload: { requestId: `r${i}` },
        });
        aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
          type: 'texture_gen:complete',
          payload: { requestId: `r${i}`, diffuseUrl: 'url', elapsedMs: i === 0 ? 2000 : 1000 },
        });
      }

      const state = ctx.getState().aiTextureGen as any;
      expect(state.avgGenTimeMs).toBe(1500);
    });
  });

  // =========================================================================
  // texture_gen:apply event
  // =========================================================================

  describe('texture_gen:apply', () => {
    it('switches active texture', () => {
      // Generate two textures
      const state = ctx.getState().aiTextureGen as any;
      state.textures.set('tex_a', { id: 'tex_a', prompt: 'a', diffuseUrl: 'a', normalUrl: null, roughnessUrl: null, generatedAt: 1 });
      state.textures.set('tex_b', { id: 'tex_b', prompt: 'b', diffuseUrl: 'b', normalUrl: null, roughnessUrl: null, generatedAt: 2 });
      state.activeTextureId = 'tex_a';

      ctx.clearEvents();
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:apply',
        payload: { textureId: 'tex_b' },
      });

      expect(state.activeTextureId).toBe('tex_b');
      expect(getEventCount(ctx, 'texture_gen:applied')).toBe(1);
    });

    it('ignores apply for nonexistent texture', () => {
      ctx.clearEvents();
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, ctx as any, {
        type: 'texture_gen:apply',
        payload: { textureId: 'nonexistent' },
      });

      expect(getEventCount(ctx, 'texture_gen:applied')).toBe(0);
    });
  });

  // =========================================================================
  // No state guard
  // =========================================================================

  describe('no state guard', () => {
    it('onEvent does nothing when state is not set', () => {
      const freshCtx = createStatefulMockContext();
      aiTextureGenHandler.onEvent!(node as any, defaultConfig, freshCtx as any, {
        type: 'texture_gen:generate',
        payload: { prompt: 'test' },
      });
      expect(freshCtx.emittedEvents).toHaveLength(0);
    });
  });
});
