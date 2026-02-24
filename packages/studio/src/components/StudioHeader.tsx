'use client';

import { ArrowLeft, Glasses } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAIStore, useSceneStore } from '@/lib/store';
import { SaveBar } from '@/components/SaveBar';
import { CollabBar } from '@/components/collaboration/CollabBar';
import { xrStore } from '@/components/vr/VREditSession';

export function StudioHeader() {
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const metadata = useSceneStore((s) => s.metadata);
  const isDirty = useSceneStore((s) => s.isDirty);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'xr' in navigator) {
      navigator.xr?.isSessionSupported('immersive-vr').then((ok) => setXrSupported(ok));
    }
  }, []);

  const toggleVR = () => {
    if (xrActive) {
      xrStore.getState().session?.end();
      setXrActive(false);
    } else {
      xrStore.enterVR().then(() => setXrActive(true)).catch(() => {});
    }
  };

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
        {/* Ollama status */}
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

        {/* Enter VR */}
        {xrSupported && (
          <button
            onClick={toggleVR}
            title={xrActive ? 'Exit VR' : 'Enter VR'}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              xrActive
                ? 'bg-studio-accent text-white shadow-lg shadow-studio-accent/30'
                : 'border border-studio-border bg-studio-surface text-studio-muted hover:border-studio-accent/40 hover:text-studio-accent'
            }`}
          >
            <Glasses className="h-3.5 w-3.5" />
            {xrActive ? 'Exit VR' : 'Enter VR'}
          </button>
        )}

        {/* Collaboration */}
        <CollabBar />

        {/* Save / Open / Share / Export */}
        <SaveBar />
      </div>
    </header>
  );
}
