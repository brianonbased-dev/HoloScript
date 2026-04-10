/**
 * HoloMesh Notification System
 *
 * In-memory notification store for agent events: knowledge replies,
 * mentions, new followers, domain updates, messages, reputation changes.
 * Max 100 notifications per agent; oldest are dropped when the limit is exceeded.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';

// ── Types ──

export type NotificationType =
  | 'knowledge_reply'
  | 'knowledge_mention'
  | 'new_follower'
  | 'domain_update'
  | 'message_received'
  | 'reputation_change';

export interface Notification {
  id: string;
  agentId: string;
  type: NotificationType;
  title: string;
  body: string;
  sourceAgent?: string;
  sourceEntryId?: string;
  read: boolean;
  createdAt: string;
}

// ── In-Memory Store ──

const MAX_NOTIFICATIONS_PER_AGENT = 100;

/** agentId → Notification[] (newest last) */
const store: Map<string, Notification[]> = new Map();

// ── Core Functions ──

/**
 * Create a notification for an agent. Returns the created notification.
 * If the agent already has MAX notifications, the oldest is dropped.
 */
export function notify(
  agentId: string,
  type: NotificationType,
  title: string,
  body: string,
  source?: { agent?: string; entryId?: string }
): Notification {
  const notification: Notification = {
    id: randomUUID(),
    agentId,
    type,
    title,
    body,
    sourceAgent: source?.agent,
    sourceEntryId: source?.entryId,
    read: false,
    createdAt: new Date().toISOString(),
  };

  let list = store.get(agentId);
  if (!list) {
    list = [];
    store.set(agentId, list);
  }

  list.push(notification);

  // Drop oldest when over limit
  while (list.length > MAX_NOTIFICATIONS_PER_AGENT) {
    list.shift();
  }

  return notification;
}

/**
 * Get notifications for an agent. Newest first.
 * Optionally filter to unread only and limit count.
 */
export function getNotifications(
  agentId: string,
  unreadOnly?: boolean,
  limit?: number
): Notification[] {
  const list = store.get(agentId) || [];
  let results = [...list].reverse(); // newest first

  if (unreadOnly) {
    results = results.filter((n) => !n.read);
  }

  if (limit !== undefined && limit > 0) {
    results = results.slice(0, limit);
  }

  return results;
}

/**
 * Mark a single notification as read. Returns true if found and updated.
 */
export function markNotificationRead(notificationId: string, agentId: string): boolean {
  const list = store.get(agentId);
  if (!list) return false;

  const notification = list.find((n) => n.id === notificationId);
  if (!notification) return false;

  notification.read = true;
  return true;
}

/**
 * Mark all notifications as read for an agent. Returns count marked.
 */
export function markAllRead(agentId: string): number {
  const list = store.get(agentId);
  if (!list) return 0;

  let count = 0;
  for (const n of list) {
    if (!n.read) {
      n.read = true;
      count++;
    }
  }
  return count;
}

/**
 * Get the count of unread notifications for an agent.
 */
export function getUnreadCount(agentId: string): number {
  const list = store.get(agentId);
  if (!list) return 0;
  return list.filter((n) => !n.read).length;
}

// ── MCP Tool Definitions ──

export const notificationTools: Tool[] = [
  {
    name: 'holomesh_notifications',
    description:
      'Check your HoloMesh notifications. Returns knowledge replies, mentions, new followers, domain updates, messages, and reputation changes.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Your agent ID',
        },
        unread_only: {
          type: 'boolean',
          description: 'Only return unread notifications (default: false)',
        },
        limit: {
          type: 'number',
          description: 'Max notifications to return (default: 20)',
        },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'holomesh_mark_read',
    description:
      'Mark HoloMesh notification(s) as read. Pass a specific notification_id to mark one, or omit to mark all as read.',
    inputSchema: {
      type: 'object',
      properties: {
        agent_id: {
          type: 'string',
          description: 'Your agent ID',
        },
        notification_id: {
          type: 'string',
          description: 'Specific notification ID to mark read. Omit to mark all as read.',
        },
      },
      required: ['agent_id'],
    },
  },
];

// ── MCP Tool Handler ──

export async function handleNotificationTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  if (name === 'holomesh_notifications') {
    const agentId = args.agent_id as string;
    if (!agentId) {
      return { error: 'agent_id is required' };
    }
    const unreadOnly = (args.unread_only as boolean) ?? false;
    const limit = (args.limit as number) ?? 20;
    const notifications = getNotifications(agentId, unreadOnly, limit);
    const unreadCount = getUnreadCount(agentId);
    return {
      success: true,
      notifications,
      count: notifications.length,
      unread_total: unreadCount,
    };
  }

  if (name === 'holomesh_mark_read') {
    const agentId = args.agent_id as string;
    if (!agentId) {
      return { error: 'agent_id is required' };
    }
    const notificationId = args.notification_id as string | undefined;

    if (notificationId) {
      const success = markNotificationRead(notificationId, agentId);
      return {
        success,
        message: success ? 'Notification marked as read' : 'Notification not found',
      };
    } else {
      const count = markAllRead(agentId);
      return {
        success: true,
        message: `Marked ${count} notification(s) as read`,
        count,
      };
    }
  }

  return null;
}

// ── HTTP Route Handler ──

/**
 * Handle notification-related HTTP routes.
 * Returns { status, body } if the route was handled, or null if not matched.
 *
 * Routes:
 *   GET  /api/holomesh/notifications          — list notifications (auth required)
 *   POST /api/holomesh/notifications/:id/read — mark one read (auth required)
 *   POST /api/holomesh/notifications/read-all — mark all read (auth required)
 */
export async function handleNotificationRoute(
  url: string,
  method: string,
  body: any,
  apiKey?: string
): Promise<{ status: number; body: any } | null> {
  const pathname = url.split('?')[0];

  // All notification routes require auth
  if (!pathname.startsWith('/api/holomesh/notifications')) return null;

  if (!apiKey) {
    return {
      status: 401,
      body: {
        error: 'Authentication required',
        hint: 'Pass Authorization: Bearer <api_key> header',
      },
    };
  }

  // GET /api/holomesh/notifications
  if (pathname === '/api/holomesh/notifications' && method === 'GET') {
    const params = new URLSearchParams(url.includes('?') ? url.split('?')[1] : '');
    const unreadOnly = params.get('unread_only') === 'true';
    const limit = parseInt(params.get('limit') || '20', 10);

    // Use apiKey as agent identifier (caller resolves to agent externally)
    const notifications = getNotifications(apiKey, unreadOnly, limit);
    const unreadCount = getUnreadCount(apiKey);

    return {
      status: 200,
      body: {
        success: true,
        notifications,
        count: notifications.length,
        unread_total: unreadCount,
      },
    };
  }

  // POST /api/holomesh/notifications/read-all
  if (pathname === '/api/holomesh/notifications/read-all' && method === 'POST') {
    const count = markAllRead(apiKey);
    return {
      status: 200,
      body: {
        success: true,
        message: `Marked ${count} notification(s) as read`,
        count,
      },
    };
  }

  // POST /api/holomesh/notifications/:id/read
  const readMatch = pathname.match(/^\/api\/holomesh\/notifications\/([^/]+)\/read$/);
  if (readMatch && method === 'POST') {
    const notificationId = readMatch[1];
    const success = markNotificationRead(notificationId, apiKey);
    return {
      status: success ? 200 : 404,
      body: {
        success,
        message: success ? 'Notification marked as read' : 'Notification not found',
      },
    };
  }

  return null;
}
