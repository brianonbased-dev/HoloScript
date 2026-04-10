/**
 * Matchmaker — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Matchmaker, type MatchmakingPlayer } from '../Matchmaker';

function player(
  id: string,
  rating: number,
  region = 'us-east'
): Omit<MatchmakingPlayer, 'queuedAt'> {
  return { id, name: `Player ${id}`, rating, region };
}

describe('Matchmaker — construction', () => {
  it('defaults minPlayers=2, maxPlayers=8', () => {
    const cfg = new Matchmaker().getConfig();
    expect(cfg.minPlayers).toBe(2);
    expect(cfg.maxPlayers).toBe(8);
  });
  it('accepts partial config overrides', () => {
    const mm = new Matchmaker({ minPlayers: 4, maxPlayers: 10, ratingWindow: 300 });
    expect(mm.getConfig().minPlayers).toBe(4);
    expect(mm.getConfig().ratingWindow).toBe(300);
  });
  it('getRegions returns default regions', () => {
    expect(new Matchmaker().getRegions()).toContain('us-east');
  });
  it('starts with empty queue and no matches', () => {
    const mm = new Matchmaker();
    expect(mm.getQueueSize()).toBe(0);
    expect(mm.getMatches()).toHaveLength(0);
  });
});

describe('Matchmaker — enqueue / dequeue', () => {
  it('enqueue adds a player', () => {
    const mm = new Matchmaker();
    mm.enqueue(player('p1', 1000));
    expect(mm.getQueueSize()).toBe(1);
  });
  it('enqueue is idempotent (same id twice = 1 entry)', () => {
    const mm = new Matchmaker();
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p1', 1000));
    expect(mm.getQueueSize()).toBe(1);
  });
  it('dequeue removes a player', () => {
    const mm = new Matchmaker();
    mm.enqueue(player('p1', 1000));
    expect(mm.dequeue('p1')).toBe(true);
    expect(mm.getQueueSize()).toBe(0);
  });
  it('dequeue returns false for unknown id', () => {
    expect(new Matchmaker().dequeue('ghost')).toBe(false);
  });
  it('getQueueSizeByRegion filters correctly', () => {
    const mm = new Matchmaker();
    mm.enqueue(player('a', 1000, 'us-east'));
    mm.enqueue(player('b', 1000, 'us-east'));
    mm.enqueue(player('c', 1000, 'eu-west'));
    expect(mm.getQueueSizeByRegion('us-east')).toBe(2);
    expect(mm.getQueueSizeByRegion('eu-west')).toBe(1);
    expect(mm.getQueueSizeByRegion('asia')).toBe(0);
  });
});

describe('Matchmaker — processQueue', () => {
  it('returns empty when queue has fewer than minPlayers', () => {
    const mm = new Matchmaker({ minPlayers: 2 });
    mm.enqueue(player('p1', 1000));
    expect(mm.processQueue()).toHaveLength(0);
  });

  it('forms a match with exactly minPlayers in same region', () => {
    const mm = new Matchmaker({ minPlayers: 2, maxPlayers: 4, ratingWindow: 200 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1050));
    const matches = mm.processQueue();
    expect(matches).toHaveLength(1);
    expect(matches[0].players).toHaveLength(2);
  });

  it('match has correct averageRating', () => {
    const mm = new Matchmaker({ minPlayers: 2, maxPlayers: 4, ratingWindow: 200 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1200));
    const [match] = mm.processQueue();
    expect(match.averageRating).toBe(1100);
  });

  it('match has correct ratingSpread', () => {
    const mm = new Matchmaker({ minPlayers: 2, maxPlayers: 4, ratingWindow: 500 });
    mm.enqueue(player('p1', 800));
    mm.enqueue(player('p2', 1200));
    const [match] = mm.processQueue();
    expect(match.ratingSpread).toBe(400);
  });

  it('match id is prefixed with "match_"', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 500 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1000));
    const [m] = mm.processQueue();
    expect(m.id).toMatch(/^match_/);
  });

  it('match id increments per match', () => {
    const mm = new Matchmaker({ minPlayers: 2, maxPlayers: 2, ratingWindow: 500 });
    mm.enqueue(player('p1', 1000, 'us-east'));
    mm.enqueue(player('p2', 1000, 'us-east'));
    mm.enqueue(player('p3', 1000, 'eu-west'));
    mm.enqueue(player('p4', 1000, 'eu-west'));
    const matches = mm.processQueue();
    expect(matches).toHaveLength(2);
    expect(matches[0].id).toBe('match_1');
    expect(matches[1].id).toBe('match_2');
  });

  it('removes matched players from queue', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 500 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1000));
    mm.processQueue();
    expect(mm.getQueueSize()).toBe(0);
  });

  it('does not match players with rating outside window', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 50 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1200)); // 200 pts apart, outside 50 window
    expect(mm.processQueue()).toHaveLength(0);
  });

  it('does not match players across different regions', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 999 });
    mm.enqueue(player('p1', 1000, 'us-east'));
    mm.enqueue(player('p2', 1000, 'eu-west'));
    expect(mm.processQueue()).toHaveLength(0);
    expect(mm.getQueueSize()).toBe(2);
  });

  it('max match size respects maxPlayers', () => {
    const mm = new Matchmaker({ minPlayers: 2, maxPlayers: 3, ratingWindow: 999 });
    for (let i = 0; i < 5; i++) mm.enqueue(player(`p${i}`, 1000));
    const [match] = mm.processQueue();
    expect(match.players).toHaveLength(3);
  });

  it('matched players moved to getMatches()', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 999 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1000));
    mm.processQueue();
    expect(mm.getMatches()).toHaveLength(1);
  });

  it('getMatches returns a copy', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 999 });
    mm.enqueue(player('p1', 1000));
    mm.enqueue(player('p2', 1000));
    mm.processQueue();
    const m1 = mm.getMatches();
    m1.pop();
    expect(mm.getMatches()).toHaveLength(1);
  });
});

describe('Matchmaker — estimateWaitTime', () => {
  it('returns 0 when enough nearby players exist', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 200 });
    mm.enqueue(player('p1', 1000));
    expect(mm.estimateWaitTime(1050, 'us-east')).toBe(0);
  });
  it('returns positive estimate when not enough nearby players', () => {
    const mm = new Matchmaker({ minPlayers: 3, ratingWindow: 200 });
    mm.enqueue(player('p1', 1000));
    const wait = mm.estimateWaitTime(1050, 'us-east');
    expect(wait).toBeGreaterThan(0);
  });
  it('ignores players in wrong region', () => {
    const mm = new Matchmaker({ minPlayers: 2, ratingWindow: 200 });
    mm.enqueue(player('p1', 1000, 'eu-west'));
    const wait = mm.estimateWaitTime(1000, 'us-east');
    expect(wait).toBeGreaterThan(0);
  });
});
