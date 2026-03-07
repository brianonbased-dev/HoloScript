'use client';
/**
 * useDomainFilter — Domain-aware panel visibility filter
 *
 * Defines 5 domain profiles (All, Game, VR, IoT, Film) that show/hide
 * panels based on relevance. Also manages favorites and search.
 */
import { useState, useCallback, useMemo } from 'react';
import type { PanelTab } from '../components/panels/RightPanelSidebar';

export type DomainProfile = 'all' | 'game' | 'vr' | 'iot' | 'film';

const STORAGE_KEY = 'holoscript-studio-favorites';

/** Which tabs are relevant for each domain */
const DOMAIN_TABS: Record<DomainProfile, Set<PanelTab>> = {
  all: new Set<PanelTab>([
    'safety','marketplace','platform','traits','physics','ai','dialogue','ecs',
    'animation','audio','procgen','multiplayer','shader','combat','pathfinding',
    'particles','camera','inventory','terrain','lighting','cinematic',
    'collaboration','security','scripting','saveload','profiler','compiler',
    'lod','statemachine','input','network','culture','timeline','scene',
    'assets','state','viewport','bus','presets','events','agent',
  ]),
  game: new Set<PanelTab>([
    'safety','physics','ai','dialogue','ecs','animation','audio','combat',
    'pathfinding','particles','camera','inventory','terrain','lighting',
    'input','statemachine','compiler','lod','scene','assets','viewport',
    'profiler','saveload','timeline','scripting',
  ]),
  vr: new Set<PanelTab>([
    'safety','physics','ecs','animation','audio','shader','camera',
    'lighting','input','collaboration','scene','assets','viewport',
    'profiler','multiplayer','platform','lod','compiler','saveload',
  ]),
  iot: new Set<PanelTab>([
    'safety','ecs','network','state','compiler','assets','scene',
    'platform','traits','collaboration','security','profiler','saveload',
    'scripting','bus','events','agent',
  ]),
  film: new Set<PanelTab>([
    'safety','animation','audio','shader','camera','lighting','cinematic',
    'particles','scene','assets','viewport','timeline','profiler',
    'saveload','compiler','lod',
  ]),
};

const DOMAIN_INFO: Record<DomainProfile, { icon: string; label: string; description: string }> = {
  all:  { icon: '🌐', label: 'All',  description: 'Show all 41 panels' },
  game: { icon: '🎮', label: 'Game', description: 'Game development focus (~25 panels)' },
  vr:   { icon: '🥽', label: 'VR',   description: 'VR/XR development focus (~19 panels)' },
  iot:  { icon: '📡', label: 'IoT',  description: 'IoT/Digital Twin focus (~17 panels)' },
  film: { icon: '🎬', label: 'Film', description: 'Film/Cinematic focus (~16 panels)' },
};

function loadFavorites(): Set<PanelTab> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function saveFavorites(favs: Set<PanelTab>) {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favs]));
  } catch {}
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

export function useDomainFilter(): UseDomainFilterReturn {
  const [domain, setDomain] = useState<DomainProfile>('all');
  const [favorites, setFavorites] = useState<Set<PanelTab>>(loadFavorites);
  const [search, setSearch] = useState('');

  const domainTabs = DOMAIN_TABS[domain];

  const isVisible = useCallback((tab: PanelTab) => {
    // Favorites always visible
    if (favorites.has(tab)) return true;
    return domainTabs.has(tab);
  }, [domainTabs, favorites]);

  const visibleCount = useMemo(() => {
    let count = 0;
    for (const tab of DOMAIN_TABS.all) {
      if (isVisible(tab)) count++;
    }
    return count;
  }, [isVisible]);

  const toggleFavorite = useCallback((tab: PanelTab) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(tab)) next.delete(tab); else next.add(tab);
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback((tab: PanelTab) => favorites.has(tab), [favorites]);

  const matchesSearch = useCallback((label: string, title: string) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return label.toLowerCase().includes(q) || title.toLowerCase().includes(q);
  }, [search]);

  return {
    domain, domains: DOMAIN_INFO, setDomain, isVisible, visibleCount,
    favorites, toggleFavorite, isFavorite, search, setSearch, matchesSearch,
  };
}
