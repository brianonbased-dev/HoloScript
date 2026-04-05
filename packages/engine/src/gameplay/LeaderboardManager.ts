/**
 * LeaderboardManager.ts
 *
 * Leaderboard: scores, ranking, time periods,
 * pagination, and personal bests.
 *
 * @module gameplay
 */

// =============================================================================
// TYPES
// =============================================================================

export type TimePeriod = 'all-time' | 'daily' | 'weekly' | 'monthly';

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  rank: number;
  timestamp: number;
  metadata: Record<string, unknown>;
}

export interface LeaderboardDef {
  id: string;
  name: string;
  ascending: boolean; // true = lower is better (time-based)
  maxEntries: number;
  entries: LeaderboardEntry[];
}

// =============================================================================
// LEADERBOARD MANAGER
// =============================================================================

export class LeaderboardManager {
  private leaderboards: Map<string, LeaderboardDef> = new Map();
  private personalBests: Map<string, Map<string, number>> = new Map(); // player → board → score

  // ---------------------------------------------------------------------------
  // Board Management
  // ---------------------------------------------------------------------------

  createBoard(id: string, name: string, ascending = false, maxEntries = 100): LeaderboardDef {
    const board: LeaderboardDef = { id, name, ascending, maxEntries, entries: [] };
    this.leaderboards.set(id, board);
    return board;
  }

  getBoard(id: string): LeaderboardDef | undefined {
    return this.leaderboards.get(id);
  }

  // ---------------------------------------------------------------------------
  // Score Submission
  // ---------------------------------------------------------------------------

  submitScore(
    boardId: string,
    playerId: string,
    playerName: string,
    score: number,
    metadata: Record<string, unknown> = {}
  ): { rank: number; isPersonalBest: boolean } | null {
    const board = this.leaderboards.get(boardId);
    if (!board) return null;

    // Check personal best
    let pbMap = this.personalBests.get(playerId);
    if (!pbMap) {
      pbMap = new Map();
      this.personalBests.set(playerId, pbMap);
    }

    const prevBest = pbMap.get(boardId);
    const isPersonalBest =
      prevBest === undefined || (board.ascending ? score < prevBest : score > prevBest);

    if (isPersonalBest) pbMap.set(boardId, score);

    // Remove existing entry for this player
    board.entries = board.entries.filter((e) => e.playerId !== playerId);

    // Add new entry
    board.entries.push({
      playerId,
      playerName,
      score,
      rank: 0,
      timestamp: Date.now(),
      metadata,
    });

    // Sort and rank
    board.entries.sort((a, b) => (board.ascending ? a.score - b.score : b.score - a.score));

    // Trim to max
    if (board.entries.length > board.maxEntries) {
      board.entries = board.entries.slice(0, board.maxEntries);
    }

    // Assign ranks
    board.entries.forEach((e, i) => (e.rank = i + 1));

    const entry = board.entries.find((e) => e.playerId === playerId);
    return { rank: entry?.rank ?? -1, isPersonalBest };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTopN(boardId: string, n: number): LeaderboardEntry[] {
    const board = this.leaderboards.get(boardId);
    if (!board) return [];
    return board.entries.slice(0, n);
  }

  getPage(boardId: string, page: number, pageSize = 10): LeaderboardEntry[] {
    const board = this.leaderboards.get(boardId);
    if (!board) return [];
    const start = page * pageSize;
    return board.entries.slice(start, start + pageSize);
  }

  getPlayerRank(boardId: string, playerId: string): number {
    const board = this.leaderboards.get(boardId);
    if (!board) return -1;
    const entry = board.entries.find((e) => e.playerId === playerId);
    return entry?.rank ?? -1;
  }

  getPlayerEntry(boardId: string, playerId: string): LeaderboardEntry | undefined {
    const board = this.leaderboards.get(boardId);
    return board?.entries.find((e) => e.playerId === playerId);
  }

  getPersonalBest(playerId: string, boardId: string): number | undefined {
    return this.personalBests.get(playerId)?.get(boardId);
  }

  getAroundPlayer(boardId: string, playerId: string, range = 2): LeaderboardEntry[] {
    const board = this.leaderboards.get(boardId);
    if (!board) return [];
    const idx = board.entries.findIndex((e) => e.playerId === playerId);
    if (idx === -1) return [];
    const start = Math.max(0, idx - range);
    const end = Math.min(board.entries.length, idx + range + 1);
    return board.entries.slice(start, end);
  }

  getBoardCount(): number {
    return this.leaderboards.size;
  }
  getEntryCount(boardId: string): number {
    return this.leaderboards.get(boardId)?.entries.length ?? 0;
  }
}
