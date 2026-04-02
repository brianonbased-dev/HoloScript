'use client';
/**
 * usePanelPresets — Save/restore panel layout presets via localStorage
 *
 * Stores which tabs are open, the active tab, and sidebar state.
 * Named presets: "Default", "World Builder", "Debug", "Custom 1-3"
 */
import { useState, useCallback } from 'react';
import type { PanelTab } from '../types/panels';

const STORAGE_KEY = 'holoscript-studio-presets';

export interface PanelPreset {
  name: string;
  activeTab: PanelTab;
  isOpen: boolean;
  createdAt: number;
}

const BUILT_IN_PRESETS: PanelPreset[] = [
  { name: 'Default', activeTab: 'safety', isOpen: true, createdAt: 0 },
  { name: 'World Builder', activeTab: 'terrain', isOpen: true, createdAt: 0 },
  { name: 'Debug', activeTab: 'profiler', isOpen: true, createdAt: 0 },
  { name: 'Animation', activeTab: 'timeline', isOpen: true, createdAt: 0 },
  { name: 'Compile', activeTab: 'compiler', isOpen: true, createdAt: 0 },
];

function loadPresets(): PanelPreset[] {
  try {
    if (typeof window === 'undefined') return BUILT_IN_PRESETS;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BUILT_IN_PRESETS;
    const saved = JSON.parse(raw) as PanelPreset[];
    return [
      ...BUILT_IN_PRESETS,
      ...saved.filter((s) => !BUILT_IN_PRESETS.some((b) => b.name === s.name)),
    ];
  } catch {
    return BUILT_IN_PRESETS;
  }
}

function savePresets(presets: PanelPreset[]) {
  try {
    if (typeof window === 'undefined') return;
    const custom = presets.filter((p) => !BUILT_IN_PRESETS.some((b) => b.name === p.name));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch (err) { console.warn('[usePanelPresets] saving presets to localStorage failed:', err); }
}

export interface UsePanelPresetsReturn {
  presets: PanelPreset[];
  activePreset: string | null;
  savePreset: (name: string, activeTab: PanelTab, isOpen: boolean) => void;
  deletePreset: (name: string) => void;
  loadPreset: (name: string) => PanelPreset | null;
}

export function usePanelPresets(): UsePanelPresetsReturn {
  const [presets, setPresets] = useState<PanelPreset[]>(loadPresets);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const savePresetFn = useCallback((name: string, activeTab: PanelTab, isOpen: boolean) => {
    setPresets((prev) => {
      const next = prev.filter((p) => p.name !== name);
      const preset: PanelPreset = { name, activeTab, isOpen, createdAt: Date.now() };
      next.push(preset);
      savePresets(next);
      return next;
    });
  }, []);

  const deletePreset = useCallback((name: string) => {
    if (BUILT_IN_PRESETS.some((b) => b.name === name)) return; // Can't delete built-in
    setPresets((prev) => {
      const next = prev.filter((p) => p.name !== name);
      savePresets(next);
      return next;
    });
  }, []);

  const loadPresetFn = useCallback(
    (name: string) => {
      const preset = presets.find((p) => p.name === name) || null;
      if (preset) setActivePreset(name);
      return preset;
    },
    [presets]
  );

  return {
    presets,
    activePreset,
    savePreset: savePresetFn,
    deletePreset,
    loadPreset: loadPresetFn,
  };
}
