'use client';
/**
 * useDomainFilter — Domain-aware panel visibility filter
 *
 * Defines 8 domain profiles (All, Game, VR, IoT, Film, Science, Robotics, Creator)
 * that show/hide panels based on relevance. Also manages favorites and search.
 */
import { useState, useCallback, useMemo } from 'react';
import type { PanelTab } from '../types/panels';
import { logger } from '@/lib/logger';

export type DomainProfile =
  | 'all'
  | 'game'
  | 'vr'
  | 'iot'
  | 'film'
  | 'science'
  | 'robotics'
  | 'creator'
  | 'hologram';

const STORAGE_KEY = 'holoscript-studio-favorites';

/** Which tabs are relevant for each domain */
const DOMAIN_TABS: Record<DomainProfile, Set<PanelTab>> = {
  all: new Set<PanelTab>([
    'safety',
    'marketplace',
    'platform',
    'traits',
    'physics',
    'ai',
    'dialogue',
    'ecs',
    'animation',
    'audio',
    'procgen',
    'multiplayer',
    'shader',
    'combat',
    'pathfinding',
    'particles',
    'camera',
    'inventory',
    'terrain',
    'lighting',
    'cinematic',
    'collaboration',
    'security',
    'scripting',
    'saveload',
    'profiler',
    'compiler',
    'lod',
    'statemachine',
    'input',
    'network',
    'culture',
    'timeline',
    'scene',
    'assets',
    'state',
    'viewport',
    'bus',
    'presets',
    'agent',
    'character',
    'models',
    'templates',
    'diagnostics',
    'behavior',
    'pipeline',
  ]),
  game: new Set<PanelTab>([
    'safety',
    'physics',
    'ai',
    'dialogue',
    'ecs',
    'animation',
    'audio',
    'combat',
    'pathfinding',
    'particles',
    'camera',
    'inventory',
    'terrain',
    'lighting',
    'input',
    'statemachine',
    'compiler',
    'lod',
    'scene',
    'assets',
    'viewport',
    'profiler',
    'saveload',
    'timeline',
    'scripting',
    'character',
    'models',
    'templates',
    'diagnostics',
    'behavior',
  ]),
  vr: new Set<PanelTab>([
    'safety',
    'physics',
    'ecs',
    'animation',
    'audio',
    'shader',
    'camera',
    'lighting',
    'input',
    'collaboration',
    'scene',
    'assets',
    'viewport',
    'profiler',
    'multiplayer',
    'platform',
    'lod',
    'compiler',
    'saveload',
    'models',
    'templates',
    'diagnostics',
  ]),
  iot: new Set<PanelTab>([
    'safety',
    'ecs',
    'network',
    'state',
    'compiler',
    'assets',
    'scene',
    'platform',
    'traits',
    'collaboration',
    'security',
    'profiler',
    'saveload',
    'scripting',
    'bus',
    'agent',
    'templates',
    'diagnostics',
  ]),
  film: new Set<PanelTab>([
    'safety',
    'animation',
    'audio',
    'shader',
    'camera',
    'lighting',
    'cinematic',
    'particles',
    'scene',
    'assets',
    'viewport',
    'timeline',
    'profiler',
    'saveload',
    'compiler',
    'lod',
    'character',
    'models',
    'templates',
    'diagnostics',
  ]),
  science: new Set<PanelTab>([
    'safety',
    'physics',
    'particles',
    'shader',
    'scene',
    'assets',
    'compiler',
    'profiler',
    'saveload',
    'traits',
    'animation',
    'camera',
    'templates',
    'diagnostics',
    'behavior',
    'pipeline',
  ]),
  robotics: new Set<PanelTab>([
    'safety',
    'physics',
    'ai',
    'pathfinding',
    'ecs',
    'scene',
    'assets',
    'compiler',
    'profiler',
    'saveload',
    'traits',
    'network',
    'state',
    'behavior',
    'templates',
    'diagnostics',
    'statemachine',
    'input',
  ]),
  creator: new Set<PanelTab>([
    'safety',
    'traits',
    'animation',
    'shader',
    'lighting',
    'camera',
    'scene',
    'assets',
    'compiler',
    'profiler',
    'saveload',
    'marketplace',
    'collaboration',
    'models',
    'templates',
    'diagnostics',
    'network',
    'procgen',
  ]),
  hologram: new Set<PanelTab>([
    'safety',
    'traits',
    'shader',
    'lighting',
    'camera',
    'scene',
    'assets',
    'compiler',
    'profiler',
    'saveload',
    'models',
    'templates',
    'diagnostics',
    'pipeline',
    'animation',
    'lod',
  ]),
};

const DOMAIN_INFO: Record<DomainProfile, { icon: string; label: string; description: string }> = {
  all: { icon: '🌐', label: 'All', description: 'Show all panels' },
  game: { icon: '🎮', label: 'Game', description: 'Game development focus (28 panels)' },
  vr: { icon: '🥽', label: 'VR', description: 'VR/XR development focus (21 panels)' },
  iot: { icon: '📡', label: 'IoT', description: 'IoT/Digital Twin focus (17 panels)' },
  film: { icon: '🎬', label: 'Film', description: 'Film/Cinematic focus (19 panels)' },
  science: { icon: '🔬', label: 'Science', description: 'Science/Medical focus (16 panels)' },
  robotics: { icon: '🦾', label: 'Robotics', description: 'Robotics/Automation focus (18 panels)' },
  creator: { icon: '🎭', label: 'Creator', description: 'Creator Economy focus (18 panels)' },
  hologram: {
    icon: '🔮',
    label: 'Hologram',
    description: '2D-to-3D holographic media (16 panels)',
  },
};

function loadFavorites(): Set<PanelTab> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveFavorites(favs: Set<PanelTab>) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favs]));
  } catch (err) { logger.warn('[useDomainFilter] saving favorites to localStorage failed:', err); }
}

export interface UseDomainFilterReturn {
  domain: DomainProfile;
  domains: typeof DOMAIN_INFO;
  setDomain: (d: DomainProfile) => void;
  isVisible: (tab: PanelTab) => boolean;
  visibleCount: number;
  favorites: Set<PanelTab>;
  toggleFavorite: (tab: PanelTab) => void;
  isFavorite: (tab: PanelTab) => boolean;
  search: string;
  setSearch: (s: string) => void;
  matchesSearch: (label: string, title: string) => boolean;
}

function loadDomainProfile(): DomainProfile {
  // Default for a first-time user: 'creator' (18 panels) instead of 'all' (46 panels).
  // WHY: landing on /create with 46 tabs is overwhelming; narrower presets keep the surface
  //      calm until the user explicitly picks 'All' or runs the preset wizard.
  const DEFAULT_PROFILE: DomainProfile = 'creator';
  try {
    if (typeof window === 'undefined') return DEFAULT_PROFILE;
    const saved = localStorage.getItem('holoscript-domain-profile') as DomainProfile | null;
    if (
      saved &&
      ['all', 'game', 'vr', 'iot', 'film', 'science', 'robotics', 'creator', 'hologram'].includes(
        saved
      )
    )
      return saved;
  } catch (err) { logger.warn('[useDomainFilter] loading domain profile from localStorage failed:', err); }
  return DEFAULT_PROFILE;
}

export function useDomainFilter(): UseDomainFilterReturn {
  const [domain, setDomain] = useState<DomainProfile>(loadDomainProfile);
  const [favorites, setFavorites] = useState<Set<PanelTab>>(loadFavorites);
  const [search, setSearch] = useState('');

  const domainTabs = DOMAIN_TABS[domain];

  const isVisible = useCallback(
    (tab: PanelTab) => {
      // Favorites always visible
      if (favorites.has(tab)) return true;
      return domainTabs.has(tab);
    },
    [domainTabs, favorites]
  );

  const visibleCount = useMemo(() => {
    let count = 0;
    for (const tab of DOMAIN_TABS.all) {
      if (isVisible(tab)) count++;
    }
    return count;
  }, [isVisible]);

  const toggleFavorite = useCallback((tab: PanelTab) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab);
      else next.add(tab);
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((tab: PanelTab) => favorites.has(tab), [favorites]);

  const matchesSearch = useCallback(
    (label: string, title: string) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return label.toLowerCase().includes(q) || title.toLowerCase().includes(q);
    },
    [search]
  );

  return {
    domain,
    domains: DOMAIN_INFO,
    setDomain,
    isVisible,
    visibleCount,
    favorites,
    toggleFavorite,
    isFavorite,
    search,
    setSearch,
    matchesSearch,
  };
}
