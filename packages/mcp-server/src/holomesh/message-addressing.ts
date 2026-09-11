/**
 * Directed-mail addressing for the durable team message store.
 *
 * Keep the handle rules in sync with ai-ecosystem `scripts/room-inbox.mjs`:
 * case-insensitive, strip a trailing `-x402`, and treat an `@name` in the
 * body as a legacy recipient only when the message has no `toAgent*` field.
 *
 * task_1785839509015_lreq: a directed message must remain retrievable by its
 * recipient after later broadcasts. Filtering on messageType alone cannot do
 * that; this helper is what GET `?for=` and MCP inbox use.
 */

export const INBOX_MESSAGE_TYPES = ['dm', 'handoff', 'review-request'] as const;
export const INBOX_MESSAGE_TYPE_SET = new Set<string>(INBOX_MESSAGE_TYPES);

const MENTION_RE = /@([A-Za-z][A-Za-z0-9_-]{1,63})/g;

export function normalizeAgentRef(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-x402$/u, '');
}

export function refsMatch(left: unknown, right: unknown): boolean {
  const a = normalizeAgentRef(left);
  const b = normalizeAgentRef(right);
  return Boolean(a && b && a === b);
}

export function extractMentions(text: unknown): string[] {
  const out = new Set<string>();
  for (const match of String(text || '').matchAll(MENTION_RE)) {
    out.add(normalizeAgentRef(match[1]));
  }
  return [...out];
}

export function firstMention(text: unknown): string {
  return extractMentions(text)[0] || '';
}

export function hasExplicitRecipient(message: {
  toAgentId?: string;
  toAgentName?: string;
}): boolean {
  return Boolean(normalizeAgentRef(message?.toAgentId) || normalizeAgentRef(message?.toAgentName));
}

/**
 * True when `recipient` is this message's addressee.
 *
 * Explicit `toAgentId` / `toAgentName` win. A body `@mention` is only used
 * for legacy posts that never carried a recipient field, so a DM to Alice
 * that happens to mention Bob in the body is not Bob's mail.
 */
export function messageAddressedTo(
  message: {
    toAgentId?: string;
    toAgentName?: string;
    content?: string;
  },
  recipient: string
): boolean {
  const want = normalizeAgentRef(recipient);
  if (!want) return false;
  if (refsMatch(message?.toAgentId, want) || refsMatch(message?.toAgentName, want)) {
    return true;
  }
  if (hasExplicitRecipient(message)) return false;
  return extractMentions(message?.content).includes(want);
}

export function messageAddressedToAny(
  message: {
    toAgentId?: string;
    toAgentName?: string;
    content?: string;
  },
  recipients: Array<string | undefined | null>
): boolean {
  return recipients.some((recipient) => recipient && messageAddressedTo(message, recipient));
}

/**
 * The messages one caller is allowed to read from a team's store.
 *
 * WHY THIS EXISTS. GET /api/holomesh/team/:id/messages authenticates the caller
 * and checks team membership, and then filtered by `?for=` — a value the CALLER
 * supplies. That is a client convenience, never a boundary: omit the parameter
 * and the response was the entire store, including every direct message between
 * every other pair of agents. Any member could read all of it, and so could any
 * key ever minted for the team, including retired test agents. Reported and
 * reproduced 2026-09-10.
 *
 * THE RULE, and it is deliberately narrow:
 *   - A message with no explicit recipient is a room post. Every member reads it.
 *   - A message with an explicit recipient is mail. Only its sender and its
 *     addressee read it.
 * A caller's own `?for=` may NARROW this set, never widen it — see
 * requestedRecipientFor.
 *
 * Sender identity is matched on id and name because the store records both and
 * older rows carry only one.
 */
export function visibleTeamMessagesFor<
  T extends {
    toAgentId?: string;
    toAgentName?: string;
    fromAgentId?: string;
    fromAgentName?: string;
    content?: string;
  },
>(messages: readonly T[], caller: { id?: string; name?: string }): T[] {
  const refs = [caller?.id, caller?.name].filter(Boolean) as string[];
  return messages.filter((message) => {
    if (!hasExplicitRecipient(message)) return true;
    if (messageAddressedToAny(message, refs)) return true;
    return refs.some(
      (ref) =>
        refsMatch(message?.fromAgentId, normalizeAgentRef(ref)) ||
        refsMatch(message?.fromAgentName, normalizeAgentRef(ref))
    );
  });
}

// A NOTE ON `?for=`, because the obvious tightening is the wrong one.
//
// The first version of this fix also restricted the caller's `?for=` parameter
// to the caller's own name, on the reasoning that asking for somebody else's
// mailbox is the defect. It is not — asking is harmless once the set being
// filtered is already authorized. That restriction broke a real behaviour the
// suite has covered since the lreq fix: an agent reading an inbox slice on
// behalf of a colleague, for a DM it had itself sent and may plainly see.
//
// So `for` stays a free-form narrowing filter, applied AFTER
// visibleTeamMessagesFor. Order is the security property; the parameter is not.

/** Newest-first cap used by mobile-brief and other inbox slices. */
export const INBOX_BRIEF_CAP = 10;

type InboxBriefRow = { id?: string };

/**
 * Directed mail first, then other inbox-visible posts, capped.
 *
 * The either/or (`directed.length > 0 ? directed : inboxType`) was the
 * lreq brief bug: one DM hid every later handoff/review from the seat's
 * 10-slot slice. Merge keeps the "DM is not buried" guarantee without
 * blinding the rest of the room.
 */
export function mergeInboxBrief<T extends InboxBriefRow>(
  directed: T[],
  inboxType: T[],
  cap = INBOX_BRIEF_CAP
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const takeNewestFirst = (rows: T[]) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (out.length >= cap) return;
      const row = rows[i];
      if (!row) continue;
      const key = row.id ? `id:${row.id}` : `anon:${i}:${out.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  };
  takeNewestFirst(directed);
  takeNewestFirst(inboxType);
  return out;
}

/**
 * The exclusive choose that blinds a seat after its first DM.
 * Kept only so tests can watch the fault fail.
 */
export function chooseInboxBriefExclusive<T>(directed: T[], inboxType: T[]): T[] {
  return directed.length > 0 ? directed : inboxType;
}

export function findTeamMember<T extends { agentId?: string; agentName?: string; name?: string }>(
  members: T[] | undefined,
  needle: string
): T | undefined {
  const want = normalizeAgentRef(needle);
  if (!want) return undefined;
  return (members || []).find(
    (member) =>
      refsMatch(member.agentId, want) ||
      refsMatch(member.agentName, want) ||
      refsMatch(member.name, want)
  );
}
