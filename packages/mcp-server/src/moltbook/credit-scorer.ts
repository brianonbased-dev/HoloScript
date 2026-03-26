/**
 * Moltbook Credit Scorer
 *
 * Derives credit balance from Moltbook engagement metrics:
 *
 * EARNING:
 *   karma * 10¢           — platform reputation (primary earner)
 *   posts * 5¢            — content production
 *   comments * 2¢         — engagement participation
 *   upvotes given * 1¢    — outbound engagement (generosity)
 *   followers * 3¢        — social proof
 *   quality bonus          — up to 25% of earned, scaled by qualityScore
 *
 * SPENDING:
 *   llmSpentCents          — direct LLM inference cost
 *   challengeFailures * 50¢— verification failure penalty
 *
 * QUALITY SCORE (0.0–1.0):
 *   50% karma-per-interaction  — reply quality proxy
 *   30% challenge success rate — verification reliability
 *   20% engagement ratio       — upvotes given vs content created
 */

import type { MoltbookClient } from './client';

// ── Credit Weights ───────────────────────────────────────────────────────────

export interface CreditWeights {
  karmaMultiplierCents: number;
  postCreditCents: number;
  commentCreditCents: number;
  upvoteGivenCreditCents: number;
  followerCreditCents: number;
  challengeFailurePenaltyCents: number;
  /** Quality bonus as fraction of totalEarned (0.25 = up to 25% bonus) */
  qualityBonusRate: number;
}

export const DEFAULT_CREDIT_WEIGHTS: CreditWeights = {
  karmaMultiplierCents: 10,
  postCreditCents: 5,
  commentCreditCents: 2,
  upvoteGivenCreditCents: 1,
  followerCreditCents: 3,
  challengeFailurePenaltyCents: 50,
  qualityBonusRate: 0.25,
};

// ── Data Types ───────────────────────────────────────────────────────────────

/** Stats available locally without API calls */
export interface LocalStats {
  totalPosts: number;
  totalComments: number;
  totalUpvotesGiven: number;
  challengeFailures: number;
  llmSpentCents: number;
}

/** Stats fetched from the Moltbook API */
export interface LiveStats {
  karma: number;
  followers: number;
}

export interface CreditBreakdown {
  earned: {
    fromKarma: number;
    fromPosts: number;
    fromComments: number;
    fromUpvotesGiven: number;
    fromFollowers: number;
    qualityBonus: number;
    totalEarned: number;
  };
  spent: {
    llmCosts: number;
    challengePenalties: number;
    totalSpent: number;
  };
  balanceCents: number;
  qualityScore: number;
  qualityBreakdown: {
    karmaPerInteraction: number;
    challengeSuccessRate: number;
    engagementRatio: number;
  };
  /** Whether live API stats were available (false = local-only fallback) */
  liveStatsAvailable: boolean;
}

// ── Scorer ────────────────────────────────────────────────────────────────────

export class MoltbookCreditScorer {
  private weights: CreditWeights;

  constructor(weights?: Partial<CreditWeights>) {
    this.weights = { ...DEFAULT_CREDIT_WEIGHTS, ...weights };
  }

  /**
   * Calculate credits by fetching live stats from the API + combining local stats.
   * Falls back to local-only scoring if the API is unreachable.
   */
  async calculateCredits(
    client: MoltbookClient,
    localStats: LocalStats,
  ): Promise<CreditBreakdown> {
    const live = await this.fetchLiveStats(client);
    return this.computeBreakdown(live, localStats);
  }

  /**
   * Calculate credits from pre-fetched data (no API calls).
   */
  computeBreakdown(
    live: LiveStats,
    stats: LocalStats,
  ): CreditBreakdown {
    const w = this.weights;
    const liveStatsAvailable = live.karma > 0 || live.followers > 0;

    // ── Earned ──
    const fromKarma = live.karma * w.karmaMultiplierCents;
    const fromPosts = stats.totalPosts * w.postCreditCents;
    const fromComments = stats.totalComments * w.commentCreditCents;
    const fromUpvotesGiven = stats.totalUpvotesGiven * w.upvoteGivenCreditCents;
    const fromFollowers = live.followers * w.followerCreditCents;
    const baseEarned = fromKarma + fromPosts + fromComments + fromUpvotesGiven + fromFollowers;

    // ── Quality Score ──
    const totalInteractions = stats.totalPosts + stats.totalComments;

    const karmaPerInteraction = totalInteractions > 0
      ? live.karma / totalInteractions
      : 0;

    const challengeSuccessRate = totalInteractions > 0
      ? Math.max(0, 1 - (stats.challengeFailures / totalInteractions))
      : 1;

    const engagementRatio = totalInteractions > 0
      ? Math.min(1, stats.totalUpvotesGiven / (totalInteractions * 2))
      : 0;

    // Normalize karma-per-interaction: 2+ karma/interaction = excellent (1.0)
    const normalizedKPI = Math.min(1, karmaPerInteraction / 2);

    const qualityScore = round3(
      normalizedKPI * 0.5 + challengeSuccessRate * 0.3 + engagementRatio * 0.2,
    );

    // Quality bonus: up to qualityBonusRate * baseEarned
    const qualityBonus = Math.floor(baseEarned * qualityScore * w.qualityBonusRate);
    const totalEarned = baseEarned + qualityBonus;

    // ── Spent ──
    const llmCosts = stats.llmSpentCents;
    const challengePenalties = stats.challengeFailures * w.challengeFailurePenaltyCents;
    const totalSpent = llmCosts + challengePenalties;

    return {
      earned: {
        fromKarma,
        fromPosts,
        fromComments,
        fromUpvotesGiven,
        fromFollowers,
        qualityBonus,
        totalEarned,
      },
      spent: {
        llmCosts,
        challengePenalties,
        totalSpent,
      },
      balanceCents: totalEarned - totalSpent,
      qualityScore,
      qualityBreakdown: {
        karmaPerInteraction: round2(karmaPerInteraction),
        challengeSuccessRate: round3(challengeSuccessRate),
        engagementRatio: round3(engagementRatio),
      },
      liveStatsAvailable,
    };
  }

  /** Fetch karma and follower count from the Moltbook API. */
  private async fetchLiveStats(client: MoltbookClient): Promise<LiveStats> {
    let karma = 0;
    let followers = 0;

    // Try home endpoint first (cheaper — single field)
    try {
      const home = await client.getHome();
      karma = home.your_account?.karma ?? 0;
    } catch {
      // Home unavailable
    }

    // Profile gives followers + possibly more accurate karma
    try {
      const profile = await client.getProfile();
      const agent = profile.agent as Record<string, unknown>;
      const profileKarma = (agent.karma as number) ?? 0;
      karma = Math.max(karma, profileKarma);
      followers = (agent.followerCount as number)
        ?? (agent.follower_count as number)
        ?? 0;
    } catch {
      // Profile unavailable
    }

    return { karma, followers };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
