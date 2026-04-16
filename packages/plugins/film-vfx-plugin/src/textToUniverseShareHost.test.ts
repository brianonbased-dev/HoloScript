import { describe, it, expect, vi } from 'vitest';

import {
  handleTtuRenderSnippetShareEvent,
  postTtuSnippetToRenderShare,
  wireTextToUniverseShareToCtx,
} from './textToUniverseShareHost';

describe('textToUniverseShareHost', () => {
  it('postTtuSnippetToRenderShare POSTs code to /share', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc123', preview: 'http://x/preview' }),
    });
    const r = await postTtuSnippetToRenderShare('composition "x" {}', {
      renderServiceUrl: 'http://127.0.0.1:9',
      fetchImpl,
      title: 'T',
    });
    expect(r.id).toBe('abc123');
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:9/share',
      expect.objectContaining({ method: 'POST' })
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.code).toContain('composition');
  });

  it('handleTtuRenderSnippetShareEvent ignores other events', async () => {
    const fetchImpl = vi.fn();
    await expect(
      handleTtuRenderSnippetShareEvent('other', {}, {
        renderServiceUrl: 'http://127.0.0.1:9',
        fetchImpl,
      })
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('wireTextToUniverseShareToCtx chains ttu:shared after successful share', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'id1' }),
    });
    const events: string[] = [];
    const ctx: { emit?: (e: string, p?: unknown) => void } = {
      emit: (e, _p) => {
        events.push(e);
      },
    };
    const restore = wireTextToUniverseShareToCtx(ctx, {
      renderServiceUrl: 'http://127.0.0.1:9',
      fetchImpl,
    });
    ctx.emit?.('ttu:render_snippet', { holoSnippet: 'object "A" {}' });
    await vi.waitFor(() => events.includes('ttu:shared') && events.includes('ttu:render_snippet'));
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    restore();
  });
});
