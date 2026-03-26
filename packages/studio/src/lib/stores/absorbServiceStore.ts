'use client';

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import type { Tier } from '@/lib/absorb/pricing';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AbsorbProject {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  localPath: string | null;
  status: string;
  lastAbsorbedAt: string | null;
  totalSpentCents: number;
  totalOperations: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreditTransaction {
  id: string;
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface MoltbookAgent {
  id: string;
  projectId: string;
  agentName: string;
  config: { pillars?: string[]; submolts?: string[]; searchTopics?: string[]; persona?: string };
  heartbeatEnabled: boolean;
  lastHeartbeat: string | null;
  totalPostsGenerated: number;
  totalCommentsGenerated: number;
  totalLlmSpentCents: number;
  createdAt: string;
  moltbookApiKey: string; // masked in responses
}

export interface MoltbookSummary {
  totalAgents: number;
  activeAgents: number;
  totalPosts: number;
  totalComments: number;
  totalLlmSpentCents: number;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

export type QualityTier = 'low' | 'medium' | 'high' | 'ultra';

interface AbsorbServiceState {
  creditBalance: number;
  tier: Tier;
  qualityTier: QualityTier;
  projects: AbsorbProject[];
  activeProjectId: string | null;
  usageHistory: CreditTransaction[];
  moltbookAgents: MoltbookAgent[];
  moltbookSummary: MoltbookSummary | null;
  loading: boolean;
  error: string | null;

  fetchBalance: () => Promise<void>;
  fetchProjects: () => Promise<void>;
  fetchUsageHistory: (limit?: number) => Promise<void>;
  createProject: (name: string, sourceType: string, sourceUrl?: string) => Promise<AbsorbProject | null>;
  deleteProject: (id: string) => Promise<boolean>;
  setActiveProject: (id: string | null) => void;
  getActiveProject: () => AbsorbProject | null;
  setQualityTier: (tier: QualityTier) => void;
  setError: (error: string | null) => void;

  fetchMoltbookAgents: () => Promise<void>;
  fetchMoltbookSummary: () => Promise<void>;
  createMoltbookAgent: (projectId: string, agentName: string, moltbookApiKey: string, config?: Record<string, any>) => Promise<MoltbookAgent | null>;
  updateMoltbookAgent: (id: string, updates: { heartbeatEnabled?: boolean; config?: Record<string, any>; agentName?: string }) => Promise<MoltbookAgent | null>;
  deleteMoltbookAgent: (id: string) => Promise<boolean>;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAbsorbServiceStore = create<AbsorbServiceState>()(
  devtools(
    persist(
      (set, get) => ({
        creditBalance: 0,
        tier: 'free' as Tier,
        qualityTier: 'medium' as QualityTier,
        projects: [],
        activeProjectId: null,
        usageHistory: [],
        moltbookAgents: [],
        moltbookSummary: null,
        loading: false,
        error: null,

        fetchBalance: async () => {
          try {
            const res = await fetch('/api/absorb/credits');
            if (!res.ok) return;
            const data = await res.json();
            set({ creditBalance: data.balance, tier: data.tier });
          } catch {}
        },

        fetchProjects: async () => {
          set({ loading: true });
          try {
            const res = await fetch('/api/absorb/projects');
            if (!res.ok) throw new Error('Failed to fetch projects');
            const data = await res.json();
            set({ projects: data.projects, loading: false, error: null });
          } catch (err) {
            set({ loading: false, error: err instanceof Error ? err.message : 'Failed' });
          }
        },

        fetchUsageHistory: async (limit = 50) => {
          try {
            const res = await fetch(`/api/absorb/credits/history?limit=${limit}`);
            if (!res.ok) return;
            const data = await res.json();
            set({ usageHistory: data.transactions });
          } catch {}
        },

        createProject: async (name, sourceType, sourceUrl) => {
          try {
            const res = await fetch('/api/absorb/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, sourceType, sourceUrl }),
            });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              set({ error: data.error || 'Failed to create project' });
              return null;
            }
            const data = await res.json();
            set((s) => ({ projects: [data.project, ...s.projects], error: null }));
            return data.project;
          } catch (err) {
            set({ error: err instanceof Error ? err.message : 'Failed' });
            return null;
          }
        },

        deleteProject: async (id) => {
          try {
            const res = await fetch(`/api/absorb/projects/${id}`, { method: 'DELETE' });
            if (!res.ok) return false;
            set((s) => ({
              projects: s.projects.filter((p) => p.id !== id),
              activeProjectId: s.activeProjectId === id ? null : s.activeProjectId,
            }));
            return true;
          } catch {
            return false;
          }
        },

        setActiveProject: (id) => set({ activeProjectId: id }),

        getActiveProject: () => {
          const { projects, activeProjectId } = get();
          return projects.find((p) => p.id === activeProjectId) ?? null;
        },

        setQualityTier: (qualityTier) => set({ qualityTier }),

        setError: (error) => set({ error }),

        fetchMoltbookAgents: async () => {
          try {
            const res = await fetch('/api/absorb/moltbook');
            if (!res.ok) return;
            const data = await res.json();
            set({ moltbookAgents: data.agents });
          } catch {}
        },

        fetchMoltbookSummary: async () => {
          try {
            const res = await fetch('/api/absorb/moltbook/summary');
            if (!res.ok) return;
            const data = await res.json();
            set({ moltbookSummary: data });
          } catch {}
        },

        createMoltbookAgent: async (projectId, agentName, moltbookApiKey, config = {}) => {
          try {
            const res = await fetch('/api/absorb/moltbook', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ projectId, agentName, moltbookApiKey, config }),
            });
            if (!res.ok) throw new Error('Failed to create agent');
            const data = await res.json();
            set((s) => ({ moltbookAgents: [data.agent, ...s.moltbookAgents] }));
            return data.agent;
          } catch (err) {
            set({ error: err instanceof Error ? err.message : 'Create agent failed' });
            return null;
          }
        },

        updateMoltbookAgent: async (id, updates) => {
          try {
            const res = await fetch(`/api/absorb/moltbook/${id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error('Failed to update agent');
            const data = await res.json();
            set((s) => ({
              moltbookAgents: s.moltbookAgents.map((a) => (a.id === id ? data.agent : a)),
            }));
            return data.agent;
          } catch (err) {
            set({ error: err instanceof Error ? err.message : 'Update agent failed' });
            return null;
          }
        },

        deleteMoltbookAgent: async (id) => {
          try {
            const res = await fetch(`/api/absorb/moltbook/${id}`, { method: 'DELETE' });
            if (!res.ok) return false;
            set((s) => ({
              moltbookAgents: s.moltbookAgents.filter((a) => a.id !== id),
            }));
            return true;
          } catch {
            return false;
          }
        },
      }),
      {
        name: 'absorb-service-store',
        partialize: (state) => ({
          activeProjectId: state.activeProjectId,
          tier: state.tier,
          qualityTier: state.qualityTier,
        }),
      },
    ),
    { name: 'absorb-service-store' },
  ),
);
