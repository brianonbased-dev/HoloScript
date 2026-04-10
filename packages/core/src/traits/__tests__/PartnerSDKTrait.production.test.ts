/**
 * PartnerSDKTrait — Production Test Suite
 *
 * Commence All V — Track 4: New Feature Traits
 *
 * Coverage:
 *  - onAttach initializes state, emits init event
 *  - Partner connection/disconnection lifecycle
 *  - API request signing and sending
 *  - Rate limiting enforcement
 *  - Concurrent request cap
 *  - Request timeout handling via onUpdate
 *  - Session TTL expiry via onUpdate
 *  - Webhook verification (valid/invalid signatures)
 *  - API response processing (success/error)
 *  - Partner query status
 *  - onDetach cleanup
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { partnerSDKHandler, signRequest, verifyWebhookSignature } from '../PartnerSDKTrait';
import type { PartnerSDKConfig, PartnerSDKState } from '../PartnerSDKTrait';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createNode(): any {
  return { id: 'test-node' };
}

function createContext() {
  return {
    emit: vi.fn(),
    vr: {} as any,
    physics: {} as any,
    audio: {} as any,
    haptics: {} as any,
    getState: () => ({}),
    setState: vi.fn(),
    getScaleMultiplier: () => 1,
    setScaleContext: vi.fn(),
  };
}

function defaultConfig(overrides?: Partial<PartnerSDKConfig>): PartnerSDKConfig {
  return {
    ...partnerSDKHandler.defaultConfig,
    partners: [
      {
        id: 'partner-a',
        name: 'Partner A',
        base_url: 'https://api.partner-a.com',
        auth_mode: 'hmac',
        api_key: 'key-a',
        secret: 'secret-a',
        capabilities: ['render', 'analytics'],
        version: '2.0.0',
      },
    ],
    ...overrides,
  };
}

function attach(node: any, config: PartnerSDKConfig, context: any) {
  partnerSDKHandler.onAttach!(node, config, context);
}

function getState(node: any): PartnerSDKState {
  return node.__partnerSDKState;
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PartnerSDKTrait — Production Tests', () => {
  let node: any;
  let ctx: ReturnType<typeof createContext>;

  beforeEach(() => {
    node = createNode();
    ctx = createContext();
  });

  // =========================================================================
  // Initialization
  // =========================================================================
  describe('initialization', () => {
    it('onAttach creates state', () => {
      attach(node, defaultConfig(), ctx);
      expect(getState(node)).toBeDefined();
      expect(getState(node).sessions.size).toBe(0);
    });

    it('emits partner_sdk_initialized', () => {
      attach(node, defaultConfig(), ctx);
      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_sdk_initialized',
        expect.objectContaining({
          partnerCount: 1,
        })
      );
    });
  });

  // =========================================================================
  // Partner connection
  // =========================================================================
  describe('partner connection', () => {
    it('connects to known partner', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      const state = getState(node);
      const session = state.sessions.get('partner-a');
      expect(session).toBeDefined();
      expect(session!.status).toBe('connected');
      expect(session!.capabilities).toEqual(['render', 'analytics']);
      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_connected',
        expect.objectContaining({
          partnerId: 'partner-a',
        })
      );
    });

    it('rejects unknown partner', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'unknown',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_error',
        expect.objectContaining({
          partnerId: 'unknown',
          error: expect.stringContaining('Unknown partner'),
        })
      );
    });

    it('disconnects partner', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_disconnect',
        partnerId: 'partner-a',
      });

      expect(getState(node).sessions.get('partner-a')!.status).toBe('disconnected');
    });
  });

  // =========================================================================
  // API requests
  // =========================================================================
  describe('API requests', () => {
    it('sends signed request', () => {
      const config = defaultConfig();
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/render',
        method: 'POST',
        payload: { scene: 'test' },
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_request_sent',
        expect.objectContaining({
          partnerId: 'partner-a',
          endpoint: '/render',
          signed: true,
        })
      );

      const state = getState(node);
      expect(state.pendingRequests.length).toBe(1);
      expect(state.totalRequests).toBe(1);
    });

    it('rejects request when not connected', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/test',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_error',
        expect.objectContaining({
          error: 'Not connected to partner',
        })
      );
    });

    it('enforces rate limiting', () => {
      const config = defaultConfig({
        rate_limit_per_partner: 2,
        rate_limit_window_ms: 60000,
      });
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      // Send 2 requests (within limit)
      for (let i = 0; i < 2; i++) {
        partnerSDKHandler.onEvent!(node, config, ctx, {
          type: 'partner_api_request',
          partnerId: 'partner-a',
          endpoint: `/test/${i}`,
        });
      }

      // 3rd should be rate limited
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/test/3',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_rate_limited',
        expect.objectContaining({
          partnerId: 'partner-a',
        })
      );
    });

    it('enforces concurrent request cap', () => {
      const config = defaultConfig({ max_concurrent_requests: 1 });
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      // First request
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/first',
      });

      // Second should be blocked
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/second',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_error',
        expect.objectContaining({
          error: 'Max concurrent requests exceeded',
        })
      );
    });
  });

  // =========================================================================
  // API response
  // =========================================================================
  describe('API response', () => {
    it('processes successful response', () => {
      const config = defaultConfig();
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/test',
      });

      const state = getState(node);
      const requestId = state.pendingRequests[0].id;

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_response',
        requestId,
        success: true,
        data: { result: 'ok' },
      });

      const req = state.pendingRequests.find((r) => r.id === requestId);
      expect(req!.status).toBe('success');
    });

    it('processes error response', () => {
      const config = defaultConfig();
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/test',
      });

      const state = getState(node);
      const requestId = state.pendingRequests[0].id;

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_response',
        requestId,
        success: false,
        error: 'Server error',
      });

      expect(state.totalErrors).toBe(1);
    });
  });

  // =========================================================================
  // Webhook
  // =========================================================================
  describe('webhook verification', () => {
    it('accepts valid webhook signature', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      const payload = { event: 'render_complete' };
      const ts = Date.now();
      const sig = signRequest(JSON.stringify(payload), 'secret-a', ts);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_webhook',
        partnerId: 'partner-a',
        webhookEvent: 'render_complete',
        payload,
        signature: sig,
        timestamp: ts,
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_webhook_received',
        expect.objectContaining({
          partnerId: 'partner-a',
          event: 'render_complete',
        })
      );
    });

    it('rejects invalid webhook signature', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_webhook',
        partnerId: 'partner-a',
        webhookEvent: 'render_complete',
        payload: { data: 'test' },
        signature: 'invalid_sig',
        timestamp: Date.now(),
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_webhook_rejected',
        expect.objectContaining({
          reason: 'Invalid signature',
        })
      );
    });
  });

  // =========================================================================
  // Session TTL
  // =========================================================================
  describe('session TTL', () => {
    it('expires sessions past TTL on update', () => {
      const config = defaultConfig({ session_ttl_ms: 100 });
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      // Force session expiry
      const session = getState(node).sessions.get('partner-a')!;
      session.expiresAt = Date.now() - 1;

      partnerSDKHandler.onUpdate!(node, config, ctx, 16);

      expect(session.status).toBe('disconnected');
      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_session_expired',
        expect.objectContaining({
          partnerId: 'partner-a',
        })
      );
    });
  });

  // =========================================================================
  // Request timeout
  // =========================================================================
  describe('request timeout', () => {
    it('times out old requests on update', () => {
      const config = defaultConfig({ request_timeout_ms: 100 });
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_api_request',
        partnerId: 'partner-a',
        endpoint: '/slow',
      });

      // Force timeout
      const req = getState(node).pendingRequests[0];
      req.timestamp = Date.now() - 200;

      partnerSDKHandler.onUpdate!(node, config, ctx, 16);

      expect(req.status).toBe('error');
      expect(req.error).toBe('Request timed out');
    });
  });

  // =========================================================================
  // Partner query
  // =========================================================================
  describe('partner query', () => {
    it('returns partner status', () => {
      const config = defaultConfig();
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_query',
        partnerId: 'partner-a',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_status',
        expect.objectContaining({
          partnerId: 'partner-a',
          session: expect.objectContaining({ status: 'connected' }),
        })
      );
    });

    it('returns null session for unknown partner', () => {
      const config = defaultConfig();
      attach(node, config, ctx);

      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_query',
        partnerId: 'unknown',
      });

      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_status',
        expect.objectContaining({
          session: null,
        })
      );
    });
  });

  // =========================================================================
  // Detach
  // =========================================================================
  describe('detach', () => {
    it('disconnects all sessions and cleans state', () => {
      const config = defaultConfig();
      attach(node, config, ctx);
      partnerSDKHandler.onEvent!(node, config, ctx, {
        type: 'partner_connect',
        partnerId: 'partner-a',
      });

      partnerSDKHandler.onDetach!(node, config, ctx);

      expect(node.__partnerSDKState).toBeUndefined();
      expect(ctx.emit).toHaveBeenCalledWith(
        'partner_disconnected',
        expect.objectContaining({
          partnerId: 'partner-a',
        })
      );
    });
  });

  // =========================================================================
  // Signing helpers
  // =========================================================================
  describe('signing helpers', () => {
    it('signRequest produces deterministic signature', () => {
      const sig1 = signRequest('payload', 'secret', 1000);
      const sig2 = signRequest('payload', 'secret', 1000);
      expect(sig1).toBe(sig2);
    });

    it('different payload produces different signature', () => {
      const sig1 = signRequest('a', 'secret', 1000);
      const sig2 = signRequest('b', 'secret', 1000);
      expect(sig1).not.toBe(sig2);
    });

    it('verifyWebhookSignature validates correctly', () => {
      const sig = signRequest('data', 'secret', 1000);
      expect(verifyWebhookSignature('data', sig, 'secret', 1000)).toBe(true);
      expect(verifyWebhookSignature('tampered', sig, 'secret', 1000)).toBe(false);
    });
  });
});
