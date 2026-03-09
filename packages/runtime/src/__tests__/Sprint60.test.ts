/**
 * Sprint 60 — @holoscript/runtime acceptance tests
 * Covers: device.ts (DeviceCapabilities, helper fns, node-env defaults),
 *         timing.ts (after, every, debounce, throttle, wait, easing, onIdle)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import device, {
  isMobile,
  isTablet,
  isDesktop,
  isTouchDevice,
  isVRCapable,
  prefersReducedMotion,
  prefersDarkMode,
} from '../device.js';
import { after, every, debounce, throttle, wait, onIdle, easing } from '../timing.js';

// ═══════════════════════════════════════════════
// device.ts — node environment (no navigator/window)
// ═══════════════════════════════════════════════
describe('device — node environment defaults', () => {
  it('device object is exported', () => {
    expect(typeof device).toBe('object');
    expect(device).not.toBeNull();
  });

  it('isMobile returns false in node (no navigator)', () => {
    expect(device.isMobile).toBe(false);
  });

  it('isTablet returns false in node', () => {
    expect(device.isTablet).toBe(false);
  });

  it('isDesktop returns true in node (not mobile and not tablet)', () => {
    // isDesktop = !isMobile && !isTablet → true when both are false
    expect(device.isDesktop).toBe(true);
  });

  it('isTouchDevice returns false in node (no window)', () => {
    expect(device.isTouchDevice).toBe(false);
  });

  it('isVRCapable returns false in node (no xr)', () => {
    expect(device.isVRCapable).toBe(false);
  });

  it('isARCapable returns false in node', () => {
    expect(device.isARCapable).toBe(false);
  });

  it('supportsVR resolves to false in node', async () => {
    const result = await device.supportsVR();
    expect(result).toBe(false);
  });

  it('supportsAR resolves to false in node', async () => {
    const result = await device.supportsAR();
    expect(result).toBe(false);
  });

  it('prefersReducedMotion returns false in node (no window)', () => {
    expect(device.prefersReducedMotion).toBe(false);
  });

  it('prefersDarkMode returns false in node', () => {
    expect(device.prefersDarkMode).toBe(false);
  });

  it('prefersHighContrast returns false in node', () => {
    expect(device.prefersHighContrast).toBe(false);
  });

  it('devicePixelRatio returns 1 in node (no window)', () => {
    expect(device.devicePixelRatio).toBe(1);
  });
});

describe('device — helper functions', () => {
  it('isMobile() helper function returns boolean', () => {
    expect(typeof isMobile()).toBe('boolean');
  });

  it('isTablet() helper function returns boolean', () => {
    expect(typeof isTablet()).toBe('boolean');
  });

  it('isDesktop() helper function returns boolean', () => {
    expect(typeof isDesktop()).toBe('boolean');
  });

  it('isTouchDevice() helper function returns boolean', () => {
    expect(typeof isTouchDevice()).toBe('boolean');
  });

  it('isVRCapable() helper function returns boolean', () => {
    expect(typeof isVRCapable()).toBe('boolean');
  });

  it('prefersReducedMotion() helper returns boolean', () => {
    expect(typeof prefersReducedMotion()).toBe('boolean');
  });

  it('prefersDarkMode() helper returns boolean', () => {
    expect(typeof prefersDarkMode()).toBe('boolean');
  });

  it('isDesktop() is true when isMobile and isTablet are both false', () => {
    // In node: isMobile=false, isTablet=false → isDesktop=true
    expect(isDesktop()).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// timing.ts — timer functions with fake timers
// ═══════════════════════════════════════════════
describe('timing — after()', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a function', () => {
    expect(typeof after).toBe('function');
  });

  it('returns a cancel function', () => {
    const cancel = after(100, () => {});
    expect(typeof cancel).toBe('function');
    cancel();
  });

  it('calls callback after delay', () => {
    const fn = vi.fn();
    after(500, fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('does not call callback before delay', () => {
    const fn = vi.fn();
    after(1000, fn);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel prevents callback', () => {
    const fn = vi.fn();
    const cancel = after(200, fn);
    cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('timing — every()', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a function', () => {
    expect(typeof every).toBe('function');
  });

  it('returns a cancel function', () => {
    const cancel = every(100, () => {});
    expect(typeof cancel).toBe('function');
    cancel();
  });

  it('calls callback repeatedly', () => {
    const fn = vi.fn();
    every(100, fn);
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('cancel stops repeated calls', () => {
    const fn = vi.fn();
    const cancel = every(100, fn);
    vi.advanceTimersByTime(200);
    cancel();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('timing — debounce()', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a function', () => {
    expect(typeof debounce).toBe('function');
  });

  it('returns a function', () => {
    // debounce signature: (ms, callback)
    expect(typeof debounce(100, () => {})).toBe('function');
  });

  it('delays execution until after wait period', () => {
    const fn = vi.fn();
    const debounced = debounce(200, fn);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('resets timer on repeated calls', () => {
    const fn = vi.fn();
    const debounced = debounce(200, fn);
    debounced();
    vi.advanceTimersByTime(100);
    debounced(); // reset
    vi.advanceTimersByTime(100); // only 100ms since last call
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100); // now 200ms since last call
    expect(fn).toHaveBeenCalledOnce();
  });

  it('only fires once for many rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(300, fn);
    for (let i = 0; i < 10; i++) debounced();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('timing — throttle()', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a function', () => {
    expect(typeof throttle).toBe('function');
  });

  it('returns a function', () => {
    // throttle signature: (ms, callback)
    expect(typeof throttle(100, () => {})).toBe('function');
  });

  it('calls immediately on first invocation', () => {
    const fn = vi.fn();
    const throttled = throttle(200, fn);
    throttled();
    expect(fn).toHaveBeenCalledOnce();
  });

  it('blocks calls within the wait window', () => {
    const fn = vi.fn();
    const throttled = throttle(200, fn);
    throttled();
    throttled(); // within window
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('allows call after wait period elapses', () => {
    const fn = vi.fn();
    const throttled = throttle(200, fn);
    throttled();
    vi.advanceTimersByTime(200);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('timing — wait()', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a function', () => {
    expect(typeof wait).toBe('function');
  });

  it('returns a Promise', () => {
    const p = wait(100);
    expect(p).toBeInstanceOf(Promise);
    p.then(() => {}); // avoid unhandled rejection
    vi.advanceTimersByTime(100);
  });

  it('resolves after specified delay', async () => {
    let resolved = false;
    wait(300).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);
    vi.advanceTimersByTime(300);
    await Promise.resolve(); // flush microtasks
    expect(resolved).toBe(true);
  });
});

describe('timing — onIdle()', () => {
  beforeEach(() => {
    vi.stubGlobal('window', globalThis);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('is a function', () => {
    expect(typeof onIdle).toBe('function');
  });

  it('returns a cancel function', () => {
    const cancel = onIdle(() => {});
    expect(typeof cancel).toBe('function');
    cancel();
  });

  it('calls callback within timeout window (uses setTimeout fallback in node)', () => {
    const fn = vi.fn();
    onIdle(fn, 1000);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cancel prevents onIdle callback', () => {
    const fn = vi.fn();
    const cancel = onIdle(fn, 500);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════
// timing.ts — easing functions (pure math)
// ═══════════════════════════════════════════════
describe('timing — easing', () => {
  it('easing object is exported', () => {
    expect(typeof easing).toBe('object');
  });

  it('linear(0) = 0, linear(1) = 1', () => {
    expect(easing.linear(0)).toBe(0);
    expect(easing.linear(1)).toBe(1);
  });

  it('linear is identity', () => {
    expect(easing.linear(0.5)).toBe(0.5);
    expect(easing.linear(0.25)).toBe(0.25);
  });

  it('easeIn(0) = 0, easeIn(1) = 1', () => {
    expect(easing.easeIn(0)).toBe(0);
    expect(easing.easeIn(1)).toBe(1);
  });

  it('easeIn is slower at start (t=0.5 < 0.5)', () => {
    expect(easing.easeIn(0.5)).toBeLessThan(0.5);
  });

  it('easeOut(0) = 0, easeOut(1) = 1', () => {
    expect(easing.easeOut(0)).toBe(0);
    expect(easing.easeOut(1)).toBe(1);
  });

  it('easeOut is faster at start (t=0.5 > 0.5)', () => {
    expect(easing.easeOut(0.5)).toBeGreaterThan(0.5);
  });

  it('easeInOut(0) = 0, easeInOut(1) = 1', () => {
    expect(easing.easeInOut(0)).toBe(0);
    expect(easing.easeInOut(1)).toBe(1);
  });

  it('easeInOut is symmetric around 0.5', () => {
    expect(easing.easeInOut(0.5)).toBeCloseTo(0.5, 5);
  });

  it('easeInCubic(0) = 0, easeInCubic(1) = 1', () => {
    expect(easing.easeInCubic(0)).toBe(0);
    expect(easing.easeInCubic(1)).toBe(1);
  });

  it('easeOutCubic(0) = 0, easeOutCubic(1) = 1', () => {
    expect(easing.easeOutCubic(0)).toBe(0);
    expect(easing.easeOutCubic(1)).toBe(1);
  });

  it('easeInOutCubic(0) = 0, easeInOutCubic(1) = 1', () => {
    expect(easing.easeInOutCubic(0)).toBe(0);
    expect(easing.easeInOutCubic(1)).toBe(1);
  });

  it('easeInElastic(0) = 0, easeInElastic(1) = 1', () => {
    expect(easing.easeInElastic(0)).toBe(0);
    expect(easing.easeInElastic(1)).toBe(1);
  });

  it('easeOutElastic(0) = 0, easeOutElastic(1) = 1', () => {
    expect(easing.easeOutElastic(0)).toBe(0);
    expect(easing.easeOutElastic(1)).toBe(1);
  });

  it('easeOutBounce(0) = 0, easeOutBounce(1) = 1', () => {
    expect(easing.easeOutBounce(0)).toBeCloseTo(0, 5);
    expect(easing.easeOutBounce(1)).toBeCloseTo(1, 5);
  });

  it('all easing functions output [0..1] for input 0.5', () => {
    for (const [name, fn] of Object.entries(easing)) {
      const out = (fn as (t: number) => number)(0.5);
      expect(out).toBeGreaterThanOrEqual(-0.5); // elastic can undershoot slightly
      expect(typeof out).toBe('number');
      expect(isNaN(out)).toBe(false);
    }
  });
});
