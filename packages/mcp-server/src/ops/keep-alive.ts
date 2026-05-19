/**
 * P.009 — Keep-alive self-ping to prevent Railway container cold-starts.
 *
 * When Railway spins down an idle container (sessions=0), the next MCP
 * initialize request must wait for a full cold boot: image pull → Node boot →
 * module load → initStores → listen.  Observed latency: ~14 seconds.
 *
 * This module periodically pings the local /health endpoint so the container
 * stays warm.  It is a lightweight alternative to external cron services and
 * works even without Railway autoscale API access.
 *
 * Configuration (env vars):
 *   MCP_KEEP_ALIVE_ENABLED=1|true   — enable the keep-alive loop
 *   MCP_KEEP_ALIVE_INTERVAL_MS=270000  — ping interval in ms (default: 4.5 min)
 *       Railway free-tier containers sleep after ~5 min of inactivity, so we
 *       default to 4.5 min (270 000 ms) to stay under that threshold.
 *   MCP_KEEP_ALIVE_URL — override health-check URL
 *       (default: http://127.0.0.1:${PORT}/health)
 *   MCP_KEEP_ALIVE_TIMEOUT_MS — per-ping fetch timeout (default: 5000 ms)
 *
 * The timer is started after the HTTP server is listening and uses .unref() so
 * it does not prevent graceful shutdown.
 */

/** Minimum interval to prevent accidental hot-loop (1 minute). */
const MIN_INTERVAL_MS = 60_000;

/** Default interval: 4.5 minutes — just under Railway's 5-minute idle sleep. */
const DEFAULT_INTERVAL_MS = 270_000;

/** Per-ping fetch timeout. */
const DEFAULT_TIMEOUT_MS = 5_000;

let keepAliveTimer: ReturnType<typeof setInterval> | null = null;
let lastPingStatus: 'idle' | 'ok' | 'error' | 'timeout' = 'idle';
let lastPingAt: string | null = null;

/** Resolved config captured at start time so getKeepAliveStatus() is accurate. */
let resolvedUrl: string | null = null;
let resolvedIntervalMs: number = DEFAULT_INTERVAL_MS;

export interface KeepAliveStatus {
  enabled: boolean;
  intervalMs: number;
  url: string;
  lastPingStatus: 'idle' | 'ok' | 'error' | 'timeout';
  lastPingAt: string | null;
}

/**
 * Return current keep-alive status for /health exposure.
 */
export function getKeepAliveStatus(): KeepAliveStatus {
  return {
    enabled: keepAliveTimer !== null,
    intervalMs: resolvedIntervalMs,
    url: resolvedUrl || process.env.MCP_KEEP_ALIVE_URL || `http://127.0.0.1:${process.env.PORT || '3000'}/health`,
    lastPingStatus,
    lastPingAt,
  };
}

/**
 * Start the keep-alive loop.  No-op if already running or if disabled.
 */
export function maybeStartKeepAliveLoop(options: { port: number }): void {
  const enabled =
    process.env.MCP_KEEP_ALIVE_ENABLED === '1' ||
    process.env.MCP_KEEP_ALIVE_ENABLED === 'true';
  if (!enabled) return;

  if (keepAliveTimer) return; // Already running

  const intervalMs = Math.max(
    MIN_INTERVAL_MS,
    parseInt(process.env.MCP_KEEP_ALIVE_INTERVAL_MS || '', 10) || DEFAULT_INTERVAL_MS,
  );
  const url =
    process.env.MCP_KEEP_ALIVE_URL || `http://127.0.0.1:${options.port}/health`;
  const timeoutMs = Math.max(
    1_000,
    parseInt(process.env.MCP_KEEP_ALIVE_TIMEOUT_MS || '', 10) || DEFAULT_TIMEOUT_MS,
  );

  // Capture resolved config for status reporting
  resolvedUrl = url;
  resolvedIntervalMs = intervalMs;

  console.info(
    `[keep-alive] Self-ping to ${url} every ${intervalMs}ms (timeout ${timeoutMs}ms) to prevent Railway cold-start`,
  );

  const ping = async (): Promise<void> => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ac.signal });
      if (r.ok) {
        lastPingStatus = 'ok';
      } else {
        lastPingStatus = 'error';
      }
    } catch {
      lastPingStatus = 'timeout';
    } finally {
      clearTimeout(t);
      lastPingAt = new Date().toISOString();
    }
  };

  // First ping after a short delay (let the server settle)
  setTimeout(ping, 10_000);
  keepAliveTimer = setInterval(ping, intervalMs);
  keepAliveTimer.unref(); // Don't prevent graceful shutdown
}

/**
 * Stop the keep-alive loop (for tests or graceful shutdown).
 */
export function stopKeepAliveLoop(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
    resolvedUrl = null;
    resolvedIntervalMs = DEFAULT_INTERVAL_MS;
    lastPingStatus = 'idle';
    lastPingAt = null;
    console.info('[keep-alive] Stopped');
  }
}