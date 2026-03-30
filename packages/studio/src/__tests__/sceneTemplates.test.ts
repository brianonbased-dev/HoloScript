/**
 * sceneTemplates.test.ts
 *
 * Tests for both scene template collections:
 *  - src/data/sceneTemplates.ts  (game/social/art/tabletop — world-based HoloScript)
 *  - src/lib/sceneTemplates.ts   (composition-based templates + searchTemplates util)
 */

import { describe, it, expect } from 'vitest';
import { SCENE_TEMPLATES as DATA_TEMPLATES } from '@/data/sceneTemplates';
import { SCENE_TEMPLATES as LIB_TEMPLATES, searchTemplates } from '@/lib/sceneTemplates';

// ── data/sceneTemplates.ts ───────────────────────────────────────────────────

describe('data/SCENE_TEMPLATES — shape', () => {
  it('exports an array', () => {
    expect(Array.isArray(DATA_TEMPLATES)).toBe(true);
  });

  it('has at least 10 templates', () => {
    expect(DATA_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('every template has a unique id', () => {
    const ids = DATA_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has a non-empty name', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.name).toBeTruthy();
    }
  });

  it('every template has a non-empty emoji', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.emoji).toBeTruthy();
    }
  });

  it('every template has a category field', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.category).toBeTruthy();
    }
  });

  it('every template has a non-empty code string (>200 chars)', () => {
    for (const t of DATA_TEMPLATES) {
      expect(typeof t.code).toBe('string');
      expect(t.code.length).toBeGreaterThan(200);
    }
  });
});

describe('data/SCENE_TEMPLATES — categories', () => {
  const categories = DATA_TEMPLATES.map((t) => t.category);

  it('includes game templates', () => {
    expect(categories.some((c) => c === 'game')).toBe(true);
  });

  it('includes social templates', () => {
    expect(categories.some((c) => c === 'social')).toBe(true);
  });

  it('includes art templates', () => {
    expect(categories.some((c) => c === 'art')).toBe(true);
  });

  it('includes tabletop templates', () => {
    expect(categories.some((c) => c === 'tabletop')).toBe(true);
  });
});

describe('data/SCENE_TEMPLATES — game code quality', () => {
  const gameTemplates = DATA_TEMPLATES.filter((t) => t.category === 'game');

  it('at least 5 game templates exist', () => {
    expect(gameTemplates.length).toBeGreaterThanOrEqual(5);
  });

  it('game templates include game_logic block', () => {
    for (const t of gameTemplates) {
      expect(t.code).toContain('game_logic');
    }
  });

  it('game templates have spawn or win conditions', () => {
    for (const t of gameTemplates) {
      const hasSpawnOrWin =
        t.code.includes('@spawn') ||
        t.code.includes('@win_condition') ||
        t.code.includes('win_condition');
      expect(hasSpawnOrWin).toBe(true);
    }
  });
});

describe('data/SCENE_TEMPLATES — known templates', () => {
  it('Battle Royale template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'battle-royale')).toBeDefined();
  });

  it('Murder Mystery template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'murder-mystery')).toBeDefined();
  });

  it('Coffee Shop template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'coffee-shop')).toBeDefined();
  });

  it('D&D Dungeon template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'dnd-dungeon')).toBeDefined();
  });

  it('Zombie Survival template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'zombie-survival')).toBeDefined();
  });

  it('Team Deathmatch template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'team-deathmatch')).toBeDefined();
  });

  it('Escape Room template exists', () => {
    expect(DATA_TEMPLATES.find((t) => t.id === 'escape-room')).toBeDefined();
  });
});

describe('data/SCENE_TEMPLATES — HoloScript syntax', () => {
  it('all templates include at least one @-trait', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.code).toMatch(/@\w+/);
    }
  });

  it('all templates open with world or scene declaration', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.code.trim()).toMatch(/^(?:world|scene)\s+"/);
    }
  });

  it('no template has TODO or placeholder text', () => {
    for (const t of DATA_TEMPLATES) {
      expect(t.code).not.toMatch(/TODO|FIXME|lorem ipsum/i);
    }
  });
});

// ── lib/sceneTemplates.ts ────────────────────────────────────────────────────

describe('lib/SCENE_TEMPLATES — shape', () => {
  it('exports an array', () => {
    expect(Array.isArray(LIB_TEMPLATES)).toBe(true);
  });

  it('has at least 7 composition templates', () => {
    expect(LIB_TEMPLATES.length).toBeGreaterThanOrEqual(7);
  });

  it('every template has a unique id', () => {
    const ids = LIB_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has name, description, thumbnail', () => {
    for (const t of LIB_TEMPLATES) {
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.thumbnail).toBeTruthy();
    }
  });

  it('every template has a non-empty tags array', () => {
    for (const t of LIB_TEMPLATES) {
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags.length).toBeGreaterThan(0);
    }
  });

  it('every template has a code string (>100 chars)', () => {
    for (const t of LIB_TEMPLATES) {
      expect(t.code.length).toBeGreaterThan(100);
    }
  });

  it('all codes start with composition declaration', () => {
    for (const t of LIB_TEMPLATES) {
      expect(t.code.trim()).toMatch(/^composition\s+"/);
    }
  });
});

describe('lib/SCENE_TEMPLATES — known templates', () => {
  it('blank canvas template exists', () => {
    expect(LIB_TEMPLATES.find((t) => t.id === 'blank')).toBeDefined();
  });

  it('solar system template exists', () => {
    expect(LIB_TEMPLATES.find((t) => t.id === 'solar-system')).toBeDefined();
  });

  it('VR gallery template exists', () => {
    expect(LIB_TEMPLATES.find((t) => t.id === 'gallery')).toBeDefined();
  });

  it('physics playground template exists', () => {
    expect(LIB_TEMPLATES.find((t) => t.id === 'physics')).toBeDefined();
  });

  it('meditation space template exists', () => {
    expect(LIB_TEMPLATES.find((t) => t.id === 'meditation')).toBeDefined();
  });
});

// ── searchTemplates ──────────────────────────────────────────────────────────

describe('searchTemplates', () => {
  it('returns all templates for empty query', () => {
    const results = searchTemplates('');
    expect(results).toEqual(LIB_TEMPLATES);
  });

  it('returns all templates for whitespace-only query', () => {
    const results = searchTemplates('   ');
    expect(results).toEqual(LIB_TEMPLATES);
  });

  it('finds "solar" template by name', () => {
    const results = searchTemplates('solar');
    expect(results.some((t) => t.id === 'solar-system')).toBe(true);
  });

  it('finds template by description keyword', () => {
    const results = searchTemplates('bouncing');
    expect(results.some((t) => t.id === 'physics')).toBe(true);
  });

  it('finds template by tag', () => {
    const results = searchTemplates('particles');
    expect(results.some((t) => t.id === 'meditation')).toBe(true);
  });

  it('is case-insensitive', () => {
    const results = searchTemplates('SOLAR');
    expect(results.some((t) => t.id === 'solar-system')).toBe(true);
  });

  it('returns empty array for no match', () => {
    const results = searchTemplates('xyznonexistent99999');
    expect(results).toHaveLength(0);
  });

  it('returns only matching templates for a specific query', () => {
    const results = searchTemplates('gallery');
    for (const t of results) {
      const matches =
        t.name.toLowerCase().includes('gallery') ||
        t.description.toLowerCase().includes('gallery') ||
        t.tags.some((tag) => tag.toLowerCase().includes('gallery'));
      expect(matches).toBe(true);
    }
  });
});
