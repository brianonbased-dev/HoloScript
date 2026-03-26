import { describe, expect, it } from 'vitest';
import {
  WIZARD_TEMPLATES,
  getWizardTemplate,
  getAvailableTemplateIds,
  getAllWizardTemplates,
} from '../wizardTemplates';
import { SUBCATEGORIES, SUBCATEGORY_PRESET_MAP } from '../studioPresets';

// ─── WIZARD_TEMPLATES ──────────────────────────────────────────────────────────

describe('WIZARD_TEMPLATES', () => {
  it('has at least 46 templates', () => {
    expect(Object.keys(WIZARD_TEMPLATES).length).toBeGreaterThanOrEqual(46);
  });

  it('no template id collides with BASE_SCENE_TEMPLATES ids', () => {
    const wizardIds = Object.values(WIZARD_TEMPLATES).map((t) => t.id);
    // Wizard IDs should all start with 'wizard-'
    expect(wizardIds.every((id) => id.startsWith('wizard-'))).toBe(true);
  });

  it('every template has a unique id', () => {
    const ids = Object.values(WIZARD_TEMPLATES).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template has required fields', () => {
    for (const [key, t] of Object.entries(WIZARD_TEMPLATES)) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.thumbnail).toBeTruthy();
      expect(t.category).toBeTruthy();
      expect(Array.isArray(t.tags)).toBe(true);
      expect(t.tags.length).toBeGreaterThanOrEqual(1);
      expect(typeof t.code).toBe('string');
      expect(t.code.length).toBeGreaterThan(50);
    }
  });

  it('every template code starts with composition', () => {
    for (const [key, t] of Object.entries(WIZARD_TEMPLATES)) {
      expect(t.code.trimStart().startsWith('composition')).toBe(true);
    }
  });

  it('every template code contains at least one object', () => {
    for (const [key, t] of Object.entries(WIZARD_TEMPLATES)) {
      expect(t.code).toMatch(/object\s+"/);
    }
  });

  it('every template id starts with wizard-', () => {
    for (const t of Object.values(WIZARD_TEMPLATES)) {
      expect(t.id.startsWith('wizard-')).toBe(true);
    }
  });
});

// ─── getWizardTemplate ─────────────────────────────────────────────────────────

describe('getWizardTemplate', () => {
  it('returns template for valid sub-category', () => {
    const t = getWizardTemplate('vr-game');
    expect(t).not.toBeNull();
    expect(t!.id).toBe('wizard-vr-game');
  });

  it('returns null for unknown sub-category', () => {
    expect(getWizardTemplate('nonexistent')).toBeNull();
  });

  it('returns template for every SUBCATEGORIES entry', () => {
    const allSubIds = Object.values(SUBCATEGORIES).flat().map((s) => s.id);
    for (const subId of allSubIds) {
      const t = getWizardTemplate(subId);
      expect(t).not.toBeNull();
    }
  });
});

// ─── getAvailableTemplateIds ───────────────────────────────────────────────────

describe('getAvailableTemplateIds', () => {
  it('returns an array of strings', () => {
    const ids = getAvailableTemplateIds();
    expect(Array.isArray(ids)).toBe(true);
    expect(ids.every((id) => typeof id === 'string')).toBe(true);
  });

  it('matches WIZARD_TEMPLATES keys', () => {
    const ids = getAvailableTemplateIds();
    const keys = Object.keys(WIZARD_TEMPLATES);
    expect(ids.sort()).toEqual(keys.sort());
  });
});

// ─── getAllWizardTemplates ──────────────────────────────────────────────────────

describe('getAllWizardTemplates', () => {
  it('returns flat array of all templates', () => {
    const all = getAllWizardTemplates();
    expect(Array.isArray(all)).toBe(true);
    expect(all.length).toBe(Object.keys(WIZARD_TEMPLATES).length);
  });

  it('every item conforms to SceneTemplate interface', () => {
    const all = getAllWizardTemplates();
    for (const t of all) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('name');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('thumbnail');
      expect(t).toHaveProperty('tags');
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('code');
    }
  });
});

// ─── Cross-referencing ─────────────────────────────────────────────────────────

describe('cross-references', () => {
  it('every SUBCATEGORY_PRESET_MAP key has a wizard template', () => {
    for (const subId of Object.keys(SUBCATEGORY_PRESET_MAP)) {
      const t = getWizardTemplate(subId);
      expect(t).not.toBeNull();
    }
  });

  it('wizard template categories match known categories', () => {
    const validCategories = new Set([
      'game', 'film', 'art', 'web', 'iot', 'education',
      'robotics', 'science', 'healthcare', 'architecture',
      'agriculture', 'creator', 'hologram',
    ]);
    for (const t of getAllWizardTemplates()) {
      expect(validCategories.has(t.category)).toBe(true);
    }
  });
});
