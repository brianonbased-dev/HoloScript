/**
 * LeaderboardManager — score boards with ranking, pagination, personal bests.
 * @module gameplay
 */

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  score: number;
  timestamp: number;
}

export interface Board {
  id: string;
  name: string;
  ascending: boolean;
  maxEntries: number;
  entries: LeaderboardEntry[];
}

export interface SubmitResult {
  rank: number;
  isPersonalBest: boolean;
}

export class LeaderboardManager {
  private boards = new Map<string, Board>();
  private personalBests = new Map<string, Map<string, number>>(); // playerId -> boardId -> score

  getBoardCount(): number {
    return this.boards.size;
  }

  createBoard(id: string, name: string, ascending = false, maxEntries = 100): Board {
    const board: Board = {
      id,
      name,
      ascending,
      maxEntries,
      entries: [],
    };
    this.boards.set(id, board);
    return board;
  }

  getBoard(id: string): Board | undefined {
    return this.boards.get(id);
  }

  submitScore(
    boardId: string,
    playerId: string,
    playerName: string,
    score: number
  ): SubmitResult | null {
    const board = this.boards.get(boardId);
    if (!board) return null;

    // Track personal best
    let playerBests = this.personalBests.get(playerId);
    if (!playerBests) {
      playerBests = new Map();
      this.personalBests.set(playerId, playerBests);
    }

    const prevBest = playerBests.get(boardId);
    const isPersonalBest =
      prevBest === undefined ||
      (board.ascending ? score < prevBest : score > prevBest);

    if (isPersonalBest) {
      playerBests.set(boardId, score);
    }

    // Update or insert entry
    const existing = board.entries.find((e) => e.playerId === playerId);
    if (existing) {
      existing.score = score;
      existing.playerName = playerName;
      existing.timestamp = Date.now();
    } else {
      board.entries.push({
        playerId,
        playerName,
        score,
        timestamp: Date.now(),
      });
    }

    // Sort
    this.sortBoard(board);

    // Trim to maxEntries
    if (board.entries.length > board.maxEntries) {
      board.entries.length = board.maxEntries;
    }

    const rank = board.entries.findIndex((e) => e.playerId === playerId) + 1;

    return { rank: rank > 0 ? rank : -1, isPersonalBest };
  }

  getEntryCount(boardId: string): number {
    const board = this.boards.get(boardId);
    return board ? board.entries.length : 0;
  }

  getPlayerRank(boardId: string, playerId: string): number {
    const board = this.boards.get(boardId);
    if (!board) return -1;
    const idx = board.entries.findIndex((e) => e.playerId === playerId);
    return idx >= 0 ? idx + 1 : -1;
  }

  getPlayerEntry(boardId: string, playerId: string): LeaderboardEntry | undefined {
    const board = this.boards.get(boardId);
    if (!board) return undefined;
    return board.entries.find((e) => e.playerId === playerId);
  }

  getPersonalBest(playerId: string, boardId: string): number | undefined {
    return this.personalBests.get(playerId)?.get(boardId);
  }

  getTopN(boardId: string, n: number): LeaderboardEntry[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    return board.entries.slice(0, n);
  }

  getPage(boardId: string, page: number, pageSize: number): LeaderboardEntry[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    const start = page * pageSize;
    return board.entries.slice(start, start + pageSize);
  }

  getAroundPlayer(boardId: string, playerId: string, radius = 2): LeaderboardEntry[] {
    const board = this.boards.get(boardId);
    if (!board) return [];
    const idx = board.entries.findIndex((e) => e.playerId === playerId);
    if (idx < 0) return [];
    const start = Math.max(0, idx - radius);
    const end = Math.min(board.entries.length, idx + radius + 1);
    return board.entries.slice(start, end);
  }

  private sortBoard(board: Board): void {
    if (board.ascending) {
      board.entries.sort((a, b) => a.score - b.score);
    } else {
      board.entries.sort((a, b) => b.score - a.score);
    }
  }
}
