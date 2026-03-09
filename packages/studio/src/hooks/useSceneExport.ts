'use client';

/**
 * useSceneExport — triggers a scene export download via POST /api/export.
 */

import { useState, useCallback } from 'react';
import { useSceneStore, useSceneGraphStore } from '@/lib/stores';

export type ExportFormat = 'gltf' | 'usd' | 'usdz' | 'json';
export type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

export function useSceneExport() {
  const code = useSceneStore((s) => s.code) ?? '';
  const nodes = useSceneGraphStore((s) => s.nodes);
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const exportScene = useCallback(
    async (format: ExportFormat, sceneName?: string) => {
      setStatus('exporting');
      setError(null);
      try {
        const res = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code,
            format,
            sceneName,
            // Include full scene graph (with traits) for JSON round-trip
            ...(format === 'json' ? { nodes } : {}),
          }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          throw new Error(err.error ?? `HTTP ${res.status}`);
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const fileName =
          res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
          `scene_export.zip`;
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setStatus('done');
        setTimeout(() => setStatus('idle'), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      }
    },
    [code, nodes]
  );

  return { status, error, exportScene };
}
