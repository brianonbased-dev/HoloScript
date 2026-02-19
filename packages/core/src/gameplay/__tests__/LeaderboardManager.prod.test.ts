/**
 * LeaderboardManager.prod.test.ts
 *
 * Production tests for LeaderboardManager.
 * Pure in-memory, zero I/O, deterministic.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LeaderboardManager } from '../LeaderboardManager';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LeaderboardManager', () => {
  let mgr: LeaderboardManager;

  beforeEach(() => {
    mgr = new LeaderboardManager();
  });

  // ── Board Management ──────────────────────────────────────────────────────

  describe('createBoard / getBoard', () => {
    it('creates a board and returns it', () => {
      const board = mgr.createBoard('high_score', 'High Score');
      expect(board.id).toBe('high_score');
      expect(board.name).toBe('High Score');
      expect(board.ascending).toBe(false);
      expect(board.maxEntries).toBe(100);
      expect(board.entries).toHaveLength(0);
    });

    it('creates ascending board', () => {
      const board = mgr.createBoard('speedrun', 'Speedrun', true, 50);
      expect(board.ascending).toBe(true);
      expect(board.maxEntries).toBe(50);
    });

    it('getBoard returns undefined for unknown id', () => {
      expect(mgr.getBoard('bad')).toBeUndefined();
    });

    it('getBoardCount() increases', () => {
      mgr.createBoard('b1', 'B1');
      mgr.createBoard('b2', 'B2');
      expect(mgr.getBoardCount()).toBe(2);
    });
  });

  // ── Score Submission ──────────────────────────────────────────────────────

  describe('submitScore', () => {
    it('returns null for unknown board', () => {
      expect(mgr.submitScore('bad', 'p1', 'Alice', 100)).toBeNull();
    });

    it('first submission is always a personal best', () => {
      mgr.createBoard('hs', 'HS');
      const result = mgr.submitScore('hs', 'p1', 'Alice', 100);
      expect(result).not.toBeNull();
      expect(result!.isPersonalBest).toBe(true);
      expect(result!.rank).toBe(1);
    });

    it('higher score replaces lower on descending board', () => {
      mgr.createBoard('hs', 'HS');
      mgr.submitScore('hs', 'p1', 'Alice', 100);
      const r2 = mgr.submitScore('hs', 'p1', 'Alice', 200);
      expect(r2!.isPersonalBest).toBe(true);
      expect(mgr.getEntryCount('hs')).toBe(1); // only one entry per player
    });

    it('lower score is NOT a personal best on descending board', () => {
      mgr.createBoard('hs', 'HS');
      mgr.submitScore('hs', 'p1', 'Alice', 200);
      const r2 = mgr.submitScore('hs', 'p1', 'Alice', 100);
      expect(r2!.isPersonalBest).toBe(false);
    });

    it('lower score IS personal best on ascending board', () => {
      mgr.createBoard('sr', 'Speedrun', true);
      mgr.submitScore('sr', 'p1', 'Alice', 100);
      const r2 = mgr.submitScore('sr', 'p1', 'Alice', 80);
      expect(r2!.isPersonalBest).toBe(true);
    });

    it('ranks multiple players correctly (descending)', () => {
      mgr.createBoard('hs', 'HS');
      mgr.submitScore('hs', 'p1', 'Alice', 300);
      mgr.submitScore('hs', 'p2', 'Bob', 100);
      mgr.submitScore('hs', 'p3', 'Carol', 200);
      const top = mgr.getTopN('hs', 3);
      expect(top[0].playerName).toBe('Alice');
      expect(top[1].playerName).toBe('Carol');
      expect(top[2].playerName).toBe('Bob');
    });

    it('respects maxEntries cap', () => {
      mgr.createBoard('hs', 'HS', false, 2);
      mgr.submitScore('hs', 'p1', 'Alice', 300);
      mgr.submitScore('hs', 'p2', 'Bob', 200);
      mgr.submitScore('hs', 'p3', 'Carol', 100); // should be dropped
      expect(mgr.getEntryCount('hs')).toBe(2);
    });
  });

  // ── Queries ───────────────────────────────────────────────────────────────

  describe('queries', () => {
    beforeEach(() => {
      mgr.createBoard('hs', 'HS');
      ['p1', 'p2', 'p3', 'p4', 'p5'].forEach((id, i) => {
        mgr.submitScore('hs', id, `Player ${i + 1}`, (5 - i) * 100);
      });
      // Ranks: p1=1 (500), p2=2 (400), p3=3 (300), p4=4 (200), p5=5 (100)
    });

    it('getTopN returns correct count', () => {
      expect(mgr.getTopN('hs', 3)).toHaveLength(3);
    });

    it('getTopN returns empty array for unknown board', () => {
      expect(mgr.getTopN('bad', 3)).toHaveLength(0);
    });

    it('getPage returns correct page slice', () => {
      const page0 = mgr.getPage('hs', 0, 2);
      expect(page0).toHaveLength(2);
      expect(page0[0].playerId).toBe('p1');
    });

    it('getPlayerRank returns correct rank', () => {
      expect(mgr.getPlayerRank('hs', 'p3')).toBe(3);
    });

    it('getPlayerRank returns -1 for unknown player', () => {
      expect(mgr.getPlayerRank('hs', 'unknown')).toBe(-1);
    });

    it('getPlayerEntry returns entry', () => {
      const entry = mgr.getPlayerEntry('hs', 'p2');
      expect(entry).toBeDefined();
      expect(entry!.score).toBe(400);
    });

    it('getPersonalBest returns the best submitted score', () => {
      expect(mgr.getPersonalBest('p1', 'hs')).toBe(500);
    });

    it('getPersonalBest returns undefined for unknown player', () => {
      expect(mgr.getPersonalBest('unknown', 'hs')).toBeUndefined();
    });

    it('getAroundPlayer returns nearby entries', () => {
      const around = mgr.getAroundPlayer('hs', 'p3', 1);
      const ids = around.map(e => e.playerId);
      expect(ids).toContain('p2');
      expect(ids).toContain('p3');
      expect(ids).toContain('p4');
    });

    it('getAroundPlayer returns [] for unknown player', () => {
      expect(mgr.getAroundPlayer('hs', 'bad', 2)).toHaveLength(0);
    });

    it('getEntryCount returns 0 for unknown board', () => {
      expect(mgr.getEntryCount('bad')).toBe(0);
    });
  });
});
