import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessibilitySystem } from '../AccessibilitySystem';

describe('AccessibilitySystem', () => {
  let a11y: AccessibilitySystem;

  beforeEach(() => { a11y = new AccessibilitySystem(); });

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  it('getConfig returns defaults', () => {
    const cfg = a11y.getConfig();
    expect(cfg.fontScale).toBe(1.0);
    expect(cfg.contrastMode).toBe('normal');
    expect(cfg.reduceMotion).toBe(false);
  });

  it('setConfig merges partial config', () => {
    a11y.setConfig({ reduceMotion: true });
    expect(a11y.getConfig().reduceMotion).toBe(true);
    expect(a11y.getConfig().fontScale).toBe(1.0); // unchanged
  });

  it('onConfigChange listener fires', () => {
    const cb = vi.fn();
    a11y.onConfigChange(cb);
    a11y.setConfig({ fontScale: 2.0 });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].fontScale).toBe(2.0);
  });

  // ---------------------------------------------------------------------------
  // Font Scaling
  // ---------------------------------------------------------------------------

  it('setFontScale clamps to [0.5, 3.0]', () => {
    a11y.setFontScale(0.1);
    expect(a11y.getConfig().fontScale).toBe(0.5);
    a11y.setFontScale(5);
    expect(a11y.getConfig().fontScale).toBe(3.0);
  });

  it('scaledFontSize applies scale', () => {
    a11y.setFontScale(2.0);
    expect(a11y.scaledFontSize(16)).toBe(32);
  });

  // ---------------------------------------------------------------------------
  // Contrast
  // ---------------------------------------------------------------------------

  it('getContrastColors returns different colors per mode', () => {
    a11y.setContrastMode('normal');
    const normal = a11y.getContrastColors();
    a11y.setContrastMode('high');
    const high = a11y.getContrastColors();
    expect(high.bg).not.toBe(normal.bg);
  });

  it('getContrastColors covers all modes', () => {
    for (const mode of ['normal', 'high', 'inverted', 'deuteranopia', 'protanopia', 'tritanopia'] as const) {
      a11y.setContrastMode(mode);
      const colors = a11y.getContrastColors();
      expect(colors.bg).toBeDefined();
      expect(colors.fg).toBeDefined();
      expect(colors.accent).toBeDefined();
    }
  });

  // ---------------------------------------------------------------------------
  // Screen Reader
  // ---------------------------------------------------------------------------

  it('announce queues entries when enabled', () => {
    a11y.setConfig({ screenReaderEnabled: true });
    a11y.announce('Hello');
    a11y.announce('Alert!', 'assertive');
    const entries = a11y.flushAnnouncements();
    expect(entries).toHaveLength(2);
    expect(entries[0].text).toBe('Hello');
    expect(entries[1].priority).toBe('assertive');
  });

  it('announce does nothing when disabled', () => {
    a11y.announce('Ignored');
    expect(a11y.flushAnnouncements()).toHaveLength(0);
  });

  it('flushAnnouncements clears queue', () => {
    a11y.setConfig({ screenReaderEnabled: true });
    a11y.announce('A');
    a11y.flushAnnouncements();
    expect(a11y.flushAnnouncements()).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Focus Management
  // ---------------------------------------------------------------------------

  it('focusNext cycles through focusables', () => {
    a11y.registerFocusable({ id: 'btn1', label: 'OK', role: 'button', tabIndex: 1 });
    a11y.registerFocusable({ id: 'btn2', label: 'Cancel', role: 'button', tabIndex: 2 });
    expect(a11y.focusNext()!.id).toBe('btn1');
    expect(a11y.focusNext()!.id).toBe('btn2');
    expect(a11y.focusNext()!.id).toBe('btn1'); // wraps
  });

  it('focusPrevious goes backwards', () => {
    a11y.registerFocusable({ id: 'a', label: 'A', role: 'button', tabIndex: 1 });
    a11y.registerFocusable({ id: 'b', label: 'B', role: 'button', tabIndex: 2 });
    a11y.focusNext(); // focus 'a'
    const prev = a11y.focusPrevious(); // wraps to 'b'
    expect(prev!.id).toBe('b');
  });

  it('getCurrentFocus is null when no focus set', () => {
    expect(a11y.getCurrentFocus()).toBeNull();
  });

  it('registerFocusable sorts by tabIndex', () => {
    a11y.registerFocusable({ id: 'c', label: 'C', role: 'button', tabIndex: 3 });
    a11y.registerFocusable({ id: 'a', label: 'A', role: 'button', tabIndex: 1 });
    expect(a11y.focusNext()!.id).toBe('a');
  });

  // ---------------------------------------------------------------------------
  // Input Remapping
  // ---------------------------------------------------------------------------

  it('remapInput and resolveInput work', () => {
    a11y.remapInput('Space', 'Enter');
    expect(a11y.resolveInput('Space')).toBe('Enter');
    expect(a11y.resolveInput('Escape')).toBe('Escape'); // unmapped
  });

  it('getRemappings returns copy', () => {
    a11y.remapInput('A', 'B');
    const mappings = a11y.getRemappings();
    expect(mappings.get('A')).toBe('B');
    expect(mappings.size).toBe(1);
  });

  it('clearRemappings empties all', () => {
    a11y.remapInput('A', 'B');
    a11y.clearRemappings();
    expect(a11y.getRemappings().size).toBe(0);
  });
});
