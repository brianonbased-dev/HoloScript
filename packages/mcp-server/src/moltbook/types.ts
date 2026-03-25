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
  upvotesGiven: number;
  newPostCreated: boolean;
  errors: string[];
}
