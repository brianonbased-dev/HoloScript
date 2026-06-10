/**
 * Client-side fetch wrappers for /api/brittney/conversations.
 *
 * Every call is fail-soft (returns null on any error) so chat keeps working
 * from localStorage when the user is signed out, offline, or the deployment
 * has no DATABASE_URL — server persistence is an upgrade, never a dependency.
 */

export interface ConversationSummary {
  id: string;
  scope: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServerChatMessage {
  id: string;
  conversationId: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: unknown[];
  timestamp: string | null;
  createdAt: string;
}

export interface MessageUpload {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: unknown[];
  timestamp?: number;
}

async function jsonFetch<T>(input: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(input, init);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function listConversations(
  scope?: string,
  opts: { includeArchived?: boolean } = {}
): Promise<ConversationSummary[] | null> {
  const params = new URLSearchParams();
  if (scope) params.set('scope', scope);
  if (opts.includeArchived) params.set('includeArchived', '1');
  const qs = params.toString();
  const payload = await jsonFetch<{ conversations: ConversationSummary[] }>(
    `/api/brittney/conversations${qs ? `?${qs}` : ''}`
  );
  return payload?.conversations ?? null;
}

export async function createConversation(
  scope: string,
  title = ''
): Promise<ConversationSummary | null> {
  const payload = await jsonFetch<{ conversation: ConversationSummary }>(
    '/api/brittney/conversations',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope, title }),
    }
  );
  return payload?.conversation ?? null;
}

export async function fetchConversation(
  id: string,
  opts: { afterSeq?: number } = {}
): Promise<{ conversation: ConversationSummary; messages: ServerChatMessage[] } | null> {
  const params = new URLSearchParams();
  if (opts.afterSeq !== undefined) params.set('afterSeq', String(opts.afterSeq));
  const qs = params.toString();
  return jsonFetch(`/api/brittney/conversations/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`);
}

export async function appendConversationMessages(
  id: string,
  messages: MessageUpload[]
): Promise<{ conversation: ConversationSummary; messages: ServerChatMessage[] } | null> {
  if (messages.length === 0) return null;
  return jsonFetch(`/api/brittney/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  });
}

export async function patchConversation(
  id: string,
  patch: { title?: string; archived?: boolean }
): Promise<ConversationSummary | null> {
  const payload = await jsonFetch<{ conversation: ConversationSummary }>(
    `/api/brittney/conversations/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }
  );
  return payload?.conversation ?? null;
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/brittney/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch {
    return false;
  }
}
