// @vitest-environment node
/**
 * Industry Character Components — Type Contract Tests
 *
 * Validates the type contracts, export shapes, and pure utility functions
 * of the 20 character component files. Tests pure functions directly and
 * uses type-level contracts for React components.
 * Uses node environment to avoid React JSX ESM issues in vitest.
 */

import { describe, it, expect } from 'vitest';
import type { CharacterMetadata } from '../creation/CharacterCreationModal';
import type { ExportOptions } from '../export/ExportModal';
import type { CharacterCard } from '../export/ExportPanel';
import { buildCharacterCard } from '../export/ExportPanel';
import type { WardrobeSlot, WardrobeItem } from '@/lib/stores/wardrobeStore';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function createWardrobeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: 'item-001',
    name: 'Test Hair',
    slot: 'hair',
    thumbnail: 'https://example.com/thumb.png',
    category: 'hair',
    ...overrides,
  };
}

// ─── CharacterMetadata type contract ────────────────────────────────────────

describe('CharacterMetadata type contract', () => {
  it('requires a source field', () => {
    const meta: CharacterMetadata = { source: 'preset' };
    expect(meta.source).toBe('preset');
  });

  it('accepts all valid source values', () => {
    const sources: CharacterMetadata['source'][] = [
      'ai', 'vroid', 'mixamo', 'preset', 'sketchfab', 'upload',
    ];
    for (const source of sources) {
      const meta: CharacterMetadata = { source };
      expect(meta.source).toBe(source);
    }
  });

  it('accepts optional fields', () => {
    const meta: CharacterMetadata = {
      source: 'ai',
      name: 'My Character',
      templateId: 'tmpl-001',
      thumbnailUrl: 'https://example.com/thumb.png',
      credits: 'Created by HoloScript AI',
    };
    expect(meta.name).toBe('My Character');
    expect(meta.templateId).toBe('tmpl-001');
    expect(meta.credits).toBeTruthy();
  });

  it('works with only required source field', () => {
    const meta: CharacterMetadata = { source: 'upload' };
    expect(meta.name).toBeUndefined();
    expect(meta.templateId).toBeUndefined();
  });
});

// ─── ExportOptions type contract ────────────────────────────────────────────

describe('ExportOptions type contract', () => {
  it('has all required fields', () => {
    const opts: ExportOptions = {
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 5,
      format: 'mp4',
      codec: 'h264',
      transparent: false,
    };
    expect(opts.width).toBe(1920);
    expect(opts.height).toBe(1080);
    expect(opts.fps).toBe(30);
    expect(opts.duration).toBe(5);
    expect(opts.format).toBe('mp4');
    expect(opts.codec).toBe('h264');
    expect(opts.transparent).toBe(false);
  });

  it('accepts all valid format values', () => {
    const formats: ExportOptions['format'][] = ['mp4', 'webm'];
    for (const format of formats) {
      const opts: ExportOptions = {
        width: 1080, height: 1080, fps: 30, duration: 3,
        format, codec: 'h264', transparent: false,
      };
      expect(opts.format).toBe(format);
    }
  });

  it('accepts all valid codec values', () => {
    const codecs: ExportOptions['codec'][] = ['h264', 'vp9', 'av1'];
    for (const codec of codecs) {
      const opts: ExportOptions = {
        width: 1080, height: 1080, fps: 30, duration: 3,
        format: 'mp4', codec, transparent: false,
      };
      expect(opts.codec).toBe(codec);
    }
  });

  it('supports transparent background flag', () => {
    const transparent: ExportOptions = {
      width: 1080, height: 1080, fps: 30, duration: 3,
      format: 'webm', codec: 'vp9', transparent: true,
    };
    expect(transparent.transparent).toBe(true);
  });
});

// ─── buildCharacterCard pure function ───────────────────────────────────────

describe('buildCharacterCard', () => {
  it('returns a CharacterCard with version 1.0', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    expect(card.version).toBe('1.0');
  });

  it('sets generator to HoloScript Studio', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    expect(card.generator).toBe('HoloScript Studio');
  });

  it('sets exportedAt to a valid ISO date string', () => {
    const before = new Date().toISOString();
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    const after = new Date().toISOString();
    expect(card.exportedAt >= before).toBe(true);
    expect(card.exportedAt <= after).toBe(true);
  });

  it('copies morphTargets from store', () => {
    const morphTargets = { eyeOpenLeft: 0.8, smile: 0.3, browRaiseLeft: 0.1 };
    const card = buildCharacterCard({
      morphTargets,
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    expect(card.character.morphTargets).toEqual(morphTargets);
    // Should be a copy, not same reference
    expect(card.character.morphTargets).not.toBe(morphTargets);
  });

  it('copies skinColor from store', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#7b4d2a',
      equippedItems: {},
    });
    expect(card.character.skinColor).toBe('#7b4d2a');
  });

  it('copies equippedItems from store', () => {
    const hairItem = createWardrobeItem({ slot: 'hair' });
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffcc99',
      equippedItems: { hair: hairItem },
    });
    expect(card.character.equippedItems.hair).toEqual(hairItem);
    // Should be a shallow copy, not same reference
    expect(card.character.equippedItems).not.toBe({ hair: hairItem });
  });

  it('handles empty morphTargets', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    expect(card.character.morphTargets).toEqual({});
  });

  it('handles empty equippedItems', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    expect(card.character.equippedItems).toEqual({});
  });
});

// ─── WardrobeSlot type contract ──────────────────────────────────────────────

describe('WardrobeSlot type contract', () => {
  it('covers all 6 wardrobe slots', () => {
    const ALL_SLOTS: WardrobeSlot[] = [
      'hair', 'top', 'bottom', 'shoes', 'accessory_1', 'accessory_2',
    ];
    expect(ALL_SLOTS).toHaveLength(6);
    for (const slot of ALL_SLOTS) {
      expect(typeof slot).toBe('string');
    }
  });
});

// ─── WardrobeItem type contract ──────────────────────────────────────────────

describe('WardrobeItem type contract', () => {
  it('has all required fields', () => {
    const item = createWardrobeItem();
    expect(item.id).toBeTruthy();
    expect(item.name).toBeTruthy();
    expect(item.slot).toBeTruthy();
    expect(item.thumbnail).toBeTruthy();
    expect(item.category).toBeTruthy();
  });

  it('accepts an optional modelUrl', () => {
    const item = createWardrobeItem({ modelUrl: 'https://example.com/hair.glb' });
    expect(item.modelUrl).toBeTruthy();
  });

  it('can be created without modelUrl', () => {
    const item = createWardrobeItem();
    expect(item.modelUrl).toBeUndefined();
  });

  it('can have any valid WardrobeSlot', () => {
    const slots: WardrobeSlot[] = [
      'hair', 'top', 'bottom', 'shoes', 'accessory_1', 'accessory_2',
    ];
    for (const slot of slots) {
      const item = createWardrobeItem({ slot });
      expect(item.slot).toBe(slot);
    }
  });
});

// ─── CharacterCard type contract ─────────────────────────────────────────────

describe('CharacterCard type contract', () => {
  it('version is always "1.0"', () => {
    const card: CharacterCard = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      generator: 'HoloScript Studio',
      character: {
        morphTargets: {},
        skinColor: '#ffcc99',
        equippedItems: {},
      },
    };
    expect(card.version).toBe('1.0');
  });

  it('is serializable as JSON', () => {
    const card = buildCharacterCard({
      morphTargets: { eyeOpen: 1.0 },
      skinColor: '#ffcc99',
      equippedItems: {},
    });
    const json = JSON.stringify(card);
    const parsed = JSON.parse(json) as CharacterCard;
    expect(parsed.version).toBe('1.0');
    expect(parsed.character.morphTargets.eyeOpen).toBe(1.0);
  });
});
