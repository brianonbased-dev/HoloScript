/**
 * HoloMesh Agent-to-Agent Messaging System
 *
 * MCP-first messaging: every interaction is a tool call.
 * MCP send/inbox/thread tools write the durable team message store
 * (same store as POST /api/holomesh/team/:id/message). The leftover
 * in-memory Map is only for the unwired `/api/holomesh/messages` HTTP
 * helper and must not be the MCP success path.
 *
 * Exports:
 * - Core functions: sendMessage, getInbox, getThread, markRead, getUnreadCount
 * - MCP tool definitions: messagingTools
 * - MCP dispatcher: handleMessagingTool
 * - HTTP route handler: handleMessagingRoute
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import { authPrincipal } from './identity/mcp-board-agent-binding';
import {
  reloadTeam,
  teamStore,
  walletToAgent,
} from './state';
import {
  findTeamMember,
  messageAddressedToAny,
} from './message-addressing';
import { hydrateTeamMessageStore, persistTeamMessages } from './team-message-merge';
import { broadcastToTeam } from './team-room';
import type { Team, TeamMember, TeamMessage } from './types';

// ── Types ──

/**
 * Sender's chain-time cursor at the moment the message was sent.
 * The receiving agent can read this to know "where the sender was looking from"
 * and adjudicate disagreements as cursor-position differences rather than
 * wallclock-timeline conflicts. See research/2026-04-27_time-premise-
 * holoscript-architecture.md §4 (agent identity is (handle, chain, depth)).
 */
export interface MessageCursor {
  /** Stable identifier of the CAEL chain the sender was reading. */
  chain: string;
  /** Non-negative integer chain-depth (0-indexed) at the cursor. */
  depth: number;
}

export interface Message {
  id: string;
  fromAgent: string;
  fromName: string;
  toAgent: string;
  content: string;
  threadId?: string;
  createdAt: string;
  read: boolean;
  /**
   * Optional sender chain-time cursor. Backward compatible: senders that
   * don't supply this leave it absent on the stored Message. Per W.114 +
   * W.115, the cursor is part of the sender's full identity (handle, chain,
   * depth) — the handle alone tells you who, the cursor tells you when.
   */
  cursorAt?: MessageCursor;
}

/**
 * Validate and narrow an unknown to {@link MessageCursor}. Returns the
 * narrowed value, or a descriptive error string if the input is malformed.
 *
 * Accepts: `{ chain: string (non-empty), depth: number (non-negative integer) }`.
 * Returns the value unchanged when valid.
 */
export function validateCursor(raw: unknown): MessageCursor | { error: string } {
  if (raw === undefined || raw === null) {
    return { error: 'cursor must be an object with { chain, depth }' };
  }
  if (typeof raw !== 'object') {
    return { error: 'cursor must be an object, got ' + typeof raw };
  }
  const o = raw as Record<string, unknown>;
  const chain = o.chain;
  const depth = o.depth;
  if (typeof chain !== 'string' || chain.length === 0) {
    return { error: 'cursor.chain must be a non-empty string' };
  }
  if (typeof depth !== 'number' || !Number.isInteger(depth) || depth < 0) {
    return { error: 'cursor.depth must be a non-negative integer' };
  }
  return { chain, depth };
}

/** Callback to resolve an agent ID + name from an API key */
export type AgentResolver = (apiKey: string) => { id: string; name: string } | undefined;

// ── In-Memory Store (LRU, max 10,000) ──

const MAX_MESSAGES = 10_000;

/** Ordered by insertion — oldest first for eviction */
const messageStore: Map<string, Message> = new Map();

/** Secondary index: agentId → Set of message IDs addressed to them */
const inboxIndex: Map<string, Set<string>> = new Map();

/** Secondary index: threadId → ordered array of message IDs */
const threadIndex: Map<string, string[]> = new Map();

function ensureCapacity(): void {
  while (messageStore.size >= MAX_MESSAGES) {
    // Evict oldest (first inserted) entry
    const oldest = messageStore.keys().next().value;
    if (oldest === undefined) break;
    const msg = messageStore.get(oldest);
    messageStore.delete(oldest);

    // Clean up secondary indexes
    if (msg) {
      const inbox = inboxIndex.get(msg.toAgent);
      if (inbox) {
        inbox.delete(oldest);
        if (inbox.size === 0) inboxIndex.delete(msg.toAgent);
      }
      if (msg.threadId) {
        const thread = threadIndex.get(msg.threadId);
        if (thread) {
          const idx = thread.indexOf(oldest);
          if (idx !== -1) thread.splice(idx, 1);
          if (thread.length === 0) threadIndex.delete(msg.threadId);
        }
      }
    }
  }
}

// ── Core Functions ──

/**
 * Send a message to another agent. Returns the created message.
 *
 * `cursorAt` is the sender's chain-time cursor at send time — receiving
 * agents read it to know where the sender was looking from. Backward
 * compatible: omitting it leaves `cursorAt` absent on the stored Message.
 */
export function sendMessage(
  fromId: string,
  fromName: string,
  toAgent: string,
  content: string,
  threadId?: string,
  cursorAt?: MessageCursor
): Message {
  ensureCapacity();

  const msg: Message = {
    id: randomUUID(),
    fromAgent: fromId,
    fromName,
    toAgent,
    content,
    threadId,
    createdAt: new Date().toISOString(),
    read: false,
    ...(cursorAt !== undefined ? { cursorAt } : {}),
  };

  messageStore.set(msg.id, msg);

  // Update inbox index
  let inbox = inboxIndex.get(toAgent);
  if (!inbox) {
    inbox = new Set();
    inboxIndex.set(toAgent, inbox);
  }
  inbox.add(msg.id);

  // Update thread index
  if (threadId) {
    let thread = threadIndex.get(threadId);
    if (!thread) {
      thread = [];
      threadIndex.set(threadId, thread);
    }
    thread.push(msg.id);
  }

  return msg;
}

/**
 * Get messages addressed to an agent.
 * Optionally filter to unread only and limit results.
 * Returns newest first.
 */
export function getInbox(agentId: string, unreadOnly?: boolean, limit?: number): Message[] {
  const ids = inboxIndex.get(agentId);
  if (!ids || ids.size === 0) return [];

  let messages: Message[] = [];
  for (const id of ids) {
    const msg = messageStore.get(id);
    if (!msg) continue;
    if (unreadOnly && msg.read) continue;
    messages.push(msg);
  }

  // Newest first
  messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (limit && limit > 0) {
    messages = messages.slice(0, limit);
  }

  return messages;
}

/**
 * Get all messages in a conversation thread, ordered chronologically.
 */
export function getThread(threadId: string): Message[] {
  const ids = threadIndex.get(threadId);
  if (!ids || ids.length === 0) return [];

  const messages: Message[] = [];
  for (const id of ids) {
    const msg = messageStore.get(id);
    if (msg) messages.push(msg);
  }

  // Chronological order
  messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return messages;
}

/**
 * Mark a message as read. Only the recipient can mark their own messages.
 * Returns true if successful, false if message not found or not addressed to this agent.
 */
export function markRead(messageId: string, agentId: string): boolean {
  const msg = messageStore.get(messageId);
  if (!msg) return false;
  if (msg.toAgent !== agentId) return false;
  msg.read = true;
  return true;
}

/**
 * Count unread messages for an agent.
 */
export function getUnreadCount(agentId: string): number {
  const ids = inboxIndex.get(agentId);
  if (!ids) return 0;

  let count = 0;
  for (const id of ids) {
    const msg = messageStore.get(id);
    if (msg && !msg.read) count++;
  }
  return count;
}

// ── MCP Tool Definitions ──

export const messagingTools: Tool[] = [
  {
    name: 'holomesh_send_message',
    description:
      "Send a direct message to another agent on this team's durable HoloMesh store (the same store GET /messages and other processes read). Requires an authenticated caller; do not pass a self-asserted agent id. Optionally include team_id, thread_id, and cursor_at.",
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description: 'Target agent name or ID to send the message to',
        },
        team_id: {
          type: 'string',
          description:
            'Team whose durable message store to write. Defaults to HOLOMESH_TEAM_ID when omitted.',
        },
        content: {
          type: 'string',
          description: 'Message content (plain text)',
        },
        thread_id: {
          type: 'string',
          description: 'Optional thread ID to group messages into a conversation',
        },
        cursor_at: {
          type: 'object',
          description:
            'Optional sender chain-time cursor at send time. Lets receiving agents adjudicate disagreements as cursor-position differences (handle + chain + depth = full agent identity).',
          properties: {
            chain: {
              type: 'string',
              description: 'Stable identifier of the CAEL chain the sender was reading',
            },
            depth: {
              type: 'number',
              description: 'Non-negative integer chain-depth (0-indexed)',
            },
          },
          required: ['chain', 'depth'],
        },
      },
      required: ['to', 'content'],
    },
  },
  {
    name: 'holomesh_inbox',
    description:
      'Check your HoloMesh inbox from the durable team message store. Returns unread count and recent messages addressed to the authenticated caller.',
    inputSchema: {
      type: 'object',
      properties: {
        unread_only: {
          type: 'boolean',
          description: 'Only return unread messages (default: false)',
        },
        team_id: {
          type: 'string',
          description:
            'Team whose durable inbox to read. Defaults to HOLOMESH_TEAM_ID when omitted.',
        },
        limit: {
          type: 'number',
          description: 'Max messages to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'holomesh_read_thread',
    description: 'Read all messages in a conversation thread, ordered chronologically.',
    inputSchema: {
      type: 'object',
      properties: {
        thread_id: {
          type: 'string',
          description: 'The thread ID to read',
        },
        team_id: {
          type: 'string',
          description:
            'Team whose durable thread to read. Defaults to HOLOMESH_TEAM_ID when omitted.',
        },
      },
      required: ['thread_id'],
    },
  },
];

// ── Durable team-store delivery (MCP success path) ──

function strArg(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function memberLabel(member: TeamMember): string {
  return strArg(member.agentName) || strArg((member as TeamMember & { name?: string }).name);
}

/**
 * MCP identity: the HTTP/MCP layer stamps `__authAgentId` after auth.
 * A caller-supplied `_agentId` is never authoritative when a principal is
 * present (impersonation hole). Stdio/local tests may still pass `_agentId`.
 */
function resolveMessagingCaller(
  args: Record<string, unknown>
): { ok: true; agentId: string; agentName: string } | { ok: false; error: string } {
  const principal = authPrincipal(args);
  if (principal) {
    const registered = walletToAgent.get(principal.toLowerCase());
    return {
      ok: true,
      agentId: strArg(registered?.id) || principal,
      agentName: strArg(registered?.name) || principal,
    };
  }
  const agentId = strArg(args._agentId);
  const agentName = strArg(args._agentName);
  if (!agentId || !agentName) {
    return {
      ok: false,
      error:
        'Authentication required. Messaging identity is injected by the MCP server after auth; do not self-assert _agentId.',
    };
  }
  return { ok: true, agentId, agentName };
}

function resolveTeamId(args: Record<string, unknown>): string {
  return strArg(args.team_id) || strArg(process.env.HOLOMESH_TEAM_ID);
}

function canAccessTeamMessages(
  team: Team,
  agentId: string,
  permission: 'messages:write' | 'messages:read'
): boolean {
  if (agentId === 'system') return true;
  if (team.adminRoom === true) return true;
  const member = findTeamMember(team.members, agentId);
  if (!member) return false;
  if (permission === 'messages:read') return true;
  return member.role !== 'guest';
}

function inboxForAgent(
  messages: TeamMessage[],
  agentId: string,
  agentName?: string
): TeamMessage[] {
  return messages.filter((msg) => messageAddressedToAny(msg, [agentId, agentName]));
}

function isUnreadForAgent(msg: TeamMessage, agentId: string): boolean {
  return !(msg.readBy || []).includes(agentId);
}

/**
 * Handle MCP tool calls for messaging.
 * Identity comes from the MCP server stamp (`__authAgentId`) or, on the
 * stdio/local-trust path only, `_agentId`/`_agentName`. Delivery writes the
 * durable team message store — never the process-local Map.
 * Returns null if the tool name is not a messaging tool.
 */
export async function handleMessagingTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (
    name !== 'holomesh_send_message' &&
    name !== 'holomesh_inbox' &&
    name !== 'holomesh_read_thread'
  ) {
    return null;
  }

  const caller = resolveMessagingCaller(args);
  if (!caller.ok) {
    return { error: caller.error };
  }

  const teamId = resolveTeamId(args);
  if (!teamId) {
    return {
      error:
        'team_id is required (or HOLOMESH_TEAM_ID). MCP messaging writes the durable team store, not a process-local Map.',
    };
  }

  switch (name) {
    case 'holomesh_send_message': {
      const to = strArg(args.to);
      const content = strArg(args.content);
      const threadId = strArg(args.thread_id) || undefined;
      const rawCursor = args.cursor_at;

      if (!to || !content) {
        return { error: 'Both "to" and "content" are required.' };
      }

      let cursorAt: MessageCursor | undefined;
      if (rawCursor !== undefined && rawCursor !== null) {
        const parsed = validateCursor(rawCursor);
        if ('error' in parsed) {
          return { error: parsed.error };
        }
        cursorAt = parsed;
      }

      await reloadTeam(teamId);
      const team = teamStore.get(teamId);
      if (!team) {
        return {
          error: `Team not found: ${teamId} — MCP messaging cannot succeed against a process-local Map.`,
        };
      }
      if (!canAccessTeamMessages(team, caller.agentId, 'messages:write')) {
        return { error: 'Not a member with messages:write on this team.' };
      }

      const recipient = findTeamMember(team.members, to);
      const messages = hydrateTeamMessageStore(teamId);
      const msg: TeamMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        teamId,
        fromAgentId: caller.agentId,
        fromAgentName: caller.agentName,
        content,
        messageType: 'dm',
        createdAt: new Date().toISOString(),
        toAgentId: recipient?.agentId,
        toAgentName: recipient ? memberLabel(recipient) || recipient.agentId : to,
        ...(threadId ? { threadId } : {}),
        ...(cursorAt !== undefined ? { cursorAt } : {}),
      };
      messages.push(msg);
      await persistTeamMessages(teamId, messages);
      broadcastToTeam(teamId, {
        type: 'message:new',
        agent: caller.agentName,
        data: { id: msg.id, from: caller.agentName, to: msg.toAgentId, content: content.slice(0, 200) },
      });

      return {
        success: true,
        store: 'team-durable',
        message: msg,
        thread_id: msg.threadId || msg.id,
      };
    }

    case 'holomesh_inbox': {
      const unreadOnly = (args.unread_only as boolean) ?? false;
      const limit = (args.limit as number) || 20;
      await reloadTeam(teamId);
      const team = teamStore.get(teamId);
      if (!team) {
        return { error: `Team not found: ${teamId}` };
      }
      if (!canAccessTeamMessages(team, caller.agentId, 'messages:read')) {
        return { error: 'Not a member with messages:read on this team.' };
      }
      const messages = inboxForAgent(
        hydrateTeamMessageStore(teamId),
        caller.agentId,
        caller.agentName
      );
      const unread = messages.filter((msg) => isUnreadForAgent(msg, caller.agentId));
      const selected = (unreadOnly ? unread : messages).slice(-limit);

      return {
        success: true,
        store: 'team-durable',
        unread_count: unread.length,
        messages: selected,
        total_returned: selected.length,
      };
    }

    case 'holomesh_read_thread': {
      const threadId = strArg(args.thread_id);
      if (!threadId) {
        return { error: '"thread_id" is required.' };
      }
      await reloadTeam(teamId);
      const team = teamStore.get(teamId);
      if (!team) {
        return { error: `Team not found: ${teamId}` };
      }
      if (!canAccessTeamMessages(team, caller.agentId, 'messages:read')) {
        return { error: 'Not a member with messages:read on this team.' };
      }
      const messages = hydrateTeamMessageStore(teamId).filter(
        (msg) => msg.threadId === threadId || msg.id === threadId
      );
      return {
        success: true,
        store: 'team-durable',
        thread_id: threadId,
        messages,
        count: messages.length,
      };
    }

    default:
      return null;
  }
}

// ── HTTP Route Handler ──

/**
 * Handle HTTP routes for the messaging system.
 * Returns null if the URL does not match a messaging route.
 *
 * @param url - Request pathname (e.g. "/api/holomesh/messages")
 * @param method - HTTP method (GET, POST)
 * @param body - Parsed request body (for POST)
 * @param apiKey - The bearer token from Authorization or x-holomesh-key header
 * @param resolveAgent - Callback to look up agent by API key
 */
export async function handleMessagingRoute(
  url: string,
  method: string,
  body: any,
  apiKey: string | undefined,
  resolveAgent: AgentResolver
): Promise<{ status: number; body: any } | null> {
  // Normalize: strip trailing slash, lowercase method
  const pathname = url.split('?')[0].replace(/\/$/, '');
  const upperMethod = method.toUpperCase();
  const query = parseQuery(url);

  // All messaging routes require auth
  if (!pathname.startsWith('/api/holomesh/messages')) return null;

  // Auth gate
  if (!apiKey) {
    return {
      status: 401,
      body: {
        error: 'Authentication required',
        hint: 'Pass Authorization: Bearer <api_key> or x-holomesh-key header',
      },
    };
  }

  const agent = resolveAgent(apiKey);
  if (!agent) {
    return {
      status: 401,
      body: {
        error: 'Invalid API key',
        hint: 'Register at POST /api/holomesh/register to get an API key',
      },
    };
  }

  // POST /api/holomesh/messages — send a message
  if (pathname === '/api/holomesh/messages' && upperMethod === 'POST') {
    const to = body?.to as string;
    const content = body?.content as string;
    const threadId = body?.thread_id as string | undefined;
    // Accept either snake_case `cursor_at` (REST/MCP convention) or
    // camelCase `cursorAt` (already shipped on Message; some clients echo).
    const rawCursor = body?.cursor_at ?? body?.cursorAt;

    if (!to || !content) {
      return {
        status: 400,
        body: { error: 'Both "to" and "content" are required.' },
      };
    }

    let cursorAt: MessageCursor | undefined;
    if (rawCursor !== undefined && rawCursor !== null) {
      const parsed = validateCursor(rawCursor);
      if ('error' in parsed) {
        return {
          status: 400,
          body: { error: parsed.error },
        };
      }
      cursorAt = parsed;
    }

    const msg = sendMessage(agent.id, agent.name, to, content, threadId, cursorAt);
    return {
      status: 201,
      body: {
        success: true,
        message: msg,
        thread_id: msg.threadId || msg.id,
      },
    };
  }

  // GET /api/holomesh/messages/inbox — get inbox
  if (pathname === '/api/holomesh/messages/inbox' && upperMethod === 'GET') {
    const unreadOnly = query.unread_only === 'true';
    const limit = query.limit ? parseInt(query.limit, 10) : 20;
    const messages = getInbox(agent.id, unreadOnly, limit);
    const unreadCount = getUnreadCount(agent.id);

    return {
      status: 200,
      body: {
        success: true,
        unread_count: unreadCount,
        messages,
        total_returned: messages.length,
      },
    };
  }

  // GET /api/holomesh/messages/thread/:threadId — get thread
  const threadMatch = pathname.match(/^\/api\/holomesh\/messages\/thread\/(.+)$/);
  if (threadMatch && upperMethod === 'GET') {
    const threadId = threadMatch[1];
    const messages = getThread(threadId);

    return {
      status: 200,
      body: {
        success: true,
        thread_id: threadId,
        messages,
        count: messages.length,
      },
    };
  }

  // POST /api/holomesh/messages/:id/read — mark as read
  const readMatch = pathname.match(/^\/api\/holomesh\/messages\/([^/]+)\/read$/);
  if (readMatch && upperMethod === 'POST') {
    const messageId = readMatch[1];
    const ok = markRead(messageId, agent.id);

    if (!ok) {
      return {
        status: 404,
        body: {
          error: 'Message not found or not addressed to you',
        },
      };
    }

    return {
      status: 200,
      body: { success: true, message_id: messageId, read: true },
    };
  }

  // No matching messaging route
  return null;
}

// ── Utilities ──

function parseQuery(url: string): Record<string, string> {
  const result: Record<string, string> = {};
  const qIdx = url.indexOf('?');
  if (qIdx === -1) return result;
  const qs = url.slice(qIdx + 1);
  for (const pair of qs.split('&')) {
    const [key, value] = pair.split('=');
    if (key) result[decodeURIComponent(key)] = decodeURIComponent(value || '');
  }
  return result;
}

// ── Test Helpers ──

/**
 * Clear all messages. For testing only.
 */
export function _resetMessageStore(): void {
  messageStore.clear();
  inboxIndex.clear();
  threadIndex.clear();
}
