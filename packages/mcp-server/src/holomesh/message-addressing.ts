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
