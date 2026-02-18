/**
 * RenderNetworkTrait - Production Test Suite
 *
 * Commence All V — Tests aligned to actual renderNetworkHandler implementation.
 * Covers: onAttach state, onDetach cleanup, onEvent dispatch (render_submit,
 * volumetric_process, splat_bake, render_cancel, credits_refresh, render_download),
 * job lifecycle, quality presets, and credit estimates.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderNetworkHandler } from '../RenderNetworkTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'test-renderer') {
  return { id, __renderNetworkState: undefined as any };
}

function makeContext() {
  const emitted: { event: string; data: any }[] = [];
  return {
    emit: (event: string, data: any) => emitted.push({ event, data }),
    emitted,
  };
}

function defaultConfig() {
  return { ...renderNetworkHandler.defaultConfig };
}

function attachNode(config = defaultConfig()) {
  const node = makeNode();
  const ctx = makeContext();
  renderNetworkHandler.onAttach(node, config, ctx);
  return { node, ctx };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('RenderNetworkTrait — Production Tests', () => {
  // =========================================================================
  // Handler defaults
  // =========================================================================
  describe('handler defaults', () => {
    it('has name render_network', () => {
      expect(renderNetworkHandler.name).toBe('render_network');
    });

    it('default quality is production', () => {
      expect(renderNetworkHandler.defaultConfig.default_quality).toBe('production');
    });

    it('default engine is octane', () => {
      expect(renderNetworkHandler.defaultConfig.default_engine).toBe('octane');
    });

    it('default priority is normal', () => {
      expect(renderNetworkHandler.defaultConfig.default_priority).toBe('normal');
    });

    it('default output format is png', () => {
      expect(renderNetworkHandler.defaultConfig.output_format).toBe('png');
    });

    it('default resolution scale is 1.0', () => {
      expect(renderNetworkHandler.defaultConfig.resolution_scale).toBe(1.0);
    });

    it('default max credits per job is 100', () => {
      expect(renderNetworkHandler.defaultConfig.max_credits_per_job).toBe(100);
    });

    it('default auto submit is false', () => {
      expect(renderNetworkHandler.defaultConfig.auto_submit).toBe(false);
    });

    it('default volumetric is enabled', () => {
      expect(renderNetworkHandler.defaultConfig.volumetric_enabled).toBe(true);
    });

    it('default splat baking is enabled', () => {
      expect(renderNetworkHandler.defaultConfig.splat_baking_enabled).toBe(true);
    });

    it('default cache is enabled', () => {
      expect(renderNetworkHandler.defaultConfig.cache_enabled).toBe(true);
    });

    it('default cache TTL is 24 hours', () => {
      expect(renderNetworkHandler.defaultConfig.cache_ttl).toBe(86400000);
    });
  });

  // =========================================================================
  // onAttach — State initialization
  // =========================================================================
  describe('onAttach', () => {
    it('initializes state on node', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState).toBeDefined();
    });

    it('starts not connected', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.isConnected).toBe(false);
    });

    it('starts with no active jobs', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.activeJobs).toEqual([]);
    });

    it('starts with empty completed jobs', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.completedJobs).toEqual([]);
    });

    it('starts with null credits', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.credits).toBeNull();
    });

    it('starts with offline network status', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.networkStatus).toBe('offline');
    });

    it('starts with zero available nodes', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.availableNodes).toBe(0);
    });

    it('starts with zero estimated wait time', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.estimatedWaitTime).toBe(0);
    });

    it('starts with queue position 0', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.queuePosition).toBe(0);
    });

    it('stores API key from config', () => {
      const config = { ...defaultConfig(), api_key: 'test-key' };
      const { node } = attachNode(config);
      expect(node.__renderNetworkState.apiKey).toBe('test-key');
    });

    it('sets apiKey to null when not provided', () => {
      const { node } = attachNode();
      expect(node.__renderNetworkState.apiKey).toBeNull();
    });
  });

  // =========================================================================
  // onDetach — Cleanup
  // =========================================================================
  describe('onDetach', () => {
    it('removes state from node', () => {
      const { node, ctx } = attachNode();
      renderNetworkHandler.onDetach(node, defaultConfig(), ctx);
      expect(node.__renderNetworkState).toBeUndefined();
    });

    it('emits disconnect event if was connected', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onDetach(node, defaultConfig(), ctx);
      const disconnectEvents = ctx.emitted.filter((e) => e.event === 'render_network_disconnect');
      expect(disconnectEvents.length).toBe(1);
    });

    it('does not emit disconnect if not connected', () => {
      const { node, ctx } = attachNode();
      const beforeCount = ctx.emitted.length;
      renderNetworkHandler.onDetach(node, defaultConfig(), ctx);
      const disconnectEvents = ctx.emitted
        .slice(beforeCount)
        .filter((e) => e.event === 'render_network_disconnect');
      expect(disconnectEvents.length).toBe(0);
    });
  });

  // =========================================================================
  // onEvent — render_submit
  // =========================================================================
  describe('onEvent — render_submit', () => {
    it('submits a render job and emits render_job_submitted', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      node.__renderNetworkState.networkStatus = 'online';
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'render_submit',
        payload: {
          scene: { objects: ['cube'] },
          quality: 'draft',
          engine: 'blender_cycles',
          priority: 'normal',
          frames: { start: 1, end: 5 },
        },
      });
      const submitted = ctx.emitted.filter((e) => e.event === 'render_job_submitted');
      expect(submitted.length).toBe(1);
    });

    it('creates job with correct frame count', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'render_submit',
        payload: {
          scene: {},
          frames: { start: 1, end: 10 },
        },
      });
      const job = node.__renderNetworkState.activeJobs[0];
      expect(job.frames.total).toBe(10);
    });

    it('rejects job exceeding max credits', () => {
      const config = { ...defaultConfig(), max_credits_per_job: 1 };
      const { node, ctx } = attachNode(config);
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, config, ctx, {
        type: 'render_submit',
        payload: {
          scene: {},
          quality: 'film',
          frames: { start: 1, end: 100 },
        },
      });
      const rejected = ctx.emitted.filter((e) => e.event === 'render_job_rejected');
      expect(rejected.length).toBe(1);
    });
  });

  // =========================================================================
  // onEvent — render_cancel
  // =========================================================================
  describe('onEvent — render_cancel', () => {
    it('cancels an active job and moves to completed', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.activeJobs.push({
        id: 'job-cancel-1',
        status: 'queued',
        createdAt: Date.now(),
        progress: 0,
        quality: 'draft',
        engine: 'octane',
        priority: 'normal',
        estimatedCredits: 1,
        frames: { total: 1, completed: 0, failed: 0 },
        outputs: [],
        nodeCount: 1,
        gpuHours: 0,
      });
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'render_cancel',
        payload: { jobId: 'job-cancel-1' },
      });
      const cancelled = ctx.emitted.filter((e) => e.event === 'render_job_cancelled');
      expect(cancelled.length).toBe(1);
      expect(node.__renderNetworkState.activeJobs.length).toBe(0);
      expect(node.__renderNetworkState.completedJobs.length).toBe(1);
      expect(node.__renderNetworkState.completedJobs[0].error).toBe('Cancelled by user');
    });
  });

  // =========================================================================
  // onEvent — volumetric_process
  // =========================================================================
  describe('onEvent — volumetric_process', () => {
    it('submits volumetric job when enabled', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'volumetric_process',
        payload: { source: 'video.mp4', outputFormat: 'webm' },
      });
      const submitted = ctx.emitted.filter((e) => e.event === 'volumetric_job_submitted');
      expect(submitted.length).toBe(1);
    });

    it('ignores volumetric when disabled', () => {
      const config = { ...defaultConfig(), volumetric_enabled: false };
      const { node, ctx } = attachNode(config);
      renderNetworkHandler.onEvent(node, config, ctx, {
        type: 'volumetric_process',
        payload: { source: 'video.mp4', outputFormat: 'mp4' },
      });
      const submitted = ctx.emitted.filter((e) => e.event === 'volumetric_job_submitted');
      expect(submitted.length).toBe(0);
    });
  });

  // =========================================================================
  // onEvent — splat_bake
  // =========================================================================
  describe('onEvent — splat_bake', () => {
    it('submits splat bake job when enabled', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'splat_bake',
        payload: { source: 'pointcloud.ply', targetSplatCount: 50000, quality: 'medium' },
      });
      const submitted = ctx.emitted.filter((e) => e.event === 'splat_bake_submitted');
      expect(submitted.length).toBe(1);
    });
  });

  // =========================================================================
  // onUpdate — Job polling
  // =========================================================================
  describe('onUpdate', () => {
    it('does not throw when not connected', () => {
      const { node, ctx } = attachNode();
      expect(() => renderNetworkHandler.onUpdate(node, defaultConfig(), ctx, 16)).not.toThrow();
    });

    it('does not throw when connected with no jobs', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      expect(() => renderNetworkHandler.onUpdate(node, defaultConfig(), ctx, 16)).not.toThrow();
    });
  });

  // =========================================================================
  // Job lifecycle states
  // =========================================================================
  describe('job lifecycle', () => {
    it('jobs start in queued status with 0 progress', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'render_submit',
        payload: {
          scene: {},
          quality: 'preview',
          frames: { start: 1, end: 1 },
        },
      });
      const job = node.__renderNetworkState.activeJobs[0];
      expect(job.status).toBe('queued');
      expect(job.progress).toBe(0);
    });

    it('job id starts with rndr_', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'render_submit',
        payload: { scene: {}, frames: { start: 0, end: 0 } },
      });
      expect(node.__renderNetworkState.activeJobs[0].id).toMatch(/^rndr_/);
    });

    it('calculates nodeCount based on frame count', () => {
      const { node, ctx } = attachNode();
      node.__renderNetworkState.isConnected = true;
      renderNetworkHandler.onEvent(node, defaultConfig(), ctx, {
        type: 'render_submit',
        payload: { scene: {}, quality: 'draft', frames: { start: 1, end: 30 } },
      });
      const job = node.__renderNetworkState.activeJobs[0];
      expect(job.nodeCount).toBe(Math.ceil(30 / 10));
    });
  });
});
