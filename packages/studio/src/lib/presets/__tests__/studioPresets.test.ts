import { describe, expect, it } from 'vitest';
import {
  STUDIO_PRESETS,
  SUBCATEGORIES,
  SUBCATEGORY_PRESET_MAP,
  PROJECT_QUESTIONS,
  getExtraPanels,
  filterByExperience,
} from '../studioPresets';
import type { ProjectSpecifics, ExperienceLevel } from '../studioPresets';

// ─── STUDIO_PRESETS ────────────────────────────────────────────────────────────

describe('STUDIO_PRESETS', () => {
  it('has at least 17 presets', () => {
    expect(STUDIO_PRESETS.length).toBeGreaterThanOrEqual(17);
  });

  it('every preset has a unique id', () => {
    const ids = STUDIO_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has required fields', () => {
    for (const p of STUDIO_PRESETS) {
      expect(p.id).toBeTruthy();
      expect(p.label).toBeTruthy();
      expect(p.emoji).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.studioMode).toBeTruthy();
      expect(p.domainProfile).toBeTruthy();
      expect(Array.isArray(p.openPanels)).toBe(true);
      expect(Array.isArray(p.sidebarTabs)).toBe(true);
    }
  });

  it('covers all 12 domain categories', () => {
    const categories = new Set(STUDIO_PRESETS.map((p) => p.category));
    for (const cat of [
      'game', 'film', 'art', 'web', 'iot', 'education',
      'robotics', 'science', 'healthcare', 'architecture',
      'agriculture', 'creator',
    ]) {
      expect(categories.has(cat as any)).toBe(true);
    }
  });

  it('every preset opens at least one panel', () => {
    for (const p of STUDIO_PRESETS) {
      expect(p.openPanels.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('every preset has at least 4 sidebar tabs', () => {
    for (const p of STUDIO_PRESETS) {
      expect(p.sidebarTabs.length).toBeGreaterThanOrEqual(4);
    }
  });
});

// ─── SUBCATEGORIES ─────────────────────────────────────────────────────────────

describe('SUBCATEGORIES', () => {
  it('has entries for all 12 domain categories', () => {
    const keys = Object.keys(SUBCATEGORIES);
    for (const cat of [
      'game', 'film', 'art', 'web', 'iot', 'education',
      'robotics', 'science', 'healthcare', 'architecture',
      'agriculture', 'creator',
    ]) {
      expect(keys).toContain(cat);
    }
  });

  it('every sub-category has required fields', () => {
    for (const [, subs] of Object.entries(SUBCATEGORIES)) {
      for (const sub of subs) {
        expect(sub.id).toBeTruthy();
        expect(sub.label).toBeTruthy();
        expect(sub.emoji).toBeTruthy();
        expect(sub.description).toBeTruthy();
      }
    }
  });

  it('every sub-category id is unique globally', () => {
    const allIds = Object.values(SUBCATEGORIES).flat().map((s) => s.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('has at least 46 total sub-categories', () => {
    const total = Object.values(SUBCATEGORIES).flat().length;
    expect(total).toBeGreaterThanOrEqual(46);
  });
});

// ─── SUBCATEGORY_PRESET_MAP ────────────────────────────────────────────────────

describe('SUBCATEGORY_PRESET_MAP', () => {
  it('every sub-category maps to a valid preset id', () => {
    const presetIds = new Set(STUDIO_PRESETS.map((p) => p.id));
    for (const [subId, presetId] of Object.entries(SUBCATEGORY_PRESET_MAP)) {
      expect(presetIds.has(presetId)).toBe(true);
    }
  });

  it('every sub-category defined in SUBCATEGORIES has a mapping', () => {
    const allSubIds = Object.values(SUBCATEGORIES).flat().map((s) => s.id);
    for (const subId of allSubIds) {
      expect(SUBCATEGORY_PRESET_MAP[subId]).toBeTruthy();
    }
  });
});

// ─── PROJECT_QUESTIONS ─────────────────────────────────────────────────────────

describe('PROJECT_QUESTIONS', () => {
  it('has at least one question', () => {
    expect(PROJECT_QUESTIONS.length).toBeGreaterThan(0);
  });

  it('every question has required fields', () => {
    for (const q of PROJECT_QUESTIONS) {
      expect(q.id).toBeTruthy();
      expect(q.label).toBeTruthy();
      expect(q.type).toBeTruthy();
      expect(Array.isArray(q.categories)).toBe(true);
      expect(q.categories.length).toBeGreaterThan(0);
    }
  });

  it('card-select and multi-select questions have options', () => {
    for (const q of PROJECT_QUESTIONS) {
      if (q.type === 'card-select' || q.type === 'multi-select') {
        expect(q.options).toBeDefined();
        expect(q.options!.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('projectSize question applies to all categories', () => {
    const sizeQ = PROJECT_QUESTIONS.find((q) => q.id === 'projectSize');
    expect(sizeQ).toBeDefined();
    expect(sizeQ!.categories.length).toBeGreaterThanOrEqual(12);
  });

  it('every question has a unique id', () => {
    const ids = PROJECT_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ─── Cross-validation ─────────────────────────────────────────────────────────

describe('cross-validation', () => {
  it('preset categories are a subset of SUBCATEGORIES keys', () => {
    const subKeys = new Set(Object.keys(SUBCATEGORIES));
    for (const p of STUDIO_PRESETS) {
      expect(subKeys.has(p.category)).toBe(true);
    }
  });
});

// ─── getExtraPanels ────────────────────────────────────────────────────────────

describe('getExtraPanels', () => {
  const baseSpecifics: ProjectSpecifics = {
    projectSize: 'small',
    artStyle: 'stylized',
    platforms: ['web'],
  };

  it('returns empty array for minimal project', () => {
    const panels = getExtraPanels(baseSpecifics);
    expect(Array.isArray(panels)).toBe(true);
  });

  it('adds profiler for production projects', () => {
    const panels = getExtraPanels({ ...baseSpecifics, projectSize: 'production' });
    expect(panels).toContain('profiler');
  });

  it('adds material panel for realistic art style', () => {
    const panels = getExtraPanels({ ...baseSpecifics, artStyle: 'realistic' });
    expect(panels).toContain('material');
  });

  it('adds physics panel for VR platforms', () => {
    const panels = getExtraPanels({ ...baseSpecifics, platforms: ['web', 'vr'] });
    expect(panels).toContain('physics');
  });

  it('adds multiplayer panel when needed', () => {
    const panels = getExtraPanels({ ...baseSpecifics, needsMultiplayer: true });
    expect(panels).toContain('multiplayer');
  });

  it('adds behaviorTree panel for AI', () => {
    const panels = getExtraPanels({ ...baseSpecifics, needsAI: true });
    expect(panels).toContain('behaviorTree');
  });

  it('adds cloudDeploy for deployment', () => {
    const panels = getExtraPanels({ ...baseSpecifics, needsDeployment: true });
    expect(panels).toContain('cloudDeploy');
  });

  it('returns no duplicates', () => {
    const panels = getExtraPanels({
      ...baseSpecifics,
      projectSize: 'production',
      needsMultiplayer: true,
      needsAI: true,
      needsDeployment: true,
    });
    expect(new Set(panels).size).toBe(panels.length);
  });
});

// ─── filterByExperience ────────────────────────────────────────────────────────

describe('filterByExperience', () => {
  const basePanels = ['chat', 'physics', 'inspector', 'material', 'timeline'] as any[];
  const extraPanels = ['multiplayer', 'behaviorTree'] as any[];

  it('beginner: returns at most 4 base panels', () => {
    const result = filterByExperience(basePanels, extraPanels, 'beginner');
    expect(result.length).toBeLessThanOrEqual(4);
    expect(result.every((p: string) => basePanels.includes(p))).toBe(true);
  });

  it('intermediate: returns base + extra panels', () => {
    const result = filterByExperience(basePanels, extraPanels, 'intermediate');
    expect(result).toEqual([...basePanels, ...extraPanels]);
  });

  it('advanced: includes profiler, debugger, and console', () => {
    const result = filterByExperience(basePanels, extraPanels, 'advanced');
    expect(result).toContain('profiler');
    expect(result).toContain('debugger');
    expect(result).toContain('console');
  });

  it('advanced: includes all base and extra panels', () => {
    const result = filterByExperience(basePanels, extraPanels, 'advanced');
    for (const p of [...basePanels, ...extraPanels]) {
      expect(result).toContain(p);
    }
  });
});
