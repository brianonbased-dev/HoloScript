/**
 * dream-journal.scenario.ts — LIVING-SPEC: Dream Journal Visualizer
 *
 * Persona: Zara — dream journaler who converts written dream narratives
 * into surreal 3D environments with emotion-driven colors and impossible physics.
 */

import { describe, it, expect } from 'vitest';
import {
  emotionToColorPalette, blendEmotionColors, generateEnvironment,
  clarityScore, findSymbol, symbolsInDream, lucidDreamRatio,
  recurringDreamCount, averageDreamDuration,
  EMOTION_PALETTES, COMMON_SYMBOLS,
  type DreamEntry,
} from '@/lib/dreamJournal';

describe('Scenario: Dream Journal — Emotion Colors', () => {
  it('joy palette is warm gold tones', () => {
    const p = emotionToColorPalette('joy');
    expect(p.primary).toBe('#FFD700');
  });

  it('fear palette is dark purple', () => {
    expect(emotionToColorPalette('fear').primary).toBe('#1a0a2e');
  });

  it('blendEmotionColors() mixes two emotion primaries', () => {
    const blended = blendEmotionColors(['joy', 'sadness']);
    expect(blended).toMatch(/^#[0-9a-f]{6}$/);
    expect(blended).not.toBe(EMOTION_PALETTES.joy.primary);
  });

  it('blendEmotionColors([]) returns gray', () => {
    expect(blendEmotionColors([])).toBe('#808080');
  });

  it('blendEmotionColors() with single emotion returns its primary', () => {
    expect(blendEmotionColors(['peace'])).toBe('#2ecc71');
  });

  it('all 8 emotion categories have palettes', () => {
    expect(Object.keys(EMOTION_PALETTES)).toHaveLength(8);
  });
});

describe('Scenario: Dream Journal — Environment Generation', () => {
  const vividDream: DreamEntry = {
    id: 'd1', date: '2024-03-15', title: 'Flying Over Mountains',
    narrative: 'I was soaring above snow-capped peaks...', emotions: ['awe', 'joy'],
    clarity: 'vivid', lucid: true, recurring: false, symbols: ['flying'],
    duration: 20, physicsMode: 'flight',
  };

  it('vivid dream has high ambient light (0.9)', () => {
    expect(generateEnvironment(vividDream).ambientLight).toBe(0.9);
  });

  it('flight physics has near-zero gravity', () => {
    expect(generateEnvironment(vividDream).gravity).toBe(0.1);
  });

  it('lucid dream has low distortion', () => {
    expect(generateEnvironment(vividDream).distortion).toBe(0.2);
  });

  it('foggy dream has high fog density', () => {
    const foggy: DreamEntry = { ...vividDream, clarity: 'foggy', lucid: false };
    const env = generateEnvironment(foggy);
    expect(env.fogDensity).toBe(0.8);
    expect(env.ambientLight).toBe(0.3);
  });

  it('time-loop physics has slow time speed', () => {
    const loop: DreamEntry = { ...vividDream, physicsMode: 'time-loop' };
    expect(generateEnvironment(loop).timeSpeed).toBe(0.1);
  });

  it('clarityScore maps vivid=1.0, fragment=0.2', () => {
    expect(clarityScore('vivid')).toBe(1.0);
    expect(clarityScore('fragment')).toBe(0.2);
  });
});

describe('Scenario: Dream Journal — Symbols & Analytics', () => {
  it('COMMON_SYMBOLS has 8 symbols', () => {
    expect(COMMON_SYMBOLS).toHaveLength(8);
  });

  it('findSymbol(water) returns water symbol', () => {
    const water = findSymbol('water');
    expect(water).toBeDefined();
    expect(water!.meanings).toContain('emotions');
  });

  it('symbolsInDream() resolves known symbols', () => {
    const entry: DreamEntry = {
      id: 'd', date: '', title: '', narrative: '', emotions: ['fear'],
      clarity: 'normal', lucid: false, recurring: false,
      symbols: ['water', 'falling', 'unknown-thing'], duration: 10, physicsMode: 'normal',
    };
    expect(symbolsInDream(entry)).toHaveLength(2); // unknown filtered out
  });

  it('lucidDreamRatio() calculates percentage', () => {
    const entries = [
      { lucid: true }, { lucid: false }, { lucid: true }, { lucid: false },
    ] as DreamEntry[];
    expect(lucidDreamRatio(entries)).toBe(0.5);
  });

  it('recurringDreamCount() counts recurring entries', () => {
    const entries = [
      { recurring: true }, { recurring: false }, { recurring: true },
    ] as DreamEntry[];
    expect(recurringDreamCount(entries)).toBe(2);
  });

  it('averageDreamDuration() calculates mean minutes', () => {
    const entries = [{ duration: 10 }, { duration: 20 }, { duration: 30 }] as DreamEntry[];
    expect(averageDreamDuration(entries)).toBe(20);
  });

  it.todo('text-to-3D parser — extract environment keywords from narrative');
  it.todo('dream connection graph — link symbols across entries over time');
});
