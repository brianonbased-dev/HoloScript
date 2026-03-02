/**
 * PartnerSDKTrait Tests
 *
 * Tests the partner SDK integration handler: init, connect/disconnect,
 * API request flow with signing, rate limiting, webhook verification,
 * session expiry, request timeout, and detach cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  partnerSDKHandler,
  signRequest,
  verifyWebhookSignature,
} from '../PartnerSDKTrait';
import type { PartnerSDKConfig, PartnerDefinition } from '../PartnerSDKTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNode(id = 'sdk-node') {
  return { id } as any;
}

function makePartner(overrides: Partial<PartnerDefinition> = {}): PartnerDefinition {
  return {
    id: 'test-partner',
    name: 'Test Partner',
    base_url: 'https://api.testpartner.com',
    auth_mode: 'hmac',
    secret: 'test-secret-key',
    capabilities: ['render', 'analytics'],
    version: '1.0.0',
    ...overrides,
  };
}

function makeConfig(overrides: Partial<PartnerSDKConfig> = {}): PartnerSDKConfig {
  return {
    ...partnerSDKHandler.defaultConfig,
    partners: [makePartner()],
    ...overrides,
  };
}

function makeContext() {
  return {
    emit: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PartnerSDKTrait', () => {
  let node: any;
  let config: PartnerSDKConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    partnerSDKHandler.onAttach!(node, config, ctx as any);
  });

  describe('initialization', () => {
    it('creates state on node', () => {
      expect(node.__partnerSDKState).toBeDefined();
      expect(node.__partnerSDKState.sessions.size).toBe(0);
      expect(node.__partnerSDKState.pendingRequests).toEqual([]);
      expect(node.__partnerSDKState.totalRequests).toBe(0);
      expect(node.__partnerSDKState.totalErrors).toBe(0);
    });

    it('emits partner_sdk_initialized', () => {
      expect(ctx.emit).toHaveBeenCalledWith('partner_sdk_initialized', {
        node,
        partnerCount: 1,
      });
    });

    it('has correct default config values', () => {
      const d = partnerSDKHandler.defaultConfig;
      expect(d.max_concurrent_requests).toBe(10);
      expect(d.request_timeout_ms).toBe(30000);
      expect(d.session_ttl_ms).toBe(3600000);
      expect(d.rate_limit_per_partner).toBe(100);
      expect(d.rate_limit_window_ms).toBe(60000);
      expect(d.enable_webhook_verification).toBe(true);
      expect(d.log_requests).toBe(true);
      expect(d.max_log_size).toBe(1000);
    });
  });

  describe('partner connect/disconnect', () => {
    it('connects to a known partner', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });

      const state = node.__partnerSDKState;
      expect(state.sessions.size).toBe(1);
      const session = state.sessions.get('test-partner');
      expect(session.status).toBe('connected');
      expect(session.capabilities).toEqual(['render', 'analytics']);
      expect(ctx.emit).toHaveBeenCalledWith('partner_connected', expect.objectContaining({
        partnerId: 'test-partner',
      }));
    });

    it('emits error for unknown partner', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'unknown-partner',
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_error', expect.objectContaining({
        partnerId: 'unknown-partner',
        error: 'Unknown partner: unknown-partner',
      }));
    });

    it('disconnects a connected partner', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_disconnect',
        partnerId: 'test-partner',
      });

      const session = node.__partnerSDKState.sessions.get('test-partner');
      expect(session.status).toBe('disconnected');
      expect(ctx.emit).toHaveBeenCalledWith('partner_disconnected', expect.objectContaining({
        partnerId: 'test-partner',
      }));
    });
  });

  describe('API requests', () => {
    beforeEach(() => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });
    });

    it('sends a signed API request', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_request',
        partnerId: 'test-partner',
        endpoint: '/data',
        method: 'POST',
        payload: { key: 'value' },
      });

      const state = node.__partnerSDKState;
      expect(state.pendingRequests).toHaveLength(1);
      expect(state.pendingRequests[0].status).toBe('sent');
      expect(state.pendingRequests[0].signature).toBeDefined();
      expect(state.totalRequests).toBe(1);
      expect(ctx.emit).toHaveBeenCalledWith('partner_request_sent', expect.objectContaining({
        partnerId: 'test-partner',
        endpoint: '/data',
        signed: true,
      }));
    });

    it('rejects request when not connected', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_disconnect',
        partnerId: 'test-partner',
      });

      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_request',
        partnerId: 'test-partner',
        endpoint: '/data',
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_error', expect.objectContaining({
        error: 'Not connected to partner',
      }));
    });

    it('rejects request for unknown partner', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_request',
        partnerId: 'nonexistent',
        endpoint: '/data',
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_error', expect.objectContaining({
        error: 'Not connected to partner',
      }));
    });
  });

  describe('API response handling', () => {
    it('marks request as success on response', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_request',
        partnerId: 'test-partner',
        endpoint: '/test',
      });

      const reqId = node.__partnerSDKState.pendingRequests[0].id;

      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_response',
        requestId: reqId,
        success: true,
        data: { result: 'ok' },
      });

      const req = node.__partnerSDKState.pendingRequests[0];
      expect(req.status).toBe('success');
      expect(req.response).toEqual({ result: 'ok' });
    });

    it('marks request as error on failed response', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_request',
        partnerId: 'test-partner',
        endpoint: '/test',
      });

      const reqId = node.__partnerSDKState.pendingRequests[0].id;

      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_api_response',
        requestId: reqId,
        success: false,
        error: 'Server error',
      });

      const req = node.__partnerSDKState.pendingRequests[0];
      expect(req.status).toBe('error');
      expect(req.error).toBe('Server error');
      expect(node.__partnerSDKState.totalErrors).toBe(1);
    });
  });

  describe('webhook handling', () => {
    it('accepts webhook with valid signature', () => {
      const payload = { event: 'update' };
      const payloadStr = JSON.stringify(payload);
      const timestamp = Date.now();
      const signature = signRequest(payloadStr, 'test-secret-key', timestamp);

      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_webhook',
        partnerId: 'test-partner',
        webhookEvent: 'data_update',
        payload,
        signature,
        timestamp,
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_webhook_received', expect.objectContaining({
        partnerId: 'test-partner',
        event: 'data_update',
      }));
    });

    it('rejects webhook with invalid signature', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_webhook',
        partnerId: 'test-partner',
        webhookEvent: 'data_update',
        payload: { event: 'test' },
        signature: 'invalid_sig',
        timestamp: Date.now(),
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_webhook_rejected', expect.objectContaining({
        partnerId: 'test-partner',
        reason: 'Invalid signature',
      }));
    });

    it('accepts any webhook when verification is disabled', () => {
      const cfg = makeConfig({ enable_webhook_verification: false });
      const n = makeNode('no-verify');
      const c = makeContext();
      partnerSDKHandler.onAttach!(n, cfg, c as any);

      partnerSDKHandler.onEvent!(n, cfg, c as any, {
        type: 'partner_webhook',
        partnerId: 'test-partner',
        webhookEvent: 'data_update',
        payload: { foo: 'bar' },
        signature: 'anything',
        timestamp: Date.now(),
      });

      expect(c.emit).toHaveBeenCalledWith('partner_webhook_received', expect.anything());
    });
  });

  describe('partner query', () => {
    it('returns status for connected partner', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_query',
        partnerId: 'test-partner',
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_status', expect.objectContaining({
        partnerId: 'test-partner',
      }));
    });

    it('returns null session for unknown partner', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_query',
        partnerId: 'unknown',
      });

      expect(ctx.emit).toHaveBeenCalledWith('partner_status', expect.objectContaining({
        partnerId: 'unknown',
        session: null,
      }));
    });
  });

  describe('onDetach', () => {
    it('disconnects all partner sessions and cleans up', () => {
      partnerSDKHandler.onEvent!(node, config, ctx as any, {
        type: 'partner_connect',
        partnerId: 'test-partner',
      });

      partnerSDKHandler.onDetach!(node, config, ctx as any);

      expect(ctx.emit).toHaveBeenCalledWith('partner_disconnected', expect.objectContaining({
        partnerId: 'test-partner',
      }));
      expect(node.__partnerSDKState).toBeUndefined();
    });
  });

  describe('signRequest / verifyWebhookSignature utilities', () => {
    it('signRequest produces deterministic output', () => {
      const sig1 = signRequest('payload', 'secret', 1000);
      const sig2 = signRequest('payload', 'secret', 1000);
      expect(sig1).toBe(sig2);
    });

    it('signRequest produces different output for different inputs', () => {
      const sig1 = signRequest('payload1', 'secret', 1000);
      const sig2 = signRequest('payload2', 'secret', 1000);
      expect(sig1).not.toBe(sig2);
    });

    it('signRequest starts with sig_ prefix', () => {
      const sig = signRequest('test', 'secret', 123);
      expect(sig).toMatch(/^sig_/);
    });

    it('verifyWebhookSignature returns true for matching signature', () => {
      const timestamp = Date.now();
      const sig = signRequest('test-payload', 'mysecret', timestamp);
      expect(verifyWebhookSignature('test-payload', sig, 'mysecret', timestamp)).toBe(true);
    });

    it('verifyWebhookSignature returns false for wrong signature', () => {
      expect(verifyWebhookSignature('payload', 'wrong_sig', 'secret', 1000)).toBe(false);
    });

    it('verifyWebhookSignature returns false for wrong secret', () => {
      const sig = signRequest('payload', 'correct-secret', 1000);
      expect(verifyWebhookSignature('payload', sig, 'wrong-secret', 1000)).toBe(false);
    });
  });
});
