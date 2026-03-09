import { describe, it, expect, beforeEach } from 'vitest';
import { LeaderboardManager } from '../gameplay/LeaderboardManager';

// =============================================================================
// C283 — Leaderboard Manager
// =============================================================================

describe('LeaderboardManager', () => {
  let lm: LeaderboardManager;
  beforeEach(() => {
    lm = new LeaderboardManager();
  });

  it('createBoard creates a leaderboard', () => {
    lm.createBoard('score', 'High Scores');
    expect(lm.getBoardCount()).toBe(1);
  });

  it('submitScore adds entry and returns rank', () => {
    lm.createBoard('score', 'High Scores');
    const result = lm.submitScore('score', 'p1', 'Alice', 100);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(1);
    expect(result!.isPersonalBest).toBe(true);
  });

  it('descending board ranks higher score first', () => {
    lm.createBoard('score', 'High Scores');
    lm.submitScore('score', 'p1', 'Alice', 50);
    lm.submitScore('score', 'p2', 'Bob', 100);
    expect(lm.getPlayerRank('score', 'p2')).toBe(1);
    expect(lm.getPlayerRank('score', 'p1')).toBe(2);
  });

  it('ascending board ranks lower score first', () => {
    lm.createBoard('time', 'Speedrun', true);
    lm.submitScore('time', 'p1', 'Alice', 60);
    lm.submitScore('time', 'p2', 'Bob', 30);
    expect(lm.getPlayerRank('time', 'p2')).toBe(1);
  });

  it('submitScore replaces existing entry for same player', () => {
    lm.createBoard('score', 'High Scores');
    lm.submitScore('score', 'p1', 'Alice', 50);
    lm.submitScore('score', 'p1', 'Alice', 100);
    expect(lm.getEntryCount('score')).toBe(1);
    expect(lm.getPlayerEntry('score', 'p1')!.score).toBe(100);
  });

  it('personal best tracking', () => {
    lm.createBoard('score', 'High Scores');
    const r1 = lm.submitScore('score', 'p1', 'Alice', 100)!;
    expect(r1.isPersonalBest).toBe(true);
    const r2 = lm.submitScore('score', 'p1', 'Alice', 50)!;
    expect(r2.isPersonalBest).toBe(false);
    expect(lm.getPersonalBest('p1', 'score')).toBe(100);
  });

  it('getTopN returns top entries', () => {
    lm.createBoard('score', 'High Scores');
    for (let i = 0; i < 10; i++) lm.submitScore('score', `p${i}`, `P${i}`, i * 10);
    const top3 = lm.getTopN('score', 3);
    expect(top3).toHaveLength(3);
    expect(top3[0].score).toBe(90);
  });

  it('getPage paginates results', () => {
    lm.createBoard('score', 'High Scores');
    for (let i = 0; i < 25; i++) lm.submitScore('score', `p${i}`, `P${i}`, i);
    expect(lm.getPage('score', 0, 10)).toHaveLength(10);
    expect(lm.getPage('score', 2, 10)).toHaveLength(5);
  });

  it('maxEntries trims leaderboard', () => {
    lm.createBoard('score', 'High Scores', false, 5);
    for (let i = 0; i < 10; i++) lm.submitScore('score', `p${i}`, `P${i}`, i * 10);
    expect(lm.getEntryCount('score')).toBe(5);
    expect(lm.getTopN('score', 5)[0].score).toBe(90);
  });

  it('getAroundPlayer returns neighborhood', () => {
    lm.createBoard('score', 'High Scores');
    for (let i = 0; i < 10; i++) lm.submitScore('score', `p${i}`, `P${i}`, i * 10);
    const around = lm.getAroundPlayer('score', 'p5', 2);
    expect(around.length).toBeLessThanOrEqual(5);
  });
});
