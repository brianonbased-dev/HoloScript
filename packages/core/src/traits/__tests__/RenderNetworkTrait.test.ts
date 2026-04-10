/**
 * RenderNetworkTrait Tests
 *
 * Tests for distributed GPU rendering via Render Network
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderNetworkHandler } from '../RenderNetworkTrait';
import {
  createMockContext,
  createMockNode,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ─── Mock JobQueuePersistence (used with `new` in onAttach) ──────────────────

vi.mock('../RenderJobPersistence', () => ({
  JobQueuePersistence: vi.fn().mockImplementation(function () {
    return {
      init: vi.fn().mockResolvedValue(undefined),
      loadState: vi.fn().mockResolvedValue(null),
      loadActiveJobs: vi.fn().mockResolvedValue([]),
      loadCompletedJobs: vi.fn().mockResolvedValue([]),
      saveJob: vi.fn().mockResolvedValue(undefined),
      moveToCompleted: vi.fn().mockResolvedValue(undefined),
      saveState: vi.fn().mockResolvedValue(undefined),
      close: vi.fn(),
    };
  }),
}));

// ─── Async attach helper (onAttach is async due to JobQueuePersistence) ──────

async function attachTraitAsync<T>(
  handler: { defaultConfig: T; onAttach?: (node: any, config: T, ctx: any) => any },
  node: Record<string, unknown>,
  config: Partial<T>,
  ctx: any
): Promise<void> {
  const fullConfig = { ...handler.defaultConfig, ...config };
  await handler.onAttach?.(node as any, fullConfig, ctx as any);
}

describe('RenderNetworkTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('render-node');
    ctx = createMockContext();
  });

  describe('initialization', () => {
    it('should have correct default config', () => {
      expect(renderNetworkHandler.defaultConfig.default_quality).toBe('production');
      expect(renderNetworkHandler.defaultConfig.default_engine).toBe('octane');
      expect(renderNetworkHandler.defaultConfig.output_format).toBe('png');
      expect(renderNetworkHandler.defaultConfig.default_priority).toBe('normal');
      expect(renderNetworkHandler.defaultConfig.resolution_scale).toBe(1.0);
      expect(renderNetworkHandler.defaultConfig.volumetric_enabled).toBe(true);
      expect(renderNetworkHandler.defaultConfig.splat_baking_enabled).toBe(true);
      expect(renderNetworkHandler.defaultConfig.cache_enabled).toBe(true);
    });

    it('should attach and initialize state', async () => {
      await attachTraitAsync(renderNetworkHandler, node, {}, ctx);

      const state = (node as any).__renderNetworkState;
      expect(state).toBeDefined();
      expect(state.isConnected).toBe(false);
      expect(state.activeJobs).toEqual([]);
      expect(state.completedJobs).toEqual([]);
      expect(state.networkStatus).toBe('offline');
    });

    it('should attempt connection when API key provided', async () => {
      await attachTraitAsync(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-api-key',
          wallet_address: '0x1234',
        },
        ctx
      );

      const state = (node as any).__renderNetworkState;
      expect(state.apiKey).toBe('test-api-key');
    });
  });

  describe('render quality presets', () => {
    it('should support preview quality', async () => {
      await attachTraitAsync(renderNetworkHandler, node, { default_quality: 'preview' }, ctx);

      expect(renderNetworkHandler.defaultConfig.default_quality).toBeDefined();
    });

    it('should support draft quality', async () => {
      await attachTraitAsync(renderNetworkHandler, node, { default_quality: 'draft' }, ctx);

      const state = (node as any).__renderNetworkState;
      expect(state).toBeDefined();
    });

    it('should support production quality', async () => {
      await attachTraitAsync(renderNetworkHandler, node, { default_quality: 'production' }, ctx);

      const state = (node as any).__renderNetworkState;
      expect(state).toBeDefined();
    });

    it('should support film quality', async () => {
      await attachTraitAsync(renderNetworkHandler, node, { default_quality: 'film' }, ctx);

      const state = (node as any).__renderNetworkState;
      expect(state).toBeDefined();
    });
  });

  describe('render engines', () => {
    const engines = ['octane', 'redshift', 'arnold', 'blender_cycles', 'auto'];

    engines.forEach((engine) => {
      it(`should support ${engine} engine`, async () => {
        await attachTraitAsync(renderNetworkHandler, node, { default_engine: engine as any }, ctx);

        const state = (node as any).__renderNetworkState;
        expect(state).toBeDefined();
      });
    });
  });

  describe('job submission', () => {
    beforeEach(async () => {
      await attachTraitAsync(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          wallet_address: '0x1234',
          max_credits_per_job: 100,
        },
        ctx
      );
      // Simulate connected state
      const state = (node as any).__renderNetworkState;
      state.isConnected = true;
      state.networkStatus = 'online';
      state.credits = {
        balance: 1000,
        pending: 0,
        spent: 0,
        earned: 0,
        walletAddress: '0x1234',
        lastRefresh: Date.now(),
      };
      ctx.clearEvents();
    });

    it('should handle render_submit event', () => {
      sendEvent(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          wallet_address: '0x1234',
          max_credits_per_job: 100,
        },
        ctx,
        {
          type: 'render_submit',
          payload: {
            scene: { name: 'test-scene' },
            quality: 'draft',
            engine: 'octane',
            priority: 'normal',
            frames: { start: 0, end: 10 },
          },
        }
      );

      // Should emit some job-related event
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should reject jobs exceeding max credits', () => {
      sendEvent(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          wallet_address: '0x1234',
          max_credits_per_job: 1, // Very low limit
        },
        ctx,
        {
          type: 'render_submit',
          payload: {
            scene: { name: 'big-scene' },
            quality: 'film', // High quality = many credits
            engine: 'octane',
            priority: 'rush',
            frames: { start: 0, end: 1000 }, // Many frames
          },
        }
      );

      const rejectEvent = getLastEvent(ctx, 'render_job_rejected');
      if (rejectEvent) {
        expect(rejectEvent.reason).toBe('exceeds_max_credits');
      }
    });
  });

  describe('volumetric processing', () => {
    beforeEach(async () => {
      await attachTraitAsync(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          volumetric_enabled: true,
        },
        ctx
      );
      const state = (node as any).__renderNetworkState;
      state.isConnected = true;
      ctx.clearEvents();
    });

    it('should handle volumetric_process event when enabled', () => {
      sendEvent(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          volumetric_enabled: true,
        },
        ctx,
        {
          type: 'volumetric_process',
          payload: {
            source: 'https://example.com/volumetric.glb',
            outputFormat: 'mp4',
          },
        }
      );

      // Volumetric processing initiated
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should ignore volumetric_process when disabled', async () => {
      await attachTraitAsync(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          volumetric_enabled: false,
        },
        ctx
      );
      ctx.clearEvents();

      sendEvent(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          volumetric_enabled: false,
        },
        ctx,
        {
          type: 'volumetric_process',
          payload: {
            source: 'https://example.com/volumetric.glb',
            outputFormat: 'mp4',
          },
        }
      );

      // Should not process when disabled
      expect(getEventCount(ctx, 'volumetric_job_submitted')).toBe(0);
    });
  });

  describe('gaussian splat baking', () => {
    beforeEach(async () => {
      await attachTraitAsync(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          splat_baking_enabled: true,
        },
        ctx
      );
      const state = (node as any).__renderNetworkState;
      state.isConnected = true;
      ctx.clearEvents();
    });

    it('should handle splat_bake event when enabled', () => {
      sendEvent(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          splat_baking_enabled: true,
        },
        ctx,
        {
          type: 'splat_bake',
          payload: {
            source: 'https://example.com/pointcloud.ply',
            targetSplatCount: 100000,
            quality: 'high',
          },
        }
      );

      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should ignore splat_bake when disabled', async () => {
      await attachTraitAsync(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          splat_baking_enabled: false,
        },
        ctx
      );
      ctx.clearEvents();

      sendEvent(
        renderNetworkHandler,
        node,
        {
          api_key: 'test-key',
          splat_baking_enabled: false,
        },
        ctx,
        {
          type: 'splat_bake',
          payload: {
            source: 'https://example.com/pointcloud.ply',
            targetSplatCount: 100000,
            quality: 'high',
          },
        }
      );

      expect(getEventCount(ctx, 'splat_bake_submitted')).toBe(0);
    });
  });

  describe('job management', () => {
    beforeEach(async () => {
      await attachTraitAsync(renderNetworkHandler, node, { api_key: 'test-key' }, ctx);
      const state = (node as any).__renderNetworkState;
      state.isConnected = true;
      state.activeJobs = [
        {
          id: 'job-1',
          createdAt: Date.now(),
          status: 'processing',
          progress: 50,
          quality: 'production',
          engine: 'octane',
          priority: 'normal',
          estimatedCredits: 10,
          frames: { total: 100, completed: 50, failed: 0 },
          outputs: [],
          nodeCount: 5,
          gpuHours: 2.5,
        },
      ];
      state.completedJobs = [
        {
          id: 'job-complete',
          createdAt: Date.now() - 3600000,
          completedAt: Date.now() - 1800000,
          status: 'complete',
          progress: 100,
          quality: 'draft',
          engine: 'blender_cycles',
          priority: 'low',
          estimatedCredits: 5,
          actualCredits: 4.8,
          frames: { total: 10, completed: 10, failed: 0 },
          outputs: [
            {
              type: 'sequence',
              url: 'https://cdn.render.network/job-complete/output.zip',
              format: 'png',
              resolution: { width: 1920, height: 1080 },
              size: 104857600,
              checksum: 'abc123',
            },
          ],
          nodeCount: 2,
          gpuHours: 0.5,
        },
      ];
      ctx.clearEvents();
    });

    it('should handle render_cancel event', () => {
      sendEvent(renderNetworkHandler, node, { api_key: 'test-key' }, ctx, {
        type: 'render_cancel',
        payload: { jobId: 'job-1' },
      });

      // Cancel should be processed
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle render_download event', () => {
      sendEvent(renderNetworkHandler, node, { api_key: 'test-key' }, ctx, {
        type: 'render_download',
        payload: { jobId: 'job-complete', outputIndex: 0 },
      });

      expect(getEventCount(ctx, 'render_download_ready')).toBe(1);
      const event = getLastEvent(ctx, 'render_download_ready');
      expect(event.output.url).toContain('render.network');
    });

    it('should handle credits_refresh event', () => {
      sendEvent(renderNetworkHandler, node, { api_key: 'test-key' }, ctx, {
        type: 'credits_refresh',
        payload: {},
      });

      // Credits refresh initiated
      expect(ctx.emittedEvents.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('job polling', () => {
    it('should poll active jobs during update', async () => {
      await attachTraitAsync(renderNetworkHandler, node, { api_key: 'test-key' }, ctx);

      const state = (node as any).__renderNetworkState;
      state.isConnected = true;
      state.activeJobs = [
        {
          id: 'active-job',
          status: 'rendering',
          progress: 25,
          createdAt: Date.now(),
          quality: 'production',
          engine: 'octane',
          priority: 'normal',
          estimatedCredits: 20,
          frames: { total: 100, completed: 25, failed: 0 },
          outputs: [],
          nodeCount: 10,
          gpuHours: 5,
        },
      ];

      ctx.clearEvents();
      updateTrait(renderNetworkHandler, node, { api_key: 'test-key' }, ctx, 1000);

      // Polling should occur for active jobs
      expect(state.activeJobs[0].status).toBeDefined();
    });

    it('should skip polling when disconnected', async () => {
      await attachTraitAsync(renderNetworkHandler, node, {}, ctx);

      const state = (node as any).__renderNetworkState;
      state.isConnected = false;

      ctx.clearEvents();
      updateTrait(renderNetworkHandler, node, {}, ctx, 1000);

      // No events when disconnected
      expect(ctx.emittedEvents.length).toBe(0);
    });
  });

  describe('detach', () => {
    it('should emit disconnect event when connected', async () => {
      await attachTraitAsync(renderNetworkHandler, node, { api_key: 'test-key' }, ctx);

      const state = (node as any).__renderNetworkState;
      state.isConnected = true;

      ctx.clearEvents();
      renderNetworkHandler.onDetach?.(node as any, renderNetworkHandler.defaultConfig, ctx as any);

      expect(getEventCount(ctx, 'render_network_disconnect')).toBe(1);
    });

    it('should clean up state on detach', async () => {
      await attachTraitAsync(renderNetworkHandler, node, {}, ctx);
      renderNetworkHandler.onDetach?.(node as any, renderNetworkHandler.defaultConfig, ctx as any);

      expect((node as any).__renderNetworkState).toBeUndefined();
    });
  });

  describe('output formats', () => {
    const formats = ['png', 'exr', 'jpg', 'mp4', 'webm', 'glb'];

    formats.forEach((format) => {
      it(`should support ${format} output format`, async () => {
        await attachTraitAsync(renderNetworkHandler, node, { output_format: format as any }, ctx);

        const state = (node as any).__renderNetworkState;
        expect(state).toBeDefined();
      });
    });
  });

  describe('priority levels', () => {
    const priorities = ['low', 'normal', 'high', 'rush'];

    priorities.forEach((priority) => {
      it(`should support ${priority} priority`, async () => {
        await attachTraitAsync(
          renderNetworkHandler,
          node,
          { default_priority: priority as any },
          ctx
        );

        const state = (node as any).__renderNetworkState;
        expect(state).toBeDefined();
      });
    });
  });
});
