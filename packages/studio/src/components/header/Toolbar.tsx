import {
  Download,
  FolderOpen,
  BookOpen,
  Sparkles,
  ShoppingBag,
  Zap,
  HelpCircle,
  GitCommit,
  Eye,
  Bot,
  Palette,
  Paintbrush,
  Server,
  Workflow,
  GitBranch,
  Users,
  Activity,
  Package,
  Cloud,
  MoreHorizontal,
  BarChart2,
  Glasses,
  CheckCircle,
  Upload,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAIStore, useSceneStore, useEditorStore, usePanelVisibilityStore } from '@/lib/stores';
import { useSceneGraphStore } from '@/lib/stores/sceneGraphStore';
import { SaveBar } from '@/components/SaveBar';
import { CollabBar } from '@/components/collaboration/CollabBar';
import { xrStore } from '@/components/vr/VREditSession';
import { logger } from '@/lib/logger';
import { UserMenu } from './UserMenu';

interface ToolbarProps {
  setShowSetupWizard?: (show: boolean) => void;
  setShowImportWizard?: (show: boolean) => void;
}

export function Toolbar({ setShowSetupWizard, setShowImportWizard }: ToolbarProps) {
  const ollamaStatus = useAIStore((s) => s.ollamaStatus);
  const metadata = useSceneStore((s) => s.metadata);
  
  const studioMode = useEditorStore((s) => s.studioMode);
  const isExpert = studioMode === 'expert';
  
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

  const setPublishOpen = usePanelVisibilityStore((s) => s.setPublishOpen);
  const setExamplesOpen = usePanelVisibilityStore((s) => s.setExamplesOpen);
  const setShowTutorial = usePanelVisibilityStore((s) => s.setTutorialOpen);
  const setPromptsOpen = usePanelVisibilityStore((s) => s.setPromptsOpen);

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
  const [xrSupported, setXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

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
        .catch((err) => logger.warn('Swallowed error caught:', err));
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
          logger.error('[Studio] Failed to import scene:', err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, []);

  return (
    <nav aria-label="Editor tools" className="flex items-center justify-end gap-2">
      <div role="status" aria-label={`AI status: ${ollamaStatus}`} className="flex items-center gap-1.5 text-xs text-studio-muted">
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
      
      <button
        onClick={handleExportScene}
        title="Export Scene (JSON)"
        aria-label="Export Scene"
        className="studio-header-btn flex items-center gap-1.5 rounded-lg border border-studio-border px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-text"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Export</span>
      </button>
      <button
        onClick={handleImportScene}
        title="Import Scene (JSON)"
        aria-label="Import Scene"
        className="studio-header-btn flex items-center gap-1.5 rounded-lg border border-studio-border px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-text"
      >
        <FolderOpen className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Import</span>
      </button>

      <button
        onClick={() => setExamplesOpen(true)}
        title="Browse Examples"
        className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-accent"
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Examples</span>
      </button>

      <button
        onClick={() => setPromptsOpen(true)}
        title="AI Prompt Library"
        className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-amber-500/40 hover:text-amber-400"
      >
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Prompts</span>
      </button>

      <button
        onClick={() => setMarketplaceOpen(true)}
        title="Content Marketplace"
        className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-emerald-500/40 hover:text-emerald-400"
      >
        <ShoppingBag className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Marketplace</span>
      </button>

      <Link
        href="/integrations"
        title="Integration Hub"
        className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-indigo-500/40 hover:text-indigo-400"
      >
        <Zap className="h-3.5 w-3.5" />
        <span className="hidden lg:inline">Integrations</span>
      </Link>

      <UserMenu 
        setShowSetupWizard={(v) => { if(typeof setShowSetupWizard !== 'function') logger.warn('Missing setSetupWizardOpen'); else setShowSetupWizard(v); }}
        setShowImportWizard={(v) => { if(typeof setShowImportWizard !== 'function') logger.warn('Missing setImportWizardOpen'); else setShowImportWizard(v); }}
      />

      <button
        onClick={() => setShowTutorial(true)}
        title="Guided Tour"
        className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2 py-1 text-xs font-medium text-studio-muted transition hover:border-studio-accent/40 hover:text-studio-accent"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>

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

        <button
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

        <button
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

        <button
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

        <button
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

      {isExpert && (
        <>
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

      <CollabBar />

      <WalletChip />

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

      <button
        onClick={() => setPublishOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/30"
      >
        <Upload className="h-3.5 w-3.5" />
        Publish
      </button>

      <SaveBar />
    </nav>
  );
}

// ── WalletChip ────────────────────────────────────────────────────────────────
function WalletChip() {
  const [address, setAddress] = useState<string | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/holomesh/agent/self').then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch('/api/holomesh/dashboard/earnings').then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([self, earnings]) => {
      if (cancelled) return;
      if (self?.agent?.walletAddress) setAddress(self.agent.walletAddress as string);
      if (earnings?.totalRevenueCents != null) setBalanceUsd((earnings.totalRevenueCents as number) / 100);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading || (!address && balanceUsd === null)) return null;

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;

  return (
    <a
      href="/holomesh/profile"
      title={address ?? 'Wallet'}
      className="flex items-center gap-1.5 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1 text-xs font-medium text-studio-muted transition hover:border-violet-500/40 hover:text-violet-400"
    >
      <Wallet className="h-3.5 w-3.5 shrink-0" />
      {shortAddr && <span className="hidden lg:inline font-mono">{shortAddr}</span>}
      {balanceUsd !== null && (
        <span className="text-emerald-400">${balanceUsd.toFixed(2)}</span>
      )}
    </a>
  );
}
