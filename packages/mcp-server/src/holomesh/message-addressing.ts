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

export type TeamMemberLike = { agentId?: string; agentName?: string; name?: string };

/**
 * Decide who a team message is addressed to.
 *
 * An explicit recipient field is the sender's stated intent and passes through
 * untouched. A bare `@word` in the body is much weaker evidence: npm scopes,
 * product names and protocol names look exactly like handles, so only a
 * mention that resolves to a real member of this team earns an `agentId`.
 *
 * A mention that resolves to NOBODY keeps its name as the recipient and loses
 * only the id. The message therefore stays directed — at a name no one owns,
 * so no seat can read it. Clearing the name instead would leave the message
 * with no recipient at all, and `messageAddressedTo` treats that as a legacy
 * post and falls back to the body-mention rule, which would hand the whole
 * team a handoff whose addressee merely failed to resolve. On a failed lookup
 * the audience must narrow, never widen.
 */
export function resolveMessageRecipient<T extends TeamMemberLike>(params: {
  members: T[] | undefined;
  explicitTo?: string;
  content?: string;
  messageType?: string;
}): { toAgentId?: string; toAgentName?: string } {
  const explicitTo = String(params.explicitTo || '').trim();
  const mention =
    !explicitTo && INBOX_MESSAGE_TYPE_SET.has(String(params.messageType || ''))
      ? firstMention(params.content)
      : '';
  const needle = explicitTo || mention;
  if (!needle) return {};

  const member = findTeamMember(params.members, needle);
  if (member) {
    return {
      ...(member.agentId ? { toAgentId: member.agentId } : {}),
      toAgentName: member.agentName || needle,
    };
  }

  // No such member. Keep the needle as the recipient name so the message stays
  // DIRECTED, and drop only the agentId attribution we could not establish.
  //
  // Returning {} here was a regression: a message with no recipient at all has
  // no explicit recipient, and `messageAddressedTo` then falls through to the
  // body-mention rule, which is the same rule every unaddressed legacy post
  // gets. Anything that reads "undirected" as "open to the team" would widen
  // the audience of a handoff whose addressee merely failed to resolve. The
  // safe direction on a failed lookup is narrower, never wider.
  return { toAgentName: needle };
}

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
