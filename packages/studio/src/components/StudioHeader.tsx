'use client';

import {
  ArrowLeft,
  Glasses,
  Upload,
  Zap,
  BarChart2,
  X,
  BookOpen,
  HelpCircle,
  Sparkles,
  Server,
  Workflow,
  GitCommit,
  Eye,
  GitBranch,
  Users,
  Activity,
  ShoppingBag,
  Package,
  Cloud,
  MoreHorizontal,
  CheckCircle,
  Palette,
  Bot,
  Paintbrush,
  Download,
  FolderOpen,
  FolderGit2,
  Settings2,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAIStore, useSceneStore, useEditorStore, usePanelVisibilityStore } from '@/lib/stores';
import { useSceneGraphStore } from '@/lib/stores/sceneGraphStore';
import { SaveBar } from '@/components/SaveBar';
import { CollabBar } from '@/components/collaboration/CollabBar';
import { xrStore } from '@/components/vr/VREditSession';
import dynamic from 'next/dynamic';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import { useOrchestrationKeyboard } from '@/hooks/useOrchestrationKeyboard';
import { useOrchestrationAutoSave } from '@/hooks/useOrchestrationAutoSave';
import { useStudioPresetStore } from '@/lib/stores/studioPresetStore';
import { STUDIO_PRESETS } from '@/lib/presets/studioPresets';
import { StudioEvents } from '@/lib/analytics';

const StudioSetupWizard = dynamic(
  () =>
    import('@/components/wizard/StudioSetupWizard').then((m) => ({ default: m.StudioSetupWizard })),
  { ssr: false }
);

const ImportRepoWizard = dynamic(
  () =>
    import('@/components/wizard/ImportRepoWizard').then((m) => ({ default: m.ImportRepoWizard })),
  { ssr: false }
);

const PublishPanel = dynamic(
  () => import('@/components/publish/PublishPanel').then((m) => ({ default: m.PublishPanel })),
  { ssr: false }
);
const BenchmarkScene = dynamic(() => import('@/components/perf/BenchmarkScene'), { ssr: false });

// Spatial Blame Overlay
const SpatialBlameOverlay = dynamic(
  () =>
    import('@/components/versionControl/SpatialBlameOverlay').then((m) => ({
      default: m.SpatialBlameOverlay,
    })),
  { ssr: false }
);

// Lazy-load panels to avoid SSR issues and reduce initial bundle
const ExampleGallery = dynamic(
  () => import('@/components/gallery/ExampleGallery').then((m) => ({ default: m.ExampleGallery })),
  { ssr: false }
);
const FirstLaunchTutorial = dynamic(
  () =>
    import('@/components/wizard/FirstLaunchTutorial').then((m) => ({
      default: m.FirstLaunchTutorial,
    })),
  { ssr: false }
);
const PromptLibrary = dynamic(
  () => import('@/components/ai/PromptLibrary').then((m) => ({ default: m.PromptLibrary })),
  { ssr: false }
);

// Orchestration panels
const MCPServerConfigPanel = dynamic(
  () => import('@/components/orchestration').then((m) => ({ default: m.MCPServerConfigPanel })),
  { ssr: false }
);
const AgentOrchestrationGraphEditor = dynamic(
  () =>
    import('@/components/orchestration').then((m) => ({
      default: m.AgentOrchestrationGraphEditor,
    })),
  { ssr: false }
);
const BehaviorTreeVisualEditor = dynamic(
  () => import('@/components/orchestration').then((m) => ({ default: m.BehaviorTreeVisualEditor })),
  { ssr: false }
);
const DesktopAgentEnsemble = dynamic(
  () => import('@/components/orchestration').then((m) => ({ default: m.DesktopAgentEnsemble })),
  { ssr: false }
);
const AgentEventMonitorPanel = dynamic(
  () => import('@/components/orchestration').then((m) => ({ default: m.AgentEventMonitorPanel })),
  { ssr: false }
);
const ToolCallGraphVisualizer = dynamic(
  () => import('@/components/orchestration').then((m) => ({ default: m.ToolCallGraphVisualizer })),
  { ssr: false }
);

// Marketplace
const MarketplacePanel = dynamic(
  () => import('@/components/marketplace').then((m) => ({ default: m.MarketplacePanel })),
  { ssr: false }
);

// Plugins
const PluginManagerPanel = dynamic(
  () => import('@/components/plugins').then((m) => ({ default: m.PluginManagerPanel })),
  { ssr: false }
);

// Cloud Deployment
const CloudDeployPanel = dynamic(
  () => import('@/components/cloud').then((m) => ({ default: m.CloudDeployPanel })),
  { ssr: false }
);

// Conformance / Validation
const ConformanceSuitePanel = dynamic(
  () =>
    import('@/components/validation/ConformanceSuitePanel').then((m) => ({
      default: m.ConformanceSuitePanel,
    })),
  { ssr: false }
);

// DAG Visualization — scene graph viewer
const DAGVisualizationPanel = dynamic(
  () =>
    import('@/components/visualization/DAGVisualizationPanel').then((m) => ({
      default: m.DAGVisualizationPanel,
    })),
  { ssr: false }
);

// Agent Monitor — uAA2++ cycle telemetry
const AgentMonitorPanel = dynamic(
  () =>
    import('@/components/ai/AgentMonitorPanel').then((m) => ({
      default: m.AgentMonitorPanel,
    })),
  { ssr: false }
);

// Material editor — quick surface properties
const SimpleMaterialPanel = dynamic(
  () =>
    import('@/components/materials/SimpleMaterialPanel').then((m) => ({
      default: m.SimpleMaterialPanel,
    })),
  { ssr: false }
);

const TexturePaintPanel = dynamic(
  () =>
    import('@/components/paint/TexturePaintPanel').then((m) => ({
      default: m.TexturePaintPanel,
    })),
  { ssr: false }
);

// Sprint 2-4: Orphaned studio components
const CalibrationUncertaintyIndicator = dynamic(
  () =>
    import('@/components/ai/CalibrationUncertaintyIndicator').then((m) => ({
      default: m.CalibrationUncertaintyIndicator,
    })),
  { ssr: false }
);
const DragonPreview = dynamic(
  () =>
    import('@/components/preview/DragonPreview').then((m) => ({
      default: m.DragonPreview,
    })),
  { ssr: false }
);
const HoloDiffPanel = dynamic(
  () =>
    import('@/components/diff/HoloDiffPanel').then((m) => ({
      default: m.HoloDiffPanel,
    })),
  { ssr: false }
);
const SliderMaterialInspector = dynamic(
  () =>
    import('@/components/inspector/SliderMaterialInspector').then((m) => ({
      default: m.SliderMaterialInspector,
    })),
  { ssr: false }
);
const TraitSupportMatrixDashboard = dynamic(
  () =>
    import('@/components/registry/TraitSupportMatrixDashboard').then((m) => ({
      default: m.TraitSupportMatrixDashboard,
    })),
  { ssr: false }
);
const AssetImportDropZone = dynamic(
  () =>
    import('@/components/import/AssetImportDropZone').then((m) => ({
      default: m.AssetImportDropZone,
    })),
  { ssr: false }
);
const CinematicCameraPanel = dynamic(
  () =>
    import('@/components/camera/CinematicCameraPanel').then((m) => ({
      default: m.CinematicCameraPanel,
    })),
  { ssr: false }
);
const SyntheticDataDashboard = dynamic(
  () =>
    import('@/components/synthetic/SyntheticDataDashboard').then((m) => ({
      default: m.SyntheticDataDashboard,
    })),
  { ssr: false }
);
const CompilationPipelineVisualizer = dynamic(
  () =>
    import('@/components/pipeline/CompilationPipelineVisualizer').then((m) => ({
      default: m.CompilationPipelineVisualizer,
    })),
  { ssr: false }
);
const ConfidenceAwareXRUI = dynamic(
  () =>
    import('@/components/xr/ConfidenceAwareXRUI').then((m) => ({
      default: m.ConfidenceAwareXRUI,
    })),
  { ssr: false }
);
const StudioOperationsHub = dynamic(
  () =>
    import('@/components/operations/StudioOperationsHub').then((m) => ({
      default: m.StudioOperationsHub,
    })),
  { ssr: false }
);

export function StudioHeader() {
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const metadata = useSceneStore((s) => s.metadata);
  const isDirty = useSceneStore((s) => s.isDirty);
  const setMetadata = useSceneStore((s) => s.setMetadata);

  const studioMode = useEditorStore((s) => s.studioMode);
  const showBenchmark = useEditorStore((s) => s.showBenchmark);
  const showPerfOverlay = useEditorStore((s) => s.showPerfOverlay);
  const setShowBenchmark = useEditorStore((s) => s.setShowBenchmark);
  const togglePerfOverlay = useEditorStore((s) => s.togglePerfOverlay);

  const showGovernancePanel = useEditorStore((s) => s.showGovernancePanel);
  const setShowGovernancePanel = useEditorStore((s) => s.setShowGovernancePanel);
  const showConformancePanel = useEditorStore((s) => s.showConformancePanel);
  const setShowConformancePanel = useEditorStore((s) => s.setShowConformancePanel);

  const agentMonitorOpen = usePanelVisibilityStore((s) => s.agentMonitorOpen);
  const toggleAgentMonitorOpen = usePanelVisibilityStore((s) => s.toggleAgentMonitorOpen);
  const materialOpen = usePanelVisibilityStore((s) => s.materialOpen);
  const toggleMaterialOpen = usePanelVisibilityStore((s) => s.toggleMaterialOpen);
  const texturePaintOpen = usePanelVisibilityStore((s) => s.texturePaintOpen);
  const toggleTexturePaintOpen = usePanelVisibilityStore((s) => s.toggleTexturePaintOpen);
  const blameOpen = usePanelVisibilityStore((s) => s.blameOpen);
  const toggleBlameOpen = usePanelVisibilityStore((s) => s.toggleBlameOpen);
  const dagOpen = usePanelVisibilityStore((s) => s.dagOpen);
  const toggleDagOpen = usePanelVisibilityStore((s) => s.toggleDagOpen);

  // ── Keyboard shortcut: Ctrl+Shift+B → toggle blame overlay ──────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        toggleBlameOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleBlameOpen]);

  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const publishOpen = usePanelVisibilityStore((s) => s.publishOpen);
  const setPublishOpen = usePanelVisibilityStore((s) => s.setPublishOpen);
  const examplesOpen = usePanelVisibilityStore((s) => s.examplesOpen);
  const setExamplesOpen = usePanelVisibilityStore((s) => s.setExamplesOpen);
  const showTutorial = usePanelVisibilityStore((s) => s.tutorialOpen);
  const setShowTutorial = usePanelVisibilityStore((s) => s.setTutorialOpen);
  const hotkeyOverlayOpen = usePanelVisibilityStore((s) => s.hotkeyOverlayOpen);
  const setHotkeyOverlayOpen = usePanelVisibilityStore((s) => s.setHotkeyOverlayOpen);
  const promptsOpen = usePanelVisibilityStore((s) => s.promptsOpen);
  const setPromptsOpen = usePanelVisibilityStore((s) => s.setPromptsOpen);

  // ── Orchestration panel toggles (managed by panelVisibilityStore) ─────────
  const mcpConfigOpen = usePanelVisibilityStore((s) => s.mcpConfigOpen);
  const setMcpConfigOpen = usePanelVisibilityStore((s) => s.setMcpConfigOpen);
  const agentWorkflowOpen = usePanelVisibilityStore((s) => s.agentWorkflowOpen);
  const setAgentWorkflowOpen = usePanelVisibilityStore((s) => s.setAgentWorkflowOpen);
  const behaviorTreeOpen = usePanelVisibilityStore((s) => s.behaviorTreeOpen);
  const setBehaviorTreeOpen = usePanelVisibilityStore((s) => s.setBehaviorTreeOpen);
  const agentEnsembleOpen = usePanelVisibilityStore((s) => s.agentEnsembleOpen);
  const setAgentEnsembleOpen = usePanelVisibilityStore((s) => s.setAgentEnsembleOpen);
  const eventMonitorOpen = usePanelVisibilityStore((s) => s.eventMonitorOpen);
  const setEventMonitorOpen = usePanelVisibilityStore((s) => s.setEventMonitorOpen);
  const toolCallGraphOpen = usePanelVisibilityStore((s) => s.toolCallGraphOpen);
  const setToolCallGraphOpen = usePanelVisibilityStore((s) => s.setToolCallGraphOpen);
  const marketplaceOpen = usePanelVisibilityStore((s) => s.marketplaceOpen);
  const setMarketplaceOpen = usePanelVisibilityStore((s) => s.setMarketplaceOpen);
  const pluginManagerOpen = usePanelVisibilityStore((s) => s.pluginManagerOpen);
  const setPluginManagerOpen = usePanelVisibilityStore((s) => s.setPluginManagerOpen);
  const cloudDeployOpen = usePanelVisibilityStore((s) => s.cloudDeployOpen);
  const setCloudDeployOpen = usePanelVisibilityStore((s) => s.setCloudDeployOpen);

  // ── Studio Setup Wizard ────────────────────────────────────────────────────
  const activePresetId = useStudioPresetStore((s) => s.activePresetId);
  const experienceLevel = useStudioPresetStore((s) => s.experienceLevel);
  const projectSpecifics = useStudioPresetStore((s) => s.projectSpecifics);
  const applyPreset = useStudioPresetStore((s) => s.applyPreset);
  const activePreset = activePresetId ? STUDIO_PRESETS.find((p) => p.id === activePresetId) : null;
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [presetDropdownOpen, setPresetDropdownOpen] = useState(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  // Close preset dropdown when clicking outside
  useEffect(() => {
    if (!presetDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (presetDropdownRef.current && !presetDropdownRef.current.contains(e.target as Node)) {
        setPresetDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [presetDropdownOpen]);

  // ── First-launch detection ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const done = localStorage.getItem('holoscript-studio-tutorial-complete');
      if (!done) setShowTutorial(true);
    } catch {}
  }, []);

  const dismissTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
    } catch {}
  };

  // ── Global keyboard shortcuts ───────────────────────────────────────────────
  useGlobalHotkeys({ onOpenHelp: () => setHotkeyOverlayOpen(!hotkeyOverlayOpen) });

  // ── Orchestration keyboard shortcuts ────────────────────────────────────────
  useOrchestrationKeyboard({
    onToggleMCP: () => setMcpConfigOpen(!mcpConfigOpen),
    onToggleWorkflow: () => setAgentWorkflowOpen(!agentWorkflowOpen),
    onToggleBehaviorTree: () => setBehaviorTreeOpen(!behaviorTreeOpen),
    onToggleEventMonitor: () => setEventMonitorOpen(!eventMonitorOpen),
    onToggleToolCallGraph: () => setToolCallGraphOpen(!toolCallGraphOpen),
    onToggleAgentEnsemble: () => setAgentEnsembleOpen(!agentEnsembleOpen),
    onTogglePlugins: () => setPluginManagerOpen(!pluginManagerOpen),
    onToggleCloud: () => setCloudDeployOpen(!cloudDeployOpen),
  });

  // ── Orchestration auto-save ─────────────────────────────────────────────────
  useOrchestrationAutoSave();

  const isExpert = studioMode === 'expert';

  // ── Toolbar overflow menu (for small viewports) ───────────────────────────
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close overflow when clicking outside
  useEffect(() => {
    if (!overflowOpen) return;
    const handler = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [overflowOpen]);

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
      xrStore
        .enterVR()
        .then(() => setXrActive(true))
        .catch(() => {});
    }
  };

  const handleExportScene = useCallback(() => {
    const json = useSceneGraphStore.getState().serializeScene();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata.name || 'scene'}.holoscript.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [metadata.name]);

  const handleImportScene = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.holoscript.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          useSceneGraphStore.getState().loadScene(reader.result as string);
        } catch (err) {
          console.error('[Studio] Failed to import scene:', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  return (
    <>
      <header className="grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-studio-border bg-studio-panel px-2 sm:px-4 gap-1 sm:gap-2">
        {/* Left: back link + scene name */}
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="text-studio-muted transition hover:text-studio-text shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold hidden sm:inline shrink-0">
            HoloScript <span className="text-studio-accent">Studio</span>
          </span>
          <span className="text-xs text-studio-muted hidden sm:inline shrink-0">|</span>
          <input
            type="text"
            value={metadata.name}
            onChange={(e) => setMetadata({ name: e.target.value })}
            className="min-w-0 w-28 bg-transparent text-sm text-studio-text outline-none truncate"
            placeholder="Untitled Scene"
          />
          {isDirty && (
            <span
              className="h-2 w-2 rounded-full bg-studio-warning shrink-0"
              title="Unsaved changes"
            />
          )}
        </div>

        {/* Center: Expert Mode Toggle */}
        <div className="flex justify-center">
          <button
            onClick={() => {
              if (isExpert) {
                // Revert to setup configuration state
                useStudioPresetStore.getState().reset();
                if (typeof window !== 'undefined') window.location.reload();
              } else {
                useStudioPresetStore.getState().unlockMassiveIde();
              }
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition ${
              isExpert
                ? 'bg-studio-accent text-white shadow-md shadow-studio-accent/20'
                : 'bg-studio-panel border border-studio-border text-studio-muted hover:text-studio-text hover:bg-studio-surface'
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            {isExpert ? 'Massive IDE' : 'Expert Mode'}
          </button>
        </div>

        {/* Right: status + tools + VR + collab + save */}
        <div className="flex items-center justify-end gap-2">
          {/* Ollama status */}
          <div className="flex items-center gap-1.5 text-xs text-studio-muted">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                ollamaStatus === 'connected'
                  ? 'bg-studio-success'
                  : ollamaStatus === 'checking'
                    ? 'bg-studio-warning animate-pulse'
                    : 'bg-studio-error'
              }`}
            />
            <span className="hidden lg:inline">
              {ollamaStatus === 'connected'
                ? 'AI Ready'
                : ollamaStatus === 'checking'
                  ? 'Checking...'
                  : 'AI Offline'}
            </span>
          </div>
          {/* ── Scene I/O buttons ─────────────────────────────── */}
          <button
            id="studio-header-export-scene"
            onClick={handleExportScene}
            title="Export Scene (JSON)"
            aria-label="Export Scene"
            className="studio-header-btn flex items-center gap-1.5 rounded-lg border border-studio-border px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-text"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Export</span>
          </button>
          <button
            id="studio-header-import-scene"
            onClick={handleImportScene}
            title="Import Scene (JSON)"
            aria-label="Import Scene"
            className="studio-header-btn flex items-center gap-1.5 rounded-lg border border-studio-border px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-text"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Import</span>
          </button>

          {/* ── Examples button ────────────────────────────────── */}
          <button
            onClick={() => setExamplesOpen(true)}
            title="Browse Examples"
            className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-accent"
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Examples</span>
          </button>

          {/* ── Prompts button ──────────────────────────────────── */}
          <button
            onClick={() => setPromptsOpen(true)}
            title="AI Prompt Library"
            className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-amber-500/40 hover:text-amber-400"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Prompts</span>
          </button>

          {/* ── Marketplace button ─────────────────────────────── */}
          <button
            onClick={() => setMarketplaceOpen(true)}
            title="Content Marketplace"
            className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-emerald-500/40 hover:text-emerald-400"
          >
            <ShoppingBag className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Marketplace</span>
          </button>

          {/* ── Integrations Link ─────────────────────────────── */}
          <Link
            href="/integrations"
            title="Integration Hub"
            className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-indigo-500/40 hover:text-indigo-400"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Integrations</span>
          </Link>

          {/* ── Customize Studio button with quick-switch dropdown ── */}
          <div className="relative" ref={presetDropdownRef}>
            <div className="flex items-center">
              <button
                onClick={() => setPresetDropdownOpen((v) => !v)}
                title="Switch Studio Preset"
                className={`flex items-center gap-1.5 rounded-l-lg border px-2.5 py-1 text-xs font-medium transition ${
                  presetDropdownOpen
                    ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                    : 'border-studio-border bg-studio-surface text-studio-muted hover:border-emerald-500/40 hover:text-emerald-400'
                }`}
              >
                <Settings2 className="h-3.5 w-3.5" />
                {activePreset && (
                  <span className="hidden lg:inline text-emerald-400">
                    {activePreset.emoji} {activePreset.label}
                  </span>
                )}
                {!activePreset && <span className="hidden lg:inline">Setup</span>}
              </button>
              <button
                onClick={() => setShowSetupWizard(true)}
                title="Open Full Setup Wizard"
                className="flex items-center rounded-r-lg border border-l-0 border-studio-border bg-studio-surface px-1.5 py-1 text-xs text-studio-muted transition hover:border-emerald-500/40 hover:text-emerald-400"
              >
                <Sparkles className="h-3 w-3" />
              </button>
            </div>
            {presetDropdownOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-xl border border-studio-border bg-studio-panel shadow-2xl shadow-black/40 animate-scale-in overflow-hidden">
                <div className="px-3 py-2 border-b border-studio-border">
                  <p className="text-[10px] font-semibold text-studio-muted uppercase tracking-wider">
                    Quick Switch Preset
                  </p>
                </div>
                <div className="p-1.5 space-y-0.5 max-h-[50vh] overflow-y-auto">
                  {STUDIO_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        StudioEvents.presetApplied(preset.id, 'quick_switch');
                        applyPreset(
                          preset.id,
                          projectSpecifics ?? {
                            projectSize: 'small',
                            artStyle: 'stylized',
                            platforms: ['web'],
                          },
                          experienceLevel
                        );
                        setPresetDropdownOpen(false);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition ${
                        activePresetId === preset.id
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
                      }`}
                    >
                      <span className="text-base shrink-0">{preset.emoji}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-medium truncate">{preset.label}</p>
                        <p className="text-[9px] text-studio-muted/70 truncate">
                          {preset.description}
                        </p>
                      </div>
                      {activePresetId === preset.id && (
                        <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 border-t border-studio-border flex flex-col gap-1.5">
                  <button
                    onClick={() => {
                      setShowSetupWizard(true);
                      setPresetDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-studio-accent/20 px-3 py-1.5 text-[10px] font-semibold text-studio-accent transition hover:bg-studio-accent/30"
                  >
                    <Sparkles className="h-3 w-3" />
                    Full Setup Wizard
                  </button>
                  <button
                    onClick={() => {
                      setShowImportWizard(true);
                      setPresetDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500/20 px-3 py-1.5 text-[10px] font-semibold text-blue-400 transition hover:bg-blue-500/30"
                  >
                    <FolderGit2 className="h-3 w-3" />
                    Import GitHub Repo
                  </button>
                  <button
                    onClick={() => {
                      useStudioPresetStore.getState().unlockMassiveIde();
                      setPresetDropdownOpen(false);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg mt-1 border border-rose-500/30 bg-rose-500/20 px-3 py-1.5 text-[10px] font-semibold text-rose-400 transition hover:bg-rose-500/30 hover:border-rose-500/50"
                  >
                    <Settings2 className="h-3 w-3" />
                    Unlock Massive IDE
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Help / Tour button ─────────────────────────────── */}
          <button
            onClick={() => setShowTutorial(true)}
            title="Guided Tour"
            className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-accent"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>

          {/* ── Orchestration tools (visible on xl+, overflow menu on smaller) ── */}
          <div className="hidden xl:contents">
            <button
              onClick={() => setShowGovernancePanel(!showGovernancePanel)}
              title="Git & Governance"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                showGovernancePanel
                  ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-indigo-500/40 hover:text-indigo-400'
              }`}
            >
              <GitCommit className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Governance</span>
            </button>

            {/* Spatial Blame — git blame overlay for .holo traits (Ctrl+Shift+B) */}
            <button
              id="studio-header-blame"
              onClick={toggleBlameOpen}
              title="Spatial Blame (Ctrl+Shift+B)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                blameOpen
                  ? 'border-rose-500/40 bg-rose-500/20 text-rose-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-rose-500/40 hover:text-rose-400'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Blame</span>
            </button>

            {/* Agent Monitor — uAA2++ cycle telemetry */}
            <button
              id="studio-header-agent-monitor"
              onClick={toggleAgentMonitorOpen}
              title="Agent Monitor (uAA2++ cycle)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                agentMonitorOpen
                  ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-emerald-500/40 hover:text-emerald-400'
              }`}
            >
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Agent</span>
            </button>

            {/* Material editor — quick surface properties */}
            <button
              id="studio-header-material"
              onClick={toggleMaterialOpen}
              title="Material Editor"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                materialOpen
                  ? 'border-orange-500/40 bg-orange-500/20 text-orange-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-orange-500/40 hover:text-orange-400'
              }`}
            >
              <Palette className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Material</span>
            </button>

            {/* Texture Paint — brush painting on 3D surfaces */}
            <button
              id="studio-header-texture-paint"
              onClick={toggleTexturePaintOpen}
              title="Texture Paint"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                texturePaintOpen
                  ? 'border-pink-500/40 bg-pink-500/20 text-pink-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-pink-500/40 hover:text-pink-400'
              }`}
            >
              <Paintbrush className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Paint</span>
            </button>

            <button
              onClick={() => setMcpConfigOpen(!mcpConfigOpen)}
              title="MCP Servers (Ctrl+M)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                mcpConfigOpen
                  ? 'border-blue-500/40 bg-blue-500/20 text-blue-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-blue-500/40 hover:text-blue-400'
              }`}
            >
              <Server className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">MCP</span>
            </button>

            <button
              onClick={() => setAgentWorkflowOpen(!agentWorkflowOpen)}
              title="Agent Orchestration (Ctrl+Shift+W)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                agentWorkflowOpen
                  ? 'border-purple-500/40 bg-purple-500/20 text-purple-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-purple-500/40 hover:text-purple-400'
              }`}
            >
              <Workflow className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Workflow</span>
            </button>

            <button
              onClick={() => setBehaviorTreeOpen(!behaviorTreeOpen)}
              title="Behavior Tree (Ctrl+B)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                behaviorTreeOpen
                  ? 'border-green-500/40 bg-green-500/20 text-green-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-green-500/40 hover:text-green-400'
              }`}
            >
              <GitBranch className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">BT</span>
            </button>

            <button
              onClick={() => setAgentEnsembleOpen(!agentEnsembleOpen)}
              title="Agent Ensemble (Ctrl+Shift+A)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                agentEnsembleOpen
                  ? 'border-cyan-500/40 bg-cyan-500/20 text-cyan-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-cyan-500/40 hover:text-cyan-400'
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Agents</span>
            </button>

            <button
              onClick={() => setEventMonitorOpen(!eventMonitorOpen)}
              title="Event Monitor (Ctrl+E)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                eventMonitorOpen
                  ? 'border-orange-500/40 bg-orange-500/20 text-orange-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-orange-500/40 hover:text-orange-400'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Events</span>
            </button>

            <button
              onClick={() => setToolCallGraphOpen(!toolCallGraphOpen)}
              title="Tool Call Graph (Ctrl+Shift+T)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                toolCallGraphOpen
                  ? 'border-amber-500/40 bg-amber-500/20 text-amber-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-amber-500/40 hover:text-amber-400'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Tools</span>
            </button>

            <button
              onClick={() => setPluginManagerOpen(!pluginManagerOpen)}
              title="Plugin Manager (Ctrl+P)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                pluginManagerOpen
                  ? 'border-violet-500/40 bg-violet-500/20 text-violet-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-violet-500/40 hover:text-violet-400'
              }`}
            >
              <Package className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Plugins</span>
            </button>

            <button
              onClick={() => setCloudDeployOpen(!cloudDeployOpen)}
              title="Cloud Deployment (Ctrl+Shift+D)"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                cloudDeployOpen
                  ? 'border-sky-500/40 bg-sky-500/20 text-sky-300'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-sky-500/40 hover:text-sky-400'
              }`}
            >
              <Cloud className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Cloud</span>
            </button>
          </div>

          {/* ── Overflow menu (visible on < xl) ── */}
          <div className="relative xl:hidden" ref={overflowRef}>
            <button
              onClick={() => setOverflowOpen((v) => !v)}
              title="More tools"
              className={`studio-header-btn flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                overflowOpen
                  ? 'border-studio-accent/40 bg-studio-accent/20 text-studio-accent'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:border-studio-accent/40 hover:text-studio-accent'
              }`}
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">More</span>
            </button>
            {overflowOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-xl border border-studio-border bg-studio-panel shadow-2xl shadow-black/40 animate-scale-in overflow-hidden">
                <div className="p-1.5 space-y-0.5 max-h-[70vh] overflow-y-auto">
                  {(
                    [
                      {
                        label: 'MCP Servers',
                        icon: Server,
                        active: mcpConfigOpen,
                        onClick: () => {
                          setMcpConfigOpen(!mcpConfigOpen);
                          setOverflowOpen(false);
                        },
                        color: 'blue',
                      },
                      {
                        label: 'Governance',
                        icon: GitCommit,
                        active: showGovernancePanel,
                        onClick: () => {
                          setShowGovernancePanel(!showGovernancePanel);
                          setOverflowOpen(false);
                        },
                        color: 'indigo',
                      },
                      {
                        label: 'Blame',
                        icon: Eye,
                        active: blameOpen,
                        onClick: () => {
                          toggleBlameOpen();
                          setOverflowOpen(false);
                        },
                        color: 'rose',
                      },
                      {
                        label: 'Workflow',
                        icon: Workflow,
                        active: agentWorkflowOpen,
                        onClick: () => {
                          setAgentWorkflowOpen(!agentWorkflowOpen);
                          setOverflowOpen(false);
                        },
                        color: 'purple',
                      },
                      {
                        label: 'Behavior Tree',
                        icon: GitBranch,
                        active: behaviorTreeOpen,
                        onClick: () => {
                          setBehaviorTreeOpen(!behaviorTreeOpen);
                          setOverflowOpen(false);
                        },
                        color: 'green',
                      },
                      {
                        label: 'Agents',
                        icon: Users,
                        active: agentEnsembleOpen,
                        onClick: () => {
                          setAgentEnsembleOpen(!agentEnsembleOpen);
                          setOverflowOpen(false);
                        },
                        color: 'cyan',
                      },
                      {
                        label: 'Events',
                        icon: Activity,
                        active: eventMonitorOpen,
                        onClick: () => {
                          setEventMonitorOpen(!eventMonitorOpen);
                          setOverflowOpen(false);
                        },
                        color: 'orange',
                      },
                      {
                        label: 'Tools',
                        icon: Zap,
                        active: toolCallGraphOpen,
                        onClick: () => {
                          setToolCallGraphOpen(!toolCallGraphOpen);
                          setOverflowOpen(false);
                        },
                        color: 'amber',
                      },
                      {
                        label: 'Plugins',
                        icon: Package,
                        active: pluginManagerOpen,
                        onClick: () => {
                          setPluginManagerOpen(!pluginManagerOpen);
                          setOverflowOpen(false);
                        },
                        color: 'violet',
                      },
                      {
                        label: 'Cloud',
                        icon: Cloud,
                        active: cloudDeployOpen,
                        onClick: () => {
                          setCloudDeployOpen(!cloudDeployOpen);
                          setOverflowOpen(false);
                        },
                        color: 'sky',
                      },
                    ] as const
                  ).map(({ label, icon: Icon, active, onClick, color }) => (
                    <button
                      key={label}
                      onClick={onClick}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-xs font-medium transition ${
                        active
                          ? `bg-${color}-500/20 text-${color}-300`
                          : 'text-studio-muted hover:bg-studio-surface hover:text-studio-text'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                      {active && <span className="ml-auto text-[8px] opacity-60">ON</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Expert-only tools ─────────────────────────────── */}
          {isExpert && (
            <>
              {/* Perf Overlay toggle */}
              <button
                onClick={togglePerfOverlay}
                title={showPerfOverlay ? 'Hide FPS overlay' : 'Show FPS overlay'}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  showPerfOverlay
                    ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                    : 'border border-studio-border bg-studio-surface text-studio-muted hover:border-violet-500/40 hover:text-violet-400'
                }`}
              >
                <BarChart2 className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Perf</span>
              </button>

              {/* Benchmark */}
              <button
                onClick={() => setShowBenchmark(true)}
                title="Open Performance Benchmark"
                className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-amber-500/40 hover:text-amber-400"
              >
                <Zap className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Benchmark</span>
              </button>
            </>
          )}

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

          {/* Conformance Check Button (Replaces Play) */}
          <button
            onClick={() => setShowConformancePanel(!showConformancePanel)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-semibold transition ${
              showConformancePanel
                ? 'bg-emerald-500 text-white border-emerald-400'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Validate
          </button>

          {/* Publish button */}
          <button
            onClick={() => setPublishOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/30"
          >
            <Upload className="h-3.5 w-3.5" />
            Publish
          </button>

          {/* Save / Open / Share / Export */}
          <SaveBar />
        </div>
      </header>

      {publishOpen && <PublishPanel onClose={() => setPublishOpen(false)} />}

      {/* ── Examples drawer (right side panel, full-screen on mobile) ── */}
      {examplesOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right sm:max-w-80">
          <ExampleGallery onClose={() => setExamplesOpen(false)} />
        </div>
      )}

      {/* ── Prompts drawer (right side panel, full-screen on mobile) ── */}
      {promptsOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right sm:max-w-80">
          <PromptLibrary
            onClose={() => setPromptsOpen(false)}
            onUsePrompt={(prompt) => {
              window.dispatchEvent(new CustomEvent('brittney-prompt', { detail: prompt }));
              setPromptsOpen(false);
            }}
          />
        </div>
      )}

      {/* ── First-launch tutorial ────────────────────────────────── */}
      {showTutorial && <FirstLaunchTutorial onClose={dismissTutorial} />}

      {/* ── Benchmark drawer (full-screen overlay, Expert mode) ───── */}
      {showBenchmark && (
        <div className="fixed inset-0 z-50 flex flex-col bg-studio-bg/95 backdrop-blur-sm">
          {/* Drawer header */}
          <div className="flex h-10 items-center justify-between border-b border-studio-border bg-studio-panel px-4">
            <span className="text-sm font-semibold text-studio-text">⚡ Performance Benchmark</span>
            <button
              onClick={() => setShowBenchmark(false)}
              className="rounded p-1 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
              title="Close benchmark"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {/* Benchmark content */}
          <div className="flex-1 overflow-hidden">
            <BenchmarkScene />
          </div>
        </div>
      )}

      {/* ── Orchestration Panels ─────────────────────────────────── */}

      {/* MCP Server Config (right sidebar, fullscreen on mobile) */}
      {mcpConfigOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <MCPServerConfigPanel onClose={() => setMcpConfigOpen(false)} />
        </div>
      )}

      {/* Agent Workflow Editor (full-screen modal, no inset on mobile) */}
      {agentWorkflowOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0 sm:inset-4 bg-studio-panel sm:rounded-xl border border-studio-border">
            <AgentOrchestrationGraphEditor
              workflowId="default"
              onClose={() => setAgentWorkflowOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Behavior Tree Editor (full-screen modal, no inset on mobile) */}
      {behaviorTreeOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0 sm:inset-4 bg-studio-panel sm:rounded-xl border border-studio-border">
            <BehaviorTreeVisualEditor treeId="default" onClose={() => setBehaviorTreeOpen(false)} />
          </div>
        </div>
      )}

      {/* Desktop Agent Ensemble (right sidebar, wider, capped on tablet) */}
      {agentEnsembleOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-full sm:w-[600px] sm:max-w-[80vw] border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <DesktopAgentEnsemble onClose={() => setAgentEnsembleOpen(false)} />
        </div>
      )}

      {/* Event Monitor (right sidebar, fullscreen on mobile) */}
      {eventMonitorOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <AgentEventMonitorPanel onClose={() => setEventMonitorOpen(false)} />
        </div>
      )}

      {/* Tool Call Graph (right sidebar, fullscreen on mobile) */}
      {toolCallGraphOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <ToolCallGraphVisualizer onClose={() => setToolCallGraphOpen(false)} />
        </div>
      )}

      {/* Marketplace (full-screen modal) */}
      {marketplaceOpen && <MarketplacePanel onClose={() => setMarketplaceOpen(false)} />}

      {/* Plugin Manager (full-screen modal) */}
      {pluginManagerOpen && <PluginManagerPanel onClose={() => setPluginManagerOpen(false)} />}

      {/* Cloud Deployment (full-screen modal) */}
      {cloudDeployOpen && <CloudDeployPanel onClose={() => setCloudDeployOpen(false)} />}

      {/* Conformance Suite (right sidebar) */}
      {showConformancePanel && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <ConformanceSuitePanel onClose={() => setShowConformancePanel(false)} />
        </div>
      )}

      {/* Agent Monitor (right sidebar — uAA2++ telemetry) */}
      {agentMonitorOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <AgentMonitorPanel onClose={toggleAgentMonitorOpen} />
        </div>
      )}

      {/* Material Editor (right sidebar — quick PBR controls) */}
      {materialOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SimpleMaterialPanel onClose={toggleMaterialOpen} />
        </div>
      )}

      {/* Texture Paint Panel (right sidebar) */}
      {texturePaintOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <TexturePaintPanel onClose={toggleTexturePaintOpen} />
        </div>
      )}

      {/* Spatial Blame Overlay (right sidebar — git blame for .holo traits) */}
      {blameOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SpatialBlameOverlay
            filePath={metadata.name ? `${metadata.name}.holo` : 'untitled.holo'}
            line={1}
            traitLabel="scene"
            onClose={toggleBlameOpen}
          />
        </div>
      )}

      {/* DAG Visualization (right sidebar — scene graph viewer) */}
      {dagOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[480px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <DAGVisualizationPanel onClose={toggleDagOpen} />
        </div>
      )}

      {/* Sprint 2-4: Orphaned studio panels — now wired */}
      {(usePanelVisibilityStore.getState() as any).calibrationOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <CalibrationUncertaintyIndicator />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).dragonPreviewOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <DragonPreview />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).holoDiffOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <HoloDiffPanel
            onClose={() => usePanelVisibilityStore.getState().setHoloDiffOpen(false)}
          />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).sliderInspectorOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SliderMaterialInspector />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).traitMatrixOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <TraitSupportMatrixDashboard />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).assetImportOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <AssetImportDropZone />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).cinematicCameraOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <CinematicCameraPanel />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).syntheticDataOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SyntheticDataDashboard />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).compilationPipelineOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <CompilationPipelineVisualizer />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).confidenceXROpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <ConfidenceAwareXRUI />
        </div>
      )}
      {(usePanelVisibilityStore.getState() as any).operationsHubOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <StudioOperationsHub />
        </div>
      )}

      {/* Studio Setup Wizard (re-open from header button) */}
      {showSetupWizard && <StudioSetupWizard onClose={() => setShowSetupWizard(false)} />}

      {/* Import Repo Wizard */}
      {showImportWizard && <ImportRepoWizard onClose={() => setShowImportWizard(false)} />}
    </>
  );
}
