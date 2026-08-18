'use client';

import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
// SplatCaptureWizard is a modal — lazy-loaded to reduce initial bundle
import {
  useSceneStore,
  useEditorStore,
  useSceneGraphStore,
  usePanelVisibilityStore,
} from '@/lib/stores';
import { useAssetStore } from '@/components/assets/useAssetStore';
import { decodeSceneFromURL, serializeScene } from '@/lib/serializer';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { useOllamaStatus } from '@/hooks/useOllamaStatus';
import { useStudioBridge } from '@/hooks/useStudioBridge';
// Heavy panels — dynamically imported below
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useTemporalStore } from '@/lib/historyStore';
import { useProjectStore } from '@/lib/projectStore';
import { AssetDropOverlay } from '@/components/assets/AssetDropProcessor';
import { HoloFileDropHandler } from '@/components/assets/HoloFileDropHandler';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';
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
  Landmark,
  SlidersHorizontal,
  Puzzle,
  Keyboard,
  Gauge,
  Pencil,
  PaintBucket,
  Shield,
  ChevronUp,
  ChevronDown,
  Globe,
  Cpu,
  AppWindow,
  Gamepad2,
  User,
} from 'lucide-react';
import type { GizmoMode, ArtMode, StudioMode } from '@/lib/stores';
import { PanelSplitter } from '@holoscript/ui';
import {
  RightRailPanelHost,
  type RightRailPanelDescriptor,
} from '@/components/panels/RightRailPanelHost';
import {
  useRightRailDescriptors,
  type RegistryPanelExtraProps,
} from '@/hooks/useRightRailDescriptors';
import { NativePanelMount } from '@/components/panels/NativePanelMount';
import { logger } from '@/lib/logger';
import { useToast } from '@/app/providers';
import { UXCommandPalette, createStudioPublishingCommands } from '@/core-ui/UXCommandPalette';
import { runStudioCommand } from '@/lib/studio/commandRegistry';
import {
  STUDIO_VIEW_IDS,
  type StudioViewCommandId,
  type StudioViewId,
} from '@/lib/studio/viewRegistry';
import { useCreateModeStore, type CreateMode } from '@/components/create/createModeStore';
import { DescribeItFirstRunPanel } from '@/components/create/DescribeItFirstRunPanel';
import {
  MULTI_TARGET_SOURCE,
  MultiTargetFanoutPanel,
} from '@/components/create/MultiTargetFanoutPanel';
import { dispatchCompileFanout } from '@/lib/studio/multi-target/dispatchFanout';
import {
  PORTABILITY_SOURCE,
  PortabilityHeadToHeadPanel,
} from '@/components/create/PortabilityHeadToHeadPanel';
import { TIME_TO_WOW_SOURCE, TimeToWowPathPanel } from '@/components/create/TimeToWowPathPanel';
import type { PrintabilityReport } from '@/components/manufacturing/PrintabilityReportPanel';
import type { MeshResult } from '@/components/manufacturing/ParametricSlidersPanel';
import { useSimState } from '@/components/simsci/useSimState';
import { useGameState } from '@/components/game/useGameState';
import { useAvatarModeState } from '@/components/avatar/useAvatarModeState';

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { ssr: false, loading: () => <ViewportSkeleton /> }
);

const HoloScriptEditor = dynamic(
  () =>
    import('@/components/editor/CodeMirrorEditor').then((m) => ({ default: m.CodeMirrorEditor })),
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
  () =>
    import('@/components/collaboration/CollabCursors').then((m) => ({
      default: m.CollabStatusDot,
    })),
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

const SplatCaptureWizard = dynamic(
  () =>
    import('@/components/assets/SplatCaptureWizard').then((m) => ({
      default: m.SplatCaptureWizard,
    })),
  { ssr: false }
);

const ImportRepoWizard = dynamic(
  () =>
    import('@/components/wizard/ImportRepoWizard').then((m) => ({
      default: m.ImportRepoWizard,
    })),
  { ssr: false }
);

const SimulationPanel = dynamic(
  () =>
    import('@/components/simulation/SimulationPanel').then((m) => ({
      default: m.SimulationPanel,
    })),
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

const MultiTransformPanel = dynamic(
  () =>
    import('@/components/transform/MultiTransformPanel').then((m) => ({
      default: m.MultiTransformPanel,
    })),
  { ssr: false }
);

const EnvironmentPanel = dynamic(
  () =>
    import('@/components/environment/EnvironmentPanel').then((m) => ({
      default: m.EnvironmentPanel,
    })),
  { ssr: false }
);

const FoundationDAOPanel = dynamic(
  () =>
    import('@/components/governance/FoundationDAOPanel').then((m) => ({
      default: m.FoundationDAOPanel,
    })),
  { ssr: false }
);

// AssetPackStorePanel removed - duplicate of AssetPackPanel

// ProfilerPanel2 removed — duplicate of ProfilerPanel

// TraitRegistryPanel removed — misnamed duplicate of RemotePreviewPanel

// AiSceneGeneratorPanel removed — duplicate of SceneGeneratorPanel

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

const MultiplayerPanel = dynamic(
  () =>
    import('@/components/collaboration/MultiplayerPanel').then((m) => ({
      default: m.MultiplayerPanel,
    })),
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

const TraitInspector = dynamic(
  // B3 consolidation (splendid-popping-lark): re-pointed from inspector/ to panels/
  // canonical copy. panels/TraitInspector now accepts onOpenPalette + onOpenShaderEditor.
  () => import('@/components/panels/TraitInspector').then((m) => ({ default: m.TraitInspector })),
  { ssr: false }
);

const TraitPalette = dynamic(
  () => import('@/components/inspector/TraitPalette').then((m) => ({ default: m.TraitPalette })),
  { ssr: false }
);

const BrittneyChatPanel = dynamic(
  () => import('@/components/ai/BrittneyChatPanel').then((m) => ({ default: m.BrittneyChatPanel })),
  { ssr: false }
);

const ParametricSlidersPanel = dynamic(
  () =>
    import('@/components/manufacturing/ParametricSlidersPanel').then((m) => ({
      default: m.ParametricSlidersPanel,
    })),
  { ssr: false }
);

const PrintabilityReportPanel = dynamic(
  () =>
    import('@/components/manufacturing/PrintabilityReportPanel').then((m) => ({
      default: m.PrintabilityReportPanel,
    })),
  { ssr: false }
);

const PartPreviewCanvas = dynamic(
  () =>
    import('@/components/manufacturing/PartPreviewCanvas').then((m) => ({
      default: m.PartPreviewCanvas,
    })),
  { ssr: false }
);

const SimParamsPanel = dynamic(
  () =>
    import('@/components/simsci/SimParamsPanel').then((m) => ({
      default: m.SimParamsPanel,
    })),
  { ssr: false }
);

const SimRunReportPanel = dynamic(
  () =>
    import('@/components/simsci/SimRunReportPanel').then((m) => ({
      default: m.SimRunReportPanel,
    })),
  { ssr: false }
);

const SimPreviewCanvas = dynamic(
  () =>
    import('@/components/simsci/SimPreviewCanvas').then((m) => ({
      default: m.SimPreviewCanvas,
    })),
  { ssr: false }
);

const GameParamsPanel = dynamic(
  () =>
    import('@/components/game/GameParamsPanel').then((m) => ({
      default: m.GameParamsPanel,
    })),
  { ssr: false }
);

const GameGateLedgerPanel = dynamic(
  () =>
    import('@/components/game/GameGateLedgerPanel').then((m) => ({
      default: m.GameGateLedgerPanel,
    })),
  { ssr: false }
);

const GamePreviewCanvas = dynamic(
  () =>
    import('@/components/game/GamePreviewCanvas').then((m) => ({
      default: m.GamePreviewCanvas,
    })),
  { ssr: false }
);

const AvatarParamsPanel = dynamic(
  () =>
    import('@/components/avatar/AvatarParamsPanel').then((m) => ({
      default: m.AvatarParamsPanel,
    })),
  { ssr: false }
);

const AvatarRigLedgerPanel = dynamic(
  () =>
    import('@/components/avatar/AvatarRigLedgerPanel').then((m) => ({
      default: m.AvatarRigLedgerPanel,
    })),
  { ssr: false }
);

const AvatarPreviewCanvas = dynamic(
  () =>
    import('@/components/avatar/AvatarPreviewCanvas').then((m) => ({
      default: m.AvatarPreviewCanvas,
    })),
  { ssr: false }
);

const HistoryPanel = dynamic(
  () => import('@/components/HistoryPanel').then((m) => ({ default: m.HistoryPanel })),
  { ssr: false }
);

const GovernancePanel = dynamic(
  () =>
    import('@/components/history/GovernancePanel').then((m) => ({ default: m.GovernancePanel })),
  { ssr: false }
);

const ConformanceSuitePanel = dynamic(
  () =>
    import('@/components/validation/ConformanceSuitePanel').then((m) => ({
      default: m.ConformanceSuitePanel,
    })),
  { ssr: false }
);

function ViewportSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
      <div className="text-sm text-studio-muted animate-pulse">Loading 3D viewport…</div>
    </div>
  );
}

// ─── Mode badge ───────────────────────────────────────────────────────────────

const MODE_META: Record<CreateMode, { label: string; icon: typeof Globe }> = {
  world: { label: 'World', icon: Globe },
  part: { label: 'Part', icon: Cpu },
  app: { label: 'App', icon: AppWindow },
  sim: { label: 'Sim', icon: Atom },
  game: { label: 'Game', icon: Gamepad2 },
  avatar: { label: 'Avatar', icon: User },
};

function ModeBadge({ mode }: { mode: CreateMode }) {
  const { label, icon: Icon } = MODE_META[mode];
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-2.5 py-1.5 text-[11px] font-medium text-studio-muted backdrop-blur">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
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

  // max-w reserves the top-right zone for the Generate Scene pill (right-3) —
  // the toolbar scrolls internally instead of growing underneath it.
  return (
    <div className="absolute left-2 sm:left-3 top-2 sm:top-3 z-20 flex max-w-[calc(100%-11rem)] items-center gap-0.5 overflow-x-auto rounded-lg border border-studio-border/60 bg-studio-panel/90 p-0.5 backdrop-blur sm:gap-1 sm:p-1">
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
        className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 text-xs text-studio-muted backdrop-blur transition hover:border-studio-accent hover:text-studio-text"
      >
        <Sparkles className="h-3.5 w-3.5 text-studio-accent" />
        <span className="hidden sm:inline">Generate Scene</span>
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-3 z-20 w-72 rounded-xl border border-studio-border bg-studio-panel/95 p-3 shadow-xl backdrop-blur animate-fade-in">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-studio-text">Generate with AI</span>
        <button
          onClick={() => setOpen(false)}
          title="Close AI prompt overlay"
          aria-label="Close AI prompt overlay"
          className="text-studio-muted hover:text-studio-text"
        >
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
  const metadata = useSceneStore((s) => s.metadata);
  const sceneR3FTree = useSceneStore((s) => s.r3fTree);
  const setCode = useSceneStore((s) => s.setCode);
  const setR3FTree = useSceneStore((s) => s.setR3FTree);
  const setErrors = useSceneStore((s) => s.setErrors);
  const executionState = useSceneStore((s) => s.executionState);
  const setExecutionState = useSceneStore((s) => s.setExecutionState);
  const setMetadata = useSceneStore((s) => s.setMetadata);
  const markClean = useSceneStore((s) => s.markClean);
  const errors = useSceneStore((s) => s.errors);

  const nodes = useSceneGraphStore((s) => s.nodes);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const assets = useAssetStore((s) => s.assets);
  const addAsset = useAssetStore((s) => s.addAsset);
  const artMode = useEditorStore((s) => s.artMode);
  const _studioMode = useEditorStore((s) => s.studioMode);
  const { addToast } = useToast();
  const uxPaletteRef = useRef<UXCommandPalette | null>(null);
  const runViewCommand = useCallback((commandId: StudioViewCommandId) => {
    runStudioCommand(commandId);
  }, []);

  // ── Create mode — ?mode=world|part|app query param ────────────────────────
  const createMode = useCreateModeStore((s) => s.createMode);
  const setCreateMode = useCreateModeStore((s) => s.setCreateMode);
  const landingPrompt = useCreateModeStore((s) => s.landingPrompt);
  const setLandingPrompt = useCreateModeStore((s) => s.setLandingPrompt);
  const clearLandingPrompt = useCreateModeStore((s) => s.clearLandingPrompt);

  // ── Repo import wizard — opened by ?intake=repo ──────────────────────────
  const [repoWizardOpen, setRepoWizardOpen] = useState(false);
  const [describeItDismissed, setDescribeItDismissed] = useState(false);

  // ── Bottom code editor — collapsible (vibe chassis) ──────────────────────
  const [codeEditorCollapsed, setCodeEditorCollapsed] = useState(false);
  const [bottomPanelH, setBottomPanelH] = useState(224);
  const effectiveBottomH = codeEditorCollapsed ? 32 : bottomPanelH;

  // Panel widths (px) — driven by PanelSplitter drag
  const [rightPanelW, setRightPanelW] = useState(288);

  // Panels popover — the single entry point that replaced the icon mega-rail
  const [panelsMenuOpen, setPanelsMenuOpen] = useState(false);

  // ── Panel visibility — centralised in panelVisibilityStore ────────────────
  const paletteOpen = usePanelVisibilityStore((s) => s.paletteOpen);
  const setPaletteOpen = usePanelVisibilityStore((s) => s.setPaletteOpen);
  // chatOpen drives the FLOATING Brittney dock (bottom-left). Closed on mount
  // → viewer-first: the viewport is the page; chat is one click away.
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
  const _toggleTimelineOpen = usePanelVisibilityStore((s) => s.toggleTimelineOpen);
  const templatePickerOpen = usePanelVisibilityStore((s) => s.templatePickerOpen);
  const setTemplatePickerOpen = usePanelVisibilityStore((s) => s.setTemplatePickerOpen);
  const aiMaterialOpen = usePanelVisibilityStore((s) => s.aiMaterialOpen);
  const setAiMaterialOpen = usePanelVisibilityStore((s) => s.setAiMaterialOpen);
  const _toggleAiMaterialOpen = usePanelVisibilityStore((s) => s.toggleAiMaterialOpen);
  const shareOpen = usePanelVisibilityStore((s) => s.shareOpen);
  const setShareOpen = usePanelVisibilityStore((s) => s.setShareOpen);
  const _toggleShareOpen = usePanelVisibilityStore((s) => s.toggleShareOpen);
  const critiqueOpen = usePanelVisibilityStore((s) => s.critiqueOpen);
  const setCritiqueOpen = usePanelVisibilityStore((s) => s.setCritiqueOpen);
  const toggleCritiqueOpen = usePanelVisibilityStore((s) => s.toggleCritiqueOpen);
  const assetPackOpen = usePanelVisibilityStore((s) => s.assetPackOpen);
  const setAssetPackOpen = usePanelVisibilityStore((s) => s.setAssetPackOpen);
  const versionsOpen = usePanelVisibilityStore((s) => s.versionsOpen);
  const setVersionsOpen = usePanelVisibilityStore((s) => s.setVersionsOpen);
  const replOpen = usePanelVisibilityStore((s) => s.replOpen);
  const setReplOpen = usePanelVisibilityStore((s) => s.setReplOpen);
  const _toggleReplOpen = usePanelVisibilityStore((s) => s.toggleReplOpen);
  const registryOpen = usePanelVisibilityStore((s) => s.registryOpen);
  const setRegistryOpen = usePanelVisibilityStore((s) => s.setRegistryOpen);
  const remoteOpen = usePanelVisibilityStore((s) => s.remoteOpen);
  const setRemoteOpen = usePanelVisibilityStore((s) => s.setRemoteOpen);
  const exportOpen = usePanelVisibilityStore((s) => s.exportOpen);
  const setExportOpen = usePanelVisibilityStore((s) => s.setExportOpen);
  const _toggleExportOpen = usePanelVisibilityStore((s) => s.toggleExportOpen);
  const generatorOpen = usePanelVisibilityStore((s) => s.generatorOpen);
  const setGeneratorOpen = usePanelVisibilityStore((s) => s.setGeneratorOpen);
  const multiplayerOpen = usePanelVisibilityStore((s) => s.multiplayerOpen);
  const setMultiplayerOpen = usePanelVisibilityStore((s) => s.setMultiplayerOpen);
  const _toggleMultiplayerOpen = usePanelVisibilityStore((s) => s.toggleMultiplayerOpen);
  const debuggerOpen = usePanelVisibilityStore((s) => s.debuggerOpen);
  const setDebuggerOpen = usePanelVisibilityStore((s) => s.setDebuggerOpen);
  const snapshotsOpen = usePanelVisibilityStore((s) => s.snapshotsOpen);
  const setSnapshotsOpen = usePanelVisibilityStore((s) => s.setSnapshotsOpen);
  const _toggleSnapshotsOpen = usePanelVisibilityStore((s) => s.toggleSnapshotsOpen);
  const assetLibOpen = usePanelVisibilityStore((s) => s.assetLibOpen);
  const setAssetLibOpen = usePanelVisibilityStore((s) => s.setAssetLibOpen);
  const _toggleAssetLibOpen = usePanelVisibilityStore((s) => s.toggleAssetLibOpen);
  const templateGalleryOpen = usePanelVisibilityStore((s) => s.templateGalleryOpen);
  const setTemplateGalleryOpen = usePanelVisibilityStore((s) => s.setTemplateGalleryOpen);
  const _toggleTemplateGalleryOpen = usePanelVisibilityStore((s) => s.toggleTemplateGalleryOpen);
  const minimapOpen = usePanelVisibilityStore((s) => s.minimapOpen);
  const setMinimapOpen = usePanelVisibilityStore((s) => s.setMinimapOpen);
  const toggleMinimapOpen = usePanelVisibilityStore((s) => s.toggleMinimapOpen);
  const audioOpen = usePanelVisibilityStore((s) => s.audioOpen);
  const setAudioOpen = usePanelVisibilityStore((s) => s.setAudioOpen);
  const _toggleAudioOpen = usePanelVisibilityStore((s) => s.toggleAudioOpen);
  const exportV2Open = usePanelVisibilityStore((s) => s.exportV2Open);
  const setExportV2Open = usePanelVisibilityStore((s) => s.setExportV2Open);
  const _toggleExportV2Open = usePanelVisibilityStore((s) => s.toggleExportV2Open);
  const nodeGraphOpen = usePanelVisibilityStore((s) => s.nodeGraphOpen);
  const setNodeGraphOpen = usePanelVisibilityStore((s) => s.setNodeGraphOpen);
  const _toggleNodeGraphOpen = usePanelVisibilityStore((s) => s.toggleNodeGraphOpen);
  const keyframesOpen = usePanelVisibilityStore((s) => s.keyframesOpen);
  const setKeyframesOpen = usePanelVisibilityStore((s) => s.setKeyframesOpen);
  const _toggleKeyframesOpen = usePanelVisibilityStore((s) => s.toggleKeyframesOpen);
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
  const _setConsoleOpen = usePanelVisibilityStore((s) => s.setConsoleOpen);
  const toggleConsoleOpen = usePanelVisibilityStore((s) => s.toggleConsoleOpen);
  const undoHistoryOpen = usePanelVisibilityStore((s) => s.undoHistoryOpen);
  const setUndoHistoryOpen = usePanelVisibilityStore((s) => s.setUndoHistoryOpen);
  const toggleUndoHistoryOpen = usePanelVisibilityStore((s) => s.toggleUndoHistoryOpen);
  const outlinerOpen = usePanelVisibilityStore((s) => s.outlinerOpen);
  const _setOutlinerOpen = usePanelVisibilityStore((s) => s.setOutlinerOpen);
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
  const foundationDaoOpen = usePanelVisibilityStore((s) => s.foundationDaoOpen);
  const setFoundationDaoOpen = usePanelVisibilityStore((s) => s.setFoundationDaoOpen);
  const toggleFoundationDaoOpen = usePanelVisibilityStore((s) => s.toggleFoundationDaoOpen);
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
  const agentMonitorOpen = usePanelVisibilityStore((s) => s.agentMonitorOpen);
  const setAgentMonitorOpen = usePanelVisibilityStore((s) => s.setAgentMonitorOpen);
  const toggleAgentMonitorOpen = usePanelVisibilityStore((s) => s.toggleAgentMonitorOpen);
  const simulationOpen = usePanelVisibilityStore((s) => s.simulationOpen);
  const setSimulationOpen = usePanelVisibilityStore((s) => s.setSimulationOpen);
  const toggleSimulationOpen = usePanelVisibilityStore((s) => s.toggleSimulationOpen);

  // ── Part mode panels (auto-open when mode=part) ──────────────────────────
  const parametricSlidersOpen = usePanelVisibilityStore((s) => s.parametricSlidersOpen);
  const setParametricSlidersOpen = usePanelVisibilityStore((s) => s.setParametricSlidersOpen);
  const toggleParametricSlidersOpen = usePanelVisibilityStore((s) => s.toggleParametricSlidersOpen);
  const printabilityReportOpen = usePanelVisibilityStore((s) => s.printabilityReportOpen);
  const setprintabilityReportOpen = usePanelVisibilityStore((s) => s.setPrintabilityReportOpen);
  const togglePrintabilityReportOpen = usePanelVisibilityStore(
    (s) => s.togglePrintabilityReportOpen
  );
  /** Latest mesh result shared between ParametricSlidersPanel and PrintabilityReportPanel. */
  const [partMeshResult, setPartMeshResult] = useState<MeshResult | null>(null);

  // ── Sim mode panels (auto-open when mode=sim) ─────────────────────────────
  const simParamsOpen = usePanelVisibilityStore((s) => s.simParamsOpen);
  const setSimParamsOpen = usePanelVisibilityStore((s) => s.setSimParamsOpen);
  const toggleSimParamsOpen = usePanelVisibilityStore((s) => s.toggleSimParamsOpen);
  const simRunReportOpen = usePanelVisibilityStore((s) => s.simRunReportOpen);
  const setSimRunReportOpen = usePanelVisibilityStore((s) => s.setSimRunReportOpen);
  const toggleSimRunReportOpen = usePanelVisibilityStore((s) => s.toggleSimRunReportOpen);
  /** Latest sim result — subscribed from useSimState for breadcrumb + SimPreviewCanvas overlay. */
  const simResult = useSimState((s) => s.result);

  // ── Game mode panels (auto-open when mode=game) ───────────────────────────
  const gameParamsOpen = usePanelVisibilityStore((s) => s.gameParamsOpen);
  const setGameParamsOpen = usePanelVisibilityStore((s) => s.setGameParamsOpen);
  const toggleGameParamsOpen = usePanelVisibilityStore((s) => s.toggleGameParamsOpen);
  const gameGateLedgerOpen = usePanelVisibilityStore((s) => s.gameGateLedgerOpen);
  const setGameGateLedgerOpen = usePanelVisibilityStore((s) => s.setGameGateLedgerOpen);
  const toggleGameGateLedgerOpen = usePanelVisibilityStore((s) => s.toggleGameGateLedgerOpen);
  /** Latest game build result + building flag — drives GamePreviewCanvas + Verify card. */
  const gameResult = useGameState((s) => s.result);
  const gameBuilding = useGameState((s) => s.building);

  // ── Avatar mode panels (auto-open when mode=avatar) ───────────────────────
  const avatarParamsOpen = usePanelVisibilityStore((s) => s.avatarParamsOpen);
  const setAvatarParamsOpen = usePanelVisibilityStore((s) => s.setAvatarParamsOpen);
  const toggleAvatarParamsOpen = usePanelVisibilityStore((s) => s.toggleAvatarParamsOpen);
  const avatarRigLedgerOpen = usePanelVisibilityStore((s) => s.avatarRigLedgerOpen);
  const setAvatarRigLedgerOpen = usePanelVisibilityStore((s) => s.setAvatarRigLedgerOpen);
  const toggleAvatarRigLedgerOpen = usePanelVisibilityStore((s) => s.toggleAvatarRigLedgerOpen);
  /** Latest avatar rig result + building flag — drives AvatarPreviewCanvas + Verify card. */
  const avatarResult = useAvatarModeState((s) => s.result);
  const avatarBuilding = useAvatarModeState((s) => s.building);

  // ── Governance & Conformance — driven by editorStore so StudioHeader Validate button works ──
  const showGovernancePanel = useEditorStore((s) => s.showGovernancePanel);
  const _setShowGovernancePanel = useEditorStore((s) => s.setShowGovernancePanel);
  const showConformancePanel = useEditorStore((s) => s.showConformancePanel);
  const setShowConformancePanel = useEditorStore((s) => s.setShowConformancePanel);

  // Undo/Redo keyboard shortcuts
  useUndoRedo();
  useOllamaStatus();

  // ── StudioBridge — AST mutation engine with history tracking ────────────────
  const emptyAST = useMemo(
    () => ({
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
    }),
    []
  );
  const {
    bridge: _studioBridge,
    apply: _bridgeApply,
    undo: _bridgeUndo,
    redo: _bridgeRedo,
    canUndo: _bridgeCanUndo,
    canRedo: _bridgeCanRedo,
  } = useStudioBridge(emptyAST);

  // ── Mount: parse query params + seed landing prompt ───────────────────────
  const searchParams = useSearchParams();

  useEffect(() => {
    // ── 1. mode param ──────────────────────────────────────────────────────
    const modeParam = searchParams.get('mode');
    if (
      modeParam === 'world' ||
      modeParam === 'part' ||
      modeParam === 'app' ||
      modeParam === 'sim' ||
      modeParam === 'game' ||
      modeParam === 'avatar'
    ) {
      setCreateMode(modeParam);
    }

    // ── 2. intake param — open the appropriate onboarding wizard ─────────────
    // ?intake=repo  → open the GitHub repo import wizard
    // ?intake=scan  → open the Gaussian Splat capture wizard (splatWizardOpen)
    const intake = searchParams.get('intake');
    if (intake === 'repo') {
      setRepoWizardOpen(true);
    } else if (intake === 'scan') {
      setSplatWizardOpen(true);
    }

    const viewParam = searchParams.get('view');
    if (viewParam && STUDIO_VIEW_IDS.includes(viewParam as StudioViewId)) {
      runViewCommand(`studio.view.${viewParam}.toggle` as StudioViewCommandId);
    }

    // ── 3. sessionStorage landing prompt ──────────────────────────────────
    // Written by the home page / onboarding flow before redirecting to /create.
    // Cleared immediately so it doesn't re-seed on the next mount.
    // Phase-2: wire landingPrompt from useCreateModeStore() into BrittneyChatPanel.
    try {
      const stored = sessionStorage.getItem('studio.landing.prompt');
      if (stored) {
        setLandingPrompt(stored);
        sessionStorage.removeItem('studio.landing.prompt');
      }
    } catch {
      // sessionStorage may be unavailable (SSR, private browsing limits) — silent
    }

    // ── 4. Brittney is on the left rail in this layout; close the right-rail
    //       instance if the store defaulted it open. ─────────────────────────
    setChatOpen(false);

    // ── 5. Part mode — auto-open parametric sliders + printability report. ──
    const resolvedMode =
      modeParam === 'world' ||
      modeParam === 'part' ||
      modeParam === 'app' ||
      modeParam === 'sim' ||
      modeParam === 'game' ||
      modeParam === 'avatar'
        ? modeParam
        : 'world';
    if (resolvedMode === 'part') {
      setParametricSlidersOpen(true);
      setprintabilityReportOpen(true);
    }
    // ── 5b. Sim mode — auto-open sim params + run report panels ──────────────
    if (resolvedMode === 'sim') {
      setSimParamsOpen(true);
      setSimRunReportOpen(true);
    }
    // ── 5c. Game mode — auto-open game params + gate ledger panels ───────────
    if (resolvedMode === 'game') {
      setGameParamsOpen(true);
      setGameGateLedgerOpen(true);
    }
    // ── 5d. Avatar mode — auto-open avatar params + rig ledger panels ────────
    if (resolvedMode === 'avatar') {
      setAvatarParamsOpen(true);
      setAvatarRigLedgerOpen(true);
    }

    // ── 5. URL scene restore (?scene= or ?src= parameters) ─────────────────
    const rawSrc = searchParams.get('src');
    if (rawSrc) {
      setCode(rawSrc);
      markClean();
      return;
    }

    const templateName = searchParams.get('template');
    if (templateName) {
      setCode(
        `import { World } from "@holoscript/core";\n// Template scaffolding initialized for: ${templateName}\n\nconst world = new World();\n`
      );
      setMetadata({ name: templateName });
      markClean();
      return;
    }

    const agentName = searchParams.get('agent');
    if (agentName) {
      setCode(
        `import { World, Agent } from "@holoscript/core";\n// Agent scaffold for: ${agentName}\n\nconst agent = new Agent("${agentName}");\n`
      );
      setMetadata({ name: agentName });
      markClean();
      return;
    }

    const encoded = searchParams.get('scene');
    if (!encoded) return;

    const looksLikeShareId = encoded.length <= 64 && /^[A-Za-z0-9_-]+$/.test(encoded);
    const tryShareFetch = async (): Promise<boolean> => {
      if (!looksLikeShareId) return false;
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(encoded)}`);
        if (!res.ok) return false;
        const scene = (await res.json()) as { id?: string; name?: string; code?: string };
        if (!scene.code) return false;
        setCode(scene.code);
        setMetadata({ id: scene.id ?? encoded, name: scene.name ?? 'Shared scene' });
        markClean();
        return true;
      } catch {
        return false;
      }
    };

    void tryShareFetch().then((handled) => {
      if (handled) return;
      decodeSceneFromURL(encoded).then((result) => {
        if (!result.ok || !result.scene) return;
        const s = result.scene;
        if (s.code) setCode(s.code);
        setMetadata({ id: s.metadata.id, name: s.metadata.name });
        for (const node of s.nodes ?? []) addNode(node);
        for (const asset of s.assets ?? []) addAsset(asset);
        markClean();
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { r3fTree, errors: pipelineErrors } = useScenePipeline(code);

  const handleGeneratedSceneCode = useCallback(
    (generated: string) => {
      setCode(generated);
      addToast('AI scene applied to live preview', 'success', 1800);
    },
    [addToast, setCode]
  );

  const handleDescribeItCodeGenerated = useCallback(
    (generated: string) => {
      setCode(generated);
      setMetadata({ name: 'Describe-It Preview' });
      setCodeEditorCollapsed(false);
      clearLandingPrompt();
      addToast('Describe-It preview applied', 'success', 1800);
    },
    [addToast, clearLandingPrompt, setCode, setMetadata]
  );

  const handleTimeToWowStart = useCallback(() => {
    const now = Date.now();
    setCode(TIME_TO_WOW_SOURCE);
    setMetadata({ name: 'Neon Orchard Launchpad', id: 'time-to-wow-neon-orchard' });
    setExecutionState('running');
    setCodeEditorCollapsed(false);
    setDescribeItDismissed(true);
    clearLandingPrompt();

    const starterAssets = [
      {
        id: 'time-to-wow-drone-glb',
        name: 'Survey Drone GLB',
        category: 'model' as const,
        src: '/models/drone.glb',
        size: 0,
        addedAt: now,
        tags: ['time-to-wow', 'glb', 'gltf', 'model'],
      },
      {
        id: 'time-to-wow-quest-json',
        name: 'Quest Beats JSON',
        category: 'script' as const,
        src: 'data:application/json,%7B%22beats%22%3A%5B%22walk_to_crystal%22%2C%22inspect_drone%22%2C%22publish_world%22%5D%7D',
        size: 96,
        addedAt: now,
        tags: ['time-to-wow', 'json', 'quest'],
      },
      {
        id: 'time-to-wow-telemetry-csv',
        name: 'Orchard Telemetry CSV',
        category: 'script' as const,
        src: 'data:text/csv,time,value%0A0,0.2%0A1,0.7%0A2,0.4',
        size: 42,
        addedAt: now,
        tags: ['time-to-wow', 'csv', 'data'],
      },
      {
        id: 'time-to-wow-ambient-score',
        name: 'Ambient Space Score',
        category: 'audio' as const,
        src: 'https://holoscript.net/assets/ambient_space.mp3',
        size: 0,
        addedAt: now,
        tags: ['time-to-wow', 'audio', 'spatial'],
      },
    ];
    const existing = new Set(useAssetStore.getState().assets.map((asset) => asset.id));
    for (const asset of starterAssets) {
      if (!existing.has(asset.id)) addAsset(asset);
    }

    setAssetLibOpen(true);
    setAssetPackOpen(true);
    setAiMaterialOpen(true);
    setAudioOpen(true);
    setExportOpen(true);
    setGeneratorOpen(true);
    addToast(
      'Time-to-wow project is running with source, assets, and export panels',
      'success',
      2400
    );
  }, [
    addAsset,
    addToast,
    clearLandingPrompt,
    setAiMaterialOpen,
    setAssetLibOpen,
    setAssetPackOpen,
    setAudioOpen,
    setCode,
    setExecutionState,
    setExportOpen,
    setGeneratorOpen,
    setMetadata,
  ]);

  const handleMultiTargetDispatch = useCallback(() => {
    setCode(MULTI_TARGET_SOURCE);
    setMetadata({ name: 'Multi-target Fan-out Receipt', id: 'multi-target-fanout' });
    setExecutionState('running');
    setCodeEditorCollapsed(false);
    setDescribeItDismissed(true);
    clearLandingPrompt();

    setExportOpen(true);
    setExportV2Open(true);
    setSimulationOpen(true);
    setShareOpen(true);
    setReplOpen(true);
    setRegistryOpen(true);
    addToast('Multi-target fan-out dispatched: compiling on real targets…', 'info', 2200);
    // The real run: compile_fanout writes genuine per-target receipts into the
    // compile-job-studio StateAuthority entity — the twin the compilerExport
    // panel is checked against. The result toast reports what actually
    // happened; no receipt language without receipts.
    void dispatchCompileFanout({ code: MULTI_TARGET_SOURCE }).then((result) => {
      setExecutionState('stopped');
      addToast(
        result.summary,
        result.ok ? (result.status === 'complete' ? 'success' : 'warning') : 'error',
        5200
      );
    });
  }, [
    addToast,
    clearLandingPrompt,
    setCode,
    setExecutionState,
    setExportOpen,
    setExportV2Open,
    setMetadata,
    setRegistryOpen,
    setReplOpen,
    setShareOpen,
    setSimulationOpen,
  ]);

  const handlePortabilityDemoOpen = useCallback(() => {
    setCode(PORTABILITY_SOURCE);
    setMetadata({ name: 'Omma Portability Head-to-Head', id: 'omma-portability-head-to-head' });
    setExecutionState('running');
    setCodeEditorCollapsed(false);
    setDescribeItDismissed(true);
    clearLandingPrompt();

    setExportOpen(true);
    setExportV2Open(true);
    setShareOpen(true);
    setRegistryOpen(true);
    setReplOpen(true);
    addToast(
      'Portability demo opened: same prompt, owned source, cross-domain artifacts, and receipts',
      'success',
      2600
    );
  }, [
    addToast,
    clearLandingPrompt,
    setCode,
    setExecutionState,
    setExportOpen,
    setExportV2Open,
    setMetadata,
    setRegistryOpen,
    setReplOpen,
    setShareOpen,
  ]);

  const showDescribeItFirstRun =
    !describeItDismissed && (landingPrompt.trim().length > 0 || code.trim().length === 0);

  useEffect(() => {
    if (executionState === 'running') {
      setR3FTree(r3fTree);
      setErrors(pipelineErrors);
      return;
    }
    if (executionState === 'stopped') {
      setR3FTree(null);
      setErrors([]);
    }
    // paused: intentionally keep last rendered tree and errors
  }, [executionState, r3fTree, pipelineErrors, setR3FTree, setErrors]);

  const getCurrentEditorAst = useCallback(() => {
    const sceneState = useSceneStore.getState();
    const sceneGraphState = useSceneGraphStore.getState();
    const assetState = useAssetStore.getState();

    const scene = serializeScene(
      {
        id: sceneState.metadata.id ?? '',
        name: sceneState.metadata.name || 'Untitled Scene',
        createdAt: sceneState.metadata.createdAt ?? new Date().toISOString(),
        updatedAt: sceneState.metadata.updatedAt ?? new Date().toISOString(),
      },
      sceneState.code,
      sceneGraphState.nodes,
      assetState.assets
    );

    return {
      kind: 'StudioEditorASTSnapshot',
      scene,
      r3fTree: sceneState.r3fTree,
      capturedAt: new Date().toISOString(),
    };
  }, []);

  const runPaletteMcpTool = useCallback(
    async (
      tool: 'holomesh_moltbook_crosspost' | 'holomesh_publish_agent_template',
      input: Record<string, unknown>
    ) => {
      const response = await fetch('/api/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, input }),
      });

      const payload = (await response.json()) as {
        error?: string;
        result?: unknown;
        offline?: boolean;
      };

      if (!response.ok || payload.error) {
        throw new Error(payload.error ?? `${tool} failed with status ${response.status}`);
      }

      return payload.result ?? payload;
    },
    []
  );

  useEffect(() => {
    const palette = new UXCommandPalette();
    uxPaletteRef.current = palette;

    palette.replaceCommands(
      createStudioPublishingCommands({
        getCurrentEditorAst,
        getSceneName: () => useSceneStore.getState().metadata.name || 'Untitled Scene',
        getTemplateCategory: () =>
          useEditorStore.getState().artMode === 'generative' ? 'creative' : 'builder',
        runTool: runPaletteMcpTool,
        notify: (message, type = 'info') => addToast(message, type),
      })
    );

    return () => {
      uxPaletteRef.current?.destroy();
      uxPaletteRef.current = null;
    };
  }, [addToast, getCurrentEditorAst, runPaletteMcpTool]);

  const registryExtraProps = useMemo(
    (): RegistryPanelExtraProps => ({
      parametricSliders: { onMeshResult: setPartMeshResult },
      printabilityReport: { report: partMeshResult?.printability ?? null },
      sandboxedPlugins: {
        onOpenMarketplace: () => {
          setSandboxedPluginsOpen(false);
          setPluginsOpen(true);
        },
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [partMeshResult]
  );

  // ── Right-rail panels not yet in VIEW_COMPONENTS ──
  const manualRailDescriptors = useMemo(
    (): RightRailPanelDescriptor[] => [
      {
        id: 'critique',
        open: critiqueOpen,
        width: 'resizable' as const,
        errorLabel: 'Scene Critique',
        content: <SceneCritiquePanel onClose={() => setCritiqueOpen(false)} />,
      },
      {
        id: 'assetPack',
        open: assetPackOpen,
        width: 'resizable' as const,
        errorLabel: 'Asset Pack Importer',
        content: <AssetPackPanel onClose={() => setAssetPackOpen(false)} />,
      },
      {
        id: 'versions',
        open: versionsOpen,
        width: 'resizable' as const,
        errorLabel: 'Scene Versions',
        content: <SceneVersionPanel sceneId="scene-1" onClose={() => setVersionsOpen(false)} />,
      },
      {
        id: 'remote',
        open: remoteOpen,
        width: 'resizable' as const,
        errorLabel: 'Mobile Remote',
        content: <QRRemotePanel onClose={() => setRemoteOpen(false)} />,
      },
      {
        id: 'generator',
        open: generatorOpen,
        width: 'resizable' as const,
        content: (
          <SceneGeneratorPanel
            onClose={() => setGeneratorOpen(false)}
            onCodeGenerated={handleGeneratedSceneCode}
            autoApplyOnGenerate
          />
        ),
      },
      {
        id: 'profiler',
        open: profilerOpen,
        width: 'resizable' as const,
        content: <ProfilerPanel onClose={() => setProfilerOpen(false)} />,
      },
      {
        id: 'debugger',
        open: debuggerOpen,
        width: 'resizable' as const,
        content: <DebuggerPanel onClose={() => setDebuggerOpen(false)} />,
      },
      {
        id: 'nodeGraph',
        open: nodeGraphOpen,
        width: 'resizable' as const,
        content: (
          <NodeGraphPanel
            onClose={() => setNodeGraphOpen(false)}
            onExecutionResult={(result) => {
              logger.debug(
                '[NodeGraphPanel] execution',
                result.success,
                result.nodeOrder.length,
                Object.keys(result.outputs).length
              );
            }}
          />
        ),
      },
      {
        id: 'undoHistory',
        open: undoHistoryOpen,
        width: 256,
        content: <HistoryPanel onClose={() => setUndoHistoryOpen(false)} />,
      },
      { id: 'outliner', open: outlinerOpen, width: 256, content: <SceneOutliner /> },
      {
        id: 'material',
        open: materialOpen,
        width: 320,
        content: <MaterialPanel onClose={() => setMaterialOpen(false)} />,
      },
      {
        id: 'physics',
        open: physicsOpen,
        width: 288,
        content: <PhysicsPanel onClose={() => setPhysicsOpen(false)} />,
      },
      {
        id: 'snapshotDiff',
        open: snapshotDiffOpen,
        width: 640,
        content: <SnapshotDiffPanel onClose={() => setSnapshotDiffOpen(false)} />,
      },
      {
        id: 'audioVisualizer',
        open: audioVisualizerOpen,
        width: 288,
        content: <AudioVisualizerPanel onClose={() => setAudioVisualizerOpen(false)} />,
      },
      {
        id: 'multiTransform',
        open: multiTransformOpen,
        width: 288,
        content: <MultiTransformPanel onClose={() => setMultiTransformOpen(false)} />,
      },
      {
        id: 'environment',
        open: environmentOpen,
        width: 288,
        content: <EnvironmentPanel onClose={() => setEnvironmentOpen(false)} />,
      },
      {
        id: 'foundationDao',
        open: foundationDaoOpen,
        width: 320,
        content: <FoundationDAOPanel onClose={() => setFoundationDaoOpen(false)} />,
      },
      {
        id: 'governance',
        open: showGovernancePanel,
        width: 320,
        containerClassName: 'bg-slate-900 z-20',
        content: <GovernancePanel />,
      },
      {
        id: 'conformance',
        open: showConformancePanel,
        width: 320,
        containerClassName: 'bg-slate-900 z-20',
        content: <ConformanceSuitePanel onClose={() => setShowConformancePanel(false)} />,
      },
      {
        id: 'agentMonitor',
        open: agentMonitorOpen,
        width: 320,
        containerClassName: 'bg-slate-900 z-20',
        content: (
          <NativePanelMount
            id="agentMonitor"
            onClose={() => setAgentMonitorOpen(false)}
            fallback={<AgentMonitorPanel onClose={() => setAgentMonitorOpen(false)} />}
          />
        ),
      },
      {
        id: 'inspector',
        open: inspectorOpen,
        width: 288,
        errorLabel: 'Node Inspector',
        content: <NodeInspectorPanel onClose={() => setInspectorOpen(false)} />,
      },
      {
        id: 'simulation',
        open: simulationOpen,
        width: 'resizable' as const,
        errorLabel: 'FEA Simulation',
        content: <SimulationPanel onClose={() => setSimulationOpen(false)} />,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      critiqueOpen,
      assetPackOpen,
      versionsOpen,
      remoteOpen,
      generatorOpen,
      profilerOpen,
      debuggerOpen,
      nodeGraphOpen,
      undoHistoryOpen,
      outlinerOpen,
      materialOpen,
      physicsOpen,
      snapshotDiffOpen,
      audioVisualizerOpen,
      multiTransformOpen,
      environmentOpen,
      foundationDaoOpen,
      showGovernancePanel,
      showConformancePanel,
      agentMonitorOpen,
      inspectorOpen,
      simulationOpen,
      handleGeneratedSceneCode,
    ]
  );

  const rightRailDescriptors = useRightRailDescriptors(registryExtraProps, manualRailDescriptors);

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-studio-bg text-studio-text">
      {/* Multi-scene project tabs */}
      <ProjectTabBar
        onSwitch={(sceneId) => {
          const { scenes } = useProjectStore.getState();
          const s = scenes.find((sc) => sc.id === sceneId);
          if (s) setCode(s.code);
        }}
      />
      {/* Live preview status bar */}
      <LivePreviewBar
        sceneId="scene-1"
        executionState={executionState}
        onPlay={() => setExecutionState('running')}
        onPause={() => setExecutionState('paused')}
        onStop={() => setExecutionState('stopped')}
      />

      {/*
       * ── VIEWER-FIRST CHASSIS ─────────────────────────────────────────────
       * The viewport IS the page (founder directive 2026-06-10).
       * CENTER: 3D viewport full-bleed + collapsible code drawer BOTTOM
       * RIGHT:  RightRailPanelHost — zero footprint until a panel opens
       * FLOAT:  Brittney dock (bottom-left pill ⇄ panel, chatOpen store),
       *         Panels popover grid (top-bar button; replaces the icon rail)
       */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          {/* CENTER + BOTTOM ─────────────────────────────────────────────── */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Slim top bar — the ONLY persistent chrome row of the surface */}
            <div className="flex h-9 shrink-0 items-center gap-2 border-b border-studio-border bg-studio-panel/80 px-3 backdrop-blur">
              <ModeBadge mode={createMode} />
              <button
                onClick={toggleChatOpen}
                aria-label={chatOpen ? 'Hide Brittney' : 'Ask Brittney'}
                title={chatOpen ? 'Hide Brittney' : 'Ask Brittney'}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/[0.06] ${
                  chatOpen
                    ? 'bg-white/[0.06] text-studio-text'
                    : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <MessageCircle className="h-3.5 w-3.5 text-studio-accent" />
                <span className="hidden md:inline">Brittney</span>
              </button>
              <div className="flex items-center gap-1 text-[10px] text-studio-muted">
                <button
                  aria-label="Build — open code editor"
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 text-studio-text transition hover:bg-white/[0.10]"
                  onClick={() => {
                    setCodeEditorCollapsed(false);
                    // Focus the editor after it becomes visible
                    setTimeout(() => {
                      const el = document.querySelector<HTMLElement>('.cm-editor .cm-content');
                      el?.focus();
                    }, 80);
                  }}
                >
                  Build
                </button>
                <span aria-hidden>›</span>
                <button
                  aria-label="Verify — open report panel"
                  className={`rounded px-1.5 py-0.5 transition ${
                    (createMode === 'part' && partMeshResult?.printability) ||
                    (createMode === 'sim' && simResult !== null) ||
                    (createMode === 'game' && gameResult !== null) ||
                    (createMode === 'avatar' && avatarResult !== null)
                      ? 'bg-white/[0.06] text-studio-text hover:bg-white/[0.10]'
                      : 'opacity-50 cursor-default'
                  }`}
                  onClick={() => {
                    if (createMode === 'part') {
                      setprintabilityReportOpen(true);
                    } else if (createMode === 'sim') {
                      setSimRunReportOpen(true);
                    } else if (createMode === 'game') {
                      setGameGateLedgerOpen(true);
                    } else if (createMode === 'avatar') {
                      setAvatarRigLedgerOpen(true);
                    } else if (createMode === 'world' || createMode === 'app') {
                      setShowConformancePanel(true);
                    }
                  }}
                >
                  Verify
                </button>
                <span aria-hidden>›</span>
                <button
                  aria-label="Ship — open export panel"
                  className="rounded px-1.5 py-0.5 transition hover:bg-white/[0.06] hover:text-studio-text"
                  onClick={() => runViewCommand('studio.view.export.toggle')}
                >
                  Ship
                </button>
              </div>
              <div className="flex-1" />
              <div title="Collaboration status" className="flex items-center">
                <CollabStatusDot />
              </div>
              <button
                onClick={() => setTemplatePickerOpen(true)}
                title="Browse scene templates"
                className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-studio-muted transition hover:bg-white/[0.06] hover:text-studio-text"
              >
                <LayoutTemplate className="h-3.5 w-3.5" /> Templates
              </button>
              <button
                onClick={() => setPanelsMenuOpen((v) => !v)}
                title="All panels (also: Cmd/Ctrl+K command palette)"
                aria-expanded={panelsMenuOpen}
                className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition hover:bg-white/[0.06] ${
                  panelsMenuOpen
                    ? 'bg-white/[0.06] text-studio-text'
                    : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Layers className="h-3.5 w-3.5" /> Panels
              </button>
            </div>
            {/* Center: 3D Viewport */}
            <HoloFileDropHandler className="relative flex-1 overflow-hidden">
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
              <TimeToWowPathPanel onStart={handleTimeToWowStart} />
              <MultiTargetFanoutPanel onDispatch={handleMultiTargetDispatch} />
              <PortabilityHeadToHeadPanel onOpenDemo={handlePortabilityDemoOpen} />
              {showDescribeItFirstRun && (
                <DescribeItFirstRunPanel
                  initialPrompt={landingPrompt}
                  onCodeGenerated={handleDescribeItCodeGenerated}
                  onDismiss={() => {
                    setDescribeItDismissed(true);
                    clearLandingPrompt();
                  }}
                />
              )}
              <ProfilerOverlay active={profilerOpen} />
              <AssetDropOverlay />
              <MinimapOverlay active={minimapOpen} onClose={() => setMinimapOpen(false)} />

              {/* Part-mode preview canvas — center viewport overlay when mode=part */}
              {createMode === 'part' && (
                <div className="absolute inset-0 z-5 flex items-center justify-center bg-[#0a0a12]">
                  <div className="w-full h-full">
                    <PartPreviewCanvas meshResult={partMeshResult} />
                  </div>
                </div>
              )}

              {/* Sim-mode preview canvas — center viewport overlay when mode=sim */}
              {createMode === 'sim' && (
                <div className="absolute inset-0 z-5 flex items-center justify-center bg-[#0a0a12]">
                  <div className="w-full h-full">
                    <SimPreviewCanvas result={simResult} />
                  </div>
                </div>
              )}

              {/* Game-mode playable preview — center viewport overlay when mode=game */}
              {createMode === 'game' && (
                <div className="absolute inset-0 z-5 flex items-center justify-center bg-[#06060c]">
                  <div className="w-full h-full">
                    <GamePreviewCanvas result={gameResult} building={gameBuilding} />
                  </div>
                </div>
              )}

              {/* Avatar-mode rig preview — center viewport overlay when mode=avatar */}
              {createMode === 'avatar' && (
                <div className="absolute inset-0 z-5 flex items-center justify-center bg-[#06060c]">
                  <div className="w-full h-full">
                    <AvatarPreviewCanvas result={avatarResult} building={avatarBuilding} />
                  </div>
                </div>
              )}

              {errors.length > 0 && (
                <div className="absolute left-3 bottom-14 max-w-sm rounded-lg border border-studio-error/30 bg-studio-panel/90 p-3 backdrop-blur z-20">
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
            </HoloFileDropHandler>

            {/* Bottom splitter — disabled while code editor collapsed */}
            {!codeEditorCollapsed && (
              <PanelSplitter
                direction="vertical"
                onDelta={(d) => setBottomPanelH((h) => Math.max(120, Math.min(h - d, 600)))}
              />
            )}

            {/* Bottom: Collapsible code editor */}
            <div
              className="shrink-0 flex flex-col overflow-hidden border-t border-studio-border"
              style={{ height: effectiveBottomH }}
            >
              {/* Collapse toggle header */}
              <div className="flex shrink-0 items-center justify-between border-b border-studio-border bg-studio-panel px-3 py-1">
                <div className="flex items-center gap-1.5 text-[11px] font-medium text-studio-muted">
                  <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                  HoloScript
                </div>
                <button
                  type="button"
                  onClick={() => setCodeEditorCollapsed((v) => !v)}
                  aria-label={codeEditorCollapsed ? 'Expand code editor' : 'Collapse code editor'}
                  aria-expanded={!codeEditorCollapsed}
                  title={codeEditorCollapsed ? 'Expand code editor' : 'Collapse code editor'}
                  className="rounded p-0.5 text-studio-muted hover:text-studio-text hover:bg-white/[0.06] transition"
                >
                  {codeEditorCollapsed ? (
                    <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>

              {/* Editor content — not rendered while collapsed to avoid focus issues */}
              {!codeEditorCollapsed && (
                <>
                  {shaderEditorOpen ? (
                    <StudioErrorBoundary label="Shader Editor">
                      <ShaderEditorPanel onClose={() => setShaderEditorOpen(false)} />
                    </StudioErrorBoundary>
                  ) : timelineOpen ? (
                    <StudioErrorBoundary label="Animation Timeline">
                      <AnimationTimeline onClose={() => setTimelineOpen(false)} />
                    </StudioErrorBoundary>
                  ) : (
                    <div className="flex-1 overflow-hidden">
                      <StudioErrorBoundary label="Trait Inspector">
                        <TraitInspector
                          onOpenPalette={() => setPaletteOpen(true)}
                          onOpenShaderEditor={() => setShaderEditorOpen(true)}
                        />
                      </StudioErrorBoundary>
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <HoloScriptEditor height="100%" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* RIGHT RAIL: descriptor-driven panel warehouse (all panels, default closed) */}
          <RightRailPanelHost
            rightPanelW={rightPanelW}
            setRightPanelW={setRightPanelW}
            descriptors={rightRailDescriptors}
          />

          {/* OVERLAY: Hotkey Map (full screen modal) */}
          <HotkeyMapOverlay open={hotkeyOpen} onClose={() => setHotkeyOpen(false)} />

          {/* FLOATING BRITTNEY DOCK — chat lives over the viewport, never as a
              column. bottom-[calc(...)] keeps the pill INSIDE the 3D viewport
              area (above the code drawer + editor footer), so it never piles
              onto the Quest/Deploy/voice controls in the editor zone. */}
          <div
            className="pointer-events-none absolute left-3 z-30"
            style={{ bottom: `calc(${effectiveBottomH}px + 3.75rem)` }}
          >
            {
              chatOpen ? (
                <div className="pointer-events-auto flex h-[min(540px,calc(100dvh-180px))] w-[380px] flex-col overflow-hidden rounded-xl border border-studio-border bg-studio-panel/95 shadow-2xl backdrop-blur">
                  <div className="flex shrink-0 items-center justify-between border-b border-studio-border px-3 py-1.5">
                    <span className="flex items-center gap-1.5 text-[11px] font-medium text-studio-muted">
                      <MessageCircle className="h-3.5 w-3.5 text-studio-accent" /> Brittney
                    </span>
                    <button
                      onClick={() => setChatOpen(false)}
                      aria-label="Collapse Brittney"
                      className="rounded p-0.5 text-studio-muted transition hover:bg-white/[0.06] hover:text-studio-text"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <BrittneyChatPanel />
                  </div>
                </div>
              ) : null /* collapsed state lives in the top bar (viewer stays empty) */
            }
          </div>

          {/* PANELS POPOVER — every former icon-rail toggle, one button away.
               Anchored below the slim top bar (top-12 clears the h-9 bar + border).
               Does NOT overlap the top-right AIPromptOverlay (which lives inside
               the viewport, below the bar). */}
          {panelsMenuOpen && (
            <div className="absolute right-3 top-12 z-40 grid max-h-[calc(100dvh-6rem)] grid-cols-6 content-start gap-2 overflow-y-auto rounded-xl border border-studio-border bg-[#1e1e2e]/95 p-3 shadow-2xl backdrop-blur">
              {/* Brittney dock toggle */}
              <button
                onClick={toggleChatOpen}
                title={chatOpen ? 'Hide Brittney' : 'Ask Brittney'}
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
                onClick={() => runViewCommand('studio.view.timeline.toggle')}
                title={timelineOpen ? 'Close Timeline' : 'Open Animation Timeline'}
                className={`transition ${
                  timelineOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Film className="h-4 w-4" />
              </button>
              {/* AI Material toggle */}
              <button
                onClick={() => runViewCommand('studio.view.aiMaterial.toggle')}
                title={aiMaterialOpen ? 'Close AI Materials' : 'AI Material Generator'}
                className={`transition ${
                  aiMaterialOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Sparkles className="h-4 w-4" />
              </button>
              {/* Share toggle */}
              <button
                onClick={() => runViewCommand('studio.view.share.toggle')}
                title={shareOpen ? 'Close Share' : 'Share Scene'}
                className={`transition ${
                  shareOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Share2 className="h-4 w-4" />
              </button>
              {/* AI Critique toggle */}
              <button
                onClick={() => runViewCommand('studio.view.critique.toggle')}
                title={critiqueOpen ? 'Close Critique' : 'Scene Critique (AI)'}
                className={`transition ${
                  critiqueOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Lightbulb className="h-4 w-4" />
              </button>
              {/* Asset Pack toggle */}
              <button
                onClick={() => runViewCommand('studio.view.assetPack.toggle')}
                title={assetPackOpen ? 'Close Asset Pack' : 'Import Asset Pack'}
                className={`transition ${
                  assetPackOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Package className="h-4 w-4" />
              </button>
              {/* Versions toggle */}
              <button
                onClick={() => runViewCommand('studio.view.versions.toggle')}
                title={versionsOpen ? 'Close Versions' : 'Scene Version History'}
                className={`transition ${
                  versionsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <GitBranch className="h-4 w-4" />
              </button>
              {/* REPL toggle */}
              <button
                onClick={() => runViewCommand('studio.view.repl.toggle')}
                title={replOpen ? 'Close REPL' : 'HoloScript REPL'}
                className={`transition ${
                  replOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Terminal className="h-4 w-4" />
              </button>
              {/* Registry toggle */}
              <button
                onClick={() => runViewCommand('studio.view.registry.toggle')}
                title={registryOpen ? 'Close Registry' : 'Pack Registry'}
                className={`transition ${
                  registryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Store className="h-4 w-4" />
              </button>
              {/* Mobile Remote toggle */}
              <button
                onClick={() => runViewCommand('studio.view.remote.toggle')}
                title={remoteOpen ? 'Close Remote' : 'Mobile Remote (QR)'}
                className={`transition ${
                  remoteOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Smartphone className="h-4 w-4" />
              </button>
              {/* Export toggle */}
              <button
                onClick={() => runViewCommand('studio.view.export.toggle')}
                title={exportOpen ? 'Close Export' : 'Export Scene'}
                className={`transition ${
                  exportOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Download className="h-4 w-4" />
              </button>
              {/* AI Generator toggle */}
              <button
                onClick={() => runViewCommand('studio.view.generator.toggle')}
                title={generatorOpen ? 'Close AI Generator' : 'AI Scene Generator'}
                className={`transition ${
                  generatorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Wand2 className="h-4 w-4" />
              </button>
              {/* Profiler toggle */}
              <button
                onClick={() => runViewCommand('studio.view.profiler.toggle')}
                title={profilerOpen ? 'Close Profiler' : 'Performance Profiler'}
                className={`transition ${
                  profilerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                <Activity className="h-4 w-4" />
              </button>
              {/* Multiplayer toggle */}
              <button
                onClick={() => runViewCommand('studio.view.multiplayer.toggle')}
                title={multiplayerOpen ? 'Close Multiplayer' : 'Multiplayer Room'}
                className={`transition ${multiplayerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Users2 className="h-4 w-4" />
              </button>
              {/* Debugger toggle */}
              <button
                onClick={() => runViewCommand('studio.view.debugger.toggle')}
                title={debuggerOpen ? 'Close Debugger' : 'HoloScript Debugger'}
                className={`transition ${debuggerOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Bug className="h-4 w-4" />
              </button>
              {/* Snapshot Gallery toggle */}
              <button
                onClick={() => runViewCommand('studio.view.snapshots.toggle')}
                title={snapshotsOpen ? 'Close Gallery' : 'Snapshot Gallery'}
                className={`transition ${snapshotsOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Camera className="h-4 w-4" />
              </button>
              {/* Asset Library toggle */}
              <button
                onClick={() => runViewCommand('studio.view.assetLib.toggle')}
                title={assetLibOpen ? 'Close Asset Library' : 'Asset Library v2'}
                className={`transition ${assetLibOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Library className="h-4 w-4" />
              </button>
              {/* Templates gallery toggle */}
              <button
                onClick={() => runViewCommand('studio.view.templateGallery.toggle')}
                title={templateGalleryOpen ? 'Close Templates' : 'Scene Templates v2'}
                className={`transition ${templateGalleryOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <LayoutTemplate className="h-4 w-4" />
              </button>
              {/* Audio Traits toggle */}
              <button
                onClick={() => runViewCommand('studio.view.audio.toggle')}
                title={audioOpen ? 'Close Audio' : 'Audio Traits'}
                className={`transition ${audioOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Music className="h-4 w-4" />
              </button>
              {/* Export Pipeline v2 toggle */}
              <button
                onClick={() => runViewCommand('studio.view.exportV2.toggle')}
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
                onClick={() => runViewCommand('studio.view.nodeGraph.toggle')}
                title={nodeGraphOpen ? 'Close Node Graph' : 'Node Graph Editor'}
                className={`transition ${nodeGraphOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Network className="h-4 w-4" />
              </button>
              {/* Keyframe Editor toggle */}
              <button
                onClick={() => runViewCommand('studio.view.keyframes.toggle')}
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
              {/* Foundation DAO governance */}
              <button
                onClick={toggleFoundationDaoOpen}
                title={foundationDaoOpen ? 'Close Foundation DAO' : 'Foundation DAO (governance)'}
                className={`transition ${foundationDaoOpen ? 'text-amber-400' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Landmark className="h-4 w-4" />
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
              {/* Parametric Sliders toggle (part mode) */}
              <button
                onClick={toggleParametricSlidersOpen}
                title={
                  parametricSlidersOpen
                    ? 'Close Parametric Sliders'
                    : 'Parametric Sliders (Part mode)'
                }
                className={`transition ${parametricSlidersOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              {/* Printability Report toggle (part mode) */}
              <button
                onClick={togglePrintabilityReportOpen}
                title={
                  printabilityReportOpen
                    ? 'Close Printability Report'
                    : 'Printability Report (Part mode)'
                }
                className={`transition ${printabilityReportOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Gauge className="h-4 w-4" />
              </button>
              {/* Agent Monitor toggle */}
              <button
                onClick={toggleAgentMonitorOpen}
                title={agentMonitorOpen ? 'Close Agent Monitor' : 'Agent Monitor'}
                aria-label={agentMonitorOpen ? 'Close Agent Monitor' : 'Open Agent Monitor'}
                className={`transition ${agentMonitorOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Users2 className="h-4 w-4" />
              </button>
              {/* Gaussian Splat Capture Wizard toggle */}
              <button
                onClick={() => setSplatWizardOpen(true)}
                title="Open Gaussian Splat Capture Wizard"
                aria-label="Open Gaussian Splat Capture Wizard"
                className="text-studio-muted transition hover:text-studio-text"
              >
                <Camera className="h-4 w-4" />
              </button>
              {/* FEA Simulation panel toggle */}
              <button
                onClick={toggleSimulationOpen}
                title={simulationOpen ? 'Close FEA Simulation' : 'FEA Simulation'}
                aria-label={simulationOpen ? 'Close FEA Simulation' : 'Open FEA Simulation'}
                className={`transition ${simulationOpen ? 'text-studio-accent' : 'text-studio-muted hover:text-studio-text'}`}
              >
                <Cpu className="h-4 w-4" />
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
          )}
        </div>
      </div>

      {/* Trait Palette modal */}
      <TraitPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Gaussian Splat capture wizard */}
      <SplatCaptureWizard open={splatWizardOpen} onClose={() => setSplatWizardOpen(false)} />

      {/* GitHub Repo import wizard — opened by ?intake=repo */}
      {repoWizardOpen && <ImportRepoWizard onClose={() => setRepoWizardOpen(false)} />}

      {/* Template Picker modal */}
      {templatePickerOpen && <TemplatePicker onClose={() => setTemplatePickerOpen(false)} />}

      {/* Scene Search overlay */}
      <SceneSearchOverlay open={sceneSearchOpen} onClose={() => setSceneSearchOpen(false)} />

      {/* Script Console (fixed bottom panel) */}
      {consoleOpen && (
        <div className="studio-bottom-console fixed bottom-0 left-0 right-0 z-30 h-[280px] border-t border-studio-border shadow-2xl">
          <ScriptConsole />
        </div>
      )}

      {/* Spatial Blame Tooltip */}
    </div>
  );
}
