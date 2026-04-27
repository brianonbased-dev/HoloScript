/**
 * RefundTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { refundHandler } from '../RefundTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __refundState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_refund_days: 30 };

describe('RefundTrait', () => {
  it('has name "refund"', () => {
    expect(refundHandler.name).toBe('refund');
  });

  it('refund:process emits refund:processed', () => {
    const node = makeNode();
    refundHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    refundHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'refund:process', chargeId: 'ch_1', amount: 50, reason: 'duplicate',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('refund:processed', expect.objectContaining({
      chargeId: 'ch_1', amount: 50,
    }));
  });
});
