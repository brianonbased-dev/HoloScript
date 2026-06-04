'use client';

/**
 * ProjectManager — Project file management, save/load, recent projects.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  FolderOpen,
  Plus,
  Clock,
  FileText,
  Download,
  Upload,
  Settings,
  Star,
  Trash2,
  Loader2,
  LogIn,
} from 'lucide-react';
import { signIn } from 'next-auth/react';
import { formatBytes } from '@holoscript/std';
import { useProjects, type ProjectSummary } from '@/hooks/useProjects';

export interface HoloProject {
  id: string;
  name: string;
  path: string;
  lastModified: number;
  scenes: string[];
  version: string;
  starred: boolean;
  size: number; // bytes
}

/**
 * Map a server-backed ProjectSummary to the view-model the UI renders.
 * Display-only fields (scenes/version/size/starred) live in metadata and
 * default sensibly; persistence is keyed on the canonical uuid `id`.
 */
function toHoloProject(p: ProjectSummary): HoloProject {
  const meta = p.metadata ?? {};
  return {
    id: p.id,
    name: p.name,
    path: `/projects/${p.slug}`,
    lastModified: new Date(p.updatedAt).getTime(),
    scenes: Array.isArray(meta.scenes) ? (meta.scenes as string[]) : ['main.holo'],
    version: typeof meta.version === 'string' ? meta.version : '0.1.0',
    starred: meta.starred === true,
    size: typeof meta.size === 'number' ? meta.size : 0,
  };
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

export function ProjectManager({ onOpen }: { onOpen?: (project: HoloProject) => void }) {
  const {
    projects: serverProjects,
    isLoading,
    isAuthenticated,
    saveProject,
    deleteProject: deleteServerProject,
  } = useProjects();
  const [view, setView] = useState<'recent' | 'new'>('recent');
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const projects = useMemo(() => serverProjects.map(toHoloProject), [serverProjects]);

  const toggleStar = useCallback(
    async (id: string) => {
      const current = serverProjects.find((p) => p.id === id);
      if (!current) return;
      const starred = current.metadata?.starred === true;
      await saveProject({
        id: current.id,
        name: current.name,
        slug: current.slug,
        metadata: { ...current.metadata, starred: !starred },
      });
    },
    [serverProjects, saveProject]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      await deleteServerProject(id);
    },
    [deleteServerProject]
  );

  const createProject = useCallback(async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const created = await saveProject({
        name: newName.trim(),
        code: '',
        metadata: { scenes: ['main.holo'], version: '0.1.0', size: 0, starred: false },
      });
      setNewName('');
      setView('recent');
      if (created) onOpen?.(toHoloProject(created));
    } finally {
      setBusy(false);
    }
  }, [newName, busy, saveProject, onOpen]);

  const filtered = projects
    .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || b.lastModified - a.lastModified);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <FolderOpen className="h-4 w-4 text-yellow-400" />
        <span className="text-sm font-semibold text-studio-text">Projects</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-studio-border">
        <button
          onClick={() => setView('recent')}
          className={`flex-1 py-1.5 text-xs ${view === 'recent' ? 'text-studio-accent border-b-2 border-studio-accent' : 'text-studio-muted'}`}
        >
          <Clock className="inline h-3 w-3 mr-1" />
          Recent
        </button>
        <button
          onClick={() => setView('new')}
          className={`flex-1 py-1.5 text-xs ${view === 'new' ? 'text-studio-accent border-b-2 border-studio-accent' : 'text-studio-muted'}`}
        >
          <Plus className="inline h-3 w-3 mr-1" />
          New
        </button>
      </div>

      {view === 'new' && (
        <div className="flex flex-col gap-2 p-3">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Project name..."
            onKeyDown={(e) => e.key === 'Enter' && createProject()}
            className="rounded-lg border border-studio-border bg-transparent px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent/40"
          />
          <button
            onClick={createProject}
            disabled={!newName.trim() || busy || !isAuthenticated}
            className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Project
          </button>
          {!isAuthenticated && (
            <p className="text-[10px] text-studio-muted">Sign in to save projects.</p>
          )}
        </div>
      )}

      {view === 'recent' && (
        <>
          <div className="px-3 py-1.5">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full rounded border border-studio-border bg-transparent px-2 py-1 text-xs text-studio-text outline-none"
            />
          </div>
          <div className="flex flex-col">
            {!isAuthenticated ? (
              <div className="flex flex-col items-center gap-2 p-4 text-center">
                <p className="text-xs text-studio-muted">Sign in to see your projects.</p>
                <button
                  onClick={() => signIn()}
                  className="flex items-center gap-1.5 rounded border border-studio-border px-3 py-1.5 text-xs text-studio-text hover:border-studio-accent/40"
                >
                  <LogIn className="h-3 w-3" /> Sign in
                </button>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-xs text-studio-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading projects…
              </div>
            ) : (
              <>
            {filtered.map((project) => (
              <div
                key={project.id}
                onClick={() => onOpen?.(project)}
                className="flex items-start gap-2 border-b border-studio-border/50 px-3 py-2 cursor-pointer hover:bg-studio-panel/50 transition"
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleStar(project.id);
                  }}
                  className={
                    project.starred ? 'text-amber-400' : 'text-studio-muted/30 hover:text-amber-400'
                  }
                >
                  <Star className="h-3.5 w-3.5" fill={project.starred ? 'currentColor' : 'none'} />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-studio-text truncate">
                    {project.name}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-studio-muted mt-0.5">
                    <span>
                      <FileText className="inline h-2.5 w-2.5 mr-0.5" />
                      {project.scenes.length} scenes
                    </span>
                    <span>{formatBytes(project.size)}</span>
                    <span>v{project.version}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[9px] text-studio-muted/50">
                    {timeAgo(project.lastModified)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteProject(project.id);
                    }}
                    className="text-studio-muted/30 hover:text-red-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-xs text-studio-muted">
                {search ? 'No projects found' : 'No projects yet — create one to get started.'}
              </div>
            )}
              </>
            )}
          </div>
        </>
      )}

      {/* Quick Actions */}
      <div className="flex gap-1 border-t border-studio-border p-2">
        <button className="flex-1 flex items-center justify-center gap-1 rounded border border-studio-border py-1 text-[10px] text-studio-muted hover:text-studio-text">
          <Upload className="h-3 w-3" />
          Import
        </button>
        <button className="flex-1 flex items-center justify-center gap-1 rounded border border-studio-border py-1 text-[10px] text-studio-muted hover:text-studio-text">
          <Download className="h-3 w-3" />
          Export
        </button>
        <button className="flex-1 flex items-center justify-center gap-1 rounded border border-studio-border py-1 text-[10px] text-studio-muted hover:text-studio-text">
          <Settings className="h-3 w-3" />
          Settings
        </button>
      </div>
    </div>
  );
}
