/**
 * AccessibilitySystem — Production Test Suite
 *
 * Covers: config, font scaling, contrast modes, screen reader announce/flush,
 * focus management (register/next/previous/current), input remapping.
 */
import { describe, it, expect, vi } from 'vitest';
import { AccessibilitySystem } from '../AccessibilitySystem';

describe('AccessibilitySystem — Production', () => {
  // ─── Config ───────────────────────────────────────────────────────
  it('getConfig returns defaults', () => {
    const a = new AccessibilitySystem();
    const c = a.getConfig();
    expect(c.fontScale).toBe(1.0);
    expect(c.contrastMode).toBe('normal');
    expect(c.reduceMotion).toBe(false);
  });

  it('setConfig merges partial config', () => {
    const a = new AccessibilitySystem();
    a.setConfig({ reduceMotion: true, cursorSize: 3 });
    expect(a.getConfig().reduceMotion).toBe(true);
    expect(a.getConfig().cursorSize).toBe(3);
  });

  it('onConfigChange fires on setConfig', () => {
    const a = new AccessibilitySystem();
    const cb = vi.fn();
    a.onConfigChange(cb);
    a.setConfig({ fontScale: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  // ─── Font Scaling ─────────────────────────────────────────────────
  it('setFontScale clamps to 0.5-3.0', () => {
    const a = new AccessibilitySystem();
    a.setFontScale(0.1);
    expect(a.getConfig().fontScale).toBe(0.5);
    a.setFontScale(10);
    expect(a.getConfig().fontScale).toBe(3.0);
  });

  it('scaledFontSize applies font scale', () => {
    const a = new AccessibilitySystem();
    a.setFontScale(2);
    expect(a.scaledFontSize(16)).toBe(32);
  });

  // ─── Contrast ─────────────────────────────────────────────────────
  it('getContrastColors returns mode-specific colors', () => {
    const a = new AccessibilitySystem();
    a.setContrastMode('high');
    expect(a.getContrastColors().bg).toBe('#000000');
    expect(a.getContrastColors().fg).toBe('#FFFFFF');
  });

  it('getContrastColors handles all modes', () => {
    const a = new AccessibilitySystem();
    for (const mode of [
      'normal',
      'high',
      'inverted',
      'deuteranopia',
      'protanopia',
      'tritanopia',
    ] as const) {
      a.setContrastMode(mode);
      const c = a.getContrastColors();
      expect(c.bg).toBeTruthy();
      expect(c.fg).toBeTruthy();
      expect(c.accent).toBeTruthy();
    }
  });

  // ─── Screen Reader ────────────────────────────────────────────────
  it('announce queues entries only when enabled', () => {
    const a = new AccessibilitySystem();
    a.announce('test');
    expect(a.flushAnnouncements().length).toBe(0); // disabled by default
    a.setConfig({ screenReaderEnabled: true });
    a.announce('hello', 'assertive');
    const entries = a.flushAnnouncements();
    expect(entries.length).toBe(1);
    expect(entries[0].text).toBe('hello');
    expect(entries[0].priority).toBe('assertive');
  });

  it('flushAnnouncements clears queue', () => {
    const a = new AccessibilitySystem();
    a.setConfig({ screenReaderEnabled: true });
    a.announce('x');
    a.flushAnnouncements();
    expect(a.flushAnnouncements().length).toBe(0);
  });

  // ─── Focus Management ─────────────────────────────────────────────
  it('focusNext cycles through focusables sorted by tabIndex', () => {
    const a = new AccessibilitySystem();
    a.registerFocusable({ id: 'b', label: 'B', role: 'button', tabIndex: 2 });
    a.registerFocusable({ id: 'a', label: 'A', role: 'button', tabIndex: 1 });
    const f1 = a.focusNext();
    expect(f1!.id).toBe('a');
    const f2 = a.focusNext();
    expect(f2!.id).toBe('b');
  });

  it('focusPrevious wraps around', () => {
    const a = new AccessibilitySystem();
    a.registerFocusable({ id: 'a', label: 'A', role: 'button', tabIndex: 1 });
    a.registerFocusable({ id: 'b', label: 'B', role: 'button', tabIndex: 2 });
    a.focusNext(); // advance to index 0 ('a')
    const fp = a.focusPrevious(); // wraps to index 1 ('b')
    expect(fp!.id).toBe('b');
  });

  it('getCurrentFocus returns null initially', () => {
    const a = new AccessibilitySystem();
    expect(a.getCurrentFocus()).toBeNull();
  });

  // ─── Input Remapping ──────────────────────────────────────────────
  it('remapInput and resolveInput work', () => {
    const a = new AccessibilitySystem();
    a.remapInput('Space', 'Enter');
    expect(a.resolveInput('Space')).toBe('Enter');
    expect(a.resolveInput('A')).toBe('A'); // unmapped
  });

  it('clearRemappings removes all', () => {
    const a = new AccessibilitySystem();
    a.remapInput('X', 'Y');
    a.clearRemappings();
    expect(a.getRemappings().size).toBe(0);
  });
});
