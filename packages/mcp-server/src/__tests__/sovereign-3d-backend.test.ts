import { createServer, type Server } from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleSovereign3DRoute, resetSovereign3DJobsForTest } from '../sovereign-3d-backend';

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('no test port');
      resolve(address.port);
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

describe('sovereign-3d backend HTTP contract', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    resetSovereign3DJobsForTest();
    server = createServer(async (req, res) => {
      if (await handleSovereign3DRoute(req, res, req.url ?? '/')) return;
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'not_found' }));
    });
    const port = await listen(server);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await close(server);
    resetSovereign3DJobsForTest();
  });

  it('submits, completes, and serves a generated world asset URL', async () => {
    const submit = await fetch(`${baseUrl}/sovereign/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'a moonlit desert market with navigation paths',
        output_format: 'both',
        quality_preset: 'high',
        nav_enabled: true,
      }),
    });

    expect(submit.status).toBe(200);
    const submitted = (await submit.json()) as { job_id: string };
    expect(submitted.job_id).toMatch(/^sg_/);

    const jobResponse = await fetch(`${baseUrl}/sovereign/api/jobs/${submitted.job_id}`);
    expect(jobResponse.status).toBe(200);
    const job = (await jobResponse.json()) as {
      status: string;
      progress: number;
      asset_url: string;
      navmesh_url: string;
      point_cloud_url: string;
      metadata: Record<string, unknown>;
    };

    expect(job.status).toBe('done');
    expect(job.progress).toBe(1);
    expect(job.asset_url).toBe(`${baseUrl}/sovereign/assets/${submitted.job_id}/world.splat`);
    expect(job.navmesh_url).toBe(`${baseUrl}/sovereign/assets/${submitted.job_id}/navmesh.glb`);
    expect(job.point_cloud_url).toBe(`${baseUrl}/sovereign/assets/${submitted.job_id}/world.ply`);
    expect(job.metadata.backend).toBe('mcp-sovereign-3d');
    expect(job.metadata.splat_count).toEqual(expect.any(Number));

    const asset = await fetch(job.asset_url);
    expect(asset.status).toBe(200);
    expect(asset.headers.get('content-type')).toContain('application/octet-stream');
    expect(await asset.text()).toContain('holoscript.sovereign_splat.v1');

    const navmesh = await fetch(job.navmesh_url);
    expect(navmesh.status).toBe(200);
    expect(navmesh.headers.get('content-type')).toContain('model/gltf-binary');
    expect(new Uint8Array(await navmesh.arrayBuffer()).slice(0, 4)).toEqual(
      new Uint8Array([0x67, 0x6c, 0x54, 0x46])
    );
  });

  it('lets generateWorldNative consume the backend instead of falling back to text output', async () => {
    const previousBaseUrl = process.env.HOLOSCRIPT_SOVEREIGN_BASE_URL;
    const previousMock = process.env.HOLOSCRIPT_SOVEREIGN_MOCK;
    process.env.HOLOSCRIPT_SOVEREIGN_BASE_URL = `${baseUrl}/sovereign`;
    delete process.env.HOLOSCRIPT_SOVEREIGN_MOCK;
    vi.resetModules();

    try {
      const { generateWorldNative } = await import('../generators');
      const result = await generateWorldNative('a navigable glass desert observatory', {
        format: 'both',
        navEnabled: true,
      });

      expect(result.source).toBe('sovereign-3d');
      expect(result.assetUrl).toContain('/sovereign/assets/');
      expect(result.assetUrl).toContain('world.splat');
      expect(result.pointCloudUrl).toContain('world.ply');
      expect(result.navmeshUrl).toContain('navmesh.glb');
      expect(result.holoCode).toContain('world_asset:');

      const asset = await fetch(result.assetUrl!);
      expect(asset.status).toBe(200);
    } finally {
      if (previousBaseUrl === undefined) delete process.env.HOLOSCRIPT_SOVEREIGN_BASE_URL;
      else process.env.HOLOSCRIPT_SOVEREIGN_BASE_URL = previousBaseUrl;
      if (previousMock === undefined) delete process.env.HOLOSCRIPT_SOVEREIGN_MOCK;
      else process.env.HOLOSCRIPT_SOVEREIGN_MOCK = previousMock;
      vi.resetModules();
    }
  });
});
