/**
 * Server-side Brittney conversation store.
 *
 * The durable persistence layer behind /api/brittney/conversations — chat
 * history previously lived ONLY in browser localStorage (200-message cap,
 * gone on browser close / new device). One conversation row per thread, one
 * message row per turn, all owner-scoped.
 *
 * Uses PostgreSQL via Drizzle when DATABASE_URL is set; falls back to a
 * per-process in-memory store for local dev and tests (same pattern as
 * /api/projects).
 */

import { randomUUID } from 'crypto';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { brittneyConversations, brittneyMessages } from '../../db/schema';

export interface ConversationRecord {
  id: string;
  ownerId: string;
  scope: string;
  title: string;
  messageCount: number;
  lastMessageAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  toolCalls: unknown[];
  timestamp: string | null;
  createdAt: string;
}

export interface MessageInput {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: unknown[];
  /** Client-side capture time (ms epoch) — preserved for offline back-sync. */
  timestamp?: number;
}

const TITLE_MAX_CHARS = 80;

/** Derive a conversation title from its first user message. */
export function deriveConversationTitle(content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= TITLE_MAX_CHARS) return collapsed;
  return `${collapsed.slice(0, TITLE_MAX_CHARS - 1).trimEnd()}…`;
}

// ─── In-memory fallback (local dev / tests without DATABASE_URL) ─────────────

type MemConversation = ConversationRecord;
type MemMessage = MessageRecord;

declare global {
  // eslint-disable-next-line no-var
  var __brittneyConversations__: Map<string, MemConversation> | undefined;
  // eslint-disable-next-line no-var
  var __brittneyMessages__: Map<string, MemMessage[]> | undefined;
}

function memConvos(): Map<string, MemConversation> {
  return (globalThis.__brittneyConversations__ ??= new Map());
}
function memMsgs(): Map<string, MemMessage[]> {
  return (globalThis.__brittneyMessages__ ??= new Map());
}

// ─── Row mapping ──────────────────────────────────────────────────────────────

type DbConversationRow = typeof brittneyConversations.$inferSelect;
type DbMessageRow = typeof brittneyMessages.$inferSelect;

function convoRowToRecord(r: DbConversationRow): ConversationRecord {
  return {
    id: r.id,
    ownerId: r.ownerId,
    scope: r.scope,
    title: r.title,
    messageCount: r.messageCount,
    lastMessageAt: r.lastMessageAt ? r.lastMessageAt.toISOString() : null,
    archivedAt: r.archivedAt ? r.archivedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function messageRowToRecord(r: DbMessageRow): MessageRecord {
  return {
    id: r.id,
    conversationId: r.conversationId,
    seq: r.seq,
    role: r.role === 'user' ? 'user' : 'assistant',
    content: r.content,
    toolCalls: Array.isArray(r.toolCalls) ? (r.toolCalls as unknown[]) : [],
    timestamp: r.clientTimestamp ? r.clientTimestamp.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  };
}

// ─── Store operations (all owner-scoped) ──────────────────────────────────────

export async function listConversations(
  ownerId: string,
  opts: { scope?: string; includeArchived?: boolean } = {}
): Promise<ConversationRecord[]> {
  const db = getDb();
  if (db) {
    const filters = [eq(brittneyConversations.ownerId, ownerId)];
    if (opts.scope) filters.push(eq(brittneyConversations.scope, opts.scope));
    if (!opts.includeArchived) filters.push(isNull(brittneyConversations.archivedAt));
    const rows = await db
      .select()
      .from(brittneyConversations)
      .where(and(...filters))
      .orderBy(desc(brittneyConversations.updatedAt))
      .limit(200);
    return rows.map(convoRowToRecord);
  }

  return [...memConvos().values()]
    .filter(
      (c) =>
        c.ownerId === ownerId &&
        (!opts.scope || c.scope === opts.scope) &&
        (opts.includeArchived || !c.archivedAt)
    )
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function createConversation(
  ownerId: string,
  scope: string,
  title = ''
): Promise<ConversationRecord> {
  const db = getDb();
  if (db) {
    const [row] = await db
      .insert(brittneyConversations)
      .values({ ownerId, scope, title })
      .returning();
    return convoRowToRecord(row);
  }

  const now = new Date().toISOString();
  const record: MemConversation = {
    id: randomUUID(),
    ownerId,
    scope,
    title,
    messageCount: 0,
    lastMessageAt: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  memConvos().set(record.id, record);
  return record;
}

export async function getConversation(
  ownerId: string,
  id: string
): Promise<ConversationRecord | null> {
  const db = getDb();
  if (db) {
    const [row] = await db
      .select()
      .from(brittneyConversations)
      .where(and(eq(brittneyConversations.id, id), eq(brittneyConversations.ownerId, ownerId)))
      .limit(1);
    return row ? convoRowToRecord(row) : null;
  }

  const record = memConvos().get(id);
  return record && record.ownerId === ownerId ? record : null;
}

export async function getMessages(
  ownerId: string,
  conversationId: string,
  opts: { afterSeq?: number } = {}
): Promise<MessageRecord[] | null> {
  const convo = await getConversation(ownerId, conversationId);
  if (!convo) return null;

  const db = getDb();
  if (db) {
    const filters = [eq(brittneyMessages.conversationId, conversationId)];
    if (opts.afterSeq !== undefined) filters.push(gt(brittneyMessages.seq, opts.afterSeq));
    const rows = await db
      .select()
      .from(brittneyMessages)
      .where(and(...filters))
      .orderBy(asc(brittneyMessages.seq));
    return rows.map(messageRowToRecord);
  }

  const all = memMsgs().get(conversationId) ?? [];
  const after = opts.afterSeq;
  return (after === undefined ? all : all.filter((m) => m.seq > after)).slice();
}

export async function updateConversation(
  ownerId: string,
  id: string,
  patch: { title?: string; archived?: boolean }
): Promise<ConversationRecord | null> {
  const db = getDb();
  if (db) {
    const set: Partial<typeof brittneyConversations.$inferInsert> = { updatedAt: new Date() };
    if (patch.title !== undefined) set.title = patch.title;
    if (patch.archived !== undefined) set.archivedAt = patch.archived ? new Date() : null;
    const [row] = await db
      .update(brittneyConversations)
      .set(set)
      .where(and(eq(brittneyConversations.id, id), eq(brittneyConversations.ownerId, ownerId)))
      .returning();
    return row ? convoRowToRecord(row) : null;
  }

  const record = memConvos().get(id);
  if (!record || record.ownerId !== ownerId) return null;
  const updated: MemConversation = {
    ...record,
    title: patch.title !== undefined ? patch.title : record.title,
    archivedAt:
      patch.archived !== undefined
        ? patch.archived
          ? new Date().toISOString()
          : null
        : record.archivedAt,
    updatedAt: new Date().toISOString(),
  };
  memConvos().set(id, updated);
  return updated;
}

export async function deleteConversation(ownerId: string, id: string): Promise<boolean> {
  const db = getDb();
  if (db) {
    // Messages cascade via FK.
    const deleted = await db
      .delete(brittneyConversations)
      .where(and(eq(brittneyConversations.id, id), eq(brittneyConversations.ownerId, ownerId)))
      .returning({ id: brittneyConversations.id });
    return deleted.length > 0;
  }

  const record = memConvos().get(id);
  if (!record || record.ownerId !== ownerId) return false;
  memConvos().delete(id);
  memMsgs().delete(id);
  return true;
}

/**
 * Append messages to a conversation, assigning monotonic seq numbers and
 * updating the conversation's counters. Auto-titles the conversation from its
 * first user message when no title is set.
 *
 * Returns null when the conversation doesn't exist or isn't owned by the
 * caller (indistinguishable, so a non-owner can't probe).
 */
export async function appendMessages(
  ownerId: string,
  conversationId: string,
  inputs: MessageInput[]
): Promise<{ conversation: ConversationRecord; messages: MessageRecord[] } | null> {
  if (inputs.length === 0) {
    const conversation = await getConversation(ownerId, conversationId);
    return conversation ? { conversation, messages: [] } : null;
  }

  const db = getDb();
  if (db) {
    // The unique (conversationId, seq) index turns a concurrent-append race
    // into a 23505; retry with freshly computed seqs rather than interleaving.
    for (let attempt = 1; attempt <= 3; attempt++) {
      const found = await db
        .select()
        .from(brittneyConversations)
        .where(
          and(
            eq(brittneyConversations.id, conversationId),
            eq(brittneyConversations.ownerId, ownerId)
          )
        )
        .limit(1);
      if (!found.length) return null;
      const convo = found[0];

      const [latest] = await db
        .select({ seq: brittneyMessages.seq })
        .from(brittneyMessages)
        .where(eq(brittneyMessages.conversationId, conversationId))
        .orderBy(desc(brittneyMessages.seq))
        .limit(1);
      const baseSeq = latest?.seq ?? 0;

      try {
        const inserted = await db
          .insert(brittneyMessages)
          .values(
            inputs.map((m, i) => ({
              conversationId,
              seq: baseSeq + 1 + i,
              role: m.role,
              content: m.content,
              toolCalls: m.toolCalls ?? [],
              clientTimestamp: m.timestamp ? new Date(m.timestamp) : null,
            }))
          )
          .returning();

        const firstUser = inputs.find((m) => m.role === 'user');
        const now = new Date();
        const [updated] = await db
          .update(brittneyConversations)
          .set({
            messageCount: convo.messageCount + inputs.length,
            lastMessageAt: now,
            updatedAt: now,
            ...(convo.title === '' && firstUser
              ? { title: deriveConversationTitle(firstUser.content) }
              : {}),
          })
          .where(eq(brittneyConversations.id, conversationId))
          .returning();

        return {
          conversation: convoRowToRecord(updated),
          messages: inserted.map(messageRowToRecord),
        };
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === '23505' && attempt < 3) continue;
        throw err;
      }
    }
    throw new Error('Could not append messages after 3 attempts (seq contention)');
  }

  const record = memConvos().get(conversationId);
  if (!record || record.ownerId !== ownerId) return null;

  const list = memMsgs().get(conversationId) ?? [];
  const baseSeq = list.length ? list[list.length - 1].seq : 0;
  const nowIso = new Date().toISOString();
  const appended: MemMessage[] = inputs.map((m, i) => ({
    id: randomUUID(),
    conversationId,
    seq: baseSeq + 1 + i,
    role: m.role,
    content: m.content,
    toolCalls: m.toolCalls ?? [],
    timestamp: m.timestamp ? new Date(m.timestamp).toISOString() : null,
    createdAt: nowIso,
  }));
  memMsgs().set(conversationId, [...list, ...appended]);

  const firstUser = inputs.find((m) => m.role === 'user');
  const updated: MemConversation = {
    ...record,
    messageCount: record.messageCount + inputs.length,
    lastMessageAt: nowIso,
    updatedAt: nowIso,
    title:
      record.title === '' && firstUser ? deriveConversationTitle(firstUser.content) : record.title,
  };
  memConvos().set(conversationId, updated);
  return { conversation: updated, messages: appended };
}
