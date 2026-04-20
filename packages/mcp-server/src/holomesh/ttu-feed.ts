/**
 * TTU Feed — multi-agent convergence room for `crdt://holomesh/feed/ttu/<sessionId>`.
 *
 * Sibling task `_0v98` (Phase 2: Multi-Agent Convergence). Transforms
 * the prophetic-GI / TextToUniverse spatial engine from a single-player
 * prompt viewer into an uncoordinated swarm builder by letting many
 * agents subscribe to the same live TTU session.
 *
 * Surface (REST + SSE, mirrors `team-room.ts` semantics):
 *
 *   GET  /api/holomesh/ttu/:sessionId/live      — SSE stream of session events
 *   GET  /api/holomesh/ttu/:sessionId/presence  — list of subscribed agents
 *   GET  /api/holomesh/ttu/:sessionId/history   — recent events (replay buffer)
 *   POST /api/holomesh/ttu/:sessionId/step      — submit a scene context, get
 *                                                 the next ProphecyFrame
 *   POST /api/holomesh/ttu/:sessionId/publish   — publish a ProphecyFrame
 *                                                 (for agents that produce them)
 *
 * Concurrency model:
 *   - Many agents may subscribe to the same `sessionId` simultaneously.
 *   - Any agent may POST a frame; the frame is fanned out to all subscribers
 *     (and to any pending `step()` calls).
 *   - Any agent may POST a step; if a frame is already queued for that
 *     session it returns immediately, otherwise the call awaits the next
 *     publish (subject to a server-side timeout).
 *
 * Storage is in-memory; CRDT-backed durability lives behind
 * `holomesh-tools.ts` and the existing Loro doc — this module is the
 * realtime fan-out layer that sits in front of it.
 */

import type http from 'http';
import { attachSseDisconnectGuards, attachSseHeartbeat } from './team-room-sse';
import { applyEdgeSafeSseHeaders } from './sse-edge-headers';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Loose ProphecyFrame shape — kept as `unknown`-like JSON for transport. */
export type TtuFrame = {
  frameId: number;
  producedAtMs: number;
  productionTimeMs: number;
  probes: ReadonlyArray<{
    index: number;
    position: readonly [number, number, number];
    rgb: readonly [number, number, number];
    confidence: number;
  }>;
  source: 'local' | 'holomesh' | 'fallback';
  /** Agent that produced this frame (filled in by the publish handler). */
  publisherAgentId?: string;
};

/** Loose ProphecySceneContext shape. */
export type TtuScene = {
  cameraPosition: readonly [number, number, number];
  cameraForward: readonly [number, number, number];
  sunDirection: readonly [number, number, number];
  sunColor: readonly [number, number, number];
  prevAvgLuminance?: number;
};

export type TtuEvent =
  | { type: 'presence:join'; agentId: string; agentName: string; ts: number }
  | { type: 'presence:leave'; agentId: string; agentName: string; ts: number }
  | { type: 'scene'; agentId: string; scene: TtuScene; ts: number }
  | { type: 'frame'; frame: TtuFrame; ts: number };

interface TtuClient {
  res: http.ServerResponse;
  agentId: string;
  agentName: string;
  ide?: string;
  joinedAt: number;
}

interface PendingStep {
  resolve: (frame: TtuFrame) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  agentId: string;
}

interface TtuSession {
  sessionId: string;
  clients: Set<TtuClient>;
  /** Frames published but not yet consumed by a `step()` call. */
  frameQueue: TtuFrame[];
  /** `step()` callers waiting for the next frame. FIFO. */
  pending: PendingStep[];
  /** Recent events for SSE reconnect replay. */
  history: TtuEvent[];
  /** Last frame for fast-path `step()` when caller doesn't care about freshness. */
  lastFrame: TtuFrame | null;
}

// ─── Globals (in-memory; one process owns each session) ──────────────────────

const sessions = new Map<string, TtuSession>();

const MAX_HISTORY = 50;
const MAX_FRAME_QUEUE = 16;
const MAX_PENDING = 64;
/** Default `step()` server-side timeout. Overridable via `?timeout_ms=`. */
const DEFAULT_STEP_TIMEOUT_MS = 5_000;
const MAX_STEP_TIMEOUT_MS = 30_000;

// ─── Internal helpers ────────────────────────────────────────────────────────

function getOrCreate(sessionId: string): TtuSession {
  let s = sessions.get(sessionId);
  if (!s) {
    s = {
      sessionId,
      clients: new Set(),
      frameQueue: [],
      pending: [],
      history: [],
      lastFrame: null,
    };
    sessions.set(sessionId, s);
  }
  return s;
}

function recordEvent(session: TtuSession, event: TtuEvent): void {
  session.history.push(event);
  if (session.history.length > MAX_HISTORY) {
    session.history.splice(0, session.history.length - MAX_HISTORY);
  }
}

function fanOut(session: TtuSession, event: TtuEvent): void {
  recordEvent(session, event);
  if (session.clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of session.clients) {
    try {
      c.res.write(payload);
    } catch {
      // Disconnected — close handler will clean up.
    }
  }
}

function maybeDeleteEmpty(session: TtuSession): void {
  if (
    session.clients.size === 0 &&
    session.pending.length === 0 &&
    session.frameQueue.length === 0
  ) {
    sessions.delete(session.sessionId);
  }
}

// ─── Public API: introspection ───────────────────────────────────────────────

export function getTtuPresence(sessionId: string): {
  agentId: string;
  agentName: string;
  ide?: string;
  joinedAt: number;
}[] {
  const s = sessions.get(sessionId);
  if (!s) return [];
  return Array.from(s.clients).map((c) => ({
    agentId: c.agentId,
    agentName: c.agentName,
    ide: c.ide,
    joinedAt: c.joinedAt,
  }));
}

export function getTtuStats(): Record<
  string,
  { connected: number; pending: number; queued: number }
> {
  const out: Record<string, { connected: number; pending: number; queued: number }> = {};
  for (const [id, s] of sessions) {
    out[id] = {
      connected: s.clients.size,
      pending: s.pending.length,
      queued: s.frameQueue.length,
    };
  }
  return out;
}

export function getTtuHistory(sessionId: string): TtuEvent[] {
  return [...(sessions.get(sessionId)?.history ?? [])];
}

/** Test/diagnostic helper — clear all sessions. Not exported via routes. */
export function _resetTtuFeedForTests(): void {
  for (const s of sessions.values()) {
    for (const p of s.pending) {
      clearTimeout(p.timer);
      p.reject(new Error('ttu-feed reset'));
    }
  }
  sessions.clear();
}

// ─── Public API: publish + step ──────────────────────────────────────────────

/**
 * Publish a frame into a session. Wakes the oldest pending `step()` call
 * (if any) and broadcasts to every SSE subscriber.
 *
 * If no `step()` is waiting, the frame is queued (bounded; oldest dropped).
 */
export function publishTtuFrame(
  sessionId: string,
  frame: TtuFrame,
  publisherAgentId?: string
): { delivered: number; queued: boolean } {
  const session = getOrCreate(sessionId);
  const enriched: TtuFrame = { ...frame, publisherAgentId };
  session.lastFrame = enriched;

  // Wake pending step() callers FIFO.
  const waiter = session.pending.shift();
  if (waiter) {
    clearTimeout(waiter.timer);
    waiter.resolve(enriched);
  } else {
    // Queue for next step() — bounded.
    session.frameQueue.push(enriched);
    if (session.frameQueue.length > MAX_FRAME_QUEUE) {
      session.frameQueue.splice(0, session.frameQueue.length - MAX_FRAME_QUEUE);
    }
  }

  const event: TtuEvent = { type: 'frame', frame: enriched, ts: Date.now() };
  fanOut(session, event);

  return {
    delivered: session.clients.size + (waiter ? 1 : 0),
    queued: !waiter,
  };
}

/**
 * Submit a scene context and await the next frame. Returns immediately
 * if a frame is already queued; otherwise waits up to `timeoutMs` for
 * the next publish.
 *
 * The scene is broadcast to all SSE subscribers (so producer agents can
 * react to it) — even if a queued frame is returned synchronously.
 */
export function submitTtuStep(
  sessionId: string,
  scene: TtuScene,
  agentId: string,
  timeoutMs: number = DEFAULT_STEP_TIMEOUT_MS
): Promise<TtuFrame> {
  const session = getOrCreate(sessionId);

  // Always announce the scene to subscribers — producers need to see it
  // even when a stale queued frame is about to be returned.
  fanOut(session, { type: 'scene', agentId, scene, ts: Date.now() });

  // Fast path: queued frame from an earlier publish.
  const queued = session.frameQueue.shift();
  if (queued) {
    return Promise.resolve(queued);
  }

  // Backpressure — refuse if the pending list is saturated.
  if (session.pending.length >= MAX_PENDING) {
    return Promise.reject(
      new Error(`ttu-feed: session ${sessionId} pending queue saturated (max ${MAX_PENDING})`)
    );
  }

  const safeTimeout = Math.min(MAX_STEP_TIMEOUT_MS, Math.max(50, timeoutMs));

  return new Promise<TtuFrame>((resolve, reject) => {
    const timer = setTimeout(() => {
      // Remove ourselves from the pending list on timeout.
      const idx = session.pending.findIndex((p) => p.timer === timer);
      if (idx >= 0) session.pending.splice(idx, 1);
      maybeDeleteEmpty(session);
      reject(new Error(`ttu-feed: no frame within ${safeTimeout}ms for session ${sessionId}`));
    }, safeTimeout);

    session.pending.push({ resolve, reject, timer, agentId });
  });
}

// ─── Public API: SSE subscription ────────────────────────────────────────────

/**
 * Handle GET /api/holomesh/ttu/:sessionId/live — open SSE stream.
 *
 * Many agents may connect to the same session simultaneously; that's
 * the whole point of this task ("uncoordinated swarm builder").
 */
export function handleTtuLiveConnection(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId: string,
  query: URLSearchParams
): void {
  const agentId = query.get('agent_id') || 'anonymous';
  const agentName = query.get('agent_name') || agentId;
  const ide = query.get('ide') || undefined;
  const sinceParam = query.get('since');
  const since = sinceParam ? Number(sinceParam) : 0;

  applyEdgeSafeSseHeaders(res);
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });
  try {
    res.flushHeaders?.();
  } catch {
    // ignore
  }

  // Defeat CDN/edge buffering — same trick as team-room.ts.
  try {
    const pad = Buffer.alloc(2048, ' ').toString('utf-8');
    res.write(`: ${pad}\n\n`);
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }
  } catch {
    // socket already gone
  }

  const session = getOrCreate(sessionId);
  const client: TtuClient = {
    res,
    agentId,
    agentName,
    ide,
    joinedAt: Date.now(),
  };
  session.clients.add(client);

  try {
    res.write('retry: 5000\n\n');
  } catch {
    // gone
  }

  // Replay history for reconnecting clients.
  const replay =
    Number.isFinite(since) && since > 0
      ? session.history.filter((e) => (e as any).ts > since)
      : session.history;
  for (const event of replay) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      break;
    }
  }

  // Announce join.
  fanOut(session, {
    type: 'presence:join',
    agentId,
    agentName,
    ts: Date.now(),
  });

  let finalized = false;
  let heartbeatDispose: () => void = () => {};

  const teardown = () => {
    if (finalized) return;
    finalized = true;
    heartbeatDispose();
    session.clients.delete(client);
    fanOut(session, {
      type: 'presence:leave',
      agentId,
      agentName,
      ts: Date.now(),
    });
    maybeDeleteEmpty(session);
  };

  ({ dispose: heartbeatDispose } = attachSseHeartbeat(res, teardown));
  attachSseDisconnectGuards(req, res, teardown);
}
