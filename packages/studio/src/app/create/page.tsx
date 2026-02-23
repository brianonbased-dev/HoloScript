'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { StudioHeader } from '@/components/StudioHeader';
import { SceneGraphPanel } from '@/components/scene/SceneGraphPanel';
import { TraitInspector } from '@/components/inspector/TraitInspector';
import { TraitPalette } from '@/components/inspector/TraitPalette';
import { BrittneyChatPanel } from '@/components/ai/BrittneyChatPanel';
import { AssetLibrary } from '@/components/assets/AssetLibrary';
import { SplatCaptureWizard } from '@/components/assets/SplatCaptureWizard';
import { useSceneStore, useEditorStore, useSceneGraphStore } from '@/lib/store';
import { useAssetStore } from '@/components/assets/useAssetStore';
import { decodeSceneFromURL } from '@/lib/serializer';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import { HistoryPanel } from '@/components/HistoryPanel';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useTemporalStore } from '@/lib/historyStore';
import { AssetDropOverlay } from '@/components/assets/AssetDropProcessor';
import {
  AlertTriangle,
  BarChart2,
  Move,
  RotateCw,
  RotateCcw,
  Maximize2,
  Sparkles,
  Loader2,
  MessageCircle,
  Layers,
  List,
  Code2,
  GitGraph,
  Film,
  LayoutTemplate,
  X,
  History,
} from 'lucide-react';
import type { GizmoMode } from '@/lib/store';

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { ssr: false, loading: () => <ViewportSkeleton /> }
);

const HoloScriptEditor = dynamic(
  () => import('@/components/editor/HoloScriptEditor').then((m) => ({ default: m.HoloScriptEditor })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">Loading editor…</div> }
);

const ShaderEditorPanel = dynamic(
  () => import('@/components/shader-editor/ShaderEditorPanel').then((m) => ({ default: m.ShaderEditorPanel })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-studio-muted">Loading shader editor…</div> }
);

const NodeGraphEditor = dynamic(
  () => import('@/components/node-graph/NodeGraphEditor').then((m) => ({ default: m.NodeGraphEditor })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">Loading node graph…</div> }
);

const TemplatePicker = dynamic(
  () => import('@/components/templates/TemplatePicker').then((m) => ({ default: m.TemplatePicker })),
  { ssr: false }
);

const AnimationTimeline = dynamic(
  () => import('@/components/timeline/AnimationTimeline').then((m) => ({ default: m.AnimationTimeline })),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">Loading timeline…</div> }
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

function ViewportToolbar({ profilerOpen, onToggleProfiler }: { profilerOpen: boolean; onToggleProfiler: () => void }) {
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const canUndo = useTemporalStore((s) => s.pastStates.length > 0);
  const canRedo = useTemporalStore((s) => s.futureStates.length > 0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'w' || e.key === 'W') setGizmoMode('translate');
      if (e.key === 'e' || e.key === 'E') setGizmoMode('rotate');
      if (e.key === 'r' || e.key === 'R') setGizmoMode('scale');
      if (e.key === 'p' || e.key === 'P') onToggleProfiler();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setGizmoMode, onToggleProfiler]);

  return (
    <div className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-studio-border/60 bg-studio-panel/90 p-1 backdrop-blur">
      {/* Undo / Redo */}
      <button
        onClick={() => undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="rounded-md p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-30"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className="rounded-md p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-30"
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>

      {/* Divider */}
      <div className="mx-1 h-4 w-px bg-studio-border/60" />

      {/* Gizmo mode buttons */}
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

      {/* Divider */}
      <div className="mx-1 h-4 w-px bg-studio-border/60" />

      {/* Profiler toggle (P) */}
      <button
        onClick={onToggleProfiler}
        title={profilerOpen ? 'Hide Profiler (P)' : 'Show Profiler (P)'}
        className={`rounded-md p-2 transition ${
          profilerOpen
            ? 'bg-studio-accent text-white shadow-md'
            : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
        }`}
      >
        <BarChart2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ─── Brittney Chat Panel — see src/components/ai/BrittneyChatPanel.tsx ─────────

// ─── Scene AI Prompt (compact, moved to viewport overlay) ─────────────────────

function AIPromptOverlay() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false); // Changed from useAIStore

  // Removed: const code = useSceneStore((s) => s.code);
  // Removed: const status = useAIStore((s) => s.status);
  // Removed: const generateFn = useAIStore((s) => s.addPrompt);
  // Removed: const isGenerating = status === 'generating';

  // Placeholder for actual generation logic
  const handleGenerate = async () => {
    setIsGenerating(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log("Generating with prompt:", prompt);
    setIsGenerating(false);
    setOpen(false); // Close after generation
    setPrompt(''); // Clear prompt
  };

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
        onClick={handleGenerate} // Added onClick handler
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
  const setCode = useSceneStore((s) => s.setCode);
  const setR3FTree = useSceneStore((s) => s.setR3FTree);
  const setErrors = useSceneStore((s) => s.setErrors);
  const setMetadata = useSceneStore((s) => s.setMetadata);
  const markClean = useSceneStore((s) => s.markClean);
  const errors = useSceneStore((s) => s.errors);

  const addNode = useSceneGraphStore((s) => s.addNode);
  const addAsset = useAssetStore((s) => s.addAsset);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profilerOpen, setProfilerOpen] = useState(false);
  const [shaderEditorOpen, setShaderEditorOpen] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'scene' | 'assets' | 'code' | 'graph'>('scene');

  // Undo/Redo keyboard shortcuts
  useUndoRedo();
  const [splatWizardOpen, setSplatWizardOpen] = useState(false);

  useOllamaStatus();

  // ── URL scene restore (?scene= parameter) ──────────────────────────────────
  const searchParams = useSearchParams();
  useEffect(() => {
    const encoded = searchParams.get('scene');
    if (!encoded) return;
    decodeSceneFromURL(encoded).then((result) => {
      if (!result.ok || !result.scene) return;
      const s = result.scene;
      if (s.code) setCode(s.code);
      setMetadata({ id: s.metadata.id, name: s.metadata.name });
      for (const node of s.nodes ?? []) addNode(node);
      for (const asset of s.assets ?? []) addAsset(asset);
      markClean();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { r3fTree, errors: pipelineErrors } = useScenePipeline(code);

  useEffect(() => {
    setR3FTree(r3fTree);
    setErrors(pipelineErrors);
  }, [r3fTree, pipelineErrors, setR3FTree, setErrors]);

  return (
    <>
      <StudioHeader />

      {/* ── 3-panel layout ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Scene Graph + Assets tabbed panel */}
        <div className="flex w-64 shrink-0 flex-col border-r border-studio-border">
          {/* Tab strip */}
          <div className="flex shrink-0 border-b border-studio-border">
            <button
              onClick={() => setLeftTab('scene')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition ${
                leftTab === 'scene'
                  ? 'border-b-2 border-studio-accent text-studio-accent'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Scene
            </button>
            <button
              onClick={() => setLeftTab('assets')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition ${
                leftTab === 'assets'
                  ? 'border-b-2 border-studio-accent text-studio-accent'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              Assets
            </button>
            <button
              onClick={() => setLeftTab('code')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition ${
                leftTab === 'code'
                  ? 'border-b-2 border-studio-accent text-studio-accent'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              Code
            </button>
            <button
              onClick={() => setLeftTab('graph')}
              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition ${
                leftTab === 'graph'
                  ? 'border-b-2 border-studio-accent text-studio-accent'
                  : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <GitGraph className="h-3.5 w-3.5" />
              Graph
            </button>
          </div>

          {/* Panel content */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {leftTab === 'scene' ? (
              <SceneGraphPanel />
            ) : leftTab === 'assets' ? (
              <AssetLibrary onOpenSplatWizard={() => setSplatWizardOpen(true)} />
            ) : leftTab === 'graph' ? (
              <NodeGraphEditor onCompile={(glsl) => { setShaderEditorOpen(true); console.log('[NodeGraph] compiled GLSL', glsl.slice(0, 60)); }} />
            ) : (
              <HoloScriptEditor height="100%" />
            )}
          </div>
        </div>

        {/* CENTER: Viewport + Inspector split */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Viewport */}
          <div className="relative flex-1 overflow-hidden">
            <SceneRenderer r3fTree={r3fTree} profilerOpen={profilerOpen} />
            <ViewportToolbar profilerOpen={profilerOpen} onToggleProfiler={() => setProfilerOpen((v) => !v)} />
            <AIPromptOverlay />
            <AssetDropOverlay />

            {/* Template picker shortcut */}
            <button
              onClick={() => setTemplatePickerOpen(true)}
              title="Browse scene templates"
              className="absolute right-3 top-2 z-10 flex items-center gap-1 rounded-lg bg-studio-panel/80 px-2.5 py-1.5 text-[10px] text-studio-muted backdrop-blur hover:bg-studio-surface hover:text-studio-text transition"
            >
              <LayoutTemplate className="h-3.5 w-3.5" /> Templates
            </button>

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

          {/* Inspector (bottom strip) — Shader Editor — Animation Timeline */}
          <div className={`shrink-0 ${shaderEditorOpen || timelineOpen ? 'h-96' : 'h-56'}`}>
            {shaderEditorOpen ? (
              <ShaderEditorPanel onClose={() => setShaderEditorOpen(false)} />
            ) : timelineOpen ? (
              <AnimationTimeline onClose={() => setTimelineOpen(false)} />
            ) : (
              <TraitInspector
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenShaderEditor={() => setShaderEditorOpen(true)}
              />
            )}
          </div>
        </div>

        {/* RIGHT RAIL: History panel (optional) */}
        {historyOpen && (
          <div className="flex w-56 shrink-0 flex-col border-l border-studio-border">
            <HistoryPanel onClose={() => setHistoryOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Brittney Chat */}
        {chatOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <BrittneyChatPanel />
          </div>
        )}

        {/* Floating tab strip (right edge) */}
        <div
          className={`absolute right-0 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-l-lg border border-r-0 border-studio-border bg-studio-panel px-1.5 py-3 ${
            chatOpen ? 'translate-x-[-288px]' : historyOpen ? 'translate-x-[-224px]' : ''
          }`}
        >
          {/* Brittney toggle */}
          <button
            onClick={() => setChatOpen((v) => !v)}
            title={chatOpen ? 'Hide Brittney' : 'Open Brittney'}
            className="text-studio-muted transition hover:text-studio-text"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          {/* History toggle */}
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            title={historyOpen ? 'Hide History' : 'Show History'}
            className={`transition ${
              historyOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <History className="h-4 w-4" />
          </button>
          {/* Timeline toggle */}
          <button
            onClick={() => { setTimelineOpen((v) => !v); setShaderEditorOpen(false); }}
            title={timelineOpen ? 'Close Timeline' : 'Open Animation Timeline'}
            className={`transition ${
              timelineOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Film className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Trait Palette modal */}
      <TraitPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Gaussian Splat capture wizard */}
      <SplatCaptureWizard open={splatWizardOpen} onClose={() => setSplatWizardOpen(false)} />

      {/* Template Picker modal */}
      {templatePickerOpen && (
        <TemplatePicker onClose={() => setTemplatePickerOpen(false)} />
      )}
    </>
  );
}

