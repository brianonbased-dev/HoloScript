/**
 * /view/[id] — Read-only public scene viewer
 *
 * Loads a published scene by ID, renders it with a full-screen
 * SceneRenderer (no editor UI, no toolbars).
 * URL: /view/a1b2c3d4
 */
'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, AlertTriangle } from 'lucide-react';
import type { R3FNode } from '@holoscript/core';

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { ssr: false }
);

interface PublishedPayload {
  publishedAt: string;
  scene: {
    version: number;
    code?: string;
    r3fTree?: R3FNode | null;
    metadata: { name: string };
  };
}

export default function ViewPage({ params }: { params: Promise<{ id: string }> }) {
  const [payload, setPayload] = useState<PublishedPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sceneId, setSceneId] = useState<string | null>(null);

  useEffect(() => {
    params.then(({ id }) => setSceneId(id));
  }, [params]);

  useEffect(() => {
    if (!sceneId) return;
    fetch(`/api/publish?id=${sceneId}`)
      .then((r) => {
        if (!r.ok) throw new Error('Scene not found');
        return r.json() as Promise<PublishedPayload>;
      })
      .then((data) => {
        setPayload(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sceneId]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0a0a12]">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-[#0a0a12] text-white">
        <AlertTriangle className="h-10 w-10 text-red-400" />
        <p className="text-lg font-semibold">{error ?? 'Scene not found'}</p>
        <a href="/" className="text-sm text-indigo-400 hover:underline">← Back to Studio</a>
      </div>
    );
  }

  const scene = payload.scene;
  const r3fTree = scene.r3fTree ?? null;

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0a0a12]">
      {/* Minimal header */}
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <span className="text-sm font-medium text-white/80">{scene.metadata?.name ?? 'Untitled Scene'}</span>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-white/30">
            Published {new Date(payload.publishedAt).toLocaleDateString()}
          </span>
          <a
            href="/create"
            className="rounded-md border border-indigo-500/50 bg-indigo-600/20 px-3 py-1 text-[11px] font-medium text-indigo-300 hover:bg-indigo-600/40 transition"
          >
            Open in Studio →
          </a>
        </div>
      </header>

      {/* Full-screen viewer — read-only, no toolbar */}
      <div className="flex-1 overflow-hidden">
        <SceneRenderer r3fTree={r3fTree} />
      </div>
    </div>
  );
}
