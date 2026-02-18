import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmotionSystem } from '../EmotionSystem';

describe('EmotionSystem', () => {
  let sys: EmotionSystem;

  beforeEach(() => {
    sys = new EmotionSystem();
  });

  it('setEmotion and getEmotion', () => {
    sys.setEmotion('npc1', 'joy', 0.8);
    expect(sys.getEmotion('npc1', 'joy')).toBe(0.8);
  });

  it('getEmotion returns 0 for unknown', () => {
    expect(sys.getEmotion('npc1', 'anger')).toBe(0);
  });

  it('clamps intensity to 0-1', () => {
    sys.setEmotion('npc1', 'fear', 1.5);
    expect(sys.getEmotion('npc1', 'fear')).toBe(1);
    sys.setEmotion('npc1', 'anger', -0.5);
    expect(sys.getEmotion('npc1', 'anger')).toBe(0);
  });

  it('getDominantEmotion returns strongest', () => {
    sys.setEmotion('npc1', 'joy', 0.3);
    sys.setEmotion('npc1', 'anger', 0.9);
    expect(sys.getDominantEmotion('npc1')).toBe('anger');
  });

  it('getDominantEmotion returns null for unknown entity', () => {
    expect(sys.getDominantEmotion('nobody')).toBeNull();
  });

  it('update decays emotions over time', () => {
    sys.setEmotion('npc1', 'joy', 1.0, 0.5); // decayRate=0.5/s
    sys.update(1); // 1 second → 1.0 - 0.5 = 0.5
    expect(sys.getEmotion('npc1', 'joy')).toBeCloseTo(0.5);
  });

  it('emotions decay to zero and get removed', () => {
    sys.setEmotion('npc1', 'sadness', 0.1, 1.0);
    sys.update(1); // Drops to 0
    expect(sys.getEntityEmotions('npc1')).not.toContain('sadness');
  });

  it('setRelationship and getRelationship', () => {
    sys.setRelationship('a', 'b', 0.7);
    expect(sys.getRelationship('a', 'b')).toBe(0.7);
  });

  it('getRelationship returns 0 for unknown pair', () => {
    expect(sys.getRelationship('x', 'y')).toBe(0);
  });

  it('modifyRelationship adjusts affinity', () => {
    sys.setRelationship('a', 'b', 0.5);
    sys.modifyRelationship('a', 'b', -0.3);
    expect(sys.getRelationship('a', 'b')).toBeCloseTo(0.2);
  });

  it('relationship clamps to -1 to 1', () => {
    sys.setRelationship('a', 'b', 1.5);
    expect(sys.getRelationship('a', 'b')).toBe(1);
  });

  it('onEmotionChange fires trigger', () => {
    const trigger = vi.fn();
    sys.onEmotionChange(trigger);
    sys.setEmotion('npc1', 'surprise', 0.6);
    expect(trigger).toHaveBeenCalledWith('npc1', 'surprise', 0.6);
  });

  it('getEntityEmotions lists active emotions', () => {
    sys.setEmotion('npc1', 'joy', 0.5);
    sys.setEmotion('npc1', 'trust', 0.3);
    const emotions = sys.getEntityEmotions('npc1');
    expect(emotions).toContain('joy');
    expect(emotions).toContain('trust');
    expect(emotions.length).toBe(2);
  });
});
