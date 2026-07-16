export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type LoggerFn = (message: string) => void;

/**
 * Jetson-first sovereign anchor (dependency-sovereignty-ladder, ratified 2026-07-16).
 * The always-on LAN Jetson node is tried BEFORE any Railway endpoint in the default
 * cascade. Override with MCP_ORCHESTRATOR_JETSON_URL; set it to '' to disable the
 * Jetson-first attempt entirely (e.g. permanently off-LAN deployments).
 */
const DEFAULT_JETSON_URL = 'http://192.168.0.119:3001';
/** Short connect budget for the LAN attempt so off-LAN use fails over fast. */
const DEFAULT_JETSON_TIMEOUT_MS = 1000;
/** A dead Jetson is memoized (circuit OPEN) this long before a single re-probe. */
const DEFAULT_JETSON_RESET_TIMEOUT_MS = 5 * 60 * 1000;

export interface ResilientFetchOptions {
  /** Override the default fallback cascade */
  urls?: string[];
  /** Number of consecutive failures before opening the circuit */
  failureThreshold?: number;
  /** Time in ms to wait before probing a downed endpoint again */
  resetTimeoutMs?: number;
  /** Optional logger for auto-failover events */
  logger?: LoggerFn;
  /**
   * Jetson-first (sovereign LAN) base URL. Defaults to
   * MCP_ORCHESTRATOR_JETSON_URL, then http://192.168.0.119:3001.
   * Pass '' to disable the Jetson-first attempt.
   */
  jetsonUrl?: string;
  /** Connect timeout (ms) for the Jetson attempt so off-LAN use degrades fast. Default 1000. */
  jetsonTimeoutMs?: number;
  /** How long (ms) a dead Jetson stays skipped before one re-probe. Default 5 minutes. */
  jetsonResetTimeoutMs?: number;
}

/**
 * Resilient fetching utility that implements a Circuit Breaker pattern
 * and cascades through a list of fallback endpoints automatically.
 *
 * Default cascade order (CHOKEPOINT-CAPTURE, dependency-sovereignty-ladder):
 *   1. Jetson LAN anchor (short timeout, trips OPEN after ONE failure so a dead
 *      Jetson is not re-paid on every call — re-probed after jetsonResetTimeoutMs)
 *   2. MCP_ORCHESTRATOR_URL (explicit operator override, if set)
 *   3. Railway internal, Railway public, localhost
 */
export class ResilientOrchestratorFetch {
  private urls: string[];
  private failureThreshold: number;
  private resetTimeoutMs: number;
  private logger: LoggerFn;
  private jetsonUrl: string | null;
  private jetsonTimeoutMs: number;
  private jetsonResetTimeoutMs: number;

  // State per endpoint
  private state: Map<string, CircuitBreakerState> = new Map();
  private failureCount: Map<string, number> = new Map();
  private nextAttempt: Map<string, number> = new Map();

  private defaultUrls = [
    process.env.MCP_ORCHESTRATOR_URL,
    process.env.MCP_ORCHESTRATOR_INTERNAL_URL || 'http://mcp-orchestrator.railway.internal',
    process.env.MCP_ORCHESTRATOR_PUBLIC_URL ||
      'https://mcp-orchestrator-production-45f9.up.railway.app',
    process.env.MCP_ORCHESTRATOR_LOCAL_URL || 'http://localhost:3001',
  ].filter(Boolean) as string[];

  constructor(options: ResilientFetchOptions = {}) {
    // Jetson-first entry: option > env > LAN default. Empty string disables.
    const rawJetson =
      options.jetsonUrl ?? process.env.MCP_ORCHESTRATOR_JETSON_URL ?? DEFAULT_JETSON_URL;
    this.jetsonUrl = rawJetson ? rawJetson.replace(/\/$/, '') : null;
    this.jetsonTimeoutMs = options.jetsonTimeoutMs || DEFAULT_JETSON_TIMEOUT_MS;
    this.jetsonResetTimeoutMs = options.jetsonResetTimeoutMs || DEFAULT_JETSON_RESET_TIMEOUT_MS;

    // Validate and deduplicate URLs. An explicit `urls` option overrides the whole
    // cascade (Jetson semantics still apply to an entry matching jetsonUrl).
    const rawUrls =
      options.urls && options.urls.length > 0
        ? options.urls
        : [...(this.jetsonUrl ? [this.jetsonUrl] : []), ...this.defaultUrls];
    this.urls = Array.from(new Set(rawUrls.map((u) => u.replace(/\/$/, ''))));

    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutMs = options.resetTimeoutMs || 30000;
    this.logger = options.logger || console.log.bind(console);

    // Initialize state
    for (const url of this.urls) {
      this.state.set(url, 'CLOSED');
      this.failureCount.set(url, 0);
      this.nextAttempt.set(url, 0);
    }
  }

  /**
   * Attempts a request with the given input relative to the orchestrator base URL.
   * Cascades through the configured fallback chain on failure.
   *
   * @param path The URL path (must start with /) e.g. "/servers"
   * @param init standard fetch Init options
   */
  async fetchWithFailover(
    path: string,
    init?: RequestInit
  ): Promise<{ url: string; response: Response }> {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    const now = Date.now();
    const errors: Error[] = [];

    for (const baseUrl of this.urls) {
      const currentState = this.state.get(baseUrl) || 'CLOSED';

      if (currentState === 'OPEN') {
        if (now < (this.nextAttempt.get(baseUrl) || 0)) {
          continue; // Still waiting for reset timeout
        }
        // Time to probe the endpoint
        this.state.set(baseUrl, 'HALF_OPEN');
        this.logger(`[Circuit] Probing endpoint: ${baseUrl}`);
      }

      try {
        const targetUrl = `${baseUrl}${path}`;
        const response = await fetch(
          targetUrl,
          this.isJetson(baseUrl) ? this.withJetsonTimeout(init) : init
        );

        if (!response.ok && response.status >= 500) {
          throw new Error(`Server Error: ${response.status}`);
        }

        // SUCCESS: Reset the breaker for this endpoint
        this.recordSuccess(baseUrl);
        return { url: targetUrl, response };
      } catch (err: unknown) {
        // Network failure or Server (500+) Error
        errors.push(err instanceof Error ? err : new Error(String(err)));
        this.recordFailure(baseUrl);
      }
    }

    this.logger(`[Circuit] FATAL: All fallback endpoints failed for path ${path}.`);
    throw new Error(
      `Orchestrator Fetch Failed. Tried ${this.urls.length} endpoints: ${errors.map((e) => e.message).join(', ')}`
    );
  }

  private isJetson(baseUrl: string): boolean {
    return this.jetsonUrl !== null && baseUrl === this.jetsonUrl;
  }

  /**
   * The Jetson attempt gets a short abort budget so an off-LAN process pays at
   * most jetsonTimeoutMs once (then the circuit memoizes the dead endpoint)
   * instead of hanging on an unroutable LAN address. A caller-supplied signal
   * still aborts the request.
   */
  private withJetsonTimeout(init?: RequestInit): RequestInit {
    const timeoutSignal = AbortSignal.timeout(this.jetsonTimeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return { ...init, signal };
  }

  /** The Jetson entry trips OPEN after a single failure (fast off-LAN memoization). */
  private thresholdFor(baseUrl: string): number {
    return this.isJetson(baseUrl) ? 1 : this.failureThreshold;
  }

  /** A dead Jetson stays skipped longer than cloud endpoints before re-probing. */
  private resetTimeoutFor(baseUrl: string): number {
    return this.isJetson(baseUrl) ? this.jetsonResetTimeoutMs : this.resetTimeoutMs;
  }

  private recordSuccess(baseUrl: string) {
    if (this.state.get(baseUrl) !== 'CLOSED') {
      this.logger(`[Circuit] Restored endpoint: ${baseUrl}`);
    }
    this.state.set(baseUrl, 'CLOSED');
    this.failureCount.set(baseUrl, 0);
    this.nextAttempt.set(baseUrl, 0);
  }

  private recordFailure(baseUrl: string) {
    const fails = (this.failureCount.get(baseUrl) || 0) + 1;
    this.failureCount.set(baseUrl, fails);

    if (this.state.get(baseUrl) === 'HALF_OPEN') {
      // failed a probe, open it back up immediately
      this.state.set(baseUrl, 'OPEN');
      this.nextAttempt.set(baseUrl, Date.now() + this.resetTimeoutFor(baseUrl));
      this.logger(`[Circuit] Probe failed. Kept OPEN for ${baseUrl}`);
    } else if (fails >= this.thresholdFor(baseUrl)) {
      // tripped threshold
      this.state.set(baseUrl, 'OPEN');
      this.nextAttempt.set(baseUrl, Date.now() + this.resetTimeoutFor(baseUrl));
      this.logger(`[Circuit] Warning: Threshold reached. Tripped OPEN for endpoint: ${baseUrl}`);
    }
  }
}
