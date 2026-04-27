/**
 * WebhookTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { webhookHandler } from '../WebhookTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __webhookState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = {
  url: 'https://example.com/hook', method: 'POST' as const,
  headers: {}, timeout_ms: 5000, secret: '', hmac_algorithm: 'sha256', max_history: 50,
};

describe('WebhookTrait', () => {
  it('has name "webhook"', () => {
    expect(webhookHandler.name).toBe('webhook');
  });

  it('onAttach sets up state', () => {
    const node = makeNode();
    webhookHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__webhookState as { totalSent: number };
    expect(state.totalSent).toBe(0);
  });
});
