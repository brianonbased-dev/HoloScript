/**
 * HoloMesh Discussion Threads
 *
 * Reply/discussion thread system for HoloMesh knowledge entries.
 * Any knowledge entry can have a discussion thread attached to it,
 * allowing agents to discuss, challenge, extend, or build on shared knowledge.
 *
 * - In-memory thread store (Map<entryId, ThreadReply[]>)
 * - Nested replies via parentReplyId
 * - Max 500 replies per entry
 *
 * Exports: core functions, MCP tool definitions, tool handler, route handler.
 *
 * @module holomesh/threads
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

// ── Types ──

export interface ThreadReply {
  id: string;
  entryId: string;
  parentReplyId?: string;
  authorId: string;
  authorName: string;
  content: string;
  upvotes: number;
  createdAt: string;
}

// ── In-Memory Store ──

const MAX_REPLIES_PER_ENTRY = 500;

/** entryId -> ThreadReply[] */
const threadStore: Map<string, ThreadReply[]> = new Map();

// ── Core Functions ──

/**
 * Add a reply to an entry's discussion thread.
 * Throws if the entry already has 500 replies or if parentReplyId doesn't exist.
 */
export function addReply(
  entryId: string,
  authorId: string,
  authorName: string,
  content: string,
  parentReplyId?: string
): ThreadReply {
  const replies = threadStore.get(entryId) || [];

  if (replies.length >= MAX_REPLIES_PER_ENTRY) {
    throw new Error(
      `Thread for entry ${entryId} has reached the maximum of ${MAX_REPLIES_PER_ENTRY} replies`
    );
  }

  if (parentReplyId) {
    const parentExists = replies.some((r) => r.id === parentReplyId);
    if (!parentExists) {
      throw new Error(`Parent reply ${parentReplyId} not found in thread for entry ${entryId}`);
    }
  }

  const reply: ThreadReply = {
    id: randomUUID(),
    entryId,
    parentReplyId,
    authorId,
    authorName,
    content,
    upvotes: 0,
    createdAt: new Date().toISOString(),
  };

  replies.push(reply);
  threadStore.set(entryId, replies);
  return reply;
}

/**
 * Get replies for an entry, newest first.
 * @param limit Max replies to return (default: 50)
 */
export function getReplies(entryId: string, limit = 50): ThreadReply[] {
  const replies = threadStore.get(entryId) || [];
  return [...replies].reverse().slice(0, limit);
}

/**
 * Get the total reply count for an entry.
 */
export function getReplyCount(entryId: string): number {
  return (threadStore.get(entryId) || []).length;
}

/**
 * Upvote a reply. Returns true if the reply was found and upvoted.
 */
export function upvoteReply(replyId: string, entryId: string): boolean {
  const replies = threadStore.get(entryId);
  if (!replies) return false;

  const reply = replies.find((r) => r.id === replyId);
  if (!reply) return false;

  reply.upvotes += 1;
  return true;
}

/**
 * Get all replies for tree rendering.
 * Returns a flat list ordered chronologically with parentReplyId
 * intact for client-side tree construction.
 */
export function getThreadTree(entryId: string): ThreadReply[] {
  return [...(threadStore.get(entryId) || [])];
}

// ── MCP Tool Definitions ──

export const threadTools: Tool[] = [
  {
    name: 'holomesh_reply',
    description:
      'Reply to a HoloMesh knowledge entry or another reply in its discussion thread. Supports nested threading via parent_reply_id.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'The knowledge entry ID to reply to',
        },
        author_id: {
          type: 'string',
          description: 'Your agent ID',
        },
        author_name: {
          type: 'string',
          description: 'Your display name',
        },
        content: {
          type: 'string',
          description: 'The reply content',
        },
        parent_reply_id: {
          type: 'string',
          description: 'Optional: ID of the reply to nest under (for threaded discussion)',
        },
      },
      required: ['entry_id', 'author_id', 'author_name', 'content'],
    },
  },
  {
    name: 'holomesh_discussion',
    description:
      'Read the discussion thread on a HoloMesh knowledge entry. Returns replies newest-first with threading info.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'The knowledge entry ID to read discussion for',
        },
        limit: {
          type: 'number',
          description: 'Max replies to return (default: 50)',
        },
      },
      required: ['entry_id'],
    },
  },
  {
    name: 'holomesh_upvote_reply',
    description: 'Upvote a helpful reply in a HoloMesh discussion thread.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'The knowledge entry ID the reply belongs to',
        },
        reply_id: {
          type: 'string',
          description: 'The reply ID to upvote',
        },
      },
      required: ['entry_id', 'reply_id'],
    },
  },
];

// ── MCP Tool Handler ──

export async function handleThreadTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    case 'holomesh_reply': {
      const entryId = args.entry_id as string;
      const authorId = args.author_id as string;
      const authorName = args.author_name as string;
      const content = args.content as string;
      const parentReplyId = args.parent_reply_id as string | undefined;

      if (!entryId || !authorId || !authorName || !content) {
        return { error: 'Missing required fields: entry_id, author_id, author_name, content' };
      }

      try {
        const reply = addReply(entryId, authorId, authorName, content, parentReplyId);
        return {
          success: true,
          reply,
          thread_count: getReplyCount(entryId),
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return { error: msg };
      }
    }

    case 'holomesh_discussion': {
      const entryId = args.entry_id as string;
      const limit = (args.limit as number) || 50;

      if (!entryId) {
        return { error: 'Missing required field: entry_id' };
      }

      const replies = getReplies(entryId, limit);
      return {
        entry_id: entryId,
        total_replies: getReplyCount(entryId),
        returned: replies.length,
        replies,
      };
    }

    case 'holomesh_upvote_reply': {
      const entryId = args.entry_id as string;
      const replyId = args.reply_id as string;

      if (!entryId || !replyId) {
        return { error: 'Missing required fields: entry_id, reply_id' };
      }

      const success = upvoteReply(replyId, entryId);
      if (!success) {
        return { error: `Reply ${replyId} not found in thread for entry ${entryId}` };
      }

      return { success: true, reply_id: replyId };
    }

    default:
      return null;
  }
}

// ── HTTP Route Handler ──

/**
 * Handle thread-related HTTP routes.
 * Returns null if the URL doesn't match any thread route.
 *
 * Routes:
 * - GET  /api/holomesh/entries/:entryId/replies?limit=50
 * - POST /api/holomesh/entries/:entryId/replies
 * - POST /api/holomesh/entries/:entryId/replies/:replyId/upvote
 */
export async function handleThreadRoute(
  url: string,
  method: string,
  body: any,
  apiKey?: string
): Promise<{ status: number; body: any } | null> {
  // Match: /api/holomesh/entries/:entryId/replies/:replyId/upvote
  const upvoteMatch = url.match(/^\/api\/holomesh\/entries\/([^/?]+)\/replies\/([^/?]+)\/upvote$/);
  if (upvoteMatch && method === 'POST') {
    if (!apiKey) {
      return { status: 401, body: { error: 'Authentication required' } };
    }

    const [, entryId, replyId] = upvoteMatch;
    const success = upvoteReply(replyId, entryId);
    if (!success) {
      return {
        status: 404,
        body: { error: `Reply ${replyId} not found in thread for entry ${entryId}` },
      };
    }

    return { status: 200, body: { success: true, reply_id: replyId } };
  }

  // Match: /api/holomesh/entries/:entryId/replies
  const repliesMatch = url.match(/^\/api\/holomesh\/entries\/([^/?]+)\/replies(?:\?.*)?$/);
  if (!repliesMatch) return null;

  const entryId = repliesMatch[1];

  if (method === 'GET') {
    // Parse limit from query string
    const queryMatch = url.match(/[?&]limit=(\d+)/);
    const limit = queryMatch ? parseInt(queryMatch[1], 10) : 50;

    const replies = getReplies(entryId, limit);
    return {
      status: 200,
      body: {
        entry_id: entryId,
        total_replies: getReplyCount(entryId),
        returned: replies.length,
        replies,
      },
    };
  }

  if (method === 'POST') {
    if (!apiKey) {
      return { status: 401, body: { error: 'Authentication required' } };
    }

    const content = body?.content as string | undefined;
    if (!content) {
      return { status: 400, body: { error: 'Missing required field: content' } };
    }

    const parentReplyId = body?.parent_reply_id as string | undefined;

    // Derive author info from API key (use key hash as ID, truncated as name)
    const authorId = apiKey;
    const authorName = (body?.author_name as string) || `agent-${apiKey.slice(0, 8)}`;

    try {
      const reply = addReply(entryId, authorId, authorName, content, parentReplyId);
      return {
        status: 201,
        body: {
          success: true,
          reply,
          thread_count: getReplyCount(entryId),
        },
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const status = msg.includes('maximum') ? 429 : 400;
      return { status, body: { error: msg } };
    }
  }

  return null;
}
