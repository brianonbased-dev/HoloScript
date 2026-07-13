/**
 * StripeTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { stripeHandler } from '../StripeTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __stripeState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { currency: 'usd' };

describe('StripeTrait', () => {
  it('has name "stripe"', () => {
    expect(stripeHandler.name).toBe('stripe');
  });

  it('stripe:charge emits an honest stripe:error (backend not wired — no fabricated charge)', () => {
    const node = makeNode();
    stripeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    stripeHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'stripe:charge',
        amount: 500,
        customerId: 'cus_1',
      } as never
    );
    expect(node.emit).toHaveBeenCalledWith(
      'stripe:error',
      expect.objectContaining({ ok: false, error: 'not_implemented', capability: 'stripe' })
    );
    expect(node.emit).not.toHaveBeenCalledWith('stripe:charged', expect.anything());
  });
});
