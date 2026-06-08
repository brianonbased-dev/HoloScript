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

// ── Founder inbox lifecycle state machine ───────────────────────────────────
//
// pending-vetting → ready → done (P0, founder-gate). Pushes are fire-and-forget
// against an append-only team feed, so the SAME logical item is pushed multiple
// times as it advances (e.g. first pending-vetting, then ready once the Founder
// Gate is GREEN, then done once acted on). The parser collapses entries sharing
// a dedupKey into ONE tile and keeps the most-advanced state (see STATE_RANK +
// collapseByDedupKey below) so the founder never sees a stale duplicate tile.
export type InboxState = 'pending-vetting' | 'ready' | 'done';
export const INBOX_STATES: readonly InboxState[] = ['pending-vetting', 'ready', 'done'] as const;
const STATE_RANK: Record<InboxState, number> = {
  'pending-vetting': 0,
  ready: 1,
  done: 2,
};
function normalizeState(value: unknown, fallback: InboxState = 'pending-vetting'): InboxState {
  return typeof value === 'string' && (INBOX_STATES as readonly string[]).includes(value)
    ? (value as InboxState)
    : fallback;
}

// ── Push side (POST) ────────────────────────────────────────────────────────

export interface InboxPushInput {
  url: string;
  label: string;
  kind?: string;
  taskId?: string | null;
  pushedBy?: string;
  /** Lifecycle state for this push. Defaults to 'pending-vetting'. */
  state?: InboxState;
  /**
   * Idempotency key. Pushes sharing a dedupKey collapse to ONE inbox tile.
   * Defaults to taskId when present, else `${kind}:${url}` so the same artifact
   * pushed twice does not double-render.
   */
  dedupKey?: string | null;
}

export interface InboxPushPayload {
  /** Team feed kind — server accepts "hologram"|"intelligence"; we ride "intelligence". */
  kind: 'intelligence';
  scope: 'team';
  /** JSON string carrying the founderInbox marker + metadata. */
  content: string;
}

/** Derive the default idempotency key for a push (taskId, else kind:url). */
export function defaultDedupKey(kind: string, url: string, taskId?: string | null): string {
  return (typeof taskId === 'string' && taskId) || `${kind}:${url}`;
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
  const state = normalizeState(input.state);
  const dedupKey =
    (typeof input.dedupKey === 'string' && input.dedupKey) ||
    defaultDedupKey(artifactKind, url, input.taskId);
  const content = {
    founderInbox: true,
    v: 1,
    url,
    label: label.slice(0, 200),
    kind: artifactKind,
    taskId: input.taskId ?? null,
    pushedBy: typeof input.pushedBy === 'string' && input.pushedBy ? input.pushedBy : 'agent',
    state,
    dedupKey,
    ts: new Date().toISOString(),
  };
  return { kind: 'intelligence', scope: 'team', content: JSON.stringify(content) };
}

/** Compact vetting summary embedded in a pre-vetted inbox push (G2). */
export interface InboxVettingSummary {
  /** Receipt schema, e.g. 'holoscript.founder-vetting.v1' */
  schema: string;
  /** One-line glance summary for the badge (F.099). */
  glance: string | null;
  /** Stage-2 pre-test status: 'GREEN' when gate passed. */
  tests: string | null;
  /** Reviewer skills that returned PASS (at least one required for a full-gate push). */
  reviewers: string[];
  /** F.095 classes detected (e.g. ['spend', 'governance']). */
  classes: string[];
  /** Express lane: Stage-3 deferred (reversible+time-critical only). */
  express: boolean;
}

export interface FounderInboxItem {
  id: string;
  label: string;
  url: string;
  kind: string;
  taskId: string | null;
  pushedBy: string;
  state: InboxState;
  dedupKey: string;
  ts: string;
  // ── Pre-Vetted Approval Gate fields (G2 — holoscript.founder-vetting.v1) ──────
  /** True when the item passed the Founder Gate (Stage 1–4 all GREEN). */
  preVetted: boolean;
  /** Compact vetting summary for the badge render. Null on unvetted pushes. */
  vetting: InboxVettingSummary | null;
}

interface RawFeedItem {
  id?: string;
  feedId?: string;
  content?: unknown;
  createdAt?: string;
  ts?: string;
}

/**
 * Decide whether `candidate` should supersede `current` for the same dedupKey.
 * Rule: the most-advanced lifecycle state wins (done > ready > pending-vetting);
 * ties broken by newest ts. This makes a later `ready`/`done` push collapse the
 * earlier `pending-vetting` tile rather than rendering a second one.
 */
function supersedes(candidate: FounderInboxItem, current: FounderInboxItem): boolean {
  const rc = STATE_RANK[candidate.state];
  const rr = STATE_RANK[current.state];
  if (rc !== rr) return rc > rr;
  return candidate.ts > current.ts;
}

export function parseFounderInboxEntries(feedItems: unknown, limit = 25): FounderInboxItem[] {
  const arr = Array.isArray(feedItems) ? feedItems : [];
  // Collapse by dedupKey so the same logical artifact pushed multiple times
  // (e.g. pending-vetting → ready → done) renders as ONE tile (P0 idempotency).
  const byKey = new Map<string, FounderInboxItem>();
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
    const taskId = typeof parsed.taskId === 'string' ? parsed.taskId : null;
    const state = normalizeState(parsed.state);
    const dedupKey =
      (typeof parsed.dedupKey === 'string' && parsed.dedupKey) || defaultDedupKey(kind, url, taskId);
    // ── Pre-Vetted Approval Gate fields (G2) ──────────────────────────────────
    const preVetted = parsed.preVetted === true;
    let vetting: InboxVettingSummary | null = null;
    if (preVetted && parsed.vetting && typeof parsed.vetting === 'object') {
      const v = parsed.vetting as Record<string, unknown>;
      vetting = {
        schema: typeof v.schema === 'string' ? v.schema : 'holoscript.founder-vetting.v1',
        glance: typeof v.glance === 'string' ? v.glance : null,
        tests: typeof v.tests === 'string' ? v.tests : null,
        reviewers: Array.isArray(v.reviewers) ? (v.reviewers as unknown[]).filter((r): r is string => typeof r === 'string') : [],
        classes: Array.isArray(v.classes) ? (v.classes as unknown[]).filter((c): c is string => typeof c === 'string') : [],
        express: v.express === true,
      };
    }
    const item: FounderInboxItem = {
      id: String(raw.id ?? raw.feedId ?? `${url}:${ts}`),
      label: label.slice(0, 200),
      url,
      kind,
      taskId,
      pushedBy: typeof parsed.pushedBy === 'string' ? parsed.pushedBy : 'agent',
      state,
      dedupKey,
      ts,
      preVetted,
      vetting,
    };
    const existing = byKey.get(dedupKey);
    if (!existing || supersedes(item, existing)) byKey.set(dedupKey, item);
  }
  const out = [...byKey.values()];
  out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  return out.slice(0, Math.max(1, limit));
}

export function extractFeedArray(body: unknown): unknown {
  if (Array.isArray(body)) return body;
  const b = body as Record<string, unknown> | null;
  return b?.feed ?? b?.items ?? b?.entries ?? [];
}
