'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { StudioHeader } from '@/components/StudioHeader';
import { SceneGraphPanel } from '@/components/scene/SceneGraphPanel';
import { TraitInspector } from '@/components/inspector/TraitInspector';
import { TraitPalette } from '@/components/inspector/TraitPalette';
import { useSceneStore, useAIStore, useEditorStore } from '@/lib/store';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import {
  AlertTriangle,
  Move,
  RotateCw,
  Maximize2,
  Sparkles,
  Send,
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

// ─── Brittney Chat Panel ───────────────────────────────────────────────────────
// Sprint A: placeholder chat panel — wired in Sprint B with real LLM calls.

interface ChatMessage {
  id: string;
  role: 'user' | 'brittney';
  text: string;
}

const BRITTNEY_SUGGESTIONS = [
  'Add a hovering drone with AI patrol',
  'Give this object a glowing outline',
  'Create a Gaussian splat from a forest',
  'Make it react to physics collisions',
];

function BrittneyChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '0',
      role: 'brittney',
      text: "Hi! I'm Brittney. Tell me what you want to build — I'll add traits, compose behaviors, and shape the scene for you.",
    },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    setMessages((m) => [...m, { id: Date.now().toString(), role: 'user', text }]);
    setThinking(true);
    // Sprint B: replace with real LLM call + tool dispatch
    await new Promise((r) => setTimeout(r, 1200));
    setMessages((m) => [
      ...m,
      {
        id: (Date.now() + 1).toString(),
        role: 'brittney',
        text: `Got it! That's a great idea — I'll work on that. (Full Brittney integration arrives in Sprint B — stay tuned!)`,
      },
    ]);
    setThinking(false);
  }, [input, thinking]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full flex-col border-l border-studio-border bg-studio-panel">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-studio-accent text-white text-xs font-bold">
          B
        </div>
        <div>
          <div className="text-sm font-semibold text-studio-text">Brittney</div>
          <div className="text-[10px] text-studio-muted">AI Scene Director</div>
        </div>
        <div className={`ml-auto h-2 w-2 rounded-full ${thinking ? 'bg-yellow-400 animate-pulse' : 'bg-green-400'}`} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 p-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-studio-accent text-white'
                  : 'bg-studio-surface text-studio-text border border-studio-border/50'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-xl border border-studio-border/50 bg-studio-surface px-3 py-2 text-xs text-studio-muted">
              <Loader2 className="h-3 w-3 animate-spin" />
              Thinking…
            </div>
          </div>
        )}
      </div>

      {/* Suggestions (when no user messages yet) */}
      {messages.filter((m) => m.role === 'user').length === 0 && (
        <div className="shrink-0 border-t border-studio-border/50 p-3 space-y-1.5">
          <p className="text-[10px] text-studio-muted uppercase tracking-widest">Suggestions</p>
          {BRITTNEY_SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setInput(s)}
              className="w-full rounded-lg border border-studio-border/60 bg-studio-surface/50 px-3 py-1.5 text-left text-xs text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-text"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-studio-border p-3">
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask Brittney to modify your scene…"
            disabled={thinking}
            rows={2}
            className="w-full resize-none rounded-xl border border-studio-border bg-studio-surface px-3 py-2 pr-10 text-xs text-studio-text placeholder-studio-muted outline-none transition focus:border-studio-accent disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={thinking || !input.trim()}
            className="absolute bottom-2.5 right-2 rounded-lg bg-studio-accent p-1.5 text-white transition hover:bg-studio-accent/80 disabled:opacity-30"
          >
            {thinking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
          </button>
        </div>
      </div>
    </div>
  );
}

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
