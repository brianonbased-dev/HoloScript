'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { StudioHeader } from '@/components/StudioHeader';
import { SceneGraphPanel } from '@/components/scene/SceneGraphPanel';
import { TraitInspector } from '@/components/inspector/TraitInspector';
import { TraitPalette } from '@/components/inspector/TraitPalette';
import { BrittneyChatPanel } from '@/components/ai/BrittneyChatPanel';
import { useSceneStore, useEditorStore } from '@/lib/store';

import { useScenePipeline } from '@/hooks/useScenePipeline';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import {
  AlertTriangle,
  Move,
  RotateCw,
  Maximize2,
  Sparkles,
  Loader2,
  MessageCircle,
  X,
} from 'lucide-react';
import type { GizmoMode } from '@/lib/store';

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { ssr: false, loading: () => <ViewportSkeleton /> }
);

function ViewportSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
      <div className="text-sm text-studio-muted animate-pulse">Loading 3D viewport…</div>
    </div>
  );
}

// ─── Gizmo toolbar ────────────────────────────────────────────────────────────

const GIZMO_BUTTONS: Array<{ mode: GizmoMode; icon: typeof Move; label: string; key: string }> = [
  { mode: 'translate', icon: Move, label: 'Move (W)', key: 'W' },
  { mode: 'rotate', icon: RotateCw, label: 'Rotate (E)', key: 'E' },
  { mode: 'scale', icon: Maximize2, label: 'Scale (R)', key: 'R' },
];

function ViewportToolbar() {
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'w' || e.key === 'W') setGizmoMode('translate');
      if (e.key === 'e' || e.key === 'E') setGizmoMode('rotate');
      if (e.key === 'r' || e.key === 'R') setGizmoMode('scale');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setGizmoMode]);

  return (
    <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-studio-border/60 bg-studio-panel/90 p-1 backdrop-blur">
      {GIZMO_BUTTONS.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => setGizmoMode(mode)}
          title={label}
          className={`rounded-md p-2 transition ${
            gizmoMode === mode
              ? 'bg-studio-accent text-white shadow-md'
              : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

// ─── Brittney Chat Panel — see src/components/ai/BrittneyChatPanel.tsx ─────────

// ─── Scene AI Prompt (compact, moved to viewport overlay) ─────────────────────

function AIPromptOverlay() {
  const [open, setOpen] = useState(false);
  const code = useSceneStore((s) => s.code);
  const status = useAIStore((s) => s.status);
  const generateFn = useAIStore((s) => s.addPrompt);
  const [prompt, setPrompt] = useState('');

  const isGenerating = status === 'generating';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 text-xs text-studio-muted backdrop-blur transition hover:border-studio-accent hover:text-studio-text"
      >
        <Sparkles className="h-3.5 w-3.5 text-studio-accent" />
        Generate Scene
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-3 w-72 rounded-xl border border-studio-border bg-studio-panel/95 p-3 shadow-xl backdrop-blur animate-fade-in">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-studio-text">Generate with AI</span>
        <button onClick={() => setOpen(false)} className="text-studio-muted hover:text-studio-text">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe what you want to add…"
        rows={2}
        className="mb-2 w-full resize-none rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-xs text-studio-text outline-none focus:border-studio-accent"
      />
      <button
        disabled={isGenerating || !prompt.trim()}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-studio-accent py-2 text-xs font-medium text-white transition hover:bg-studio-accent/80 disabled:opacity-40"
      >
        {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {isGenerating ? 'Generating…' : 'Generate'}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const code = useSceneStore((s) => s.code);
  const setR3FTree = useSceneStore((s) => s.setR3FTree);
  const setErrors = useSceneStore((s) => s.setErrors);
  const errors = useSceneStore((s) => s.errors);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);

  useOllamaStatus();
  const { r3fTree, errors: pipelineErrors } = useScenePipeline(code);

  useEffect(() => {
    setR3FTree(r3fTree);
    setErrors(pipelineErrors);
  }, [r3fTree, pipelineErrors, setR3FTree, setErrors]);

  return (
    <>
      <StudioHeader />

      {/* ── 3-panel layout ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Scene Graph */}
        <div className="flex w-56 shrink-0 flex-col border-r border-studio-border">
          <SceneGraphPanel />
        </div>

        {/* CENTER: Viewport + Inspector split */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Viewport */}
          <div className="relative flex-1 overflow-hidden">
            <SceneRenderer r3fTree={r3fTree} />
            <ViewportToolbar />
            <AIPromptOverlay />

            {errors.length > 0 && (
              <div className="absolute left-3 bottom-3 max-w-sm rounded-lg border border-studio-error/30 bg-studio-panel/90 p-3 backdrop-blur">
                <div className="mb-1 flex items-center gap-2 text-xs font-medium text-studio-error">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Parse Error
                </div>
                {errors.slice(0, 2).map((e, i) => (
                  <div key={i} className="text-[11px] text-studio-muted">
                    {e.line ? `Line ${e.line}: ` : ''}{e.message}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inspector (bottom strip) */}
          <div className="h-56 shrink-0">
            <TraitInspector onOpenPalette={() => setPaletteOpen(true)} />
          </div>
        </div>

        {/* RIGHT: Brittney Chat */}
        {chatOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <BrittneyChatPanel />
          </div>
        )}

        {/* Chat toggle tab */}
        <button
          onClick={() => setChatOpen((v) => !v)}
          title={chatOpen ? 'Hide Brittney' : 'Open Brittney'}
          className={`absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col items-center gap-1 rounded-l-lg border border-r-0 border-studio-border bg-studio-panel px-1.5 py-3 text-studio-muted transition hover:text-studio-text ${chatOpen ? 'translate-x-[-288px]' : ''}`}
        >
          <MessageCircle className="h-4 w-4" />
        </button>
      </div>

      {/* Trait Palette modal */}
      <TraitPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
