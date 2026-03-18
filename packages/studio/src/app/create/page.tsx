'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { StudioHeader } from '@/components/StudioHeader';
import { SceneGraphPanel } from '@/components/scene/SceneGraphPanel';
import { TraitInspector } from '@/components/inspector/TraitInspector';
import { TraitPalette } from '@/components/inspector/TraitPalette';
import { BrittneyChatPanel } from '@/components/ai/BrittneyChatPanel';
import { AssetLibrary } from '@/components/assets/AssetLibrary';
import { SplatCaptureWizard } from '@/components/assets/SplatCaptureWizard';
import {
  useSceneStore,
  useEditorStore,
  useSceneGraphStore,
  usePanelVisibilityStore,
} from '@/lib/stores';
import { useAssetStore } from '@/components/assets/useAssetStore';
import { decodeSceneFromURL } from '@/lib/serializer';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import { useStudioBridge } from '@/hooks/useStudioBridge';
import { HistoryPanel } from '@/components/HistoryPanel';
import { GovernancePanel } from '@/components/history/GovernancePanel';
import { ConformanceSuitePanel } from '@/components/validation/ConformanceSuitePanel';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useTemporalStore } from '@/lib/historyStore';
import { useProjectStore } from '@/lib/projectStore';
import { AssetDropOverlay } from '@/components/assets/AssetDropProcessor';
import { StudioErrorBoundary } from '@/components/ui/StudioErrorBoundary';
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
  Palette,
  Atom,
  GitCompare,
  Music2,
  Move3d,
  Bot,
  Sun,
  SlidersHorizontal,
  Puzzle,
  Keyboard,
  Gauge,
  Pencil,
  PaintBucket,
  Shield,
} from 'lucide-react';
import type { GizmoMode, ArtMode, StudioMode } from '@/lib/stores';
import { PanelSplitter } from '@/components/ui/PanelSplitter';
import { CreatorLayout } from '@/components/layouts/CreatorLayout';
import { FilmmakerLayout } from '@/components/layouts/FilmmakerLayout';
import { ResponsiveStudioLayout } from '@/components/layouts/ResponsiveStudioLayout';
import { CharacterLayout } from '@/components/character/layout/CharacterLayout';

const ScenarioLauncher = dynamic(
  () =>
    import('@/components/scenarios/ScenarioLauncher').then((m) => ({
      default: m.ScenarioLauncher,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Loading scenarios...
      </div>
    ),
  }
);

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { ssr: false, loading: () => <ViewportSkeleton /> }
);

const HoloScriptEditor = dynamic(
  () =>
    import('@/components/editor/HoloScriptEditor').then((m) => ({ default: m.HoloScriptEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Loading editor…
      </div>
    ),
  }
);

const ShaderEditorPanel = dynamic(
  () =>
    import('@/components/shader-editor/ShaderEditorPanel').then((m) => ({
      default: m.ShaderEditorPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted">
        Loading shader editor…
      </div>
    ),
  }
);

const NodeGraphEditor = dynamic(
  () =>
    import('@/components/node-graph/NodeGraphEditor').then((m) => ({ default: m.NodeGraphEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Loading node graph…
      </div>
    ),
  }
);

const CodebaseInspectorPanel = dynamic(
  () =>
    import('@/components/visualization/CodebaseInspectorPanel').then((m) => ({
      default: m.CodebaseInspectorPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Indexing workspace…
      </div>
    ),
  }
);

const TemplatePicker = dynamic(
  () =>
    import('@/components/templates/TemplatePicker').then((m) => ({ default: m.TemplatePicker })),
  { ssr: false }
);

const AnimationTimeline = dynamic(
  () =>
    import('@/components/timeline/AnimationTimeline').then((m) => ({
      default: m.AnimationTimeline,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Loading timeline…
      </div>
    ),
  }
);

const AIMaterialPanel = dynamic(
  () => import('@/components/ai/AIMaterialPanel').then((m) => ({ default: m.AIMaterialPanel })),
  { ssr: false }
);

const SharePanel = dynamic(
  () => import('@/components/share/SharePanel').then((m) => ({ default: m.SharePanel })),
  { ssr: false }
);

// CollabCursors V1 removed — consolidated into CollabCursorsV2
// CollabStatusDot is still exported from the V1 file (not deprecated)
const CollabStatusDot = dynamic(
  () => import('@/components/collaboration/CollabCursors').then((m) => ({ default: m.CollabStatusDot })),
  { ssr: false }
);

const SceneCritiquePanel = dynamic(
  () =>
    import('@/components/ai/SceneCritiquePanel').then((m) => ({ default: m.SceneCritiquePanel })),
  { ssr: false }
);

const AssetPackPanel = dynamic(
  () => import('@/components/assets/AssetPackPanel').then((m) => ({ default: m.AssetPackPanel })),
  { ssr: false }
);

const SceneVersionPanel = dynamic(
  () =>
    import('@/components/versionControl/SceneVersionPanel').then((m) => ({
      default: m.SceneVersionPanel,
    })),
  { ssr: false }
);

const REPLPanel = dynamic(
  () => import('@/components/repl/REPLPanel').then((m) => ({ default: m.REPLPanel })),
  { ssr: false }
);

const GenerativeArtPanel = dynamic(
  () =>
    import('@/components/generative/GenerativeArtPanel').then((m) => ({
      default: m.GenerativeArtPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-xs text-studio-muted animate-pulse">
        Loading generative art…
      </div>
    ),
  }
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
  () =>
    import('@/components/ai/SceneGeneratorPanel').then((m) => ({ default: m.SceneGeneratorPanel })),
  { ssr: false }
);

const ProfilerPanel = dynamic(
  () => import('@/components/profiler/ProfilerPanel').then((m) => ({ default: m.ProfilerPanel })),
  { ssr: false }
);

const ProfilerOverlay = dynamic(
  () =>
    import('@/components/profiler/ProfilerOverlay').then((m) => ({ default: m.ProfilerOverlay })),
  { ssr: false }
);

const DebuggerPanel = dynamic(
  () => import('@/components/debugger/DebuggerPanel').then((m) => ({ default: m.DebuggerPanel })),
  { ssr: false }
);

const SnapshotGallery = dynamic(
  () =>
    import('@/components/gallery/SnapshotGallery').then((m) => ({ default: m.SnapshotGallery })),
  { ssr: false }
);

const AssetLibraryPanel = dynamic(
  () =>
    import('@/components/assets/AssetLibraryPanel').then((m) => ({ default: m.AssetLibraryPanel })),
  { ssr: false }
);

const TemplateGallery = dynamic(
  () =>
    import('@/components/templates/TemplateGallery').then((m) => ({ default: m.TemplateGallery })),
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
  () =>
    import('@/components/export/ExportPipelinePanel').then((m) => ({
      default: m.ExportPipelinePanel,
    })),
  { ssr: false }
);

const NodeGraphPanel = dynamic(
  () =>
    import('@/components/node-graph/NodeGraphPanel').then((m) => ({ default: m.NodeGraphPanel })),
  { ssr: false }
);

const KeyframeEditor = dynamic(
  () =>
    import('@/components/keyframes/KeyframeEditor').then((m) => ({ default: m.KeyframeEditor })),
  { ssr: false }
);

const SceneSearchOverlay = dynamic(
  () =>
    import('@/components/search/SceneSearchOverlay').then((m) => ({
      default: m.SceneSearchOverlay,
    })),
  { ssr: false }
);

const ParticlePanel = dynamic(
  () => import('@/components/particles/ParticlePanel').then((m) => ({ default: m.ParticlePanel })),
  { ssr: false }
);

// UndoHistorySidebar removed — consolidated into HistoryPanel (canonical)
// const UndoHistorySidebar = dynamic(
//   () => import('@/components/history/UndoHistorySidebar').then((m) => ({ default: m.UndoHistorySidebar })),
//   { ssr: false }
// );

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
  () =>
    import('@/components/diff/SnapshotDiffPanel').then((m) => ({ default: m.SnapshotDiffPanel })),
  { ssr: false }
);

const AudioVisualizerPanel = dynamic(
  () =>
    import('@/components/audio/AudioVisualizerPanel').then((m) => ({
      default: m.AudioVisualizerPanel,
    })),
  { ssr: false }
);

// @deprecated GlslShaderPanel removed — shader editing consolidated into ShaderEditorPanel
// const GlslShaderPanel = dynamic(
//   () => import('@/components/shader/ShaderEditorPanel').then((m) => ({ default: m.GlslShaderPanel })),
//   { ssr: false }
// );

const MultiTransformPanel = dynamic(
  () =>
    import('@/components/transform/MultiTransformPanel').then((m) => ({
      default: m.MultiTransformPanel,
    })),
  { ssr: false }
);

const CritiquePanel = dynamic(
  () => import('@/components/critique/CritiquePanel').then((m) => ({ default: m.CritiquePanel })),
  { ssr: false }
);

const EnvironmentPanel = dynamic(
  () =>
    import('@/components/environment/EnvironmentPanel').then((m) => ({
      default: m.EnvironmentPanel,
    })),
  { ssr: false }
);

const AssetPackStorePanel = dynamic(
  () => import('@/components/store/AssetPackPanel').then((m) => ({ default: m.AssetPackPanel })),
  { ssr: false }
);


// ProfilerPanel2 removed — duplicate of ProfilerPanel (line 263)



// TraitRegistryPanel removed — misnamed duplicate of RemotePreviewPanel (line 484)


const AiSceneGeneratorPanel = dynamic(
  () =>
    import('@/components/generator/SceneGeneratorPanel').then((m) => ({
      default: m.SceneGeneratorPanel,
    })),
  { ssr: false }
);

const NodeInspectorPanel = dynamic(
  () =>
    import('@/components/inspector/NodeInspectorPanel').then((m) => ({
      default: m.NodeInspectorPanel,
    })),
  { ssr: false }
);

const HotkeyMapOverlay = dynamic(
  () =>
    import('@/components/hotkeys/HotkeyMapOverlay').then((m) => ({ default: m.HotkeyMapOverlay })),
  { ssr: false }
);

const PluginMarketplacePanel = dynamic(
  () =>
    import('@/components/plugins/PluginMarketplacePanel').then((m) => ({
      default: m.PluginMarketplacePanel,
    })),
  { ssr: false }
);

const SandboxedPluginsPanel = dynamic(
  () =>
    import('@/components/plugins/SandboxedPluginsPanel').then((m) => ({
      default: m.SandboxedPluginsPanel,
    })),
  { ssr: false }
);

const AgentMonitorPanel = dynamic(
  () =>
    import('@/components/ai/AgentMonitorPanel').then((m) => ({
      default: m.AgentMonitorPanel,
    })),
  { ssr: false }
);

const SimpleMaterialPanel = dynamic(
  () =>
    import('@/components/materials/SimpleMaterialPanel').then((m) => ({
      default: m.SimpleMaterialPanel,
    })),
  { ssr: false }
);

const MultiplayerPanel = dynamic(
  () => import('@/components/collaboration/MultiplayerPanel').then((m) => ({ default: m.MultiplayerPanel })),
  { ssr: false }
);

const LodPanel = dynamic(
  () => import('@/components/lod/LodPanel').then((m) => ({ default: m.LodPanel })),
  { ssr: false }
);

const RemotePreviewPanel = dynamic(
  () => import('@/components/remote/RemotePreviewPanel').then((m) => ({ default: m.RemotePreviewPanel })),
  { ssr: false }
);

const ScriptConsole = dynamic(
  () => import('@/components/console/ScriptConsole').then((m) => ({ default: m.ScriptConsole })),
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

function ViewportToolbar({
  profilerOpen,
  onToggleProfiler,
}: {
  profilerOpen: boolean;
  onToggleProfiler: () => void;
}) {
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const setGizmoMode = useEditorStore((s) => s.setGizmoMode);
  const artMode = useEditorStore((s) => s.artMode);
  const setArtMode = useEditorStore((s) => s.setArtMode);
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
    <div className="absolute left-2 sm:left-3 top-2 sm:top-3 flex items-center gap-0.5 sm:gap-1 rounded-lg border border-studio-border/60 bg-studio-panel/90 p-0.5 sm:p-1 backdrop-blur">
      {/* Undo / Redo */}
      <button
        onClick={() => undo()}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="studio-header-btn rounded-md p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-30"
      >
        <RotateCcw className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => redo()}
        disabled={!canRedo}
        title="Redo (Ctrl+Shift+Z)"
        className="studio-header-btn rounded-md p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text disabled:opacity-30"
      >
        <RotateCw className="h-3.5 w-3.5" />
      </button>

      {/* Divider */}
      <div className="mx-0.5 sm:mx-1 h-4 w-px bg-studio-border/60" />

      {/* Gizmo mode buttons */}
      {GIZMO_BUTTONS.map(({ mode, icon: Icon, label }) => (
        <button
          key={mode}
          onClick={() => setGizmoMode(mode)}
          title={label}
          className={`studio-header-btn rounded-md p-2 transition ${
            gizmoMode === mode
              ? 'bg-studio-accent text-white shadow-md'
              : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      ))}

      {/* Divider — hidden on very small screens */}
      <div className="mx-0.5 sm:mx-1 h-4 w-px bg-studio-border/60 hidden sm:block" />

      {/* Art mode buttons — hidden on very small screens to prevent overflow */}
      {(
        [
          { mode: 'sketch' as ArtMode, icon: Pencil, title: 'Sketch mode — draw 3D strokes (S)' },
          { mode: 'paint' as ArtMode, icon: PaintBucket, title: 'Texture paint mode (P)' },
          { mode: 'generative' as ArtMode, icon: Sparkles, title: 'Generative art mode (G)' },
        ] as const
      ).map(({ mode, icon: Icon, title }) => (
        <button
          key={mode}
          onClick={() => setArtMode(artMode === mode ? 'none' : mode)}
          title={title}
          className={`studio-header-btn rounded-md p-2 transition hidden sm:block ${
            artMode === mode
              ? 'bg-violet-500/30 text-violet-300 shadow-md ring-1 ring-violet-500/50'
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
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, existingCode: code || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'Generation failed');
        return;
      }
      setCode(data.code);
      setOpen(false);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setIsGenerating(false);
    }
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
      {error && (
        <div className="mb-2 rounded-lg border border-studio-error/30 bg-studio-error/10 px-3 py-1.5 text-[11px] text-studio-error">
          {error}
        </div>
      )}
      <button
        disabled={isGenerating || !prompt.trim()}
        onClick={handleGenerate}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-studio-accent py-2 text-xs font-medium text-white transition hover:bg-studio-accent/80 disabled:opacity-40"
      >
        {isGenerating ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
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
  const artMode = useEditorStore((s) => s.artMode);
  const studioMode = useEditorStore((s) => s.studioMode);

  // Panel widths (px) — driven by PanelSplitter drag
  const [leftPanelW, setLeftPanelW] = useState(256);
  const [bottomPanelH, setBottomPanelH] = useState(224);
  const [rightPanelW, setRightPanelW] = useState(288);

  // ── Panel visibility — centralised in panelVisibilityStore ────────────────
  const paletteOpen = usePanelVisibilityStore((s) => s.paletteOpen);
  const setPaletteOpen = usePanelVisibilityStore((s) => s.setPaletteOpen);
  const chatOpen = usePanelVisibilityStore((s) => s.chatOpen);
  const setChatOpen = usePanelVisibilityStore((s) => s.setChatOpen);
  const toggleChatOpen = usePanelVisibilityStore((s) => s.toggleChatOpen);
  const historyOpen = usePanelVisibilityStore((s) => s.historyOpen);
  const setHistoryOpen = usePanelVisibilityStore((s) => s.setHistoryOpen);
  const toggleHistoryOpen = usePanelVisibilityStore((s) => s.toggleHistoryOpen);
  const profilerOpen = usePanelVisibilityStore((s) => s.profilerOpen);
  const setProfilerOpen = usePanelVisibilityStore((s) => s.setProfilerOpen);
  const toggleProfilerOpen = usePanelVisibilityStore((s) => s.toggleProfilerOpen);
  const shaderEditorOpen = usePanelVisibilityStore((s) => s.shaderEditorOpen);
  const setShaderEditorOpen = usePanelVisibilityStore((s) => s.setShaderEditorOpen);
  const toggleShaderEditorOpen = usePanelVisibilityStore((s) => s.toggleShaderEditorOpen);
  const timelineOpen = usePanelVisibilityStore((s) => s.timelineOpen);
  const setTimelineOpen = usePanelVisibilityStore((s) => s.setTimelineOpen);
  const toggleTimelineOpen = usePanelVisibilityStore((s) => s.toggleTimelineOpen);
  const templatePickerOpen = usePanelVisibilityStore((s) => s.templatePickerOpen);
  const setTemplatePickerOpen = usePanelVisibilityStore((s) => s.setTemplatePickerOpen);
  const aiMaterialOpen = usePanelVisibilityStore((s) => s.aiMaterialOpen);
  const setAiMaterialOpen = usePanelVisibilityStore((s) => s.setAiMaterialOpen);
  const toggleAiMaterialOpen = usePanelVisibilityStore((s) => s.toggleAiMaterialOpen);
  const shareOpen = usePanelVisibilityStore((s) => s.shareOpen);
  const setShareOpen = usePanelVisibilityStore((s) => s.setShareOpen);
  const toggleShareOpen = usePanelVisibilityStore((s) => s.toggleShareOpen);
  const critiqueOpen = usePanelVisibilityStore((s) => s.critiqueOpen);
  const setCritiqueOpen = usePanelVisibilityStore((s) => s.setCritiqueOpen);
  const toggleCritiqueOpen = usePanelVisibilityStore((s) => s.toggleCritiqueOpen);
  const assetPackOpen = usePanelVisibilityStore((s) => s.assetPackOpen);
  const setAssetPackOpen = usePanelVisibilityStore((s) => s.setAssetPackOpen);
  const toggleAssetPackOpen = usePanelVisibilityStore((s) => s.toggleAssetPackOpen);
  const versionsOpen = usePanelVisibilityStore((s) => s.versionsOpen);
  const setVersionsOpen = usePanelVisibilityStore((s) => s.setVersionsOpen);
  const toggleVersionsOpen = usePanelVisibilityStore((s) => s.toggleVersionsOpen);
  const replOpen = usePanelVisibilityStore((s) => s.replOpen);
  const setReplOpen = usePanelVisibilityStore((s) => s.setReplOpen);
  const toggleReplOpen = usePanelVisibilityStore((s) => s.toggleReplOpen);
  const registryOpen = usePanelVisibilityStore((s) => s.registryOpen);
  const setRegistryOpen = usePanelVisibilityStore((s) => s.setRegistryOpen);
  const toggleRegistryOpen = usePanelVisibilityStore((s) => s.toggleRegistryOpen);
  const remoteOpen = usePanelVisibilityStore((s) => s.remoteOpen);
  const setRemoteOpen = usePanelVisibilityStore((s) => s.setRemoteOpen);
  const toggleRemoteOpen = usePanelVisibilityStore((s) => s.toggleRemoteOpen);
  const exportOpen = usePanelVisibilityStore((s) => s.exportOpen);
  const setExportOpen = usePanelVisibilityStore((s) => s.setExportOpen);
  const toggleExportOpen = usePanelVisibilityStore((s) => s.toggleExportOpen);
  const generatorOpen = usePanelVisibilityStore((s) => s.generatorOpen);
  const setGeneratorOpen = usePanelVisibilityStore((s) => s.setGeneratorOpen);
  const toggleGeneratorOpen = usePanelVisibilityStore((s) => s.toggleGeneratorOpen);
  const multiplayerOpen = usePanelVisibilityStore((s) => s.multiplayerOpen);
  const setMultiplayerOpen = usePanelVisibilityStore((s) => s.setMultiplayerOpen);
  const toggleMultiplayerOpen = usePanelVisibilityStore((s) => s.toggleMultiplayerOpen);
  const debuggerOpen = usePanelVisibilityStore((s) => s.debuggerOpen);
  const setDebuggerOpen = usePanelVisibilityStore((s) => s.setDebuggerOpen);
  const toggleDebuggerOpen = usePanelVisibilityStore((s) => s.toggleDebuggerOpen);
  const snapshotsOpen = usePanelVisibilityStore((s) => s.snapshotsOpen);
  const setSnapshotsOpen = usePanelVisibilityStore((s) => s.setSnapshotsOpen);
  const toggleSnapshotsOpen = usePanelVisibilityStore((s) => s.toggleSnapshotsOpen);
  const assetLibOpen = usePanelVisibilityStore((s) => s.assetLibOpen);
  const setAssetLibOpen = usePanelVisibilityStore((s) => s.setAssetLibOpen);
  const toggleAssetLibOpen = usePanelVisibilityStore((s) => s.toggleAssetLibOpen);
  const templateGalleryOpen = usePanelVisibilityStore((s) => s.templateGalleryOpen);
  const setTemplateGalleryOpen = usePanelVisibilityStore((s) => s.setTemplateGalleryOpen);
  const toggleTemplateGalleryOpen = usePanelVisibilityStore((s) => s.toggleTemplateGalleryOpen);
  const minimapOpen = usePanelVisibilityStore((s) => s.minimapOpen);
  const setMinimapOpen = usePanelVisibilityStore((s) => s.setMinimapOpen);
  const toggleMinimapOpen = usePanelVisibilityStore((s) => s.toggleMinimapOpen);
  const audioOpen = usePanelVisibilityStore((s) => s.audioOpen);
  const setAudioOpen = usePanelVisibilityStore((s) => s.setAudioOpen);
  const toggleAudioOpen = usePanelVisibilityStore((s) => s.toggleAudioOpen);
  const exportV2Open = usePanelVisibilityStore((s) => s.exportV2Open);
  const setExportV2Open = usePanelVisibilityStore((s) => s.setExportV2Open);
  const toggleExportV2Open = usePanelVisibilityStore((s) => s.toggleExportV2Open);
  const nodeGraphOpen = usePanelVisibilityStore((s) => s.nodeGraphOpen);
  const setNodeGraphOpen = usePanelVisibilityStore((s) => s.setNodeGraphOpen);
  const toggleNodeGraphOpen = usePanelVisibilityStore((s) => s.toggleNodeGraphOpen);
  const keyframesOpen = usePanelVisibilityStore((s) => s.keyframesOpen);
  const setKeyframesOpen = usePanelVisibilityStore((s) => s.setKeyframesOpen);
  const toggleKeyframesOpen = usePanelVisibilityStore((s) => s.toggleKeyframesOpen);
  const sceneSearchOpen = usePanelVisibilityStore((s) => s.sceneSearchOpen);
  const setSceneSearchOpen = usePanelVisibilityStore((s) => s.setSceneSearchOpen);
  const toggleSceneSearchOpen = usePanelVisibilityStore((s) => s.toggleSceneSearchOpen);
  const particlesOpen = usePanelVisibilityStore((s) => s.particlesOpen);
  const setParticlesOpen = usePanelVisibilityStore((s) => s.setParticlesOpen);
  const toggleParticlesOpen = usePanelVisibilityStore((s) => s.toggleParticlesOpen);
  const lodOpen = usePanelVisibilityStore((s) => s.lodOpen);
  const setLodOpen = usePanelVisibilityStore((s) => s.setLodOpen);
  const toggleLodOpen = usePanelVisibilityStore((s) => s.toggleLodOpen);
  const consoleOpen = usePanelVisibilityStore((s) => s.consoleOpen);
  const setConsoleOpen = usePanelVisibilityStore((s) => s.setConsoleOpen);
  const toggleConsoleOpen = usePanelVisibilityStore((s) => s.toggleConsoleOpen);
  const undoHistoryOpen = usePanelVisibilityStore((s) => s.undoHistoryOpen);
  const setUndoHistoryOpen = usePanelVisibilityStore((s) => s.setUndoHistoryOpen);
  const toggleUndoHistoryOpen = usePanelVisibilityStore((s) => s.toggleUndoHistoryOpen);
  const outlinerOpen = usePanelVisibilityStore((s) => s.outlinerOpen);
  const setOutlinerOpen = usePanelVisibilityStore((s) => s.setOutlinerOpen);
  const toggleOutlinerOpen = usePanelVisibilityStore((s) => s.toggleOutlinerOpen);
  const materialOpen = usePanelVisibilityStore((s) => s.materialOpen);
  const setMaterialOpen = usePanelVisibilityStore((s) => s.setMaterialOpen);
  const toggleMaterialOpen = usePanelVisibilityStore((s) => s.toggleMaterialOpen);
  const physicsOpen = usePanelVisibilityStore((s) => s.physicsOpen);
  const setPhysicsOpen = usePanelVisibilityStore((s) => s.setPhysicsOpen);
  const togglePhysicsOpen = usePanelVisibilityStore((s) => s.togglePhysicsOpen);
  const snapshotDiffOpen = usePanelVisibilityStore((s) => s.snapshotDiffOpen);
  const setSnapshotDiffOpen = usePanelVisibilityStore((s) => s.setSnapshotDiffOpen);
  const toggleSnapshotDiffOpen = usePanelVisibilityStore((s) => s.toggleSnapshotDiffOpen);
  const audioVisualizerOpen = usePanelVisibilityStore((s) => s.audioVisualizerOpen);
  const setAudioVisualizerOpen = usePanelVisibilityStore((s) => s.setAudioVisualizerOpen);
  const toggleAudioVisualizerOpen = usePanelVisibilityStore((s) => s.toggleAudioVisualizerOpen);
  const multiTransformOpen = usePanelVisibilityStore((s) => s.multiTransformOpen);
  const setMultiTransformOpen = usePanelVisibilityStore((s) => s.setMultiTransformOpen);
  const toggleMultiTransformOpen = usePanelVisibilityStore((s) => s.toggleMultiTransformOpen);
  const environmentOpen = usePanelVisibilityStore((s) => s.environmentOpen);
  const setEnvironmentOpen = usePanelVisibilityStore((s) => s.setEnvironmentOpen);
  const toggleEnvironmentOpen = usePanelVisibilityStore((s) => s.toggleEnvironmentOpen);
  const inspectorOpen = usePanelVisibilityStore((s) => s.inspectorOpen);
  const setInspectorOpen = usePanelVisibilityStore((s) => s.setInspectorOpen);
  const toggleInspectorOpen = usePanelVisibilityStore((s) => s.toggleInspectorOpen);
  const hotkeyOpen = usePanelVisibilityStore((s) => s.hotkeyOpen);
  const setHotkeyOpen = usePanelVisibilityStore((s) => s.setHotkeyOpen);
  const toggleHotkeyOpen = usePanelVisibilityStore((s) => s.toggleHotkeyOpen);
  const pluginsOpen = usePanelVisibilityStore((s) => s.pluginsOpen);
  const setPluginsOpen = usePanelVisibilityStore((s) => s.setPluginsOpen);
  const togglePluginsOpen = usePanelVisibilityStore((s) => s.togglePluginsOpen);
  const sandboxedPluginsOpen = usePanelVisibilityStore((s) => s.sandboxedPluginsOpen);
  const setSandboxedPluginsOpen = usePanelVisibilityStore((s) => s.setSandboxedPluginsOpen);
  const toggleSandboxedPluginsOpen = usePanelVisibilityStore((s) => s.toggleSandboxedPluginsOpen);
  const splatWizardOpen = usePanelVisibilityStore((s) => s.splatWizardOpen);
  const setSplatWizardOpen = usePanelVisibilityStore((s) => s.setSplatWizardOpen);
  const toggleExclusive = usePanelVisibilityStore((s) => s.toggleExclusive);
  const agentMonitorOpen = usePanelVisibilityStore((s) => s.agentMonitorOpen);
  const setAgentMonitorOpen = usePanelVisibilityStore((s) => s.setAgentMonitorOpen);

  // Non-panel state (kept local — layout dimensions, left tab)
  const [leftTab, setLeftTab] = useState<'scene' | 'assets' | 'code' | 'graph' | 'codebase'>('scene');
  const [spatialBlameTooltip, setSpatialBlameTooltip] = useState({ visible: false, x: 0, y: 0, content: '' });

  // ── Governance & Conformance — driven by editorStore so StudioHeader Validate button works ──
  const showGovernancePanel = useEditorStore((s) => s.showGovernancePanel);
  const setShowGovernancePanel = useEditorStore((s) => s.setShowGovernancePanel);
  const showConformancePanel = useEditorStore((s) => s.showConformancePanel);
  const setShowConformancePanel = useEditorStore((s) => s.setShowConformancePanel);

  // Undo/Redo keyboard shortcuts
  useUndoRedo();

  useOllamaStatus();

  // ── StudioBridge — AST mutation engine with history tracking ────────────────
  const emptyAST = useMemo(() => ({
    type: 'Composition' as const,
    name: 'untitled',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  }), []);
  const {
    bridge: studioBridge,
    apply: bridgeApply,
    undo: bridgeUndo,
    redo: bridgeRedo,
    canUndo: bridgeCanUndo,
    canRedo: bridgeCanRedo,
  } = useStudioBridge(emptyAST);

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

      {/* ── Layout: switches based on Studio Mode ────────────────────────────── */}
      {studioMode === 'creator' ? (
        <CreatorLayout
          viewportSlot={
            <div className="relative h-full w-full">
              <StudioErrorBoundary>
                <SceneRenderer r3fTree={r3fTree} profilerOpen={profilerOpen} />
              </StudioErrorBoundary>
              <AssetDropOverlay />
            </div>
          }
        />
      ) : studioMode === 'filmmaker' ? (
        <FilmmakerLayout
          viewportSlot={
            <div className="relative h-full w-full">
              <StudioErrorBoundary>
                <SceneRenderer r3fTree={r3fTree} profilerOpen={profilerOpen} />
              </StudioErrorBoundary>
              <AssetDropOverlay />
            </div>
          }
        />
      ) : studioMode === 'character' ? (
        <div className="flex flex-1 overflow-hidden">
          <CharacterLayout />
        </div>
      ) : studioMode === 'scenarios' ? (
        <div className="flex flex-1 overflow-hidden">
          <ScenarioLauncher />
        </div>
      ) : (
        <ResponsiveStudioLayout
          leftTitle="Scene"
          rightTitle="Properties"
        >
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT: Scene Graph + Assets tabbed panel (hidden on mobile, collapsible on tablet) */}
          <div
            className="hidden sm:flex shrink-0 flex-col max-w-[50vw]"
            style={{ width: leftPanelW }}
          >
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
                            <button
                              onClick={() => setLeftTab('codebase')}
                              className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-[11px] font-medium transition ${
                                leftTab === 'codebase'
                                  ? 'border-b-2 border-studio-accent text-studio-accent'
                                  : 'text-studio-muted hover:text-studio-text'
                              }`}
                            >
                              <Network className="h-3.5 w-3.5" />
                              Index
                            </button>
              </button>
            </div>

            {/* Panel content */}
            <div className="min-h-0 flex-1 overflow-hidden">
              {leftTab === 'scene' ? (
                <SceneGraphPanel />
              ) : leftTab === 'assets' ? (
                <AssetLibrary onOpenSplatWizard={() => setSplatWizardOpen(true)} />
              ) : leftTab === 'graph' ? (
                <NodeGraphEditor
                  onCompile={(glsl) => {
                    setShaderEditorOpen(true);
                    console.log('[NodeGraph] compiled GLSL', glsl.slice(0, 60));
                  }}
                />
              ) : (
                <HoloScriptEditor height="100%" />
                            ) : leftTab === 'codebase' ? (
                              <CodebaseInspectorPanel />
                            ) : (
                              <HoloScriptEditor height="100%" />
              )}
            </div>
          </div>

          {/* ── Left splitter (hidden on mobile) ── */}
          <div className="hidden sm:block">
            <PanelSplitter
              direction="horizontal"
              onDelta={(d) => setLeftPanelW((w) => Math.max(160, Math.min(w + d, 520)))}
            />
          </div>

          {/* CENTER: Viewport + Inspector split */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Viewport */}
            <div className="relative flex-1 overflow-hidden">
              {/* Generative Art Panel — replaces viewport when artMode===generative */}
              {artMode === 'generative' ? (
                <StudioErrorBoundary label="Generative Art">
                  <GenerativeArtPanel />
                </StudioErrorBoundary>
              ) : (
                <StudioErrorBoundary label="3D Viewport">
                  <SceneRenderer r3fTree={r3fTree} profilerOpen={profilerOpen} />
                </StudioErrorBoundary>
              )}
              <ViewportToolbar profilerOpen={profilerOpen} onToggleProfiler={toggleProfilerOpen} />
              <AIPromptOverlay />
              <ProfilerOverlay active={profilerOpen} />
              <AssetDropOverlay />
              <MinimapOverlay active={minimapOpen} onClose={() => setMinimapOpen(false)} />

              {/* Template picker shortcut */}
              <button
                onClick={() => setTemplatePickerOpen(true)}
                title="Browse scene templates"
                className="absolute right-3 top-14 z-10 flex items-center gap-1 rounded-lg bg-studio-panel/80 px-2.5 py-1.5 text-[10px] text-studio-muted backdrop-blur hover:bg-studio-surface hover:text-studio-text transition"
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
                      {e.line ? `Line ${e.line}: ` : ''}
                      {e.message}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inspector (bottom strip) — Shader Editor — Animation Timeline */}
            {/* ── Bottom splitter ── */}
            <PanelSplitter
              direction="vertical"
              onDelta={(d) => setBottomPanelH((h) => Math.max(120, Math.min(h - d, 600)))}
            />
            <div
              className="shrink-0"
              style={{
                height:
                  shaderEditorOpen || timelineOpen ? Math.max(bottomPanelH, 320) : bottomPanelH,
              }}
            >
              {shaderEditorOpen ? (
                <StudioErrorBoundary label="Shader Editor">
                  <ShaderEditorPanel onClose={() => setShaderEditorOpen(false)} />
                </StudioErrorBoundary>
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
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <HistoryPanel onClose={() => setHistoryOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: AI Material Generator */}
          {aiMaterialOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <AIMaterialPanel onClose={() => setAiMaterialOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Share Panel */}
          {shareOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <SharePanel onClose={() => setShareOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Scene Critique */}
          {critiqueOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <SceneCritiquePanel onClose={() => setCritiqueOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Asset Pack Importer */}
          {assetPackOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <AssetPackPanel onClose={() => setAssetPackOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Scene Versions */}
          {versionsOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <SceneVersionPanel sceneId="scene-1" onClose={() => setVersionsOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: REPL */}
          {replOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <REPLPanel onClose={() => setReplOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Pack Registry */}
          {registryOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <RegistryPanel onClose={() => setRegistryOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Mobile Remote */}
          {remoteOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <QRRemotePanel onClose={() => setRemoteOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Export */}
          {exportOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <ExportPanel onClose={() => setExportOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: AI Generator */}
          {generatorOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <SceneGeneratorPanel onClose={() => setGeneratorOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Profiler */}
          {profilerOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <ProfilerPanel onClose={() => setProfilerOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Multiplayer */}
          {multiplayerOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <MultiplayerPanel onClose={() => setMultiplayerOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Debugger */}
          {debuggerOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <DebuggerPanel onClose={() => setDebuggerOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Snapshot Gallery */}
          {snapshotsOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <SnapshotGallery onClose={() => setSnapshotsOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Asset Library v2 */}
          {assetLibOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <AssetLibraryPanel onClose={() => setAssetLibOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Template Gallery */}
          {templateGalleryOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <TemplateGallery onClose={() => setTemplateGalleryOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Audio Traits */}
          {audioOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <AudioTraitPanel onClose={() => setAudioOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Export Pipeline v2 */}
          {exportV2Open && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <ExportPipelinePanel onClose={() => setExportV2Open(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Node Graph Editor */}
          {nodeGraphOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <NodeGraphPanel onClose={() => setNodeGraphOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Keyframe Editor */}
          {keyframesOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <KeyframeEditor onClose={() => setKeyframesOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Particle Traits */}
          {particlesOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <ParticlePanel onClose={() => setParticlesOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: LOD / Camera Culling */}
          {lodOpen && (
            <>
              <PanelSplitter
                direction="horizontal"
                onDelta={(d) => setRightPanelW((w) => Math.max(180, Math.min(w - d, 520)))}
              />
              <div className="flex shrink-0 flex-col" style={{ width: rightPanelW }}>
                <LodPanel onClose={() => setLodOpen(false)} />
              </div>
            </>
          )}

          {/* RIGHT RAIL: Undo History — consolidated to HistoryPanel (canonical) */}
          {undoHistoryOpen && (
            <div className="flex w-64 shrink-0 flex-col border-l border-studio-border">
              <HistoryPanel onClose={() => setUndoHistoryOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Scene Outliner */}
          {outlinerOpen && (
            <div className="flex w-64 shrink-0 flex-col border-l border-studio-border">
              <SceneOutliner />
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

          {/* RIGHT RAIL: Audio Visualizer */}
          {audioVisualizerOpen && (
            <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
              <AudioVisualizerPanel onClose={() => setAudioVisualizerOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: GLSL Shader Editor
           * @deprecated GlslShaderPanel removed — shader editing is now handled by
           * the canonical ShaderEditorPanel in the bottom panel (lines 813-815).
           * The duplicate right-rail instance was removed during component consolidation.
           */}

          {/* RIGHT RAIL: Multi-Object Transform */}
          {multiTransformOpen && (
            <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
              <MultiTransformPanel onClose={() => setMultiTransformOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Scene Critique */}
          {critiqueOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <CritiquePanel onClose={() => setCritiqueOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Environment Builder */}
          {environmentOpen && (
            <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
              <EnvironmentPanel onClose={() => setEnvironmentOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Asset Pack Store */}
          {assetPackOpen && (
            <div className="flex w-96 shrink-0 flex-col border-l border-studio-border">
              <AssetPackPanel onClose={() => setAssetPackOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Performance Profiler */}
          {profilerOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <ProfilerPanel onClose={() => setProfilerOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Governance & Spatial Blame */}
          {showGovernancePanel && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border bg-slate-900 z-20">
              <GovernancePanel />
            </div>
          )}

          {/* RIGHT RAIL: Conformance Suite Validator — toggled by StudioHeader Validate button */}
          {showConformancePanel && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border bg-slate-900 z-20">
              <ConformanceSuitePanel onClose={() => setShowConformancePanel(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Agent Monitor Panel */}
          {agentMonitorOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border bg-slate-900 z-20">
              <AgentMonitorPanel onClose={() => setAgentMonitorOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Simple Material Editor */}
          {materialOpen && (
            <div className="flex w-72 shrink-0 flex-col border-l border-studio-border bg-slate-900 z-20">
              <SimpleMaterialPanel onClose={() => setMaterialOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Trait Registry */}
          {registryOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <TraitRegistryPanel onClose={() => setRegistryOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Remote Preview */}
          {remoteOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <RemotePreviewPanel onClose={() => setRemoteOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Debugger */}
          {debuggerOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <DebuggerPanel onClose={() => setDebuggerOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Governance (fallback toggle via custom action) */}
          {/* Note: In Sprint 2, governance is its own panel. */}

          {/* RIGHT RAIL: Scene Generator */}
          {generatorOpen && (
            <div className="flex w-96 shrink-0 flex-col border-l border-studio-border">
              <SceneGeneratorPanel onClose={() => setGeneratorOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Node Inspector */}
          {inspectorOpen && (
            <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
              <NodeInspectorPanel onClose={() => setInspectorOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Plugin Marketplace */}
          {pluginsOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <PluginMarketplacePanel onClose={() => setPluginsOpen(false)} />
            </div>
          )}

          {/* RIGHT RAIL: Sandboxed Plugins (live sandbox host) */}
          {sandboxedPluginsOpen && (
            <div className="flex w-80 shrink-0 flex-col border-l border-studio-border">
              <SandboxedPluginsPanel
                onClose={() => setSandboxedPluginsOpen(false)}
                onOpenMarketplace={() => {
                  setSandboxedPluginsOpen(false);
                  setPluginsOpen(true);
                }}
              />
            </div>
          )}

          {/* OVERLAY: Hotkey Map (full screen modal) */}
          <HotkeyMapOverlay open={hotkeyOpen} onClose={() => setHotkeyOpen(false)} />

          {/* RIGHT RAIL: Brittney Chat */}
          {chatOpen && (
            <div className="flex w-72 shrink-0 flex-col border-l border-studio-border">
              <BrittneyChatPanel />
            </div>
          )}

          {/* Icon rail -- right edge on desktop, bottom bar on mobile (via studio-icon-rail CSS) */}
          <div className="studio-icon-rail flex shrink-0 flex-col items-center gap-1 overflow-y-auto border-l border-studio-border bg-[#1e1e2e] px-1.5 py-3">
            {/* Brittney toggle */}
            <button
              onClick={toggleChatOpen}
              title={chatOpen ? 'Hide Brittney' : 'Open Brittney'}
              className="text-studio-muted transition hover:text-studio-text"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
            {/* History toggle */}
            <button
              onClick={toggleHistoryOpen}
              title={historyOpen ? 'Hide History' : 'Show History'}
              className={`transition ${
                historyOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <History className="h-4 w-4" />
            </button>
            {/* Timeline toggle */}
            <button
              onClick={() => toggleExclusive('timeline', ['shaderEditor'])}
              title={timelineOpen ? 'Close Timeline' : 'Open Animation Timeline'}
              className={`transition ${
                timelineOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Film className="h-4 w-4" />
            </button>
            {/* AI Material toggle */}
            <button
              onClick={() => toggleExclusive('aiMaterial', ['share'])}
              title={aiMaterialOpen ? 'Close AI Materials' : 'AI Material Generator'}
              className={`transition ${
                aiMaterialOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Sparkles className="h-4 w-4" />
            </button>
            {/* Share toggle */}
            <button
              onClick={() => toggleExclusive('share', ['aiMaterial'])}
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
              onClick={() => toggleExclusive('critique', ['assetPack'])}
              title={critiqueOpen ? 'Close Critique' : 'Scene Critique (AI)'}
              className={`transition ${
                critiqueOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Lightbulb className="h-4 w-4" />
            </button>
            {/* Asset Pack toggle */}
            <button
              onClick={() => toggleExclusive('assetPack', ['critique'])}
              title={assetPackOpen ? 'Close Asset Pack' : 'Import Asset Pack'}
              className={`transition ${
                assetPackOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Package className="h-4 w-4" />
            </button>
            {/* Versions toggle */}
            <button
              onClick={() => toggleExclusive('versions', ['repl'])}
              title={versionsOpen ? 'Close Versions' : 'Scene Version History'}
              className={`transition ${
                versionsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <GitBranch className="h-4 w-4" />
            </button>
            {/* REPL toggle */}
            <button
              onClick={() => toggleExclusive('repl', ['versions'])}
              title={replOpen ? 'Close REPL' : 'HoloScript REPL'}
              className={`transition ${
                replOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Terminal className="h-4 w-4" />
            </button>
            {/* Registry toggle */}
            <button
              onClick={() => toggleExclusive('registry', ['remote'])}
              title={registryOpen ? 'Close Registry' : 'Pack Registry'}
              className={`transition ${
                registryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Store className="h-4 w-4" />
            </button>
            {/* Mobile Remote toggle */}
            <button
              onClick={() => toggleExclusive('remote', ['registry'])}
              title={remoteOpen ? 'Close Remote' : 'Mobile Remote (QR)'}
              className={`transition ${
                remoteOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Smartphone className="h-4 w-4" />
            </button>
            {/* Export toggle */}
            <button
              onClick={() => toggleExclusive('export', ['generator', 'profiler'])}
              title={exportOpen ? 'Close Export' : 'Export Scene'}
              className={`transition ${
                exportOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Download className="h-4 w-4" />
            </button>
            {/* AI Generator toggle */}
            <button
              onClick={() => toggleExclusive('generator', ['export', 'profiler'])}
              title={generatorOpen ? 'Close AI Generator' : 'AI Scene Generator'}
              className={`transition ${
                generatorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Wand2 className="h-4 w-4" />
            </button>
            {/* Profiler toggle */}
            <button
              onClick={() => toggleExclusive('profiler', ['export', 'generator'])}
              title={profilerOpen ? 'Close Profiler' : 'Performance Profiler'}
              className={`transition ${
                profilerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
              }`}
            >
              <Activity className="h-4 w-4" />
            </button>
            {/* Multiplayer toggle */}
            <button
              onClick={() => toggleExclusive('multiplayer', ['debugger', 'snapshots', 'assetLib'])}
              title={multiplayerOpen ? 'Close Multiplayer' : 'Multiplayer Room'}
              className={`transition ${multiplayerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Users2 className="h-4 w-4" />
            </button>
            {/* Debugger toggle */}
            <button
              onClick={() => toggleExclusive('debugger', ['multiplayer', 'snapshots', 'assetLib'])}
              title={debuggerOpen ? 'Close Debugger' : 'HoloScript Debugger'}
              className={`transition ${debuggerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Bug className="h-4 w-4" />
            </button>
            {/* Snapshot Gallery toggle */}
            <button
              onClick={() => toggleExclusive('snapshots', ['multiplayer', 'debugger', 'assetLib'])}
              title={snapshotsOpen ? 'Close Gallery' : 'Snapshot Gallery'}
              className={`transition ${snapshotsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Camera className="h-4 w-4" />
            </button>
            {/* Asset Library toggle */}
            <button
              onClick={() => toggleExclusive('assetLib', ['multiplayer', 'debugger', 'snapshots'])}
              title={assetLibOpen ? 'Close Asset Library' : 'Asset Library v2'}
              className={`transition ${assetLibOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Library className="h-4 w-4" />
            </button>
            {/* Templates gallery toggle */}
            <button
              onClick={() => toggleExclusive('templateGallery', ['audio', 'exportV2'])}
              title={templateGalleryOpen ? 'Close Templates' : 'Scene Templates v2'}
              className={`transition ${templateGalleryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <LayoutTemplate className="h-4 w-4" />
            </button>
            {/* Audio Traits toggle */}
            <button
              onClick={() => toggleExclusive('audio', ['templateGallery', 'exportV2'])}
              title={audioOpen ? 'Close Audio' : 'Audio Traits'}
              className={`transition ${audioOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Music className="h-4 w-4" />
            </button>
            {/* Export Pipeline v2 toggle */}
            <button
              onClick={() => toggleExclusive('exportV2', ['templateGallery', 'audio'])}
              title={exportV2Open ? 'Close Export v2' : 'Export Pipeline v2'}
              className={`transition ${exportV2Open ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Package className="h-4 w-4" />
            </button>
            {/* Minimap toggle */}
            <button
              onClick={toggleMinimapOpen}
              title={minimapOpen ? 'Hide Minimap' : 'Show Minimap'}
              className={`transition ${minimapOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Map className="h-4 w-4" />
            </button>
            {/* Node Graph toggle */}
            <button
              onClick={() => toggleExclusive('nodeGraph', ['keyframes'])}
              title={nodeGraphOpen ? 'Close Node Graph' : 'Node Graph Editor'}
              className={`transition ${nodeGraphOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Network className="h-4 w-4" />
            </button>
            {/* Keyframe Editor toggle */}
            <button
              onClick={() => toggleExclusive('keyframes', ['nodeGraph'])}
              title={keyframesOpen ? 'Close Keyframes' : 'Animation Keyframes'}
              className={`transition ${keyframesOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Timer className="h-4 w-4" />
            </button>
            {/* Scene Search toggle */}
            <button
              onClick={toggleSceneSearchOpen}
              title={sceneSearchOpen ? 'Close Scene Search' : 'Scene Search (Ctrl+F)'}
              className={`transition ${sceneSearchOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <SearchCode className="h-4 w-4" />
            </button>
            {/* Particle Traits toggle */}
            <button
              onClick={toggleParticlesOpen}
              title={particlesOpen ? 'Close Particles' : 'Particle Traits'}
              className={`transition ${particlesOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Flame className="h-4 w-4" />
            </button>
            {/* LOD / Camera Culling toggle */}
            <button
              onClick={toggleLodOpen}
              title={lodOpen ? 'Close LOD' : 'LOD / Camera Culling'}
              className={`transition ${lodOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Eye className="h-4 w-4" />
            </button>
            {/* Script Console toggle */}
            <button
              onClick={toggleConsoleOpen}
              title={consoleOpen ? 'Close Console' : 'Script Console'}
              className={`transition ${consoleOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <TerminalIcon className="h-4 w-4" />
            </button>
            {/* Undo History toggle */}
            <button
              onClick={toggleUndoHistoryOpen}
              title={undoHistoryOpen ? 'Close History' : 'Undo History'}
              className={`transition ${undoHistoryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <ClockIcon className="h-4 w-4" />
            </button>
            {/* Scene Outliner toggle */}
            <button
              onClick={toggleOutlinerOpen}
              title={outlinerOpen ? 'Close Outliner' : 'Scene Outliner'}
              className={`transition ${outlinerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Layers className="h-4 w-4" />
            </button>
            {/* Material Editor toggle */}
            <button
              onClick={toggleMaterialOpen}
              title={materialOpen ? 'Close Material Editor' : 'Material Editor'}
              className={`transition ${materialOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Palette className="h-4 w-4" />
            </button>
            {/* Physics Traits toggle */}
            <button
              onClick={togglePhysicsOpen}
              title={physicsOpen ? 'Close Physics' : 'Physics Traits'}
              className={`transition ${physicsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Atom className="h-4 w-4" />
            </button>
            {/* Snapshot Diff toggle */}
            <button
              onClick={toggleSnapshotDiffOpen}
              title={snapshotDiffOpen ? 'Close Diff' : 'Snapshot Diff'}
              className={`transition ${snapshotDiffOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <GitCompare className="h-4 w-4" />
            </button>
            {/* Audio Visualizer toggle */}
            <button
              onClick={toggleAudioVisualizerOpen}
              title={audioVisualizerOpen ? 'Close Audio Visualizer' : 'Audio Visualizer'}
              className={`transition ${audioVisualizerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Music2 className="h-4 w-4" />
            </button>
            {/* Shader Editor toggle */}
            <button
              onClick={toggleShaderEditorOpen}
              title={shaderEditorOpen ? 'Close Shader Editor' : 'Shader Editor'}
              className={`transition ${shaderEditorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Code2 className="h-4 w-4" />
            </button>
            {/* Multi-Object Transform toggle */}
            <button
              onClick={toggleMultiTransformOpen}
              title={multiTransformOpen ? 'Close Multi-Transform' : 'Multi-Object Transform'}
              className={`transition ${multiTransformOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Move3d className="h-4 w-4" />
            </button>
            {/* Scene Critique toggle */}
            <button
              onClick={toggleCritiqueOpen}
              title={critiqueOpen ? 'Close Critique' : 'Scene Critique'}
              className={`transition ${critiqueOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Bot className="h-4 w-4" />
            </button>
            {/* Environment Builder toggle */}
            <button
              onClick={toggleEnvironmentOpen}
              title={environmentOpen ? 'Close Environment' : 'Environment Builder'}
              className={`transition ${environmentOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Sun className="h-4 w-4" />
            </button>
            {/* Asset Pack Store toggle */}
            <button
              onClick={toggleAssetPackOpen}
              title={assetPackOpen ? 'Close Store' : 'Asset Pack Store'}
              className={`transition ${assetPackOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Store className="h-4 w-4" />
            </button>
            {/* Performance Profiler toggle */}
            <button
              onClick={toggleProfilerOpen}
              title={profilerOpen ? 'Close Profiler' : 'Performance Profiler'}
              className={`transition ${profilerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Gauge className="h-4 w-4" />
            </button>
            {/* Version History toggle */}
            <button
              onClick={toggleVersionsOpen}
              title={versionsOpen ? 'Close History' : 'Version History'}
              className={`transition ${versionsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <History className="h-4 w-4" />
            </button>
            {/* Trait Registry toggle */}
            <button
              onClick={toggleRegistryOpen}
              title={registryOpen ? 'Close Registry' : 'Trait Registry'}
              className={`transition ${registryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Library className="h-4 w-4" />
            </button>
            {/* Remote Preview toggle */}
            <button
              onClick={toggleRemoteOpen}
              title={remoteOpen ? 'Close Remote' : 'Remote Preview'}
              className={`transition ${remoteOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Smartphone className="h-4 w-4" />
            </button>
            {/* Debugger toggle */}
            <button
              onClick={toggleDebuggerOpen}
              title={debuggerOpen ? 'Close Debugger' : 'HoloScript Debugger'}
              className={`transition ${debuggerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Bug className="h-4 w-4" />
            </button>
            {/* Scene Generator toggle */}
            <button
              onClick={toggleGeneratorOpen}
              title={generatorOpen ? 'Close Generator' : 'AI Scene Generator'}
              className={`transition ${generatorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Wand2 className="h-4 w-4" />
            </button>
            {/* Node Inspector toggle */}
            <button
              onClick={toggleInspectorOpen}
              title={inspectorOpen ? 'Close Inspector' : 'Node Inspector'}
              className={`transition ${inspectorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
            {/* Plugin Marketplace toggle */}
            <button
              onClick={togglePluginsOpen}
              title={pluginsOpen ? 'Close Plugins' : 'Plugin Marketplace'}
              className={`transition ${pluginsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Puzzle className="h-4 w-4" />
            </button>
            {/* Sandboxed Plugins toggle */}
            <button
              onClick={toggleSandboxedPluginsOpen}
              title={sandboxedPluginsOpen ? 'Close Sandboxed Plugins' : 'Sandboxed Plugins'}
              className={`transition ${sandboxedPluginsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Shield className="h-4 w-4" />
            </button>
            {/* Hotkey Map toggle */}
            <button
              onClick={toggleHotkeyOpen}
              title="Keyboard Shortcuts (?)"
              className={`transition ${hotkeyOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
            >
              <Keyboard className="h-4 w-4" />
            </button>
          </div>
        </div>
        </ResponsiveStudioLayout>
      )}

      {/* Trait Palette modal */}
      <TraitPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Gaussian Splat capture wizard */}
      <SplatCaptureWizard open={splatWizardOpen} onClose={() => setSplatWizardOpen(false)} />

      {/* Template Picker modal */}
      {templatePickerOpen && <TemplatePicker onClose={() => setTemplatePickerOpen(false)} />}

      {/* Scene Search overlay (Sprint S) */}
      <SceneSearchOverlay open={sceneSearchOpen} onClose={() => setSceneSearchOpen(false)} />

      {/* Sprint T: Script Console (fixed bottom panel, taller on mobile) */}
      {consoleOpen && (
        <div className="studio-bottom-console fixed bottom-0 left-0 right-0 z-30 h-[280px] border-t border-studio-border shadow-2xl">
          <ScriptConsole />
        </div>
      )}



      {/* OVERLAY: Spatial Blame Tooltip (Git for 3D) */}
      {spatialBlameTooltip.visible && (
        <div 
          className="fixed pointer-events-none z-50 bg-slate-900/95 border border-indigo-500/30 rounded-lg p-3 shadow-xl backdrop-blur-md"
          style={{ left: spatialBlameTooltip.x, top: spatialBlameTooltip.y, transform: 'translate(-50%, -100%)' }}
        >
          {spatialBlameTooltip.content}
        </div>
      )}
    </>
  );
}
