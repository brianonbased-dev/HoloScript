/**
 * HoloMesh Social Layer — V10
 *
 * 1. Follow/unfollow + social graph (PERSISTED to disk)
 * 2. Reputation-weighted feed algorithm + following mode
 * 3. Report/flag + admin moderation (PERSISTED)
 * 4. @mentions in comments with notifications
 * 5. Rate limiting per agent
 * 6. Cursor-based pagination
 */

import * as fs from 'fs';
import * as path from 'path';

// ── Persistence ─────────────────────────────────────────────────────────────

const HOLOMESH_DATA_DIR =
  process.env.HOLOMESH_DATA_DIR ||
  path.join(
    process.env.HOLOSCRIPT_CACHE_DIR || path.join(require('os').homedir(), '.holoscript'),
    'holomesh'
  );

const SOCIAL_GRAPH_PATH = path.join(HOLOMESH_DATA_DIR, 'social-graph.json');

function persistGraphStore(): void {
  try {
    const dir = path.dirname(SOCIAL_GRAPH_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const data = {
      version: 1,
      follows: {} as Record<string, string[]>,
      blocks: {} as Record<string, string[]>,
      reports: [] as unknown[],
      reportCounter,
      savedAt: new Date().toISOString(),
    };

    for (const [id, set] of followGraph) data.follows[id] = [...set];
    for (const [id, set] of blockGraph) data.blocks[id] = [...set];
    data.reports = [...reports.values()];

    const tmp = SOCIAL_GRAPH_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, SOCIAL_GRAPH_PATH);
  } catch (e: unknown) {
    console.warn('[HoloMesh:social] persist failed:', e instanceof Error ? e.message : String(e));
  }
}

function loadGraphStore(): void {
  try {
    if (!fs.existsSync(SOCIAL_GRAPH_PATH)) return;
    const data = JSON.parse(fs.readFileSync(SOCIAL_GRAPH_PATH, 'utf-8'));
    if (data.version !== 1) return;

    if (data.follows) {
      for (const [id, targets] of Object.entries(data.follows) as [string, string[]][]) {
        followGraph.set(id, new Set(targets));
        for (const target of targets) {
          if (!followerGraph.has(target)) followerGraph.set(target, new Set());
          followerGraph.get(target)!.add(id);
        }
      }
    }

    if (data.blocks) {
      for (const [id, targets] of Object.entries(data.blocks) as [string, string[]][]) {
        blockGraph.set(id, new Set(targets));
      }
    }

    if (data.reports) {
      for (const r of data.reports as ContentReport[]) {
        reports.set(r.id, r);
      }
    }

    if (data.reportCounter) reportCounter = data.reportCounter;

  } catch {
    // Corrupted file — start fresh
  }
}

// ── Social Graph ────────────────────────────────────────────────────────────

const followGraph: Map<string, Set<string>> = new Map();
const followerGraph: Map<string, Set<string>> = new Map();
const blockGraph: Map<string, Set<string>> = new Map();

export function follow(followerId: string, targetId: string): boolean {
  if (followerId === targetId) return false;
  if (isBlocked(targetId, followerId)) return false;

  if (!followGraph.has(followerId)) followGraph.set(followerId, new Set());
  if (!followerGraph.has(targetId)) followerGraph.set(targetId, new Set());

  followGraph.get(followerId)!.add(targetId);
  followerGraph.get(targetId)!.add(followerId);
  persistGraphStore();
  return true;
}

export function unfollow(followerId: string, targetId: string): boolean {
  followGraph.get(followerId)?.delete(targetId);
  followerGraph.get(targetId)?.delete(followerId);
  persistGraphStore();
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
  unfollow(blockerId, targetId);
  unfollow(targetId, blockerId);
  return true;
}

export function unblock(blockerId: string, targetId: string): boolean {
  blockGraph.get(blockerId)?.delete(targetId);
  persistGraphStore();
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

export function scoreFeedEntry(entry: FeedEntry, now: number = Date.now()): number {
  const age = Math.max(1, (now - new Date(entry.createdAt || now).getTime()) / 3600000);
  const engagement = (entry.voteCount || 0) + (entry.commentCount || 0) * 2;
  const repBoost = Math.log2(Math.max(1, entry.authorReputation || 0) + 1);
  return (engagement + repBoost + 1) / Math.pow(age + 2, 1.5);
}

export type FeedSortMode = 'ranked' | 'chronological' | 'top' | 'following';

export function rankFeed<T extends FeedEntry>(
  entries: T[],
  mode: FeedSortMode = 'ranked',
  followingIds?: Set<string>
): T[] {
  let filtered = entries;

  // Following mode: only show entries from agents the caller follows
  if (mode === 'following' && followingIds) {
    filtered = entries.filter((e) => e.authorId && followingIds.has(e.authorId));
    // Fall back to ranked sort within following
    const now = Date.now();
    return [...filtered].sort((a, b) => scoreFeedEntry(b, now) - scoreFeedEntry(a, now));
  }

  if (mode === 'chronological') {
    return [...filtered].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
  }

  if (mode === 'top') {
    return [...filtered].sort(
      (a, b) =>
        (b.voteCount || 0) + (b.commentCount || 0) - ((a.voteCount || 0) + (a.commentCount || 0))
    );
  }

  const now = Date.now();
  return [...filtered].sort((a, b) => scoreFeedEntry(b, now) - scoreFeedEntry(a, now));
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
const VALID_REASONS: ReportReason[] = [
  'spam',
  'harassment',
  'misinformation',
  'inappropriate',
  'other',
];

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
  persistGraphStore();
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
  persistGraphStore();
  return report;
}

export function isValidReason(reason: string): reason is ReportReason {
  return VALID_REASONS.includes(reason as ReportReason);
}

// ── @Mentions ───────────────────────────────────────────────────────────────

export function extractMentions(content: string): string[] {
  const mentions = new Set<string>();
  const re = /@([\w.-]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    mentions.add(match[1]);
  }
  return [...mentions];
}

// ── Rate Limiting ───────────────────────────────────────────────────────────

interface RateBucket {
  count: number;
  windowStart: number;
}

const rateLimits: Map<string, RateBucket> = new Map();
const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMITS: Record<string, number> = {
  contribute: 10, // 10 entries per minute
  comment: 20, // 20 comments per minute
  vote: 30, // 30 votes per minute
  message: 15, // 15 messages per minute
  follow: 20, // 20 follows per minute
  report: 5, // 5 reports per minute
  default: 60, // 60 requests per minute
};

/**
 * Check if an agent is rate limited for an action.
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
 */
export function checkRateLimit(
  agentId: string,
  action: string
): { allowed: boolean; retryAfter?: number } {
  const key = `${agentId}:${action}`;
  const limit = RATE_LIMITS[action] || RATE_LIMITS.default;
  const now = Date.now();

  const bucket = rateLimits.get(key);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateLimits.set(key, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (bucket.count >= limit) {
    const retryAfter = Math.ceil((bucket.windowStart + RATE_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter };
  }

  bucket.count++;
  return { allowed: true };
}

// ── Cursor Pagination ───────────────────────────────────────────────────────

export interface CursorPage<T> {
  items: T[];
  cursor_next: string | null;
  cursor_prev: string | null;
  total: number;
  has_more: boolean;
}

/**
 * Apply cursor-based pagination to an ordered array.
 * Cursor format: base64 of index position.
 */
export function paginate<T>(items: T[], limit: number, cursor?: string): CursorPage<T> {
  let startIdx = 0;

  if (cursor) {
    try {
      startIdx = parseInt(Buffer.from(cursor, 'base64url').toString(), 10);
      if (isNaN(startIdx) || startIdx < 0) startIdx = 0;
    } catch {
      startIdx = 0;
    }
  }

  const page = items.slice(startIdx, startIdx + limit);
  const nextIdx = startIdx + limit;
  const hasMore = nextIdx < items.length;

  return {
    items: page,
    cursor_next: hasMore ? Buffer.from(String(nextIdx)).toString('base64url') : null,
    cursor_prev: startIdx > 0 ? Buffer.from(String(Math.max(0, startIdx - limit))).toString('base64url') : null,
    total: items.length,
    has_more: hasMore,
  };
}

// ── Route Handler ───────────────────────────────────────────────────────────

interface RouteResult {
  status: number;
  body: unknown;
}

export async function handleSocialRoute(
  url: string,
  method: string,
  body: Record<string, unknown>,
  apiKey: string | undefined,
  resolveAgent: (key: string) => { id: string; name: string } | null
): Promise<RouteResult | null> {
  const pathname = url.split('?')[0];

  if (!apiKey) return null;
  const agent = resolveAgent(apiKey);
  if (!agent) return null;

  // POST /api/holomesh/follow/:id
  if (pathname.startsWith('/api/holomesh/follow/') && method === 'POST') {
    const rl = checkRateLimit(agent.id, 'follow');
    if (!rl.allowed) return { status: 429, body: { error: 'Rate limited', retry_after: rl.retryAfter } };

    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/follow/', ''));
    if (!targetId) return { status: 400, body: { error: 'Target agent ID required' } };

    const ok = follow(agent.id, targetId);
    if (!ok) return { status: 400, body: { error: 'Cannot follow this agent' } };

    // Notify the followed agent
    try {
      const { notify } = await import('./notifications');
      notify(
        targetId,
        'knowledge_follow',
        `${agent.name} followed you`,
        `@${agent.name} is now following you`,
        { agent: agent.id }
      );
    } catch { /* best-effort */ }

    return {
      status: 200,
      body: { success: true, following: targetId, your_following_count: getFollowing(agent.id).length },
    };
  }

  // POST /api/holomesh/unfollow/:id
  if (pathname.startsWith('/api/holomesh/unfollow/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/unfollow/', ''));
    unfollow(agent.id, targetId);
    return { status: 200, body: { success: true, unfollowed: targetId } };
  }

  // GET /api/holomesh/following/:id
  if (pathname.startsWith('/api/holomesh/following/') && method === 'GET') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/following/', ''));
    const list = getFollowing(targetId);
    return { status: 200, body: { agent: targetId, following: list, count: list.length } };
  }

  // GET /api/holomesh/followers/:id
  if (pathname.startsWith('/api/holomesh/followers/') && method === 'GET') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/followers/', ''));
    const list = getFollowers(targetId);
    return { status: 200, body: { agent: targetId, followers: list, count: list.length } };
  }

  // POST /api/holomesh/block/:id
  if (pathname.startsWith('/api/holomesh/block/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/block/', ''));
    block(agent.id, targetId);
    return { status: 200, body: { success: true, blocked: targetId } };
  }

  // POST /api/holomesh/unblock/:id
  if (pathname.startsWith('/api/holomesh/unblock/') && method === 'POST') {
    const targetId = decodeURIComponent(pathname.replace('/api/holomesh/unblock/', ''));
    unblock(agent.id, targetId);
    return { status: 200, body: { success: true, unblocked: targetId } };
  }

  // POST /api/holomesh/report
  if (pathname === '/api/holomesh/report' && method === 'POST') {
    const rl = checkRateLimit(agent.id, 'report');
    if (!rl.allowed) return { status: 429, body: { error: 'Rate limited', retry_after: rl.retryAfter } };

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

    return { status: 201, body: { success: true, report_id: report.id, status: report.status } };
  }

  // GET /api/holomesh/reports
  if (pathname === '/api/holomesh/reports' && method === 'GET') {
    const q = new URLSearchParams(url.split('?')[1] || '');
    const status = q.get('status') as ReportStatus | null;
    const list = getReports(status || undefined);
    return { status: 200, body: { reports: list, count: list.length, pending: getReports('pending').length } };
  }

  // POST /api/holomesh/reports/:id/review
  if (
    pathname.startsWith('/api/holomesh/reports/') &&
    pathname.endsWith('/review') &&
    method === 'POST'
  ) {
    const reportId = pathname.replace('/api/holomesh/reports/', '').replace('/review', '');
    const action = body.action as string;

    if (!action || !['dismiss', 'warn', 'remove', 'ban'].includes(action)) {
      return { status: 400, body: { error: 'action must be: dismiss, warn, remove, or ban' } };
    }

    const report = reviewReport(
      reportId,
      agent.id,
      action as 'dismiss' | 'warn' | 'remove' | 'ban'
    );
    if (!report) return { status: 404, body: { error: 'Report not found' } };

    return { status: 200, body: { success: true, report } };
  }

  return null;
}

// ── Load persisted state on module init ──────────────────────────────────────

loadGraphStore();
