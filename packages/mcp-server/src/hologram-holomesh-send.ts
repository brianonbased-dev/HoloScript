/**
 * HoloMesh team messaging for hologram share links (REST).
 */

import { createHash } from 'node:crypto';

const WINDOW_MS = 60_000;
const MAX_SEND_PER_WINDOW = 20;

const rateBuckets = new Map<string, number[]>();

/** Default retry policy for transient HoloMesh send failures. */
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 100;
const DEFAULT_MAX_DELAY_MS = 2_000;

/** Typed error surfaced by hologram send/publish helpers. */
export class HologramSendError extends Error {
  /** True for network faults and HTTP 5xx / 408 / 429; false for 4xx and validation errors. */
  readonly canRetry: boolean;
  /** Underlying HTTP status when applicable, otherwise null. */
  readonly status: number | null;
  /** Attempt index (1-based) on which the error was thrown. */
  readonly attempts: number;
  /** Original cause (network error, parsed error body, etc). */
  readonly cause?: unknown;

  constructor(
    message: string,
    opts: { canRetry: boolean; status: number | null; attempts: number; cause?: unknown },
  ) {
    super(message);
    this.name = 'HologramSendError';
    this.canRetry = opts.canRetry;
    this.status = opts.status;
    this.attempts = opts.attempts;
    this.cause = opts.cause;
  }
}

export interface HologramSendRetryOptions {
  /** Maximum attempts including the first try. Minimum 1. Default 3. */
  maxAttempts?: number;
  /** Base backoff delay in milliseconds. Default 100ms. Actual delay = base * 2^(attempt-1), capped at maxDelayMs. */
  baseDelayMs?: number;
  /** Upper bound on per-attempt backoff delay. Default 2000ms. */
  maxDelayMs?: number;
  /** Custom sleep hook (tests). */
  sleep?: (ms: number) => Promise<void>;
}

function isRetryableStatus(status: number): boolean {
  // 408 Request Timeout, 425 Too Early, 429 Too Many Requests, and any 5xx are transient.
  if (status === 408 || status === 425 || status === 429) return true;
  if (status >= 500 && status < 600) return true;
  return false;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeBackoffMs(attempt: number, baseMs: number, maxMs: number): number {
  const raw = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  return Math.max(0, Math.min(maxMs, raw));
}

/** Clears in-memory send rate buckets (vitest only). */
export function __resetHologramSendRateForTests(): void {
  rateBuckets.clear();
}

export function resolveHolomeshApiBase(): string {
  const explicit = process.env.HOLOMESH_API_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const server = (
    process.env.HOLOSCRIPT_SERVER_URL ||
    process.env.MCP_LOCAL_URL ||
    'https://mcp.holoscript.net'
  ).replace(/\/$/, '');
  return `${server}/api/holomesh`;
}

function rateLimitKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
}

export function allowHologramSend(apiKey: string): boolean {
  const key = `hologram_send:${rateLimitKey(apiKey)}`;
  const now = Date.now();
  const arr = rateBuckets.get(key) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= MAX_SEND_PER_WINDOW) return false;
  pruned.push(now);
  rateBuckets.set(key, pruned);
  return true;
}

export interface TeamMemberRow {
  agentId: string;
  agentName?: string;
  role?: string;
}

async function holomeshFetchJson(
  path: string,
  apiKey: string,
  init?: RequestInit,
): Promise<{ ok: boolean; status: number; json: unknown }> {
  const base = resolveHolomeshApiBase();
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.headers as Record<string, string>),
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

/**
 * Wraps holomeshFetchJson with a bounded retry loop for transient failures.
 *
 * Retryable: network faults (fetch throws), HTTP 408/425/429, HTTP 5xx.
 * Non-retryable: HTTP 4xx (other than above) — surfaced as HologramSendError with canRetry=false.
 *
 * On terminal failure, throws a HologramSendError with canRetry reflecting the LAST-observed
 * fault. Callers can inspect `err.canRetry` to decide whether to surface retry UI / kick off
 * a higher-level backoff, even though the inner loop has already given up on its quota.
 */
async function holomeshFetchJsonWithRetry(
  label: string,
  path: string,
  apiKey: string,
  init: RequestInit | undefined,
  retry: Required<Omit<HologramSendRetryOptions, 'sleep'>> & { sleep: (ms: number) => Promise<void> },
): Promise<{ status: number; json: unknown }> {
  let attempt = 0;
  let lastError: HologramSendError | null = null;

  while (attempt < retry.maxAttempts) {
    attempt += 1;
    try {
      const { ok, status, json } = await holomeshFetchJson(path, apiKey, init);
      if (ok) return { status, json };

      const errBody = json as { error?: string };
      const canRetry = isRetryableStatus(status);
      const msg = errBody.error || `${label}: HTTP ${status}`;
      lastError = new HologramSendError(msg, {
        canRetry,
        status,
        attempts: attempt,
        cause: errBody,
      });
      if (!canRetry) break;
    } catch (err) {
      // Network fault (fetch threw) — always retryable until we exhaust attempts.
      lastError = new HologramSendError(
        `${label}: network error — ${(err as Error).message || String(err)}`,
        { canRetry: true, status: null, attempts: attempt, cause: err },
      );
    }

    if (attempt >= retry.maxAttempts) break;
    const delay = computeBackoffMs(attempt, retry.baseDelayMs, retry.maxDelayMs);
    if (delay > 0) await retry.sleep(delay);
  }

  // If we fell out of the loop, lastError must be set.
  throw (
    lastError ??
    new HologramSendError(`${label}: unknown failure`, {
      canRetry: false,
      status: null,
      attempts: attempt,
    })
  );
}

function normalizeRetry(opts?: HologramSendRetryOptions): Required<Omit<HologramSendRetryOptions, 'sleep'>> & {
  sleep: (ms: number) => Promise<void>;
} {
  const maxAttempts = Math.max(1, Math.floor(opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  const baseDelayMs = Math.max(0, opts?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, opts?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS);
  return {
    maxAttempts,
    baseDelayMs,
    maxDelayMs,
    sleep: opts?.sleep ?? defaultSleep,
  };
}

export async function fetchTeamMemberIds(teamId: string, apiKey: string): Promise<TeamMemberRow[]> {
  const { ok, status, json } = await holomeshFetchJson(`/team/${encodeURIComponent(teamId)}`, apiKey);
  if (!ok) {
    const err = json as { error?: string };
    throw new Error(err.error || `holomesh: GET team failed (${status})`);
  }
  const data = json as { team?: { members?: TeamMemberRow[] } };
  const members = data.team?.members;
  if (!Array.isArray(members)) return [];
  return members;
}

export function assertRecipientOnTeam(
  members: TeamMemberRow[],
  recipientAgentId: string,
): void {
  const hit = members.some((m) => m.agentId === recipientAgentId);
  if (!hit) {
    throw new Error('hologram send: recipientAgentId is not a member of this team');
  }
}

export interface SendHologramMessageInput {
  teamId: string;
  apiKey: string;
  hash: string;
  shareUrl: string;
  recipientAgentId: string;
  note?: string;
  /** Retry policy for transient HoloMesh failures. Omit to use defaults (3 attempts, 100ms base). */
  retry?: HologramSendRetryOptions;
}

export interface PublishHologramFeedInput {
  teamId: string;
  apiKey: string;
  hash: string;
  shareUrl: string;
  /** Retry policy for transient HoloMesh failures. Omit to use defaults (3 attempts, 100ms base). */
  retry?: HologramSendRetryOptions;
}

/** POST /team/:id/feed — public team activity (poster = Bearer identity). */
export async function publishHologramTeamFeed(input: PublishHologramFeedInput): Promise<unknown> {
  const { teamId, apiKey, hash, shareUrl, retry } = input;
  if (!apiKey.trim()) {
    throw new HologramSendError('hologram feed: HOLOMESH_API_KEY is required', {
      canRetry: false,
      status: null,
      attempts: 0,
    });
  }
  if (!hash.trim() || !shareUrl.trim()) {
    throw new HologramSendError('hologram feed: hash and shareUrl are required', {
      canRetry: false,
      status: null,
      attempts: 0,
    });
  }
  if (!allowHologramSend(apiKey)) {
    // Client-side rate limit — not worth retrying on the same bucket.
    throw new HologramSendError('hologram feed: rate limited (max 20 per minute per API key)', {
      canRetry: false,
      status: 429,
      attempts: 0,
    });
  }
  const payload = {
    kind: 'hologram' as const,
    hash: hash.trim(),
    shareUrl: shareUrl.trim(),
  };
  const { json } = await holomeshFetchJsonWithRetry(
    'holomesh: POST feed',
    `/team/${encodeURIComponent(teamId)}/feed`,
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    },
    normalizeRetry(retry),
  );
  return json;
}

export async function sendHologramTeamMessage(input: SendHologramMessageInput): Promise<unknown> {
  const { teamId, apiKey, hash, shareUrl, recipientAgentId, note, retry } = input;
  if (!apiKey.trim()) {
    throw new HologramSendError('hologram send: HOLOMESH_API_KEY is required', {
      canRetry: false,
      status: null,
      attempts: 0,
    });
  }

  if (!allowHologramSend(apiKey)) {
    throw new HologramSendError('hologram send: rate limited (max 20 per minute per API key)', {
      canRetry: false,
      status: 429,
      attempts: 0,
    });
  }

  const members = await fetchTeamMemberIds(teamId, apiKey);
  assertRecipientOnTeam(members, recipientAgentId);

  const payload = {
    kind: 'hologram' as const,
    hash,
    shareUrl,
    recipientAgentId,
    ...(note != null && note !== '' ? { note } : {}),
  };

  const { json } = await holomeshFetchJsonWithRetry(
    'holomesh: POST message',
    `/team/${encodeURIComponent(teamId)}/message`,
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        content: JSON.stringify(payload),
        messageType: 'hologram',
      }),
    },
    normalizeRetry(retry),
  );

  return json;
}
