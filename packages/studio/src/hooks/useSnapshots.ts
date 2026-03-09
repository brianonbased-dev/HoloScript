'use client';

/**
 * useSnapshots — save and manage viewport snapshots.
 * Captures a screenshot by calling renderer.domElement.toDataURL(),
 * then POSTs to /api/snapshots.
 */

import { useState, useCallback } from 'react';
import { useSceneStore } from '@/lib/stores';

export interface Snapshot {
  id: string;
  sceneId: string;
  label: string;
  dataUrl: string;
  code: string;
  createdAt: string;
}

export function useSnapshots(sceneId: string) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/snapshots?sceneId=${encodeURIComponent(sceneId)}`);
      const data = (await res.json()) as { snapshots: Snapshot[] };
      setSnapshots(data.snapshots);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [sceneId]);

  const capture = useCallback(
    async (label?: string) => {
      setCapturing(true);
      setError(null);
      try {
        // Try to grab domeElement canvas from the Three.js renderer
        let dataUrl = '';
        const canvas = document.querySelector<HTMLCanvasElement>(
          'canvas.r3f-canvas, canvas[data-engine]'
        );
        if (canvas) {
          dataUrl = canvas.toDataURL('image/png');
        } else {
          // Fallback: blank placeholder
          dataUrl =
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        }

        const res = await fetch('/api/snapshots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sceneId,
            label: label ?? `Snapshot ${new Date().toLocaleTimeString()}`,
            dataUrl,
            code,
          }),
        });
        const data = (await res.json()) as { snapshot: Snapshot };
        setSnapshots((prev) => [...prev, data.snapshot]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Capture failed');
      } finally {
        setCapturing(false);
      }
    },
    [sceneId, code]
  );

  const restore = useCallback(
    (snap: Snapshot) => {
      setCode(snap.code);
    },
    [setCode]
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/snapshots?id=${id}`, { method: 'DELETE' });
    if (res.ok) setSnapshots((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { snapshots, loading, capturing, error, load, capture, restore, remove };
}
