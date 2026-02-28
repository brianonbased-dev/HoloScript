import { useEffect } from 'react';

interface OrchestrationKeyboardCallbacks {
  onToggleMCP: () => void;
  onToggleWorkflow: () => void;
  onToggleBehaviorTree: () => void;
  onToggleEventMonitor: () => void;
  onToggleToolCallGraph: () => void;
  onToggleAgentEnsemble: () => void;
  onTogglePlugins?: () => void;
}

export function useOrchestrationKeyboard(callbacks: OrchestrationKeyboardCallbacks) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        callbacks.onToggleMCP();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'W') {
        e.preventDefault();
        callbacks.onToggleWorkflow();
      }
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        callbacks.onToggleBehaviorTree();
      }
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        callbacks.onToggleEventMonitor();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        callbacks.onToggleToolCallGraph();
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        callbacks.onToggleAgentEnsemble();
      }
      if (e.ctrlKey && e.key === 'p' && callbacks.onTogglePlugins) {
        e.preventDefault();
        callbacks.onTogglePlugins();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [callbacks]);
}
