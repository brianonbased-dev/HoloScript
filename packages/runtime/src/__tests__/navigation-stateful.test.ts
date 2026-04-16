/**
 * Navigation Stateful Functions Tests
 *
 * Tests the stateful navigation API: navigate(), goBack(), goForward(),
 * getCurrentPath(), canGoBack(), canGoForward(), getHistory(), clearHistory(),
 * setNavigateCallback(), and onNavigate().
 *
 * The navigation module uses module-level state, so each test resets
 * history via clearHistory() and navigate() to a known starting point.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  navigate,
  goBack,
  goForward,
  getCurrentPath,
  canGoBack,
  canGoForward,
  getHistory,
  clearHistory,
  setNavigateCallback,
  onNavigate,
} from '../navigation';

// Reset navigation to a predictable state before every test.
// We navigate to '/' then clear so history = ['/'] and index = 0.
function resetNav() {
  // Provide a no-op callback so navigate() doesn't try to use window.history
  setNavigateCallback(() => {});
  navigate('/');
  clearHistory();
}

beforeEach(() => {
  resetNav();
});

// =============================================================================
// navigate() — basic routing
// =============================================================================

describe('navigate()', () => {
  it('changes getCurrentPath to the new path', () => {
    navigate('/about');
    expect(getCurrentPath()).toBe('/about');
  });

  it('appends to history by default', () => {
    navigate('/a');
    navigate('/b');
    const h = getHistory();
    expect(h).toContain('/a');
    expect(h).toContain('/b');
  });

  it('calls the registered navigate callback', () => {
    const cb = vi.fn();
    setNavigateCallback(cb);
    navigate('/page');
    expect(cb).toHaveBeenCalledWith('/page');
  });

  it('replace option replaces current history entry', () => {
    navigate('/original');
    navigate('/replaced', { replace: true });
    expect(getCurrentPath()).toBe('/replaced');
    // After replace the length should not have grown
    const h = getHistory();
    const originalCount = h.filter((p) => p === '/original').length;
    expect(originalCount).toBe(0);
  });

  it('navigating "back" triggers goBack behaviour', () => {
    navigate('/first');
    navigate('/second');
    navigate('back');
    expect(getCurrentPath()).toBe('/first');
  });

  it('navigating "forward" triggers goForward behaviour', () => {
    navigate('/first');
    navigate('/second');
    navigate('back');
    navigate('forward');
    expect(getCurrentPath()).toBe('/second');
  });
});

// =============================================================================
// goBack() / goForward()
// =============================================================================

describe('goBack()', () => {
  it('moves back one entry in history', () => {
    navigate('/step1');
    navigate('/step2');
    goBack();
    expect(getCurrentPath()).toBe('/step1');
  });

  it('does nothing when already at the start of history', () => {
    clearHistory(); // only '/' in history
    goBack();
    expect(getCurrentPath()).toBe('/');
  });

  it('allows goForward after going back', () => {
    navigate('/alpha');
    navigate('/beta');
    goBack();
    expect(canGoForward()).toBe(true);
  });
});

describe('goForward()', () => {
  it('moves forward one entry in history', () => {
    navigate('/x');
    navigate('/y');
    goBack();
    goForward();
    expect(getCurrentPath()).toBe('/y');
  });

  it('does nothing when already at the front of history', () => {
    navigate('/only');
    goForward(); // nothing to go forward to
    expect(getCurrentPath()).toBe('/only');
  });
});

// =============================================================================
// canGoBack() / canGoForward()
// =============================================================================

describe('canGoBack()', () => {
  it('returns false at the start of history', () => {
    expect(canGoBack()).toBe(false);
  });

  it('returns true after navigating away', () => {
    navigate('/somewhere');
    expect(canGoBack()).toBe(true);
  });

  it('returns false after going back to start', () => {
    navigate('/page');
    goBack();
    expect(canGoBack()).toBe(false);
  });
});

describe('canGoForward()', () => {
  it('returns false when at end of history', () => {
    navigate('/end');
    expect(canGoForward()).toBe(false);
  });

  it('returns true after going back', () => {
    navigate('/a');
    navigate('/b');
    goBack();
    expect(canGoForward()).toBe(true);
  });
});

// =============================================================================
// getHistory() / clearHistory()
// =============================================================================

describe('getHistory()', () => {
  it('returns an array', () => {
    expect(Array.isArray(getHistory())).toBe(true);
  });

  it('contains visited paths in order', () => {
    navigate('/one');
    navigate('/two');
    navigate('/three');
    const h = getHistory();
    expect(h.indexOf('/one')).toBeLessThan(h.indexOf('/two'));
    expect(h.indexOf('/two')).toBeLessThan(h.indexOf('/three'));
  });

  it('returns a copy, not a live reference', () => {
    const h1 = getHistory();
    navigate('/extra');
    const h2 = getHistory();
    expect(h1.length).toBeLessThan(h2.length);
  });

  it('truncates forward history when a new path is navigated', () => {
    navigate('/a');
    navigate('/b');
    goBack();
    navigate('/c'); // should discard '/b' from history
    expect(getHistory()).not.toContain('/b');
    expect(getHistory()).toContain('/c');
  });
});

describe('clearHistory()', () => {
  it('resets history to only the current path', () => {
    navigate('/long/path');
    navigate('/another');
    clearHistory();
    expect(getHistory()).toHaveLength(1);
  });

  it('preserves getCurrentPath after clear', () => {
    navigate('/keep-me');
    clearHistory();
    expect(getCurrentPath()).toBe('/keep-me');
  });

  it('canGoBack is false after clear', () => {
    navigate('/a');
    navigate('/b');
    clearHistory();
    expect(canGoBack()).toBe(false);
  });
});

// =============================================================================
// onNavigate()
// =============================================================================

describe('onNavigate()', () => {
  it('invokes the callback after a navigate() call', () => {
    const events: Array<{ from: string; to: string }> = [];
    const unsubscribe = onNavigate((e) => events.push(e));
    navigate('/target');
    unsubscribe();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].to).toBe('/target');
  });

  it('unsubscribe stops future events', () => {
    const events: Array<{ from: string; to: string }> = [];
    const unsubscribe = onNavigate((e) => events.push(e));
    navigate('/first');
    unsubscribe();
    navigate('/second');
    // Only the first navigation should have been recorded
    const secondEvents = events.filter((e) => e.to === '/second');
    expect(secondEvents).toHaveLength(0);
  });
});

// =============================================================================
// setNavigateCallback()
// =============================================================================

describe('setNavigateCallback()', () => {
  it('replaces the previous callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    setNavigateCallback(first);
    setNavigateCallback(second);
    navigate('/check');
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('/check');
  });
});
