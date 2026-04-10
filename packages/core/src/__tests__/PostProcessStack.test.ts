import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PostProcessStack } from '../rendering/PostProcessStack';

// =============================================================================
// C252 — Post Process Stack
// =============================================================================

const identity = (buf: Float32Array) => new Float32Array(buf);
const doubler = (buf: Float32Array) => {
  const out = new Float32Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] * 2;
  return out;
};

describe('PostProcessStack', () => {
  let stack: PostProcessStack;
  beforeEach(() => {
    stack = new PostProcessStack();
  });

  it('addEffect returns effect with id', () => {
    const e = stack.addEffect('bloom', 0, identity);
    expect(e.id).toBeDefined();
    expect(e.name).toBe('bloom');
  });

  it('getEffectCount reflects additions', () => {
    stack.addEffect('a', 0, identity);
    stack.addEffect('b', 1, identity);
    expect(stack.getEffectCount()).toBe(2);
  });

  it('removeEffect deletes by id', () => {
    const e = stack.addEffect('bloom', 0, identity);
    expect(stack.removeEffect(e.id)).toBe(true);
    expect(stack.getEffectCount()).toBe(0);
  });

  it('process chains effects', () => {
    stack.addEffect('double', 0, doubler);
    const input = new Float32Array([1, 2, 3]);
    const output = stack.process(input, 3, 1);
    expect(output[0]).toBe(2);
    expect(output[1]).toBe(4);
  });

  it('process respects priority order', () => {
    const log: string[] = [];
    stack.addEffect('second', 10, (b) => {
      log.push('second');
      return b;
    });
    stack.addEffect('first', 1, (b) => {
      log.push('first');
      return b;
    });
    stack.process(new Float32Array(1), 1, 1);
    expect(log).toEqual(['first', 'second']);
  });

  it('setEnabled false skips effect', () => {
    const e = stack.addEffect('double', 0, doubler);
    stack.setEnabled(e.id, false);
    const out = stack.process(new Float32Array([5]), 1, 1);
    expect(out[0]).toBe(5);
  });

  it('setGlobalEnabled false returns input', () => {
    stack.addEffect('double', 0, doubler);
    stack.setGlobalEnabled(false);
    const input = new Float32Array([7]);
    expect(stack.process(input, 1, 1)).toBe(input);
  });

  it('setWeight blends with original', () => {
    const e = stack.addEffect('double', 0, doubler);
    stack.setWeight(e.id, 0.5);
    const out = stack.process(new Float32Array([10]), 1, 1);
    // 10 * 0.5 + 20 * 0.5 = 15
    expect(out[0]).toBeCloseTo(15);
  });

  it('reorder changes execution order', () => {
    const log: string[] = [];
    const a = stack.addEffect('a', 1, (b) => {
      log.push('a');
      return b;
    });
    stack.addEffect('b', 2, (b) => {
      log.push('b');
      return b;
    });
    stack.reorder(a.id, 5);
    stack.process(new Float32Array(1), 1, 1);
    expect(log).toEqual(['b', 'a']);
  });

  it('setParam and getParam', () => {
    const e = stack.addEffect('bloom', 0, identity, { intensity: 0.5 });
    expect(stack.getParam(e.id, 'intensity')).toBe(0.5);
    stack.setParam(e.id, 'intensity', 1.0);
    expect(stack.getParam(e.id, 'intensity')).toBe(1.0);
  });

  it('getEffectNames returns sorted names', () => {
    stack.addEffect('bloom', 2, identity);
    stack.addEffect('tonemap', 1, identity);
    expect(stack.getEffectNames()).toEqual(['tonemap', 'bloom']);
  });

  it('getActiveCount excludes disabled', () => {
    const e = stack.addEffect('a', 0, identity);
    stack.addEffect('b', 1, identity);
    stack.setEnabled(e.id, false);
    expect(stack.getActiveCount()).toBe(1);
  });
});
