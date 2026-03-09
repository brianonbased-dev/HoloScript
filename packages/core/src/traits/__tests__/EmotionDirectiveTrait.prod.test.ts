/**
 * EmotionDirectiveTrait — Production Test Suite
 *
 * Tests all pure CPU logic:
 * - DEFAULT_EXPRESSION_PRESETS: 12 named presets, all weights 0–1
 * - DEFAULT_ANIMATION_MAP: 11 entries mapping preset→clip names
 * - Constructor defaults and config merging
 * - setConditionalState: persists state, optional expression/animation, state-change event
 * - setExpression: preset lookup, blend initialization, expression-change event (dedup)
 * - setAnimation: state update, animation-change event (dedup)
 * - fireTrigger / consumeTrigger / getPendingTriggerCount: FIFO queue + trigger-fire event
 * - processResponse: max-segment cap, mood set, response-start event, first segment dispatched
 * - advanceSegment: expression/animation per segment, gesture→triggers, segment events, null at end
 * - getCurrentSegment / getCurrentSegmentIndex after processResponse
 * - setMood / getMood: intensity clamp 0–1, mood-shift event, moodDecay in update()
 * - generateFiller: one-of-3 fillers, queues trigger, returns directive
 * - addExpressionPreset / removeExpressionPreset / getExpressionPresetNames
 * - addAnimationMapping / getCurrentAnimationClip
 * - update(): easeOutQuad blend progress, mood overlay on result
 * - on/off events, error isolation
 * - dispose
 */
import { describe, it, expect, vi } from 'vitest';
import {
  EmotionDirectiveTrait,
  createEmotionDirectiveTrait,
  DEFAULT_EXPRESSION_PRESETS,
  DEFAULT_ANIMATION_MAP,
} from '../EmotionDirectiveTrait';
import type {
  ConditionalDirective,
  TriggeringDirective,
  EmotionTaggedResponse,
} from '../EmotionDirectiveTrait';

// ─── DEFAULT_EXPRESSION_PRESETS ───────────────────────────────────────────────

describe('DEFAULT_EXPRESSION_PRESETS', () => {
  it('has exactly 13 named presets', () => {
    expect(Object.keys(DEFAULT_EXPRESSION_PRESETS)).toHaveLength(13);
  });
  it('neutral has empty weights (reset face)', () => {
    expect(DEFAULT_EXPRESSION_PRESETS['neutral']).toEqual({});
  });
  it('happy has mouthSmileLeft and mouthSmileRight', () => {
    expect(DEFAULT_EXPRESSION_PRESETS['happy'].mouthSmileLeft).toBeGreaterThan(0);
    expect(DEFAULT_EXPRESSION_PRESETS['happy'].mouthSmileRight).toBeGreaterThan(0);
  });
  it('sad has mouthFrownLeft and mouthFrownRight', () => {
    expect(DEFAULT_EXPRESSION_PRESETS['sad'].mouthFrownLeft).toBeGreaterThan(0);
    expect(DEFAULT_EXPRESSION_PRESETS['sad'].mouthFrownRight).toBeGreaterThan(0);
  });
  it('angry has browDownLeft and browDownRight', () => {
    expect(DEFAULT_EXPRESSION_PRESETS['angry'].browDownLeft).toBeGreaterThan(0);
    expect(DEFAULT_EXPRESSION_PRESETS['angry'].browDownRight).toBeGreaterThan(0);
  });
  it('surprised has eyeWideLeft, eyeWideRight, jawOpen', () => {
    expect(DEFAULT_EXPRESSION_PRESETS['surprised'].eyeWideLeft).toBeGreaterThan(0);
    expect(DEFAULT_EXPRESSION_PRESETS['surprised'].jawOpen).toBeGreaterThan(0);
  });
  it('thinking has eyeLookUpLeft/Right (looking up while thinking)', () => {
    expect(DEFAULT_EXPRESSION_PRESETS['thinking'].eyeLookUpLeft).toBeGreaterThan(0);
    expect(DEFAULT_EXPRESSION_PRESETS['thinking'].eyeLookUpRight).toBeGreaterThan(0);
  });
  it('all weight values are between 0 and 1', () => {
    for (const [, weights] of Object.entries(DEFAULT_EXPRESSION_PRESETS)) {
      for (const w of Object.values(weights)) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1);
      }
    }
  });
  it('includes neutral, happy, sad, angry, surprised, thinking, excited, empathetic, skeptical, amused, confused', () => {
    const expected = [
      'neutral',
      'happy',
      'sad',
      'angry',
      'surprised',
      'thinking',
      'excited',
      'empathetic',
      'skeptical',
      'amused',
      'confused',
      'disgusted',
      'fearful',
    ];
    for (const name of expected) {
      expect(DEFAULT_EXPRESSION_PRESETS).toHaveProperty(name);
    }
  });
});

// ─── DEFAULT_ANIMATION_MAP ────────────────────────────────────────────────────

describe('DEFAULT_ANIMATION_MAP', () => {
  it('has 12 entries', () => {
    expect(Object.keys(DEFAULT_ANIMATION_MAP)).toHaveLength(12);
  });
  it('idle → IdleBreathing', () => {
    expect(DEFAULT_ANIMATION_MAP['idle']).toBe('IdleBreathing');
  });
  it('talking → TalkingOne', () => {
    expect(DEFAULT_ANIMATION_MAP['talking']).toBe('TalkingOne');
  });
  it('thinking → ThinkingIdle', () => {
    expect(DEFAULT_ANIMATION_MAP['thinking']).toBe('ThinkingIdle');
  });
  it('listening → ListeningIdle', () => {
    expect(DEFAULT_ANIMATION_MAP['listening']).toBe('ListeningIdle');
  });
  it('nodding → Nodding', () => {
    expect(DEFAULT_ANIMATION_MAP['nodding']).toBe('Nodding');
  });
  it('waving → Waving', () => {
    expect(DEFAULT_ANIMATION_MAP['waving']).toBe('Waving');
  });
});

// ─── Constructor + getConfig ──────────────────────────────────────────────────

describe('EmotionDirectiveTrait — constructor + getConfig', () => {
  it('creates with no args', () => {
    expect(new EmotionDirectiveTrait()).toBeInstanceOf(EmotionDirectiveTrait);
  });
  it('default maxSegmentsPerTurn = 3', () => {
    expect(new EmotionDirectiveTrait().getConfig().maxSegmentsPerTurn).toBe(3);
  });
  it('default expressionBlendTime = 0.4', () => {
    expect(new EmotionDirectiveTrait().getConfig().expressionBlendTime).toBe(0.4);
  });
  it('default defaultState = idle', () => {
    expect(new EmotionDirectiveTrait().getConfig().defaultState).toBe('idle');
  });
  it('default defaultExpression = neutral', () => {
    expect(new EmotionDirectiveTrait().getConfig().defaultExpression).toBe('neutral');
  });
  it('default defaultAnimation = idle', () => {
    expect(new EmotionDirectiveTrait().getConfig().defaultAnimation).toBe('idle');
  });
  it('default moodDecayRate = 0.05', () => {
    expect(new EmotionDirectiveTrait().getConfig().moodDecayRate).toBe(0.05);
  });
  it('default microExpressions = true', () => {
    expect(new EmotionDirectiveTrait().getConfig().microExpressions).toBe(true);
  });
  it('default idleAnimations = true', () => {
    expect(new EmotionDirectiveTrait().getConfig().idleAnimations).toBe(true);
  });
  it('default conversationFillers = true', () => {
    expect(new EmotionDirectiveTrait().getConfig().conversationFillers).toBe(true);
  });
  it('createEmotionDirectiveTrait factory creates instance', () => {
    expect(createEmotionDirectiveTrait()).toBeInstanceOf(EmotionDirectiveTrait);
  });
  it('custom maxSegmentsPerTurn overrides default', () => {
    const t = new EmotionDirectiveTrait({ maxSegmentsPerTurn: 5 });
    expect(t.getConfig().maxSegmentsPerTurn).toBe(5);
  });
  it('custom expressionPresets merge with defaults', () => {
    const t = new EmotionDirectiveTrait({ expressionPresets: { silly: { mouthLeft: 0.5 } } });
    expect(t.getExpressionPresetNames()).toContain('silly');
    expect(t.getExpressionPresetNames()).toContain('happy'); // defaults still present
  });
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — initial state', () => {
  it('getState().conditionalState = idle', () => {
    expect(new EmotionDirectiveTrait().getState().conditionalState).toBe('idle');
  });
  it('getState().expression = neutral', () => {
    expect(new EmotionDirectiveTrait().getState().expression).toBe('neutral');
  });
  it('getState().animation = idle', () => {
    expect(new EmotionDirectiveTrait().getState().animation).toBe('idle');
  });
  it('getState().expressionWeights = {}', () => {
    expect(new EmotionDirectiveTrait().getState().expressionWeights).toEqual({});
  });
  it('getState().blendProgress = 1 (complete)', () => {
    expect(new EmotionDirectiveTrait().getState().blendProgress).toBe(1);
  });
  it('getState().mood = neutral', () => {
    expect(new EmotionDirectiveTrait().getState().mood).toBe('neutral');
  });
  it('getState().moodIntensity = 0', () => {
    expect(new EmotionDirectiveTrait().getState().moodIntensity).toBe(0);
  });
  it('getState().pendingTriggers = []', () => {
    expect(new EmotionDirectiveTrait().getState().pendingTriggers).toEqual([]);
  });
  it('getCurrentSegment() = null initially', () => {
    expect(new EmotionDirectiveTrait().getCurrentSegment()).toBeNull();
  });
  it('getCurrentSegmentIndex() = -1 initially', () => {
    expect(new EmotionDirectiveTrait().getCurrentSegmentIndex()).toBe(-1);
  });
  it('getPendingTriggerCount() = 0 initially', () => {
    expect(new EmotionDirectiveTrait().getPendingTriggerCount()).toBe(0);
  });
});

// ─── setConditionalState ──────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — setConditionalState', () => {
  it('sets conditionalState', () => {
    const t = new EmotionDirectiveTrait();
    t.setConditionalState({ type: 'conditional', state: 'listening' });
    expect(t.getState().conditionalState).toBe('listening');
  });
  it('sets expression when provided', () => {
    const t = new EmotionDirectiveTrait();
    t.setConditionalState({ type: 'conditional', state: 'thinking', expression: 'thinking' });
    expect(t.getState().expression).toBe('thinking');
  });
  it('sets animation when provided', () => {
    const t = new EmotionDirectiveTrait();
    t.setConditionalState({ type: 'conditional', state: 'thinking', animation: 'thinking' });
    expect(t.getState().animation).toBe('thinking');
  });
  it('fires state-change event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('state-change', cb);
    t.setConditionalState({ type: 'conditional', state: 'listening' });
    expect(cb).toHaveBeenCalledOnce();
  });
  it('state-change event includes state name', () => {
    const t = new EmotionDirectiveTrait();
    let evtState: string | undefined;
    t.on('state-change', (e) => {
      evtState = e.state;
    });
    t.setConditionalState({ type: 'conditional', state: 'listening' });
    expect(evtState).toBe('listening');
  });
});

// ─── setExpression ────────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — setExpression', () => {
  it('sets expression name on state', () => {
    const t = new EmotionDirectiveTrait();
    t.setExpression('happy');
    expect(t.getState().expression).toBe('happy');
  });
  it('fires expression-change event when changing', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('expression-change', cb);
    t.setExpression('happy');
    expect(cb).toHaveBeenCalledOnce();
  });
  it('does NOT fire expression-change when same expression set again', () => {
    const t = new EmotionDirectiveTrait({ defaultExpression: 'happy' });
    t.setExpression('happy'); // initialize to happy
    const cb = vi.fn();
    t.on('expression-change', cb);
    t.setExpression('happy'); // same again
    expect(cb).not.toHaveBeenCalled();
  });
  it('unknown expression does not change state (if not neutral)', () => {
    const t = new EmotionDirectiveTrait();
    t.setExpression('happy'); // valid
    t.setExpression('nonexistent_preset' as any); // unknown, not 'neutral'
    // Expression should stay happy (setExpression returns early for unknown presets)
    expect(t.getState().expression).toBe('happy');
  });
  it('neutral always accepted as expression', () => {
    const t = new EmotionDirectiveTrait();
    t.setExpression('happy');
    t.setExpression('neutral');
    expect(t.getState().expression).toBe('neutral');
  });
  it('after setExpression, update(dt) begins interpolating blend', () => {
    const t = new EmotionDirectiveTrait({ expressionBlendTime: 0.4 });
    t.setExpression('happy');
    const weights = t.update(0.1); // partial blend: 0.1 / 0.4 = 25%
    // happy has mouthSmileLeft — should be partially blended
    expect(weights).toHaveProperty('mouthSmileLeft');
    expect(weights.mouthSmileLeft).toBeGreaterThan(0);
    expect(weights.mouthSmileLeft).toBeLessThan(0.7); // not fully reached yet
  });
  it('after full blend time, weights match preset', () => {
    const t = new EmotionDirectiveTrait({ expressionBlendTime: 0.4 });
    t.setExpression('happy');
    t.update(0.4); // full blend
    const weights = t.getExpressionWeights();
    expect(weights.mouthSmileLeft).toBeCloseTo(0.7, 1);
    expect(weights.mouthSmileRight).toBeCloseTo(0.7, 1);
  });
});

// ─── setAnimation ─────────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — setAnimation', () => {
  it('sets animation state', () => {
    const t = new EmotionDirectiveTrait();
    t.setAnimation('talking');
    expect(t.getState().animation).toBe('talking');
  });
  it('fires animation-change event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('animation-change', cb);
    t.setAnimation('talking');
    expect(cb).toHaveBeenCalledOnce();
  });
  it('does NOT fire animation-change when same animation set again', () => {
    const t = new EmotionDirectiveTrait();
    t.setAnimation('idle');
    const cb = vi.fn();
    t.on('animation-change', cb);
    t.setAnimation('idle'); // same
    expect(cb).not.toHaveBeenCalled();
  });
  it('getCurrentAnimationClip returns clip name for known preset', () => {
    const t = new EmotionDirectiveTrait();
    t.setAnimation('talking');
    expect(t.getCurrentAnimationClip()).toBe('TalkingOne');
  });
  it('getCurrentAnimationClip returns undefined for unmapped preset', () => {
    const t = new EmotionDirectiveTrait();
    t.setAnimation('custom_unknown_animation' as any);
    expect(t.getCurrentAnimationClip()).toBeUndefined();
  });
});

// ─── fireTrigger / consumeTrigger ─────────────────────────────────────────────

describe('EmotionDirectiveTrait — fireTrigger / consumeTrigger', () => {
  it('fireTrigger increments pending trigger count', () => {
    const t = new EmotionDirectiveTrait();
    t.fireTrigger({ type: 'triggering', action: 'nod' });
    expect(t.getPendingTriggerCount()).toBe(1);
  });
  it('consumeTrigger returns trigger in FIFO order', () => {
    const t = new EmotionDirectiveTrait();
    t.fireTrigger({ type: 'triggering', action: 'nod' });
    t.fireTrigger({ type: 'triggering', action: 'wave' });
    expect(t.consumeTrigger()!.action).toBe('nod');
    expect(t.consumeTrigger()!.action).toBe('wave');
  });
  it('consumeTrigger returns undefined when queue empty', () => {
    const t = new EmotionDirectiveTrait();
    expect(t.consumeTrigger()).toBeUndefined();
  });
  it('fireTrigger fires trigger-fire event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('trigger-fire', cb);
    t.fireTrigger({ type: 'triggering', action: 'shrug' });
    expect(cb).toHaveBeenCalledOnce();
  });
  it('trigger-fire event includes action name', () => {
    const t = new EmotionDirectiveTrait();
    let evtTrigger: string | undefined;
    t.on('trigger-fire', (e) => {
      evtTrigger = e.trigger;
    });
    t.fireTrigger({ type: 'triggering', action: 'wave' });
    expect(evtTrigger).toBe('wave');
  });
  it('consumeTrigger decrements count', () => {
    const t = new EmotionDirectiveTrait();
    t.fireTrigger({ type: 'triggering', action: 'nod' });
    t.fireTrigger({ type: 'triggering', action: 'wave' });
    t.consumeTrigger();
    expect(t.getPendingTriggerCount()).toBe(1);
  });
});

// ─── processResponse / advanceSegment ────────────────────────────────────────

function makeResponse(n: number, mood?: string): EmotionTaggedResponse {
  return {
    segments: Array.from({ length: n }, (_, i) => ({
      text: `Segment ${i + 1}`,
      facialExpression: i === 0 ? 'happy' : 'neutral',
      animation: i === 0 ? 'talking' : 'idle',
    })),
    mood: mood as any,
  };
}

describe('EmotionDirectiveTrait — processResponse / advanceSegment', () => {
  it('processResponse fires response-start event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('response-start', cb);
    t.processResponse(makeResponse(2));
    expect(cb).toHaveBeenCalledOnce();
  });
  it('processResponse fires segment-start for first segment immediately', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('segment-start', cb);
    t.processResponse(makeResponse(2));
    expect(cb).toHaveBeenCalledOnce();
  });
  it('processResponse with mood calls setMood → mood-shift event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('mood-shift', cb);
    t.processResponse(makeResponse(1, 'happy'));
    expect(cb).toHaveBeenCalledOnce();
  });
  it('maxSegmentsPerTurn=3 enforces cap on response with more segments', () => {
    const t = new EmotionDirectiveTrait({ maxSegmentsPerTurn: 3 });
    let segmentStartCount = 0;
    t.on('segment-start', () => segmentStartCount++);
    // Process initial then manually advance all segments
    let segmentsEndedCount = 0;
    t.on('response-end', () => segmentsEndedCount++);
    t.processResponse(makeResponse(5)); // 5 > max 3
    // After processResponse: segment 0 started (segmentStartCount=1)
    // Advance through remaining
    t.advanceSegment(); // end 0, start 1
    t.advanceSegment(); // end 1, start 2
    t.advanceSegment(); // end 2, completes (no segment 3)
    expect(segmentStartCount).toBe(3); // only 3 segment-starts, not 5
  });
  it('advanceSegment returns current segment', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse(makeResponse(3));
    // Already at segment 0 after processResponse
    expect(t.getCurrentSegment()?.text).toBe('Segment 1');
  });
  it('advanceSegment moves to next segment', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse(makeResponse(3));
    t.advanceSegment();
    expect(t.getCurrentSegment()?.text).toBe('Segment 2');
  });
  it('advanceSegment returns null when all segments complete', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse(makeResponse(2));
    t.advanceSegment(); // goes to segment 1
    const result = t.advanceSegment(); // would go to 2, but only 2 segs → null
    expect(result).toBeNull();
  });
  it('response-end fires when all segments complete', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('response-end', cb);
    t.processResponse(makeResponse(1));
    // Segment 0 is already started. Advance past it:
    t.advanceSegment(); // ends segment 0, completes response
    expect(cb).toHaveBeenCalledOnce();
  });
  it('segment expression applied on advanceSegment', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse({
      segments: [
        { text: 'hi', facialExpression: 'sad', animation: 'saddened' },
        { text: 'bye', facialExpression: 'happy', animation: 'talking' },
      ],
    });
    t.advanceSegment(); // advance to segment 1
    expect(t.getState().expression).toBe('happy');
    expect(t.getState().animation).toBe('talking');
  });
  it('advanceSegment returns null when no response active', () => {
    const t = new EmotionDirectiveTrait();
    expect(t.advanceSegment()).toBeNull();
  });
  it('postSpeechState applied after response ends', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse({
      segments: [{ text: 'Done!' }],
      postSpeechState: 'listening',
    });
    t.advanceSegment(); // ends segment, completes response
    expect(t.getState().conditionalState).toBe('listening');
  });
  it('gesture in segment queues trigger on advanceSegment', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse({
      segments: [
        { text: 'first', gestures: [] }, // no gestures in seg 0
        { text: 'second', gestures: ['nod', 'wave'] }, // 2 gestures in seg 1
      ],
    });
    t.advanceSegment(); // go to segment 1 with gestures
    expect(t.getPendingTriggerCount()).toBe(2);
  });
});

// ─── setMood / getMood ────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — setMood / getMood', () => {
  it('setMood sets mood and intensity', () => {
    const t = new EmotionDirectiveTrait();
    t.setMood('happy', 0.8);
    const { mood, intensity } = t.getMood();
    expect(mood).toBe('happy');
    expect(intensity).toBe(0.8);
  });
  it('default intensity = 0.5 when not provided', () => {
    const t = new EmotionDirectiveTrait();
    t.setMood('sad');
    expect(t.getMood().intensity).toBe(0.5);
  });
  it('intensity clamped to 0 min', () => {
    const t = new EmotionDirectiveTrait();
    t.setMood('happy', -0.5);
    expect(t.getMood().intensity).toBe(0);
  });
  it('intensity clamped to 1 max', () => {
    const t = new EmotionDirectiveTrait();
    t.setMood('happy', 3.0);
    expect(t.getMood().intensity).toBe(1);
  });
  it('fires mood-shift event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('mood-shift', cb);
    t.setMood('excited', 0.7);
    expect(cb).toHaveBeenCalledOnce();
  });
  it('mood-shift event includes mood name', () => {
    const t = new EmotionDirectiveTrait();
    let evtMood: string | undefined;
    t.on('mood-shift', (e) => {
      evtMood = e.mood;
    });
    t.setMood('excited');
    expect(evtMood).toBe('excited');
  });
  it('moodIntensity decays each update() frame', () => {
    const t = new EmotionDirectiveTrait({ moodDecayRate: 0.05 });
    t.setMood('happy', 0.5);
    const before = t.getMood().intensity;
    t.update(1.0); // 1 second
    const after = t.getMood().intensity;
    expect(after).toBeLessThan(before);
    expect(after).toBeCloseTo(0.45, 2); // 0.5 - 0.05*1.0
  });
  it('moodIntensity does not go below 0', () => {
    const t = new EmotionDirectiveTrait({ moodDecayRate: 1.0 });
    t.setMood('happy', 0.1);
    t.update(10.0); // way more than enough to decay to 0
    expect(t.getMood().intensity).toBe(0);
  });
  it('mood overlay applies to update() result when mood active', () => {
    const t = new EmotionDirectiveTrait({ moodDecayRate: 0 });
    t.setMood('happy', 1.0); // max mood
    const result = t.update(0.016);
    // happy presets should be blended in as mood overlay (moodFactor = 1.0*0.3)
    // mouthSmileLeft = 0.7 * 0.3 = 0.21 added to result
    expect(result.mouthSmileLeft).toBeGreaterThan(0);
  });
  it('mood overlay NOT applied when mood = neutral', () => {
    const t = new EmotionDirectiveTrait();
    // Default mood is neutral, intensity is 0 — no overlay
    const result = t.update(0.016);
    expect(Object.keys(result)).toHaveLength(0);
  });
});

// ─── generateFiller ───────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — generateFiller', () => {
  it('generateFiller returns a TriggeringDirective', () => {
    const t = new EmotionDirectiveTrait();
    const filler = t.generateFiller();
    expect(filler.type).toBe('triggering');
    expect(['nod', 'slight_nod', 'head_tilt']).toContain(filler.action);
    expect(filler.bodyPart).toBe('head');
  });
  it('generateFiller queues trigger', () => {
    const t = new EmotionDirectiveTrait();
    t.generateFiller();
    expect(t.getPendingTriggerCount()).toBe(1);
  });
  it('generateFiller fires trigger-fire event', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('trigger-fire', cb);
    t.generateFiller();
    expect(cb).toHaveBeenCalledOnce();
  });
  it('multiple generateFiller calls accumulate triggers', () => {
    const t = new EmotionDirectiveTrait();
    t.generateFiller();
    t.generateFiller();
    t.generateFiller();
    expect(t.getPendingTriggerCount()).toBe(3);
  });
});

// ─── Expression preset management ────────────────────────────────────────────

describe('EmotionDirectiveTrait — preset management', () => {
  it('getExpressionPresetNames includes all 12 defaults', () => {
    const t = new EmotionDirectiveTrait();
    expect(t.getExpressionPresetNames().length).toBeGreaterThanOrEqual(12);
  });
  it('addExpressionPreset adds new preset', () => {
    const t = new EmotionDirectiveTrait();
    t.addExpressionPreset('silly', { mouthLeft: 0.8 });
    expect(t.getExpressionPresetNames()).toContain('silly');
  });
  it('addExpressionPreset updates existing preset', () => {
    const t = new EmotionDirectiveTrait();
    t.addExpressionPreset('happy', { mouthSmileLeft: 0.99 }); // override
    t.setExpression('happy');
    t.update(1.0); // full blend
    expect(t.getExpressionWeights().mouthSmileLeft).toBeCloseTo(0.99, 2);
  });
  it('removeExpressionPreset removes preset', () => {
    const t = new EmotionDirectiveTrait();
    t.addExpressionPreset('temp', { jawOpen: 0.5 });
    t.removeExpressionPreset('temp');
    expect(t.getExpressionPresetNames()).not.toContain('temp');
  });
  it('addAnimationMapping adds new mapping', () => {
    const t = new EmotionDirectiveTrait();
    t.addAnimationMapping('custom_dance', 'MyDanceClip');
    t.setAnimation('custom_dance');
    expect(t.getCurrentAnimationClip()).toBe('MyDanceClip');
  });
});

// ─── on/off events ────────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — on/off events', () => {
  it('on registers listener', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('expression-change', cb);
    t.setExpression('happy');
    expect(cb).toHaveBeenCalledOnce();
  });
  it('off removes listener', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('expression-change', cb);
    t.off('expression-change', cb);
    t.setExpression('happy');
    expect(cb).not.toHaveBeenCalled();
  });
  it('multiple listeners on same event all fire', () => {
    const t = new EmotionDirectiveTrait();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    t.on('expression-change', cb1);
    t.on('expression-change', cb2);
    t.setExpression('happy');
    expect(cb1).toHaveBeenCalled();
    expect(cb2).toHaveBeenCalled();
  });
  it('listener error is caught and does not stop other listeners', () => {
    const t = new EmotionDirectiveTrait();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    t.on('expression-change', bad);
    t.on('expression-change', good);
    expect(() => t.setExpression('happy')).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

// ─── dispose ─────────────────────────────────────────────────────────────────

describe('EmotionDirectiveTrait — dispose', () => {
  it('dispose does not throw', () => {
    const t = new EmotionDirectiveTrait();
    expect(() => t.dispose()).not.toThrow();
  });
  it('dispose clears event listeners (no events fire after)', () => {
    const t = new EmotionDirectiveTrait();
    const cb = vi.fn();
    t.on('expression-change', cb);
    t.dispose();
    cb.mockClear();
    t.setExpression('happy');
    expect(cb).not.toHaveBeenCalled();
  });
  it('dispose clears currentResponse', () => {
    const t = new EmotionDirectiveTrait();
    t.processResponse(makeResponse(3));
    t.dispose();
    // After dispose, advanceSegment should return null (no active response)
    expect(t.advanceSegment()).toBeNull();
  });
});
