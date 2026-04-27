/**
 * SubscriptionTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { subscriptionHandler } from '../SubscriptionTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __subState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { plans: ['free', 'pro', 'enterprise'] };

describe('SubscriptionTrait', () => {
  it('has name "subscription"', () => {
    expect(subscriptionHandler.name).toBe('subscription');
  });

  it('subscription:create emits subscription:created', () => {
    const node = makeNode();
    subscriptionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    subscriptionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'subscription:create', plan: 'pro',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('subscription:created', expect.objectContaining({ plan: 'pro' }));
  });

  it('subscription:cancel emits subscription:cancelled', () => {
    const node = makeNode();
    subscriptionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    subscriptionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'subscription:cancel', subscriptionId: 'sub_1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('subscription:cancelled', { subscriptionId: 'sub_1' });
  });
});
