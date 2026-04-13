import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmotionSystem } from '@holoscript/engine/dialogue';

// =============================================================================
// C232 — Emotion System
// =============================================================================

describe('EmotionSystem', () => {
  let es: EmotionSystem;
  beforeEach(() => {
    es = new EmotionSystem();
  });

  it('setEmotion and getEmotion', () => {
    es.setEmotion('npc1', 'joy', 0.8);
    expect(es.getEmotion('npc1', 'joy')).toBeCloseTo(0.8);
  });

  it('getEmotion returns 0 for unknown entity', () => {
    expect(es.getEmotion('nobody', 'anger')).toBe(0);
  });

  it('setEmotion clamps intensity to [0,1]', () => {
    es.setEmotion('npc1', 'anger', 5);
    expect(es.getEmotion('npc1', 'anger')).toBe(1);
    es.setEmotion('npc1', 'fear', -2);
    expect(es.getEmotion('npc1', 'fear')).toBe(0);
  });

  it('getDominantEmotion returns highest intensity', () => {
    es.setEmotion('npc1', 'joy', 0.3);
    es.setEmotion('npc1', 'anger', 0.9);
    es.setEmotion('npc1', 'sadness', 0.5);
    expect(es.getDominantEmotion('npc1')).toBe('anger');
  });

  it('getDominantEmotion returns null for unknown', () => {
    expect(es.getDominantEmotion('nobody')).toBeNull();
  });

  it('update decays emotions over time', () => {
    es.setEmotion('npc1', 'joy', 0.5, 0.1); // decays 0.1/sec
    es.update(2); // 2 seconds → -0.2
    expect(es.getEmotion('npc1', 'joy')).toBeCloseTo(0.3);
  });

  it('update removes emotion at zero', () => {
    es.setEmotion('npc1', 'joy', 0.1, 1.0); // fast decay
    es.update(1);
    expect(es.getEmotion('npc1', 'joy')).toBe(0);
    expect(es.getEntityEmotions('npc1')).not.toContain('joy');
  });

  it('getEntityEmotions lists active emotions', () => {
    es.setEmotion('npc1', 'joy', 0.5);
    es.setEmotion('npc1', 'trust', 0.3);
    const emotions = es.getEntityEmotions('npc1');
    expect(emotions).toContain('joy');
    expect(emotions).toContain('trust');
    expect(emotions).toHaveLength(2);
  });

  it('getEntityEmotions returns [] for unknown', () => {
    expect(es.getEntityEmotions('nobody')).toHaveLength(0);
  });

  // --- Relationships ---

  it('setRelationship and getRelationship', () => {
    es.setRelationship('alice', 'bob', 0.7);
    expect(es.getRelationship('alice', 'bob')).toBeCloseTo(0.7);
  });

  it('getRelationship returns 0 for unknown pair', () => {
    expect(es.getRelationship('x', 'y')).toBe(0);
  });

  it('setRelationship clamps to [-1, 1]', () => {
    es.setRelationship('a', 'b', 5);
    expect(es.getRelationship('a', 'b')).toBe(1);
    es.setRelationship('a', 'b', -5);
    expect(es.getRelationship('a', 'b')).toBe(-1);
  });

  it('modifyRelationship adjusts affinity', () => {
    es.setRelationship('a', 'b', 0.5);
    es.modifyRelationship('a', 'b', -0.3);
    expect(es.getRelationship('a', 'b')).toBeCloseTo(0.2);
  });

  // --- Triggers ---

  it('onEmotionChange fires when emotion is set', () => {
    const cb = vi.fn();
    es.onEmotionChange(cb);
    es.setEmotion('npc1', 'surprise', 0.6);
    expect(cb).toHaveBeenCalledWith('npc1', 'surprise', 0.6);
  });
});
