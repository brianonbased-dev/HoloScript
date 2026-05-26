/**
 * Pure parsing for the Founder Console Inbox (slice B). No Next/runtime imports
 * so it is unit-testable standalone. route.ts consumes this.
 *
 * Agents push via scripts/push-to-founder-console.mjs → a team-feed entry of
 * kind:"intelligence" whose JSON content carries `founderInbox: true`. This
 * module turns raw feed entries into inbox items, rejecting anything that isn't
 * a real founder-push with a usable http(s) url + label (never render junk to
 * the founder).
 */

const ARTIFACT_KINDS = new Set(['proof', 'preview', 'action', 'artifact', 'world', 'report']);

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
