/**
 * Engagement session tracker for Moltbook.
 *
 * Tracks karma deltas, outbound/inbound splits, karma-per-action ratios,
 * and submolt engagement across a session. Provides session-level analytics
 * for optimizing engagement strategy.
 *
 * Designed for multi-tenant use: one tracker per agent, stored in config JSONB.
 */

export interface SessionMetrics {
  sessionId: string;
  startedAt: number;
  endedAt: number | null;
  startKarma: number;
  endKarma: number | null;
  karmaDelta: number;
  outboundComments: number;
  inboundReplies: number;
  posts: number;
  upvotesGiven: number;
  totalActions: number;
  karmaPerAction: number;
  outboundRatio: number;
  submoltsEngaged: string[];
  tickCount: number;
}

export interface EngagementSnapshot {
  currentSession: SessionMetrics | null;
  history: SessionMetrics[];
  /** Rolling average karma/action across all sessions */
  avgKarmaPerAction: number;
  /** Best-performing session by karma/action */
  bestSession: SessionMetrics | null;
}

export class EngagementTracker {
  private session: SessionMetrics | null = null;
  private history: SessionMetrics[] = [];
  private submoltSet = new Set<string>();

  /**
   * Start a new tracking session.
   * @param karma Current karma at session start
   */
  startSession(karma: number): string {
    // End previous session if still open
    if (this.session && !this.session.endedAt) {
      this.endSession(karma);
    }

    const sessionId = `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.session = {
      sessionId,
      startedAt: Date.now(),
      endedAt: null,
      startKarma: karma,
      endKarma: null,
      karmaDelta: 0,
      outboundComments: 0,
      inboundReplies: 0,
      posts: 0,
      upvotesGiven: 0,
      totalActions: 0,
      karmaPerAction: 0,
      outboundRatio: 0,
      submoltsEngaged: [],
      tickCount: 0,
    };
    this.submoltSet.clear();
    return sessionId;
  }

  /**
   * End the current session and archive it.
   * @param karma Current karma at session end
   */
  endSession(karma: number): SessionMetrics | null {
    if (!this.session) return null;

    this.session.endedAt = Date.now();
    this.session.endKarma = karma;
    this.session.karmaDelta = karma - this.session.startKarma;
    this.session.submoltsEngaged = [...this.submoltSet];

    // Compute derived metrics
    const totalComments = this.session.outboundComments + this.session.inboundReplies;
    this.session.totalActions = totalComments + this.session.posts + this.session.upvotesGiven;
    this.session.karmaPerAction =
      this.session.totalActions > 0 ? this.session.karmaDelta / this.session.totalActions : 0;
    this.session.outboundRatio =
      totalComments > 0 ? this.session.outboundComments / totalComments : 0;

    const completed = { ...this.session };
    this.history.push(completed);

    // Keep last 20 sessions
    if (this.history.length > 20) {
      this.history = this.history.slice(-20);
    }

    this.session = null;
    return completed;
  }

  /**
   * Record a heartbeat tick result into the current session.
   */
  recordTick(result: {
    outboundComments: number;
    inboundReplies: number;
    newPostCreated: boolean;
    upvotesGiven: number;
  }): void {
    if (!this.session) return;

    this.session.outboundComments += result.outboundComments;
    this.session.inboundReplies += result.inboundReplies;
    if (result.newPostCreated) this.session.posts++;
    this.session.upvotesGiven += result.upvotesGiven;
    this.session.tickCount++;
  }

  /**
   * Record a submolt that was engaged during this session.
   */
  recordSubmolt(submoltName: string): void {
    this.submoltSet.add(submoltName);
  }

  /**
   * Get a full snapshot of current + historical metrics.
   */
  getSnapshot(currentKarma?: number): EngagementSnapshot {
    // Update live session metrics if active
    let currentSession: SessionMetrics | null = null;
    if (this.session) {
      const karma = currentKarma ?? this.session.startKarma;
      const totalComments = this.session.outboundComments + this.session.inboundReplies;
      const totalActions = totalComments + this.session.posts + this.session.upvotesGiven;
      currentSession = {
        ...this.session,
        endKarma: karma,
        karmaDelta: karma - this.session.startKarma,
        totalActions,
        karmaPerAction: totalActions > 0 ? (karma - this.session.startKarma) / totalActions : 0,
        outboundRatio: totalComments > 0 ? this.session.outboundComments / totalComments : 0,
        submoltsEngaged: [...this.submoltSet],
      };
    }

    // Compute rolling averages
    const completedSessions = this.history.filter((s) => s.endedAt != null);
    const avgKarmaPerAction =
      completedSessions.length > 0
        ? completedSessions.reduce((sum, s) => sum + s.karmaPerAction, 0) / completedSessions.length
        : 0;

    const bestSession =
      completedSessions.length > 0
        ? completedSessions.reduce((best, s) =>
            s.karmaPerAction > best.karmaPerAction ? s : best,
          )
        : null;

    return {
      currentSession,
      history: [...this.history],
      avgKarmaPerAction,
      bestSession,
    };
  }

  /**
   * Restore state from persisted data (e.g., from JSONB config).
   */
  restore(data: { history?: SessionMetrics[] }): void {
    if (data.history) {
      this.history = data.history;
    }
  }

  /**
   * Export state for persistence.
   */
  export(): { history: SessionMetrics[] } {
    return { history: [...this.history] };
  }
}
