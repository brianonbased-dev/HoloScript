/**
 * V43 Trait Handler Tests — Batch 2
 *
 * Tests for the remaining 6 Tier 2 trait handlers:
 *   - spatialPersonaHandler
 *   - sharePlayHandler
 *   - controlNetHandler
 *   - aiTextureGenHandler
 *   - diffusionRealtimeHandler
 *   - aiInpaintingHandler
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { spatialPersonaHandler } from './SpatialPersonaTrait';
import { sharePlayHandler } from './SharePlayTrait';
import { controlNetHandler } from './ControlNetTrait';
import { aiTextureGenHandler } from './AiTextureGenTrait';
import { diffusionRealtimeHandler } from './DiffusionRealtimeTrait';
import { aiInpaintingHandler } from './AiInpaintingTrait';
import type { TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockNode(id = 'test_node'): HSPlusNode {
  return {
    type: 'object',
    id,
    properties: { position: [0, 0, 0], rotation: [0, 0, 0] },
    directives: [],
    children: [],
    traits: new Map(),
  } as HSPlusNode;
}

function createMockContext(): TraitContext {
  let state: Record<string, unknown> = {};

  return {
    vr: { hands: { left: null, right: null }, headset: {}, isPresenting: false } as any,
    physics: { addCollider: vi.fn(), removeCollider: vi.fn() } as any,
    audio: { play: vi.fn(), stop: vi.fn() } as any,
    haptics: { pulse: vi.fn() } as any,
    emit: vi.fn(),
    getState: vi.fn(() => ({ ...state })),
    setState: vi.fn((updates: Record<string, unknown>) => {
      state = { ...state, ...updates };
    }),
    getScaleMultiplier: vi.fn(() => 1),
    setScaleContext: vi.fn(),
  } as any;
}

// =============================================================================
// spatialPersonaHandler
// =============================================================================

describe('spatialPersonaHandler', () => {
  const handler = spatialPersonaHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => { node = createMockNode(); ctx = createMockContext(); });

  describe('handler definition', () => {
    it('should have name "spatial_persona"', () => {
      expect(handler.name).toBe('spatial_persona');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.persona_style).toBe('realistic');
      expect(cfg.visibility).toBe('always');
      expect(cfg.spatial_audio).toBe(true);
      expect(cfg.gesture_mirroring).toBe(true);
      expect(cfg.expression_sync).toBe(true);
      expect(cfg.proximity_radius).toBe(3.0);
      expect(cfg.render_quality).toBe('high');
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit persona:init', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          spatialPersona: expect.objectContaining({
            isActive: false,
            personaId: null,
            isSpeaking: false,
            expressionState: 'neutral',
          }),
        }),
      );
      expect(ctx.emit).toHaveBeenCalledWith('persona:init', {
        style: handler.defaultConfig.persona_style,
        visibility: handler.defaultConfig.visibility,
      });
    });
  });

  describe('onDetach', () => {
    it('should emit persona:deactivated when active', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialPersona as any;
      state.isActive = true;
      state.personaId = 'persona-abc';

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', { personaId: 'persona-abc' });
    });

    it('should not emit when not active', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onDetach!(node, handler.defaultConfig, ctx);

      const emitted = (ctx.emit as any).mock.calls.map((c: any[]) => c[0]);
      expect(emitted).not.toContain('persona:deactivated');
    });
  });

  describe('onEvent', () => {
    it('persona:activate → isActive=true, emits persona:activated', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'persona:activate',
        payload: { personaId: 'p-001' },
      } as any);

      const state = ctx.getState().spatialPersona as any;
      expect(state.isActive).toBe(true);
      expect(state.personaId).toBe('p-001');
      expect(ctx.emit).toHaveBeenCalledWith('persona:activated', { personaId: 'p-001' });
    });

    it('persona:deactivate → isActive=false, emits persona:deactivated', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialPersona as any;
      state.isActive = true;
      state.personaId = 'p-001';

      handler.onEvent!(node, handler.defaultConfig, ctx, { type: 'persona:deactivate' } as any);
      expect(state.isActive).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', { personaId: 'p-001' });
    });

    it('persona:expression → updates expressionState and isSpeaking', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialPersona as any;
      state.personaId = 'p-001';

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'persona:expression',
        payload: { expression: 'talking' },
      } as any);

      expect(state.expressionState).toBe('talking');
      expect(state.isSpeaking).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('persona:expression_changed', {
        personaId: 'p-001',
        expression: 'talking',
      });
    });

    it('persona:participant_visible → adds to visibleTo set', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialPersona as any;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'persona:participant_visible',
        payload: { participantId: 'user-42' },
      } as any);

      expect(state.visibleTo.has('user-42')).toBe(true);
    });

    it('persona:participant_hidden → removes from visibleTo set', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().spatialPersona as any;
      state.visibleTo.add('user-42');

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'persona:participant_hidden',
        payload: { participantId: 'user-42' },
      } as any);

      expect(state.visibleTo.has('user-42')).toBe(false);
    });
  });
});

// =============================================================================
// sharePlayHandler
// =============================================================================

describe('sharePlayHandler', () => {
  const handler = sharePlayHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => { node = createMockNode(); ctx = createMockContext(); });

  describe('handler definition', () => {
    it('should have name "shareplay"', () => {
      expect(handler.name).toBe('shareplay');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.max_participants).toBe(8);
      expect(cfg.auto_join).toBe(true);
      expect(cfg.sync_policy).toBe('full_state');
      expect(cfg.spatial_audio).toBe(true);
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit shareplay:ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          sharePlay: expect.objectContaining({
            sessionState: 'idle',
            sessionId: null,
            isHost: false,
          }),
        }),
      );
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:ready', {
        activity: handler.defaultConfig.activity_title,
      });
    });
  });

  describe('onDetach', () => {
    it('should emit shareplay:ended when session active', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().sharePlay as any;
      state.sessionState = 'active';
      state.sessionId = 'sess-abc';

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:ended', { sessionId: 'sess-abc' });
    });
  });

  describe('onEvent', () => {
    it('shareplay:start → isHost=true, sessionState=active, emits shareplay:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'shareplay:start',
        payload: { sessionId: 'sess-001' },
      } as any);

      const state = ctx.getState().sharePlay as any;
      expect(state.sessionState).toBe('active');
      expect(state.sessionId).toBe('sess-001');
      expect(state.isHost).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:started', {
        sessionId: 'sess-001',
        activity: handler.defaultConfig.activity_title,
      });
    });

    it('shareplay:join → isHost=false, sessionState=active', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'shareplay:join',
        payload: { sessionId: 'sess-001' },
      } as any);

      const state = ctx.getState().sharePlay as any;
      expect(state.sessionState).toBe('active');
      expect(state.isHost).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:joined', { sessionId: 'sess-001' });
    });

    it('shareplay:participant_joined → adds participant up to max', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'shareplay:participant_joined',
        payload: { id: 'user-1', displayName: 'Alice', isHost: false, joinedAt: Date.now() },
      } as any);

      const state = ctx.getState().sharePlay as any;
      expect(state.participants.size).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('shareplay:participant_joined', {
        participantId: 'user-1',
        displayName: 'Alice',
        count: 1,
      });
    });

    it('shareplay:participant_left → removes participant', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().sharePlay as any;
      state.participants.set('user-1', { id: 'user-1', displayName: 'Alice' });

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'shareplay:participant_left',
        payload: { id: 'user-1' },
      } as any);

      expect(state.participants.size).toBe(0);
    });

    it('shareplay:sync → merges synced properties', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'shareplay:sync',
        payload: { properties: { score: 100, level: 3 } },
      } as any);

      const state = ctx.getState().sharePlay as any;
      expect(state.syncedProperties.score).toBe(100);
      expect(state.syncedProperties.level).toBe(3);
    });
  });
});

// =============================================================================
// controlNetHandler
// =============================================================================

describe('controlNetHandler', () => {
  const handler = controlNetHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => { node = createMockNode(); ctx = createMockContext(); });

  describe('handler definition', () => {
    it('should have name "controlnet"', () => {
      expect(handler.name).toBe('controlnet');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.model_type).toBe('canny');
      expect(cfg.control_weight).toBe(1.0);
      expect(cfg.guidance_start).toBe(0.0);
      expect(cfg.guidance_end).toBe(1.0);
      expect(cfg.preprocessor_resolution).toBe(512);
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit controlnet:ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          controlNet: expect.objectContaining({
            isProcessing: false,
            processCount: 0,
            lastResult: null,
          }),
        }),
      );
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:ready', {
        model: 'canny',
        weight: 1.0,
      });
    });
  });

  describe('onDetach', () => {
    it('should emit controlnet:cancelled when processing', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().controlNet as any;
      state.isProcessing = true;

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:cancelled');
    });
  });

  describe('onEvent', () => {
    it('controlnet:process → isProcessing=true, emits controlnet:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'controlnet:process',
        payload: { prompt: 'a glowing orb', controlMap: 'data:image/png;base64,...' },
      } as any);

      const state = ctx.getState().controlNet as any;
      expect(state.isProcessing).toBe(true);
      expect(state.lastPrompt).toBe('a glowing orb');
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:started', {
        model: 'canny',
        prompt: 'a glowing orb',
      });
    });

    it('controlnet:complete → isProcessing=false, increments count, emits controlnet:result', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().controlNet as any;
      state.isProcessing = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'controlnet:complete',
        payload: { result: 'url://output.png', elapsedMs: 800 },
      } as any);

      expect(state.isProcessing).toBe(false);
      expect(state.processCount).toBe(1);
      expect(state.lastResult).toBe('url://output.png');
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:result', {
        result: 'url://output.png',
        model: 'canny',
        elapsedMs: 800,
      });
    });

    it('controlnet:error → isProcessing=false, emits error', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().controlNet as any;
      state.isProcessing = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'controlnet:error',
        payload: { message: 'VRAM OOM' },
      } as any);

      expect(state.isProcessing).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('controlnet:error', { message: 'VRAM OOM' });
    });
  });
});

// =============================================================================
// aiTextureGenHandler
// =============================================================================

describe('aiTextureGenHandler', () => {
  const handler = aiTextureGenHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => { node = createMockNode(); ctx = createMockContext(); });

  describe('handler definition', () => {
    it('should have name "ai_texture_gen"', () => {
      expect(handler.name).toBe('ai_texture_gen');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.style).toBe('photorealistic');
      expect(cfg.resolution).toBe(1024);
      expect(cfg.seamless).toBe(true);
      expect(cfg.material_type).toBe('pbr');
      expect(cfg.generate_normal_map).toBe(true);
      expect(cfg.generate_roughness_map).toBe(true);
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit texture_gen:ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          aiTextureGen: expect.objectContaining({
            isGenerating: false,
            queue: [],
            totalGenerated: 0,
          }),
        }),
      );
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:ready', {
        style: 'photorealistic',
        resolution: 1024,
      });
    });
  });

  describe('onEvent', () => {
    it('texture_gen:generate → starts generation, emits texture_gen:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'texture_gen:generate',
        payload: { prompt: 'mossy stone wall', requestId: 'req-001' },
      } as any);

      const state = ctx.getState().aiTextureGen as any;
      expect(state.isGenerating).toBe(true);
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:started', expect.objectContaining({
        requestId: 'req-001',
        prompt: 'mossy stone wall',
      }));
    });

    it('texture_gen:generate while generating → queues request', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().aiTextureGen as any;
      state.isGenerating = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'texture_gen:generate',
        payload: { prompt: 'metal grate', requestId: 'req-002' },
      } as any);

      expect(state.queue).toContain('req-002');
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:queued', {
        requestId: 'req-002',
        queueLength: 1,
      });
    });

    it('texture_gen:complete → stores texture, updates stats, emits texture_gen:applied', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().aiTextureGen as any;
      state.isGenerating = true;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'texture_gen:complete',
        payload: {
          requestId: 'req-001',
          prompt: 'mossy stone wall',
          diffuseUrl: 'url://diffuse.png',
          normalUrl: 'url://normal.png',
          roughnessUrl: 'url://rough.png',
          elapsedMs: 2500,
        },
      } as any);

      expect(state.isGenerating).toBe(false);
      expect(state.totalGenerated).toBe(1);
      expect(state.textures.size).toBe(1);
      expect(state.activeTextureId).toBe('req-001');
      expect(ctx.emit).toHaveBeenCalledWith('texture_gen:applied', expect.objectContaining({
        textureId: 'req-001',
        diffuseUrl: 'url://diffuse.png',
      }));
    });
  });
});

// =============================================================================
// diffusionRealtimeHandler
// =============================================================================

describe('diffusionRealtimeHandler', () => {
  const handler = diffusionRealtimeHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => { node = createMockNode(); ctx = createMockContext(); });

  describe('handler definition', () => {
    it('should have name "diffusion_realtime"', () => {
      expect(handler.name).toBe('diffusion_realtime');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.backend).toBe('lcm');
      expect(cfg.stream_mode).toBe('img2img');
      expect(cfg.target_fps).toBe(15);
      expect(cfg.steps).toBe(4);
      expect(cfg.width).toBe(512);
      expect(cfg.height).toBe(512);
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit diffusion_rt:ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          diffusionRealtime: expect.objectContaining({
            isStreaming: false,
            frameCount: 0,
            droppedFrames: 0,
          }),
        }),
      );
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:ready', {
        backend: 'lcm',
        target_fps: 15,
      });
    });
  });

  describe('onDetach', () => {
    it('should stop streaming and emit diffusion_rt:stopped', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().diffusionRealtime as any;
      state.isStreaming = true;
      state.frameCount = 30;

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(state.isStreaming).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:stopped', { frameCount: 30 });
    });
  });

  describe('onEvent', () => {
    it('diffusion_rt:start → isStreaming=true, emits diffusion_rt:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'diffusion_rt:start',
      } as any);

      const state = ctx.getState().diffusionRealtime as any;
      expect(state.isStreaming).toBe(true);
      expect(state.frameCount).toBe(0);
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:started', {
        backend: 'lcm',
        prompt: handler.defaultConfig.prompt,
      });
    });

    it('diffusion_rt:stop → isStreaming=false, emits diffusion_rt:stopped', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().diffusionRealtime as any;
      state.isStreaming = true;
      state.frameCount = 10;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'diffusion_rt:stop',
      } as any);

      expect(state.isStreaming).toBe(false);
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:stopped', expect.objectContaining({
        frameCount: 10,
      }));
    });

    it('diffusion_rt:frame → increments frameCount, emits frame_ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().diffusionRealtime as any;
      state.isStreaming = true;
      state.streamStartTime = Date.now() - 1000;

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'diffusion_rt:frame',
        payload: { frameUrl: 'data:image/jpeg;base64,...', latencyMs: 67 },
      } as any);

      expect(state.frameCount).toBe(1);
      expect(state.lastFrameUrl).toBe('data:image/jpeg;base64,...');
      expect(ctx.emit).toHaveBeenCalledWith('diffusion_rt:frame_ready', expect.objectContaining({
        frameCount: 1,
        latencyMs: 67,
      }));
    });

    it('diffusion_rt:frame → ignored when not streaming', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      // isStreaming is false by default
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'diffusion_rt:frame',
        payload: { frameUrl: 'url' },
      } as any);

      const state = ctx.getState().diffusionRealtime as any;
      expect(state.frameCount).toBe(0);
    });

    it('diffusion_rt:frame_dropped → increments droppedFrames', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'diffusion_rt:frame_dropped',
      } as any);

      const state = ctx.getState().diffusionRealtime as any;
      expect(state.droppedFrames).toBe(1);
    });
  });
});

// =============================================================================
// aiInpaintingHandler
// =============================================================================

describe('aiInpaintingHandler', () => {
  const handler = aiInpaintingHandler;
  let node: HSPlusNode;
  let ctx: TraitContext;

  beforeEach(() => { node = createMockNode(); ctx = createMockContext(); });

  describe('handler definition', () => {
    it('should have name "ai_inpainting"', () => {
      expect(handler.name).toBe('ai_inpainting');
    });

    it('should have sensible defaultConfig', () => {
      const cfg = handler.defaultConfig;
      expect(cfg.model).toBe('sd-inpaint');
      expect(cfg.mask_source).toBe('manual');
      expect(cfg.blend_mode).toBe('seamless');
      expect(cfg.strength).toBe(0.8);
      expect(cfg.preserve_original_on_mask_clear).toBe(true);
    });
  });

  describe('onAttach', () => {
    it('should initialise state and emit inpainting:ready', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);

      expect(ctx.setState).toHaveBeenCalledWith(
        expect.objectContaining({
          aiInpainting: expect.objectContaining({
            isProcessing: false,
            activeMask: null,
            totalInpaints: 0,
          }),
        }),
      );
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:ready', {
        model: 'sd-inpaint',
        blend_mode: 'seamless',
      });
    });
  });

  describe('onDetach', () => {
    it('should emit inpainting:cancelled when processing', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().aiInpainting as any;
      state.isProcessing = true;

      handler.onDetach!(node, handler.defaultConfig, ctx);
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:cancelled');
    });
  });

  describe('onEvent', () => {
    it('inpainting:set_mask → sets activeMask, emits inpainting:mask_set', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'inpainting:set_mask',
        payload: { maskData: 'data:image/png;base64,ABC' },
      } as any);

      const state = ctx.getState().aiInpainting as any;
      expect(state.activeMask).toBe('data:image/png;base64,ABC');
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:mask_set', {
        hasMask: true,
        source: 'manual',
      });
    });

    it('inpainting:process without mask → emits error', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      // No mask set
      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'inpainting:process',
        payload: { prompt: 'a glowing portal', regionId: 'r-001' },
      } as any);

      expect(ctx.emit).toHaveBeenCalledWith('inpainting:error', { message: 'No mask set' });
    });

    it('inpainting:process with mask → starts processing, emits inpainting:started', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().aiInpainting as any;
      state.activeMask = 'data:image/png;base64,ABC';

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'inpainting:process',
        payload: { prompt: 'a glowing portal', regionId: 'r-001' },
      } as any);

      expect(state.isProcessing).toBe(true);
      expect(state.regions.size).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:started', expect.objectContaining({
        regionId: 'r-001',
        prompt: 'a glowing portal',
        model: 'sd-inpaint',
      }));
    });

    it('inpainting:complete → stores result, updates stats, emits inpainting:result', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().aiInpainting as any;
      state.isProcessing = true;
      state.regions.set('r-001', { id: 'r-001', maskData: null, prompt: 'portal', resultUrl: null, appliedAt: null });

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'inpainting:complete',
        payload: { regionId: 'r-001', resultUrl: 'url://inpaint.png', elapsedMs: 1200 },
      } as any);

      expect(state.isProcessing).toBe(false);
      expect(state.totalInpaints).toBe(1);
      expect(state.lastResultUrl).toBe('url://inpaint.png');
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:result', expect.objectContaining({
        regionId: 'r-001',
        resultUrl: 'url://inpaint.png',
        blend_mode: 'seamless',
      }));
    });

    it('inpainting:clear_mask → clears mask, emits original_restored when preserve=true', () => {
      handler.onAttach!(node, handler.defaultConfig, ctx);
      const state = ctx.getState().aiInpainting as any;
      state.activeMask = 'data:image/png;base64,ABC';

      handler.onEvent!(node, handler.defaultConfig, ctx, {
        type: 'inpainting:clear_mask',
      } as any);

      expect(state.activeMask).toBeNull();
      expect(ctx.emit).toHaveBeenCalledWith('inpainting:original_restored');
    });
  });
});
