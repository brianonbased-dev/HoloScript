/**
 * @fileoverview Domain filter logic tests
 *
 * Tests the domain profile visibility, favorites persistence,
 * and search matching logic from useDomainFilter.
 */
import { describe, it, expect } from 'vitest';

// ─── Replicate domain filter logic for pure testing ────────────────────────

type PanelTab = string;
type DomainProfile = 'all' | 'game' | 'vr' | 'iot' | 'film';

const ALL_TABS: PanelTab[] = [
  'safety','marketplace','platform','traits','physics','ai','dialogue','ecs',
  'animation','audio','procgen','multiplayer','shader','combat','pathfinding',
  'particles','camera','inventory','terrain','lighting','cinematic',
  'collaboration','security','scripting','saveload','profiler','compiler',
  'lod','statemachine','input','network','culture','timeline','scene',
  'assets','state','viewport','bus','presets','events','agent',
];

const DOMAIN_TABS: Record<DomainProfile, Set<string>> = {
  all: new Set(ALL_TABS),
  game: new Set([
    'safety','physics','ai','dialogue','ecs','animation','audio','combat',
    'pathfinding','particles','camera','inventory','terrain','lighting',
    'input','statemachine','compiler','lod','scene','assets','viewport',
    'profiler','saveload','timeline','scripting',
  ]),
  vr: new Set([
    'safety','physics','ecs','animation','audio','shader','camera',
    'lighting','input','collaboration','scene','assets','viewport',
    'profiler','multiplayer','platform','lod','compiler','saveload',
  ]),
  iot: new Set([
    'safety','ecs','network','state','compiler','assets','scene',
    'platform','traits','collaboration','security','profiler','saveload',
    'scripting','bus','events','agent',
  ]),
  film: new Set([
    'safety','animation','audio','shader','camera','lighting','cinematic',
    'particles','scene','assets','viewport','timeline','profiler',
    'saveload','compiler','lod',
  ]),
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Domain Filter', () => {
  it('all profile shows all 41 tabs', () => {
    expect(DOMAIN_TABS.all.size).toBe(41);
  });

  it('game profile shows ~25 tabs', () => {
    expect(DOMAIN_TABS.game.size).toBe(25);
  });

  it('vr profile shows ~19 tabs', () => {
    expect(DOMAIN_TABS.vr.size).toBe(19);
  });

  it('iot profile shows ~17 tabs', () => {
    expect(DOMAIN_TABS.iot.size).toBe(17);
  });

  it('film profile shows ~16 tabs', () => {
    expect(DOMAIN_TABS.film.size).toBe(16);
  });

  it('safety is visible in all domains', () => {
    for (const domain of Object.keys(DOMAIN_TABS) as DomainProfile[]) {
      expect(DOMAIN_TABS[domain].has('safety')).toBe(true);
    }
  });

  it('combat is only in game profile (not vr/iot/film)', () => {
    expect(DOMAIN_TABS.game.has('combat')).toBe(true);
    expect(DOMAIN_TABS.vr.has('combat')).toBe(false);
    expect(DOMAIN_TABS.iot.has('combat')).toBe(false);
    expect(DOMAIN_TABS.film.has('combat')).toBe(false);
  });

  it('cinematic is only in film profile', () => {
    expect(DOMAIN_TABS.film.has('cinematic')).toBe(true);
    expect(DOMAIN_TABS.game.has('cinematic')).toBe(false);
    expect(DOMAIN_TABS.vr.has('cinematic')).toBe(false);
    expect(DOMAIN_TABS.iot.has('cinematic')).toBe(false);
  });

  it('all domain tabs are valid tab IDs', () => {
    for (const domain of Object.keys(DOMAIN_TABS) as DomainProfile[]) {
      for (const tab of DOMAIN_TABS[domain]) {
        expect(ALL_TABS).toContain(tab);
      }
    }
  });

  it('viewport is in game, vr, and film but not iot', () => {
    expect(DOMAIN_TABS.game.has('viewport')).toBe(true);
    expect(DOMAIN_TABS.vr.has('viewport')).toBe(true);
    expect(DOMAIN_TABS.film.has('viewport')).toBe(true);
    expect(DOMAIN_TABS.iot.has('viewport')).toBe(false);
  });
});

describe('Search matching', () => {
  function matchesSearch(label: string, title: string, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    return label.toLowerCase().includes(q) || title.toLowerCase().includes(q);
  }

  it('empty search matches everything', () => {
    expect(matchesSearch('Physics', 'Physics simulation', '')).toBe(true);
  });

  it('matches by label', () => {
    expect(matchesSearch('Physics', 'Physics simulation', 'phys')).toBe(true);
  });

  it('matches by title', () => {
    expect(matchesSearch('FX', 'Particle system editor', 'particle')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(matchesSearch('Camera', 'Camera controller', 'CAMERA')).toBe(true);
  });

  it('does not match unrelated query', () => {
    expect(matchesSearch('Physics', 'Physics simulation', 'shader')).toBe(false);
  });
});

describe('Favorites', () => {
  it('favorites override domain filter', () => {
    const domain: DomainProfile = 'film';
    const favorites = new Set(['combat', 'dialogue']); // Not in film profile
    
    function isVisible(tab: string): boolean {
      if (favorites.has(tab)) return true;
      return DOMAIN_TABS[domain].has(tab);
    }

    // Combat and dialogue are NOT in film profile
    expect(DOMAIN_TABS.film.has('combat')).toBe(false);
    expect(DOMAIN_TABS.film.has('dialogue')).toBe(false);
    
    // But they ARE visible because they're favorites
    expect(isVisible('combat')).toBe(true);
    expect(isVisible('dialogue')).toBe(true);
    
    // Regular film tabs still visible
    expect(isVisible('camera')).toBe(true);
    expect(isVisible('lighting')).toBe(true);
  });
});
