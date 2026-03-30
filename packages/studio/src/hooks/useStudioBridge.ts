'use client';

/**
 * useStudioBridge — React hook for integrating StudioBridge with scene stores.
 *
 * Bridges the StudioBridge (AST mutation engine with undo/redo) into the
 * Studio's React state management. When gizmo edits happen, they flow through
 * the bridge for proper history tracking.
 *
 * Usage:
 *   const { bridge, apply, undo, redo, canUndo, canRedo } = useStudioBridge(ast);
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import StudioBridge from '@/lib/StudioBridge';
import type { ASTMutation } from '@/lib/StudioBridge';
import type { HoloComposition } from '@/parser/HoloCompositionTypes';

export interface UseStudioBridgeResult {
  /** The StudioBridge instance */
  bridge: StudioBridge;
  /** Current AST snapshot */
  ast: HoloComposition;
  /** Apply a mutation (visual edit, code edit, etc.) */
  apply: (mutation: ASTMutation) => void;
  /** Undo last mutation */
  undo: () => void;
  /** Redo last undone mutation */
  redo: () => void;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Number of mutations in history */
  historySize: number;
}

/**
 * Hook that creates and manages a StudioBridge instance,
 * syncing AST changes with React state.
 */
export function useStudioBridge(initialAST: HoloComposition): UseStudioBridgeResult {
  const bridgeRef = useRef<StudioBridge | null>(null);

  // Create bridge once
  if (!bridgeRef.current) {
    bridgeRef.current = new StudioBridge(initialAST, {
      maxHistorySize: 100,
      validate: true,
    });
  }

  const bridge = bridgeRef.current;
  const [ast, setAst] = useState<HoloComposition>(() => bridge.getAST());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [historySize, setHistorySize] = useState(0);

  // Listen for bridge changes and sync with React state
  useEffect(() => {
    const unsubscribe = bridge.onChange((event) => {
      setAst(event.newAST);
      setCanUndo(bridge.canUndo());
      setCanRedo(bridge.canRedo());
      setHistorySize(bridge.getHistoryLength());
    });
    return unsubscribe;
  }, [bridge]);

  const apply = useCallback(
    (mutation: ASTMutation) => {
      bridge.apply(mutation);
    },
    [bridge]
  );

  const undo = useCallback(() => {
    bridge.undo();
  }, [bridge]);

  const redo = useCallback(() => {
    bridge.redo();
  }, [bridge]);

  return useMemo(
    () => ({
      bridge,
      ast,
      apply,
      undo,
      redo,
      canUndo,
      canRedo,
      historySize,
    }),
    [bridge, ast, apply, undo, redo, canUndo, canRedo, historySize]
  );
}
