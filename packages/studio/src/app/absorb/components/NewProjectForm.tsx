'use client';

import React, { useState, useCallback } from 'react';
import { useAbsorbService } from '@/hooks/useAbsorbService';

export function NewProjectForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { createProject } = useAbsorbService();

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError('');
    const project = await createProject(
      name.trim(),
      sourceUrl ? 'github' : 'workspace',
      sourceUrl || undefined
    );
    if (project) {
      setName('');
      setSourceUrl('');
      onCreated();
    } else {
      setError('Failed to create project');
    }
    setCreating(false);
  }, [name, sourceUrl, createProject, onCreated]);

  return (
    <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
      <h3 className="text-sm font-semibold text-studio-text mb-4">New Project</h3>
      <div className="flex flex-col gap-3">
        <label className="text-xs font-medium text-studio-muted">
          Project name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-studio-muted">
          GitHub URL (optional)
          <input
            type="text"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://github.com/user/repo"
            className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
          />
        </label>
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {error}
          </div>
        )}
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim()}
          className="rounded-lg bg-studio-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-studio-accent/80 disabled:opacity-50"
        >
          {creating ? 'Creating...' : 'Create Project'}
        </button>
      </div>
    </div>
  );
}
