'use client';

import { useState, useEffect } from 'react';
import { usePanelVisibilityStore } from '@/lib/stores';
import { useGlobalHotkeys } from '@/hooks/useGlobalHotkeys';
import { useOrchestrationKeyboard } from '@/hooks/useOrchestrationKeyboard';
import { useOrchestrationAutoSave } from '@/hooks/useOrchestrationAutoSave';
import { NavBar } from './header/NavBar';
import { StudioPanelOverlays } from './header/StudioPanelOverlays';
import { logger } from '@/lib/logger';

export function StudioHeader() {
  const setShowTutorial = usePanelVisibilityStore((s) => s.setTutorialOpen);
  const hotkeyOverlayOpen = usePanelVisibilityStore((s) => s.hotkeyOverlayOpen);
  const setHotkeyOverlayOpen = usePanelVisibilityStore((s) => s.setHotkeyOverlayOpen);
  const toggleBlameOpen = usePanelVisibilityStore((s) => s.toggleBlameOpen);

  // Orchestration panel toggles (for keyboard shortcuts)
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
  const pluginManagerOpen = usePanelVisibilityStore((s) => s.pluginManagerOpen);
  const setPluginManagerOpen = usePanelVisibilityStore((s) => s.setPluginManagerOpen);
  const cloudDeployOpen = usePanelVisibilityStore((s) => s.cloudDeployOpen);
  const setCloudDeployOpen = usePanelVisibilityStore((s) => s.setCloudDeployOpen);

  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);

  // First-launch detection
  useEffect(() => {
    try {
      const done = localStorage.getItem('holoscript-studio-tutorial-complete');
      if (!done) setShowTutorial(true);
    } catch (err) { logger.warn('[StudioHeader] reading tutorial state from localStorage failed:', err); }
  }, [setShowTutorial]);

  const dismissTutorial = () => {
    setShowTutorial(false);
    try {
      localStorage.setItem('holoscript-studio-tutorial-complete', 'true');
    } catch (err) { logger.warn('[StudioHeader] saving tutorial state to localStorage failed:', err); }
  };

  // Keyboard shortcut: Ctrl+Shift+B => toggle blame overlay
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

  // Global keyboard shortcuts
  useGlobalHotkeys({ onOpenHelp: () => setHotkeyOverlayOpen(!hotkeyOverlayOpen) });

  // Orchestration keyboard shortcuts
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

  // Orchestration auto-save
  useOrchestrationAutoSave();

  return (
    <>
      <NavBar setShowSetupWizard={setShowSetupWizard} setShowImportWizard={setShowImportWizard} />
      <StudioPanelOverlays
        showSetupWizard={showSetupWizard}
        onCloseSetupWizard={() => setShowSetupWizard(false)}
        showImportWizard={showImportWizard}
        onCloseImportWizard={() => setShowImportWizard(false)}
        dismissTutorial={dismissTutorial}
      />
    </>
  );
}