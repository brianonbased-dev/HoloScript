/**
 * @holoscript/snn-webgpu - HoloMesh Prophecy Transport
 *
 * Sends scene context to peer agents over the HoloMesh CRDT feed at
 * `crdt://holomesh/feed/ttu/<sessionId>` and receives ProphecyFrames
 * back. The CRDT feed is fronted by the HoloMesh REST/SSE shim:
 *   POST /api/holomesh/ttu/<sessionId>/step      — submit scene, await frame
 *   POST /api/holomesh/ttu/<sessionId>/publish   — publish a frame
 *   GET  /api/holomesh/ttu/<sessionId>/live      — SSE subscription
 *
 * Many agents may converge on the same session id — that's the point of
 * sibling task `_0v98` ("Phase 2: Multi-Agent Convergence"). Any peer
 * that POSTs to `/publish` wakes pending `step()` calls; the transport
 * itself does not need to be the producer.
 *
 * Behaviour:
 *   - `initialize()` resolves the endpoint into a concrete REST base URL
 *     and prepares the fallback transport (if supplied) so it's ready
 *     when the network round-trip blows the latency budget.
 *   - `step()` POSTs the scene context to `/step` with a server-side
 *     timeout matching the caller's `latencyBudgetMs`. On any failure
 *     (network, timeout, non-2xx) it falls back to the local transport
 *     when one is configured, tagging the frame `source: 'fallback'`.
 *     Without a fallback it throws ProphecyNotImplementedError.
 *
 * The endpoint URL format is one of:
 *   crdt://holomesh/feed/ttu/<sessionId>          (canonical CRDT URI)
 *   https://host[:port]/api/holomesh/ttu/<sid>    (already-resolved REST)
 *   <host[:port]>/api/holomesh/ttu/<sessionId>    (host shorthand)
 *   ttu://<host>/<sessionId>                       (compact alias)
 */

import {
  ProphecyNotImplementedError,
  type ProphecyConfig,
  type ProphecyFrame,
  type ProphecySceneContext,
  type ProphecyTransport,
} from './types.js';

export interface HoloMeshProphecyTransportOptions {
  /**
   * Endpoint URL. Canonical form is `crdt://holomesh/feed/ttu/<sessionId>`,
   * which resolves against `holomeshHost` (defaults to
   * `https://mcp.holoscript.net`). Already-resolved http(s) URLs and
   * the `ttu://host/session` shorthand are also accepted.
   */
  endpoint: string;
  /** Round-trip budget in milliseconds. Default 5000. */
  latencyBudgetMs?: number;
  /**
   * Host that fronts the HoloMesh CRDT feed (REST + SSE). Only consulted
   * when `endpoint` is a `crdt://` URI. Defaults to
   * `https://mcp.holoscript.net`.
   */
  holomeshHost?: string;
  /** Optional bearer token for authenticated routes. */
  apiKey?: string;
  /** Identifier sent in `agent_id` so producers can attribute scenes. */
  agentId?: string;
  /** Fallback transport, e.g. a LocalProphecyTransport. */
  fallback?: ProphecyTransport;
  /**
   * Injectable fetch — defaults to global `fetch`. Tests inject a fake
   * to keep this file dependency-free and keep CI off the network.
   */
  fetchImpl?: typeof fetch;
}

interface ResolvedEndpoint {
  /** Base REST URL: `<host>/api/holomesh/ttu/<sessionId>` */
  base: string;
  /** Session id parsed out of the endpoint. */
  sessionId: string;
}

/**
 * Resolve any of the supported endpoint forms into a concrete REST base
 * URL and the underlying session id. Pure / synchronous so it can be
 * called from `initialize()` (and validated up-front).
 */
export function resolveTtuEndpoint(
  endpoint: string,
  holomeshHost: string = 'https://mcp.holoscript.net'
): ResolvedEndpoint {
  if (!endpoint || typeof endpoint !== 'string') {
    throw new Error('HoloMeshProphecyTransport: endpoint must be a non-empty string');
  }
  const host = holomeshHost.replace(/\/+$/, '');

  // crdt://holomesh/feed/ttu/<sessionId>
  if (endpoint.startsWith('crdt://')) {
    const rest = endpoint.slice('crdt://'.length);
    // Expect: holomesh/feed/ttu/<sessionId>
    const parts = rest.split('/').filter(Boolean);
    if (
      parts.length < 4 ||
      parts[0] !== 'holomesh' ||
      parts[1] !== 'feed' ||
      parts[2] !== 'ttu'
    ) {
      throw new Error(
        `HoloMeshProphecyTransport: unsupported CRDT URI shape: ${endpoint} ` +
          `(expected crdt://holomesh/feed/ttu/<sessionId>)`
      );
    }
    const sessionId = parts.slice(3).join('/');
    return { base: `${host}/api/holomesh/ttu/${sessionId}`, sessionId };
  }

  // ttu://host/sessionId  — compact shorthand for tests / local dev.
  if (endpoint.startsWith('ttu://')) {
    const rest = endpoint.slice('ttu://'.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length < 2) {
      throw new Error(
        `HoloMeshProphecyTransport: unsupported ttu URI shape: ${endpoint}`
      );
    }
    const targetHost = parts[0].includes('://') ? parts[0] : `https://${parts[0]}`;
    const sessionId = parts.slice(1).join('/');
    return {
      base: `${targetHost}/api/holomesh/ttu/${sessionId}`,
      sessionId,
    };
  }

  // Already-resolved http(s) URL pointing at the REST base.
  if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
    const trimmed = endpoint.replace(/\/+$/, '');
    const m = trimmed.match(/\/api\/holomesh\/ttu\/([^/]+)$/);
    if (!m) {
      throw new Error(
        `HoloMeshProphecyTransport: http(s) endpoint must end with /api/holomesh/ttu/<sessionId>, got: ${endpoint}`
      );
    }
    return { base: trimmed, sessionId: m[1] };
  }

  throw new Error(
    `HoloMeshProphecyTransport: unsupported endpoint scheme: ${endpoint} ` +
      `(use crdt://, ttu://, or http(s)://)`
  );
}

export class HoloMeshProphecyTransport implements ProphecyTransport {
  readonly kind = 'holomesh' as const;

  private resolved: ResolvedEndpoint | null = null;
  private initializedFallback = false;
  private lastFrame: ProphecyFrame | null = null;
  private readonly latencyBudgetMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: HoloMeshProphecyTransportOptions) {
    this.latencyBudgetMs = options.latencyBudgetMs ?? 5_000;
    // Defer the global fetch lookup so SSR/Node-without-fetch environments
    // still load this module; we only require fetch when step() runs.
    this.fetchImpl =
      options.fetchImpl ??
      ((...args: Parameters<typeof fetch>) => {
        const f = (globalThis as { fetch?: typeof fetch }).fetch;
        if (!f) {
          throw new Error(
            'HoloMeshProphecyTransport: global fetch is unavailable; pass options.fetchImpl'
          );
        }
        return f(...args);
      });
  }

  async initialize(config: ProphecyConfig): Promise<void> {
    // Resolve up-front so a malformed endpoint surfaces at construction-
    // adjacent time rather than first frame.
    this.resolved = resolveTtuEndpoint(
      this.options.endpoint,
      this.options.holomeshHost
    );

    if (this.options.fallback && !this.initializedFallback) {
      await this.options.fallback.initialize(config);
      this.initializedFallback = true;
    }
  }

  async step(scene: ProphecySceneContext): Promise<ProphecyFrame> {
    if (!this.resolved) {
      throw new Error('HoloMeshProphecyTransport: must call initialize() first');
    }

    const url = `${this.resolved.base}/step`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.options.apiKey) {
      headers['Authorization'] = `Bearer ${this.options.apiKey}`;
    }

    const body = JSON.stringify({
      scene,
      agent_id: this.options.agentId ?? 'anonymous',
      // Server-side budget is matched to the caller's; the AbortController
      // gives us a hard client-side ceiling so a hung server can't block
      // the renderer past one frame.
      timeout_ms: this.latencyBudgetMs,
    });

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.latencyBudgetMs);

    let frame: ProphecyFrame | null = null;
    let lastError: unknown = null;
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: ac.signal,
      });
      if (!res.ok) {
        lastError = new Error(`ttu /step returned ${res.status}`);
      } else {
        const data = (await res.json()) as { success?: boolean; frame?: ProphecyFrame };
        if (data?.success && data.frame) {
          // Ensure the source is tagged as 'holomesh' regardless of what the
          // publisher claimed — that's how the renderer / overlay attributes
          // it (the publisher's own `source` may be 'local' from their POV).
          frame = { ...data.frame, source: 'holomesh' };
        } else {
          lastError = new Error('ttu /step returned malformed payload');
        }
      }
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }

    if (frame) {
      this.lastFrame = frame;
      return frame;
    }

    // Round-trip failed — fall back if we can.
    if (this.options.fallback) {
      const fb = await this.options.fallback.step(scene);
      const tagged: ProphecyFrame = { ...fb, source: 'fallback' };
      this.lastFrame = tagged;
      return tagged;
    }

    const reason =
      lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown');
    throw new ProphecyNotImplementedError(
      `holomesh@${this.options.endpoint} (no fallback configured; last error: ${reason})`
    );
  }

  async destroy(): Promise<void> {
    if (this.options.fallback && this.initializedFallback) {
      await this.options.fallback.destroy();
      this.initializedFallback = false;
    }
    this.lastFrame = null;
    this.resolved = null;
  }
}
