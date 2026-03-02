'use client';

import { ArrowLeft, Glasses, Upload, Zap, BarChart2, X, BookOpen, HelpCircle, Sparkles, Server, Workflow, GitBranch, Users, Activity, ShoppingBag, Package, Cloud, MoreHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAIStore, useSceneStore, useEditorStore } from '@/lib/store';
import { SaveBar } from '@/components/SaveBar';
import { CollabBar } from '@/components/collaboration/CollabBar';
import { xrStore } from '@/components/vr/VREditSession';
import { StudioModeSwitcher } from '@/components/StudioModeSwitcher';
import dynamic from 'next/dynamic';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import { useOrchestrationKeyboard } from '@/hooks/useOrchestrationKeyboard';
import { useOrchestrationAutoSave } from '@/hooks/useOrchestrationAutoSave';

const PublishPanel = dynamic(() => import('@/components/publish/PublishPanel').then((m) => ({ default: m.PublishPanel })), { ssr: false });
const BenchmarkScene = dynamic(() => import('@/components/perf/BenchmarkScene'), { ssr: false });

// Lazy-load panels to avoid SSR issues and reduce initial bundle
const ExampleGallery = dynamic(() => import('@/components/gallery/ExampleGallery').then((m) => ({ default: m.ExampleGallery })), { ssr: false });
const FirstLaunchTutorial = dynamic(() => import('@/components/wizard/FirstLaunchTutorial').then((m) => ({ default: m.FirstLaunchTutorial })), { ssr: false });
const PromptLibrary = dynamic(() => import('@/components/ai/PromptLibrary').then((m) => ({ default: m.PromptLibrary })), { ssr: false });

// Orchestration panels
const MCPServerConfigPanel = dynamic(() => import('@/components/orchestration').then((m) => ({ default: m.MCPServerConfigPanel })), { ssr: false });
const AgentOrchestrationGraphEditor = dynamic(() => import('@/components/orchestration').then((m) => ({ default: m.AgentOrchestrationGraphEditor })), { ssr: false });
const BehaviorTreeVisualEditor = dynamic(() => import('@/components/orchestration').then((m) => ({ default: m.BehaviorTreeVisualEditor })), { ssr: false });
const DesktopAgentEnsemble = dynamic(() => import('@/components/orchestration').then((m) => ({ default: m.DesktopAgentEnsemble })), { ssr: false });
const AgentEventMonitorPanel = dynamic(() => import('@/components/orchestration').then((m) => ({ default: m.AgentEventMonitorPanel })), { ssr: false });
const ToolCallGraphVisualizer = dynamic(() => import('@/components/orchestration').then((m) => ({ default: m.ToolCallGraphVisualizer })), { ssr: false });

// Marketplace
const MarketplacePanel = dynamic(() => import('@/components/marketplace').then((m) => ({ default: m.MarketplacePanel })), { ssr: false });

// Plugins
const PluginManagerPanel = dynamic(() => import('@/components/plugins').then((m) => ({ default: m.PluginManagerPanel })), { ssr: false });

// Cloud Deployment
const CloudDeployPanel = dynamic(() => import('@/components/cloud').then((m) => ({ default: m.CloudDeployPanel })), { ssr: false });

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

  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [hotkeyOverlayOpen, setHotkeyOverlayOpen] = useState(false);
  const [promptsOpen, setPromptsOpen] = useState(false);

  // ── Orchestration panel toggles ──────────────────────────────────────────────
  const [mcpConfigOpen, setMcpConfigOpen] = useState(false);
  const [agentWorkflowOpen, setAgentWorkflowOpen] = useState(false);
  const [behaviorTreeOpen, setBehaviorTreeOpen] = useState(false);
  const [agentEnsembleOpen, setAgentEnsembleOpen] = useState(false);
  const [eventMonitorOpen, setEventMonitorOpen] = useState(false);
  const [toolCallGraphOpen, setToolCallGraphOpen] = useState(false);
  const [marketplaceOpen, setMarketplaceOpen] = useState(false);
  const [pluginManagerOpen, setPluginManagerOpen] = useState(false);
  const [cloudDeployOpen, setCloudDeployOpen] = useState(false);

  // ── First-launch detection ──────────────────────────────────────────────────
  useEffect(() => {
    try {
      const done = localStorage.getItem('holoscript-studio-tutorial-complete');
      if (!done) setShowTutorial(true);
    } catch {}
  }, []);

  const dismissTutorial = () => {
    setShowTutorial(false);
    try { localStorage.setItem('holoscript-studio-tutorial-complete', 'true'); } catch {}
  };

  // ── Global keyboard shortcuts ───────────────────────────────────────────────
  useGlobalHotkeys({ onOpenHelp: () => setHotkeyOverlayOpen((v) => !v) });

  // ── Orchestration keyboard shortcuts ────────────────────────────────────────
  useOrchestrationKeyboard({
    onToggleMCP: () => setMcpConfigOpen((v) => !v),
    onToggleWorkflow: () => setAgentWorkflowOpen((v) => !v),
    onToggleBehaviorTree: () => setBehaviorTreeOpen((v) => !v),
    onToggleEventMonitor: () => setEventMonitorOpen((v) => !v),
    onToggleToolCallGraph: () => setToolCallGraphOpen((v) => !v),
    onToggleAgentEnsemble: () => setAgentEnsembleOpen((v) => !v),
    onTogglePlugins: () => setPluginManagerOpen((v) => !v),
    onToggleCloud: () => setCloudDeployOpen((v) => !v),
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
      xrStore.enterVR().then(() => setXrActive(true)).catch(() => {});
    }
  };

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
          <span className="h-2 w-2 rounded-full bg-studio-warning shrink-0" title="Unsaved changes" />
        )}
      </div>

      {/* Center: Studio Mode Switcher */}
      <div className="flex justify-center">
        <StudioModeSwitcher />
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
            onClick={() => setMcpConfigOpen(!mcpConfigOpen)}
            title="MCP Servers"
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
            title="Agent Orchestration"
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
            title="Behavior Tree"
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
            title="Agent Ensemble"
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
            title="Event Monitor"
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
            title="Tool Call Graph"
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
                {([
                  { label: 'MCP Servers', icon: Server, active: mcpConfigOpen, onClick: () => { setMcpConfigOpen(!mcpConfigOpen); setOverflowOpen(false); }, color: 'blue' },
                  { label: 'Workflow', icon: Workflow, active: agentWorkflowOpen, onClick: () => { setAgentWorkflowOpen(!agentWorkflowOpen); setOverflowOpen(false); }, color: 'purple' },
                  { label: 'Behavior Tree', icon: GitBranch, active: behaviorTreeOpen, onClick: () => { setBehaviorTreeOpen(!behaviorTreeOpen); setOverflowOpen(false); }, color: 'green' },
                  { label: 'Agents', icon: Users, active: agentEnsembleOpen, onClick: () => { setAgentEnsembleOpen(!agentEnsembleOpen); setOverflowOpen(false); }, color: 'cyan' },
                  { label: 'Events', icon: Activity, active: eventMonitorOpen, onClick: () => { setEventMonitorOpen(!eventMonitorOpen); setOverflowOpen(false); }, color: 'orange' },
                  { label: 'Tools', icon: Zap, active: toolCallGraphOpen, onClick: () => { setToolCallGraphOpen(!toolCallGraphOpen); setOverflowOpen(false); }, color: 'amber' },
                  { label: 'Plugins', icon: Package, active: pluginManagerOpen, onClick: () => { setPluginManagerOpen(!pluginManagerOpen); setOverflowOpen(false); }, color: 'violet' },
                  { label: 'Cloud', icon: Cloud, active: cloudDeployOpen, onClick: () => { setCloudDeployOpen(!cloudDeployOpen); setOverflowOpen(false); }, color: 'sky' },
                ] as const).map(({ label, icon: Icon, active, onClick, color }) => (
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
          <BehaviorTreeVisualEditor
            treeId="default"
            onClose={() => setBehaviorTreeOpen(false)}
          />
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
    {marketplaceOpen && (
      <MarketplacePanel onClose={() => setMarketplaceOpen(false)} />
    )}

    {/* Plugin Manager (full-screen modal) */}
    {pluginManagerOpen && (
      <PluginManagerPanel onClose={() => setPluginManagerOpen(false)} />
    )}

    {/* Cloud Deployment (full-screen modal) */}
    {cloudDeployOpen && (
      <CloudDeployPanel onClose={() => setCloudDeployOpen(false)} />
    )}
  </>
  );
}
