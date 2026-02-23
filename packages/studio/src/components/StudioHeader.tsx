'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAIStore, useSceneStore } from '@/lib/store';
import { SaveBar } from '@/components/SaveBar';

export function StudioHeader() {
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const metadata = useSceneStore((s) => s.metadata);
  const isDirty = useSceneStore((s) => s.isDirty);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  return (
    <header className="flex h-12 items-center justify-between border-b border-studio-border bg-studio-panel px-4">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-studio-muted transition hover:text-studio-text">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-sm font-semibold">
          HoloScript <span className="text-studio-accent">Studio</span>
        </span>
        <span className="text-xs text-studio-muted">|</span>
        <input
          type="text"
          value={metadata.name}
          onChange={(e) => setMetadata({ name: e.target.value })}
          className="bg-transparent text-sm text-studio-text outline-none"
          placeholder="Untitled Scene"
        />
        {isDirty && (
          <span className="h-2 w-2 rounded-full bg-studio-warning" title="Unsaved changes" />
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Ollama status indicator */}
        <div className="flex items-center gap-1.5 text-xs text-studio-muted">
          <span
            className={`h-2 w-2 rounded-full ${
              ollamaStatus === 'connected'
                ? 'bg-studio-success'
                : ollamaStatus === 'checking'
                  ? 'bg-studio-warning animate-pulse'
                  : 'bg-studio-error'
            }`}
          />
          {ollamaStatus === 'connected'
            ? 'AI Ready'
            : ollamaStatus === 'checking'
              ? 'Checking...'
              : 'AI Offline'}
        </div>

        {/* Save / Open / Share / Export */}
        <SaveBar />
      </div>
    </header>
  );
}
