import { describe, it, expect, beforeEach } from 'vitest';
import { AccessibilitySystem } from '../accessibility/AccessibilitySystem';

describe('AccessibilitySystem', () => {
  let a11y: AccessibilitySystem;

  beforeEach(() => { a11y = new AccessibilitySystem(); });

  it('default config has fontScale 1', () => {
    expect(a11y.getConfig().fontScale).toBe(1);
  });

  it('setFontScale clamps to [0.5, 3.0]', () => {
    a11y.setFontScale(0.1);
    expect(a11y.getConfig().fontScale).toBe(0.5);
    a11y.setFontScale(5);
    expect(a11y.getConfig().fontScale).toBe(3);
  });

  it('scaledFontSize multiplies by fontScale', () => {
    a11y.setFontScale(2);
    expect(a11y.scaledFontSize(16)).toBe(32);
  });

  it('high contrast returns correct colors', () => {
    a11y.setContrastMode('high');
    const c = a11y.getContrastColors();
    expect(c.bg).toBe('#000000');
    expect(c.fg).toBe('#FFFFFF');
  });

  it('screen reader queues announcements when enabled', () => {
    a11y.setConfig({ screenReaderEnabled: true });
    a11y.announce('Hello');
    a11y.announce('World', 'assertive');
    const entries = a11y.flushAnnouncements();
    expect(entries.length).toBe(2);
    expect(entries[1].priority).toBe('assertive');
  });

  it('screen reader ignores announcements when disabled', () => {
    a11y.announce('ignored');
    expect(a11y.flushAnnouncements().length).toBe(0);
  });

  it('focus management cycles through elements', () => {
    a11y.registerFocusable({ id: 'a', label: 'A', role: 'button', tabIndex: 0 });
    a11y.registerFocusable({ id: 'b', label: 'B', role: 'button', tabIndex: 1 });
    expect(a11y.focusNext()?.id).toBe('a');
    expect(a11y.focusNext()?.id).toBe('b');
    expect(a11y.focusNext()?.id).toBe('a'); // wraps
  });

  it('focusPrevious wraps backwards', () => {
    a11y.registerFocusable({ id: 'a', label: 'A', role: 'button', tabIndex: 0 });
    a11y.registerFocusable({ id: 'b', label: 'B', role: 'button', tabIndex: 1 });
    const prev = a11y.focusPrevious();
    // From initial index -1: (-1-1+2)%2 = 0 → first element 'a'
    expect(prev?.id).toBe('a');
  });

  it('input remapping maps keys', () => {
    a11y.remapInput('W', 'Up');
    expect(a11y.resolveInput('W')).toBe('Up');
    expect(a11y.resolveInput('X')).toBe('X'); // unmapped
  });

  it('clearRemappings removes all remaps', () => {
    a11y.remapInput('W', 'Up');
    a11y.clearRemappings();
    expect(a11y.getRemappings().size).toBe(0);
  });

  it('onConfigChange listener fires', () => {
    let fired = false;
    a11y.onConfigChange(() => { fired = true; });
    a11y.setConfig({ reduceMotion: true });
    expect(fired).toBe(true);
  });
});
