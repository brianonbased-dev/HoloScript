'use client';

/**
 * StudioPanelOverlays — all conditional panel/overlay renders for the studio header.
 *
 * Extracted from StudioHeader.tsx (PERF-01) to reduce component size.
 * Subscribes to stores directly instead of relying on prop drilling.
 */

import dynamic from 'next/dynamic';
import { X } from 'lucide-react';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';
import { useEditorStore, usePanelVisibilityStore, useSceneStore } from '@/lib/stores';

// ── Lazy-loaded panels ────────────────────────────────────────────────────────

const PublishPanel = dynamic(
  () => import('@/components/publish/PublishPanel').then((m) => ({ default: m.PublishPanel })),
  { ssr: false }
);

const BenchmarkScene = dynamic(() => import('@/components/perf/BenchmarkScene'), { ssr: false });

const SpatialBlameOverlay = dynamic(
  () =>
    import('@/components/versionControl/SpatialBlameOverlay').then((m) => ({
      default: m.SpatialBlameOverlay,
    })),
  { ssr: false }
);

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

const MarketplacePanel = dynamic(
  () => import('@/components/marketplace').then((m) => ({ default: m.MarketplacePanel })),
  { ssr: false }
);

const PluginManagerPanel = dynamic(
  () => import('@/components/plugins').then((m) => ({ default: m.PluginManagerPanel })),
  { ssr: false }
);

const CloudDeployPanel = dynamic(
  () => import('@/components/cloud').then((m) => ({ default: m.CloudDeployPanel })),
  { ssr: false }
);

const ConformanceSuitePanel = dynamic(
  () =>
    import('@/components/validation/ConformanceSuitePanel').then((m) => ({
      default: m.ConformanceSuitePanel,
    })),
  { ssr: false }
);

const DAGVisualizationPanel = dynamic(
  () =>
    import('@/components/visualization/DAGVisualizationPanel').then((m) => ({
      default: m.DAGVisualizationPanel,
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

const TexturePaintPanel = dynamic(
  () =>
    import('@/components/paint/TexturePaintPanel').then((m) => ({
      default: m.TexturePaintPanel,
    })),
  { ssr: false }
);

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

// ── Component ─────────────────────────────────────────────────────────────────

interface StudioPanelOverlaysProps {
  showSetupWizard: boolean;
  onCloseSetupWizard: () => void;
  showImportWizard: boolean;
  onCloseImportWizard: () => void;
  dismissTutorial: () => void;
}

export function StudioPanelOverlays({
  showSetupWizard,
  onCloseSetupWizard,
  showImportWizard,
  onCloseImportWizard,
  dismissTutorial,
}: StudioPanelOverlaysProps) {
  const metadata = useSceneStore((s) => s.metadata);

  const showBenchmark = useEditorStore((s) => s.showBenchmark);
  const setShowBenchmark = useEditorStore((s) => s.setShowBenchmark);
  const showConformancePanel = useEditorStore((s) => s.showConformancePanel);
  const setShowConformancePanel = useEditorStore((s) => s.setShowConformancePanel);

  const publishOpen = usePanelVisibilityStore((s) => s.publishOpen);
  const setPublishOpen = usePanelVisibilityStore((s) => s.setPublishOpen);
  const examplesOpen = usePanelVisibilityStore((s) => s.examplesOpen);
  const setExamplesOpen = usePanelVisibilityStore((s) => s.setExamplesOpen);
  const showTutorial = usePanelVisibilityStore((s) => s.tutorialOpen);
  const promptsOpen = usePanelVisibilityStore((s) => s.promptsOpen);
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

  // Orphaned panels — using typed store selectors (replacing `getState() as any`)
  const calibrationOpen = usePanelVisibilityStore((s) => s.calibrationOpen);
  const dragonPreviewOpen = usePanelVisibilityStore((s) => s.dragonPreviewOpen);
  const holoDiffOpen = usePanelVisibilityStore((s) => s.holoDiffOpen);
  const setHoloDiffOpen = usePanelVisibilityStore((s) => s.setHoloDiffOpen);
  const sliderInspectorOpen = usePanelVisibilityStore((s) => s.sliderInspectorOpen);
  const traitMatrixOpen = usePanelVisibilityStore((s) => s.traitMatrixOpen);
  const assetImportOpen = usePanelVisibilityStore((s) => s.assetImportOpen);
  const cinematicCameraOpen = usePanelVisibilityStore((s) => s.cinematicCameraOpen);
  const syntheticDataOpen = usePanelVisibilityStore((s) => s.syntheticDataOpen);
  const compilationPipelineOpen = usePanelVisibilityStore((s) => s.compilationPipelineOpen);
  const confidenceXROpen = usePanelVisibilityStore((s) => s.confidenceXROpen);
  const operationsHubOpen = usePanelVisibilityStore((s) => s.operationsHubOpen);

  return (
    <>
      {publishOpen && <PublishPanel onClose={() => setPublishOpen(false)} />}

      {examplesOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right sm:max-w-80">
          <ExampleGallery onClose={() => setExamplesOpen(false)} />
        </div>
      )}

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

      {showTutorial && <FirstLaunchTutorial onClose={dismissTutorial} />}

      {showBenchmark && (
        <div className="fixed inset-0 z-50 flex flex-col bg-studio-bg/95 backdrop-blur-sm">
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
          <div className="flex-1 overflow-hidden">
            <BenchmarkScene />
          </div>
        </div>
      )}

      {mcpConfigOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <StudioErrorBoundary label="MCP Config Panel">
          <MCPServerConfigPanel onClose={() => setMcpConfigOpen(false)} />
          </StudioErrorBoundary>
        </div>
      )}

      {agentWorkflowOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0 sm:inset-4 bg-studio-panel sm:rounded-xl border border-studio-border">
            <StudioErrorBoundary label="Agent Workflow Graph">
            <AgentOrchestrationGraphEditor
              workflowId="default"
              onClose={() => setAgentWorkflowOpen(false)}
            />
            </StudioErrorBoundary>
          </div>
        </div>
      )}

      {behaviorTreeOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div className="absolute inset-0 sm:inset-4 bg-studio-panel sm:rounded-xl border border-studio-border">
            <StudioErrorBoundary label="Behavior Tree Editor">
            <BehaviorTreeVisualEditor treeId="default" onClose={() => setBehaviorTreeOpen(false)} />
            </StudioErrorBoundary>
          </div>
        </div>
      )}

      {agentEnsembleOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-full sm:w-[600px] sm:max-w-[80vw] border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <StudioErrorBoundary label="Agent Ensemble">
          <DesktopAgentEnsemble onClose={() => setAgentEnsembleOpen(false)} />
          </StudioErrorBoundary>
        </div>
      )}

      {eventMonitorOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <StudioErrorBoundary label="Agent Event Monitor">
          <AgentEventMonitorPanel onClose={() => setEventMonitorOpen(false)} />
          </StudioErrorBoundary>
        </div>
      )}

      {toolCallGraphOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <StudioErrorBoundary label="Tool Call Graph">
          <ToolCallGraphVisualizer onClose={() => setToolCallGraphOpen(false)} />
          </StudioErrorBoundary>
        </div>
      )}

      {marketplaceOpen && <MarketplacePanel onClose={() => setMarketplaceOpen(false)} />}

      {pluginManagerOpen && <PluginManagerPanel onClose={() => setPluginManagerOpen(false)} />}

      {cloudDeployOpen && <CloudDeployPanel onClose={() => setCloudDeployOpen(false)} />}

      {showConformancePanel && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <ConformanceSuitePanel onClose={() => setShowConformancePanel(false)} />
        </div>
      )}

      {agentMonitorOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <AgentMonitorPanel onClose={toggleAgentMonitorOpen} />
        </div>
      )}

      {materialOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SimpleMaterialPanel onClose={toggleMaterialOpen} />
        </div>
      )}

      {texturePaintOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <TexturePaintPanel onClose={toggleTexturePaintOpen} />
        </div>
      )}

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

      {dagOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[480px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <DAGVisualizationPanel onClose={toggleDagOpen} />
        </div>
      )}

      {calibrationOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <CalibrationUncertaintyIndicator />
        </div>
      )}

      {dragonPreviewOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <DragonPreview />
        </div>
      )}

      {holoDiffOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <HoloDiffPanel onClose={() => setHoloDiffOpen(false)} />
        </div>
      )}

      {sliderInspectorOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-80 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SliderMaterialInspector />
        </div>
      )}

      {traitMatrixOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <TraitSupportMatrixDashboard />
        </div>
      )}

      {assetImportOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <AssetImportDropZone />
        </div>
      )}

      {cinematicCameraOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <CinematicCameraPanel />
        </div>
      )}

      {syntheticDataOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <SyntheticDataDashboard />
        </div>
      )}

      {compilationPipelineOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <CompilationPipelineVisualizer />
        </div>
      )}

      {confidenceXROpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-96 max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <ConfidenceAwareXRUI />
        </div>
      )}

      {operationsHubOpen && (
        <div className="studio-drawer fixed right-0 top-12 bottom-0 z-40 w-[520px] max-w-full border-l border-studio-border shadow-2xl animate-slide-in-from-right">
          <StudioOperationsHub />
        </div>
      )}

      {showSetupWizard && <StudioSetupWizard onClose={onCloseSetupWizard} />}

      {showImportWizard && <ImportRepoWizard onClose={onCloseImportWizard} />}
    </>
  );
}
