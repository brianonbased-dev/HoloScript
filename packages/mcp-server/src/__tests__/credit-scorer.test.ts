/**
 * MoltbookCreditScorer Tests
 *
 * Validates credit scoring from Moltbook engagement metrics:
 * karma, posts, comments, upvotes, followers, reply quality, LLM spend.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MoltbookCreditScorer,
  DEFAULT_CREDIT_WEIGHTS,
} from '../moltbook/credit-scorer';
import type { LocalStats, LiveStats, CreditBreakdown } from '../moltbook/credit-scorer';

// ── Mock MoltbookClient ──────────────────────────────────────────────────────

function createMockClient(homeKarma = 0, profileKarma = 0, followers = 0) {
  return {
    getHome: vi.fn().mockResolvedValue({
      your_account: { name: 'test-agent', karma: homeKarma, unread_notification_count: 0 },
      activity_on_your_posts: [],
      your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
      posts_from_accounts_you_follow: { posts: [], total_following: 0 },
      what_to_do_next: [],
    }),
    getProfile: vi.fn().mockResolvedValue({
      agent: { karma: profileKarma, followerCount: followers },
    }),
  } as unknown as import('../moltbook/client').MoltbookClient;
}

function zeroStats(): LocalStats {
  return {
    totalPosts: 0,
    totalComments: 0,
    totalUpvotesGiven: 0,
    challengeFailures: 0,
    llmSpentCents: 0,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MoltbookCreditScorer', () => {
  let scorer: MoltbookCreditScorer;

  beforeEach(() => {
    scorer = new MoltbookCreditScorer();
  });

  describe('computeBreakdown (no API)', () => {
    it('returns zero balance for zero stats', () => {
      const live: LiveStats = { karma: 0, followers: 0 };
      const result = scorer.computeBreakdown(live, zeroStats());

      expect(result.balanceCents).toBe(0);
      expect(result.earned.totalEarned).toBe(0);
      expect(result.spent.totalSpent).toBe(0);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityScore).toBeLessThanOrEqual(1);
    });

    it('earns credits from karma', () => {
      const live: LiveStats = { karma: 47, followers: 0 };
      const stats = zeroStats();
      stats.totalPosts = 10; // need interactions for quality score
      const result = scorer.computeBreakdown(live, stats);

      // 47 karma * 10¢ = 470¢ base from karma
      expect(result.earned.fromKarma).toBe(470);
      expect(result.earned.totalEarned).toBeGreaterThanOrEqual(470);
    });

    it('earns credits from posts', () => {
      const live: LiveStats = { karma: 0, followers: 0 };
      const stats = zeroStats();
      stats.totalPosts = 20;
      const result = scorer.computeBreakdown(live, stats);

      // 20 posts * 5¢ = 100¢
      expect(result.earned.fromPosts).toBe(100);
    });

    it('earns credits from comments', () => {
      const live: LiveStats = { karma: 0, followers: 0 };
      const stats = zeroStats();
      stats.totalComments = 50;
      const result = scorer.computeBreakdown(live, stats);

      // 50 comments * 2¢ = 100¢
      expect(result.earned.fromComments).toBe(100);
    });

    it('earns credits from upvotes given', () => {
      const live: LiveStats = { karma: 0, followers: 0 };
      const stats = zeroStats();
      stats.totalUpvotesGiven = 30;
      const result = scorer.computeBreakdown(live, stats);

      // 30 upvotes * 1¢ = 30¢
      expect(result.earned.fromUpvotesGiven).toBe(30);
    });

    it('earns credits from followers', () => {
      const live: LiveStats = { karma: 0, followers: 4 };
      const result = scorer.computeBreakdown(live, zeroStats());

      // 4 followers * 3¢ = 12¢
      expect(result.earned.fromFollowers).toBe(12);
    });

    it('deducts LLM spend', () => {
      const live: LiveStats = { karma: 100, followers: 0 };
      const stats = zeroStats();
      stats.totalPosts = 10;
      stats.llmSpentCents = 500;
      const result = scorer.computeBreakdown(live, stats);

      expect(result.spent.llmCosts).toBe(500);
      expect(result.balanceCents).toBeLessThan(result.earned.totalEarned);
    });

    it('penalizes challenge failures', () => {
      const live: LiveStats = { karma: 10, followers: 0 };
      const stats = zeroStats();
      stats.totalPosts = 5;
      stats.challengeFailures = 3;
      const result = scorer.computeBreakdown(live, stats);

      // 3 failures * 50¢ = 150¢ penalty
      expect(result.spent.challengePenalties).toBe(150);
    });

    it('balance = earned - spent', () => {
      const live: LiveStats = { karma: 50, followers: 5 };
      const stats: LocalStats = {
        totalPosts: 10,
        totalComments: 20,
        totalUpvotesGiven: 15,
        challengeFailures: 1,
        llmSpentCents: 100,
      };
      const result = scorer.computeBreakdown(live, stats);

      expect(result.balanceCents).toBe(result.earned.totalEarned - result.spent.totalSpent);
    });
  });

  describe('quality score', () => {
    it('high karma-per-interaction = high quality', () => {
      const live: LiveStats = { karma: 47, followers: 4 };
      const stats: LocalStats = {
        totalPosts: 16,
        totalComments: 50,
        totalUpvotesGiven: 30,
        challengeFailures: 0,
        llmSpentCents: 0,
      };
      const result = scorer.computeBreakdown(live, stats);

      // karma/interaction = 47/66 ≈ 0.71, normalized = 0.71/2 ≈ 0.36
      // challenge success = 1.0
      // engagement = min(1, 30/(66*2)) = min(1, 0.23) ≈ 0.23
      // score = 0.36*0.5 + 1.0*0.3 + 0.23*0.2 ≈ 0.526
      expect(result.qualityScore).toBeGreaterThan(0.4);
      expect(result.qualityScore).toBeLessThan(0.7);
      expect(result.qualityBreakdown.karmaPerInteraction).toBeCloseTo(0.71, 1);
      expect(result.qualityBreakdown.challengeSuccessRate).toBe(1);
    });

    it('challenge failures reduce quality', () => {
      const live: LiveStats = { karma: 10, followers: 0 };
      const good: LocalStats = {
        totalPosts: 10,
        totalComments: 10,
        totalUpvotesGiven: 5,
        challengeFailures: 0,
        llmSpentCents: 0,
      };
      const bad: LocalStats = {
        ...good,
        challengeFailures: 10,
      };

      const goodResult = scorer.computeBreakdown(live, good);
      const badResult = scorer.computeBreakdown(live, bad);

      expect(goodResult.qualityScore).toBeGreaterThan(badResult.qualityScore);
      expect(badResult.qualityBreakdown.challengeSuccessRate).toBe(0.5);
    });

    it('engagement ratio rewards generous upvoters', () => {
      const live: LiveStats = { karma: 10, followers: 0 };
      const generous: LocalStats = {
        totalPosts: 5,
        totalComments: 5,
        totalUpvotesGiven: 20,
        challengeFailures: 0,
        llmSpentCents: 0,
      };
      const stingy: LocalStats = {
        ...generous,
        totalUpvotesGiven: 0,
      };

      const generousResult = scorer.computeBreakdown(live, generous);
      const stingyResult = scorer.computeBreakdown(live, stingy);

      expect(generousResult.qualityBreakdown.engagementRatio).toBeGreaterThan(
        stingyResult.qualityBreakdown.engagementRatio,
      );
      expect(generousResult.qualityScore).toBeGreaterThan(stingyResult.qualityScore);
    });

    it('quality score is bounded 0-1', () => {
      // Extreme high stats
      const high = scorer.computeBreakdown(
        { karma: 10000, followers: 500 },
        {
          totalPosts: 100,
          totalComments: 200,
          totalUpvotesGiven: 1000,
          challengeFailures: 0,
          llmSpentCents: 0,
        },
      );
      expect(high.qualityScore).toBeLessThanOrEqual(1);
      expect(high.qualityScore).toBeGreaterThan(0.8);

      // Zero stats
      const zero = scorer.computeBreakdown(
        { karma: 0, followers: 0 },
        zeroStats(),
      );
      expect(zero.qualityScore).toBeGreaterThanOrEqual(0);
    });

    it('quality bonus scales with quality score', () => {
      const live: LiveStats = { karma: 100, followers: 10 };
      const stats: LocalStats = {
        totalPosts: 10,
        totalComments: 40,
        totalUpvotesGiven: 30,
        challengeFailures: 0,
        llmSpentCents: 0,
      };

      const result = scorer.computeBreakdown(live, stats);
      const baseEarned =
        result.earned.fromKarma +
        result.earned.fromPosts +
        result.earned.fromComments +
        result.earned.fromUpvotesGiven +
        result.earned.fromFollowers;

      // qualityBonus = floor(baseEarned * qualityScore * 0.25)
      const expectedBonus = Math.floor(baseEarned * result.qualityScore * 0.25);
      expect(result.earned.qualityBonus).toBe(expectedBonus);
      expect(result.earned.totalEarned).toBe(baseEarned + expectedBonus);
    });
  });

  describe('calculateCredits (with API)', () => {
    it('fetches karma and followers from Moltbook API', async () => {
      const client = createMockClient(47, 47, 4);
      const stats: LocalStats = {
        totalPosts: 16,
        totalComments: 50,
        totalUpvotesGiven: 30,
        challengeFailures: 0,
        llmSpentCents: 0,
      };

      const result = await scorer.calculateCredits(client, stats);

      expect(client.getHome).toHaveBeenCalled();
      expect(client.getProfile).toHaveBeenCalled();
      expect(result.earned.fromKarma).toBe(470); // 47 * 10
      expect(result.earned.fromFollowers).toBe(12); // 4 * 3
      expect(result.liveStatsAvailable).toBe(true);
    });

    it('uses higher karma from profile vs home', async () => {
      const client = createMockClient(30, 50, 2);
      const result = await scorer.calculateCredits(client, zeroStats());

      // Profile karma (50) > home karma (30)
      expect(result.earned.fromKarma).toBe(500);
    });

    it('falls back gracefully when API is unreachable', async () => {
      const client = {
        getHome: vi.fn().mockRejectedValue(new Error('Network error')),
        getProfile: vi.fn().mockRejectedValue(new Error('Network error')),
      } as unknown as import('../moltbook/client').MoltbookClient;

      const stats: LocalStats = {
        totalPosts: 10,
        totalComments: 20,
        totalUpvotesGiven: 5,
        challengeFailures: 0,
        llmSpentCents: 0,
      };

      const result = await scorer.calculateCredits(client, stats);

      // Still works with local stats, just no karma/follower credits
      expect(result.earned.fromKarma).toBe(0);
      expect(result.earned.fromFollowers).toBe(0);
      expect(result.earned.fromPosts).toBe(50);
      expect(result.earned.fromComments).toBe(40);
      expect(result.liveStatsAvailable).toBe(false);
    });

    it('handles partial API failure (home works, profile fails)', async () => {
      const client = {
        getHome: vi.fn().mockResolvedValue({
          your_account: { name: 'test', karma: 25, unread_notification_count: 0 },
          activity_on_your_posts: [],
          your_direct_messages: { pending_request_count: '0', unread_message_count: '0' },
          posts_from_accounts_you_follow: { posts: [], total_following: 0 },
          what_to_do_next: [],
        }),
        getProfile: vi.fn().mockRejectedValue(new Error('Timeout')),
      } as unknown as import('../moltbook/client').MoltbookClient;

      const result = await scorer.calculateCredits(client, zeroStats());

      // Karma from home, but no followers
      expect(result.earned.fromKarma).toBe(250); // 25 * 10
      expect(result.earned.fromFollowers).toBe(0);
      expect(result.liveStatsAvailable).toBe(true);
    });
  });

  describe('custom weights', () => {
    it('respects custom weight overrides', () => {
      const custom = new MoltbookCreditScorer({
        karmaMultiplierCents: 20,
        postCreditCents: 10,
      });
      const live: LiveStats = { karma: 10, followers: 0 };
      const stats = zeroStats();
      stats.totalPosts = 5;

      const result = custom.computeBreakdown(live, stats);

      expect(result.earned.fromKarma).toBe(200); // 10 * 20¢
      expect(result.earned.fromPosts).toBe(50); // 5 * 10¢
    });

    it('preserves default weights for non-overridden values', () => {
      const custom = new MoltbookCreditScorer({ karmaMultiplierCents: 100 });
      const live: LiveStats = { karma: 0, followers: 3 };
      const result = custom.computeBreakdown(live, zeroStats());

      // Followers should still use default 3¢
      expect(result.earned.fromFollowers).toBe(9);
    });
  });

  describe('realistic scenario', () => {
    it('scores HoloScript admin agent accurately', async () => {
      // Simulate current HoloScript Moltbook stats
      const client = createMockClient(47, 47, 4);
      const stats: LocalStats = {
        totalPosts: 16,
        totalComments: 50,
        totalUpvotesGiven: 30,
        challengeFailures: 0,
        llmSpentCents: 200,
      };

      const result = await scorer.calculateCredits(client, stats);

      // Earned breakdown:
      // karma: 47 * 10 = 470
      // posts: 16 * 5 = 80
      // comments: 50 * 2 = 100
      // upvotes: 30 * 1 = 30
      // followers: 4 * 3 = 12
      // base = 692
      const expectedBase = 470 + 80 + 100 + 30 + 12;
      expect(expectedBase).toBe(692);

      // quality bonus = floor(692 * qualityScore * 0.25)
      const qualityBonus = Math.floor(expectedBase * result.qualityScore * 0.25);
      expect(result.earned.qualityBonus).toBe(qualityBonus);
      expect(result.earned.totalEarned).toBe(expectedBase + qualityBonus);

      // Spent: 200 LLM + 0 penalties = 200
      expect(result.spent.totalSpent).toBe(200);

      // Balance should be positive and meaningful
      expect(result.balanceCents).toBeGreaterThan(400);
      expect(result.creditBreakdown).toBeUndefined; // it IS the breakdown
      expect(result.qualityScore).toBeGreaterThan(0);
    });

    it('new agent with zero karma starts at zero', () => {
      const result = scorer.computeBreakdown({ karma: 0, followers: 0 }, zeroStats());
      expect(result.balanceCents).toBe(0);
      expect(result.qualityScore).toBeGreaterThanOrEqual(0);
    });

    it('heavily penalized agent can go negative', () => {
      const live: LiveStats = { karma: 5, followers: 0 };
      const stats: LocalStats = {
        totalPosts: 2,
        totalComments: 3,
        totalUpvotesGiven: 0,
        challengeFailures: 10,
        llmSpentCents: 500,
      };

      const result = scorer.computeBreakdown(live, stats);

      // Earned: 5*10 + 2*5 + 3*2 + 0 + 0 = 66 (+ small quality bonus)
      // Spent: 500 + 10*50 = 1000
      expect(result.balanceCents).toBeLessThan(0);
    });
  });

  describe('default weights', () => {
    it('has expected default values', () => {
      expect(DEFAULT_CREDIT_WEIGHTS.karmaMultiplierCents).toBe(10);
      expect(DEFAULT_CREDIT_WEIGHTS.postCreditCents).toBe(5);
      expect(DEFAULT_CREDIT_WEIGHTS.commentCreditCents).toBe(2);
      expect(DEFAULT_CREDIT_WEIGHTS.upvoteGivenCreditCents).toBe(1);
      expect(DEFAULT_CREDIT_WEIGHTS.followerCreditCents).toBe(3);
      expect(DEFAULT_CREDIT_WEIGHTS.challengeFailurePenaltyCents).toBe(50);
      expect(DEFAULT_CREDIT_WEIGHTS.qualityBonusRate).toBe(0.25);
    });
  });
});
