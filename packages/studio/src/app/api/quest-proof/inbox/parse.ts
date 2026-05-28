/**
 * Pure parsing for the Founder Console Inbox (slice B). No Next/runtime imports
 * so it is unit-testable standalone. route.ts consumes this.
 *
 * Agents push via scripts/push-to-founder-console.mjs → POST /api/quest-proof/inbox
 * → the Studio route proxies it to the team feed as kind:"intelligence" with a
 * `founderInbox: true` marker. GET /api/quest-proof/inbox reads the feed back and
 * filters on that marker. No local file storage — the team feed IS the store
 * (server-side + Quest-reachable).
 *
 * buildInboxPayload() is the pure constructor for a push; parseFounderInboxEntries()
 * is the pure parser for the GET side.
 */

const ARTIFACT_KINDS = new Set(['proof', 'preview', 'action', 'artifact', 'world', 'report']);

// ── Push side (POST) ────────────────────────────────────────────────────────

export interface InboxPushInput {
  url: string;
  label: string;
  kind?: string;
  taskId?: string | null;
  pushedBy?: string;
}

export interface InboxPushPayload {
  /** Team feed kind — server accepts "hologram"|"intelligence"; we ride "intelligence". */
  kind: 'intelligence';
  scope: 'team';
  /** JSON string carrying the founderInbox marker + metadata. */
  content: string;
}

/**
 * Build the team-feed POST body for a founder-console push.
 * Throws if url is not http(s) or label is empty — never push junk to the founder.
 */
export function buildInboxPayload(input: InboxPushInput): InboxPushPayload {
  const url = typeof input.url === 'string' ? input.url.trim() : '';
  const label = typeof input.label === 'string' ? input.label.trim() : '';
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('push-to-founder-console: --url must be an http(s) URL the founder can open on his headset');
  }
  if (!label) {
    throw new Error('push-to-founder-console: --label is required (what is this artifact?)');
  }
  const artifactKind =
    typeof input.kind === 'string' && ARTIFACT_KINDS.has(input.kind) ? input.kind : 'artifact';
  const content = {
    founderInbox: true,
    v: 1,
    url,
    label: label.slice(0, 200),
    kind: artifactKind,
    taskId: input.taskId ?? null,
    pushedBy: typeof input.pushedBy === 'string' && input.pushedBy ? input.pushedBy : 'agent',
    ts: new Date().toISOString(),
  };
  return { kind: 'intelligence', scope: 'team', content: JSON.stringify(content) };
}

export interface FounderInboxItem {
  id: string;
  label: string;
  url: string;
  kind: string;
  taskId: string | null;
  pushedBy: string;
  ts: string;
}

interface RawFeedItem {
  id?: string;
  feedId?: string;
  content?: unknown;
  createdAt?: string;
  ts?: string;
}

export function parseFounderInboxEntries(feedItems: unknown, limit = 25): FounderInboxItem[] {
  const arr = Array.isArray(feedItems) ? feedItems : [];
  const out: FounderInboxItem[] = [];
  for (const raw of arr as RawFeedItem[]) {
    if (!raw || typeof raw !== 'object') continue;
    let parsed: Record<string, unknown> | null;
    try {
      parsed =
        typeof raw.content === 'string'
          ? (JSON.parse(raw.content) as Record<string, unknown>)
          : (raw.content as Record<string, unknown>);
    } catch {
      continue;
    }
    if (!parsed || parsed.founderInbox !== true) continue;
    const url = typeof parsed.url === 'string' ? parsed.url : '';
    const label = typeof parsed.label === 'string' ? parsed.label.trim() : '';
    if (!/^https?:\/\//i.test(url) || !label) continue;
    const kind = typeof parsed.kind === 'string' && ARTIFACT_KINDS.has(parsed.kind) ? parsed.kind : 'artifact';
    const ts = (typeof parsed.ts === 'string' && parsed.ts) || raw.ts || raw.createdAt || new Date(0).toISOString();
    out.push({
      id: String(raw.id ?? raw.feedId ?? `${url}:${ts}`),
      label: label.slice(0, 200),
      url,
      kind,
      taskId: typeof parsed.taskId === 'string' ? parsed.taskId : null,
      pushedBy: typeof parsed.pushedBy === 'string' ? parsed.pushedBy : 'agent',
      ts,
    });
  }
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out.slice(0, Math.max(1, limit));
}

export function extractFeedArray(body: unknown): unknown {
  if (Array.isArray(body)) return body;
  const b = body as Record<string, unknown> | null;
  return b?.feed ?? b?.items ?? b?.entries ?? [];
}
