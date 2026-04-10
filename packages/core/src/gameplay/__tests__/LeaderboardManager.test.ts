import { describe, it, expect, beforeEach } from 'vitest';
import { LeaderboardManager } from '../LeaderboardManager';

describe('LeaderboardManager', () => {
  let lm: LeaderboardManager;

  beforeEach(() => {
    lm = new LeaderboardManager();
  });

  it('createBoard and getBoard', () => {
    lm.createBoard('score', 'High Scores');
    expect(lm.getBoard('score')).toBeDefined();
    expect(lm.getBoardCount()).toBe(1);
  });

  it('submitScore adds entry', () => {
    lm.createBoard('score', 'High Scores');
    const result = lm.submitScore('score', 'p1', 'Alice', 100);
    expect(result).not.toBeNull();
    expect(result!.rank).toBe(1);
    expect(result!.isPersonalBest).toBe(true);
    expect(lm.getEntryCount('score')).toBe(1);
  });

  it('submitScore returns null for unknown board', () => {
    expect(lm.submitScore('nope', 'p1', 'Alice', 100)).toBeNull();
  });

  it('descending board ranks higher scores first', () => {
    lm.createBoard('score', 'High Scores');
    lm.submitScore('score', 'p1', 'Alice', 50);
    lm.submitScore('score', 'p2', 'Bob', 100);
    expect(lm.getPlayerRank('score', 'p2')).toBe(1);
    expect(lm.getPlayerRank('score', 'p1')).toBe(2);
  });

  it('ascending board ranks lower scores first', () => {
    lm.createBoard('time', 'Fastest', true);
    lm.submitScore('time', 'p1', 'Alice', 30);
    lm.submitScore('time', 'p2', 'Bob', 10);
    expect(lm.getPlayerRank('time', 'p2')).toBe(1);
  });

  it('submitScore updates existing player entry', () => {
    lm.createBoard('score', 'High Scores');
    lm.submitScore('score', 'p1', 'Alice', 50);
    lm.submitScore('score', 'p1', 'Alice', 200);
    expect(lm.getEntryCount('score')).toBe(1);
    expect(lm.getPlayerEntry('score', 'p1')?.score).toBe(200);
  });

  it('personal best tracks correctly', () => {
    lm.createBoard('score', 'High Scores');
    lm.submitScore('score', 'p1', 'Alice', 100);
    const r2 = lm.submitScore('score', 'p1', 'Alice', 50);
    expect(r2!.isPersonalBest).toBe(false);
    expect(lm.getPersonalBest('p1', 'score')).toBe(100);
  });

  it('getTopN returns top entries', () => {
    lm.createBoard('score', 'High Scores');
    for (let i = 0; i < 5; i++) lm.submitScore('score', `p${i}`, `P${i}`, i * 10);
    expect(lm.getTopN('score', 3).length).toBe(3);
    expect(lm.getTopN('score', 3)[0].score).toBe(40);
  });

  it('getPage paginates', () => {
    lm.createBoard('score', 'High Scores');
    for (let i = 0; i < 25; i++) lm.submitScore('score', `p${i}`, `P${i}`, i);
    const page0 = lm.getPage('score', 0, 10);
    const page1 = lm.getPage('score', 1, 10);
    expect(page0.length).toBe(10);
    expect(page1.length).toBe(10);
  });

  it('maxEntries trims leaderboard', () => {
    lm.createBoard('score', 'High Scores', false, 3);
    for (let i = 0; i < 5; i++) lm.submitScore('score', `p${i}`, `P${i}`, i * 10);
    expect(lm.getEntryCount('score')).toBe(3);
  });

  it('getPlayerRank returns -1 for missing', () => {
    lm.createBoard('score', 'High Scores');
    expect(lm.getPlayerRank('score', 'nope')).toBe(-1);
  });

  it('getAroundPlayer returns neighbors', () => {
    lm.createBoard('score', 'High Scores');
    for (let i = 0; i < 10; i++) lm.submitScore('score', `p${i}`, `P${i}`, i * 10);
    const around = lm.getAroundPlayer('score', 'p5', 2);
    expect(around.length).toBeLessThanOrEqual(5);
    expect(around.some((e) => e.playerId === 'p5')).toBe(true);
  });

  it('getAroundPlayer returns empty for unknown player', () => {
    lm.createBoard('score', 'High Scores');
    expect(lm.getAroundPlayer('score', 'nope').length).toBe(0);
  });
});
