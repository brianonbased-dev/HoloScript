/**
 * Tests for render_world_on_fleet — the MCP dispatch tool for rendering a
 * Studio world on the GPU fleet. Pure paths only (dryRun preview, fail-closed
 * rejects); no network, so no fleet spend.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
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
  workloadId?: string;
  workload?: {
    id: string;
    jobs: {
      job_type: string;
      command: string;
      lane: string;
      requires_gpu: boolean;
      requires_webgpu: boolean;
      device_preference: string;
      gpu_memory_mb?: number;
      resource_requirements?: { min_vram_gb: number; num_gpus: number };
      resources?: unknown;
    }[];
  };
};

const AUTH_ENV_KEYS = [
  'HOLOSCRIPT_ORCHESTRATOR_API_KEY',
  'MCP_ORCHESTRATOR_API_KEY',
  'ORCHESTRATOR_API_KEY',
  'MCP_API_KEY',
  'HOLOSCRIPT_API_KEY',
  'HOLOSCRIPT_MCP_API_KEY',
  'HOLOMESH_API_KEY',
] as const;

function snapshotAuthEnv(): Record<(typeof AUTH_ENV_KEYS)[number], string | undefined> {
  return Object.fromEntries(AUTH_ENV_KEYS.map((key) => [key, process.env[key]])) as Record<
    (typeof AUTH_ENV_KEYS)[number],
    string | undefined
  >;
}

function restoreAuthEnv(
  snapshot: Record<(typeof AUTH_ENV_KEYS)[number], string | undefined>
): void {
  for (const key of AUTH_ENV_KEYS) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

async function call(args: Record<string, unknown>): Promise<RenderResult> {
  return (await handleWorldRenderTool('render_world_on_fleet', args)) as RenderResult;
}

describe('render_world_on_fleet — tool surface', () => {
  it('is registered with a safe-by-default schema', () => {
    const tool = worldRenderTools.find((t) => t.name === 'render_world_on_fleet');
    expect(tool).toBeDefined();
    expect(tool?.inputSchema.required).toEqual(['target']);
    expect(tool?.description).toContain('/gpu/workload/:id');
    expect(tool?.description).not.toContain('Poll GET /gpu/job/:id');
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
    expect(job?.lane).toBe('gpu');
    expect(job?.requires_gpu).toBe(true);
    expect(job?.requires_webgpu).toBe(true);
    expect(job?.device_preference).toBe('gpu');
    expect(job?.gpu_memory_mb).toBe(8000);
    expect(job?.resource_requirements).toEqual({ min_vram_gb: 8, num_gpus: 1 });
    expect(job?.command).toContain('node scripts/world-render-runner.mjs');
    expect(job?.command).toContain('--target 3dgs');
    expect(job?.command).toContain('--world-b64'); // inline source shipped as base64
    expect(job?.command).not.toContain('/workspace/'); // repo-relative
  });

  it('keeps workload ids inside the orchestrator varchar(64) limit', async () => {
    const longWorldId = 'codex-fleet-auth-3dgs-valid-2026-06-28-with-an-extra-long-suffix';
    const r = await call({ world: 'composition "D" {}', target: '3dgs', worldId: longWorldId });

    expect(r.ok).toBe(true);
    expect(r.workload?.id.length).toBeLessThanOrEqual(64);
    expect(r.workload?.id).toMatch(/^world-render-3dgs-/);
  });

  it('scales the estimate with quality', async () => {
    expect((await call({ world: 'x', target: '3dgs', quality: 'ultra' })).estimateSeconds).toBe(
      2400
    );
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

  it('does not use MCP or room keys as fleet-submit credentials', async () => {
    const env = snapshotAuthEnv();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      delete process.env.HOLOSCRIPT_ORCHESTRATOR_API_KEY;
      delete process.env.MCP_ORCHESTRATOR_API_KEY;
      delete process.env.ORCHESTRATOR_API_KEY;
      delete process.env.MCP_API_KEY;
      delete process.env.HOLOSCRIPT_API_KEY;
      process.env.HOLOSCRIPT_MCP_API_KEY = 'mcp-only-key';
      process.env.HOLOMESH_API_KEY = 'room-only-key';

      const r = await call({ world: 'composition "NoSpend" {}', target: 'gltf', dryRun: false });

      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/not provisioned/);
      expect(r.error).toContain('HOLOSCRIPT_MCP_API_KEY');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restoreAuthEnv(env);
    }
  });

  it('prefers explicit orchestrator credentials over legacy HOLOSCRIPT_API_KEY', async () => {
    const env = snapshotAuthEnv();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ workload_id: 'world-render-test', jobs: [] }),
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    try {
      delete process.env.HOLOSCRIPT_ORCHESTRATOR_API_KEY;
      process.env.MCP_ORCHESTRATOR_API_KEY = 'explicit-orchestrator-key';
      delete process.env.ORCHESTRATOR_API_KEY;
      delete process.env.MCP_API_KEY;
      process.env.HOLOSCRIPT_API_KEY = 'legacy-holoscript-key';

      const r = await call({ world: 'composition "NoSpend" {}', target: 'gltf', dryRun: false });

      expect(r.ok).toBe(true);
      expect(r.dispatched).toBe(true);
      const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
      expect((init?.headers as Record<string, string>)['x-mcp-api-key']).toBe(
        'explicit-orchestrator-key'
      );
    } finally {
      restoreAuthEnv(env);
    }
  });
});

describe('render_world_on_fleet — command always self-ensures the runtime', () => {
  it('bootstraps node before the repo-relative runner invocation', async () => {
    const r = await call({ world: 'composition "D" {}', target: 'gltf', dryRun: true });
    expect(r.workload?.jobs[0].command).toContain('command -v node');
    expect(r.workload?.jobs[0].command).toContain('node scripts/world-render-runner.mjs');
    expect(r.workload?.jobs[0].command).not.toContain('/workspace/');
  });
});

describe('render_world_on_fleet submit auth', () => {
  it('uses an explicit orchestrator key alias for /gpu/workload submit', async () => {
    const env = snapshotAuthEnv();
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-mcp-api-key']).toBe('orchestrator-submit-key');
        expect(headers.authorization).toBeUndefined();
        return new Response(JSON.stringify({ workload_id: 'wl_world_render_123', jobs: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      delete process.env.HOLOSCRIPT_ORCHESTRATOR_API_KEY;
      delete process.env.MCP_ORCHESTRATOR_API_KEY;
      delete process.env.HOLOSCRIPT_API_KEY;
      delete process.env.MCP_API_KEY;
      process.env.ORCHESTRATOR_API_KEY = 'orchestrator-submit-key';
      process.env.HOLOSCRIPT_MCP_API_KEY = 'mcp-wrong-for-submit';
      process.env.HOLOMESH_API_KEY = 'room-wrong-for-submit';

      const r = await call({ world: 'composition "Dispatch" {}', target: 'gltf', dryRun: false });

      expect(r.ok).toBe(true);
      expect(r.dispatched).toBe(true);
      expect(r.workloadId).toBe('wl_world_render_123');
      expect(r.note).toContain('/gpu/workload/:id');
      expect(r.note).not.toContain('Poll GET /gpu/job/:id');
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      restoreAuthEnv(env);
    }
  });

  it('uses legacy MCP_API_KEY as an orchestrator submit key', async () => {
    const env = snapshotAuthEnv();
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const headers = init?.headers as Record<string, string>;
        expect(headers['x-mcp-api-key']).toBe('legacy-mcp-submit-key');
        return new Response(JSON.stringify({ workload_id: 'wl_world_render_mcp_legacy' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      delete process.env.HOLOSCRIPT_ORCHESTRATOR_API_KEY;
      delete process.env.MCP_ORCHESTRATOR_API_KEY;
      delete process.env.ORCHESTRATOR_API_KEY;
      process.env.MCP_API_KEY = 'legacy-mcp-submit-key';
      delete process.env.HOLOSCRIPT_API_KEY;
      process.env.HOLOSCRIPT_MCP_API_KEY = 'mcp-wrong-for-submit';
      process.env.HOLOMESH_API_KEY = 'room-wrong-for-submit';

      const r = await call({ world: 'composition "Dispatch" {}', target: 'gltf', dryRun: false });

      expect(r.ok).toBe(true);
      expect(r.dispatched).toBe(true);
      expect(r.workloadId).toBe('wl_world_render_mcp_legacy');
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      restoreAuthEnv(env);
    }
  });
});
