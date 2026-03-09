import { describe, it, expect, beforeEach } from 'vitest';
import { EmotionDirectiveTrait } from '../EmotionDirectiveTrait';

describe('EmotionDirectiveTrait', () => {
  let trait: EmotionDirectiveTrait;

  beforeEach(() => {
    trait = new EmotionDirectiveTrait();
  });

  it('initializes with defaults', () => {
    const state = trait.getState();
    expect(state.conditionalState).toBe('idle');
    expect(state.expression).toBe('neutral');
    expect(state.animation).toBe('idle');
    expect(state.mood).toBe('neutral');
  });

  it('setConditionalState changes state', () => {
    const events: any[] = [];
    trait.on('state-change', (e: any) => events.push(e));
    trait.setConditionalState({
      type: 'conditional',
      state: 'thinking',
      expression: 'thinking',
      animation: 'thinking',
    });
    const s = trait.getState();
    expect(s.conditionalState).toBe('thinking');
    expect(s.expression).toBe('thinking');
    expect(events).toHaveLength(1);
  });

  it('setExpression triggers expression-change event', () => {
    const events: any[] = [];
    trait.on('expression-change', (e: any) => events.push(e));
    trait.setExpression('happy');
    expect(trait.getState().expression).toBe('happy');
    expect(events).toHaveLength(1);
  });

  it('setAnimation triggers animation-change event', () => {
    const events: any[] = [];
    trait.on('animation-change', (e: any) => events.push(e));
    trait.setAnimation('talking');
    expect(trait.getState().animation).toBe('talking');
    expect(events).toHaveLength(1);
  });

  it('fireTrigger queues trigger', () => {
    trait.fireTrigger({ type: 'triggering', action: 'nod', intensity: 0.8 });
    expect(trait.getPendingTriggerCount()).toBe(1);
    const consumed = trait.consumeTrigger();
    expect(consumed).toBeDefined();
    expect(consumed!.action).toBe('nod');
    expect(trait.getPendingTriggerCount()).toBe(0);
  });

  it('processResponse emits response-start and segment-start', () => {
    const events: any[] = [];
    trait.on('response-start', (e: any) => events.push(e));
    trait.on('segment-start', (e: any) => events.push(e));

    trait.processResponse({
      segments: [
        { text: 'Hello!', facialExpression: 'happy', animation: 'talking' },
        { text: 'How are you?', facialExpression: 'empathetic' },
      ],
      mood: 'happy',
    });

    expect(events.some((e) => e.type === 'response-start')).toBe(true);
    expect(events.some((e) => e.type === 'segment-start')).toBe(true);
    expect(trait.getCurrentSegmentIndex()).toBe(0);
  });

  it('advanceSegment moves through segments', () => {
    trait.processResponse({
      segments: [
        { text: 'Seg1', facialExpression: 'happy' },
        { text: 'Seg2', facialExpression: 'sad' },
      ],
    });
    // After processResponse, we are at segment 0
    expect(trait.getCurrentSegment()!.text).toBe('Seg1');

    const seg2 = trait.advanceSegment();
    expect(seg2).not.toBeNull();
    expect(seg2!.text).toBe('Seg2');
    expect(trait.getState().expression).toBe('sad');

    // Advance past end
    const done = trait.advanceSegment();
    expect(done).toBeNull();
  });

  it('maxSegmentsPerTurn limits segments', () => {
    const t = new EmotionDirectiveTrait({ maxSegmentsPerTurn: 1 });
    t.processResponse({
      segments: [{ text: 'A' }, { text: 'B' }, { text: 'C' }],
    });
    // Only first segment
    expect(t.getCurrentSegment()!.text).toBe('A');
    expect(t.advanceSegment()).toBeNull(); // only 1 segment allowed
  });

  it('setMood updates mood', () => {
    trait.setMood('excited', 0.9);
    const { mood, intensity } = trait.getMood();
    expect(mood).toBe('excited');
    expect(intensity).toBe(0.9);
  });

  it('addExpressionPreset adds custom preset', () => {
    trait.addExpressionPreset('custom', { smile: 1.0 });
    expect(trait.getExpressionPresetNames()).toContain('custom');
  });

  it('removeExpressionPreset removes preset', () => {
    trait.removeExpressionPreset('happy');
    expect(trait.getExpressionPresetNames()).not.toContain('happy');
  });

  it('update blends expression weights over time', () => {
    trait.setExpression('happy');
    // Blend partially
    const w1 = trait.update(0.1);
    expect(w1).toBeDefined();
    // Blend complete
    const w2 = trait.update(1.0);
    expect(w2).toBeDefined();
    // Should have smile weights from happy preset
    expect(w2.mouthSmileLeft).toBeGreaterThan(0);
  });

  it('getCurrentAnimationClip returns clip name', () => {
    expect(trait.getCurrentAnimationClip()).toBe('IdleBreathing');
    trait.setAnimation('talking');
    expect(trait.getCurrentAnimationClip()).toBe('TalkingOne');
  });

  it('getConfig returns config copy', () => {
    const cfg = trait.getConfig();
    expect(cfg.maxSegmentsPerTurn).toBe(3);
  });

  it('postSpeechState transitions after response', () => {
    const events: any[] = [];
    trait.on('response-end', (e: any) => events.push(e));
    trait.processResponse({
      segments: [{ text: 'Bye' }],
      postSpeechState: 'listening',
    });
    trait.advanceSegment(); // finishes response
    expect(trait.getState().conditionalState).toBe('listening');
    expect(events.some((e) => e.type === 'response-end')).toBe(true);
  });
});
