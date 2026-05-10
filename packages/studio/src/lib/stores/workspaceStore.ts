'use client';

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProjectKind =
  | 'service'
  | 'frontend'
  | 'data'
  | 'automation'
  | 'agent-backend'
  | 'library'
  | 'spatial'
  | 'storefront'
  | 'unknown';

export interface ProjectDNA {
  kind: ProjectKind;
  confidence: number;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  runtimes: string[];
  repoShape: 'single-package' | 'monorepo' | 'polyglot' | 'unknown';
  riskSignals: string[];
  strengths: string[];
  recommendedProfile: string;
  recommendedMode: 'quick' | 'balanced' | 'deep';
}

export type ConversionTarget =
  | '.holo'
  | '.hs'
  | '.hsplus'
  | 'trait-package'
  | 'mcp-tool'
  | 'compiler-export-target'
  | 'hololand-scene';

export type ConversionAction = 'accepted' | 'dismissed';

export interface ConversionCandidate {
  id: string;
  rank: number;
  sourcePaths: string[];
  detectedPattern: string;
  target: ConversionTarget;
  confidence: number;
  value: number;
  effort: 'quick' | 'moderate' | 'deep';
  risk: 'low' | 'medium' | 'high';
  whyItMatters: string;
  nextAction: string;
}

export type WorkspaceStatus = 'importing' | 'cloning' | 'absorbing' | 'ready' | 'error';

export interface Workspace {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  localPath: string;
  status: WorkspaceStatus;
  dna: ProjectDNA | null;
  absorbedAt: string | null;
  createdAt: string;
  error: string | null;
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalLoc: number;
  } | null;
  conversionCandidates?: ConversionCandidate[];
  conversionManifestPath?: string | null;
  conversionActions?: Record<string, ConversionAction>;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

interface WorkspaceState {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;

  addWorkspace: (ws: Workspace) => void;
  updateWorkspace: (id: string, patch: Partial<Workspace>) => void;
  removeWorkspace: (id: string) => void;
  setActiveWorkspace: (id: string | null) => void;
  getActiveWorkspace: () => Workspace | null;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useWorkspaceStore = create<WorkspaceState>()(
  devtools(
    persist(
      (set, get) => ({
        workspaces: [],
        activeWorkspaceId: null,

        addWorkspace: (ws) => set((s) => ({ workspaces: [...s.workspaces, ws].slice(-20) })),

        updateWorkspace: (id, patch) =>
          set((s) => ({
            workspaces: s.workspaces.map((ws) => (ws.id === id ? { ...ws, ...patch } : ws)),
          })),

        removeWorkspace: (id) =>
          set((s) => ({
            workspaces: s.workspaces.filter((ws) => ws.id !== id),
            activeWorkspaceId: s.activeWorkspaceId === id ? null : s.activeWorkspaceId,
          })),

        setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

        getActiveWorkspace: () => {
          const { workspaces, activeWorkspaceId } = get();
          return workspaces.find((ws) => ws.id === activeWorkspaceId) ?? null;
        },
      }),
      {
        name: 'workspace-store',
        partialize: (state) => ({
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
        }),
      }
    ),
    { name: 'workspace-store' }
  )
);
