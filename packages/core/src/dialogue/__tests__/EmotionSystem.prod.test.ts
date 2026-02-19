/**
 * EmotionSystem — Production Test Suite
 *
 * Covers: emotion set/get, decay over time, dominant emotion,
 * relationships, triggers, entity queries.
 */
import { describe, it, expect, vi } from 'vitest';
import { EmotionSystem } from '../EmotionSystem';

describe('EmotionSystem — Production', () => {
  // ─── Emotion Management ───────────────────────────────────────────
  it('setEmotion + getEmotion', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'joy', 0.8);
    expect(es.getEmotion('npc', 'joy')).toBeCloseTo(0.8);
  });

  it('intensity clamped to 0-1', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'anger', 5);
    expect(es.getEmotion('npc', 'anger')).toBe(1);
    es.setEmotion('npc', 'sadness', -1);
    expect(es.getEmotion('npc', 'sadness')).toBe(0);
  });

  it('getDominantEmotion returns highest intensity', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'joy', 0.3);
    es.setEmotion('npc', 'anger', 0.9);
    expect(es.getDominantEmotion('npc')).toBe('anger');
  });

  it('getDominantEmotion returns null for unknown entity', () => {
    const es = new EmotionSystem();
    expect(es.getDominantEmotion('nobody')).toBeNull();
  });

  // ─── Decay ────────────────────────────────────────────────────────
  it('emotions decay over time', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'fear', 1.0, 0.5);
    es.update(1); // 1 second: intensity = 1.0 - 0.5 = 0.5
    expect(es.getEmotion('npc', 'fear')).toBeCloseTo(0.5);
  });

  it('fully decayed emotions are removed', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'surprise', 0.1, 1.0);
    es.update(1); // decays to 0
    expect(es.getEntityEmotions('npc')).not.toContain('surprise');
  });

  // ─── Relationships ────────────────────────────────────────────────
  it('setRelationship + getRelationship', () => {
    const es = new EmotionSystem();
    es.setRelationship('alice', 'bob', 0.8);
    expect(es.getRelationship('alice', 'bob')).toBe(0.8);
  });

  it('affinity clamped to -1 to 1', () => {
    const es = new EmotionSystem();
    es.setRelationship('a', 'b', 5);
    expect(es.getRelationship('a', 'b')).toBe(1);
    es.setRelationship('a', 'b', -5);
    expect(es.getRelationship('a', 'b')).toBe(-1);
  });

  it('modifyRelationship adjusts affinity', () => {
    const es = new EmotionSystem();
    es.setRelationship('a', 'b', 0.5);
    es.modifyRelationship('a', 'b', -0.3);
    expect(es.getRelationship('a', 'b')).toBeCloseTo(0.2);
  });

  // ─── Triggers ─────────────────────────────────────────────────────
  it('onEmotionChange fires trigger on set', () => {
    const es = new EmotionSystem();
    const trigger = vi.fn();
    es.onEmotionChange(trigger);
    es.setEmotion('npc', 'trust', 0.7);
    expect(trigger).toHaveBeenCalledWith('npc', 'trust', 0.7);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getEntityEmotions lists active emotions', () => {
    const es = new EmotionSystem();
    es.setEmotion('npc', 'joy', 0.5);
    es.setEmotion('npc', 'anger', 0.3);
    const emotions = es.getEntityEmotions('npc');
    expect(emotions).toContain('joy');
    expect(emotions).toContain('anger');
    expect(emotions.length).toBe(2);
  });

  it('unknown entity returns 0 for getRelationship', () => {
    const es = new EmotionSystem();
    expect(es.getRelationship('x', 'y')).toBe(0);
  });
});
