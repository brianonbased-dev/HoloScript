import { describe, it, expect, beforeEach } from 'vitest';
import { PostProcessStack } from '../PostProcessStack';

const identity = (input: Float32Array) => input;
const doubler = (input: Float32Array) => {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] * 2;
  return out;
};

describe('PostProcessStack', () => {
  let stack: PostProcessStack;

  beforeEach(() => {
    stack = new PostProcessStack();
  });

  // Effect management
  it('addEffect returns effect with id', () => {
    const e = stack.addEffect('Bloom', 0, identity);
    expect(e.id).toBeTruthy();
    expect(e.name).toBe('Bloom');
    expect(e.enabled).toBe(true);
    expect(e.weight).toBe(1);
    expect(stack.getEffectCount()).toBe(1);
  });

  it('removeEffect deletes effect', () => {
    const e = stack.addEffect('Bloom', 0, identity);
    expect(stack.removeEffect(e.id)).toBe(true);
    expect(stack.getEffectCount()).toBe(0);
  });

  it('removeEffect returns false for unknown', () => {
    expect(stack.removeEffect('nope')).toBe(false);
  });

  // Enable/Disable
  it('setEnabled toggles effect', () => {
    const e = stack.addEffect('Bloom', 0, identity);
    stack.setEnabled(e.id, false);
    expect(stack.getActiveCount()).toBe(0);
  });

  it('setGlobalEnabled disables all processing', () => {
    stack.addEffect('Bloom', 0, doubler);
    stack.setGlobalEnabled(false);
    const input = new Float32Array([1, 2, 3]);
    expect(stack.process(input, 3, 1)).toBe(input);
  });

  it('isGlobalEnabled reflects state', () => {
    expect(stack.isGlobalEnabled()).toBe(true);
    stack.setGlobalEnabled(false);
    expect(stack.isGlobalEnabled()).toBe(false);
  });

  // Weight
  it('setWeight clamps to [0,1]', () => {
    const e = stack.addEffect('Bloom', 0, identity);
    stack.setWeight(e.id, 5);
    expect(stack.getEffect(e.id)!.weight).toBe(1);
    stack.setWeight(e.id, -1);
    expect(stack.getEffect(e.id)!.weight).toBe(0);
  });

  it('partial weight blends output', () => {
    const e = stack.addEffect('Double', 0, doubler);
    stack.setWeight(e.id, 0.5);
    const input = new Float32Array([1, 1, 1]);
    const result = stack.process(input, 3, 1);
    // 1 * 0.5 + 2 * 0.5 = 1.5
    expect(result[0]).toBeCloseTo(1.5);
  });

  // Processing
  it('process applies effects in priority order', () => {
    stack.addEffect('Double', 1, doubler);
    stack.addEffect('AddOne', 0, (input) => {
      const out = new Float32Array(input.length);
      for (let i = 0; i < input.length; i++) out[i] = input[i] + 1;
      return out;
    });
    const result = stack.process(new Float32Array([1]), 1, 1);
    // AddOne first (priority 0): 1+1=2, then Double (priority 1): 2*2=4
    expect(result[0]).toBe(4);
  });

  it('process skips disabled effects', () => {
    const e = stack.addEffect('Double', 0, doubler);
    stack.setEnabled(e.id, false);
    const input = new Float32Array([5]);
    expect(stack.process(input, 1, 1)[0]).toBe(5);
  });

  // Reorder
  it('reorder changes priority', () => {
    const a = stack.addEffect('A', 0, identity);
    const b = stack.addEffect('B', 1, identity);
    stack.reorder(b.id, -1);
    const names = stack.getEffectNames();
    expect(names[0]).toBe('B');
  });

  // Params
  it('setParam and getParam', () => {
    const e = stack.addEffect('Bloom', 0, identity, { intensity: 0.5 });
    expect(stack.getParam(e.id, 'intensity')).toBe(0.5);
    stack.setParam(e.id, 'intensity', 0.9);
    expect(stack.getParam(e.id, 'intensity')).toBe(0.9);
  });

  it('getParam returns undefined for unknown', () => {
    expect(stack.getParam('nope', 'x')).toBeUndefined();
  });

  // Queries
  it('getEffectNames lists effects in order', () => {
    stack.addEffect('A', 1, identity);
    stack.addEffect('B', 0, identity);
    expect(stack.getEffectNames()).toEqual(['B', 'A']);
  });
});
