import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAbsorbServiceTool, RUN_ABSORB_API_KEY_UNAVAILABLE } from '../absorb-tools';

/** #623 (CoS 2026-10-22): an API-key absorb gets 401 by design; say so, once. */
describe('absorb_run_absorb with an API key', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('turns the 401 into the clear message, with one request and no retry', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const out = (await handleAbsorbServiceTool('absorb_run_absorb', {
      projectId: 'ws-1',
      apiKey: 'test-only-placeholder',
    })) as { error: string; reason: string };
    expect(out.error).toBe(RUN_ABSORB_API_KEY_UNAVAILABLE);
    expect(out.reason).toBe('absorb_requires_signed_in_owner');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('other failures keep their own error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Absorb refused this scan.' }), { status: 402 })
      )
    );
    const out = (await handleAbsorbServiceTool('absorb_run_absorb', {
      projectId: 'ws-1',
      apiKey: 'test-only-placeholder',
    })) as { error: string };
    expect(out.error).toBe('Absorb refused this scan.');
  });
});
