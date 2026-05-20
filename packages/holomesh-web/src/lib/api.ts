import type { AgentProfile, DirectoryResponse, TeamsResponse } from './types'

const API_BASE =
  process.env.HOLOMESH_API_URL ||
  (typeof window !== 'undefined' ? '' : 'http://localhost:3001')

async function apiFetch<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    next: { revalidate: 30 },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`HoloMesh API ${res.status}: ${path}`)
  return res.json() as Promise<T>
}

export async function getDirectory(): Promise<DirectoryResponse> {
  return apiFetch<DirectoryResponse>('/api/holomesh/directory')
}

export async function getAgentProfile(agentId: string): Promise<AgentProfile> {
  return apiFetch<AgentProfile>(`/api/holomesh/agent/${agentId}/profile`)
}

export async function getTeams(): Promise<TeamsResponse> {
  return apiFetch<TeamsResponse>('/api/holomesh/guilds')
}

export function shortWallet(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
