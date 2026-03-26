'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { commandRegistry, type CommandEntry } from './CommandRegistry';

// ─── Types ──────────────────────────────────────────────────────

export interface UseCommandPaletteReturn {
  /** Whether the palette is currently open. */
  isOpen: boolean;
  /** Open the palette. */
  open: () => void;
  /** Close the palette and clear the query. */
  close: () => void;
  /** Toggle the palette open/closed. */
  toggle: () => void;
  /** Current search query. */
  query: string;
  /** Update the search query. */
  setQuery: (q: string) => void;
  /** Filtered command results based on query. */
  results: CommandEntry[];
  /** Index of the currently highlighted command. */
  selectedIndex: number;
  /** Set the highlighted index. */
  setSelectedIndex: (i: number) => void;
  /** Move selection up. */
  selectPrevious: () => void;
  /** Move selection down. */
  selectNext: () => void;
  /** Execute the currently selected command and close. */
  executeSelected: () => Promise<void>;
  /** Execute a specific command by id and close. */
  executeCommand: (id: string) => Promise<void>;
  /** Total number of registered commands. */
  totalCommands: number;
}

// ─── Hook ───────────────────────────────────────────────────────

/**
 * useCommandPalette -- Manages the Cmd+K command palette state.
 *
 * Handles:
 * - Open/close with Cmd+K / Ctrl+K keyboard shortcut
 * - Fuzzy search through the command registry
 * - Arrow key navigation and Enter to execute
 * - Escape to close
 *
 * @example
 * ```tsx
 * const { isOpen, query, setQuery, results, toggle } = useCommandPalette();
 * ```
 */
export function useCommandPalette(): UseCommandPaletteReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Subscribe to registry changes for re-rendering
  const commandCount = useSyncExternalStore(
    (cb) => commandRegistry.subscribe(cb),
    () => commandRegistry.size
  );

  // Search results based on query
  const results = commandRegistry.search(query);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K or Ctrl+K to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen((prev) => {
          if (prev) {
            // closing
            setQuery('');
            setSelectedIndex(0);
          }
          return !prev;
        });
        return;
      }

      // Escape to close (only when open)
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
        setSelectedIndex(0);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setQuery('');
        setSelectedIndex(0);
      }
      return !prev;
    });
  }, []);

  const selectPrevious = useCallback(() => {
    setSelectedIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
  }, [results.length]);

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => (prev >= results.length - 1 ? 0 : prev + 1));
  }, [results.length]);

  const executeSelected = useCallback(async () => {
    const cmd = results[selectedIndex];
    if (cmd) {
      await commandRegistry.execute(cmd.id);
      setIsOpen(false);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [results, selectedIndex]);

  const executeCommand = useCallback(async (id: string) => {
    await commandRegistry.execute(id);
    setIsOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    results,
    selectedIndex,
    setSelectedIndex,
    selectPrevious,
    selectNext,
    executeSelected,
    executeCommand,
    totalCommands: commandCount,
  };
}
