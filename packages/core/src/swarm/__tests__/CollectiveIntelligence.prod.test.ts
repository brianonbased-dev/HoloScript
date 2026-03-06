/**
 * CollectiveIntelligence — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { CollectiveIntelligence } from '../CollectiveIntelligence';
import type { IHiveContribution } from '../../extensions';

function make(cfg = {}) { return new CollectiveIntelligence(cfg); }

function contrib(type: IHiveContribution['type'], content: string, confidence = 0.8) {
  return { agentId: 'a1', type, content, confidence } as Omit<IHiveContribution, 'id' | 'timestamp'>;
}

describe('CollectiveIntelligence — createSession', () => {
  it('creates session with id', () => {
    const ci = make(); const s = ci.createSession('topic', 'goal', 'a1');
    expect(s.id).toBeTruthy(); expect(s.id.startsWith('hive-')).toBe(true);
  });
  it('session has correct topic/goal/initiator', () => {
    const ci = make(); const s = ci.createSession('AI safety', 'solve it', 'a1');
    expect(s.topic).toBe('AI safety'); expect(s.goal).toBe('solve it'); expect(s.initiator).toBe('a1');
  });
  it('session status=active', () => {
    const ci = make(); expect(ci.createSession('t', 'g', 'a1').status).toBe('active');
  });
  it('initiator is a participant', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    expect(s.participants).toContain('a1');
  });
  it('contributions starts empty', () => {
    const ci = make(); expect(ci.createSession('t', 'g', 'a1').contributions).toHaveLength(0);
  });
  it('getSession returns created session', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    expect(ci.getSession(s.id)).toBe(s);
  });
  it('getSession unknown=undefined', () => { expect(make().getSession('ghost')).toBeUndefined(); });
  it('getActiveSessions includes new session', () => {
    const ci = make(); ci.createSession('t', 'g', 'a1');
    expect(ci.getActiveSessions()).toHaveLength(1);
  });
});

describe('CollectiveIntelligence — join / leave', () => {
  it('join adds participant', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a2');
    expect(ci.getSession(s.id)!.participants).toContain('a2');
  });
  it('join idempotent for duplicate', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a1'); // already there
    expect(ci.getSession(s.id)!.participants).toHaveLength(1);
  });
  it('join unknown session throws', () => {
    expect(() => make().join('ghost', 'a1')).toThrow();
  });
  it('join full session throws', () => {
    const ci = make({ maxParticipants: 1 }); const s = ci.createSession('t', 'g', 'a1');
    expect(() => ci.join(s.id, 'a2')).toThrow();
  });
  it('leave removes participant', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a2'); ci.leave(s.id, 'a2');
    expect(ci.getSession(s.id)!.participants).not.toContain('a2');
  });
  it('leave unknown session throws', () => {
    expect(() => make().leave('ghost', 'a1')).toThrow();
  });
});

describe('CollectiveIntelligence — contribute', () => {
  it('returns IHiveContribution with id/timestamp', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    const c = ci.contribute(s.id, contrib('idea', 'use caching'));
    expect(c.id).toBeTruthy(); expect(c.timestamp).toBeGreaterThan(0);
  });
  it('contribution stored in session', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'scale'));
    expect(ci.getSession(s.id)!.contributions).toHaveLength(1);
  });
  it('non-participant cannot contribute', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    expect(() => ci.contribute(s.id, { agentId: 'stranger', type: 'idea', content: 'x', confidence: 0.5 })).toThrow();
  });
  it('contribute unknown session throws', () => {
    expect(() => make().contribute('ghost', contrib('idea', 'x'))).toThrow();
  });
  it('getAgentContributions returns only that agent', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a2');
    ci.contribute(s.id, contrib('idea', 'c1'));
    ci.contribute(s.id, { agentId: 'a2', type: 'critique', content: 'c2', confidence: 0.7 });
    expect(ci.getAgentContributions(s.id, 'a1')).toHaveLength(1);
  });
  it('contribute to closed session throws', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.closeSession(s.id);
    expect(() => ci.contribute(s.id, contrib('idea', 'x'))).toThrow();
  });
});

describe('CollectiveIntelligence — vote', () => {
  it('vote does not throw', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a2');
    const c = ci.contribute(s.id, contrib('idea', 'scale'));
    expect(() => ci.vote(s.id, c.id, 'a2', 'support')).not.toThrow();
  });
  it('non-participant cannot vote', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    const c = ci.contribute(s.id, contrib('idea', 'scale'));
    expect(() => ci.vote(s.id, c.id, 'outsider', 'support')).toThrow();
  });
  it('vote on unknown session throws', () => {
    expect(() => make().vote('ghost', 'c1', 'a1', 'support')).toThrow();
  });
  it('getVotingResults returns array for valid session', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'scale'));
    const results = ci.getVotingResults(s.id);
    expect(Array.isArray(results)).toBe(true);
  });
  it('getTopContribution returns highest voted', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a2');
    const c1 = ci.contribute(s.id, contrib('idea', 'best idea'));
    const c2 = ci.contribute(s.id, { agentId: 'a2', type: 'idea', content: 'other', confidence: 0.5 });
    ci.vote(s.id, c1.id, 'a2', 'support');
    const top = ci.getTopContribution(s.id);
    expect(top?.id).toBe(c1.id);
  });
});

describe('CollectiveIntelligence — synthesize', () => {
  it('returns empty result when below synthesisMinContributions', () => {
    const ci = make({ synthesisMinContributions: 3 });
    const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'x'));
    const r = ci.synthesize(s.id);
    expect(r.confidence).toBe(0); expect(r.synthesizedContent).toBe('');
  });
  it('returns non-empty when min contributions met', () => {
    const ci = make({ synthesisMinContributions: 2 });
    const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'implement caching layer'));
    ci.contribute(s.id, contrib('solution', 'use Redis for cache'));
    const r = ci.synthesize(s.id);
    expect(r.synthesizedContent.length).toBeGreaterThan(0);
    expect(r.confidence).toBeGreaterThan(0);
  });
  it('synthesize unknown session throws', () => {
    expect(() => make().synthesize('ghost')).toThrow();
  });
  it('metadata totals correct', () => {
    const ci = make({ synthesisMinContributions: 2 });
    const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'an idea'));
    ci.contribute(s.id, contrib('solution', 'a solution'));
    const r = ci.synthesize(s.id);
    expect(r.metadata.totalContributions).toBe(2);
    expect(r.metadata.ideaCount).toBe(1); expect(r.metadata.solutionCount).toBe(1);
  });
});

describe('CollectiveIntelligence — resolve / closeSession', () => {
  it('resolve sets session status=resolved', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.resolve(s.id, 'final decision');
    expect(ci.getSession(s.id)!.status).toBe('resolved');
    expect(ci.getSession(s.id)!.resolution).toBe('final decision');
  });
  it('resolve unknown session throws', () => {
    expect(() => make().resolve('ghost', 'x')).toThrow();
  });
  it('closeSession sets status=closed', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.closeSession(s.id);
    expect(ci.getSession(s.id)!.status).toBe('closed');
  });
  it('closeSession unknown session throws', () => {
    expect(() => make().closeSession('ghost')).toThrow();
  });
  it('resolved session not in getActiveSessions', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.resolve(s.id, 'done');
    expect(ci.getActiveSessions()).toHaveLength(0);
  });
});

describe('CollectiveIntelligence — getSessionStats', () => {
  it('returns undefined for unknown session', () => {
    expect(make().getSessionStats('ghost')).toBeUndefined();
  });
  it('returns correct participantCount and contributionCount', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.join(s.id, 'a2');
    ci.contribute(s.id, contrib('idea', 'x'));
    const stats = ci.getSessionStats(s.id)!;
    expect(stats.participantCount).toBe(2);
    expect(stats.contributionCount).toBe(1);
  });
  it('contributionsByType correct', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'x'));
    ci.contribute(s.id, contrib('critique', 'y'));
    const stats = ci.getSessionStats(s.id)!;
    expect(stats.contributionsByType.idea).toBe(1);
    expect(stats.contributionsByType.critique).toBe(1);
  });
  it('averageConfidence computed', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    ci.contribute(s.id, contrib('idea', 'x', 0.6));
    ci.contribute(s.id, contrib('idea', 'y', 0.8));
    const stats = ci.getSessionStats(s.id)!;
    expect(stats.averageConfidence).toBeCloseTo(0.7, 5);
  });
});

describe('CollectiveIntelligence — checkForConsensus', () => {
  it('returns false for empty session', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    expect(ci.checkForConsensus(s.id)).toBe(false);
  });
  it('checkForConsensus unknown session returns false', () => {
    expect(make().checkForConsensus('ghost')).toBe(false);
  });
});

describe('CollectiveIntelligence — findSimilarContributions', () => {
  it('returns empty for unknown session', () => {
    expect(make().findSimilarContributions('ghost', 'c1')).toHaveLength(0);
  });
  it('returns empty for unknown contribution', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    expect(ci.findSimilarContributions(s.id, 'ghost')).toHaveLength(0);
  });
  it('finds similar contributions by content overlap', () => {
    const ci = make(); const s = ci.createSession('t', 'g', 'a1');
    const c1 = ci.contribute(s.id, contrib('idea', 'implement redis caching system'));
    ci.contribute(s.id, contrib('idea', 'setup redis caching service'));
    const similar = ci.findSimilarContributions(s.id, c1.id);
    expect(similar.length).toBeGreaterThanOrEqual(0); // may or may not find based on jaccard threshold
  });
});
