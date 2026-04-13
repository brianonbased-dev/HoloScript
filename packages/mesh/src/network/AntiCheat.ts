/**
 * AntiCheat â€” Server authority validation and cheat detection
 *
 * Implements speed/teleport detection, rate limiting, and
 * server authority validation for multiplayer integrity.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface PlayerState {
  id: string;
  position: [number, number, number];
  velocity: { x: number; y: number; z: number };
  lastUpdateAt: number;
  violations: Violation[];
  banned: boolean;
}

export interface Violation {
  type: 'speed' | 'teleport' | 'rate_limit' | 'invalid_action';
  severity: 'warning' | 'kick' | 'ban';
  description: string;
  timestamp: number;
}

export interface AntiCheatConfig {
  maxSpeed: number;
  maxTeleportDistance: number;
  maxActionsPerSecond: number;
  violationThreshold: number;
  banThreshold: number;
}

// =============================================================================
// ANTI-CHEAT
// =============================================================================

export class AntiCheat {
  private players: Map<string, PlayerState> = new Map();
  private actionCounts: Map<string, { count: number; windowStart: number }> = new Map();
  private config: AntiCheatConfig;

  constructor(config: Partial<AntiCheatConfig> = {}) {
    this.config = {
      maxSpeed: config.maxSpeed ?? 20,
      maxTeleportDistance: config.maxTeleportDistance ?? 50,
      maxActionsPerSecond: config.maxActionsPerSecond ?? 30,
      violationThreshold: config.violationThreshold ?? 3,
      banThreshold: config.banThreshold ?? 5,
    };
  }

  /**
   * Register a player for monitoring
   */
  registerPlayer(playerId: string, position = { x: 0, y: 0, z: 0 }): void {
    this.players.set(playerId, {
      id: playerId,
      position,
      velocity: { x: 0, y: 0, z: 0 },
      lastUpdateAt: Date.now(),
      violations: [],
      banned: false,
    });
    this.actionCounts.set(playerId, { count: 0, windowStart: Date.now() });
  }

  /**
   * Unregister a player
   */
  unregisterPlayer(playerId: string): void {
    this.players.delete(playerId);
    this.actionCounts.delete(playerId);
  }

  /**
   * Validate a position update from a client
   */
  validatePositionUpdate(
    playerId: string,
    newPosition: { x: number; y: number; z: number }
  ): { valid: boolean; violation?: Violation } {
    const player = this.players.get(playerId);
    if (!player) return { valid: false };
    if (player.banned) return { valid: false };

    const now = Date.now();
    const dt = (now - player.lastUpdateAt) / 1000; // seconds

    const dx = newPosition.x - player.position.x;
    const dy = newPosition.y - player.position.y;
    const dz = newPosition.z - player.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Teleport detection
    if (distance > this.config.maxTeleportDistance) {
      const violation: Violation = {
        type: 'teleport',
        severity: 'kick',
        description: `Teleport detected: ${distance.toFixed(1)} units`,
        timestamp: now,
      };
      player.violations.push(violation);
      this.checkBanThreshold(player);
      return { valid: false, violation };
    }

    // Speed detection â€” only meaningful when dt >= 10ms (sub-ms deltas produce invalid computed speeds)
    if (dt >= 0.01) {
      const speed = distance / dt;
      if (speed > this.config.maxSpeed) {
        const violation: Violation = {
          type: 'speed',
          severity: 'warning',
          description: `Speed violation: ${speed.toFixed(1)} u/s (max: ${this.config.maxSpeed})`,
          timestamp: now,
        };
        player.violations.push(violation);
        this.checkBanThreshold(player);
        return { valid: false, violation };
      }
    }

    // Accept update
    player.position = { ...newPosition };
    player.lastUpdateAt = now;
    if (dt > 0) {
      player.velocity = { x: dx / dt, y: dy / dt, z: dz / dt };
    }

    return { valid: true };
  }

  /**
   * Rate limiting for player actions
   */
  validateAction(playerId: string): { allowed: boolean; violation?: Violation } {
    const counter = this.actionCounts.get(playerId);
    if (!counter) return { allowed: false };

    const now = Date.now();
    const windowDuration = 1000; // 1 second window

    if (now - counter.windowStart > windowDuration) {
      counter.count = 1;
      counter.windowStart = now;
      return { allowed: true };
    }

    counter.count++;

    if (counter.count > this.config.maxActionsPerSecond) {
      const player = this.players.get(playerId);
      if (player) {
        const violation: Violation = {
          type: 'rate_limit',
          severity: 'warning',
          description: `Rate limit exceeded: ${counter.count} actions/sec`,
          timestamp: now,
        };
        player.violations.push(violation);
        this.checkBanThreshold(player);
        return { allowed: false, violation };
      }
      return { allowed: false };
    }

    return { allowed: true };
  }

  /**
   * Get player violations
   */
  getViolations(playerId: string): Violation[] {
    return this.players.get(playerId)?.violations || [];
  }

  /**
   * Get violation count
   */
  getViolationCount(playerId: string): number {
    return this.players.get(playerId)?.violations.length || 0;
  }

  /**
   * Check if player is banned
   */
  isBanned(playerId: string): boolean {
    return this.players.get(playerId)?.banned || false;
  }

  /**
   * Manually ban a player
   */
  ban(playerId: string): void {
    const player = this.players.get(playerId);
    if (player) player.banned = true;
  }

  /**
   * Get player state
   */
  getPlayerState(playerId: string): PlayerState | undefined {
    return this.players.get(playerId);
  }

  /**
   * Get all monitored player IDs
   */
  getPlayerIds(): string[] {
    return [...this.players.keys()];
  }

  /**
   * Get config
   */
  getConfig(): AntiCheatConfig {
    return { ...this.config };
  }

  private checkBanThreshold(player: PlayerState): void {
    if (player.violations.length >= this.config.banThreshold) {
      player.banned = true;
    }
  }
}
