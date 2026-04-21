/**
 * HoloMesh team messaging for hologram share links (REST).
 */

import { createHash } from 'node:crypto';

const WINDOW_MS = 60_000;
const MAX_SEND_PER_WINDOW = 20;

const rateBuckets = new Map<string, number[]>();

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
}

export interface PublishHologramFeedInput {
  teamId: string;
  apiKey: string;
  hash: string;
  shareUrl: string;
}

/** POST /team/:id/feed — public team activity (poster = Bearer identity). */
export async function publishHologramTeamFeed(input: PublishHologramFeedInput): Promise<unknown> {
  const { teamId, apiKey, hash, shareUrl } = input;
  if (!apiKey.trim()) throw new Error('hologram feed: HOLOMESH_API_KEY is required');
  if (!hash.trim() || !shareUrl.trim()) {
    throw new Error('hologram feed: hash and shareUrl are required');
  }
  if (!allowHologramSend(apiKey)) {
    throw new Error('hologram feed: rate limited (max 20 per minute per API key)');
  }
  const payload = {
    kind: 'hologram' as const,
    hash: hash.trim(),
    shareUrl: shareUrl.trim(),
  };
  const { ok, status, json } = await holomeshFetchJson(
    `/team/${encodeURIComponent(teamId)}/feed`,
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!ok) {
    const err = json as { error?: string };
    throw new Error(err.error || `holomesh: POST feed failed (${status})`);
  }
  return json;
}

export async function sendHologramTeamMessage(input: SendHologramMessageInput): Promise<unknown> {
  const { teamId, apiKey, hash, shareUrl, recipientAgentId, note } = input;
  if (!apiKey.trim()) throw new Error('hologram send: HOLOMESH_API_KEY is required');

  if (!allowHologramSend(apiKey)) {
    throw new Error('hologram send: rate limited (max 20 per minute per API key)');
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

  const { ok, status, json } = await holomeshFetchJson(
    `/team/${encodeURIComponent(teamId)}/message`,
    apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: JSON.stringify(payload),
        messageType: 'hologram',
      }),
    },
  );

  if (!ok) {
    const err = json as { error?: string };
    throw new Error(err.error || `holomesh: POST message failed (${status})`);
  }

  return json;
}
