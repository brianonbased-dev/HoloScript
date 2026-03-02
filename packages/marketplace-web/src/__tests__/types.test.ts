/**
 * Tests for Marketplace Web types constants
 *
 * Validates CATEGORY_COLORS, CATEGORY_LABELS, PLATFORM_LABELS,
 * SORT_OPTIONS data integrity.
 */

import { describe, it, expect } from 'vitest';
import {
  CATEGORY_COLORS,
  CATEGORY_LABELS,
  PLATFORM_LABELS,
  SORT_OPTIONS,
} from '../types';
import type { TraitCategory, Platform } from '../types';

const ALL_CATEGORIES: TraitCategory[] = [
  'rendering', 'physics', 'networking', 'audio', 'ui', 'ai', 'blockchain', 'utility'
];

const ALL_PLATFORMS: Platform[] = [
  'web', 'unity', 'unreal', 'godot', 'native', 'mobile', 'vr', 'ar'
];

describe('CATEGORY_COLORS', () => {
  it('has a color for every category', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_COLORS[cat], `missing color for ${cat}`).toBeTruthy();
    }
  });

  it('all colors are valid hex', () => {
    for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
      expect(color, `${cat} color not hex`).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('no duplicate colors', () => {
    const colors = Object.values(CATEGORY_COLORS);
    expect(new Set(colors).size).toBe(colors.length);
  });
});

describe('CATEGORY_LABELS', () => {
  it('has a label for every category', () => {
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_LABELS[cat], `missing label for ${cat}`).toBeTruthy();
    }
  });

  it('labels are capitalized', () => {
    for (const label of Object.values(CATEGORY_LABELS)) {
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });
});

describe('PLATFORM_LABELS', () => {
  it('has a label for every platform', () => {
    for (const p of ALL_PLATFORMS) {
      expect(PLATFORM_LABELS[p], `missing label for ${p}`).toBeTruthy();
    }
  });
});

describe('SORT_OPTIONS', () => {
  it('has at least 4 options', () => {
    expect(SORT_OPTIONS.length).toBeGreaterThanOrEqual(4);
  });

  it('all options have value and label', () => {
    for (const opt of SORT_OPTIONS) {
      expect(opt.value).toBeTruthy();
      expect(opt.label).toBeTruthy();
    }
  });

  it('includes relevance and downloads', () => {
    const values = SORT_OPTIONS.map(o => o.value);
    expect(values).toContain('relevance');
    expect(values).toContain('downloads');
  });
});
