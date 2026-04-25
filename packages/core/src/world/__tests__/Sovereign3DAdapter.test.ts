import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { readJson } from '../../errors/safeJsonParse';
import { Sovereign3DAdapter } from '../adapters/Sovereign3DAdapter';

describe('Sovereign3DAdapter', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns deterministic mock generation output when mockMode is enabled', async () => {
    const adapter = new Sovereign3DAdapter({
      baseUrl: 'https://mock.sovereign.local',
      mockMode: true,
      mockLatencyMs: 0,
    });

    const result = await adapter.generate({
      prompt: 'neon canyon city',
      format: 'both',
      quality: 'high',
      navEnabled: true,
    });

    expect(result.generationId).toMatch(/^mock_/);
    expect(result.assetUrl).toContain('/mock/');
    expect(result.assetUrl).toContain('world.splat');
    expect(result.pointCloudUrl).toContain('world.ply');
    expect(result.navmeshUrl).toContain('navmesh.glb');
    expect(result.metadata.format).toBe('both');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mockMode progress/cancel operate without network calls', async () => {
    const adapter = new Sovereign3DAdapter({ mockMode: true, mockLatencyMs: 0 });

    await expect(adapter.getProgress('mock_abc')).resolves.toBe(1);
    await expect(adapter.cancel('mock_abc')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses network path when mockMode is disabled', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ job_id: 'job_live_1' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          job_id: 'job_live_1',
          status: 'done',
          asset_url: 'https://assets/live/world.glb',
          metadata: { bounds: [0, 0, 0, 1, 1, 1], generation_ms: 50, triangle_count: 42 },
        }),
      });

    const adapter = new Sovereign3DAdapter({
      apiKey: 'k',
      pollIntervalMs: 0,
      mockMode: false,
    });

    const out = await adapter.generate({
      prompt: 'live run',
      format: 'mesh',
      quality: 'medium',
    });

    expect(out.generationId).toBe('job_live_1');
    expect(out.assetUrl).toContain('.glb');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const reqBody = readJson(fetchMock.mock.calls[0][1].body as string);
    expect(reqBody.output_format).toBe('mesh');
    expect(reqBody.quality_preset).toBe('standard');
  });
});
