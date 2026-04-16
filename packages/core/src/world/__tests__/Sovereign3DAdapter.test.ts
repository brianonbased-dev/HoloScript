import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Sovereign3DAdapter } from '../adapters/Sovereign3DAdapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJobResponse(overrides: Record<string, unknown> = {}) {
  return {
    job_id: 'job_test_123',
    status: 'done',
    asset_url: 'https://api.holoscript.net/sovereign/outputs/world.ply',
    navmesh_url: null,
    point_cloud_url: null,
    progress: 1,
    metadata: {
      bounds: [0, 0, 0, 10, 5, 10],
      splat_count: 500000,
      triangle_count: null,
      generation_ms: 12000,
    },
    error: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Sovereign3DAdapter', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, 'fetch' as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has expected adapter id', () => {
    const adapter = new Sovereign3DAdapter({ apiKey: 'test-key' });
    expect(adapter.id).toBe('sovereign-3d');
  });

  it('submits job and returns WorldGenerationResult on success', async () => {
    // POST /api/generate → returns job_id
    // GET /api/jobs/:id → returns done
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ job_id: 'job_test_123' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => makeJobResponse(),
      });

    const adapter = new Sovereign3DAdapter({
      apiKey: 'test-key',
      pollIntervalMs: 0,
    });

    const result = await adapter.generate({
      prompt: 'lush alien jungle',
      format: '3dgs',
      quality: 'medium',
    });

    expect(result.generationId).toBe('job_test_123');
    expect(result.assetUrl).toContain('world.ply');
    expect(result.metadata.splatCount).toBe(500000);

    // Verify POST was called with correct path
    const postCall = fetchMock.mock.calls[0];
    expect(postCall[0]).toContain('/api/generate');
    const body = JSON.parse(postCall[1].body as string);
    expect(body.prompt).toBe('lush alien jungle');
    expect(body.quality_preset).toBe('standard'); // 'medium' maps to 'standard'
    expect(body.output_format).toBe('splat');    // '3dgs' maps to 'splat'
  });

  it('polls until job is done', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ job_id: 'job_poll_123' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => makeJobResponse({ status: 'processing', progress: 0.3 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => makeJobResponse({ status: 'processing', progress: 0.7 }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => makeJobResponse({ job_id: 'job_poll_123', status: 'done', progress: 1 }),
      });

    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    const result = await adapter.generate({ prompt: 'desert', format: 'mesh', quality: 'low' });

    expect(result.generationId).toBe('job_poll_123');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('throws on job error status', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ job_id: 'job_err' }),
      })
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => makeJobResponse({ status: 'error', error: 'Out of memory' }),
      });

    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    await expect(adapter.generate({ prompt: 'test', format: '3dgs', quality: 'low' }))
      .rejects.toThrow('Out of memory');
  });

  it('throws on timeout if job never completes', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ job_id: 'job_timeout' }),
      })
      .mockResolvedValue({
        ok: true, status: 200,
        json: async () => makeJobResponse({ status: 'processing', progress: 0.1 }),
      });

    const adapter = new Sovereign3DAdapter({
      apiKey: 'key',
      pollIntervalMs: 0,
      timeoutMs: 1, // immediate timeout
    });

    await expect(adapter.generate({ prompt: 'test', format: '3dgs', quality: 'low' }))
      .rejects.toThrow(/timed out/i);
  });

  it('maps quality low → draft, ultra → ultra', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job_id: 'j1' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeJobResponse() });

    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    await adapter.generate({ prompt: 'x', format: '3dgs', quality: 'low' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.quality_preset).toBe('draft');

    // ultra
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job_id: 'j2' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeJobResponse() });
    await adapter.generate({ prompt: 'x', format: '3dgs', quality: 'ultra' });
    const body2 = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(body2.quality_preset).toBe('ultra');
  });

  it('maps format 3dgs → splat, mesh → mesh, both → both', async () => {
    const formats: Array<['3dgs' | 'mesh' | 'both', string]> = [
      ['3dgs', 'splat'],
      ['mesh', 'mesh'],
      ['both', 'both'],
    ];
    for (const [input, expected] of formats) {
      fetchMock
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job_id: 'j' }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeJobResponse() });
      const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
      await adapter.generate({ prompt: 'x', format: input, quality: 'medium' });
      const body = JSON.parse(fetchMock.mock.calls.at(-2)![1].body as string);
      expect(body.output_format).toBe(expected);
    }
  });

  it('cancel() posts to cancel endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    await adapter.cancel?.('job_cancel_123');
    expect(fetchMock.mock.calls[0][0]).toContain('/api/jobs/job_cancel_123/cancel');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });

  it('getProgress() returns progress from job status', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeJobResponse({ progress: 0.65 }),
    });
    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    const progress = await adapter.getProgress?.('job_prog_123');
    expect(progress).toBe(0.65);
  });

  it('getProgress() returns 1 when job is done with no progress field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true, status: 200,
      json: async () => makeJobResponse({ progress: undefined }),
    });
    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    const progress = await adapter.getProgress?.('job_done_123');
    expect(progress).toBe(1);
  });

  it('throws on non-ok HTTP response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false, status: 503,
      text: async () => 'Service Unavailable',
    });
    const adapter = new Sovereign3DAdapter({ apiKey: 'key', pollIntervalMs: 0 });
    await expect(adapter.generate({ prompt: 'test', format: '3dgs', quality: 'low' }))
      .rejects.toThrow(/503/);
  });

  it('includes Authorization header when apiKey is provided', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job_id: 'j' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeJobResponse() });

    const adapter = new Sovereign3DAdapter({ apiKey: 'my-sovereign-key', pollIntervalMs: 0 });
    await adapter.generate({ prompt: 'test', format: '3dgs', quality: 'medium' });

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer my-sovereign-key');
  });

  it('uses custom baseUrl when provided', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ job_id: 'j' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => makeJobResponse() });

    const adapter = new Sovereign3DAdapter({
      baseUrl: 'https://custom.brittney.local',
      apiKey: 'k',
      pollIntervalMs: 0,
    });
    await adapter.generate({ prompt: 'test', format: '3dgs', quality: 'medium' });
    expect(fetchMock.mock.calls[0][0]).toContain('custom.brittney.local');
  });

  it('should handle neural_field format correctly', async () => {
    const adapter = new Sovereign3DAdapter({ apiKey: 'test-key' });
    
    // Mock successful submit
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/generate')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ job_id: 'job-neural-123' }),
        });
      }
      if (url.includes('/api/jobs/job-neural-123')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            job_id: 'job-neural-123',
            status: 'done',
            asset_url: 'https://cdn.holoscript.net/worlds/neural_stream_001.bin',
            metadata: { format: 'neural_field' }
          }),
        });
      }
      return Promise.reject(new Error('Unknown URL'));
    }) as any;

    const result = await adapter.generate({
      prompt: 'a neural dreaming space',
      format: 'neural_field' as any,
      quality: 'high'
    });

    expect(result.metadata.format).toBe('neural_field');
    expect(result.assetUrl).toContain('neural_stream');
  });
});
