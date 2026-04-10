/**
 * Auto-Save Hook
 *
 * Automatically saves shader graph to localStorage
 */

import { useEffect, useRef } from 'react';
import { useShaderGraph } from './useShaderGraph';

const AUTO_SAVE_KEY = 'holoscript_shader_editor_autosave';
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

export function useAutoSave() {
  const isDirty = useShaderGraph((state) => state.isDirty);
  const serializeGraph = useShaderGraph((state) => state.serializeGraph);
  const markClean = useShaderGraph((state) => state.markClean);
  const lastSaveRef = useRef<number>(0);

  useEffect(() => {
    if (!isDirty) return;

    const now = Date.now();
    const timeSinceLastSave = now - lastSaveRef.current;

    if (timeSinceLastSave < AUTO_SAVE_INTERVAL) {
      // Schedule save for later
      const timeToWait = AUTO_SAVE_INTERVAL - timeSinceLastSave;
      const timer = setTimeout(() => {
        const serialized = serializeGraph();
        localStorage.setItem(AUTO_SAVE_KEY, serialized);
        localStorage.setItem(`${AUTO_SAVE_KEY}_timestamp`, Date.now().toString());
        lastSaveRef.current = Date.now();
        markClean();
      }, timeToWait);

      return () => clearTimeout(timer);
    } else {
      // Save immediately
      const serialized = serializeGraph();
      localStorage.setItem(AUTO_SAVE_KEY, serialized);
      localStorage.setItem(`${AUTO_SAVE_KEY}_timestamp`, Date.now().toString());
      lastSaveRef.current = Date.now();
      markClean();
    }
  }, [isDirty, serializeGraph, markClean]);

  return {
    loadAutoSave: () => {
      const saved = localStorage.getItem(AUTO_SAVE_KEY);
      const timestamp = localStorage.getItem(`${AUTO_SAVE_KEY}_timestamp`);
      if (saved && timestamp) {
        return {
          data: saved,
          timestamp: parseInt(timestamp, 10),
        };
      }
      return null;
    },
    clearAutoSave: () => {
      localStorage.removeItem(AUTO_SAVE_KEY);
      localStorage.removeItem(`${AUTO_SAVE_KEY}_timestamp`);
    },
  };
}
