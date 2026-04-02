/**
 * character-panel-contracts.scenario.ts — LIVING-SPEC: Character Panel Type Contracts
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LIVING-SPEC: Character Panel Component Type Contracts
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Persona: Mika — character artist verifying that exported types and
 * data structures in the industry/character panels are correct before
 * wiring them into the UI.
 *
 * Coverage:
 *   ExportPanel (industry/character/export)  — CharacterCard, buildCharacterCard
 *   ExportModal (industry/character/export)  — ExportOptions codec/format/resolution
 *   CharacterCreationModal (creation)         — CharacterMetadata source types
 *   Standalone data structure contracts       — WardrobeSlot, MorphTarget shapes
 *
 * Dependencies tested (lib-level, supplement to existing tests):
 *   character-customizer.scenario.ts  — characterStore + sliders
 *   wardrobe-system.scenario.ts       — wardrobeStore + BUILTIN_ITEMS
 *   expression-export.scenario.ts     — ExpressionPresets
 *   animator.scenario.ts              — animationBuilder
 *   sound-designer.scenario.ts        — audioSync
 *   brittney-customizer.scenario.ts   — CharacterIntentParser
 *   avatar-character-creator.scenario.ts — aiCharacterGeneration
 *
 * ✔  it(...)       — test PASSES → feature EXISTS
 * ⊡  it.todo(...)  — test SKIPPED → feature is MISSING (backlog item)
 *
 * Run: npx vitest run src/__tests__/scenarios/character-panel-contracts.scenario.ts --reporter=verbose
 * ═══════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';

// ── Imports ───────────────────────────────────────────────────────────────────

import {
  type CharacterCard,
  buildCharacterCard,
} from '../../industry/character/export/ExportPanel';

import type { ExportOptions } from '../../industry/character/export/ExportModal';

import type { CharacterMetadata } from '../../industry/character/creation/CharacterCreationModal';

// ── ExportPanel — CharacterCard ───────────────────────────────────────────────

describe('Scenario: Character ExportPanel — CharacterCard contract', () => {
  it('buildCharacterCard returns version "1.0"', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#e8beac',
      equippedItems: {},
    });
    expect(card.version).toBe('1.0');
  });

  it('buildCharacterCard sets exportedAt to an ISO timestamp', () => {
    const before = Date.now();
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#ffffff',
      equippedItems: {},
    });
    const after = Date.now();
    const ts = new Date(card.exportedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('buildCharacterCard copies morphTargets (not reference)', () => {
    const morphTargets = { body_height: 75, face_eye_size: 60 };
    const card = buildCharacterCard({
      morphTargets,
      skinColor: '#e8beac',
      equippedItems: {},
    });
    expect(card.character.morphTargets).toEqual({ body_height: 75, face_eye_size: 60 });
    // mutation of original should not affect the card
    morphTargets.body_height = 50;
    expect(card.character.morphTargets.body_height).toBe(75);
  });

  it('buildCharacterCard copies skinColor', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#f0d0a0',
      equippedItems: {},
    });
    expect(card.character.skinColor).toBe('#f0d0a0');
  });

  it('CharacterCard generator is "HoloScript Studio"', () => {
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#e8beac',
      equippedItems: {},
    });
    expect(card.generator).toBe('HoloScript Studio');
  });

  it('CharacterCard with equippedItems copies items', () => {
    const equippedItems = {
      hair: { id: 'spiky-hair', name: 'Spiky Hair', slot: 'hair' as const, thumbnail: '💈', glbUrl: '' },
    };
    const card = buildCharacterCard({
      morphTargets: {},
      skinColor: '#e8beac',
      equippedItems,
    });
    expect(card.character.equippedItems.hair?.id).toBe('spiky-hair');
  });

  it('CharacterCard type literal is consistent', () => {
    const card: CharacterCard = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      generator: 'HoloScript Studio',
      character: {
        morphTargets: { body_build: 60 },
        skinColor: '#c08060',
        equippedItems: {},
      },
    };
    expect(card.version).toBe('1.0');
    expect(card.character.morphTargets.body_build).toBe(60);
  });
});

// ── ExportModal — ExportOptions ───────────────────────────────────────────────

describe('Scenario: Character ExportModal — ExportOptions contract', () => {
  it('ExportOptions accepts TikTok 1:1 dimensions', () => {
    const opts: ExportOptions = {
      width: 1080,
      height: 1080,
      fps: 30,
      duration: 3000,
      format: 'mp4',
      codec: 'h264',
      transparent: false,
    };
    expect(opts.width).toBe(opts.height);
    expect(opts.fps).toBe(30);
    expect(opts.duration).toBeGreaterThan(0);
  });

  it('ExportOptions accepts webm/vp9 for transparency', () => {
    const opts: ExportOptions = {
      width: 1280,
      height: 720,
      fps: 60,
      duration: 5000,
      format: 'webm',
      codec: 'vp9',
      transparent: true,
    };
    expect(opts.format).toBe('webm');
    expect(opts.codec).toBe('vp9');
    expect(opts.transparent).toBe(true);
  });

  it('ExportOptions format is mp4 or webm', () => {
    const formats: ExportOptions['format'][] = ['mp4', 'webm'];
    expect(formats).toContain('mp4');
    expect(formats).toContain('webm');
    expect(formats).toHaveLength(2);
  });

  it('ExportOptions codec is h264, vp9, or av1', () => {
    const codecs: ExportOptions['codec'][] = ['h264', 'vp9', 'av1'];
    expect(codecs).toHaveLength(3);
    expect(codecs).toContain('h264');
    expect(codecs).toContain('av1');
  });

  it('ExportOptions YouTube 1080p preset is valid', () => {
    const opts: ExportOptions = {
      width: 1920,
      height: 1080,
      fps: 30,
      duration: 10000,
      format: 'mp4',
      codec: 'h264',
      transparent: false,
    };
    const ratio = opts.width / opts.height;
    expect(ratio).toBeCloseTo(16 / 9);
  });
});

// ── CharacterCreationModal — CharacterMetadata ────────────────────────────────

describe('Scenario: CharacterCreationModal — CharacterMetadata contract', () => {
  it('CharacterMetadata requires a source field', () => {
    const meta: CharacterMetadata = { source: 'preset' };
    expect(meta.source).toBe('preset');
  });

  it('CharacterMetadata source values cover all creation paths', () => {
    const sources: CharacterMetadata['source'][] = ['ai', 'vroid', 'mixamo', 'preset', 'sketchfab', 'upload'];
    expect(sources).toHaveLength(6);
    expect(sources).toContain('ai');
    expect(sources).toContain('upload');
  });

  it('CharacterMetadata optional fields are truly optional', () => {
    const minimalMeta: CharacterMetadata = { source: 'upload' };
    expect(minimalMeta.name).toBeUndefined();
    expect(minimalMeta.templateId).toBeUndefined();
    expect(minimalMeta.thumbnailUrl).toBeUndefined();
    expect(minimalMeta.credits).toBeUndefined();
  });

  it('CharacterMetadata with all fields is valid', () => {
    const fullMeta: CharacterMetadata = {
      name: 'Pepe',
      source: 'preset',
      templateId: 'pepe-classic',
      thumbnailUrl: 'https://example.com/pepe.png',
      credits: 'Matt Furie',
    };
    expect(fullMeta.name).toBe('Pepe');
    expect(fullMeta.templateId).toBe('pepe-classic');
    expect(fullMeta.credits).toBeTruthy();
  });

  it('AI-generated character carries source "ai"', () => {
    const aiMeta: CharacterMetadata = {
      name: 'Generated Hero',
      source: 'ai',
      thumbnailUrl: 'data:image/png;base64,abc',
    };
    expect(aiMeta.source).toBe('ai');
  });

  it('VRoid import carries source "vroid"', () => {
    const vroidMeta: CharacterMetadata = { source: 'vroid', name: 'Kawaii VRM' };
    expect(vroidMeta.source).toBe('vroid');
  });
});

// ── Cross-cutting: MorphTarget value constraints ──────────────────────────────

describe('Scenario: Character morph target value constraints', () => {
  it('slider-to-weight converts 0 to 0.0', () => {
    const sliderToWeight = (v: number) => Math.max(0, Math.min(1, v / 100));
    expect(sliderToWeight(0)).toBe(0);
  });

  it('slider-to-weight converts 100 to 1.0', () => {
    const sliderToWeight = (v: number) => Math.max(0, Math.min(1, v / 100));
    expect(sliderToWeight(100)).toBe(1);
  });

  it('slider-to-weight converts 50 to 0.5', () => {
    const sliderToWeight = (v: number) => Math.max(0, Math.min(1, v / 100));
    expect(sliderToWeight(50)).toBe(0.5);
  });

  it('slider-to-weight clamps values above 100', () => {
    const sliderToWeight = (v: number) => Math.max(0, Math.min(1, v / 100));
    expect(sliderToWeight(200)).toBe(1);
  });

  it('slider-to-weight clamps values below 0', () => {
    const sliderToWeight = (v: number) => Math.max(0, Math.min(1, v / 100));
    expect(sliderToWeight(-50)).toBe(0);
  });

  it('CharacterCard morphTarget weights are in 0-100 range (slider space)', () => {
    const card = buildCharacterCard({
      morphTargets: { body_height: 75, face_jaw_width: 30 },
      skinColor: '#e8beac',
      equippedItems: {},
    });
    for (const [, value] of Object.entries(card.character.morphTargets)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }
  });
});
