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
import { useTemporalStore } from '@/lib/historyStore';

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
}
