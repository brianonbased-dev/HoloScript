'use client';

/**
 * useSceneVersions — manage version snapshots for a scene.
 *
 * Interacts with /api/versions (list/save) and /api/versions/[sceneId] (restore/delete).
 */

import { useState, useCallback } from 'react';
import { useSceneStore } from '@/lib/stores';

export interface SceneVersion {
  versionId: string;
  sceneId: string;
  label: string;
  code: string;
  savedAt: string;
  lineCount: number;
}

export type VersionStatus = 'idle' | 'loading' | 'saving' | 'restoring' | 'error';

export function useSceneVersions(sceneId: string) {
  const setCode = useSceneStore((s) => s.setCode);
  const [versions, setVersions] = useState<SceneVersion[]>([]);
  const [status, setStatus] = useState<VersionStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const loadVersions = useCallback(async () => {
    if (!sceneId) return;
    setStatus('loading');
    try {
      const res = await fetch(`/api/versions?sceneId=${encodeURIComponent(sceneId)}`);
      const data = (await res.json()) as { versions?: SceneVersion[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Load failed');
      setVersions(data.versions ?? []);
      setStatus('idle');
    } catch (e) {
      setError(String(e));
      setStatus('error');
    }
  }, [sceneId]);

  const saveVersion = useCallback(
    async (code: string, label?: string) => {
      if (!sceneId) return;
      setStatus('saving');
      try {
        const res = await fetch('/api/versions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneId, code, label }),
        });
        const data = (await res.json()) as { version?: SceneVersion; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? 'Save failed');
        setVersions((prev) => [data.version!, ...prev]);
        setStatus('idle');
        return data.version;
      } catch (e) {
        setError(String(e));
        setStatus('error');
      }
    },
    [sceneId]
  );

  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (!sceneId) return;
      setStatus('restoring');
      try {
        const res = await fetch(
          `/api/versions/${encodeURIComponent(sceneId)}?v=${encodeURIComponent(versionId)}`,
          { method: 'PUT' }
        );
        const data = (await res.json()) as { code?: string; error?: string };
        if (!res.ok || data.error || !data.code) throw new Error(data.error ?? 'Restore failed');
        setCode(data.code);
        setStatus('idle');
      } catch (e) {
        setError(String(e));
        setStatus('error');
      }
    },
    [sceneId, setCode]
  );

  const deleteVersion = useCallback(
    async (versionId: string) => {
      try {
        await fetch(
          `/api/versions/${encodeURIComponent(sceneId)}?v=${encodeURIComponent(versionId)}`,
          { method: 'DELETE' }
        );
        setVersions((prev) => prev.filter((v) => v.versionId !== versionId));
      } catch (e) {
        setError(String(e));
      }
    },
    [sceneId]
  );

  return {
    versions,
    status,
    error,
    clearError,
    loadVersions,
    saveVersion,
    restoreVersion,
    deleteVersion,
  };
}
