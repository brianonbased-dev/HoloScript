/**
 * Unit tests for animation-system — AUDIT-mode coverage
 *
 * Slice 6 per-tick lerp. State-container + callback + clock injection.
 * Composes with slice-1 easing. Tests fake the clock so loop behavior
 * is deterministic.
 *
 * **See**: packages/core/src/runtime/animation-system.ts (slice 6)
 */

import { describe, it, expect, vi } from 'vitest';
import { updateAnimations } from './animation-system';
import type { Animation } from '../types';

function makeAnim(overrides: Partial<Animation> = {}): Animation {
  return {
    target: 'obj',
    property: 'y',
    from: 0,
    to: 100,
    duration: 1000,
    startTime: 0,
    easing: 'linear',
    ...overrides,
  };
}

describe('updateAnimations — basic lerp', () => {
  it('at t=0 the value equals `from`', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ startTime: 0 }));
    const set = vi.fn();
    updateAnimations(anims, set, 0);
    expect(set).toHaveBeenCalledWith('obj.y', 0);
  });

  it('at t=duration/2 the value is halfway', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ from: 0, to: 100, duration: 1000, startTime: 0 }));
    const set = vi.fn();
    updateAnimations(anims, set, 500);
    expect(set).toHaveBeenCalledWith('obj.y', 50);
  });

  it('at t=duration the value equals `to`', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ from: 0, to: 100, duration: 1000, startTime: 0 }));
    const set = vi.fn();
    updateAnimations(anims, set, 1000);
    expect(set).toHaveBeenCalledWith('obj.y', 100);
  });

  it('beyond duration the value caps at `to` (progress clamped to 1)', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ from: 0, to: 100, duration: 1000, startTime: 0 }));
    const set = vi.fn();
    updateAnimations(anims, set, 5000);
    expect(set).toHaveBeenCalledWith('obj.y', 100);
  });
});

describe('updateAnimations — setVariable key shape', () => {
  it('emits target.property composite key', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ target: 'hero', property: 'scale.x' }));
    const set = vi.fn();
    updateAnimations(anims, set, 0);
    expect(set.mock.calls[0][0]).toBe('hero.scale.x');
  });
});

describe('updateAnimations — completion', () => {
  it('non-loop non-yoyo animation is deleted from map at completion', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ duration: 100, startTime: 0, loop: false, yoyo: false }));
    const set = vi.fn();
    updateAnimations(anims, set, 200);
    expect(anims.has('a')).toBe(false);
  });

  it('loop: resets startTime at completion (entry stays in map)', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ duration: 100, startTime: 0, loop: true }));
    const set = vi.fn();
    updateAnimations(anims, set, 150);
    expect(anims.has('a')).toBe(true);
    expect(anims.get('a')!.startTime).toBe(150); // reset to current time
  });

  it('incomplete animation (progress < 1) is NOT deleted', () => {
    const anims = new Map<string, Animation>();
    const anim = makeAnim({ duration: 1000, startTime: 0 });
    anims.set('a', anim);
    const set = vi.fn();
    updateAnimations(anims, set, 500);
    expect(anims.has('a')).toBe(true);
  });
});

describe('updateAnimations — yoyo', () => {
  it('yoyo swaps from/to at progress≥1 and resets startTime', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ from: 0, to: 100, duration: 100, startTime: 0, yoyo: true }));
    const set = vi.fn();
    updateAnimations(anims, set, 150);
    const a = anims.get('a')!;
    // from and to have been swapped
    expect(a.from).toBe(100);
    expect(a.to).toBe(0);
    expect(a.startTime).toBe(150);
  });

  it('yoyo animation is NOT deleted (animation continues reversed)', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ duration: 100, startTime: 0, yoyo: true, loop: false }));
    updateAnimations(anims, vi.fn(), 200);
    expect(anims.has('a')).toBe(true);
  });
});

describe('updateAnimations — multiple animations in one tick', () => {
  it('processes all entries sequentially', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({ target: 'a', startTime: 0, duration: 1000 }));
    anims.set('b', makeAnim({ target: 'b', startTime: 0, duration: 2000 }));
    const set = vi.fn();
    updateAnimations(anims, set, 500);
    expect(set).toHaveBeenCalledTimes(2);
    expect(set).toHaveBeenCalledWith('a.y', 50); // 50% through
    expect(set).toHaveBeenCalledWith('b.y', 25); // 25% through
  });

  it('empty map is a no-op', () => {
    const anims = new Map<string, Animation>();
    const set = vi.fn();
    expect(() => updateAnimations(anims, set, 0)).not.toThrow();
    expect(set).not.toHaveBeenCalled();
  });
});

describe('updateAnimations — easing integration (composes with slice 1)', () => {
  it('easeIn at t=0.5 gives 0.25 progress → value is 25 for from=0 to=100', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({
      from: 0, to: 100, duration: 1000, startTime: 0, easing: 'easeIn',
    }));
    const set = vi.fn();
    updateAnimations(anims, set, 500);
    // applyEasing(0.5, 'easeIn') = 0.25 → value = 0 + (100-0)*0.25 = 25
    expect(set).toHaveBeenCalledWith('obj.y', 25);
  });

  it('unknown easing falls back to linear', () => {
    const anims = new Map<string, Animation>();
    anims.set('a', makeAnim({
      from: 0, to: 100, duration: 1000, startTime: 0, easing: 'unknown',
    }));
    const set = vi.fn();
    updateAnimations(anims, set, 500);
    expect(set).toHaveBeenCalledWith('obj.y', 50);
  });
});
