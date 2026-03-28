export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export type LoggerFn = (message: string) => void;

export interface ResilientFetchOptions {
    /** Override the default fallback cascade */
    urls?: string[];
    /** Number of consecutive failures before opening the circuit */
    failureThreshold?: number;
    /** Time in ms to wait before probing a downed endpoint again */
    resetTimeoutMs?: number;
    /** Optional logger for auto-failover events */
    logger?: LoggerFn;
}

/**
 * Resilient fetching utility that implements a Circuit Breaker pattern
 * and cascades through a list of fallback endpoints automatically.
 */
export class ResilientOrchestratorFetch {
    private urls: string[];
    private failureThreshold: number;
    private resetTimeoutMs: number;
    private logger: LoggerFn;

    // State per endpoint
    private state: Map<string, CircuitBreakerState> = new Map();
    private failureCount: Map<string, number> = new Map();
    private nextAttempt: Map<string, number> = new Map();

    private defaultUrls = [
        process.env.MCP_ORCHESTRATOR_URL,
        process.env.MCP_ORCHESTRATOR_INTERNAL_URL || 'http://mcp-orchestrator.railway.internal',
        process.env.MCP_ORCHESTRATOR_PUBLIC_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app',
        process.env.MCP_ORCHESTRATOR_LOCAL_URL || 'http://localhost:3001'
    ].filter(Boolean) as string[];

    constructor(options: ResilientFetchOptions = {}) {
        // Validate and deduplicate URLs
        const rawUrls = options.urls && options.urls.length > 0 ? options.urls : this.defaultUrls;
        this.urls = Array.from(new Set(rawUrls.map(u => u.replace(/\/$/, ''))));
        
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
    async fetchWithFailover(path: string, init?: RequestInit): Promise<{ url: string; response: Response }> {
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
                const response = await fetch(targetUrl, init);

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
        throw new Error(`Orchestrator Fetch Failed. Tried ${this.urls.length} endpoints: ${errors.map(e => e.message).join(', ')}`);
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
            this.nextAttempt.set(baseUrl, Date.now() + this.resetTimeoutMs);
            this.logger(`[Circuit] Probe failed. Kept OPEN for ${baseUrl}`);

        } else if (fails >= this.failureThreshold) {
            // tripped threshold
            this.state.set(baseUrl, 'OPEN');
            this.nextAttempt.set(baseUrl, Date.now() + this.resetTimeoutMs);
            this.logger(`[Circuit] Warning: Threshold reached. Tripped OPEN for endpoint: ${baseUrl}`);
        }
    }
}
