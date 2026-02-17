import { describe, it, expect, beforeEach } from 'vitest';
import { zkPrivateHandler } from '../ZKPrivateTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('ZKPrivateTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    predicate: 'proximity' as const,
    radius: 5.0,
    bounds: [1, 1, 1] as [number, number, number],
    fallback: 'transparent' as const,
    circuit_url: '',
  };

  beforeEach(() => {
    node = createMockNode('zk');
    ctx = createMockContext();
    attachTrait(zkPrivateHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    expect(getEventCount(ctx, 'zk_privacy_initialized')).toBe(1);
    const s = (node as any).__zkPrivateState;
    expect(s.isVerified).toBe(false);
    expect(s.activeProofId).toBeNull();
  });

  it('zk_verify_proximity emits proof request', () => {
    sendEvent(zkPrivateHandler, node, cfg, ctx, { type: 'zk_verify_proximity' });
    expect(getEventCount(ctx, 'zk_proof_request')).toBe(1);
    const ev = getLastEvent(ctx, 'zk_proof_request') as any;
    expect(ev.predicate).toBe('proximity');
    expect(ev.params.radius).toBe(5.0);
  });

  it('valid proof unlocks privacy', () => {
    sendEvent(zkPrivateHandler, node, cfg, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: true },
    });
    expect((node as any).__zkPrivateState.isVerified).toBe(true);
    expect(getEventCount(ctx, 'zk_privacy_unlocked')).toBe(1);
  });

  it('invalid proof fails', () => {
    sendEvent(zkPrivateHandler, node, cfg, ctx, {
      type: 'zk_proof_submitted',
      payload: { proofValid: false },
    });
    expect((node as any).__zkPrivateState.isVerified).toBe(false);
    expect(getEventCount(ctx, 'zk_privacy_failed')).toBe(1);
  });

  it('detach cleans up', () => {
    zkPrivateHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__zkPrivateState).toBeUndefined();
  });
});
