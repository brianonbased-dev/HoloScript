/**
 * PartnerSDKTrait — Production Test Suite
 *
 * No external dependencies — pure logic.
 * Also tests exported utility functions: signRequest, verifyWebhookSignature.
 *
 * Key behaviours:
 * 1. defaultConfig — 9 fields
 * 2. onAttach — creates __partnerSDKState; emits partner_sdk_initialized
 * 3. onDetach — disconnects all sessions (status→disconnected, emits partner_disconnected); clears map; deletes state
 * 4. onUpdate:
 *   - expired sessions (connected + now >= expiresAt) → status=disconnected, emits partner_session_expired
 *   - timed-out requests (sent + elapsed > timeout) → status=error, totalErrors++, emits partner_request_timeout
 *   - moves success/error requests from pending to completed
 *   - trims completed log to max_log_size
 * 5. onEvent 'partner_connect':
 *   - unknown partnerId → emits partner_error
 *   - known → creates session (connected, sessionId, capabilities, expiresAt), emits partner_connected
 * 6. onEvent 'partner_disconnect':
 *   - existing session → status=disconnected, emits partner_disconnected
 * 7. onEvent 'partner_api_request':
 *   - not connected → emits partner_error
 *   - rate limited → emits partner_rate_limited, totalErrors++
 *   - max concurrent exceeded → emits partner_error, totalErrors++
 *   - valid → adds request (status=sent), totalRequests++, emits partner_request_sent
 *   - with secret → request.signature set (starts with 'sig_')
 *   - without secret → signature undefined
 * 8. onEvent 'partner_api_response':
 *   - success=true → request.status='success', emits partner_response_received
 *   - success=false → request.status='error', totalErrors++
 * 9. onEvent 'partner_webhook':
 *   - verified → emits partner_webhook_received
 *   - invalid signature → emits partner_webhook_rejected, totalErrors++
 *   - enable_webhook_verification=false → always verified
 *   - webhook log trimmed at max_log_size
 * 10. onEvent 'partner_query' — emits partner_status with session info + stats
 * 11. signRequest / verifyWebhookSignature — deterministic, round-trips correctly
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnerSDKHandler, signRequest, verifyWebhookSignature } from '../PartnerSDKTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
let _nodeId = 0;
function makeNode() { return { id: `sdk_${++_nodeId}` }; }
function makeCtx() { return { emit: vi.fn() }; }
function makeConfig(o: any = {}) { return { ...partnerSDKHandler.defaultConfig!, ...o }; }

const makePartner = (id = 'stripe', overrides: any = {}) => ({
  id, name: 'Stripe', base_url: 'https://api.stripe.com',
  auth_mode: 'hmac' as any, api_key: 'pk_test', secret: 'whsec_test',
  capabilities: ['charge', 'refund'], version: '1.0.0',
  ...overrides,
});

function attach(configOverrides: any = {}) {
  const node = makeNode(); const ctx = makeCtx();
  const config = makeConfig(configOverrides);
  partnerSDKHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) { return (node as any).__partnerSDKState; }

function connectPartner(node: any, config: any, ctx: any, partnerId = 'stripe') {
  partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_connect', partnerId });
}

beforeEach(() => vi.clearAllMocks());

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('partnerSDKHandler.defaultConfig', () => {
  const d = partnerSDKHandler.defaultConfig!;
  it('partners = []', () => expect(d.partners).toEqual([]));
  it('max_concurrent_requests = 10', () => expect(d.max_concurrent_requests).toBe(10));
  it('request_timeout_ms = 30000', () => expect(d.request_timeout_ms).toBe(30000));
  it('session_ttl_ms = 3600000', () => expect(d.session_ttl_ms).toBe(3600000));
  it('rate_limit_per_partner = 100', () => expect(d.rate_limit_per_partner).toBe(100));
  it('rate_limit_window_ms = 60000', () => expect(d.rate_limit_window_ms).toBe(60000));
  it('enable_webhook_verification = true', () => expect(d.enable_webhook_verification).toBe(true));
  it('log_requests = true', () => expect(d.log_requests).toBe(true));
  it('max_log_size = 1000', () => expect(d.max_log_size).toBe(1000));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('partnerSDKHandler.onAttach', () => {
  it('creates __partnerSDKState', () => { const { node } = attach(); expect(getState(node)).toBeDefined(); });
  it('sessions map is empty', () => { const { node } = attach(); expect(getState(node).sessions.size).toBe(0); });
  it('totalRequests = 0', () => { const { node } = attach(); expect(getState(node).totalRequests).toBe(0); });
  it('totalErrors = 0', () => { const { node } = attach(); expect(getState(node).totalErrors).toBe(0); });
  it('emits partner_sdk_initialized with partnerCount', () => {
    const { ctx } = attach({ partners: [makePartner()] });
    expect(ctx.emit).toHaveBeenCalledWith('partner_sdk_initialized', expect.objectContaining({ partnerCount: 1 }));
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('partnerSDKHandler.onDetach', () => {
  it('disconnects all connected sessions and emits partner_disconnected for each', () => {
    const partner = makePartner('acme');
    const { node, ctx, config } = attach({ partners: [partner] });
    connectPartner(node, config, ctx, 'acme');
    ctx.emit.mockClear();
    partnerSDKHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('partner_disconnected', expect.objectContaining({ partnerId: 'acme' }));
  });
  it('removes __partnerSDKState', () => {
    const { node, ctx, config } = attach();
    partnerSDKHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('does not throw', () => {
    const { node, ctx, config } = attach();
    expect(() => partnerSDKHandler.onDetach!(node as any, config, ctx as any)).not.toThrow();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('partnerSDKHandler.onUpdate', () => {
  it('marks expired session as disconnected and emits partner_session_expired', () => {
    const partner = makePartner('svc');
    const { node, ctx, config } = attach({ partners: [partner] });
    connectPartner(node, config, ctx, 'svc');
    // Force-expire the session
    getState(node).sessions.get('svc').expiresAt = Date.now() - 1;
    ctx.emit.mockClear();
    partnerSDKHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).sessions.get('svc').status).toBe('disconnected');
    expect(ctx.emit).toHaveBeenCalledWith('partner_session_expired', expect.objectContaining({ partnerId: 'svc' }));
  });

  it('marks timed-out pending request as error and emits partner_request_timeout', () => {
    const partner = makePartner('fast');
    const { node, ctx, config } = attach({ partners: [partner], request_timeout_ms: 100 });
    connectPartner(node, config, ctx, 'fast');
    // Inject a 'sent' request with old timestamp
    getState(node).pendingRequests.push({
      id: 'req_old', partnerId: 'fast', endpoint: '/pay', method: 'POST',
      timestamp: Date.now() - 500, status: 'sent',
    });
    ctx.emit.mockClear();
    partnerSDKHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).pendingRequests.find((r: any) => r.id === 'req_old' && r.status === 'error')).toBeUndefined();
    // Should have moved to completedRequests
    expect(ctx.emit).toHaveBeenCalledWith('partner_request_timeout', expect.objectContaining({ requestId: 'req_old' }));
    expect(getState(node).totalErrors).toBe(1);
  });

  it('moves success/error requests from pending to completed', () => {
    const { node, ctx, config } = attach();
    getState(node).pendingRequests.push(
      { id: 'r1', status: 'success', partnerId: 'x', endpoint: '/ok', method: 'GET', timestamp: Date.now() },
      { id: 'r2', status: 'error', partnerId: 'x', endpoint: '/fail', method: 'GET', timestamp: Date.now() },
      { id: 'r3', status: 'sent', partnerId: 'x', endpoint: '/wait', method: 'GET', timestamp: Date.now() },
    );
    partnerSDKHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).completedRequests).toHaveLength(2);
    expect(getState(node).pendingRequests).toHaveLength(1);
    expect(getState(node).pendingRequests[0].id).toBe('r3');
  });

  it('trims completed log at max_log_size', () => {
    const { node, ctx, config } = attach({ max_log_size: 3 });
    // Fill completed array beyond limit
    for (let i = 0; i < 5; i++) {
      getState(node).completedRequests.push({ id: `r${i}`, status: 'success' });
    }
    partnerSDKHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(getState(node).completedRequests.length).toBeLessThanOrEqual(3);
  });
});

// ─── onEvent 'partner_connect' ────────────────────────────────────────────────
describe("onEvent 'partner_connect'", () => {
  it('unknown partner → emits partner_error', () => {
    const { node, ctx, config } = attach({ partners: [] });
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_connect', partnerId: 'ghost' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_error', expect.objectContaining({ error: expect.stringContaining('Unknown') }));
  });

  it('known partner → creates session with status=connected', () => {
    const { node, ctx, config } = attach({ partners: [makePartner('svc')] });
    connectPartner(node, config, ctx, 'svc');
    const session = getState(node).sessions.get('svc');
    expect(session).toBeDefined();
    expect(session.status).toBe('connected');
  });

  it('session has sessionId starting with "session_"', () => {
    const { node, ctx, config } = attach({ partners: [makePartner('svc')] });
    connectPartner(node, config, ctx, 'svc');
    expect(getState(node).sessions.get('svc').sessionId).toMatch(/^session_/);
  });

  it('session.capabilities matches partner.capabilities', () => {
    const partner = makePartner('svc', { capabilities: ['read', 'write'] });
    const { node, ctx, config } = attach({ partners: [partner] });
    connectPartner(node, config, ctx, 'svc');
    expect(getState(node).sessions.get('svc').capabilities).toEqual(['read', 'write']);
  });

  it('emits partner_connected with sessionId + capabilities', () => {
    const { node, ctx, config } = attach({ partners: [makePartner('svc')] });
    ctx.emit.mockClear();
    connectPartner(node, config, ctx, 'svc');
    expect(ctx.emit).toHaveBeenCalledWith('partner_connected', expect.objectContaining({
      partnerId: 'svc', sessionId: expect.any(String), capabilities: expect.any(Array),
    }));
  });
});

// ─── onEvent 'partner_disconnect' ────────────────────────────────────────────
describe("onEvent 'partner_disconnect'", () => {
  it('marks session status=disconnected', () => {
    const { node, ctx, config } = attach({ partners: [makePartner('svc')] });
    connectPartner(node, config, ctx, 'svc');
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_disconnect', partnerId: 'svc' });
    expect(getState(node).sessions.get('svc').status).toBe('disconnected');
  });
  it('emits partner_disconnected', () => {
    const { node, ctx, config } = attach({ partners: [makePartner('svc')] });
    connectPartner(node, config, ctx, 'svc');
    ctx.emit.mockClear();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_disconnect', partnerId: 'svc' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_disconnected', expect.objectContaining({ partnerId: 'svc' }));
  });
});

// ─── onEvent 'partner_api_request' ───────────────────────────────────────────
describe("onEvent 'partner_api_request'", () => {
  function makeConnectedCtx(secretOverride?: string) {
    const partner = makePartner('pay', secretOverride !== undefined ? { secret: secretOverride } : {});
    const { node, ctx, config } = attach({ partners: [partner], rate_limit_per_partner: 5, rate_limit_window_ms: 60000 });
    connectPartner(node, config, ctx, 'pay');
    ctx.emit.mockClear();
    return { node, ctx, config };
  }

  it('not connected → emits partner_error', () => {
    const partner = makePartner('pay');
    const { node, ctx, config } = attach({ partners: [partner] });
    // Do NOT connect
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_error', expect.objectContaining({ error: expect.stringContaining('Not connected') }));
  });

  it('valid → adds pending request with status=sent', () => {
    const { node, ctx, config } = makeConnectedCtx();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge', method: 'POST' });
    expect(getState(node).pendingRequests).toHaveLength(1);
    expect(getState(node).pendingRequests[0].status).toBe('sent');
  });

  it('increments totalRequests', () => {
    const { node, ctx, config } = makeConnectedCtx();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge' });
    expect(getState(node).totalRequests).toBe(1);
  });

  it('emits partner_request_sent', () => {
    const { node, ctx, config } = makeConnectedCtx();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_request_sent', expect.objectContaining({
      partnerId: 'pay', endpoint: '/charge',
    }));
  });

  it('with secret → request.signature starts with "sig_"', () => {
    const { node, ctx, config } = makeConnectedCtx('my_secret');
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge', payload: { amount: 100 } });
    expect(getState(node).pendingRequests[0].signature).toMatch(/^sig_/);
  });

  it('without secret → signature is undefined', () => {
    const { node, ctx, config } = makeConnectedCtx(undefined);
    // Modify the partner to not have a secret
    config.partners[0].secret = undefined;
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge' });
    expect(getState(node).pendingRequests[0].signature).toBeUndefined();
  });

  it('rate limited → emits partner_rate_limited, increments totalErrors', () => {
    const partner = makePartner('limited');
    const { node, ctx, config } = attach({ partners: [partner], rate_limit_per_partner: 1, rate_limit_window_ms: 60000 });
    connectPartner(node, config, ctx, 'limited');
    ctx.emit.mockClear();
    // First request OK
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'limited', endpoint: '/a' });
    ctx.emit.mockClear();
    // Second request → rate limited
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'limited', endpoint: '/b' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_rate_limited', expect.objectContaining({ partnerId: 'limited' }));
    expect(getState(node).totalErrors).toBeGreaterThan(0);
  });

  it('max concurrent exceeded → emits partner_error', () => {
    const partner = makePartner('conc');
    const { node, ctx, config } = attach({ partners: [partner], max_concurrent_requests: 1 });
    connectPartner(node, config, ctx, 'conc');
    ctx.emit.mockClear();
    // Fill up slots
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'conc', endpoint: '/a' });
    ctx.emit.mockClear();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'conc', endpoint: '/b' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_error', expect.objectContaining({ error: expect.stringContaining('concurrent') }));
  });
});

// ─── onEvent 'partner_api_response' ──────────────────────────────────────────
describe("onEvent 'partner_api_response'", () => {
  function setupWithPendingRequest() {
    const partner = makePartner('pay');
    const { node, ctx, config } = attach({ partners: [partner] });
    connectPartner(node, config, ctx, 'pay');
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_request', partnerId: 'pay', endpoint: '/charge' });
    const reqId = getState(node).pendingRequests[0].id;
    ctx.emit.mockClear();
    return { node, ctx, config, reqId };
  }

  it('success=true → request.status=success, emits partner_response_received', () => {
    const { node, ctx, config, reqId } = setupWithPendingRequest();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_response', requestId: reqId, success: true, data: { ok: 1 } });
    expect(getState(node).pendingRequests.find((r: any) => r.id === reqId)?.status).toBe('success');
    expect(ctx.emit).toHaveBeenCalledWith('partner_response_received', expect.objectContaining({ requestId: reqId, success: true }));
  });

  it('success=false → request.status=error, totalErrors++', () => {
    const { node, ctx, config, reqId } = setupWithPendingRequest();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_api_response', requestId: reqId, success: false, error: 'card_declined' });
    expect(getState(node).pendingRequests.find((r: any) => r.id === reqId)?.status).toBe('error');
    expect(getState(node).totalErrors).toBe(1);
  });
});

// ─── onEvent 'partner_webhook' ────────────────────────────────────────────────
describe("onEvent 'partner_webhook'", () => {
  it('verified webhook → emits partner_webhook_received', () => {
    const partner = makePartner('wh', { secret: 'mysecret' });
    const { node, ctx, config } = attach({ partners: [partner], enable_webhook_verification: true });
    const ts = Date.now();
    const payload = { event: 'payment.success' };
    const sig = signRequest(JSON.stringify(payload), 'mysecret', ts);
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, {
      type: 'partner_webhook', partnerId: 'wh', webhookEvent: 'payment.success',
      payload, signature: sig, timestamp: ts,
    });
    expect(ctx.emit).toHaveBeenCalledWith('partner_webhook_received', expect.objectContaining({ partnerId: 'wh' }));
  });

  it('invalid signature → emits partner_webhook_rejected, totalErrors++', () => {
    const partner = makePartner('wh', { secret: 'mysecret' });
    const { node, ctx, config } = attach({ partners: [partner], enable_webhook_verification: true });
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, {
      type: 'partner_webhook', partnerId: 'wh', webhookEvent: 'test',
      payload: { a: 1 }, signature: 'sig_bad', timestamp: Date.now(),
    });
    expect(ctx.emit).toHaveBeenCalledWith('partner_webhook_rejected', expect.objectContaining({ reason: 'Invalid signature' }));
    expect(getState(node).totalErrors).toBe(1);
  });

  it('enable_webhook_verification=false → always verified, emits received', () => {
    const partner = makePartner('wh', { secret: 'mysecret' });
    const { node, ctx, config } = attach({ partners: [partner], enable_webhook_verification: false });
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, {
      type: 'partner_webhook', partnerId: 'wh', webhookEvent: 'test',
      payload: { a: 1 }, signature: 'any_sig', timestamp: Date.now(),
    });
    expect(ctx.emit).toHaveBeenCalledWith('partner_webhook_received', expect.anything());
  });

  it('webhookLog trimmed at max_log_size', () => {
    const partner = makePartner('wh');
    const { node, ctx, config } = attach({ partners: [partner], enable_webhook_verification: false, max_log_size: 3 });
    for (let i = 0; i < 5; i++) {
      partnerSDKHandler.onEvent!(node as any, config, ctx as any, {
        type: 'partner_webhook', partnerId: 'wh', webhookEvent: 'e',
        payload: {}, signature: 'any', timestamp: Date.now(),
      });
    }
    partnerSDKHandler.onUpdate!(node as any, config, ctx as any, 0);
    expect(getState(node).webhookLog.length).toBeLessThanOrEqual(3);
  });
});

// ─── onEvent 'partner_query' ──────────────────────────────────────────────────
describe("onEvent 'partner_query'", () => {
  it('returns null session when partner not connected', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_query', partnerId: 'ghost' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_status', expect.objectContaining({ session: null }));
  });

  it('returns session info when connected', () => {
    const { node, ctx, config } = attach({ partners: [makePartner('svc')] });
    connectPartner(node, config, ctx, 'svc');
    ctx.emit.mockClear();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_query', partnerId: 'svc' });
    expect(ctx.emit).toHaveBeenCalledWith('partner_status', expect.objectContaining({
      session: expect.objectContaining({ status: 'connected', capabilities: expect.any(Array) }),
    }));
  });

  it('returns stats with totalRequests/totalErrors', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    partnerSDKHandler.onEvent!(node as any, config, ctx as any, { type: 'partner_query', partnerId: 'ghost' });
    const call = ctx.emit.mock.calls.find(([ev]: any) => ev === 'partner_status');
    expect(call![1].stats).toEqual(expect.objectContaining({ totalRequests: 0, totalErrors: 0 }));
  });
});

// ─── signRequest / verifyWebhookSignature ─────────────────────────────────────
describe('signRequest + verifyWebhookSignature', () => {
  it('signRequest returns string starting with sig_', () => {
    expect(signRequest('payload', 'secret', 12345)).toMatch(/^sig_/);
  });

  it('signRequest is deterministic — same output for same inputs', () => {
    const a = signRequest('hello', 'secret', 999);
    const b = signRequest('hello', 'secret', 999);
    expect(a).toBe(b);
  });

  it('signRequest differs for different payloads', () => {
    expect(signRequest('a', 'secret', 1)).not.toBe(signRequest('b', 'secret', 1));
  });

  it('verifyWebhookSignature returns true for valid signature', () => {
    const sig = signRequest('test_payload', 'my_secret', 100);
    expect(verifyWebhookSignature('test_payload', sig, 'my_secret', 100)).toBe(true);
  });

  it('verifyWebhookSignature returns false for tampered payload', () => {
    const sig = signRequest('original', 'my_secret', 100);
    expect(verifyWebhookSignature('tampered', sig, 'my_secret', 100)).toBe(false);
  });

  it('verifyWebhookSignature returns false for wrong secret', () => {
    const sig = signRequest('payload', 'correct_secret', 100);
    expect(verifyWebhookSignature('payload', sig, 'wrong_secret', 100)).toBe(false);
  });
});
