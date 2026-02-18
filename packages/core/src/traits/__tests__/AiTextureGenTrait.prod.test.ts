/**
 * AiTextureGenTrait Production Tests
 *
 * AI texture generation: generate/complete lifecycle, queue management,
 * normal/roughness map gating, apply texture, rolling avg time, and detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aiTextureGenHandler } from '../AiTextureGenTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'tg-node') { return { id } as any; }

function makeConfig(overrides: any = {}) {
  return { ...aiTextureGenHandler.defaultConfig, ...overrides };
}

function makeContext() {
  const store: Record<string, any> = {};
  return {
    emit: vi.fn(),
    setState: (s: Record<string, any>) => Object.assign(store, s),
    getState: () => store,
  };
}

function getState(ctx: ReturnType<typeof makeContext>) {
  return ctx.getState().aiTextureGen;
}

// =============================================================================
// TESTS
// =============================================================================

describe('AiTextureGenTrait — Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    aiTextureGenHandler.onAttach(node, config, ctx);
  });

  // ======== CONSTRUCTION ========

  describe('construction', () => {
    it('initializes with empty state', () => {
      const s = getState(ctx);
      expect(s.isGenerating).toBe(false);
      expect(s.queue).toEqual([]);
      expect(s.textures.size).toBe(0);
      expect(s.activeTextureId).toBeNull();
      expect(s.totalGenerated).toBe(0);
    });

    it('emits ready with style and resolution', () => {
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:ready', {
        style: 'photorealistic',
        resolution: 1024,
      });
    });

    it('has correct defaults', () => {
      const d = aiTextureGenHandler.defaultConfig;
      expect(d.style).toBe('photorealistic');
      expect(d.resolution).toBe(1024);
      expect(d.seamless).toBe(true);
      expect(d.generate_normal_map).toBe(true);
      expect(d.generate_roughness_map).toBe(true);
    });

    it('handler name is ai_texture_gen', () => {
      expect(aiTextureGenHandler.name).toBe('ai_texture_gen');
    });
  });

  // ======== GENERATE LIFECYCLE ========

  describe('generate lifecycle', () => {
    it('starts generation when idle', () => {
      ctx.emit.mockClear();

      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:generate',
        payload: { prompt: 'rusty metal', requestId: 'req_1' },
      });

      const s = getState(ctx);
      expect(s.isGenerating).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:started', expect.objectContaining({
        requestId: 'req_1',
        prompt: 'rusty metal',
        resolution: 1024,
        style: 'photorealistic',
      }));
    });

    it('queues when already generating', () => {
      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:generate',
        payload: { requestId: 'r1' },
      });
      ctx.emit.mockClear();

      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:generate',
        payload: { requestId: 'r2' },
      });

      expect(getState(ctx).queue).toContain('r2');
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:queued', {
        requestId: 'r2',
        queueLength: 1,
      });
    });

    it('completes generation and stores texture', () => {
      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:generate',
        payload: { requestId: 'r1', prompt: 'wood' },
      });
      ctx.emit.mockClear();

      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'r1',
          prompt: 'wood',
          diffuseUrl: 'https://cdn/wood.png',
          normalUrl: 'https://cdn/wood_n.png',
          roughnessUrl: 'https://cdn/wood_r.png',
          elapsedMs: 3000,
        },
      });

      const s = getState(ctx);
      expect(s.isGenerating).toBe(false);
      expect(s.textures.has('r1')).toBe(true);
      expect(s.activeTextureId).toBe('r1');
      expect(s.totalGenerated).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:applied', expect.objectContaining({
        textureId: 'r1',
      }));
    });

    it('drains queue after completion', () => {
      // Generate r1
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: { requestId: 'r1' } });
      // Queue r2
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: { requestId: 'r2' } });
      ctx.emit.mockClear();

      // Complete r1 → should auto-start r2
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:complete', payload: { requestId: 'r1', diffuseUrl: 'u' } });

      expect(getState(ctx).isGenerating).toBe(true);
      expect(getState(ctx).queue).toHaveLength(0);
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:started', expect.objectContaining({ requestId: 'r2' }));
    });
  });

  // ======== NORMAL/ROUGHNESS GATING ========

  describe('material map config gating', () => {
    it('excludes normal map when disabled', () => {
      const cfg = makeConfig({ generate_normal_map: false });
      const c = makeContext();
      aiTextureGenHandler.onAttach(node, cfg, c);

      aiTextureGenHandler.onEvent!(node, cfg, c, { type: 'texture_gen:generate', payload: { requestId: 'x' } });
      aiTextureGenHandler.onEvent!(node, cfg, c, {
        type: 'texture_gen:complete',
        payload: { requestId: 'x', diffuseUrl: 'd', normalUrl: 'n', roughnessUrl: 'r' },
      });

      const tex = getState(c).textures.get('x');
      expect(tex.normalUrl).toBeNull();
      expect(tex.roughnessUrl).toBe('r');
    });

    it('excludes roughness map when disabled', () => {
      const cfg = makeConfig({ generate_roughness_map: false });
      const c = makeContext();
      aiTextureGenHandler.onAttach(node, cfg, c);

      aiTextureGenHandler.onEvent!(node, cfg, c, { type: 'texture_gen:generate', payload: { requestId: 'x' } });
      aiTextureGenHandler.onEvent!(node, cfg, c, {
        type: 'texture_gen:complete',
        payload: { requestId: 'x', diffuseUrl: 'd', normalUrl: 'n', roughnessUrl: 'r' },
      });

      const tex = getState(c).textures.get('x');
      expect(tex.normalUrl).toBe('n');
      expect(tex.roughnessUrl).toBeNull();
    });
  });

  // ======== APPLY TEXTURE ========

  describe('apply texture', () => {
    it('applies existing texture by id', () => {
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: { requestId: 't1' } });
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:complete', payload: { requestId: 't1', diffuseUrl: 'x' } });
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: { requestId: 't2' } });
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:complete', payload: { requestId: 't2', diffuseUrl: 'y' } });

      expect(getState(ctx).activeTextureId).toBe('t2');
      ctx.emit.mockClear();

      // Re-apply t1
      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:apply',
        payload: { textureId: 't1' },
      });

      expect(getState(ctx).activeTextureId).toBe('t1');
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:applied', { textureId: 't1' });
    });

    it('ignores apply for unknown texture id', () => {
      ctx.emit.mockClear();

      aiTextureGenHandler.onEvent!(node, config, ctx, {
        type: 'texture_gen:apply',
        payload: { textureId: 'nonexistent' },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('texture_gen:applied', expect.anything());
    });
  });

  // ======== ROLLING AVG TIME ========

  describe('rolling average time', () => {
    it('calculates rolling average over completions', () => {
      // Gen 1: 200ms
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: { requestId: 'a' } });
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:complete', payload: { requestId: 'a', diffuseUrl: 'x', elapsedMs: 200 } });

      // Gen 2: 400ms → avg = 300
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: { requestId: 'b' } });
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:complete', payload: { requestId: 'b', diffuseUrl: 'y', elapsedMs: 400 } });

      expect(getState(ctx).avgGenTimeMs).toBe(300);
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits cancelled when generating on detach', () => {
      aiTextureGenHandler.onEvent!(node, config, ctx, { type: 'texture_gen:generate', payload: {} });
      ctx.emit.mockClear();

      aiTextureGenHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:cancelled');
    });

    it('no-op detach when idle', () => {
      ctx.emit.mockClear();
      aiTextureGenHandler.onDetach!(node, config, ctx);

      expect(ctx.emit).not.toHaveBeenCalledWith('texture_gen:cancelled');
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('event with no state is a no-op', () => {
      const noCtx = { emit: vi.fn(), setState: vi.fn(), getState: () => ({}) };
      aiTextureGenHandler.onEvent!(node, config, noCtx, { type: 'texture_gen:generate', payload: {} });
      expect(noCtx.emit).not.toHaveBeenCalled();
    });
  });
});
