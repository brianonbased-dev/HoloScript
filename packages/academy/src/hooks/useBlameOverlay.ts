/**
 * useBlameOverlay — Hook to wire SpatialBlameOverlay into Studio panels
 *
 * Provides:
 *   - blame state management (show/hide, position, file/line)
 *   - keyboard shortcut (Ctrl+Shift+B) to toggle blame for selected trait
 *   - integration with the Studio panel system
 */

import { useState, useCallback, useEffect } from 'react';
import type { BlameEntry } from '@/features/versionControl/gitBlameService';
import { fetchBlame } from '@/features/versionControl/gitBlameService';

export interface BlameOverlayState {
  /** Whether the overlay is visible */
  visible: boolean;
  /** File path of the active .holo file */
  filePath: string;
  /** 1-indexed line number */
  line: number;
  /** Optional trait label */
  traitLabel?: string;
  /** Loaded blame entry (null while loading) */
  entry: BlameEntry | null;
  /** Loading state */
  loading: boolean;
  /** Error message if blame lookup failed */
  error: string | null;
  /** Whether this is mock data */
  isMock: boolean;
}

const INITIAL_STATE: BlameOverlayState = {
  visible: false,
  filePath: '',
  line: 0,
  traitLabel: undefined,
  entry: null,
  loading: false,
  error: null,
  isMock: false,
};

export interface UseBlameOverlayReturn {
  /** Current blame overlay state */
  state: BlameOverlayState;
  /** Show blame for a specific file and line */
  showBlame: (filePath: string, line: number, traitLabel?: string) => void;
  /** Hide the blame overlay */
  hideBlame: () => void;
  /** Toggle blame visibility */
  toggleBlame: (filePath: string, line: number, traitLabel?: string) => void;
}

export function useBlameOverlay(): UseBlameOverlayReturn {
  const [state, setState] = useState<BlameOverlayState>(INITIAL_STATE);

  const showBlame = useCallback(async (filePath: string, line: number, traitLabel?: string) => {
    setState((prev) => ({
      ...prev,
      visible: true,
      filePath,
      line,
      traitLabel,
      loading: true,
      error: null,
      entry: null,
    }));

    try {
      const result = await fetchBlame(filePath, line, line);
      if (!result.ok) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error ?? 'Failed to fetch blame data',
        }));
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          entry: result.entries[0] ?? null,
          isMock: result.isMock ?? false,
        }));
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: String(e),
      }));
    }
  }, []);

  const hideBlame = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const toggleBlame = useCallback(
    (filePath: string, line: number, traitLabel?: string) => {
      setState((prev) => {
        if (prev.visible && prev.filePath === filePath && prev.line === line) {
          return INITIAL_STATE;
        }
        return prev; // Will be replaced by showBlame
      });

      // If was visible at same location, state is now hidden (from above).
      // Otherwise, show blame
      setState((prev) => {
        if (!prev.visible) {
          // Trigger showBlame on next tick
          return prev;
        }
        return prev;
      });

      // Simply delegate
      showBlame(filePath, line, traitLabel);
    },
    [showBlame]
  );

  // ── Keyboard shortcut: Ctrl+Shift+B ──────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        if (state.visible) {
          hideBlame();
        }
        // Note: showing blame requires file/line context from the editor,
        // which must be provided by the panel integration.
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }
  }, [state.visible, hideBlame]);

  return { state, showBlame, hideBlame, toggleBlame };
}
