import { describe, it, expect, beforeEach } from 'vitest';
import { Matchmaker } from '../network/Matchmaker';

describe('Matchmaker', () => {
  let mm: Matchmaker;

  beforeEach(() => {
    mm = new Matchmaker({ minPlayers: 2, maxPlayers: 4, ratingWindow: 100 });
  });

  it('enqueue adds player to queue', () => {
    mm.enqueue({ id: 'p1', name: 'Alice', rating: 1000, region: 'us-east' });
    expect(mm.getQueueSize()).toBe(1);
  });

  it('enqueue ignores duplicate player', () => {
    mm.enqueue({ id: 'p1', name: 'Alice', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p1', name: 'Alice', rating: 1000, region: 'us-east' });
    expect(mm.getQueueSize()).toBe(1);
  });

  it('dequeue removes player from queue', () => {
    mm.enqueue({ id: 'p1', name: 'Alice', rating: 1000, region: 'us-east' });
    expect(mm.dequeue('p1')).toBe(true);
    expect(mm.getQueueSize()).toBe(0);
  });

  it('processQueue forms match when enough players in range', () => {
    mm.enqueue({ id: 'p1', name: 'Alice', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p2', name: 'Bob', rating: 1050, region: 'us-east' });
    const matches = mm.processQueue();
    expect(matches.length).toBe(1);
    expect(matches[0].players.length).toBe(2);
    expect(mm.getQueueSize()).toBe(0); // matched players removed
  });

  it('processQueue groups by region', () => {
    mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p2', name: 'B', rating: 1000, region: 'eu-west' });
    const matches = mm.processQueue();
    expect(matches.length).toBe(0); // different regions, can't match
  });

  it('processQueue respects ratingWindow', () => {
    mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p2', name: 'B', rating: 2000, region: 'us-east' });
    const matches = mm.processQueue();
    expect(matches.length).toBe(0); // rating diff too large
  });

  it('match result includes averageRating and ratingSpread', () => {
    mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p2', name: 'B', rating: 1100, region: 'us-east' });
    const matches = mm.processQueue();
    expect(matches[0].averageRating).toBe(1050);
    expect(matches[0].ratingSpread).toBe(100);
  });

  it('getQueueSizeByRegion filters correctly', () => {
    mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p2', name: 'B', rating: 1000, region: 'eu-west' });
    mm.enqueue({ id: 'p3', name: 'C', rating: 1000, region: 'us-east' });
    expect(mm.getQueueSizeByRegion('us-east')).toBe(2);
    expect(mm.getQueueSizeByRegion('eu-west')).toBe(1);
  });

  it('estimateWaitTime returns 0 when enough nearby players', () => {
    mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
    expect(mm.estimateWaitTime(1050, 'us-east')).toBe(0);
  });

  it('getMatches returns match history', () => {
    mm.enqueue({ id: 'p1', name: 'A', rating: 1000, region: 'us-east' });
    mm.enqueue({ id: 'p2', name: 'B', rating: 1050, region: 'us-east' });
    mm.processQueue();
    expect(mm.getMatches().length).toBe(1);
  });

  it('getRegions returns configured regions', () => {
    expect(mm.getRegions()).toContain('us-east');
  });
});
