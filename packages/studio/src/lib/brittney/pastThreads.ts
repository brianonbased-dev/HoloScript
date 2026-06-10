/**
 * Past-conversation context for Brittney — D.053 relational memory, step 1.
 *
 * Surfaces compact summaries of the user's OTHER conversation threads (same
 * scope only — never cross-workspace) so Brittney has continuity across
 * threads instead of starting blind every conversation. Read path only: the
 * durable rows come from the server-side write-through in
 * app/api/brittney/route.ts and the client sync in useUnifiedBrittneyHistory.
 *
 * Fail-soft contract (mirrors githubContext.ts): any error returns the last
 * cached value or []. Never blocks or throws into the chat. Bounded work:
 * at most MAX_PAST_THREADS + 1 threads summarized, tail-only message fetch
 * for the EXCERPT_THREADS most recent, everything clipped.
 */

import { listConversations, getMessages } from './conversationStore';

export interface PastThreadSnippet {
  id: string;
  title: string;
  lastMessageAt: string | null;
  messageCount: number;
  /** Up to 2 role-prefixed, clipped excerpts (most recent threads only). */
  excerpts: string[];
}

/** Threads surfaced in the prompt block (after excluding the active one). */
export const MAX_PAST_THREADS = 5;
/** Only the most recent threads get message excerpts (extra store reads). */
const EXCERPT_THREADS = 2;
/** Tail window fetched per excerpted thread (seq is contiguous from 1). */
const TAIL_MESSAGES = 4;
/** Per-excerpt clip — keeps the whole block inside the prompt budget. */
const MAX_EXCERPT_CHARS = 200;

const THREADS_TTL_MS = 5 * 60 * 1000;
// Bound the cache: keys are owner:scope (scope is client-chosen text), so an
// unbounded Map would grow with every scope string a caller invents.
const MAX_CACHE_ENTRIES = 500;
const threadsCache = new Map<string, { snippets: PastThreadSnippet[]; at: number }>();

function cacheSet(key: string, value: { snippets: PastThreadSnippet[]; at: number }): void {
  if (threadsCache.size >= MAX_CACHE_ENTRIES && !threadsCache.has(key)) {
    // Evict the oldest insertion (Map preserves insertion order).
    const oldest = threadsCache.keys().next().value;
    if (oldest !== undefined) threadsCache.delete(oldest);
  }
  threadsCache.set(key, value);
}

function clipExcerpt(role: string, content: string): string {
  const collapsed = content.replace(/\s+/g, ' ').trim();
  const clipped =
    collapsed.length > MAX_EXCERPT_CHARS ? `${collapsed.slice(0, MAX_EXCERPT_CHARS)}…` : collapsed;
  return `${role === 'user' ? 'user' : 'brittney'}: "${clipped}"`;
}

/**
 * Fetch summaries of the owner's recent threads in `scope`, newest first,
 * excluding `excludeConversationId` (the active thread — its history is
 * already in the chat). Cached per owner+scope for THREADS_TTL_MS; the
 * exclusion filter is applied per call so switching threads inside the TTL
 * window still excludes the right one.
 */
export async function fetchPastThreads(
  ownerId: string,
  scope: string,
  excludeConversationId?: string | null
): Promise<PastThreadSnippet[]> {
  if (!ownerId || !scope) return [];
  const cacheKey = `${ownerId}:${scope}`;
  const cached = threadsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < THREADS_TTL_MS) {
    return filterAndCap(cached.snippets, excludeConversationId);
  }

  try {
    const conversations = await listConversations(ownerId, { scope });
    // +1 headroom so excluding the active thread still yields MAX_PAST_THREADS.
    const candidates = conversations.filter((c) => c.messageCount > 0).slice(0, MAX_PAST_THREADS + 1);

    const snippets: PastThreadSnippet[] = await Promise.all(
      candidates.map(async (convo, index) => {
        let excerpts: string[] = [];
        if (index < EXCERPT_THREADS) {
          const afterSeq = Math.max(0, convo.messageCount - TAIL_MESSAGES);
          const tail = (await getMessages(ownerId, convo.id, { afterSeq })) ?? [];
          const lastUser = [...tail].reverse().find((m) => m.role === 'user');
          const lastAssistant = [...tail].reverse().find((m) => m.role === 'assistant');
          excerpts = [
            ...(lastUser ? [clipExcerpt('user', lastUser.content)] : []),
            ...(lastAssistant ? [clipExcerpt('assistant', lastAssistant.content)] : []),
          ];
        }
        return {
          id: convo.id,
          title: convo.title,
          lastMessageAt: convo.lastMessageAt,
          messageCount: convo.messageCount,
          excerpts,
        };
      })
    );

    cacheSet(cacheKey, { snippets, at: Date.now() });
    return filterAndCap(snippets, excludeConversationId);
  } catch {
    return filterAndCap(cached?.snippets ?? [], excludeConversationId);
  }
}

function filterAndCap(
  snippets: PastThreadSnippet[],
  excludeConversationId?: string | null
): PastThreadSnippet[] {
  return snippets
    .filter((s) => !excludeConversationId || s.id !== excludeConversationId)
    .slice(0, MAX_PAST_THREADS);
}
