/**
 * Scenario: Scene Templates — Catalogue & Data Integrity
 *
 * Tests for the scene template system:
 * - Template data structure validation
 * - Category coverage
 * - Code snippet integrity
 */

import { describe, it, expect } from 'vitest';

const { SCENE_TEMPLATES } = await import('@/data/sceneTemplates');
import type { SceneTemplate } from '@/data/sceneTemplates';

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Scenario: Scene Templates — Catalogue', () => {
  it('has at least 10 templates', () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('all templates have unique IDs', () => {
    const ids = SCENE_TEMPLATES.map((t: SceneTemplate) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all templates have required fields', () => {
    for (const t of SCENE_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.emoji).toBeTruthy();
      expect(t.desc).toBeTruthy();
      expect(t.tags.length).toBeGreaterThan(0);
      expect(t.code.length).toBeGreaterThan(10);
    }
  });

  it('all templates have valid categories', () => {
    const validCategories = ['game', 'social', 'art', 'tabletop', 'education', 'healthcare', 'ecommerce', 'industrial', 'sports'];
    for (const t of SCENE_TEMPLATES) {
      expect(validCategories).toContain(t.category);
    }
  });
});

describe('Scenario: Scene Templates — Category Coverage', () => {
  it('covers game category', () => {
    const games = SCENE_TEMPLATES.filter((t: SceneTemplate) => t.category === 'game');
    expect(games.length).toBeGreaterThanOrEqual(3);
  });

  it('covers social category', () => {
    const social = SCENE_TEMPLATES.filter((t: SceneTemplate) => t.category === 'social');
    expect(social.length).toBeGreaterThanOrEqual(1);
  });

  it('covers art category', () => {
    const art = SCENE_TEMPLATES.filter((t: SceneTemplate) => t.category === 'art');
    expect(art.length).toBeGreaterThanOrEqual(1);
  });

  it('covers at least 5 distinct categories', () => {
    const cats = new Set(SCENE_TEMPLATES.map((t: SceneTemplate) => t.category));
    expect(cats.size).toBeGreaterThanOrEqual(5);
  });
});

describe('Scenario: Scene Templates — Code Snippets', () => {
  it('all code contains a world block', () => {
    for (const t of SCENE_TEMPLATES) {
      expect(t.code).toMatch(/world\s+"/);
    }
  });

  it('game templates contain game_logic blocks', () => {
    const games = SCENE_TEMPLATES.filter((t: SceneTemplate) => t.category === 'game');
    for (const g of games) {
      expect(g.code).toContain('game_logic');
    }
  });

  it('templates use @position traits for placed objects', () => {
    let positionCount = 0;
    for (const t of SCENE_TEMPLATES) {
      if (t.code.includes('@position')) positionCount++;
    }
    expect(positionCount).toBeGreaterThan(0);
  });

  it('no template has empty code', () => {
    for (const t of SCENE_TEMPLATES) {
      expect(t.code.trim().length).toBeGreaterThan(0);
    }
  });
});
