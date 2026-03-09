'use client';

/**
 * ProjectManager — Project file management, save/load, recent projects.
 */

import { useState, useCallback } from 'react';
import {
  FolderOpen,
  Save,
  Plus,
  Clock,
  FileText,
  Download,
  Upload,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';

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

const DEMO_PROJECTS: HoloProject[] = [
  {
    id: '1',
    name: 'Robot Arm Sim',
    path: '/projects/robot-arm',
    lastModified: Date.now() - 3600000,
    scenes: ['main.holo', 'calibration.holo'],
    version: '1.2.0',
    starred: true,
    size: 245000,
  },
  {
    id: '2',
    name: 'Drug Candidate A',
    path: '/projects/drug-a',
    lastModified: Date.now() - 86400000,
    scenes: ['molecule.holo', 'docking.holo', 'analysis.holo'],
    version: '0.9.0',
    starred: false,
    size: 512000,
  },
  {
    id: '3',
    name: 'VR Escape Room',
    path: '/projects/escape-room',
    lastModified: Date.now() - 172800000,
    scenes: ['lobby.holo', 'room1.holo', 'room2.holo', 'victory.holo'],
    version: '2.0.1',
    starred: true,
    size: 1240000,
  },
  {
    id: '4',
    name: 'IoT Farm Dashboard',
    path: '/projects/smart-farm',
    lastModified: Date.now() - 604800000,
    scenes: ['dashboard.holo', 'sensors.holo'],
    version: '0.5.0',
    starred: false,
    size: 89000,
  },
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b}B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)}KB`;
  return `${(b / 1048576).toFixed(1)}MB`;
}
function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

export function ProjectManager({ onOpen }: { onOpen?: (project: HoloProject) => void }) {
  const [projects, setProjects] = useState<HoloProject[]>(DEMO_PROJECTS);
  const [view, setView] = useState<'recent' | 'new'>('recent');
  const [newName, setNewName] = useState('');
  const [search, setSearch] = useState('');

  const toggleStar = useCallback((id: string) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)));
  }, []);

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const createProject = useCallback(() => {
    if (!newName.trim()) return;
    const project: HoloProject = {
      id: String(Date.now()),
      name: newName,
      path: `/projects/${newName.toLowerCase().replace(/\s+/g, '-')}`,
      lastModified: Date.now(),
      scenes: ['main.holo'],
      version: '0.1.0',
      starred: false,
      size: 0,
    };
    setProjects((prev) => [project, ...prev]);
    setNewName('');
    setView('recent');
    onOpen?.(project);
  }, [newName, onOpen]);

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
            disabled={!newName.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Create Project
          </button>
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
              <div className="p-4 text-center text-xs text-studio-muted">No projects found</div>
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
