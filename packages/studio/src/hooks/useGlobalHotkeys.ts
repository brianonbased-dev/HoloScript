import { useEffect } from 'react';
import { useHistoryStore } from '../lib/historyStore';
import { usePanelVisibilityStore } from '../lib/stores/panelVisibilityStore';

interface GlobalHotkeyOptions {
  onOpenHelp?: () => void;
}

export function useGlobalHotkeys(options?: GlobalHotkeyOptions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering hotkeys inside inputs or textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (cmdOrCtrl && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          // Ctrl+Shift+Z = Redo
          e.preventDefault();
          useHistoryStore.temporal.getState().redo();
        } else {
          // Ctrl+Z = Undo
          e.preventDefault();
          useHistoryStore.temporal.getState().undo();
        }
      } else if (cmdOrCtrl && e.key.toLowerCase() === 'y') {
        // Ctrl+Y = Redo
        e.preventDefault();
        useHistoryStore.temporal.getState().redo();
      } else if (e.key === 'Escape') {
        // Escape = Close all panels
        usePanelVisibilityStore.getState().closeAll();
        options?.onOpenHelp?.(); // optionally toggle help if open
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
}
