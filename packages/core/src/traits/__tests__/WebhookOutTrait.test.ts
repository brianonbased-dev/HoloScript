/**
 * WebhookOutTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { webhookOutHandler } from '../WebhookOutTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __whOutState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_retries: 3, timeout_ms: 5000 };

describe('WebhookOutTrait', () => {
  it('has name "webhook_out"', () => {
    expect(webhookOutHandler.name).toBe('webhook_out');
  });

  it('webhook:send calls fetch and emits webhook:sent on success', async () => {
    const node = makeNode();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200 } as Response);
    webhookOutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    webhookOutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'webhook:send', url: 'https://test.com', payload: { data: 1 },
    } as never);

    await vi.waitFor(() => expect(node.emit).toHaveBeenCalledWith('webhook:sent', expect.objectContaining({
      url: 'https://test.com', status: 200,
    })));
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://test.com',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ data: 1 }) }),
    );
    fetchSpy.mockRestore();
  });

  it('webhook:send retries on failure then emits webhook:error', async () => {
    const node = makeNode();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockRejectedValueOnce(new Error('Timeout'))
      .mockRejectedValueOnce(new Error('Timeout'));
    webhookOutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    webhookOutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'webhook:send', url: 'https://test.com', payload: { data: 1 },
    } as never);

    await vi.waitFor(() => expect(node.emit).toHaveBeenCalledWith('webhook:error', expect.objectContaining({
      url: 'https://test.com', error: 'Timeout',
    })));
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    fetchSpy.mockRestore();
  });

  it('webhook:send emits webhook:error when url is empty', () => {
    const node = makeNode();
    webhookOutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    webhookOutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'webhook:send', url: '', payload: { data: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('webhook:error', expect.objectContaining({ error: 'No URL provided' }));
  });
});
