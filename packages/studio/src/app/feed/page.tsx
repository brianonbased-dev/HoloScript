'use client';

/**
 * Shared Worlds — /feed
 *
 * WS-2 sovereign-web consumer loop MVP: a public feed of shared HoloScript
 * scenes. Prompt -> generate -> preview -> share -> feed, closing the loop
 * that POST /api/public/generate and createShareLink() already opened.
 *
 * @module feed/page
 */

import Link from 'next/link';
import { useEffect } from 'react';
import { Globe, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { useFeed, type FeedScene } from '@/hooks/useFeed';

function timeAgo(createdAt: number): string {
  const diffMs = Date.now() - createdAt;
  const diffSec = Math.max(0, Math.floor(diffMs / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(createdAt).toLocaleDateString();
}

function SceneCard({ scene }: { scene: FeedScene }) {
  return (
    <Link
      href={scene.previewUrl}
      className="group overflow-hidden rounded-xl border border-studio-border bg-studio-panel transition hover:border-studio-accent"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-studio-surface">
        {scene.thumbnail ? (
          <img
            src={`data:image/png;base64,${scene.thumbnail}`}
            alt={scene.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-studio-muted">
            <Sparkles className="h-8 w-8 opacity-40" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-studio-text group-hover:text-studio-accent">
          {scene.title}
        </p>
        {scene.description && (
          <p className="mt-0.5 line-clamp-2 text-xs text-studio-muted">{scene.description}</p>
        )}
        <div className="mt-2 flex items-center justify-between text-[11px] text-studio-muted">
          <span>{scene.author ? `@${scene.author}` : 'anonymous'}</span>
          <span>{timeAgo(scene.createdAt)}</span>
        </div>
      </div>
    </Link>
  );
}

export default function FeedPage() {
  const { scenes, loading, error, reload } = useFeed();

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="min-h-screen bg-studio-bg text-studio-text">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <Globe className="h-6 w-6 text-studio-accent" />
          <div>
            <h1 className="text-xl font-semibold text-studio-text">Shared Worlds</h1>
            <p className="text-sm text-studio-muted">
              Recently shared HoloScript scenes from the community.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {loading && scenes.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-24 text-studio-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading shared worlds...
          </div>
        )}

        {!loading && scenes.length === 0 && !error && (
          <div className="py-24 text-center text-studio-muted">
            No shared worlds yet. Be the first to share one.
          </div>
        )}

        {scenes.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {scenes.map((scene) => (
              <SceneCard key={scene.id} scene={scene} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
