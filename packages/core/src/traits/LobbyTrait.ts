/**
 * @holoscript/core Lobby Trait
 *
 * Enables room/session management for multiplayer games.
 * Handles matchmaking, room creation, and player management.
 *
 * @example
 * ```hsplus
 * object "GameLobby" {
 *   @lobby {
 *     maxPlayers: 8,
 *     minPlayers: 2,
 *     matchmaking: {
 *       mode: "skill",
 *       skillRange: 100
 *     },
 *     autoStart: true,
 *     autoStartDelay: 10000
 *   }
 * }
 * ```
 */

/**
 * Lobby visibility
 */
export type LobbyVisibility = 'public' | 'private' | 'friends-only';

/**
 * Lobby state
 */
export type LobbyState = 'waiting' | 'starting' | 'in-progress' | 'finished' | 'closed';

/**
 * Matchmaking mode
 */
export type MatchmakingMode = 'random' | 'skill' | 'region' | 'custom';

/**
 * Player info
 */
export interface PlayerInfo {
  /** Player ID */
  id: string;

  /** Display name */
  name: string;

  /** Is host */
  isHost?: boolean;

  /** Is ready */
  isReady?: boolean;

  /** Team (if applicable) */
  team?: string | number;

  /** Player skill rating */
  skillRating?: number;

  /** Custom properties */
  properties?: Record<string, unknown>;

  /** Join time */
  joinedAt?: number;

  /** Latency in ms */
  latency?: number;
}

/**
 * Team configuration
 */
export interface TeamConfig {
  /** Team ID */
  id: string | number;

  /** Team name */
  name: string;

  /** Max players per team */
  maxPlayers: number;

  /** Auto-balance teams */
  autoBalance?: boolean;
}

/**
 * Matchmaking configuration
 */
export interface MatchmakingConfig {
  /** Matchmaking mode */
  mode?: MatchmakingMode;

  /** Skill range for matching (±) */
  skillRange?: number;

  /** Preferred region */
  region?: string;

  /** Maximum wait time (ms) */
  maxWaitTime?: number;

  /** Allow backfill */
  allowBackfill?: boolean;

  /** Custom matchmaking filter */
  customFilter?: Record<string, unknown>;
}

/**
 * Lobby configuration
 */
export interface LobbyConfig {
  /** Lobby name */
  name?: string;

  /** Lobby visibility */
  visibility?: LobbyVisibility;

  /** Maximum players */
  maxPlayers?: number;

  /** Minimum players to start */
  minPlayers?: number;

  /** Password (for private lobbies) */
  password?: string;

  /** Teams configuration */
  teams?: TeamConfig[];

  /** Matchmaking settings */
  matchmaking?: MatchmakingConfig;

  /** Auto-start when ready */
  autoStart?: boolean;

  /** Auto-start delay (ms) */
  autoStartDelay?: number;

  /** Allow mid-game join */
  allowMidGameJoin?: boolean;

  /** Host migration enabled */
  hostMigration?: boolean;

  /** Custom lobby properties */
  properties?: Record<string, unknown>;

  /** Timeout for inactive players (ms) */
  inactivityTimeout?: number;

  /** Game mode */
  gameMode?: string;

  /** Map/level */
  map?: string;
}

/**
 * Lobby event types
 */
export type LobbyEventType =
  | 'player-joined'
  | 'player-left'
  | 'player-ready'
  | 'player-unready'
  | 'host-changed'
  | 'team-changed'
  | 'state-changed'
  | 'countdown-started'
  | 'countdown-cancelled'
  | 'game-starting'
  | 'game-ended'
  | 'properties-changed'
  | 'kicked'
  | 'error';

/**
 * Lobby event
 */
export interface LobbyEvent {
  type: LobbyEventType;
  data?: Record<string, unknown>;
  playerId?: string;
  timestamp: number;
}

/**
 * Event callback
 */
type EventCallback = (event: LobbyEvent) => void;

/**
 * Lobby Trait - Room/session management
 */
export class LobbyTrait {
  private config: LobbyConfig;
  private state: LobbyState = 'waiting';
  private players: Map<string, PlayerInfo> = new Map();
  private hostId: string | null = null;
  private localPlayerId: string | null = null;
  private lobbyId: string | null = null;
  private eventListeners: Map<LobbyEventType, EventCallback[]> = new Map();
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownRemaining: number = 0;

  constructor(config: Partial<LobbyConfig> = {}) {
    this.config = {
      name: config.name,
      visibility: config.visibility ?? 'public',
      maxPlayers: config.maxPlayers ?? 8,
      minPlayers: config.minPlayers ?? 2,
      password: config.password,
      teams: config.teams,
      matchmaking: config.matchmaking ?? { mode: 'random' },
      autoStart: config.autoStart ?? false,
      autoStartDelay: config.autoStartDelay ?? 5000,
      allowMidGameJoin: config.allowMidGameJoin ?? false,
      hostMigration: config.hostMigration ?? true,
      properties: config.properties ?? {},
      inactivityTimeout: config.inactivityTimeout,
      gameMode: config.gameMode,
      map: config.map,
    };
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): LobbyConfig {
    return { ...this.config };
  }

  /**
   * Get lobby state
   */
  public getState(): LobbyState {
    return this.state;
  }

  /**
   * Get lobby ID
   */
  public getLobbyId(): string | null {
    return this.lobbyId;
  }

  /**
   * Set lobby ID (called after creating/joining)
   */
  public setLobbyId(id: string): void {
    this.lobbyId = id;
  }

  /**
   * Set local player ID
   */
  public setLocalPlayerId(id: string): void {
    this.localPlayerId = id;
  }

  /**
   * Get local player ID
   */
  public getLocalPlayerId(): string | null {
    return this.localPlayerId;
  }

  /**
   * Update lobby properties
   */
  public setProperties(properties: Record<string, unknown>): void {
    this.config.properties = { ...this.config.properties, ...properties };
    this.emit({
      type: 'properties-changed',
      data: properties,
      timestamp: Date.now(),
    });
  }

  /**
   * Get lobby property
   */
  public getProperty(key: string): unknown {
    return this.config.properties?.[key];
  }

  /**
   * Set game mode
   */
  public setGameMode(mode: string): void {
    this.config.gameMode = mode;
  }

  /**
   * Set map
   */
  public setMap(map: string): void {
    this.config.map = map;
  }

  // ============================================================================
  // Player Management
  // ============================================================================

  /**
   * Add player to lobby
   */
  public addPlayer(player: PlayerInfo): boolean {
    if (this.players.size >= (this.config.maxPlayers ?? 8)) {
      return false;
    }

    if (this.state === 'in-progress' && !this.config.allowMidGameJoin) {
      return false;
    }

    this.players.set(player.id, {
      ...player,
      joinedAt: Date.now(),
    });

    // Set first player as host
    if (this.players.size === 1) {
      this.hostId = player.id;
      const p = this.players.get(player.id)!;
      p.isHost = true;
    }

    this.emit({
      type: 'player-joined',
      playerId: player.id,
      data: { player },
      timestamp: Date.now(),
    });

    this.checkAutoStart();
    return true;
  }

  /**
   * Remove player from lobby
   */
  public removePlayer(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;

    this.players.delete(playerId);

    this.emit({
      type: 'player-left',
      playerId,
      data: { player },
      timestamp: Date.now(),
    });

    // Host migration
    if (playerId === this.hostId && this.config.hostMigration) {
      this.migrateHost();
    }

    // Cancel countdown if not enough players
    if (this.countdownTimer && this.players.size < (this.config.minPlayers ?? 2)) {
      this.cancelCountdown();
    }
  }

  /**
   * Kick player
   */
  public kickPlayer(playerId: string, reason?: string): boolean {
    if (this.localPlayerId !== this.hostId) {
      return false; // Only host can kick
    }

    const player = this.players.get(playerId);
    if (!player) return false;

    this.emit({
      type: 'kicked',
      playerId,
      data: { reason },
      timestamp: Date.now(),
    });

    this.removePlayer(playerId);
    return true;
  }

  /**
   * Get player
   */
  public getPlayer(playerId: string): PlayerInfo | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get all players
   */
  public getPlayers(): PlayerInfo[] {
    return Array.from(this.players.values());
  }

  /**
   * Get player count
   */
  public getPlayerCount(): number {
    return this.players.size;
  }

  /**
   * Is lobby full
   */
  public isFull(): boolean {
    return this.players.size >= (this.config.maxPlayers ?? 8);
  }

  /**
   * Get host
   */
  public getHost(): PlayerInfo | undefined {
    return this.hostId ? this.players.get(this.hostId) : undefined;
  }

  /**
   * Is local player host
   */
  public isHost(): boolean {
    return this.localPlayerId === this.hostId;
  }

  /**
   * Transfer host
   */
  public transferHost(newHostId: string): boolean {
    if (this.localPlayerId !== this.hostId) {
      return false; // Only host can transfer
    }

    const newHost = this.players.get(newHostId);
    if (!newHost) return false;

    const oldHost = this.players.get(this.hostId!);
    if (oldHost) oldHost.isHost = false;

    newHost.isHost = true;
    this.hostId = newHostId;

    this.emit({
      type: 'host-changed',
      playerId: newHostId,
      data: { previousHost: oldHost?.id },
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Migrate host to next available player
   */
  private migrateHost(): void {
    const players = Array.from(this.players.values());
    if (players.length === 0) {
      this.hostId = null;
      return;
    }

    // Pick player who joined earliest
    players.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
    const newHost = players[0];
    newHost.isHost = true;
    this.hostId = newHost.id;

    this.emit({
      type: 'host-changed',
      playerId: newHost.id,
      timestamp: Date.now(),
    });
  }

  // ============================================================================
  // Ready System
  // ============================================================================

  /**
   * Set player ready state
   */
  public setReady(playerId: string, ready: boolean): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.isReady = ready;

    this.emit({
      type: ready ? 'player-ready' : 'player-unready',
      playerId,
      timestamp: Date.now(),
    });

    this.checkAutoStart();
  }

  /**
   * Toggle local player ready state
   */
  public toggleReady(): void {
    if (this.localPlayerId) {
      const player = this.players.get(this.localPlayerId);
      if (player) {
        this.setReady(this.localPlayerId, !player.isReady);
      }
    }
  }

  /**
   * Check if all players are ready
   */
  public allPlayersReady(): boolean {
    if (this.players.size < (this.config.minPlayers ?? 2)) {
      return false;
    }

    for (const player of this.players.values()) {
      if (!player.isReady) return false;
    }

    return true;
  }

  /**
   * Get ready player count
   */
  public getReadyCount(): number {
    let count = 0;
    for (const player of this.players.values()) {
      if (player.isReady) count++;
    }
    return count;
  }

  // ============================================================================
  // Teams
  // ============================================================================

  /**
   * Set player team
   */
  public setTeam(playerId: string, team: string | number): void {
    const player = this.players.get(playerId);
    if (!player) return;

    player.team = team;

    this.emit({
      type: 'team-changed',
      playerId,
      data: { team },
      timestamp: Date.now(),
    });
  }

  /**
   * Get team players
   */
  public getTeamPlayers(team: string | number): PlayerInfo[] {
    return Array.from(this.players.values()).filter((p) => p.team === team);
  }

  /**
   * Auto-balance teams
   */
  public autoBalanceTeams(): void {
    if (!this.config.teams || this.config.teams.length === 0) return;

    const players = Array.from(this.players.values());
    const teamIndex = (i: number) => i % this.config.teams!.length;

    for (let i = 0; i < players.length; i++) {
      players[i].team = this.config.teams[teamIndex(i)].id;
    }
  }

  // ============================================================================
  // Game Flow
  // ============================================================================

  /**
   * Check if auto-start conditions are met
   */
  private checkAutoStart(): void {
    if (!this.config.autoStart) return;
    if (this.state !== 'waiting') return;

    if (this.allPlayersReady()) {
      this.startCountdown();
    }
  }

  /**
   * Start countdown
   */
  public startCountdown(): void {
    if (this.countdownTimer) return;
    if (this.players.size < (this.config.minPlayers ?? 2)) return;

    this.state = 'starting';
    this.countdownRemaining = this.config.autoStartDelay ?? 5000;

    this.emit({
      type: 'countdown-started',
      data: { duration: this.countdownRemaining },
      timestamp: Date.now(),
    });

    this.countdownTimer = setTimeout(() => {
      this.startGame();
    }, this.countdownRemaining);
  }

  /**
   * Cancel countdown
   */
  public cancelCountdown(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }

    if (this.state === 'starting') {
      this.state = 'waiting';
      this.emit({
        type: 'countdown-cancelled',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get countdown remaining (ms)
   */
  public getCountdownRemaining(): number {
    return this.countdownRemaining;
  }

  /**
   * Start game
   */
  public startGame(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }

    this.state = 'in-progress';

    this.emit({
      type: 'game-starting',
      data: {
        players: Array.from(this.players.values()),
        gameMode: this.config.gameMode,
        map: this.config.map,
      },
      timestamp: Date.now(),
    });
  }

  /**
   * End game
   */
  public endGame(results?: Record<string, unknown>): void {
    this.state = 'finished';

    this.emit({
      type: 'game-ended',
      data: { results },
      timestamp: Date.now(),
    });
  }

  /**
   * Close lobby
   */
  public close(): void {
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
    }

    this.state = 'closed';
    this.players.clear();
    this.hostId = null;
  }

  /**
   * Reset lobby for next game
   */
  public reset(): void {
    this.state = 'waiting';
    this.countdownRemaining = 0;

    // Reset player ready states
    for (const player of this.players.values()) {
      player.isReady = false;
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Add event listener
   */
  public on(event: LobbyEventType, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: LobbyEventType, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: LobbyEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize lobby state
   */
  public serialize(): Record<string, unknown> {
    return {
      lobbyId: this.lobbyId,
      name: this.config.name,
      visibility: this.config.visibility,
      state: this.state,
      playerCount: this.players.size,
      maxPlayers: this.config.maxPlayers,
      minPlayers: this.config.minPlayers,
      hostId: this.hostId,
      readyCount: this.getReadyCount(),
      allReady: this.allPlayersReady(),
      gameMode: this.config.gameMode,
      map: this.config.map,
      properties: this.config.properties,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id,
        name: p.name,
        isHost: p.isHost,
        isReady: p.isReady,
        team: p.team,
      })),
    };
  }
}

/**
 * Factory function
 */
export function createLobbyTrait(config: Partial<LobbyConfig> = {}): LobbyTrait {
  return new LobbyTrait(config);
}

// Type aliases for re-export
export type LobbyVisibilityType = LobbyVisibility;
export type LobbyStateType = LobbyState;
export type LobbyMatchmakingMode = MatchmakingMode;
export type LobbyEventTypeAlias = LobbyEventType;

// ── Handler (delegates to LobbyTrait) ──
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const lobbyHandler = {
  name: 'lobby',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new LobbyTrait(config);
    node.__lobby_instance = instance;
    ctx.emit('lobby_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__lobby_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('lobby_detached', { node });
    delete node.__lobby_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__lobby_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'lobby_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('lobby_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__lobby_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
