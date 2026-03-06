import { describe, it, expect } from 'vitest';
import { SCENARIOS, type ScenarioEntry, type ScenarioCategory } from '../../components/scenarios/ScenarioGallery';

describe('ScenarioGallery data', () => {
  it('has 26 scenarios registered', () => {
    expect(SCENARIOS.length).toBe(26);
  });

  it('every scenario has a unique id', () => {
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every scenario has required fields', () => {
    for (const s of SCENARIOS) {
      expect(s.id).toBeTruthy();
      expect(s.name).toBeTruthy();
      expect(s.emoji).toBeTruthy();
      expect(s.category).toBeTruthy();
      expect(s.description).toBeTruthy();
      expect(s.engine).toBeTruthy();
      expect(s.tags.length).toBeGreaterThan(0);
      expect(s.testCount).toBeGreaterThan(0);
    }
  });

  it('every category is one of the known values', () => {
    const validCategories: ScenarioCategory[] = ['science', 'engineering', 'health', 'arts', 'nature', 'society'];
    for (const s of SCENARIOS) {
      expect(validCategories).toContain(s.category);
    }
  });

  it('each scenario has at least 1 tag and no more than 10', () => {
    for (const s of SCENARIOS) {
      expect(s.tags.length).toBeGreaterThanOrEqual(1);
      expect(s.tags.length).toBeLessThanOrEqual(10);
    }
  });

  it('total test count across all scenarios is > 400', () => {
    const total = SCENARIOS.reduce((sum, s) => sum + s.testCount, 0);
    expect(total).toBeGreaterThan(400);
  });

  it('categories are balanced (each has at least 2 scenarios)', () => {
    const counts: Record<string, number> = {};
    for (const s of SCENARIOS) {
      counts[s.category] = (counts[s.category] || 0) + 1;
    }
    for (const [cat, count] of Object.entries(counts)) {
      expect(count, `Category "${cat}" should have >= 2 scenarios`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('ScenarioCard accessibility', () => {
  it('every scenario has a non-empty description for screen readers', () => {
    for (const s of SCENARIOS) {
      expect(s.description.length).toBeGreaterThan(10);
    }
  });
});
