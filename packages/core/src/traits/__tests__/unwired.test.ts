import { describe, it, expect } from 'vitest';
import { emitUnwired } from '../unwired';
import type { TraitContext } from '../TraitTypes';

function captureCtx() {
  const events: Array<{ event: string; payload: any }> = [];
  const ctx = { emit: (event: string, payload?: unknown) => events.push({ event, payload }) } as unknown as TraitContext;
  return { ctx, events };
}

describe('emitUnwired (honest-abstention template)', () => {
  it('emits the trait error event with an honest not_implemented payload, never a success', () => {
    const { ctx, events } = captureCtx();
    emitUnwired(ctx, 'stripe:error', { capability: 'stripe' });
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('stripe:error');
    expect(events[0].payload).toMatchObject({ ok: false, error: 'not_implemented', capability: 'stripe' });
    expect(typeof events[0].payload.reason).toBe('string');
  });

  it('includes wiring + requested when provided (consumer can retry/log)', () => {
    const { ctx, events } = captureCtx();
    emitUnwired(ctx, 's3:error', { capability: 's3', wiring: '@aws-sdk/client-s3', requested: { key: 'a.png', bucket: 'b' } });
    expect(events[0].payload.wiring).toBe('@aws-sdk/client-s3');
    expect(events[0].payload.requested).toEqual({ key: 'a.png', bucket: 'b' });
  });

  it('omits optional fields when not provided', () => {
    const { ctx, events } = captureCtx();
    emitUnwired(ctx, 'x:error', { capability: 'x' });
    expect('wiring' in events[0].payload).toBe(false);
    expect('requested' in events[0].payload).toBe(false);
  });

  it('never throws when the context has no emit (optional-emit contract)', () => {
    expect(() => emitUnwired({} as TraitContext, 'x:error', { capability: 'x' })).not.toThrow();
  });
});
