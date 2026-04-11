/**
 * useUndoRedo — keyboard shortcuts for undo/redo
 *
 * Attaches to window:
 *   Ctrl+Z         → undo
 *   Ctrl+Shift+Z   → redo
 *   Ctrl+Y         → redo (Windows convention)
 *
 * Skips when focus is in text inputs / textareas / contentEditable
 * (so typing into the Monaco editor or chat isn't interrupted).
 *
 * Mount once in CreatePage.
 */

'use client';

import { useEffect } from 'react';
import { useTemporalStore, useHistoryStore } from '@/lib/historyStore';
import { useSceneStore, useSceneGraphStore } from '@/lib/stores';

export function useUndoRedo() {
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const isCtrl = e.ctrlKey || e.metaKey;
      if (!isCtrl) return;

      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // Backward sync bridge: when historyStore changes (via undo/redo), reflect onto standard stores
  useEffect(() => {
    return useHistoryStore.subscribe((state) => {
      const currentNodes = useSceneGraphStore.getState().nodes;
      if (state.nodes !== currentNodes) {
        useSceneGraphStore.setState({ nodes: state.nodes });
      }
      
      const currentCode = useSceneStore.getState().code;
      if (state.code && state.code !== currentCode) {
        // Prevent code change from bumping sceneStore timestamp endlessly if identical
        useSceneStore.getState().setCode(state.code);
      }
    });
  }, []);
}
