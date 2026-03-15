/**
 * WebhookTrait — v5.1
 *
 * HTTP trigger and callback integration for HoloScript compositions.
 * Supports outbound HTTP requests (fetch-based) and HMAC signature
 * validation for inbound webhook verification.
 *
 * Events:
 *  webhook:sent      { url, method, status, elapsed }
 *  webhook:received  { path, method, body, verified }
 *  webhook:error     { url, error }
 *  webhook:send      (command) Fire an outbound request
 *  webhook:incoming  (inbound) Process an incoming webhook
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookConfig {
  /** Default target URL for outbound requests */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Default headers */
  headers: Record<string, string>;
  /** Request timeout in ms */
  timeout_ms: number;
  /** HMAC secret for signature validation (empty = no validation) */
  secret: string;
  /** HMAC algorithm */
  hmac_algorithm: string;
  /** Max request history stored */
  max_history: number;
}

export interface WebhookHistoryEntry {
  id: string;
  url: string;
  method: string;
  status: number;
  elapsed: number;
  timestamp: number;
  direction: 'inbound' | 'outbound';
}

export interface WebhookState {
  history: WebhookHistoryEntry[];
  requestCounter: number;
  totalSent: number;
  totalReceived: number;
  totalErrors: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const webhookHandler: TraitHandler<WebhookConfig> = {
  name: 'webhook',

  defaultConfig: {
    url: '',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout_ms: 30000,
    secret: '',
    hmac_algorithm: 'sha256',
    max_history: 50,
  },

  onAttach(node: any, _config: WebhookConfig, context: any): void {
    const state: WebhookState = {
      history: [],
      requestCounter: 0,
      totalSent: 0,
      totalReceived: 0,
      totalErrors: 0,
    };
    node.__webhookState = state;
    context.emit?.('webhook:ready', { timestamp: Date.now() });
  },

  onDetach(node: any, _config: WebhookConfig, _context: any): void {
    delete node.__webhookState;
  },

  onUpdate(_node: any, _config: WebhookConfig, _context: any, _delta: number): void {
    // Event-driven
  },

  onEvent(node: any, config: WebhookConfig, context: any, event: any): void {
    const state: WebhookState | undefined = node.__webhookState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      case 'webhook:send': {
        const url = (payload.url as string) || config.url;
        const method = (payload.method as string) || config.method;
        const body = payload.body;
        const headers = { ...config.headers, ...(payload.headers ?? {}) };

        if (!url) {
          context.emit?.('webhook:error', { url: '', error: 'No URL configured' });
          return;
        }

        const startTime = Date.now();
        const reqId = `req_${state.requestCounter++}`;

        // Use fetch (available in Node 18+ and all modern runtimes)
        const controller = new AbortController();
        const timer = config.timeout_ms > 0
          ? setTimeout(() => controller.abort(), config.timeout_ms)
          : null;

        fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        })
          .then(async (res) => {
            if (timer) clearTimeout(timer);
            const elapsed = Date.now() - startTime;

            const entry: WebhookHistoryEntry = {
              id: reqId,
              url,
              method,
              status: res.status,
              elapsed,
              timestamp: Date.now(),
              direction: 'outbound',
            };
            state.history.push(entry);
            if (state.history.length > config.max_history) state.history.shift();
            state.totalSent++;

            context.emit?.('webhook:sent', {
              url,
              method,
              status: res.status,
              elapsed,
            });
          })
          .catch((err: any) => {
            if (timer) clearTimeout(timer);
            state.totalErrors++;
            context.emit?.('webhook:error', {
              url,
              error: err.name === 'AbortError' ? 'Timeout' : err.message,
            });
          });

        break;
      }

      case 'webhook:incoming': {
        state.totalReceived++;
        let verified = true;

        // HMAC signature validation
        if (config.secret && payload.signature) {
          try {
            const crypto = require('crypto');
            const expected = crypto
              .createHmac(config.hmac_algorithm, config.secret)
              .update(JSON.stringify(payload.body ?? ''))
              .digest('hex');
            verified = payload.signature === expected;
          } catch {
            verified = false;
          }
        }

        const entry: WebhookHistoryEntry = {
          id: `in_${state.requestCounter++}`,
          url: payload.path ?? '/',
          method: payload.method ?? 'POST',
          status: verified ? 200 : 401,
          elapsed: 0,
          timestamp: Date.now(),
          direction: 'inbound',
        };
        state.history.push(entry);
        if (state.history.length > config.max_history) state.history.shift();

        context.emit?.('webhook:received', {
          path: payload.path ?? '/',
          method: payload.method ?? 'POST',
          body: payload.body,
          verified,
        });
        break;
      }

      case 'webhook:get_history': {
        context.emit?.('webhook:history', {
          history: state.history,
          totalSent: state.totalSent,
          totalReceived: state.totalReceived,
          totalErrors: state.totalErrors,
        });
        break;
      }
    }
  },
};

export default webhookHandler;
