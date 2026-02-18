/**
 * RenderNetworkTrait v3.3 Production Tests
 *
 * Comprehensive test suite for the Render Network integration trait.
 * Covers API connection, job lifecycle, credit estimation, volumetric
 * processing, splat baking, cancellation, and simulation fallback.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderNetworkHandler } from '../RenderNetworkTrait';

// =============================================================================
// MOCKS
// =============================================================================

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'node-1') {
  return { id } as any;
}

function makeConfig(overrides: Partial<Parameters<typeof renderNetworkHandler.onAttach>[1]> = {}) {
  return { ...renderNetworkHandler.defaultConfig, ...overrides };
}

function makeContext() {
  return { emit: vi.fn() };
}

/** Attach without triggering the async API connection */
function attachLocal(node: any, ctx: ReturnType<typeof makeContext>) {
  const localConfig = makeConfig({ api_key: '' });
  renderNetworkHandler.onAttach(node, localConfig, ctx);
  return localConfig;
}

/** Manually mark state as connected for synchronous tests */
function setConnectedState(node: any, credits?: Partial<any>) {
  const state = (node as any).__renderNetworkState;
  state.isConnected = true;
  state.networkStatus = 'online';
  state.availableNodes = 42;
  state.credits = {
    balance: 100,
    pending: 0,
    spent: 25,
    earned: 5,
    walletAddress: '0xRendrWallet',
    lastRefresh: Date.now(),
    ...credits,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('RenderNetworkTrait — v3.3 Production', () => {
  let node: any;
  let config: ReturnType<typeof makeConfig>;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    node = makeNode();
    config = makeConfig({ api_key: 'rndr_test_key' });
    ctx = makeContext();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (node as any).__renderNetworkState;
  });

  // ======== CONSTRUCTION & DEFAULTS ========

  describe('construction & defaults', () => {
    it('initializes state on attach without api_key', () => {
      attachLocal(node, ctx);
      const state = (node as any).__renderNetworkState;

      expect(state).toBeDefined();
      expect(state.isConnected).toBe(false);
      expect(state.apiKey).toBeNull();
      expect(state.credits).toBeNull();
      expect(state.activeJobs).toEqual([]);
      expect(state.completedJobs).toEqual([]);
      expect(state.networkStatus).toBe('offline');
      expect(state.availableNodes).toBe(0);
    });

    it('stores api_key when provided', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            available_nodes: 10,
            credits: { balance: 50 },
          }),
      });
      renderNetworkHandler.onAttach(node, config, ctx);
      expect((node as any).__renderNetworkState.apiKey).toBe('rndr_test_key');
    });

    it('has sensible default config', () => {
      const d = renderNetworkHandler.defaultConfig;
      expect(d.default_quality).toBe('production');
      expect(d.default_engine).toBe('octane');
      expect(d.output_format).toBe('png');
      expect(d.default_priority).toBe('normal');
      expect(d.resolution_scale).toBe(1.0);
      expect(d.max_credits_per_job).toBe(100);
      expect(d.auto_submit).toBe(false);
      expect(d.volumetric_enabled).toBe(true);
      expect(d.splat_baking_enabled).toBe(true);
      expect(d.cache_enabled).toBe(true);
      expect(d.cache_ttl).toBe(86400000);
    });

    it('handler name is render_network', () => {
      expect(renderNetworkHandler.name).toBe('render_network');
    });

    it('calls fetch to authenticate when api_key is set', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ available_nodes: 5, credits: {} }),
      });
      renderNetworkHandler.onAttach(node, config, ctx);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.rendernetwork.com/v2/auth/validate',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer rndr_test_key',
          }),
        })
      );
    });

    it('does NOT call fetch when api_key is empty', () => {
      attachLocal(node, ctx);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // ======== ASYNC CONNECTION ========

  describe('async connection', () => {
    it('sets connected state on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            available_nodes: 42,
            estimated_wait_ms: 5000,
            credits: { balance: 100, pending: 5, spent: 20, earned: 3 },
          }),
      });

      renderNetworkHandler.onAttach(node, config, ctx);

      await vi.waitFor(() => {
        const state = (node as any).__renderNetworkState;
        expect(state.isConnected).toBe(true);
      });

      const state = (node as any).__renderNetworkState;
      expect(state.networkStatus).toBe('online');
      expect(state.availableNodes).toBe(42);
      expect(state.estimatedWaitTime).toBe(5000);
      expect(state.credits.balance).toBe(100);
      expect(state.credits.pending).toBe(5);
    });

    it('emits render_network_connected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ available_nodes: 10, credits: { balance: 50 } }),
      });

      renderNetworkHandler.onAttach(node, config, ctx);

      await vi.waitFor(() => {
        expect(ctx.emit).toHaveBeenCalledWith(
          'render_network_connected',
          expect.objectContaining({ node, availableNodes: 10 })
        );
      });
    });

    it('emits render_network_error on failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));
      renderNetworkHandler.onAttach(node, config, ctx);

      await vi.waitFor(() => {
        expect(ctx.emit).toHaveBeenCalledWith(
          'render_network_error',
          expect.objectContaining({
            error: expect.stringContaining('Failed to connect'),
          })
        );
      });

      expect((node as any).__renderNetworkState.networkStatus).toBe('offline');
    });

    it('emits error on HTTP non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });
      renderNetworkHandler.onAttach(node, config, ctx);

      await vi.waitFor(() => {
        expect(ctx.emit).toHaveBeenCalledWith(
          'render_network_error',
          expect.objectContaining({
            error: expect.stringContaining('HTTP 401'),
          })
        );
      });
    });
  });

  // ======== DETACH ========

  describe('detach', () => {
    it('emits disconnect when connected', () => {
      attachLocal(node, ctx);
      setConnectedState(node);

      renderNetworkHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).toHaveBeenCalledWith(
        'render_network_disconnect',
        expect.objectContaining({ node })
      );
      expect((node as any).__renderNetworkState).toBeUndefined();
    });

    it('does not emit disconnect when not connected', () => {
      attachLocal(node, ctx);
      renderNetworkHandler.onDetach!(node, config, ctx);
      expect(ctx.emit).not.toHaveBeenCalledWith('render_network_disconnect', expect.anything());
    });
  });

  // ======== JOB SUBMISSION ========

  describe('render job submission', () => {
    it('emits render_job_submitted with correct estimates', () => {
      attachLocal(node, ctx);
      setConnectedState(node);

      const lc = makeConfig({ api_key: '', max_credits_per_job: 500 });

      // Mock fetch for the API call that submitJobToAPI will attempt
      mockFetch.mockRejectedValueOnce(new Error('offline'));

      renderNetworkHandler.onEvent!(node, lc, ctx, {
        type: 'render_submit',
        payload: {
          scene: { name: 'test_scene' },
          quality: 'production',
          engine: 'octane',
          priority: 'normal',
          frames: { start: 0, end: 9 },
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_job_submitted',
        expect.objectContaining({
          node,
          job: expect.objectContaining({
            status: 'queued',
            quality: 'production',
            engine: 'octane',
            frames: { total: 10, completed: 0, failed: 0 },
            estimatedCredits: 20, // production = 2.0 credits × 10 frames × 1.0 scale
          }),
        })
      );

      const state = (node as any).__renderNetworkState;
      expect(state.activeJobs).toHaveLength(1);
    });

    it('uses config defaults for missing params', () => {
      attachLocal(node, ctx);
      setConnectedState(node);

      const lc = makeConfig({
        api_key: '',
        default_quality: 'draft',
        default_engine: 'blender',
        default_priority: 'high',
      });

      mockFetch.mockRejectedValueOnce(new Error('offline'));

      renderNetworkHandler.onEvent!(node, lc, ctx, {
        type: 'render_submit',
        payload: { scene: {} },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_job_submitted',
        expect.objectContaining({
          job: expect.objectContaining({
            quality: 'draft',
            engine: 'blender',
            priority: 'high',
          }),
        })
      );
    });

    it('rejects job exceeding max_credits_per_job', () => {
      attachLocal(node, ctx);
      setConnectedState(node);

      const lc = makeConfig({ api_key: '', max_credits_per_job: 10 });

      renderNetworkHandler.onEvent!(node, lc, ctx, {
        type: 'render_submit',
        payload: {
          scene: {},
          quality: 'film', // film = 10 credits/frame
          frames: { start: 0, end: 9 }, // 10 frames = 100 credits
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_job_rejected',
        expect.objectContaining({
          reason: 'exceeds_max_credits',
          estimated: 100,
          max: 10,
        })
      );

      const state = (node as any).__renderNetworkState;
      expect(state.activeJobs).toHaveLength(0);
    });

    it('calculates nodeCount based on frame count', () => {
      attachLocal(node, ctx);
      setConnectedState(node);
      const lc = makeConfig({ api_key: '', max_credits_per_job: 0 });
      mockFetch.mockRejectedValueOnce(new Error('offline'));

      renderNetworkHandler.onEvent!(node, lc, ctx, {
        type: 'render_submit',
        payload: {
          scene: {},
          quality: 'preview',
          frames: { start: 0, end: 24 }, // 25 frames
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_job_submitted',
        expect.objectContaining({
          job: expect.objectContaining({
            nodeCount: 3, // ceil(25/10)
          }),
        })
      );
    });
  });

  // ======== CREDIT ESTIMATION ========

  describe('credit estimation', () => {
    const creditCases = [
      { quality: 'preview', frames: 1, scale: 1.0, expected: 0.1 },
      { quality: 'draft', frames: 10, scale: 1.0, expected: 5.0 },
      { quality: 'production', frames: 5, scale: 2.0, expected: 20.0 },
      { quality: 'film', frames: 3, scale: 1.0, expected: 30.0 },
    ];

    creditCases.forEach(({ quality, frames, scale, expected }) => {
      it(`estimates ${expected} credits for ${quality}×${frames} frames at ${scale}x`, () => {
        attachLocal(node, ctx);
        setConnectedState(node);

        const lc = makeConfig({
          api_key: '',
          resolution_scale: scale,
          max_credits_per_job: 0,
        });
        mockFetch.mockRejectedValueOnce(new Error('offline'));

        renderNetworkHandler.onEvent!(node, lc, ctx, {
          type: 'render_submit',
          payload: {
            scene: {},
            quality: quality as any,
            frames: { start: 0, end: frames - 1 },
          },
        });

        expect(ctx.emit).toHaveBeenCalledWith(
          'render_job_submitted',
          expect.objectContaining({
            job: expect.objectContaining({ estimatedCredits: expected }),
          })
        );
      });
    });
  });

  // ======== VOLUMETRIC ========

  describe('volumetric processing', () => {
    it('submits volumetric job when enabled', () => {
      const lc = attachLocal(node, ctx);
      const volConfig = makeConfig({ api_key: '', volumetric_enabled: true });

      renderNetworkHandler.onEvent!(node, volConfig, ctx, {
        type: 'volumetric_process',
        payload: {
          source: 'https://storage.example.com/capture.mp4',
          outputFormat: 'webm',
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'volumetric_job_submitted',
        expect.objectContaining({
          node,
          source: 'https://storage.example.com/capture.mp4',
          format: 'webm',
          job: expect.objectContaining({
            quality: 'production',
            estimatedCredits: 5.0,
          }),
        })
      );

      const state = (node as any).__renderNetworkState;
      expect(state.activeJobs).toHaveLength(1);
      expect(state.activeJobs[0].id).toMatch(/^vol_/);
    });

    it('ignores volumetric_process when disabled', () => {
      attachLocal(node, ctx);
      const noVolConfig = makeConfig({ api_key: '', volumetric_enabled: false });

      renderNetworkHandler.onEvent!(node, noVolConfig, ctx, {
        type: 'volumetric_process',
        payload: { source: 'test.mp4', outputFormat: 'mp4' },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_job_submitted', expect.anything());
    });
  });

  // ======== SPLAT BAKING ========

  describe('splat baking', () => {
    it('submits splat bake job with quality-based credits', () => {
      attachLocal(node, ctx);
      const splatConfig = makeConfig({ api_key: '', splat_baking_enabled: true });

      renderNetworkHandler.onEvent!(node, splatConfig, ctx, {
        type: 'splat_bake',
        payload: {
          source: 'https://storage.example.com/pointcloud.ply',
          targetSplatCount: 500000,
          quality: 'high',
        },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'splat_bake_submitted',
        expect.objectContaining({
          node,
          source: 'https://storage.example.com/pointcloud.ply',
          targetSplatCount: 500000,
          job: expect.objectContaining({
            estimatedCredits: 3.0, // high = 3.0
          }),
        })
      );

      const state = (node as any).__renderNetworkState;
      expect(state.activeJobs[0].id).toMatch(/^splat_/);
    });

    const splatCreditCases = [
      { quality: 'low', credits: 0.5 },
      { quality: 'medium', credits: 1.5 },
      { quality: 'high', credits: 3.0 },
    ];

    splatCreditCases.forEach(({ quality, credits }) => {
      it(`estimates ${credits} credits for ${quality} splat bake`, () => {
        attachLocal(node, ctx);
        const sc = makeConfig({ api_key: '', splat_baking_enabled: true });

        renderNetworkHandler.onEvent!(node, sc, ctx, {
          type: 'splat_bake',
          payload: { source: 'test.ply', targetSplatCount: 100, quality },
        });

        expect(ctx.emit).toHaveBeenCalledWith(
          'splat_bake_submitted',
          expect.objectContaining({
            job: expect.objectContaining({ estimatedCredits: credits }),
          })
        );
      });
    });

    it('ignores splat_bake when disabled', () => {
      attachLocal(node, ctx);
      const noSplatConfig = makeConfig({ api_key: '', splat_baking_enabled: false });

      renderNetworkHandler.onEvent!(node, noSplatConfig, ctx, {
        type: 'splat_bake',
        payload: { source: 'test.ply', targetSplatCount: 100, quality: 'low' },
      });

      expect(ctx.emit).not.toHaveBeenCalledWith('splat_bake_submitted', expect.anything());
    });
  });

  // ======== CANCELLATION ========

  describe('cancellation', () => {
    it('cancels an active job', () => {
      attachLocal(node, ctx);
      setConnectedState(node);

      const state = (node as any).__renderNetworkState;
      state.activeJobs.push({
        id: 'rndr_cancel_test',
        status: 'rendering',
        progress: 50,
      });

      renderNetworkHandler.onEvent!(node, config, ctx, {
        type: 'render_cancel',
        payload: { jobId: 'rndr_cancel_test' },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_job_cancelled',
        expect.objectContaining({
          job: expect.objectContaining({
            id: 'rndr_cancel_test',
            status: 'failed',
            error: 'Cancelled by user',
          }),
        })
      );
    });

    it('does nothing for unknown job ID', () => {
      attachLocal(node, ctx);
      renderNetworkHandler.onEvent!(node, config, ctx, {
        type: 'render_cancel',
        payload: { jobId: 'nonexistent' },
      });
      expect(ctx.emit).not.toHaveBeenCalledWith('render_job_cancelled', expect.anything());
    });
  });

  // ======== DOWNLOAD ========

  describe('download', () => {
    it('emits render_download_ready for completed job', () => {
      attachLocal(node, ctx);
      const state = (node as any).__renderNetworkState;
      state.completedJobs.push({
        id: 'rndr_done',
        status: 'complete',
        outputs: [
          {
            type: 'sequence',
            url: 'https://render.network/outputs/rndr_done.zip',
            format: 'png',
            resolution: { width: 1920, height: 1080 },
            size: 50 * 1024 * 1024,
            checksum: 'sha256:abc',
          },
        ],
      });

      renderNetworkHandler.onEvent!(node, config, ctx, {
        type: 'render_download',
        payload: { jobId: 'rndr_done', outputIndex: 0 },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_download_ready',
        expect.objectContaining({
          node,
          output: expect.objectContaining({
            url: 'https://render.network/outputs/rndr_done.zip',
          }),
        })
      );
    });

    it('does not emit for unknown job', () => {
      attachLocal(node, ctx);
      renderNetworkHandler.onEvent!(node, config, ctx, {
        type: 'render_download',
        payload: { jobId: 'nope' },
      });
      expect(ctx.emit).not.toHaveBeenCalledWith('render_download_ready', expect.anything());
    });

    it('does not emit for out-of-range outputIndex', () => {
      attachLocal(node, ctx);
      const state = (node as any).__renderNetworkState;
      state.completedJobs.push({
        id: 'rndr_done2',
        outputs: [{ type: 'frame', url: 'u' }],
      });

      renderNetworkHandler.onEvent!(node, config, ctx, {
        type: 'render_download',
        payload: { jobId: 'rndr_done2', outputIndex: 5 },
      });
      expect(ctx.emit).not.toHaveBeenCalledWith('render_download_ready', expect.anything());
    });
  });

  // ======== CREDITS REFRESH ========

  describe('credits refresh', () => {
    it('refreshes credits via API', async () => {
      attachLocal(node, ctx);
      setConnectedState(node);

      const creditConfig = makeConfig({ api_key: 'rndr_test_key' });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            balance: 200,
            pending: 10,
            spent: 50,
            earned: 15,
          }),
      });

      renderNetworkHandler.onEvent!(node, creditConfig, ctx, {
        type: 'credits_refresh',
        payload: {},
      });

      await vi.waitFor(() => {
        expect(ctx.emit).toHaveBeenCalledWith(
          'credits_refreshed',
          expect.objectContaining({
            credits: expect.objectContaining({ balance: 200 }),
          })
        );
      });
    });
  });

  // ======== UPDATE LIFECYCLE ========

  describe('update lifecycle', () => {
    it('skips when not connected', () => {
      attachLocal(node, ctx);
      renderNetworkHandler.onUpdate!(node, config, ctx, 16);
      // No errors, no emissions
    });

    it('does not throw when no state', () => {
      renderNetworkHandler.onUpdate!(makeNode('bare'), config, ctx, 16);
    });
  });

  // ======== EDGE CASES ========

  describe('edge cases', () => {
    it('ignores events when state is uninitialized', () => {
      const bareNode = makeNode('bare');
      renderNetworkHandler.onEvent!(bareNode, config, ctx, {
        type: 'render_submit',
        payload: { scene: {} },
      });
      expect(ctx.emit).not.toHaveBeenCalled();
    });

    it('default frames default to {start:0, end:0}', () => {
      attachLocal(node, ctx);
      setConnectedState(node);
      const lc = makeConfig({ api_key: '', max_credits_per_job: 0 });
      mockFetch.mockRejectedValueOnce(new Error('offline'));

      renderNetworkHandler.onEvent!(node, lc, ctx, {
        type: 'render_submit',
        payload: { scene: {} },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'render_job_submitted',
        expect.objectContaining({
          job: expect.objectContaining({
            frames: { total: 1, completed: 0, failed: 0 },
          }),
        })
      );
    });
  });
});
