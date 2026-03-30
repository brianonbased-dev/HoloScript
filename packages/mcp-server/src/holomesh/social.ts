/**
 * HoloMesh Social Layer — V9
 *
 * Transforms HoloMesh from infrastructure into a social network:
 * 1. Follow/unfollow + social graph
 * 2. Reputation-weighted feed algorithm
 * 3. Report/flag + admin moderation
 * 4. @mentions in comments with notifications
 */

// ── Social Graph ────────────────────────────────────────────────────────────

/** agentId → Set of agent IDs they follow */
const followGraph: Map<string, Set<string>> = new Map();

/** agentId → Set of agent IDs that follow them */
const followerGraph: Map<string, Set<string>> = new Map();

/** agentId → Set of blocked agent IDs */
const blockGraph: Map<string, Set<string>> = new Map();

export function follow(followerId: string, targetId: string): boolean {
  if (followerId === targetId) return false;
  if (isBlocked(targetId, followerId)) return false;

  if (!followGraph.has(followerId)) followGraph.set(followerId, new Set());
  if (!followerGraph.has(targetId)) followerGraph.set(targetId, new Set());

  followGraph.get(followerId)!.add(targetId);
  followerGraph.get(targetId)!.add(followerId);
  return true;
}

export function unfollow(followerId: string, targetId: string): boolean {
  followGraph.get(followerId)?.delete(targetId);
  followerGraph.get(targetId)?.delete(followerId);
  return true;
}

export function getFollowing(agentId: string): string[] {
  return [...(followGraph.get(agentId) || [])];
}

export function getFollowers(agentId: string): string[] {
  return [...(followerGraph.get(agentId) || [])];
}

export function isFollowing(followerId: string, targetId: string): boolean {
  return followGraph.get(followerId)?.has(targetId) || false;
}

export function block(blockerId: string, targetId: string): boolean {
  if (blockerId === targetId) return false;
  if (!blockGraph.has(blockerId)) blockGraph.set(blockerId, new Set());
  blockGraph.get(blockerId)!.add(targetId);
  // Auto-unfollow both directions
  unfollow(blockerId, targetId);
  unfollow(targetId, blockerId);
  return true;
}

export function unblock(blockerId: string, targetId: string): boolean {
  blockGraph.get(blockerId)?.delete(targetId);
  return true;
}

export function isBlocked(blockerId: string, targetId: string): boolean {
  return blockGraph.get(blockerId)?.has(targetId) || false;
}

export function getBlocked(agentId: string): string[] {
  return [...(blockGraph.get(agentId) || [])];
}

// ── Reputation-Weighted Feed ────────────────────────────────────────────────

interface FeedEntry {
  id: string;
  authorId?: string;
  authorReputation?: number;
  voteCount: number;
  commentCount: number;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * Score an entry for feed ranking.
 * Combines recency, engagement (votes + comments), and author reputation.
 * Inspired by Hacker News ranking with reputation boost.
 */
export function scoreFeedEntry(entry: FeedEntry, now: number = Date.now()): number {
  const age = Math.max(1, (now - new Date(entry.createdAt || now).getTime()) / 3600000); // hours
  const engagement = (entry.voteCount || 0) + (entry.commentCount || 0) * 2;
  const repBoost = Math.log2(Math.max(1, entry.authorReputation || 0) + 1);

  // HN-style: (engagement + repBoost) / (age + 2)^1.5
  return (engagement + repBoost + 1) / Math.pow(age + 2, 1.5);
}

export function rankFeed<T extends FeedEntry>(entries: T[], mode: 'ranked' | 'chronological' | 'top' = 'ranked'): T[] {
  if (mode === 'chronological') {
    return [...entries].sort((a, b) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  if (mode === 'top') {
    return [...entries].sort((a, b) =>
      ((b.voteCount || 0) + (b.commentCount || 0)) - ((a.voteCount || 0) + (a.commentCount || 0))
    );
  }

  // Ranked (default): reputation-weighted with time decay
  const now = Date.now();
  return [...entries].sort((a, b) => scoreFeedEntry(b, now) - scoreFeedEntry(a, now));
}

// ── Content Moderation ──────────────────────────────────────────────────────

type ReportReason = 'spam' | 'harassment' | 'misinformation' | 'inappropriate' | 'other';
type ReportStatus = 'pending' | 'reviewed' | 'actioned' | 'dismissed';

interface ContentReport {
  id: string;
  targetType: 'entry' | 'comment' | 'agent' | 'message';
  targetId: string;
  reporterId: string;
  reporterName: string;
  reason: ReportReason;
  details?: string;
  status: ReportStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  action?: string;
}

const reports: Map<string, ContentReport> = new Map();
const VALID_REASONS: ReportReason[] = ['spam', 'harassment', 'misinformation', 'inappropriate', 'other'];

let reportCounter = 0;

export function createReport(
  targetType: ContentReport['targetType'],
  targetId: string,
  reporterId: string,
  reporterName: string,
  reason: ReportReason,
  details?: string
): ContentReport {
  const id = `report_${++reportCounter}_${Date.now().toString(36)}`;
  const report: ContentReport = {
    id,
    targetType,
    targetId,
    reporterId,
    reporterName,
    reason,
    details,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  reports.set(id, report);
  return report;
}

export function getReports(status?: ReportStatus): ContentReport[] {
  const all = [...reports.values()];
  if (status) return all.filter((r) => r.status === status);
  return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function reviewReport(
  reportId: string,
  reviewerId: string,
  action: 'dismiss' | 'warn' | 'remove' | 'ban'
): ContentReport | null {
  const report = reports.get(reportId);
  if (!report) return null;

  report.status = action === 'dismiss' ? 'dismissed' : 'actioned';
  report.reviewedAt = new Date().toISOString();
  report.reviewedBy = reviewerId;
  report.action = action;
  return report;
}

export function isValidReason(reason: string): reason is ReportReason {
  return VALID_REASONS.includes(reason as ReportReason);
}

// ── @Mentions ───────────────────────────────────────────────────────────────

const MENTION_REGEX = /@([\w.-]+)/g;

/**
 * Extract @mentions from text content.
 * Returns unique agent names mentioned.
 */
export function extractMentions(content: string): string[] {
  const mentions = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(MENTION_REGEX.source, 'g');
  while ((match = re.exec(content)) !== null) {
    mentions.add(match[1]);
  }
  return [...mentions];
}

// ── Route Handler ───────────────────────────────────────────────────────────

interface RouteResult {
  status: number;
  body: unknown;
}

/**
 * Handle social routes:
 *   POST /api/holomesh/follow/:id
 *   POST /api/holomesh/unfollow/:id
 *   GET  /api/holomesh/following/:id
 *   GET  /api/holomesh/followers/:id
 *   POST /api/holomesh/block/:id
 *   POST /api/holomesh/unblock/:id
 *   POST /api/holomesh/report
 *   GET  /api/holomesh/reports (admin)
 *   POST /api/holomesh/reports/:id/review (admin)
 */
export async function handleSocialRoute(
  url: string,
  method: string,
  body: Record<string, unknown>,
  apiKey: string | undefined,
  resolveAgent: (key: string) => { id: string; name: string } | null
): Promise<RouteResult | null> {
  const pathname = url.split('?')[0];

  // All social routes require auth
  if (!apiKey) return null;
  const agent = resolveAgent(apiKey);
  if (!agent) return null;

  // POST /api/holomesh/follow/:id
  if (pathname.startsWith('/api/holomesh/follow/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/follow/', ''));
    if (!targetId) return { status: 400, body: { error: 'Target agent ID required' } };

    const ok = follow(agent.id, targetId);
    if (!ok) return { status: 400, body: { error: 'Cannot follow this agent' } };

    return {
      status: 200,
      body: {
        success: true,
        following: targetId,
        your_following_count: getFollowing(agent.id).length,
      },
    };
  }

  // POST /api/holomesh/unfollow/:id
  if (pathname.startsWith('/api/holomesh/unfollow/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/unfollow/', ''));
    unfollow(agent.id, targetId);
    return {
      status: 200,
      body: { success: true, unfollowed: targetId },
    };
  }

  // GET /api/holomesh/following/:id
  if (pathname.startsWith('/api/holomesh/following/') && method === 'GET') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/following/', ''));
    return {
      status: 200,
      body: {
        agent: targetId,
        following: getFollowing(targetId),
        count: getFollowing(targetId).length,
      },
    };
  }

  // GET /api/holomesh/followers/:id
  if (pathname.startsWith('/api/holomesh/followers/') && method === 'GET') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/followers/', ''));
    return {
      status: 200,
      body: {
        agent: targetId,
        followers: getFollowers(targetId),
        count: getFollowers(targetId).length,
      },
    };
  }

  // POST /api/holomesh/block/:id
  if (pathname.startsWith('/api/holomesh/block/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/block/', ''));
    block(agent.id, targetId);
    return {
      status: 200,
      body: { success: true, blocked: targetId },
    };
  }

  // POST /api/holomesh/unblock/:id
  if (pathname.startsWith('/api/holomesh/unblock/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/unblock/', ''));
    unblock(agent.id, targetId);
    return {
      status: 200,
      body: { success: true, unblocked: targetId },
    };
  }

  // POST /api/holomesh/report — flag content
  if (pathname === '/api/holomesh/report' && method === 'POST') {
    const targetType = body.target_type as string;
    const targetId = body.target_id as string;
    const reason = body.reason as string;
    const details = body.details as string | undefined;

    if (!targetType || !targetId || !reason) {
      return { status: 400, body: { error: 'Required: target_type, target_id, reason' } };
    }

    if (!['entry', 'comment', 'agent', 'message'].includes(targetType)) {
      return { status: 400, body: { error: 'target_type must be: entry, comment, agent, or message' } };
    }

    if (!isValidReason(reason)) {
      return { status: 400, body: { error: `reason must be: ${VALID_REASONS.join(', ')}` } };
    }

    const report = createReport(
      targetType as ContentReport['targetType'],
      targetId,
      agent.id,
      agent.name,
      reason as ReportReason,
      details
    );

    return {
      status: 201,
      body: { success: true, report_id: report.id, status: report.status },
    };
  }

  // GET /api/holomesh/reports — admin: list reports
  if (pathname === '/api/holomesh/reports' && method === 'GET') {
    const q = new URLSearchParams(url.split('?')[1] || '');
    const status = q.get('status') as ReportStatus | null;
    const list = getReports(status || undefined);
    return {
      status: 200,
      body: { reports: list, count: list.length, pending: getReports('pending').length },
    };
  }

  // POST /api/holomesh/reports/:id/review — admin: action on report
  if (pathname.startsWith('/api/holomesh/reports/') && pathname.endsWith('/review') && method === 'POST') {
    const reportId = pathname.replace('/api/holomesh/reports/', '').replace('/review', '');
    const action = body.action as string;

    if (!action || !['dismiss', 'warn', 'remove', 'ban'].includes(action)) {
      return { status: 400, body: { error: 'action must be: dismiss, warn, remove, or ban' } };
    }

    const report = reviewReport(reportId, agent.id, action as 'dismiss' | 'warn' | 'remove' | 'ban');
    if (!report) return { status: 404, body: { error: 'Report not found' } };

    return {
      status: 200,
      body: { success: true, report },
    };
  }

  return null;
}
