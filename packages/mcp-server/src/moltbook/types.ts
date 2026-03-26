// Moltbook API v1 TypeScript interfaces

export const MOLTBOOK_BASE = 'https://www.moltbook.com/api/v1';

export interface MoltbookConfig {
  apiKey: string;
  baseUrl: string;
  heartbeatIntervalMs: number;
  maxCommentsPerDay: number;
  commentCooldownMs: number;
  postCooldownMs: number;
}

export const DEFAULT_CONFIG: Omit<MoltbookConfig, 'apiKey'> = {
  baseUrl: MOLTBOOK_BASE,
  heartbeatIntervalMs: 30 * 60 * 1000,
  maxCommentsPerDay: 50,
  commentCooldownMs: 20_000,
  postCooldownMs: 30 * 60 * 1000,
};

// --- Engagement Strategy Config ---

export interface EngagementConfig {
  /** Outbound comment ratio (0.0-1.0). 0.7 = 70% outbound, 30% inbound. */
  outboundRatio: number;
  /** When true, outbound comments execute BEFORE defensive replies. */
  outboundFirstEnabled: boolean;
  /** Max outbound comments (on others' posts) per heartbeat tick. */
  maxOutboundPerTick: number;
  /** Max inbound replies (on own posts) per heartbeat tick. */
  maxInboundPerTick: number;
  /** Search strategy: random (current), rotate (round-robin), weighted (by relevance) */
  searchStrategy: 'random' | 'rotate' | 'weighted';
  /** Feed sorting strategies to use during browse (cycles through them) */
  feedStrategies: Array<'hot' | 'new' | 'rising'>;
  /** Min upvotes on a post before we'll comment on it */
  minPostUpvotesForComment: number;
  /** Max comment count on a post — avoid crowded threads */
  maxPostCommentsForComment: number;
  /** Custom search topics (overrides default SEARCH_TOPICS in heartbeat) */
  searchTopics?: string[];
  /** Min upvotes on a commenter's comment before replying (karma triage proxy) */
  minCommentUpvotesForReply: number;
  /** Enable DM support (inbox check + outreach). Default: false. */
  dmEnabled: boolean;
  /** Min comment exchanges with an agent before DM outreach is allowed */
  dmMinExchangesBeforeOutreach: number;
  /** Max DMs to send per heartbeat tick */
  dmMaxOutreachPerTick: number;
}

export const DEFAULT_ENGAGEMENT_CONFIG: EngagementConfig = {
  outboundRatio: 0.7,
  outboundFirstEnabled: true,
  maxOutboundPerTick: 7,
  maxInboundPerTick: 3,
  searchStrategy: 'rotate',
  feedStrategies: ['hot', 'new'],
  minPostUpvotesForComment: 2,
  maxPostCommentsForComment: 30,
  minCommentUpvotesForReply: 0,
  dmEnabled: false,
  dmMinExchangesBeforeOutreach: 3,
  dmMaxOutreachPerTick: 2,
};

// --- Karma-Adaptive Tiers ---

export interface KarmaTier {
  minKarma: number;
  heartbeatIntervalMs: number;
  commentCooldownMs: number;
}

/**
 * Higher karma = faster engagement allowed.
 * Based on live Moltbook rate limit data from 4 engagement sessions.
 */
export const KARMA_TIERS: KarmaTier[] = [
  { minKarma: 50, heartbeatIntervalMs: 2 * 60 * 1000, commentCooldownMs: 0 },
  { minKarma: 31, heartbeatIntervalMs: 2.5 * 60 * 1000, commentCooldownMs: 0 },
  { minKarma: 16, heartbeatIntervalMs: 5 * 60 * 1000, commentCooldownMs: 60_000 },
  { minKarma: 0, heartbeatIntervalMs: 30 * 60 * 1000, commentCooldownMs: 120_000 },
];

/** Resolve the karma tier for a given karma value. */
export function resolveKarmaTier(karma: number): KarmaTier {
  for (const tier of KARMA_TIERS) {
    if (karma >= tier.minKarma) return tier;
  }
  return KARMA_TIERS[KARMA_TIERS.length - 1];
}

// --- Submolt Audience Targeting ---

export interface SubmoltTarget {
  name: string;
  /** Subscriber count — used for weighted selection. Higher = more reach. */
  subscriberCount: number;
  /** Which content pillars suit this submolt (empty = all) */
  pillarAffinity?: ContentPillar[];
}

/**
 * Default submolt targets based on live Moltbook data (2026-03-26).
 * general has 50x the audience of agents — prioritize it for growth.
 */
export const DEFAULT_SUBMOLT_TARGETS: SubmoltTarget[] = [
  { name: 'general', subscriberCount: 126_035 },
  { name: 'ai', subscriberCount: 7_224, pillarAffinity: ['research'] },
  { name: 'security', subscriberCount: 5_261, pillarAffinity: ['infrastructure'] },
  { name: 'agents', subscriberCount: 2_519, pillarAffinity: ['research', 'infrastructure'] },
  { name: 'tooling', subscriberCount: 942, pillarAffinity: ['infrastructure'] },
  { name: 'builds', subscriberCount: 1_636, pillarAffinity: ['showcase'] },
  { name: 'infrastructure', subscriberCount: 766, pillarAffinity: ['infrastructure'] },
  { name: 'technology', subscriberCount: 1_063, pillarAffinity: ['research', 'showcase'] },
];

/**
 * Select a submolt using weighted random by subscriber count.
 * Filters by pillar affinity if specified, always includes 'general'.
 * Falls back to 'general' if no suitable submolt found.
 */
export function selectSubmoltByAudience(
  pillar: ContentPillar,
  targets: SubmoltTarget[] = DEFAULT_SUBMOLT_TARGETS,
  minSubscribers = 1000,
): string {
  // Filter to submolts matching pillar affinity (or no affinity = universal)
  const candidates = targets.filter((t) => {
    if (t.subscriberCount < minSubscribers && t.name !== 'general') return false;
    if (!t.pillarAffinity || t.pillarAffinity.length === 0) return true;
    return t.pillarAffinity.includes(pillar);
  });

  if (candidates.length === 0) return 'general';

  // Weighted random: probability proportional to subscriberCount
  const totalWeight = candidates.reduce((sum, c) => sum + c.subscriberCount, 0);
  let roll = Math.random() * totalWeight;
  for (const candidate of candidates) {
    roll -= candidate.subscriberCount;
    if (roll <= 0) return candidate.name;
  }

  return candidates[candidates.length - 1].name;
}

// --- API Response Types ---

export interface MoltbookAgent {
  id: string;
  name: string;
  description: string;
  avatarUrl: string | null;
  karma: number;
  followerCount: number;
  followingCount: number;
  isClaimed: boolean;
  isActive: boolean;
  createdAt: string;
  lastActive: string | null;
}

export interface MoltbookSubmolt {
  id: string;
  name: string;
  display_name: string;
  description: string;
  subscriber_count: number;
  post_count: number;
  is_nsfw: boolean;
  is_private: boolean;
  created_at: string;
}

export interface MoltbookPost {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'link';
  url?: string;
  author_id: string;
  author: MoltbookAgent;
  submolt: { id: string; name: string; display_name: string };
  upvotes: number;
  downvotes: number;
  score: number;
  comment_count: number;
  hot_score: number;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  verification_status: 'pending' | 'verified' | 'failed';
  created_at: string;
  updated_at: string;
  verification?: VerificationChallenge;
}

export interface MoltbookComment {
  id: string;
  post_id: string;
  content: string;
  parent_id?: string;
  author_id: string;
  author: MoltbookAgent;
  upvotes: number;
  downvotes: number;
  score: number;
  reply_count: number;
  depth: number;
  verification_status: 'pending' | 'verified' | 'failed';
  created_at: string;
  updated_at: string;
  replies: MoltbookComment[];
  verification?: VerificationChallenge;
}

export interface VerificationChallenge {
  verification_code: string;
  challenge_text: string;
  expires_at: string;
  instructions: string;
}

export interface MoltbookHomeResponse {
  your_account: { name: string; karma: number; unread_notification_count: number };
  activity_on_your_posts: Array<{
    post_id: string;
    title: string;
    new_comments: number;
  }>;
  your_direct_messages: {
    pending_request_count: string;
    unread_message_count: string;
  };
  latest_moltbook_announcement?: {
    post_id: string;
    title: string;
    author_name: string;
    created_at: string;
    preview: string;
  };
  posts_from_accounts_you_follow: {
    posts: MoltbookPost[];
    total_following: number;
  };
  what_to_do_next: string[];
}

export interface MoltbookFeedResponse {
  success: boolean;
  posts: MoltbookPost[];
  has_more: boolean;
  next_cursor?: string;
}

export interface MoltbookSearchResult {
  id: string;
  type: 'post' | 'comment';
  title?: string;
  content: string;
  upvotes: number;
  relevance: number;
  author: { id: string; name: string };
  submolt?: { id: string; name: string; display_name: string };
  created_at: string;
}

// --- Direct Messages ---

export interface DMConversation {
  id: string;
  participants: Array<{ id: string; name: string }>;
  last_message?: DMMessage;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface DMMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  content: string;
  is_read: boolean;
  created_at: string;
}

// --- Heartbeat State ---

export interface HeartbeatState {
  lastCheck: number;
  lastPostTime: number;
  commentsToday: number;
  commentsDayStart: number;
  lastCommentTime: number;
  challengeFailures: number;
  totalPosts: number;
  totalComments: number;
  totalUpvotes: number;
  /** Outbound comments (on others' posts) today */
  outboundCommentsToday: number;
  /** Inbound replies (on own posts) today */
  inboundCommentsToday: number;
  /** Last known karma (for tier resolution and delta tracking) */
  currentKarma: number;
  /** Titles of posts already created (for dedup across restarts) */
  postHistory: string[];
}

export const INITIAL_HEARTBEAT_STATE: HeartbeatState = {
  lastCheck: 0,
  lastPostTime: 0,
  commentsToday: 0,
  commentsDayStart: 0,
  lastCommentTime: 0,
  challengeFailures: 0,
  totalPosts: 0,
  totalComments: 0,
  totalUpvotes: 0,
  outboundCommentsToday: 0,
  inboundCommentsToday: 0,
  currentKarma: 0,
  postHistory: [],
};

// --- Content Pipeline ---

export type ContentPillar = 'research' | 'infrastructure' | 'showcase' | 'community';

export interface GeneratedPost {
  submolt: string;
  title: string;
  body: string;
  pillar: ContentPillar;
  tags: string[];
}

export interface HeartbeatResult {
  checkedHome: boolean;
  repliesSent: number;
  commentsPosted: number;
  /** Outbound comments posted on others' posts this tick */
  outboundComments: number;
  /** Inbound replies posted on own posts this tick */
  inboundReplies: number;
  upvotesGiven: number;
  newPostCreated: boolean;
  errors: string[];
}

// --- Platform Stats (single source of truth — update when numbers change) ---

export const PLATFORM_STATS = {
  TOOL_COUNT: '103+',
  TEST_COUNT: '45,900+',
  BACKEND_COUNT: '17',
  BENCHMARK_PASS: '51/51',
  COMPILATION_AVG: '0.7ms',
  PACKAGE_COUNT: '8',
  CATEGORY_COUNT: '22',
} as const;
