import type { AgentProfile, DirectoryResponse, DoneLogResponse, TeamsResponse } from './types';
import {
  buildAgentProfileView,
  getFixtureProfileView,
  getFixtureStaticParams,
} from './profileSurface';

const API_BASE =
  process.env.HOLOMESH_API_URL || (typeof window !== 'undefined' ? '' : 'http://localhost:3001');
const FETCH_TIMEOUT_MS = Number(process.env.HOLOMESH_WEB_FETCH_TIMEOUT_MS ?? 2500);

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      next: { revalidate: 30 },
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error(`HoloMesh API ${res.status}: ${path}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timeout);
  }
}

async function tryApiFetch<T>(path: string): Promise<T | null> {
  try {
    return await apiFetch<T>(path);
  } catch {
    return null;
  }
}

export async function getDirectory(): Promise<DirectoryResponse> {
  return apiFetch<DirectoryResponse>('/api/holomesh/directory');
}

export async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  return apiFetch<AgentProfile>(`/api/holomesh/agent/${agentId}/profile`);
}

export async function getTeams(): Promise<TeamsResponse> {
  return apiFetch<TeamsResponse>('/api/holomesh/guilds');
}

export async function getAgentProfileStaticParams(): Promise<Array<{ agentId: string }>> {
  const data = await tryApiFetch<DirectoryResponse>('/api/holomesh/directory');
  const params =
    data?.agents
      .map((agent) => agent.handle || agent.id)
      .filter((agentId): agentId is string => Boolean(agentId)) ?? [];

  if (params.length > 0) {
    return params.map((agentId) => ({ agentId }));
  }

  return getFixtureStaticParams();
}

export async function getPublicAgentProfile(agentId: string) {
  const directory = await tryApiFetch<DirectoryResponse>('/api/holomesh/directory');
  const profile = await tryApiFetch<AgentProfile>(
    `/api/holomesh/agent/${encodeURIComponent(agentId)}/profile`
  );

  if (profile?.success) {
    const receipts = (await tryApiFetch<DoneLogResponse>(
      `/api/holomesh/receipts/${encodeURIComponent(profile.agent.id)}?limit=20`
    )) ?? {
      success: true,
      agentId: profile.agent.id,
      receipts: [],
      count: 0,
    };

    return buildAgentProfileView(profile, receipts, directory ?? undefined);
  }

  return getFixtureProfileView(agentId);
}

export function shortWallet(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
