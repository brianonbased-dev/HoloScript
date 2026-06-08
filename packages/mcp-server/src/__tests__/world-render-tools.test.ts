/**
 * Tests for render_world_on_fleet — the MCP dispatch tool for rendering a
 * Studio world on the GPU fleet. Pure paths only (dryRun preview, fail-closed
 * rejects); no network, so no fleet spend.
 */
import { describe, it, expect } from 'vitest';
import { handleWorldRenderTool, worldRenderTools } from '../world-render-tools';

type RenderResult = {
  ok: boolean;
  dryRun?: boolean;
  dispatched?: boolean;
  enginePending?: boolean;
  estimateSeconds?: number;
  error?: string;
  note?: string;
  render?: { target: string; engine: string; mode: string; requiresGpu: boolean };
  workload?: { id: string; jobs: { job_type: string; command: string; requires_webgpu: boolean }[] };
};

async function call(args: Record<string, unknown>): Promise<RenderResult> {
  return (await handleWorldRenderTool('render_world_on_fleet', args)) as RenderResult;
}

describe('render_world_on_fleet — tool surface', () => {
  it('is registered with a safe-by-default schema', () => {
    const tool = worldRenderTools.find((t) => t.name === 'render_world_on_fleet');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(['target']);
  });

  it('returns null for any other tool name', async () => {
    expect(await handleWorldRenderTool('something_else', {})).toBeNull();
  });
});

describe('render_world_on_fleet — dryRun preview (default, no spend)', () => {
  it('builds a compile-backed 3dgs workload from inline world source', async () => {
    const src = 'composition "Demo" { object "Cube" {} }';
    const r = await call({ world: src, target: '3dgs', worldId: 'demo' });
    expect(r.ok).toBe(true);
    expect(r.dryRun).toBe(true);
    expect(r.enginePending).toBe(false);
    expect(r.render).toMatchObject({ target: '3dgs', engine: 'available', requiresGpu: true });
    expect(r.estimateSeconds).toBe(600); // 600 default × standard
    const job = r.workload?.jobs[0];
    expect(job?.job_type).toBe('render');
    expect(job?.requires_webgpu).toBe(true);
    expect(job?.command).toContain('node scripts/world-render-runner.mjs');
    expect(job?.command).toContain('--target 3dgs');
    expect(job?.command).toContain('--world-b64'); // inline source shipped as base64
    expect(job?.command).not.toContain('/workspace/'); // repo-relative
  });

  it('scales the estimate with quality', async () => {
    expect((await call({ world: 'x', target: '3dgs', quality: 'ultra' })).estimateSeconds).toBe(2400);
  });

  it('previews a pending rasterize target but flags enginePending', async () => {
    const r = await call({ world: 'x', target: 'video' });
    expect(r.ok).toBe(true);
    expect(r.enginePending).toBe(true);
    expect(r.note).toMatch(/engine: pending/);
  });
});

describe('render_world_on_fleet — fail-closed', () => {
  it('refuses to SUBMIT a pending target (dryRun:false) without hitting the network', async () => {
    const r = await call({ world: 'x', target: 'video', dryRun: false });
    expect(r.ok).toBe(false);
    expect(r.enginePending).toBe(true);
    expect(r.error).toMatch(/GPU render-engine/);
  });

  it('errors on an unknown target', async () => {
    const r = await call({ world: 'x', target: 'nope' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown target/);
  });

  it('errors when no world source is provided', async () => {
    const r = await call({ target: '3dgs' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/required/);
  });
});

describe('render_world_on_fleet — command always self-ensures the runtime', () => {
  it('emits a repo-relative runner invocation (no /workspace/ absolute path)', async () => {
    const r = await call({ world: 'composition "D" {}', target: 'gltf', dryRun: true });
    expect(r.workload?.jobs[0].command).toContain('node scripts/world-render-runner.mjs');
    expect(r.workload?.jobs[0].command).not.toContain('/workspace/');
  });
});
