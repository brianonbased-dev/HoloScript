/**
 * SSE stream lifecycle — heartbeat timer + disconnect guards isolated from route logic.
 *
 * Keeps intervals and event listeners in one place so dropped connections always
 * clear timers and cannot leave orphaned `setInterval` callbacks attached to dead sockets.
 */

import type http from 'http';

/** Tunable for aggressive proxy idle timeouts (Railway / CDN). Clamped 5s–55s. */
function parseHeartbeatMs(): number {
  const raw = process.env.HOLOMESH_SSE_HEARTBEAT_MS;
  if (!raw) return 25_000;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 25_000;
  return Math.min(55_000, Math.max(5_000, n));
}

export const SSE_HEARTBEAT_INTERVAL_MS = parseHeartbeatMs();

export interface SseHeartbeatHandle {
  /** Idempotent — safe to call multiple times */
  dispose: () => void;
}

/**
 * Comment-frame keepalives for proxies and browsers. The interval is owned here;
 * callers must call `dispose()` when the SSE stream ends.
 */
export function attachSseHeartbeat(
  res: http.ServerResponse,
  onWriteFailure?: () => void
): SseHeartbeatHandle {
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let disposed = false;

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };

  intervalId = setInterval(() => {
    try {
      res.write(': hb\n\n');
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    } catch {
      dispose();
      onWriteFailure?.();
    }
  }, SSE_HEARTBEAT_INTERVAL_MS);

  return { dispose };
}

/**
 * Invoke `onEnd` once when either side of the HTTP exchange signals teardown.
 * Covers client aborts, socket errors, and response stream close (e.g. proxy drop).
 */
export function attachSseDisconnectGuards(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  onEnd: () => void
): void {
  let ended = false;
  const once = () => {
    if (ended) return;
    ended = true;
    onEnd();
  };
  req.once('close', once);
  req.once('error', once);
  req.once('aborted', once);
  res.once('close', once);
  res.once('error', once);
}
