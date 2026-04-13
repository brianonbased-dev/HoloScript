/**
 * Matchmaker — Skill-based matchmaking, queues, and region selection
 *
 * Manages player queues, skill-based matching with configurable
 * windows, and region-based filtering.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface MatchmakingPlayer {
  id: string;
  name: string;
  rating: number;
  region: string;
  queuedAt: number;
  preferences?: {
    maxLatency?: number;
    gameMode?: string;
  };
}

export interface MatchResult {
  id: string;
  players: MatchmakingPlayer[];
  averageRating: number;
  ratingSpread: number;
  region: string;
  createdAt: number;
}

export interface MatchmakingConfig {
  minPlayers: number;
  maxPlayers: number;
  ratingWindow: number;
  ratingExpansionRate: number;
  maxWaitTimeMs: number;
  regions: string[];
}

// =============================================================================
// MATCHMAKER
// =============================================================================

export class Matchmaker {
  private queue: Map<string, MatchmakingPlayer> = new Map();
  private matches: MatchResult[] = [];
  private config: MatchmakingConfig;
  private nextMatchId: number = 1;

  constructor(config: Partial<MatchmakingConfig> = {}) {
    this.config = {
      minPlayers: config.minPlayers ?? 2,
      maxPlayers: config.maxPlayers ?? 8,
      ratingWindow: config.ratingWindow ?? 200,
      ratingExpansionRate: config.ratingExpansionRate ?? 50,
      maxWaitTimeMs: config.maxWaitTimeMs ?? 60000,
      regions: config.regions ?? ['us-east', 'us-west', 'eu-west', 'asia'],
    };
  }

  /**
   * Add a player to the queue
   */
  enqueue(player: Omit<MatchmakingPlayer, 'queuedAt'>): void {
    if (this.queue.has(player.id)) return;
    this.queue.set(player.id, { ...player, queuedAt: Date.now() });
  }

  /**
   * Remove a player from the queue
   */
  dequeue(playerId: string): boolean {
    return this.queue.delete(playerId);
  }

  /**
   * Get queue size
   */
  getQueueSize(): number {
    return this.queue.size;
  }

  /**
   * Get queue size by region
   */
  getQueueSizeByRegion(region: string): number {
    return [...this.queue.values()].filter((p) => p.region === region).length;
  }

  /**
   * Attempt to form matches from the current queue
   */
  processQueue(): MatchResult[] {
    const newMatches: MatchResult[] = [];
    const now = Date.now();

    // Group by region
    const byRegion = new Map<string, MatchmakingPlayer[]>();
    for (const player of this.queue.values()) {
      const region = player.region;
      if (!byRegion.has(region)) byRegion.set(region, []);
      byRegion.get(region)!.push(player);
    }

    for (const [region, players] of byRegion) {
      // Sort by rating
      players.sort((a, b) => a.rating - b.rating);

      let i = 0;
      while (i < players.length) {
        const anchor = players[i];
        const waitTime = now - anchor.queuedAt;
        const expandedWindow =
          this.config.ratingWindow + Math.floor(waitTime / 1000) * this.config.ratingExpansionRate;

        const compatible: MatchmakingPlayer[] = [anchor];

        for (let j = i + 1; j < players.length && compatible.length < this.config.maxPlayers; j++) {
          if (Math.abs(players[j].rating - anchor.rating) <= expandedWindow) {
            compatible.push(players[j]);
          }
        }

        if (compatible.length >= this.config.minPlayers) {
          const matchPlayers = compatible.slice(0, this.config.maxPlayers);
          const ratings = matchPlayers.map((p) => p.rating);
          const avgRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;

          const match: MatchResult = {
            id: `match_${this.nextMatchId++}`,
            players: matchPlayers,
            averageRating: Math.round(avgRating),
            ratingSpread: Math.max(...ratings) - Math.min(...ratings),
            region,
            createdAt: now,
          };

          newMatches.push(match);
          this.matches.push(match);

          // Remove matched players from queue
          for (const p of matchPlayers) {
            this.queue.delete(p.id);
          }

          // Don't increment i — array shifted
          break;
        } else {
          i++;
        }
      }
    }

    return newMatches;
  }

  /**
   * Get estimated wait time for a player at a given rating/region
   */
  estimateWaitTime(rating: number, region: string): number {
    const regionPlayers = [...this.queue.values()].filter((p) => p.region === region);
    const nearby = regionPlayers.filter(
      (p) => Math.abs(p.rating - rating) <= this.config.ratingWindow
    );

    if (nearby.length >= this.config.minPlayers - 1) return 0;

    const needed = this.config.minPlayers - 1 - nearby.length;
    return needed * 5000; // Rough estimate: 5s per needed player
  }

  /**
   * Get match history
   */
  getMatches(): MatchResult[] {
    return [...this.matches];
  }

  /**
   * Get available regions
   */
  getRegions(): string[] {
    return [...this.config.regions];
  }

  /**
   * Get config
   */
  getConfig(): MatchmakingConfig {
    return { ...this.config };
  }
}
