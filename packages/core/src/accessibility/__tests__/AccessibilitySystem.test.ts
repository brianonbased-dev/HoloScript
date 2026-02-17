/**
 * AccessibilitySystem Unit Tests
 *
 * Tests configuration, font scaling, contrast modes,
 * screen reader queue, focus navigation, and input remapping.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccessibilitySystem, type FocusableElement } from '../AccessibilitySystem';

describe('AccessibilitySystem', () => {
  let a11y: AccessibilitySystem;

  beforeEach(() => {
    a11y = new AccessibilitySystem();
  });

  describe('configuration', () => {
    it('should have sensible defaults', () => {
      const cfg = a11y.getConfig();
      expect(cfg.fontScale).toBe(1.0);
      expect(cfg.contrastMode).toBe('normal');
      expect(cfg.reduceMotion).toBe(false);
      expect(cfg.screenReaderEnabled).toBe(false);
    });

    it('should update config partially', () => {
      a11y.setConfig({ fontScale: 2.0, reduceMotion: true });
      const cfg = a11y.getConfig();
      expect(cfg.fontScale).toBe(2.0);
      expect(cfg.reduceMotion).toBe(true);
      expect(cfg.contrastMode).toBe('normal'); // unchanged
    });

    it('should notify listeners on config change', () => {
      const listener = vi.fn();
      a11y.onConfigChange(listener);
      a11y.setConfig({ hapticFeedback: false });
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ hapticFeedback: false }));
    });
  });

  describe('font scaling', () => {
    it('should scale font size', () => {
      a11y.setFontScale(1.5);
      expect(a11y.scaledFontSize(16)).toBe(24);
    });

    it('should clamp font scale to min 0.5', () => {
      a11y.setFontScale(0.1);
      expect(a11y.getConfig().fontScale).toBe(0.5);
    });

    it('should clamp font scale to max 3.0', () => {
      a11y.setFontScale(5.0);
      expect(a11y.getConfig().fontScale).toBe(3.0);
    });
  });

  describe('contrast modes', () => {
    it('should return normal colors by default', () => {
      const colors = a11y.getContrastColors();
      expect(colors.bg).toBeDefined();
      expect(colors.fg).toBeDefined();
    });

    it('should return high-contrast colors', () => {
      a11y.setContrastMode('high');
      const colors = a11y.getContrastColors();
      expect(colors.bg).toBe('#000000');
      expect(colors.fg).toBe('#FFFFFF');
    });

    it('should support colorblind modes', () => {
      a11y.setContrastMode('deuteranopia');
      const colors = a11y.getContrastColors();
      expect(colors.accent).toBe('#4a9eff');
    });
  });

  describe('screen reader', () => {
    it('should not queue when disabled', () => {
      a11y.announce('hello');
      expect(a11y.flushAnnouncements()).toHaveLength(0);
    });

    it('should queue announcements when enabled', () => {
      a11y.setConfig({ screenReaderEnabled: true });
      a11y.announce('Navigation updated', 'polite');
      a11y.announce('Error!', 'assertive');

      const entries = a11y.flushAnnouncements();
      expect(entries).toHaveLength(2);
      expect(entries[0].text).toBe('Navigation updated');
      expect(entries[1].priority).toBe('assertive');
    });

    it('should clear queue on flush', () => {
      a11y.setConfig({ screenReaderEnabled: true });
      a11y.announce('test');
      a11y.flushAnnouncements();
      expect(a11y.flushAnnouncements()).toHaveLength(0);
    });
  });

  describe('focus navigation', () => {
    const elements: FocusableElement[] = [
      { id: 'btn1', label: 'Button 1', role: 'button', tabIndex: 0 },
      { id: 'btn2', label: 'Button 2', role: 'button', tabIndex: 1 },
      { id: 'input1', label: 'Input', role: 'input', tabIndex: 2 },
    ];

    beforeEach(() => {
      elements.forEach(el => a11y.registerFocusable(el));
    });

    it('should have no focus initially', () => {
      expect(a11y.getCurrentFocus()).toBeNull();
    });

    it('should focus next in tabIndex order', () => {
      const first = a11y.focusNext();
      expect(first?.id).toBe('btn1');
      const second = a11y.focusNext();
      expect(second?.id).toBe('btn2');
    });

    it('should wrap around', () => {
      a11y.focusNext(); // btn1
      a11y.focusNext(); // btn2
      a11y.focusNext(); // input1
      const wrapped = a11y.focusNext(); // back to btn1
      expect(wrapped?.id).toBe('btn1');
    });

    it('should focus previous', () => {
      a11y.focusNext(); // btn1
      a11y.focusNext(); // btn2
      const prev = a11y.focusPrevious(); // back to btn1
      expect(prev?.id).toBe('btn1');
    });

    it('should return null if no focusables', () => {
      const empty = new AccessibilitySystem();
      expect(empty.focusNext()).toBeNull();
      expect(empty.focusPrevious()).toBeNull();
    });
  });

  describe('input remapping', () => {
    it('should remap inputs', () => {
      a11y.remapInput('KeyW', 'ArrowUp');
      expect(a11y.resolveInput('KeyW')).toBe('ArrowUp');
    });

    it('should return original if not remapped', () => {
      expect(a11y.resolveInput('Space')).toBe('Space');
    });

    it('should expose remappings', () => {
      a11y.remapInput('KeyW', 'ArrowUp');
      expect(a11y.getRemappings().size).toBe(1);
    });

    it('should clear remappings', () => {
      a11y.remapInput('KeyW', 'ArrowUp');
      a11y.clearRemappings();
      expect(a11y.getRemappings().size).toBe(0);
    });
  });
});
