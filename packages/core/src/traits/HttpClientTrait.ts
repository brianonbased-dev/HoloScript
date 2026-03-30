/**
 * HttpClientTrait — v5.1
 *
 * Event-driven HTTP client with optional host capability delegation.
 * Supports direct requests and BehaviorTree action bridging.
 *
 * Events in:
 *  http:request         { requestId?, url|path, method?, headers?, body?, query?, response_type? }
 *  action:http_request  { requestId, params: HttpRequestPayload }
 *
 * Events out:
 *  http:request_start   { requestId, url, method }
 *  http:response        { requestId, status, ok, data, headers, duration_ms, url }
 *  http:error           { requestId, error, duration_ms, url }
 *  action:result        { requestId, status, success, output|error }
 *
 * @version 1.0.0
 */

import type { HostNetworkResponse, HostNetworkRequestOptions, TraitHandler } from './TraitTypes';

export interface HttpClientConfig {
  base_url: string;
  method: string;
  headers: Record<string, string>;
  timeout_ms: number;
  response_type: 'json' | 'text' | 'raw';
  include_credentials: boolean;
}

interface HttpRequestPayload {
  requestId?: string;
  url?: string;
  path?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  query?: Record<string, string | number | boolean>;
  response_type?: 'json' | 'text' | 'raw';
}

export interface HttpClientState {
  pendingRequests: Set<string>;
  totalRequests: number;
}

function buildUrl(baseUrl: string, payload: HttpRequestPayload): string {
  const rawUrl = payload.url ?? payload.path ?? '';
  const root = baseUrl || '';
  const initial = root ? new URL(rawUrl, root).toString() : rawUrl;

  if (!payload.query || Object.keys(payload.query).length === 0) {
    return initial;
  }

  const url = new URL(initial);
  for (const [key, value] of Object.entries(payload.query)) {
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function normalizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const output: Record<string, string> = {};
  if (!headers) return output;

  for (const [key, value] of Object.entries(headers)) {
    output[key.toLowerCase()] = String(value);
  }
  return output;
}

function normalizeBody(body: unknown, headers: Record<string, string>): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;

  if (!headers['content-type']) {
    headers['content-type'] = 'application/json';
  }
  return JSON.stringify(body);
}

function normalizeActionPayload(event: any): HttpRequestPayload {
  const payload = event?.payload ?? event;
  const params = payload?.params;

  if (params && typeof params === 'object') {
    return {
      requestId: payload.requestId,
      ...(params as HttpRequestPayload),
    };
  }

  return payload as HttpRequestPayload;
}

async function parseResponse(
  response: HostNetworkResponse,
  responseType: 'json' | 'text' | 'raw'
): Promise<unknown> {
  if (responseType === 'raw') {
    return response.body ?? response;
  }

  if (responseType === 'text') {
    if (response.text !== undefined) return response.text;
    if (response.body !== undefined) return String(response.body);
    return '';
  }

  if (response.json !== undefined) return response.json;
  if (response.body !== undefined) {
    if (typeof response.body === 'string') {
      try {
        return JSON.parse(response.body);
      } catch {
        return response.body;
      }
    }
    return response.body;
  }

  return null;
}

async function callHttp(
  context: any,
  url: string,
  options: HostNetworkRequestOptions
): Promise<HostNetworkResponse> {
  const networkCaps = context.hostCapabilities?.network;
  if (networkCaps?.fetch) {
    return Promise.resolve(networkCaps.fetch(url, options));
  }

  if (typeof fetch === 'undefined') {
    throw new Error('fetch is not available in this runtime');
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timeoutId =
    options.timeoutMs && options.timeoutMs > 0 && controller
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null;

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      credentials: options.credentials,
      signal: controller?.signal,
    } as any);

    const rawHeaders: Record<string, string> = {};
    try {
      response.headers.forEach((value: string, key: string) => {
        rawHeaders[key.toLowerCase()] = value;
      });
    } catch {
      // Best effort; some mock responses may not provide iterable headers.
    }

    const contentType = rawHeaders['content-type'] ?? '';
    let body: unknown;
    let text: string | undefined;
    let json: unknown;

    if (contentType.includes('application/json')) {
      try {
        json = await response.json();
        body = json;
      } catch {
        text = await response.text();
        body = text;
      }
    } else {
      text = await response.text();
      body = text;
    }

    return {
      status: response.status,
      ok: response.ok,
      headers: rawHeaders,
      body,
      text,
      json,
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export const httpClientHandler: TraitHandler<HttpClientConfig> = {
  name: 'http',

  defaultConfig: {
    base_url: '',
    method: 'GET',
    headers: {},
    timeout_ms: 30000,
    response_type: 'json',
    include_credentials: false,
  },

  onAttach(node: any): void {
    const state: HttpClientState = {
      pendingRequests: new Set<string>(),
      totalRequests: 0,
    };
    node.__httpClientState = state;
  },

  onDetach(node: any): void {
    delete node.__httpClientState;
  },

  onUpdate(): void {},

  onEvent(node: any, config: HttpClientConfig, context: any, event: any): void {
    const state: HttpClientState | undefined = node.__httpClientState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    if (eventType !== 'http:request' && eventType !== 'action:http_request') {
      return;
    }

    const payload = normalizeActionPayload(event);
    const requestId = payload.requestId ?? `http-${Date.now()}-${state.totalRequests + 1}`;

    const method = (payload.method ?? config.method ?? 'GET').toUpperCase();
    const headers = normalizeHeaders({ ...config.headers, ...(payload.headers ?? {}) });
    const body = normalizeBody(payload.body, headers);
    const url = buildUrl(config.base_url, payload);
    const responseType = payload.response_type ?? config.response_type;

    if (!url) {
      context.emit?.('http:error', {
        requestId,
        error: 'No URL provided for request',
        url: '',
        duration_ms: 0,
      });
      if (eventType === 'action:http_request') {
        context.emit?.('action:result', {
          requestId,
          status: 'failure',
          success: false,
          error: 'No URL provided for request',
        });
      }
      return;
    }

    state.pendingRequests.add(requestId);
    state.totalRequests += 1;

    context.emit?.('http:request_start', {
      requestId,
      method,
      url,
    });

    const startedAt = Date.now();
    const credentials = config.include_credentials ? 'include' : 'omit';

    void callHttp(context, url, {
      method,
      headers,
      body,
      timeoutMs: config.timeout_ms,
      credentials,
    })
      .then(async (response) => {
        const durationMs = Date.now() - startedAt;
        const data = await parseResponse(response, responseType);

        context.emit?.('http:response', {
          requestId,
          status: response.status,
          ok: response.ok,
          data,
          headers: response.headers,
          duration_ms: durationMs,
          url,
        });

        if (!response.ok) {
          const error = `HTTP ${response.status}`;
          context.emit?.('http:error', {
            requestId,
            error,
            status: response.status,
            duration_ms: durationMs,
            url,
          });

          if (eventType === 'action:http_request') {
            context.emit?.('action:result', {
              requestId,
              status: 'failure',
              success: false,
              error,
              output: data,
            });
          }
          return;
        }

        if (eventType === 'action:http_request') {
          context.emit?.('action:result', {
            requestId,
            status: 'success',
            success: true,
            output: data,
          });
        }
      })
      .catch((err: any) => {
        const durationMs = Date.now() - startedAt;
        const message = err?.message ?? String(err);
        context.emit?.('http:error', {
          requestId,
          error: message,
          duration_ms: durationMs,
          url,
        });

        if (eventType === 'action:http_request') {
          context.emit?.('action:result', {
            requestId,
            status: 'failure',
            success: false,
            error: message,
          });
        }
      })
      .finally(() => {
        state.pendingRequests.delete(requestId);
      });
  },
};

export default httpClientHandler;
