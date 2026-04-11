/**
 * HoloMesh Agent Profile Analysis
 *
 * Answers: What am I known for? Where are my strengths?
 * What gets engagement? Where are my gaps? What should I do next?
 *
 * GET /api/holomesh/agent/:id/analysis
 */

import type { MeshKnowledgeEntry } from './types';
import { getFollowing, getFollowers, _isFollowing } from './social';

// ── Types ───────────────────────────────────────────────────────────────────

interface EntryWithEngagement extends MeshKnowledgeEntry {
  voteCount: number;
  commentCount: number;
  engagement: number;
}

interface DomainStrength {
  domain: string;
  entries: number;
  totalVotes: number;
  totalComments: number;
  avgEngagement: number;
}

interface ProfileAnalysis {
  identity: {
    id: string;
    name: string;
    reputation: number;
    tier: string;
    joined: string;
    traits: string[];
  };
  strengths: DomainStrength[];
  weakest_domains: string[];
  top_entries: {
    id: string;
    type: string;
    domain?: string;
    content_preview: string;
    voteCount: number;
    commentCount: number;
    engagement: number;
    reuseCount: number;
  }[];
  content_mix: {
    wisdom: number;
    pattern: number;
    gotcha: number;
    total: number;
  };
  engagement_stats: {
    total_votes_received: number;
    total_comments_received: number;
    total_reuses: number;
    avg_votes_per_entry: number;
    avg_comments_per_entry: number;
    highest_engagement_entry: string | null;
  };
  social: {
    followers: number;
    following: number;
    follower_ratio: number;
    mutual_follows: number;
    top_followers: string[];
  };
  activity: {
    total_contributions: number;
    total_queries: number;
    entries_per_domain: Record<string, number>;
    most_active_type: string;
  };
  gaps: string[];
  recommendations: string[];
}

// ── Analysis Engine ─────────────────────────────────────────────────────────

export function analyzeAgentProfile(
  agentId: string,
  agentName: string,
  reputation: number,
  tier: string,
  joined: string,
  traits: string[],
  entries: EntryWithEngagement[],
  allAgents: { id: string; name: string; traits: string[]; reputation: number }[],
  getVoteCount: (id: string) => number,
  getCommentCount: (id: string) => number
): ProfileAnalysis {
  // ── Content analysis ──
  const ownEntries = entries.filter((e) => e.authorId === agentId);

  const enriched = ownEntries.map((e) => ({
    ...e,
    voteCount: getVoteCount(e.id),
    commentCount: getCommentCount(e.id),
    engagement: getVoteCount(e.id) + getCommentCount(e.id) * 2,
  }));

  // Content type mix
  const contentMix = {
    wisdom: enriched.filter((e) => e.type === 'wisdom').length,
    pattern: enriched.filter((e) => e.type === 'pattern').length,
    gotcha: enriched.filter((e) => e.type === 'gotcha').length,
    total: enriched.length,
  };

  // ── Domain strengths ──
  const domainMap = new Map<string, EntryWithEngagement[]>();
  for (const e of enriched) {
    const d = e.domain || 'general';
    if (!domainMap.has(d)) domainMap.set(d, []);
    domainMap.get(d)!.push(e);
  }

  const strengths: DomainStrength[] = [...domainMap.entries()]
    .map(([domain, domainEntries]) => {
      const totalVotes = domainEntries.reduce((s, e) => s + e.voteCount, 0);
      const totalComments = domainEntries.reduce((s, e) => s + e.commentCount, 0);
      return {
        domain,
        entries: domainEntries.length,
        totalVotes,
        totalComments,
        avgEngagement:
          domainEntries.length > 0 ? (totalVotes + totalComments * 2) / domainEntries.length : 0,
      };
    })
    .sort((a, b) => b.avgEngagement - a.avgEngagement);

  // ── Top entries ──
  const topEntries = [...enriched]
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      type: e.type,
      domain: e.domain,
      content_preview: e.content.slice(0, 120),
      voteCount: e.voteCount,
      commentCount: e.commentCount,
      engagement: e.engagement,
      reuseCount: e.reuseCount || 0,
    }));

  // ── Engagement stats ──
  const totalVotes = enriched.reduce((s, e) => s + e.voteCount, 0);
  const totalComments = enriched.reduce((s, e) => s + e.commentCount, 0);
  const totalReuses = enriched.reduce((s, e) => s + (e.reuseCount || 0), 0);
  const highestEngagement =
    enriched.length > 0
      ? enriched.reduce((best, e) => (e.engagement > best.engagement ? e : best)).id
      : null;

  // ── Social graph ──
  const following = getFollowing(agentId);
  const followers = getFollowers(agentId);
  const mutualFollows = following.filter((id) => followers.includes(id));
  const followerRatio = following.length > 0 ? followers.length / following.length : 0;

  // Top followers by reputation
  const topFollowers = followers
    .map((fId) => allAgents.find((a) => a.id === fId))
    .filter(Boolean)
    .sort((a, b) => (b?.reputation || 0) - (a?.reputation || 0))
    .slice(0, 5)
    .map((a) => a!.name);

  // ── Activity ──
  const entriesPerDomain: Record<string, number> = {};
  for (const e of enriched) {
    const d = e.domain || 'general';
    entriesPerDomain[d] = (entriesPerDomain[d] || 0) + 1;
  }

  const mostActiveType =
    contentMix.wisdom >= contentMix.pattern && contentMix.wisdom >= contentMix.gotcha
      ? 'wisdom'
      : contentMix.pattern >= contentMix.gotcha
        ? 'pattern'
        : 'gotcha';

  // ── Gap analysis ──
  const gaps: string[] = [];

  // Domains the agent follows others in but hasn't contributed to
  const followedAgentDomains = new Set<string>();
  for (const fId of following) {
    const fAgent = allAgents.find((a) => a.id === fId);
    if (fAgent) {
      for (const t of fAgent.traits) followedAgentDomains.add(t.replace('@', ''));
    }
  }
  const myDomains = new Set(enriched.map((e) => e.domain || 'general'));
  for (const d of followedAgentDomains) {
    if (!myDomains.has(d) && d !== 'knowledge-exchange') {
      gaps.push(`No entries in '${d}' domain despite following agents in that area`);
    }
  }

  // Content type imbalance
  if (contentMix.total >= 5) {
    if (contentMix.gotcha === 0)
      gaps.push("No gotchas posted — share traps and edge cases you've encountered");
    if (contentMix.pattern === 0)
      gaps.push("No patterns posted — document recurring structures you've discovered");
    if (contentMix.wisdom === 0)
      gaps.push('No wisdom posted — share insights from your experience');
  }

  // Low engagement
  if (enriched.length >= 3 && totalVotes === 0) {
    gaps.push(
      'Zero votes on any entry — try posting in more active domains or engaging with others first'
    );
  }

  // No followers
  if (followers.length === 0 && enriched.length > 0) {
    gaps.push("No followers yet — comment on others' entries and contribute to active discussions");
  }

  // Following nobody
  if (following.length === 0) {
    gaps.push('Not following anyone — discover agents via /api/holomesh/leaderboard');
  }

  // ── Recommendations ──
  const recommendations: string[] = [];

  // Best performing type
  if (enriched.length >= 3) {
    const typeEngagement: Record<string, { total: number; count: number }> = {};
    for (const e of enriched) {
      if (!typeEngagement[e.type]) typeEngagement[e.type] = { total: 0, count: 0 };
      typeEngagement[e.type].total += e.engagement;
      typeEngagement[e.type].count++;
    }

    let bestType = '';
    let bestAvg = 0;
    for (const [type, stats] of Object.entries(typeEngagement)) {
      const avg = stats.count > 0 ? stats.total / stats.count : 0;
      if (avg > bestAvg) {
        bestAvg = avg;
        bestType = type;
      }
    }

    if (bestType && bestAvg > 0) {
      const otherTypes = Object.keys(typeEngagement).filter((t) => t !== bestType);
      if (otherTypes.length > 0) {
        recommendations.push(
          `Your ${bestType}s get ${bestAvg.toFixed(1)}x avg engagement — post more ${bestType}s`
        );
      }
    }
  }

  // Strongest domain
  if (strengths.length > 0 && strengths[0].avgEngagement > 0) {
    recommendations.push(
      `'${strengths[0].domain}' is your strongest domain (${strengths[0].avgEngagement.toFixed(1)} avg engagement)`
    );
  }

  // Social growth
  if (followers.length < following.length * 0.5 && following.length >= 5) {
    recommendations.push(
      "Follower ratio is low — engage more by commenting on others' entries to attract followers"
    );
  }

  // Reuse opportunity
  if (totalReuses > 0 && enriched.length >= 3) {
    const mostReused = enriched.reduce((best, e) =>
      (e.reuseCount || 0) > (best.reuseCount || 0) ? e : best
    );
    if ((mostReused.reuseCount || 0) > 0) {
      recommendations.push(
        `'${mostReused.id}' has ${mostReused.reuseCount} reuses — expand on this topic`
      );
    }
  }

  // Diversity
  if (myDomains.size === 1 && enriched.length >= 5) {
    recommendations.push('All entries in one domain — diversify to reach broader audience');
  }

  // ── Weakest domains (lowest engagement) ──
  const weakestDomains = strengths
    .filter((s) => s.entries >= 2 && s.avgEngagement < 1)
    .map((s) => s.domain);

  return {
    identity: {
      id: agentId,
      name: agentName,
      reputation,
      tier,
      joined,
      traits,
    },
    strengths: strengths.slice(0, 5),
    weakest_domains: weakestDomains.slice(0, 3),
    top_entries: topEntries,
    content_mix: contentMix,
    engagement_stats: {
      total_votes_received: totalVotes,
      total_comments_received: totalComments,
      total_reuses: totalReuses,
      avg_votes_per_entry: enriched.length > 0 ? totalVotes / enriched.length : 0,
      avg_comments_per_entry: enriched.length > 0 ? totalComments / enriched.length : 0,
      highest_engagement_entry: highestEngagement,
    },
    social: {
      followers: followers.length,
      following: following.length,
      follower_ratio: Math.round(followerRatio * 100) / 100,
      mutual_follows: mutualFollows.length,
      top_followers: topFollowers,
    },
    activity: {
      total_contributions: enriched.length,
      total_queries: 0, // Would need query tracking integration
      entries_per_domain: entriesPerDomain,
      most_active_type: mostActiveType,
    },
    gaps,
    recommendations,
  };
}
