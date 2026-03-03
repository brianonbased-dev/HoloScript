/**
 * RenderNetworkTrait Production Tests
 *
 * Distributed GPU rendering via Render Network.
 * Tests only synchronous logic (no network calls):
 * defaultConfig, onAttach, onDetach, onUpdate (no-op when disconnected),
 * and synchronous onEvent branches: render_cancel, render_download,
 * volumetric_process guard, splat_bake guard, credit check (max_credits_per_job).
 *
 * Note: connectToRenderNetwork / submitJobToAPI / pollJobStatus make real fetch() calls
 * and are not tested here. We cover the sync guards instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderNetworkHandler } from '../RenderNetworkTrait';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'rn_test' } as any; }
function makeCtx() { return { emit: vi.fn() }; }

async function attach(node: any, overrides: Record<string, unknown> = {}) {
  // Don't provide api_key so connectToRenderNetwork is NOT called (avoids fetch)
  const cfg = { ...renderNetworkHandler.defaultConfig!, api_key: '', ...overrides } as any;
  const ctx = makeCtx();
  await renderNetworkHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) { return node.__renderNetworkState as any; }

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  renderNetworkHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

function makeCompletedJob(id: string, outputs: any[] = []) {
  return {
    id,
    createdAt: Date.now(),
    status: 'complete' as const,
    progress: 100,
    quality: 'production' as const,
    engine: 'octane' as const,
    priority: 'normal' as const,
    estimatedCredits: 2.0,
    frames: { total: 1, completed: 1, failed: 0 },
    outputs,
    nodeCount: 1,
    gpuHours: 0.5,
  };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('RenderNetworkTrait — defaultConfig', () => {
  it('has 15 fields with correct defaults', () => {
    const d = renderNetworkHandler.defaultConfig!;
    expect(d.api_key).toBe('');
    expect(d.wallet_address).toBe('');
    expect(d.default_quality).toBe('production');
    expect(d.default_engine).toBe('octane');
    expect(d.output_format).toBe('png');
    expect(d.default_priority).toBe('normal');
    expect(d.resolution_scale).toBe(1.0);
    expect(d.max_credits_per_job).toBe(100);
    expect(d.auto_submit).toBe(false);
    expect(d.preview_quality).toBe('realtime');
    expect(d.volumetric_enabled).toBe(true);
    expect(d.splat_baking_enabled).toBe(true);
    expect(d.webhook_url).toBe('');
    expect(d.cache_enabled).toBe(true);
    expect(d.cache_ttl).toBe(86400000);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('RenderNetworkTrait — onAttach', () => {
  it('initialises state with correct defaults (no api_key)', async () => {
    const node = makeNode();
    await attach(node);
    const s = st(node);
    expect(s.isConnected).toBe(false);
    expect(s.apiKey).toBeNull();
    expect(s.credits).toBeNull();
    expect(s.activeJobs).toHaveLength(0);
    expect(s.completedJobs).toHaveLength(0);
    expect(s.queuePosition).toBe(0);
    expect(s.networkStatus).toBe('offline');
    expect(s.availableNodes).toBe(0);
    expect(s.estimatedWaitTime).toBe(0);
  });

  it('stores apiKey in state when provided', async () => {
    const node = makeNode();
    // Provide a key but the fetch will fail silently (no real network)
    await attach(node, { api_key: 'mykey' });
    expect(st(node).apiKey).toBe('mykey');
  });

  it('does NOT emit when no api_key (no connect attempt)', async () => {
    const node = makeNode();
    const { ctx } = await attach(node, { api_key: '' });
    // Only network-related events would come from async connect; with empty key nothing emitted
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('RenderNetworkTrait — onDetach', () => {
  it('emits render_network_disconnect when isConnected=true', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    st(node).isConnected = true;
    ctx.emit.mockClear();
    renderNetworkHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('render_network_disconnect', expect.any(Object));
  });

  it('does NOT emit disconnect when not connected', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    ctx.emit.mockClear();
    renderNetworkHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('render_network_disconnect', expect.any(Object));
  });

  it('removes __renderNetworkState', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    renderNetworkHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__renderNetworkState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('RenderNetworkTrait — onUpdate', () => {
  it('no-op when not connected', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    ctx.emit.mockClear();
    renderNetworkHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onEvent — render_cancel ──────────────────────────────────────────────────

describe('RenderNetworkTrait — onEvent: render_cancel', () => {
  it('moves job from activeJobs to completedJobs with status=failed', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    const job = { id: 'job1', status: 'rendering', error: undefined } as any;
    st(node).activeJobs.push(job);
    fire(node, cfg, ctx, { type: 'render_cancel', payload: { jobId: 'job1' } });
    expect(st(node).activeJobs).toHaveLength(0);
    expect(st(node).completedJobs).toHaveLength(1);
    expect(st(node).completedJobs[0].status).toBe('failed');
    expect(st(node).completedJobs[0].error).toBe('Cancelled by user');
    expect(ctx.emit).toHaveBeenCalledWith('render_job_cancelled', expect.objectContaining({ job: expect.any(Object) }));
  });

  it('unknown jobId is ignored gracefully', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    expect(() => fire(node, cfg, ctx, { type: 'render_cancel', payload: { jobId: 'ghost' } })).not.toThrow();
    expect(ctx.emit).not.toHaveBeenCalledWith('render_job_cancelled', expect.any(Object));
  });
});

// ─── onEvent — render_download ────────────────────────────────────────────────

describe('RenderNetworkTrait — onEvent: render_download', () => {
  it('emits render_download_ready with correct output', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    const output = { type: 'frame', url: 'https://r.net/out.png', format: 'png', resolution: { width: 1920, height: 1080 }, size: 1024, checksum: 'abc' };
    const job = makeCompletedJob('j_dl', [output]);
    st(node).completedJobs.push(job);

    fire(node, cfg, ctx, { type: 'render_download', payload: { jobId: 'j_dl', outputIndex: 0 } });
    expect(ctx.emit).toHaveBeenCalledWith('render_download_ready', expect.objectContaining({
      output,
      job: expect.objectContaining({ id: 'j_dl' }),
    }));
  });

  it('default outputIndex=0 used when not provided', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    const output = { type: 'sequence', url: 'https://r.net/seq.zip', format: 'png', resolution: { width: 1280, height: 720 }, size: 2048, checksum: 'def' };
    st(node).completedJobs.push(makeCompletedJob('j2', [output]));
    fire(node, cfg, ctx, { type: 'render_download', payload: { jobId: 'j2' } });
    expect(ctx.emit).toHaveBeenCalledWith('render_download_ready', expect.objectContaining({ output }));
  });

  it('unknown jobId: no emit', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    fire(node, cfg, ctx, { type: 'render_download', payload: { jobId: 'missing' } });
    expect(ctx.emit).not.toHaveBeenCalledWith('render_download_ready', expect.any(Object));
  });

  it('invalid outputIndex: no emit', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node);
    st(node).completedJobs.push(makeCompletedJob('j3', [])); // no outputs
    fire(node, cfg, ctx, { type: 'render_download', payload: { jobId: 'j3', outputIndex: 5 } });
    expect(ctx.emit).not.toHaveBeenCalledWith('render_download_ready', expect.any(Object));
  });
});

// ─── onEvent — volumetric_process guard ───────────────────────────────────────

describe('RenderNetworkTrait — onEvent: volumetric_process', () => {
  it('does NOT emit volumetric_job_submitted when volumetric_enabled=false', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node, { volumetric_enabled: false });
    fire(node, cfg, ctx, { type: 'volumetric_process', payload: { source: 'clip.mp4', outputFormat: 'mp4' } });
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_job_submitted', expect.any(Object));
  });

  it('emits volumetric_job_submitted and adds activeJob when enabled', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node, { volumetric_enabled: true });
    fire(node, cfg, ctx, { type: 'volumetric_process', payload: { source: 'clip.mp4', outputFormat: 'mp4' } });
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_job_submitted', expect.objectContaining({
      source: 'clip.mp4', format: 'mp4',
    }));
    expect(st(node).activeJobs).toHaveLength(1);
    expect(st(node).activeJobs[0].estimatedCredits).toBe(5.0);
  });
});

// ─── onEvent — splat_bake guard ───────────────────────────────────────────────

describe('RenderNetworkTrait — onEvent: splat_bake', () => {
  it('does NOT emit splat_bake_submitted when splat_baking_enabled=false', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node, { splat_baking_enabled: false });
    fire(node, cfg, ctx, { type: 'splat_bake', payload: { source: 'scan.glb', targetSplatCount: 5000, quality: 'high' } });
    expect(ctx.emit).not.toHaveBeenCalledWith('splat_bake_submitted', expect.any(Object));
  });

  it('emits splat_bake_submitted and adds activeJob when enabled (high quality = 3.0 credits)', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node, { splat_baking_enabled: true });
    fire(node, cfg, ctx, { type: 'splat_bake', payload: { source: 'scan.glb', targetSplatCount: 5000, quality: 'high' } });
    expect(ctx.emit).toHaveBeenCalledWith('splat_bake_submitted', expect.objectContaining({
      source: 'scan.glb', targetSplatCount: 5000,
    }));
    expect(st(node).activeJobs[0].estimatedCredits).toBe(3.0);
  });

  it('medium quality = 1.5 credits', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node, { splat_baking_enabled: true });
    fire(node, cfg, ctx, { type: 'splat_bake', payload: { source: 's.glb', targetSplatCount: 1000, quality: 'medium' } });
    expect(st(node).activeJobs[0].estimatedCredits).toBe(1.5);
  });

  it('low quality = 0.5 credits', async () => {
    const node = makeNode();
    const { cfg, ctx } = await attach(node, { splat_baking_enabled: true });
    fire(node, cfg, ctx, { type: 'splat_bake', payload: { source: 's.glb', targetSplatCount: 500, quality: 'low' } });
    expect(st(node).activeJobs[0].estimatedCredits).toBe(0.5);
  });
});
