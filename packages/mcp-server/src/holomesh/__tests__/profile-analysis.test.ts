import { describe, it, expect, beforeEach } from 'vitest';
import { analyzeAgentProfile } from '../profile-analysis';
import { follow } from '../social';

const mockVotes: Record<string, number> = {};
const mockComments: Record<string, number> = {};
const getVoteCount = (id: string) => mockVotes[id] || 0;
const getCommentCount = (id: string) => mockComments[id] || 0;

function makeEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: `W.test.${Math.random().toString(36).slice(2, 6)}`,
    workspaceId: 'test',
    type: 'wisdom' as const,
    content: 'Test content for analysis',
    provenanceHash: 'abc123',
    authorId: 'agent-test',
    authorName: 'TestBot',
    queryCount: 0,
    reuseCount: 0,
    createdAt: new Date().toISOString(),
    voteCount: 0,
    commentCount: 0,
    engagement: 0,
    ...overrides,
  };
}

const allAgents = [
  {
    id: 'agent-test',
    name: 'TestBot',
    traits: ['@knowledge-exchange', '@architecture'],
    reputation: 25,
  },
  {
    id: 'agent-peer',
    name: 'PeerBot',
    traits: ['@knowledge-exchange', '@security'],
    reputation: 50,
  },
  { id: 'agent-fan', name: 'FanBot', traits: ['@knowledge-exchange'], reputation: 10 },
];

describe('Profile Analysis — Identity', () => {
  it('returns correct identity fields', () => {
    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      ['@knowledge-exchange', '@architecture'],
      [],
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.identity.id).toBe('agent-test');
    expect(analysis.identity.name).toBe('TestBot');
    expect(analysis.identity.reputation).toBe(25);
    expect(analysis.identity.tier).toBe('contributor');
  });
});

describe('Profile Analysis — Content Mix', () => {
  it('counts entries by type', () => {
    const entries = [
      makeEntry({ type: 'wisdom' }),
      makeEntry({ type: 'wisdom' }),
      makeEntry({ type: 'pattern' }),
      makeEntry({ type: 'gotcha' }),
    ];

    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.content_mix.wisdom).toBe(2);
    expect(analysis.content_mix.pattern).toBe(1);
    expect(analysis.content_mix.gotcha).toBe(1);
    expect(analysis.content_mix.total).toBe(4);
  });
});

describe('Profile Analysis — Domain Strengths', () => {
  it('identifies strongest domain by engagement', () => {
    mockVotes['entry-arch'] = 10;
    mockVotes['entry-sec'] = 2;
    mockComments['entry-arch'] = 5;

    const entries = [
      makeEntry({ id: 'entry-arch', domain: 'architecture' }),
      makeEntry({ id: 'entry-sec', domain: 'security' }),
    ];

    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.strengths[0].domain).toBe('architecture');
    expect(analysis.strengths[0].totalVotes).toBe(10);

    delete mockVotes['entry-arch'];
    delete mockVotes['entry-sec'];
    delete mockComments['entry-arch'];
  });
});

describe('Profile Analysis — Top Entries', () => {
  it('ranks entries by engagement', () => {
    mockVotes['top-1'] = 20;
    mockVotes['top-2'] = 5;
    mockComments['top-1'] = 10;

    const entries = [
      makeEntry({ id: 'top-2', content: 'Less popular' }),
      makeEntry({ id: 'top-1', content: 'Most popular' }),
    ];

    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.top_entries[0].id).toBe('top-1');
    expect(analysis.top_entries[0].voteCount).toBe(20);

    delete mockVotes['top-1'];
    delete mockVotes['top-2'];
    delete mockComments['top-1'];
  });

  it('limits to 5 entries', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry({ id: `e-${i}` }));

    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.top_entries.length).toBeLessThanOrEqual(5);
  });
});

describe('Profile Analysis — Social', () => {
  it('counts followers and following', () => {
    follow('agent-fan', 'agent-analysis-social');
    follow('agent-peer', 'agent-analysis-social');
    follow('agent-analysis-social', 'agent-fan');

    const analysis = analyzeAgentProfile(
      'agent-analysis-social',
      'SocialTest',
      10,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      [],
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.social.followers).toBe(2);
    expect(analysis.social.following).toBe(1);
    expect(analysis.social.mutual_follows).toBe(1);
    expect(analysis.social.follower_ratio).toBe(2);
  });
});

describe('Profile Analysis — Gaps', () => {
  it('detects missing content types', () => {
    const entries = Array.from({ length: 5 }, () => makeEntry({ type: 'wisdom' }));

    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.gaps.some((g) => g.includes('gotcha'))).toBe(true);
    expect(analysis.gaps.some((g) => g.includes('pattern'))).toBe(true);
  });

  it('detects no followers', () => {
    const entries = [makeEntry({ authorId: 'agent-no-followers' })];

    const analysis = analyzeAgentProfile(
      'agent-no-followers',
      'LonelyBot',
      0,
      'newcomer',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.gaps.some((g) => g.includes('No followers'))).toBe(true);
  });

  it('detects not following anyone', () => {
    const analysis = analyzeAgentProfile(
      'agent-isolated',
      'IsolatedBot',
      0,
      'newcomer',
      '2026-01-01T00:00:00Z',
      [],
      [],
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.gaps.some((g) => g.includes('Not following'))).toBe(true);
  });
});

describe('Profile Analysis — Recommendations', () => {
  it('recommends best performing content type', () => {
    mockVotes['rec-w1'] = 10;
    mockVotes['rec-w2'] = 8;
    mockVotes['rec-p1'] = 1;

    const entries = [
      makeEntry({ id: 'rec-w1', type: 'wisdom' }),
      makeEntry({ id: 'rec-w2', type: 'wisdom' }),
      makeEntry({ id: 'rec-p1', type: 'pattern' }),
    ];

    const analysis = analyzeAgentProfile(
      'agent-test',
      'TestBot',
      25,
      'contributor',
      '2026-01-01T00:00:00Z',
      [],
      entries,
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.recommendations.some((r) => r.includes('wisdom'))).toBe(true);

    delete mockVotes['rec-w1'];
    delete mockVotes['rec-w2'];
    delete mockVotes['rec-p1'];
  });

  it('returns empty analysis for agent with no entries', () => {
    const analysis = analyzeAgentProfile(
      'agent-empty',
      'EmptyBot',
      0,
      'newcomer',
      '2026-01-01T00:00:00Z',
      [],
      [],
      allAgents,
      getVoteCount,
      getCommentCount
    );

    expect(analysis.content_mix.total).toBe(0);
    expect(analysis.strengths.length).toBe(0);
    expect(analysis.top_entries.length).toBe(0);
    expect(analysis.engagement_stats.total_votes_received).toBe(0);
  });
});
