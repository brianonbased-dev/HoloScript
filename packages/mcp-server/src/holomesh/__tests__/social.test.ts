import { describe, it, expect } from 'vitest';
import {
  follow,
  unfollow,
  getFollowing,
  getFollowers,
  isFollowing,
  block,
  unblock,
  isBlocked,
  getBlocked,
  scoreFeedEntry,
  rankFeed,
  createReport,
  getReports,
  reviewReport,
  isValidReason,
  extractMentions,
  checkRateLimit,
  paginate,
} from '../social';

// ── Social Graph ──────────────────────────────────────────────────────────

describe('Social Graph — Follow/Unfollow', () => {
  it('follow adds to both following and followers', () => {
    follow('agent-a', 'agent-b');
    expect(getFollowing('agent-a')).toContain('agent-b');
    expect(getFollowers('agent-b')).toContain('agent-a');
  });

  it('unfollow removes from both', () => {
    follow('agent-c', 'agent-d');
    unfollow('agent-c', 'agent-d');
    expect(getFollowing('agent-c')).not.toContain('agent-d');
    expect(getFollowers('agent-d')).not.toContain('agent-c');
  });

  it('cannot follow self', () => {
    expect(follow('agent-x', 'agent-x')).toBe(false);
  });

  it('isFollowing returns correct state', () => {
    follow('agent-e', 'agent-f');
    expect(isFollowing('agent-e', 'agent-f')).toBe(true);
    expect(isFollowing('agent-f', 'agent-e')).toBe(false);
  });

  it('following is idempotent', () => {
    follow('agent-g', 'agent-h');
    follow('agent-g', 'agent-h');
    expect(getFollowing('agent-g').filter((id) => id === 'agent-h').length).toBe(1);
  });
});

describe('Social Graph — Block/Unblock', () => {
  it('blocking auto-unfollows both directions', () => {
    follow('agent-1', 'agent-2');
    follow('agent-2', 'agent-1');
    block('agent-1', 'agent-2');
    expect(isFollowing('agent-1', 'agent-2')).toBe(false);
    expect(isFollowing('agent-2', 'agent-1')).toBe(false);
  });

  it('blocked agent cannot follow blocker', () => {
    block('agent-3', 'agent-4');
    expect(follow('agent-4', 'agent-3')).toBe(false);
  });

  it('isBlocked returns correct state', () => {
    block('agent-5', 'agent-6');
    expect(isBlocked('agent-5', 'agent-6')).toBe(true);
    expect(isBlocked('agent-6', 'agent-5')).toBe(false);
  });

  it('unblock allows following again', () => {
    block('agent-7', 'agent-8');
    unblock('agent-7', 'agent-8');
    expect(follow('agent-8', 'agent-7')).toBe(true);
  });

  it('cannot block self', () => {
    expect(block('agent-9', 'agent-9')).toBe(false);
  });

  it('getBlocked lists all blocked', () => {
    block('agent-10', 'target-1');
    block('agent-10', 'target-2');
    expect(getBlocked('agent-10')).toContain('target-1');
    expect(getBlocked('agent-10')).toContain('target-2');
  });
});

// ── Feed Ranking ──────────────────────────────────────────────────────────

describe('Feed Ranking', () => {
  const now = Date.now();

  it('scoreFeedEntry gives higher score to more engaged entries', () => {
    const low = scoreFeedEntry(
      { id: '1', voteCount: 0, commentCount: 0, createdAt: new Date(now).toISOString() },
      now
    );
    const high = scoreFeedEntry(
      { id: '2', voteCount: 10, commentCount: 5, createdAt: new Date(now).toISOString() },
      now
    );
    expect(high).toBeGreaterThan(low);
  });

  it('scoreFeedEntry decays with time', () => {
    const fresh = scoreFeedEntry(
      { id: '1', voteCount: 5, commentCount: 2, createdAt: new Date(now).toISOString() },
      now
    );
    const old = scoreFeedEntry(
      {
        id: '2',
        voteCount: 5,
        commentCount: 2,
        createdAt: new Date(now - 48 * 3600000).toISOString(),
      },
      now
    );
    expect(fresh).toBeGreaterThan(old);
  });

  it('author reputation boosts score', () => {
    const noRep = scoreFeedEntry(
      {
        id: '1',
        voteCount: 3,
        commentCount: 1,
        authorReputation: 0,
        createdAt: new Date(now).toISOString(),
      },
      now
    );
    const highRep = scoreFeedEntry(
      {
        id: '2',
        voteCount: 3,
        commentCount: 1,
        authorReputation: 100,
        createdAt: new Date(now).toISOString(),
      },
      now
    );
    expect(highRep).toBeGreaterThan(noRep);
  });

  it('rankFeed sorts by score in ranked mode', () => {
    const entries = [
      {
        id: 'low',
        voteCount: 0,
        commentCount: 0,
        createdAt: new Date(now - 86400000).toISOString(),
      },
      { id: 'high', voteCount: 20, commentCount: 10, createdAt: new Date(now).toISOString() },
      {
        id: 'mid',
        voteCount: 5,
        commentCount: 2,
        createdAt: new Date(now - 3600000).toISOString(),
      },
    ];
    const ranked = rankFeed(entries, 'ranked');
    expect(ranked[0].id).toBe('high');
  });

  it('rankFeed chronological sorts by time', () => {
    const entries = [
      {
        id: 'old',
        voteCount: 100,
        commentCount: 50,
        createdAt: new Date(now - 86400000).toISOString(),
      },
      { id: 'new', voteCount: 0, commentCount: 0, createdAt: new Date(now).toISOString() },
    ];
    const sorted = rankFeed(entries, 'chronological');
    expect(sorted[0].id).toBe('new');
  });

  it('rankFeed top sorts by engagement', () => {
    const entries = [
      { id: 'boring', voteCount: 1, commentCount: 0, createdAt: new Date(now).toISOString() },
      {
        id: 'popular',
        voteCount: 50,
        commentCount: 20,
        createdAt: new Date(now - 86400000).toISOString(),
      },
    ];
    const sorted = rankFeed(entries, 'top');
    expect(sorted[0].id).toBe('popular');
  });

  it('rankFeed following filters by followingIds', () => {
    const entries = [
      {
        id: 'followed',
        authorId: 'friend',
        voteCount: 1,
        commentCount: 0,
        createdAt: new Date(now).toISOString(),
      },
      {
        id: 'stranger',
        authorId: 'unknown',
        voteCount: 10,
        commentCount: 5,
        createdAt: new Date(now).toISOString(),
      },
    ];
    const sorted = rankFeed(entries, 'following', new Set(['friend']));
    expect(sorted.length).toBe(1);
    expect(sorted[0].id).toBe('followed');
  });

  it('rankFeed following returns empty if not following anyone', () => {
    const entries = [
      {
        id: 'entry1',
        authorId: 'a',
        voteCount: 5,
        commentCount: 2,
        createdAt: new Date(now).toISOString(),
      },
    ];
    const sorted = rankFeed(entries, 'following', new Set());
    expect(sorted.length).toBe(0);
  });
});

// ── Content Moderation ──────────────────────────────────────────────────

describe('Content Moderation', () => {
  it('createReport returns report with pending status', () => {
    const report = createReport('entry', 'entry-1', 'reporter-1', 'ReporterBot', 'spam');
    expect(report.status).toBe('pending');
    expect(report.reason).toBe('spam');
    expect(report.targetId).toBe('entry-1');
  });

  it('getReports filters by status', () => {
    createReport('comment', 'cmt-1', 'reporter-2', 'Bot2', 'harassment');
    const pending = getReports('pending');
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.every((r) => r.status === 'pending')).toBe(true);
  });

  it('reviewReport updates status and records reviewer', () => {
    const report = createReport(
      'agent',
      'bad-agent',
      'reporter-3',
      'Bot3',
      'spam',
      'sending too many messages'
    );
    const reviewed = reviewReport(report.id, 'admin-1', 'warn');
    expect(reviewed).not.toBeNull();
    expect(reviewed!.status).toBe('actioned');
    expect(reviewed!.reviewedBy).toBe('admin-1');
    expect(reviewed!.action).toBe('warn');
  });

  it('dismiss sets status to dismissed', () => {
    const report = createReport('entry', 'entry-ok', 'reporter-4', 'Bot4', 'other');
    const reviewed = reviewReport(report.id, 'admin-2', 'dismiss');
    expect(reviewed!.status).toBe('dismissed');
  });

  it('isValidReason validates known reasons', () => {
    expect(isValidReason('spam')).toBe(true);
    expect(isValidReason('harassment')).toBe(true);
    expect(isValidReason('invalid')).toBe(false);
  });
});

// ── @Mentions ─────────────────────────────────────────────────────────────

describe('@Mentions', () => {
  it('extracts single mention', () => {
    expect(extractMentions('Hello @agent-bot!')).toEqual(['agent-bot']);
  });

  it('extracts multiple mentions', () => {
    const mentions = extractMentions('@alice and @bob should see this');
    expect(mentions).toContain('alice');
    expect(mentions).toContain('bob');
  });

  it('deduplicates mentions', () => {
    expect(extractMentions('@same @same @same').length).toBe(1);
  });

  it('returns empty array for no mentions', () => {
    expect(extractMentions('no mentions here')).toEqual([]);
  });

  it('handles dots and hyphens in names', () => {
    const mentions = extractMentions('@holoscript-delegate and @agent.v2');
    expect(mentions).toContain('holoscript-delegate');
    expect(mentions).toContain('agent.v2');
  });
});

// ── Rate Limiting ─────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
  it('allows requests within limit', () => {
    const result = checkRateLimit('rate-test-1', 'contribute');
    expect(result.allowed).toBe(true);
  });

  it('blocks after exceeding limit', () => {
    const agentId = `rate-test-burst-${Date.now()}`;
    // Contribute limit is 10/min
    for (let i = 0; i < 10; i++) {
      checkRateLimit(agentId, 'contribute');
    }
    const result = checkRateLimit(agentId, 'contribute');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('different actions have separate limits', () => {
    const agentId = `rate-test-sep-${Date.now()}`;
    for (let i = 0; i < 10; i++) {
      checkRateLimit(agentId, 'contribute');
    }
    // Comment has separate bucket
    const result = checkRateLimit(agentId, 'comment');
    expect(result.allowed).toBe(true);
  });
});

// ── Cursor Pagination ─────────────────────────────────────────────────────

describe('Cursor Pagination', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: i }));

  it('first page returns items with cursor_next', () => {
    const page = paginate(items, 10);
    expect(page.items.length).toBe(10);
    expect(page.items[0].id).toBe(0);
    expect(page.cursor_next).not.toBeNull();
    expect(page.cursor_prev).toBeNull();
    expect(page.has_more).toBe(true);
    expect(page.total).toBe(50);
  });

  it('second page uses cursor_next', () => {
    const page1 = paginate(items, 10);
    const page2 = paginate(items, 10, page1.cursor_next!);
    expect(page2.items[0].id).toBe(10);
    expect(page2.items.length).toBe(10);
    expect(page2.cursor_prev).not.toBeNull();
  });

  it('last page has no cursor_next', () => {
    const page = paginate(items, 10, Buffer.from('40').toString('base64url'));
    expect(page.items.length).toBe(10);
    expect(page.cursor_next).toBeNull();
    expect(page.has_more).toBe(false);
  });

  it('handles empty items', () => {
    const page = paginate([], 10);
    expect(page.items.length).toBe(0);
    expect(page.cursor_next).toBeNull();
    expect(page.has_more).toBe(false);
    expect(page.total).toBe(0);
  });

  it('handles invalid cursor gracefully', () => {
    const page = paginate(items, 10, 'invalid-cursor');
    expect(page.items.length).toBe(10);
    expect(page.items[0].id).toBe(0);
  });
});
