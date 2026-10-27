/**
 * WebhookTrait inbound HMAC verification (card-webhook-token-compare).
 *
 * The inbound check compared the presented signature with `===`, which returns
 * early on the first differing character, and it accepted an incoming webhook
 * with NO signature at all whenever a secret was configured. These cases pin
 * the constant-time compare and the fail-closed handling of missing,
 * non-string, wrong-length and non-hex signatures.
 */
import { createRequire } from 'node:module';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { webhookHandler } from '../WebhookTrait';

const nodeCrypto = createRequire(import.meta.url)('crypto') as typeof import('crypto');

const SECRET = 'webhook-test-secret';
const BODY = { event: 'build.done', id: 42 };

const config = {
  url: 'https://example.com/hook',
  method: 'POST' as const,
  headers: {},
  timeout_ms: 5000,
  secret: SECRET,
  hmac_algorithm: 'sha256',
  max_history: 50,
};

function sign(body: unknown): string {
  return nodeCrypto
    .createHmac('sha256', SECRET)
    .update(JSON.stringify(body ?? ''))
    .digest('hex');
}

function incoming(payload: Record<string, unknown>): { verified: unknown; status: unknown } {
  const emitted: Array<[string, any]> = [];
  const node: Record<string, unknown> = { id: 'n1' };
  const ctx = { emit: (type: string, data: unknown) => emitted.push([type, data]) };
  webhookHandler.onAttach!(node as never, config, ctx as never);
  webhookHandler.onEvent!(node as never, config, ctx as never, {
    type: 'webhook:incoming',
    payload,
  } as never);
  const received = emitted.find(([t]) => t === 'webhook:received');
  const state = node.__webhookState as { history: Array<{ status: number }> };
  return { verified: received?.[1]?.verified, status: state.history.at(-1)?.status };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('WebhookTrait inbound signature', () => {
  it('accepts the correct signature', () => {
    expect(incoming({ body: BODY, signature: sign(BODY) })).toEqual({
      verified: true,
      status: 200,
    });
  });

  it('compares with crypto.timingSafeEqual, not ===', () => {
    const spy = vi.spyOn(nodeCrypto, 'timingSafeEqual');
    incoming({ body: BODY, signature: sign(BODY) });
    expect(spy).toHaveBeenCalled();
  });

  it('rejects a tampered signature of the same length', () => {
    const good = sign(BODY);
    const tampered = (good[0] === '0' ? '1' : '0') + good.slice(1);
    expect(tampered).toHaveLength(good.length);
    expect(incoming({ body: BODY, signature: tampered })).toEqual({
      verified: false,
      status: 401,
    });
  });

  it('rejects a signature for a different body', () => {
    expect(incoming({ body: { ...BODY, id: 43 }, signature: sign(BODY) }).verified).toBe(false);
  });

  it('rejects wrong-length signatures without throwing', () => {
    const good = sign(BODY);
    for (const sig of [good.slice(0, -2), good + '00', 'a', good + good]) {
      expect(() => incoming({ body: BODY, signature: sig })).not.toThrow();
      expect(incoming({ body: BODY, signature: sig }).verified).toBe(false);
    }
  });

  it('rejects the right digest followed by non-hex junk (no lenient hex decode)', () => {
    expect(incoming({ body: BODY, signature: sign(BODY) + 'zz' }).verified).toBe(false);
    expect(incoming({ body: BODY, signature: sign(BODY).toUpperCase() }).verified).toBe(false);
  });

  it('rejects non-string signatures', () => {
    for (const sig of [12345, { hex: sign(BODY) }, [sign(BODY)], true]) {
      expect(incoming({ body: BODY, signature: sig }).verified).toBe(false);
    }
  });

  it('rejects a MISSING signature when a secret is configured (fail closed)', () => {
    expect(incoming({ body: BODY })).toEqual({ verified: false, status: 401 });
    expect(incoming({ body: BODY, signature: '' }).verified).toBe(false);
    expect(incoming({ body: BODY, signature: undefined }).verified).toBe(false);
  });

  it('still verifies nothing when no secret is configured (unchanged)', () => {
    const emitted: Array<[string, any]> = [];
    const node: Record<string, unknown> = { id: 'n2' };
    const ctx = { emit: (type: string, data: unknown) => emitted.push([type, data]) };
    const open = { ...config, secret: '' };
    webhookHandler.onAttach!(node as never, open, ctx as never);
    webhookHandler.onEvent!(node as never, open, ctx as never, {
      type: 'webhook:incoming',
      payload: { body: BODY },
    } as never);
    expect(emitted.find(([t]) => t === 'webhook:received')?.[1]?.verified).toBe(true);
  });
});