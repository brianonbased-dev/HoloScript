import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleAbsorbServiceTool } from './absorb-tools';

const originalKey = process.env.ABSORB_API_KEY;

describe('absorb_* tools never forward the server key for a remote caller', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.ABSORB_API_KEY;
    else process.env.ABSORB_API_KEY = originalKey;
  });

  function stubFetch() {
    const spy = vi.fn(async () => new Response('{"projects":[]}', { status: 200 }));
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('refuses instead of sending ABSORB_API_KEY on a user caller', async () => {
    process.env.ABSORB_API_KEY = 'placeholder-operator-value';
    const fetchSpy = stubFetch();
    for (const tool of ['absorb_list_projects', 'absorb_run_absorb', 'absorb_check_credits']) {
      const r = (await handleAbsorbServiceTool(
        tool,
        { projectId: 'p1' },
        {
          ownerId: 'gh-user-1',
          serverKeysAllowed: false,
        }
      )) as { refused?: boolean; status?: number };
      expect(r.refused).toBe(true);
      expect(r.status).toBe(403);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("forwards the caller's own apiKey, never the server's", async () => {
    process.env.ABSORB_API_KEY = 'placeholder-operator-value';
    const fetchSpy = stubFetch();
    await handleAbsorbServiceTool(
      'absorb_list_projects',
      { apiKey: 'callers-own' },
      {
        ownerId: 'gh-user-1',
        serverKeysAllowed: false,
      }
    );
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer callers-own');
  });

  it('local use (no caller context) keeps the operator key fallback', async () => {
    process.env.ABSORB_API_KEY = 'placeholder-operator-value';
    const fetchSpy = stubFetch();
    await handleAbsorbServiceTool('absorb_list_projects', {});
    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer placeholder-operator-value'
    );
  });
});
