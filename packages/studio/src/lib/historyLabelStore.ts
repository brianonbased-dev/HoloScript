/**
 * historyLabelStore.ts
 *
 * Lightweight companion to historyStore that records a human-readable
 * label for each temporal snapshot, so HistoryPanel can display
 * "Add Cube" instead of the generic "Step 3".
 *
 * Usage:
 *   import { useHistoryLabelStore } from '@/lib/historyLabelStore';
 *
 *   // Read labels in HistoryPanel:
 *   const labels = useHistoryLabelStore(s => s.labels);
 *   // labels[0] = oldest entry, labels[labels.length-1] = most recent
 */

import { create } from 'zustand';

interface HistoryLabelState {
  /** One label per past temporal state, in chronological order (oldest first). */
  labels: string[];
  /** Append a new label (called alongside every historyStore mutation). */
  pushLabel: (label: string) => void;
  /** Remove the last label (mirrors zundo undo — pops most-recent entry). */
  popLabel: () => void;
  /** Trim labels to the given length (mirrors branch-pruning on new mutation). */
  trimToLength: (length: number) => void;
  /** Clear all labels (mirrors zundo clear). */
  clearLabels: () => void;
}

export const useHistoryLabelStore = create<HistoryLabelState>()((set) => ({
  labels: [],
  pushLabel: (label) =>
    set((s) => ({ labels: [...s.labels, label] })),
  popLabel: () =>
    set((s) => ({ labels: s.labels.slice(0, -1) })),
  trimToLength: (length) =>
    set((s) => ({ labels: s.labels.slice(0, length) })),
  clearLabels: () => set({ labels: [] }),
}));
