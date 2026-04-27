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

  it('webhook:send emits webhook:sent', () => {
    const node = makeNode();
    webhookOutHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    webhookOutHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'webhook:send', url: 'https://test.com', payload: { data: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('webhook:sent', expect.objectContaining({ url: 'https://test.com' }));
  });
});
