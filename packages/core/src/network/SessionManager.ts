/**
 * SessionManager — Multiplayer session lifecycle, reconnection, state recovery
 *
 * @version 1.0.0
 */

export type SessionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'ended';

export interface SessionPlayer {
  id: string;
  name: string;
  connectedAt: number;
  lastSeenAt: number;
  reconnectAttempts: number;
  state: 'connected' | 'disconnected' | 'reconnecting';
}

export interface SessionConfig {
  maxReconnectAttempts: number;
  reconnectWindowMs: number;
  heartbeatIntervalMs: number;
  sessionTimeoutMs: number;
}

export interface SessionSnapshot {
  sessionId: string;
  state: SessionState;
  players: SessionPlayer[];
  startedAt: number;
  duration: number;
}

export class SessionManager {
  private sessionId: string | null = null;
  private state: SessionState = 'idle';
  private players: Map<string, SessionPlayer> = new Map();
  private config: SessionConfig;
  private startedAt: number = 0;
  private stateHistory: { state: SessionState; timestamp: number }[] = [];

  constructor(config?: Partial<SessionConfig>) {
    this.config = {
      maxReconnectAttempts: config?.maxReconnectAttempts ?? 3,
      reconnectWindowMs: config?.reconnectWindowMs ?? 30000,
      heartbeatIntervalMs: config?.heartbeatIntervalMs ?? 5000,
      sessionTimeoutMs: config?.sessionTimeoutMs ?? 300000,
    };
  }

  /**
   * Create a new session
   */
  createSession(sessionId: string): void {
    this.sessionId = sessionId;
    this.setState('connecting');
    this.startedAt = Date.now();
  }

  /**
   * Mark session as connected
   */
  connect(): void {
    this.setState('connected');
  }

  /**
   * Add a player to the session
   */
  addPlayer(id: string, name: string): void {
    this.players.set(id, {
      id,
      name,
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      reconnectAttempts: 0,
      state: 'connected',
    });
  }

  /**
   * Handle player disconnect (start reconnect window)
   */
  playerDisconnected(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    player.state = 'reconnecting';
    player.reconnectAttempts = 0;
    return true;
  }

  /**
   * Attempt player reconnection
   */
  playerReconnect(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    const elapsed = Date.now() - player.lastSeenAt;
    if (elapsed > this.config.reconnectWindowMs) {
      player.state = 'disconnected';
      return false;
    }

    player.reconnectAttempts++;
    if (player.reconnectAttempts > this.config.maxReconnectAttempts) {
      player.state = 'disconnected';
      return false;
    }

    player.state = 'connected';
    player.lastSeenAt = Date.now();
    return true;
  }

  /**
   * Remove a player
   */
  removePlayer(playerId: string): boolean {
    return this.players.delete(playerId);
  }

  /**
   * Heartbeat update for a player
   */
  heartbeat(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) player.lastSeenAt = Date.now();
  }

  /**
   * End the session
   */
  endSession(): void {
    this.setState('ended');
  }

  /**
   * Get session snapshot
   */
  getSnapshot(): SessionSnapshot {
    return {
      sessionId: this.sessionId || '',
      state: this.state,
      players: [...this.players.values()],
      startedAt: this.startedAt,
      duration: Date.now() - this.startedAt,
    };
  }

  private setState(state: SessionState): void {
    this.state = state;
    this.stateHistory.push({ state, timestamp: Date.now() });
  }

  getState(): SessionState {
    return this.state;
  }
  getSessionId(): string | null {
    return this.sessionId;
  }
  getPlayerCount(): number {
    return this.players.size;
  }
  getPlayer(id: string): SessionPlayer | undefined {
    return this.players.get(id);
  }
  getConfig(): SessionConfig {
    return { ...this.config };
  }
  getStateHistory(): { state: SessionState; timestamp: number }[] {
    return [...this.stateHistory];
  }
}
