/**
 * Moltbook MCP tool definitions and handlers.
 *
 * 6 tools for interacting with Moltbook (AI agent social network):
 * - moltbook_post: Post content with rendered preview
 * - moltbook_comment: Comment on a post
 * - moltbook_browse: Browse feed or semantic search
 * - moltbook_engage: Upvote, follow, subscribe
 * - moltbook_heartbeat: Get status or trigger manual cycle
 * - moltbook_create_submolt: Create a community
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getMoltbookClient, hasMoltbookKey } from './client';
import { MoltbookHeartbeat } from './heartbeat';
import { ContentPipeline } from './content-pipeline';

export const moltbookTools: Tool[] = [
  {
    name: 'moltbook_post',
    description:
      'Post HoloScript content to Moltbook (AI agent social network). Creates a post with the given title and content in the specified submolt. Handles verification challenges automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Post title (10-120 characters)',
        },
        content: {
          type: 'string',
          description: 'Post body text (supports markdown)',
        },
        submolt: {
          type: 'string',
          description: 'Target submolt name (default: general)',
        },
        type: {
          type: 'string',
          enum: ['text', 'link'],
          description: 'Post type (default: text)',
        },
        url: {
          type: 'string',
          description: 'URL for link-type posts',
        },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'moltbook_comment',
    description:
      'Comment on a Moltbook post. Handles verification challenges automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The Moltbook post ID to comment on',
        },
        content: {
          type: 'string',
          description: 'Comment text',
        },
        parentId: {
          type: 'string',
          description: 'Parent comment ID for threaded replies (optional)',
        },
      },
      required: ['postId', 'content'],
    },
  },
  {
    name: 'moltbook_browse',
    description:
      'Browse Moltbook feed or search for posts. Use semantic search to find conceptually related posts.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Semantic search query (optional — omit for feed browsing)',
        },
        submolt: {
          type: 'string',
          description: 'Filter to a specific submolt',
        },
        sort: {
          type: 'string',
          enum: ['hot', 'new', 'top', 'rising'],
          description: 'Sort order (default: hot)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 10, max: 25)',
        },
      },
    },
  },
  {
    name: 'moltbook_engage',
    description:
      'Engage with Moltbook content: upvote posts/comments, follow agents, or subscribe to submolts.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['upvote_post', 'upvote_comment', 'follow', 'subscribe'],
          description: 'Engagement action to perform',
        },
        targetId: {
          type: 'string',
          description:
            'Target identifier: post ID (for upvote_post), comment ID (for upvote_comment), agent name (for follow), or submolt name (for subscribe)',
        },
      },
      required: ['action', 'targetId'],
    },
  },
  {
    name: 'moltbook_heartbeat',
    description:
      'Get the Moltbook heartbeat daemon status (karma, comment count, rate limits) or trigger a manual engagement cycle.',
    inputSchema: {
      type: 'object',
      properties: {
        trigger: {
          type: 'boolean',
          description:
            'Set to true to trigger an immediate heartbeat cycle instead of just returning status',
        },
      },
    },
  },
  {
    name: 'moltbook_create_submolt',
    description: 'Create a new Moltbook submolt (community).',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Submolt URL name (lowercase, no spaces, e.g., "spatial_computing")',
        },
        displayName: {
          type: 'string',
          description: 'Human-readable display name',
        },
        description: {
          type: 'string',
          description: 'Community description',
        },
      },
      required: ['name', 'displayName', 'description'],
    },
  },
];

// --- Heartbeat singleton (shared with http-server lifecycle) ---

let heartbeatInstance: MoltbookHeartbeat | null = null;

export function getOrCreateHeartbeat(): MoltbookHeartbeat {
  if (!heartbeatInstance) {
    heartbeatInstance = new MoltbookHeartbeat(
      getMoltbookClient(),
      new ContentPipeline(),
    );
  }
  return heartbeatInstance;
}

export function getHeartbeatInstance(): MoltbookHeartbeat | null {
  return heartbeatInstance;
}

// --- Handler ---

export async function handleMoltbookTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  if (!name.startsWith('moltbook_')) return null;

  if (!hasMoltbookKey()) {
    return {
      error: 'MOLTBOOK_API_KEY is not configured. Set it as an environment variable to enable Moltbook integration.',
    };
  }

  switch (name) {
    case 'moltbook_post':
      return handlePost(args);
    case 'moltbook_comment':
      return handleComment(args);
    case 'moltbook_browse':
      return handleBrowse(args);
    case 'moltbook_engage':
      return handleEngage(args);
    case 'moltbook_heartbeat':
      return handleHeartbeat(args);
    case 'moltbook_create_submolt':
      return handleCreateSubmolt(args);
    default:
      return null;
  }
}

// --- Individual Handlers ---

async function handlePost(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const title = args.title as string;
  const content = args.content as string;
  const submolt = (args.submolt as string) || 'general';
  const type = (args.type as 'text' | 'link') || 'text';
  const url = args.url as string | undefined;

  const post = await client.createPost(submolt, title, content, type, url);

  return {
    success: true,
    postId: post.id,
    postUrl: `https://www.moltbook.com/post/${post.id}`,
    submolt: post.submolt.name,
    verificationStatus: post.verification_status,
  };
}

async function handleComment(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const postId = args.postId as string;
  const content = args.content as string;
  const parentId = args.parentId as string | undefined;

  const comment = await client.createComment(postId, content, parentId);

  return {
    success: true,
    commentId: comment.id,
    verificationStatus: comment.verification_status,
  };
}

async function handleBrowse(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const query = args.query as string | undefined;
  const submolt = args.submolt as string | undefined;
  const sort = (args.sort as 'hot' | 'new' | 'top' | 'rising') || 'hot';
  const limit = Math.min((args.limit as number) || 10, 25);

  if (query) {
    const results = await client.search(query, 'posts', limit);
    return {
      type: 'search',
      query,
      results: results.results.map((r) => ({
        id: r.id,
        title: r.title,
        preview: r.content?.slice(0, 200),
        upvotes: r.upvotes,
        author: r.author.name,
        submolt: r.submolt?.name,
        relevance: r.relevance,
      })),
      has_more: results.has_more,
    };
  }

  if (submolt) {
    const feed = await client.getSubmoltPosts(submolt, sort, limit);
    return {
      type: 'submolt_feed',
      submolt,
      sort,
      posts: feed.posts.map(summarizePost),
      has_more: feed.has_more,
    };
  }

  const feed = await client.getFeed(sort, limit);
  return {
    type: 'feed',
    sort,
    posts: feed.posts.map(summarizePost),
    has_more: feed.has_more,
  };
}

async function handleEngage(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const action = args.action as string;
  const targetId = args.targetId as string;

  switch (action) {
    case 'upvote_post':
      await client.upvotePost(targetId);
      return { success: true, action: 'upvoted_post', targetId };
    case 'upvote_comment':
      await client.upvoteComment(targetId);
      return { success: true, action: 'upvoted_comment', targetId };
    case 'follow':
      await client.followAgent(targetId);
      return { success: true, action: 'followed', targetId };
    case 'subscribe':
      await client.subscribe(targetId);
      return { success: true, action: 'subscribed', targetId };
    default:
      return { error: `Unknown action: ${action}` };
  }
}

async function handleHeartbeat(args: Record<string, unknown>) {
  const heartbeat = getOrCreateHeartbeat();
  const trigger = args.trigger as boolean;

  if (trigger) {
    const result = await heartbeat.triggerNow();
    return {
      triggered: true,
      result,
      state: heartbeat.getState(),
    };
  }

  return {
    running: heartbeat.isRunning(),
    state: heartbeat.getState(),
  };
}

async function handleCreateSubmolt(args: Record<string, unknown>) {
  const client = getMoltbookClient();
  const name = args.name as string;
  const displayName = args.displayName as string;
  const description = args.description as string;

  const submolt = await client.createSubmolt(name, displayName, description);

  return {
    success: true,
    submolt: {
      name: submolt.name,
      displayName: submolt.display_name,
      description: submolt.description,
    },
  };
}

// --- Helpers ---

function summarizePost(post: { id: string; title: string; content?: string; upvotes: number; comment_count: number; author: { name: string }; submolt: { name: string }; created_at: string }) {
  return {
    id: post.id,
    title: post.title,
    preview: post.content?.slice(0, 200),
    upvotes: post.upvotes,
    comments: post.comment_count,
    author: post.author.name,
    submolt: post.submolt.name,
    created_at: post.created_at,
  };
}
