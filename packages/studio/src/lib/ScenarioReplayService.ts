/**
 * ScenarioReplayService.ts — Experience Replay for Scenario Interactions
 *
 * TypeScript port of the spatial-engine's Rust ExperienceReplay pattern.
 * Records user interactions across all scenario panels (slider changes,
 * selections, answers) and enables playback for demos, tutorials, and
 * social sharing.
 *
 * Mirrors: spatial-engine/src/learning/replay.rs
 */

// ─── Types ───────────────────────────────────────────────────────

export type ReplayEventType =
  | 'slider_change'
  | 'selection'
  | 'toggle'
  | 'input'
  | 'submit'
  | 'navigate'
  | 'scenario_open'
  | 'scenario_close';

export interface ReplayEvent {
  id: string;
  timestamp: number;
  scenarioId: string;
  type: ReplayEventType;
  target: string;        // e.g. 'dropHeight', 'food', 'dna-sequence'
  value: unknown;        // the new value
  previousValue?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ReplaySession {
  id: string;
  scenarioId: string;
  startTime: number;
  endTime?: number;
  events: ReplayEvent[];
  metadata: {
    userAgent?: string;
    screenWidth?: number;
    scenarioVersion?: string;
  };
}

export interface ReplayBatch {
  sessionId: string;
  events: ReplayEvent[];
  batchSize: number;
}

// ─── Service ─────────────────────────────────────────────────────

let eventIdCounter = 0;
let sessionIdCounter = 0;

export class ScenarioReplayService {
  private sessions: Map<string, ReplaySession> = new Map();
  private activeSessionId: string | null = null;
  private maxEventsPerSession: number;
  private listeners: Set<(event: ReplayEvent) => void> = new Set();

  constructor(maxEventsPerSession = 10000) {
    this.maxEventsPerSession = maxEventsPerSession;
  }

  // ─── Session Management ──────────────────────────────────────

  startSession(scenarioId: string): string {
    const id = `session_${++sessionIdCounter}_${Date.now()}`;
    const session: ReplaySession = {
      id,
      scenarioId,
      startTime: Date.now(),
      events: [],
      metadata: {
        screenWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
      },
    };
    this.sessions.set(id, session);
    this.activeSessionId = id;

    this.record({
      type: 'scenario_open',
      target: scenarioId,
      value: null,
    });

    return id;
  }

  endSession(sessionId?: string): ReplaySession | null {
    const id = sessionId ?? this.activeSessionId;
    if (!id) return null;

    const session = this.sessions.get(id);
    if (!session) return null;

    this.record({
      type: 'scenario_close',
      target: session.scenarioId,
      value: null,
    });

    session.endTime = Date.now();
    if (this.activeSessionId === id) this.activeSessionId = null;
    return session;
  }

  getSession(sessionId: string): ReplaySession | undefined {
    return this.sessions.get(sessionId);
  }

  getActiveSession(): ReplaySession | null {
    return this.activeSessionId ? this.sessions.get(this.activeSessionId) ?? null : null;
  }

  // ─── Recording ───────────────────────────────────────────────

  record(partial: Omit<ReplayEvent, 'id' | 'timestamp' | 'scenarioId'>): ReplayEvent | null {
    const session = this.getActiveSession();
    if (!session) return null;
    if (session.events.length >= this.maxEventsPerSession) return null;

    const event: ReplayEvent = {
      id: `evt_${++eventIdCounter}`,
      timestamp: Date.now(),
      scenarioId: session.scenarioId,
      ...partial,
    };

    session.events.push(event);

    // Notify listeners (for live preview / telemetry)
    for (const listener of this.listeners) {
      listener(event);
    }

    return event;
  }

  // ─── Playback ────────────────────────────────────────────────

  /**
   * Generator that yields events at their original timing.
   * Similar to replay.rs train_on_batch(), this processes events
   * sequentially with inter-event delays.
   */
  async *playback(sessionId: string, speed = 1): AsyncGenerator<ReplayEvent> {
    const session = this.sessions.get(sessionId);
    if (!session || session.events.length === 0) return;

    let prevTimestamp = session.events[0].timestamp;

    for (const event of session.events) {
      const delay = (event.timestamp - prevTimestamp) / speed;
      if (delay > 0 && delay < 10000) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      prevTimestamp = event.timestamp;
      yield event;
    }
  }

  // ─── Batch Extraction (mirrors replay.rs extract_training_batch) ─

  extractBatch(sessionId: string, batchSize: number): ReplayBatch {
    const session = this.sessions.get(sessionId);
    if (!session) return { sessionId, events: [], batchSize };

    // Random sampling like the Rust version's ORDER BY RANDOM()
    const shuffled = [...session.events].sort(() => Math.random() - 0.5);
    const sampled = shuffled.slice(0, batchSize);

    return { sessionId, events: sampled, batchSize: sampled.length };
  }

  // ─── Analytics ───────────────────────────────────────────────

  sessionDuration(sessionId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    const end = session.endTime ?? Date.now();
    return end - session.startTime;
  }

  eventCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.events.length ?? 0;
  }

  eventsByType(sessionId: string, type: ReplayEventType): ReplayEvent[] {
    return this.sessions.get(sessionId)?.events.filter(e => e.type === type) ?? [];
  }

  mostInteractedTargets(sessionId: string, limit = 5): Array<{ target: string; count: number }> {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const counts = new Map<string, number>();
    for (const event of session.events) {
      counts.set(event.target, (counts.get(event.target) ?? 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([target, count]) => ({ target, count }));
  }

  // ─── Listeners ───────────────────────────────────────────────

  addListener(fn: (event: ReplayEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ─── Serialization ──────────────────────────────────────────

  exportSession(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) return '{}';
    return JSON.stringify(session);
  }

  importSession(json: string): string | null {
    try {
      const session: ReplaySession = JSON.parse(json);
      if (!session.id || !session.events) return null;
      this.sessions.set(session.id, session);
      return session.id;
    } catch {
      return null;
    }
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  clearAll(): void {
    this.sessions.clear();
    this.activeSessionId = null;
  }
}

// ─── Singleton ───────────────────────────────────────────────────

export const replayService = new ScenarioReplayService();

export default ScenarioReplayService;
