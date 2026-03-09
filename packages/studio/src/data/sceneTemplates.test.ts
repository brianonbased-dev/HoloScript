/**
 * Tests for Studio Scene Templates Data
 *
 * Validates structural integrity of all scene templates:
 * - Required fields present
 * - Valid categories
 * - Unique IDs
 * - Non-empty code
 * - HoloScript syntax patterns
 */

import { describe, it, expect } from 'vitest';
import { SCENE_TEMPLATES, type SceneTemplate } from './sceneTemplates';

const VALID_CATEGORIES = [
  'game',
  'social',
  'art',
  'tabletop',
  'education',
  'healthcare',
  'ecommerce',
  'industrial',
  'sports',
];

describe('SCENE_TEMPLATES', () => {
  it('is a non-empty array', () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('all templates have required fields', () => {
    for (const tmpl of SCENE_TEMPLATES) {
      expect(tmpl.id, `${tmpl.name} missing id`).toBeTruthy();
      expect(tmpl.name, `${tmpl.id} missing name`).toBeTruthy();
      expect(tmpl.emoji, `${tmpl.id} missing emoji`).toBeTruthy();
      expect(tmpl.category, `${tmpl.id} missing category`).toBeTruthy();
      expect(tmpl.desc, `${tmpl.id} missing desc`).toBeTruthy();
      expect(tmpl.code, `${tmpl.id} missing code`).toBeTruthy();
    }
  });

  it('all templates have valid categories', () => {
    for (const tmpl of SCENE_TEMPLATES) {
      expect(VALID_CATEGORIES, `${tmpl.id} has invalid category '${tmpl.category}'`).toContain(
        tmpl.category
      );
    }
  });

  it('all template IDs are unique', () => {
    const ids = SCENE_TEMPLATES.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('all templates have non-empty tags', () => {
    for (const tmpl of SCENE_TEMPLATES) {
      expect(tmpl.tags.length, `${tmpl.id} has no tags`).toBeGreaterThan(0);
    }
  });

  it('all template code contains world declaration', () => {
    for (const tmpl of SCENE_TEMPLATES) {
      expect(tmpl.code, `${tmpl.id} code missing 'world' declaration`).toMatch(/world\s+"/);
    }
  });

  it('has at least one template per major category', () => {
    const categories = new Set(SCENE_TEMPLATES.map((t) => t.category));
    expect(categories.has('game')).toBe(true);
    expect(categories.has('social')).toBe(true);
    expect(categories.has('art')).toBe(true);
  });

  it('has at least 15 templates', () => {
    expect(SCENE_TEMPLATES.length).toBeGreaterThanOrEqual(15);
  });
});
