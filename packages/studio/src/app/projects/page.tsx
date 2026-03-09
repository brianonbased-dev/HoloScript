'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Trash2, FolderOpen } from 'lucide-react';
import { listProjects, deleteProject } from '@/lib/storage';
import { useSceneStore } from '@/lib/stores';
import type { Project } from '@/types';

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const setCode = useSceneStore((s) => s.setCode);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  useEffect(() => {
    listProjects().then((p) => {
      setProjects(p);
      setLoading(false);
    });
  }, []);

  function handleOpen(project: Project) {
    setCode(project.code);
    setMetadata(project.metadata);
    router.push('/create');
  }

  async function handleDelete(id: string) {
    await deleteProject(id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex items-center gap-3">
          <Link href="/" className="text-studio-muted transition hover:text-studio-text">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">My Projects</h1>
            <p className="text-sm text-studio-muted">
              {projects.length} saved project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {loading && (
          <div className="text-sm text-studio-muted animate-pulse">Loading projects...</div>
        )}

        {!loading && projects.length === 0 && (
          <div className="rounded-xl border border-studio-border bg-studio-panel p-8 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-studio-muted" />
            <p className="text-studio-muted">No saved projects yet.</p>
            <Link
              href="/create"
              className="mt-3 inline-block text-sm text-studio-accent hover:underline"
            >
              Create your first scene
            </Link>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-studio-border bg-studio-panel p-4 transition hover:border-studio-accent/50"
            >
              <button onClick={() => handleOpen(p)} className="flex-1 text-left">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-studio-muted">
                  Last modified: {new Date(p.metadata.updatedAt).toLocaleDateString()}
                </div>
              </button>
              <button
                onClick={() => handleDelete(p.id)}
                className="ml-3 rounded-md p-2 text-studio-muted transition hover:bg-studio-error/10 hover:text-studio-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
