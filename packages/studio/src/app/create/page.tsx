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
import { useProjectStore } from '@/lib/projectStore';
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
  Share2,
  Users,
  Lightbulb,
  Package,
  GitBranch,
  Terminal,
  Store,
  Smartphone,
  Download,
  Wand2,
  Activity,
  Users2,
  Bug,
  Camera,
  Library,
  Map,
  Music,
  X,
  History,
  Network,
  Timer,
  SearchCode,
  Flame,
  Eye,
  Terminal as TerminalIcon,
  Clock as ClockIcon,
  Layers,
  Palette,
  Atom,
  GitCompare,
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

const AIMaterialPanel = dynamic(
  () => import('@/components/ai/AIMaterialPanel').then((m) => ({ default: m.AIMaterialPanel })),
  { ssr: false }
);

const SharePanel = dynamic(
  () => import('@/components/share/SharePanel').then((m) => ({ default: m.SharePanel })),
  { ssr: false }
);

const CollabCursors = dynamic(
  () => import('@/components/collab/CollabCursors').then((m) => ({ default: m.CollabCursors })),
  { ssr: false }
);

const CollabStatusDot = dynamic(
  () => import('@/components/collab/CollabCursors').then((m) => ({ default: m.CollabStatusDot })),
  { ssr: false }
);

const SceneCritiquePanel = dynamic(
  () => import('@/components/ai/SceneCritiquePanel').then((m) => ({ default: m.SceneCritiquePanel })),
  { ssr: false }
);

const AssetPackPanel = dynamic(
  () => import('@/components/assets/AssetPackPanel').then((m) => ({ default: m.AssetPackPanel })),
  { ssr: false }
);

const SceneVersionPanel = dynamic(
  () => import('@/components/versions/SceneVersionPanel').then((m) => ({ default: m.SceneVersionPanel })),
  { ssr: false }
);

const REPLPanel = dynamic(
  () => import('@/components/repl/REPLPanel').then((m) => ({ default: m.REPLPanel })),
  { ssr: false }
);

const ProjectTabBar = dynamic(
  () => import('@/components/project/ProjectTabBar').then((m) => ({ default: m.ProjectTabBar })),
  { ssr: false }
);

const LivePreviewBar = dynamic(
  () => import('@/components/preview/LivePreviewBar').then((m) => ({ default: m.LivePreviewBar })),
  { ssr: false }
);

const RegistryPanel = dynamic(
  () => import('@/components/registry/RegistryPanel').then((m) => ({ default: m.RegistryPanel })),
  { ssr: false }
);

const QRRemotePanel = dynamic(
  () => import('@/components/remote/QRRemotePanel').then((m) => ({ default: m.QRRemotePanel })),
  { ssr: false }
);

const ExportPanel = dynamic(
  () => import('@/components/export/ExportPanel').then((m) => ({ default: m.ExportPanel })),
  { ssr: false }
);

const SceneGeneratorPanel = dynamic(
  () => import('@/components/ai/SceneGeneratorPanel').then((m) => ({ default: m.SceneGeneratorPanel })),
  { ssr: false }
);

const ProfilerPanel = dynamic(
  () => import('@/components/profiler/ProfilerPanel').then((m) => ({ default: m.ProfilerPanel })),
  { ssr: false }
);

const ProfilerOverlay = dynamic(
  () => import('@/components/profiler/ProfilerOverlay').then((m) => ({ default: m.ProfilerOverlay })),
  { ssr: false }
);

const MultiplayerPanel = dynamic(
  () => import('@/components/collab/MultiplayerPanel').then((m) => ({ default: m.MultiplayerPanel })),
  { ssr: false }
);

const DebuggerPanel = dynamic(
  () => import('@/components/debugger/DebuggerPanel').then((m) => ({ default: m.DebuggerPanel })),
  { ssr: false }
);

const SnapshotGallery = dynamic(
  () => import('@/components/gallery/SnapshotGallery').then((m) => ({ default: m.SnapshotGallery })),
  { ssr: false }
);

const AssetLibraryPanel = dynamic(
  () => import('@/components/assets/AssetLibraryPanel').then((m) => ({ default: m.AssetLibraryPanel })),
  { ssr: false }
);

const TemplateGallery = dynamic(
  () => import('@/components/templates/TemplateGallery').then((m) => ({ default: m.TemplateGallery })),
  { ssr: false }
);

const MinimapOverlay = dynamic(
  () => import('@/components/minimap/MinimapOverlay').then((m) => ({ default: m.MinimapOverlay })),
  { ssr: false }
);

const AudioTraitPanel = dynamic(
  () => import('@/components/audio/AudioTraitPanel').then((m) => ({ default: m.AudioTraitPanel })),
  { ssr: false }
);

const ExportPipelinePanel = dynamic(
  () => import('@/components/export/ExportPipelinePanel').then((m) => ({ default: m.ExportPipelinePanel })),
  { ssr: false }
);

const NodeGraphPanel = dynamic(
  () => import('@/components/node-graph/NodeGraphPanel').then((m) => ({ default: m.NodeGraphPanel })),
  { ssr: false }
);

const KeyframeEditor = dynamic(
  () => import('@/components/keyframes/KeyframeEditor').then((m) => ({ default: m.KeyframeEditor })),
  { ssr: false }
);

const SceneSearchOverlay = dynamic(
  () => import('@/components/search/SceneSearchOverlay').then((m) => ({ default: m.SceneSearchOverlay })),
  { ssr: false }
);

const CollabCursorsV2 = dynamic(
  () => import('@/components/collab/CollabCursorsV2').then((m) => ({ default: m.CollabCursorsV2 })),
  { ssr: false }
);

const ParticlePanel = dynamic(
  () => import('@/components/particles/ParticlePanel').then((m) => ({ default: m.ParticlePanel })),
  { ssr: false }
);

const LodPanel = dynamic(
  () => import('@/components/lod/LodPanel').then((m) => ({ default: m.LodPanel })),
  { ssr: false }
);

const ScriptConsole = dynamic(
  () => import('@/components/console/ScriptConsole').then((m) => ({ default: m.ScriptConsole })),
  { ssr: false }
);

const UndoHistorySidebar = dynamic(
  () => import('@/components/history/UndoHistorySidebar').then((m) => ({ default: m.UndoHistorySidebar })),
  { ssr: false }
);

const SceneOutliner = dynamic(
  () => import('@/components/outliner/SceneOutliner').then((m) => ({ default: m.SceneOutliner })),
  { ssr: false }
);

const MaterialPanel = dynamic(
  () => import('@/components/materials/MaterialPanel').then((m) => ({ default: m.MaterialPanel })),
  { ssr: false }
);

const PhysicsPanel = dynamic(
  () => import('@/components/physics/PhysicsPanel').then((m) => ({ default: m.PhysicsPanel })),
  { ssr: false }
);

const SnapshotDiffPanel = dynamic(
  () => import('@/components/diff/SnapshotDiffPanel').then((m) => ({ default: m.SnapshotDiffPanel })),
  { ssr: false }
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
  const [aiMaterialOpen, setAiMaterialOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [critiqueOpen, setCritiqueOpen] = useState(false);
  const [assetPackOpen, setAssetPackOpen] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [replOpen, setReplOpen] = useState(false);
  const [registryOpen, setRegistryOpen] = useState(false);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<'scene' | 'assets' | 'code' | 'graph'>('scene');
  const [multiplayerOpen, setMultiplayerOpen] = useState(false);
  const [debuggerOpen, setDebuggerOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [assetLibOpen, setAssetLibOpen] = useState(false);
  // Sprint R
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [audioOpen, setAudioOpen] = useState(false);
  const [exportV2Open, setExportV2Open] = useState(false);
  // Sprint S
  const [nodeGraphOpen, setNodeGraphOpen] = useState(false);
  const [keyframesOpen, setKeyframesOpen] = useState(false);
  const [sceneSearchOpen, setSceneSearchOpen] = useState(false);
  const [collabV2Open, setCollabV2Open] = useState(false);
  // Sprint T
  const [particlesOpen, setParticlesOpen] = useState(false);
  const [lodOpen, setLodOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [undoHistoryOpen, setUndoHistoryOpen] = useState(false);
  // Sprint U
  const [outlinerOpen, setOutlinerOpen] = useState(false);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [physicsOpen, setPhysicsOpen] = useState(false);
  const [snapshotDiffOpen, setSnapshotDiffOpen] = useState(false);

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
      {/* Multi-scene project tabs */}
      <ProjectTabBar
        onSwitch={(sceneId) => {
          const { scenes } = useProjectStore.getState();
          const s = scenes.find((sc) => sc.id === sceneId);
          if (s) setCode(s.code);
        }}
      />
      {/* Live preview status bar */}
      <LivePreviewBar sceneId="scene-1" />

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
            <ProfilerOverlay active={profilerOpen} />
            <AssetDropOverlay />
            <MinimapOverlay active={minimapOpen} onClose={() => setMinimapOpen(false)} />

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

        {/* RIGHT RAIL: AI Material Generator */}
        {aiMaterialOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <AIMaterialPanel onClose={() => setAiMaterialOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Share Panel */}
        {shareOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <SharePanel onClose={() => setShareOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Scene Critique */}
        {critiqueOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <SceneCritiquePanel onClose={() => setCritiqueOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Asset Pack Importer */}
        {assetPackOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <AssetPackPanel onClose={() => setAssetPackOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Scene Versions */}
        {versionsOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <SceneVersionPanel sceneId="scene-1" onClose={() => setVersionsOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: REPL */}
        {replOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <REPLPanel onClose={() => setReplOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Pack Registry */}
        {registryOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <RegistryPanel onClose={() => setRegistryOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Mobile Remote */}
        {remoteOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <QRRemotePanel onClose={() => setRemoteOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Export */}
        {exportOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <ExportPanel onClose={() => setExportOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: AI Generator */}
        {generatorOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <SceneGeneratorPanel onClose={() => setGeneratorOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Profiler */}
        {profilerOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <ProfilerPanel onClose={() => setProfilerOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Multiplayer */}
        {multiplayerOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <MultiplayerPanel onClose={() => setMultiplayerOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Debugger */}
        {debuggerOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <DebuggerPanel onClose={() => setDebuggerOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Snapshot Gallery */}
        {snapshotsOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <SnapshotGallery onClose={() => setSnapshotsOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Asset Library v2 */}
        {assetLibOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <AssetLibraryPanel onClose={() => setAssetLibOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Template Gallery */}
        {templateGalleryOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <TemplateGallery onClose={() => setTemplateGalleryOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Audio Traits */}
        {audioOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <AudioTraitPanel onClose={() => setAudioOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Export Pipeline v2 */}
        {exportV2Open && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <ExportPipelinePanel onClose={() => setExportV2Open(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Node Graph Editor */}
        {nodeGraphOpen && (
          <div className="flex w-96 shrink-0 flex-col border-l border-studio-border">
            <NodeGraphPanel onClose={() => setNodeGraphOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Keyframe Editor */}
        {keyframesOpen && (
          <div className="flex w-[620px] shrink-0 flex-col border-l border-studio-border">
            <KeyframeEditor onClose={() => setKeyframesOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Particle Traits */}
        {particlesOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <ParticlePanel onClose={() => setParticlesOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: LOD / Camera Culling */}
        {lodOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <LodPanel onClose={() => setLodOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Undo History */}
        {undoHistoryOpen && (
          <div className="flex w-64 shrink-0 flex-col border-l border-studio-border">
            <UndoHistorySidebar onClose={() => setUndoHistoryOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Scene Outliner */}
        {outlinerOpen && (
          <div className="flex w-64 shrink-0 flex-col border-l border-studio-border">
            <SceneOutliner onClose={() => setOutlinerOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Material Editor */}
        {materialOpen && (
          <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
            <MaterialPanel onClose={() => setMaterialOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Physics Traits */}
        {physicsOpen && (
          <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
            <PhysicsPanel onClose={() => setPhysicsOpen(false)} />
          </div>
        )}

        {/* RIGHT RAIL: Snapshot Diff */}
        {snapshotDiffOpen && (
          <div className="flex w-[640px] shrink-0 flex-col border-l border-studio-border">
            <SnapshotDiffPanel onClose={() => setSnapshotDiffOpen(false)} />
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
          {/* AI Material toggle */}
          <button
            onClick={() => { setAiMaterialOpen((v) => !v); setShareOpen(false); }}
            title={aiMaterialOpen ? 'Close AI Materials' : 'AI Material Generator'}
            className={`transition ${
              aiMaterialOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Sparkles className="h-4 w-4" />
          </button>
          {/* Share toggle */}
          <button
            onClick={() => { setShareOpen((v) => !v); setAiMaterialOpen(false); }}
            title={shareOpen ? 'Close Share' : 'Share Scene'}
            className={`transition ${
              shareOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Share2 className="h-4 w-4" />
          </button>
          {/* Collab status */}
          <div className="mt-1 flex justify-center">
            <CollabStatusDot />
          </div>
          {/* AI Critique toggle */}
          <button
            onClick={() => { setCritiqueOpen((v) => !v); setAssetPackOpen(false); }}
            title={critiqueOpen ? 'Close Critique' : 'Scene Critique (AI)'}
            className={`transition ${
              critiqueOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Lightbulb className="h-4 w-4" />
          </button>
          {/* Asset Pack toggle */}
          <button
            onClick={() => { setAssetPackOpen((v) => !v); setCritiqueOpen(false); }}
            title={assetPackOpen ? 'Close Asset Pack' : 'Import Asset Pack'}
            className={`transition ${
              assetPackOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Package className="h-4 w-4" />
          </button>
          {/* Versions toggle */}
          <button
            onClick={() => { setVersionsOpen((v) => !v); setReplOpen(false); }}
            title={versionsOpen ? 'Close Versions' : 'Scene Version History'}
            className={`transition ${
              versionsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <GitBranch className="h-4 w-4" />
          </button>
          {/* REPL toggle */}
          <button
            onClick={() => { setReplOpen((v) => !v); setVersionsOpen(false); }}
            title={replOpen ? 'Close REPL' : 'HoloScript REPL'}
            className={`transition ${
              replOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Terminal className="h-4 w-4" />
          </button>
          {/* Registry toggle */}
          <button
            onClick={() => { setRegistryOpen((v) => !v); setRemoteOpen(false); }}
            title={registryOpen ? 'Close Registry' : 'Pack Registry'}
            className={`transition ${
              registryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Store className="h-4 w-4" />
          </button>
          {/* Mobile Remote toggle */}
          <button
            onClick={() => { setRemoteOpen((v) => !v); setRegistryOpen(false); }}
            title={remoteOpen ? 'Close Remote' : 'Mobile Remote (QR)'}
            className={`transition ${
              remoteOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Smartphone className="h-4 w-4" />
          </button>
          {/* Export toggle */}
          <button
            onClick={() => { setExportOpen((v) => !v); setGeneratorOpen(false); setProfilerOpen(false); }}
            title={exportOpen ? 'Close Export' : 'Export Scene'}
            className={`transition ${
              exportOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Download className="h-4 w-4" />
          </button>
          {/* AI Generator toggle */}
          <button
            onClick={() => { setGeneratorOpen((v) => !v); setExportOpen(false); setProfilerOpen(false); }}
            title={generatorOpen ? 'Close AI Generator' : 'AI Scene Generator'}
            className={`transition ${
              generatorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Wand2 className="h-4 w-4" />
          </button>
          {/* Profiler toggle */}
          <button
            onClick={() => { setProfilerOpen((v) => !v); setExportOpen(false); setGeneratorOpen(false); }}
            title={profilerOpen ? 'Close Profiler' : 'Performance Profiler'}
            className={`transition ${
              profilerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Activity className="h-4 w-4" />
          </button>
          {/* Multiplayer toggle */}
          <button
            onClick={() => { setMultiplayerOpen((v) => !v); setDebuggerOpen(false); setSnapshotsOpen(false); setAssetLibOpen(false); }}
            title={multiplayerOpen ? 'Close Multiplayer' : 'Multiplayer Room'}
            className={`transition ${multiplayerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Users2 className="h-4 w-4" />
          </button>
          {/* Debugger toggle */}
          <button
            onClick={() => { setDebuggerOpen((v) => !v); setMultiplayerOpen(false); setSnapshotsOpen(false); setAssetLibOpen(false); }}
            title={debuggerOpen ? 'Close Debugger' : 'HoloScript Debugger'}
            className={`transition ${debuggerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Bug className="h-4 w-4" />
          </button>
          {/* Snapshot Gallery toggle */}
          <button
            onClick={() => { setSnapshotsOpen((v) => !v); setMultiplayerOpen(false); setDebuggerOpen(false); setAssetLibOpen(false); }}
            title={snapshotsOpen ? 'Close Gallery' : 'Snapshot Gallery'}
            className={`transition ${snapshotsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Camera className="h-4 w-4" />
          </button>
          {/* Asset Library toggle */}
          <button
            onClick={() => { setAssetLibOpen((v) => !v); setMultiplayerOpen(false); setDebuggerOpen(false); setSnapshotsOpen(false); }}
            title={assetLibOpen ? 'Close Asset Library' : 'Asset Library v2'}
            className={`transition ${assetLibOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Library className="h-4 w-4" />
          </button>
          {/* Templates gallery toggle */}
          <button
            onClick={() => { setTemplateGalleryOpen((v) => !v); setAudioOpen(false); setExportV2Open(false); }}
            title={templateGalleryOpen ? 'Close Templates' : 'Scene Templates v2'}
            className={`transition ${templateGalleryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <LayoutTemplate className="h-4 w-4" />
          </button>
          {/* Audio Traits toggle */}
          <button
            onClick={() => { setAudioOpen((v) => !v); setTemplateGalleryOpen(false); setExportV2Open(false); }}
            title={audioOpen ? 'Close Audio' : 'Audio Traits'}
            className={`transition ${audioOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Music className="h-4 w-4" />
          </button>
          {/* Export Pipeline v2 toggle */}
          <button
            onClick={() => { setExportV2Open((v) => !v); setTemplateGalleryOpen(false); setAudioOpen(false); }}
            title={exportV2Open ? 'Close Export v2' : 'Export Pipeline v2'}
            className={`transition ${exportV2Open ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Package className="h-4 w-4" />
          </button>
          {/* Minimap toggle */}
          <button
            onClick={() => setMinimapOpen((v) => !v)}
            title={minimapOpen ? 'Hide Minimap' : 'Show Minimap'}
            className={`transition ${minimapOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Map className="h-4 w-4" />
          </button>
          {/* Node Graph toggle */}
          <button
            onClick={() => { setNodeGraphOpen((v) => !v); setKeyframesOpen(false); }}
            title={nodeGraphOpen ? 'Close Node Graph' : 'Node Graph Editor'}
            className={`transition ${nodeGraphOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Network className="h-4 w-4" />
          </button>
          {/* Keyframe Editor toggle */}
          <button
            onClick={() => { setKeyframesOpen((v) => !v); setNodeGraphOpen(false); }}
            title={keyframesOpen ? 'Close Keyframes' : 'Animation Keyframes'}
            className={`transition ${keyframesOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Timer className="h-4 w-4" />
          </button>
          {/* Scene Search toggle */}
          <button
            onClick={() => setSceneSearchOpen((v) => !v)}
            title={sceneSearchOpen ? 'Close Scene Search' : 'Scene Search (Ctrl+F)'}
            className={`transition ${sceneSearchOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <SearchCode className="h-4 w-4" />
          </button>
          {/* Particle Traits toggle */}
          <button
            onClick={() => setParticlesOpen((v) => !v)}
            title={particlesOpen ? 'Close Particles' : 'Particle Traits'}
            className={`transition ${particlesOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Flame className="h-4 w-4" />
          </button>
          {/* LOD / Camera Culling toggle */}
          <button
            onClick={() => setLodOpen((v) => !v)}
            title={lodOpen ? 'Close LOD' : 'LOD / Camera Culling'}
            className={`transition ${lodOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Eye className="h-4 w-4" />
          </button>
          {/* Script Console toggle */}
          <button
            onClick={() => setConsoleOpen((v) => !v)}
            title={consoleOpen ? 'Close Console' : 'Script Console'}
            className={`transition ${consoleOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <TerminalIcon className="h-4 w-4" />
          </button>
          {/* Undo History toggle */}
          <button
            onClick={() => setUndoHistoryOpen((v) => !v)}
            title={undoHistoryOpen ? 'Close History' : 'Undo History'}
            className={`transition ${undoHistoryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <ClockIcon className="h-4 w-4" />
          </button>
          {/* Scene Outliner toggle */}
          <button
            onClick={() => setOutlinerOpen((v) => !v)}
            title={outlinerOpen ? 'Close Outliner' : 'Scene Outliner'}
            className={`transition ${outlinerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Layers className="h-4 w-4" />
          </button>
          {/* Material Editor toggle */}
          <button
            onClick={() => setMaterialOpen((v) => !v)}
            title={materialOpen ? 'Close Material Editor' : 'Material Editor'}
            className={`transition ${materialOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Palette className="h-4 w-4" />
          </button>
          {/* Physics Traits toggle */}
          <button
            onClick={() => setPhysicsOpen((v) => !v)}
            title={physicsOpen ? 'Close Physics' : 'Physics Traits'}
            className={`transition ${physicsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <Atom className="h-4 w-4" />
          </button>
          {/* Snapshot Diff toggle */}
          <button
            onClick={() => setSnapshotDiffOpen((v) => !v)}
            title={snapshotDiffOpen ? 'Close Diff' : 'Snapshot Diff'}
            className={`transition ${snapshotDiffOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
          >
            <GitCompare className="h-4 w-4" />
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

      {/* Scene Search overlay (Sprint S) */}
      <SceneSearchOverlay
        open={sceneSearchOpen}
        onClose={() => setSceneSearchOpen(false)}
      />

      {/* Sprint T: Script Console (fixed bottom panel) */}
      {consoleOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-30 h-[280px] border-t border-studio-border shadow-2xl">
          <ScriptConsole onClose={() => setConsoleOpen(false)} />
        </div>
      )}

      {/* Collaboration cursors (fixed overlay, pointer-events-none) */}
      <CollabCursors />

      {/* Sprint S: named collaboration cursors v2 */}
      {collabV2Open && (
        <CollabCursorsV2
          roomId="default-room"
          userName={typeof window !== 'undefined' ? (window.localStorage.getItem('holoscript-name') ?? 'Guest') : 'Guest'}
        />
      )}

    </>
  );
}

