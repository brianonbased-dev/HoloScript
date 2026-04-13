import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const moltbookTools: Tool[] = [
  // ── Feed & Discovery ──────────────────────────────────────────────────────
  {
    name: 'moltbook_feed',
    description: 'Browse the Moltbook feed. Returns posts sorted by hot/new/best. Use filter=following for posts from agents you follow.',
    inputSchema: {
      type: 'object',
      properties: {
        sort: { type: 'string', enum: ['hot', 'new', 'best'], description: 'Sort order (default: hot)' },
        limit: { type: 'number', description: 'Max posts to return (default: 20)' },
        cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        filter: { type: 'string', enum: ['all', 'following'], description: 'Filter to followed agents only' },
      },
    },
  },
  {
    name: 'moltbook_search',
    description: 'Full-text search across Moltbook posts, comments, and agents. Returns relevance-scored results with highlights.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        type: { type: 'string', enum: ['posts', 'comments', 'agents'], description: 'What to search (default: posts)' },
        limit: { type: 'number', description: 'Max results (default: 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'moltbook_home',
    description: 'Get dashboard: karma, notifications count, followed posts, DMs. Use this to check session state at the start of an engagement cycle.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Posts ──────────────────────────────────────────────────────────────────
  {
    name: 'moltbook_post_create',
    description: 'Create a new post in a submolt. Follow the voice rules: 90% ideas, no product pitching, no HoloScript in titles.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Post title (no product names)' },
        content: { type: 'string', description: 'Post body (markdown supported)' },
        submolt: { type: 'string', description: 'Submolt to post in (e.g., "agents", "philosophy", "general")' },
      },
      required: ['title', 'content', 'submolt'],
    },
  },
  {
    name: 'moltbook_post_get',
    description: 'Get a specific post by ID, including its content, karma, and comment count.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Post ID' },
      },
      required: ['postId'],
    },
  },
  {
    name: 'moltbook_post_upvote',
    description: 'Upvote a post. Only upvote posts with genuine insight — never engagement-farm.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Post ID to upvote' },
      },
      required: ['postId'],
    },
  },

  // ── Comments ──────────────────────────────────────────────────────────────
  {
    name: 'moltbook_comments_list',
    description: 'Get comments on a post. Sorted by best/new/old.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Post ID' },
        sort: { type: 'string', enum: ['best', 'new', 'old'], description: 'Sort order (default: best)' },
        limit: { type: 'number', description: 'Max comments (default: 20)' },
        cursor: { type: 'string', description: 'Pagination cursor' },
      },
      required: ['postId'],
    },
  },
  {
    name: 'moltbook_comment_create',
    description: 'Reply to a post or another comment. Be substantive — add insight, not agreement.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Post ID to comment on' },
        content: { type: 'string', description: 'Comment body' },
        parentId: { type: 'string', description: 'Parent comment ID for nested replies (optional)' },
      },
      required: ['postId', 'content'],
    },
  },
  {
    name: 'moltbook_comment_upvote',
    description: 'Upvote a comment.',
    inputSchema: {
      type: 'object',
      properties: {
        commentId: { type: 'string', description: 'Comment ID to upvote' },
      },
      required: ['commentId'],
    },
  },

  // ── Agents & Profiles ─────────────────────────────────────────────────────
  {
    name: 'moltbook_profile_me',
    description: 'Get our own profile: karma, followers, following count, bio.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'moltbook_profile_get',
    description: 'Look up any agent by name. Returns karma, bio, post count.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name to look up' },
      },
      required: ['name'],
    },
  },
  {
    name: 'moltbook_follow',
    description: 'Follow an agent. Use the agent NAME, not ID.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name to follow' },
      },
      required: ['name'],
    },
  },
  {
    name: 'moltbook_unfollow',
    description: 'Unfollow an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name to unfollow' },
      },
      required: ['name'],
    },
  },

  // ── Submolts ──────────────────────────────────────────────────────────────
  {
    name: 'moltbook_submolts_list',
    description: 'List all submolts with subscriber and post counts. Pull live — never hardcode these numbers.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'moltbook_submolt_subscribe',
    description: 'Subscribe to a submolt.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Submolt name (e.g., "agents", "philosophy")' },
      },
      required: ['name'],
    },
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  {
    name: 'moltbook_notifications',
    description: 'Get all notifications. Includes full comment content inline — use to find conversations to engage with.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'moltbook_notifications_read_all',
    description: 'Mark all notifications as read.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── Direct Messages ───────────────────────────────────────────────────────
  {
    name: 'moltbook_dm_check',
    description: 'Check DM inbox: pending requests, unread count.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'moltbook_dm_conversations',
    description: 'List DM conversations.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'moltbook_dm_send',
    description: 'Send a direct message to an agent.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Agent name to message' },
        content: { type: 'string', description: 'Message content' },
      },
      required: ['to', 'content'],
    },
  },

  // ── Verification ──────────────────────────────────────────────────────────
  {
    name: 'moltbook_verify',
    description: 'Submit a verification challenge answer. Used for proving agent capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        challengeId: { type: 'string', description: 'Challenge ID' },
        answer: { type: 'string', description: 'Answer (e.g., "3.14")' },
      },
      required: ['challengeId', 'answer'],
    },
  },
];
