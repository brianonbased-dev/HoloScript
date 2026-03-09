import { describe, it, expect } from 'vitest';
import { I18nManager } from '../accessibility/I18nManager';
import { AccessibilitySystem } from '../accessibility/AccessibilitySystem';
import { SubtitleRenderer } from '../accessibility/SubtitleRenderer';

describe('Cycle 145: Localization & Accessibility', () => {
  // -------------------------------------------------------------------------
  // I18nManager
  // -------------------------------------------------------------------------

  it('should translate with interpolation and fallback', () => {
    const i18n = new I18nManager();
    i18n.addTable('en', {
      greeting: 'Hello, {{name}}!',
      farewell: 'Goodbye!',
    });
    i18n.addTable('es', {
      greeting: '¡Hola, {{name}}!',
    });

    i18n.setLocale('es');
    expect(i18n.t('greeting', { name: 'Alex' })).toBe('¡Hola, Alex!');

    // Fallback to English
    expect(i18n.t('farewell')).toBe('Goodbye!');

    // Missing key
    expect(i18n.t('unknown')).toBe('[unknown]');
  });

  it('should handle pluralization', () => {
    const i18n = new I18nManager();
    i18n.addTable('en', {
      items: { zero: 'No items', one: '1 item', other: '{{count}} items' },
    });

    expect(i18n.t('items', { count: 0 })).toBe('No items');
    expect(i18n.t('items', { count: 1 })).toBe('1 item');
    expect(i18n.t('items', { count: 5 })).toBe('5 items');
  });

  it('should track completion rate', () => {
    const i18n = new I18nManager();
    i18n.addTable('en', { a: 'A', b: 'B', c: 'C', d: 'D' });
    i18n.addTable('fr', { a: 'A', b: 'B' }); // 50% complete

    expect(i18n.getCompletionRate('fr')).toBeCloseTo(0.5, 1);
    expect(i18n.getCompletionRate('en')).toBe(1);
  });

  // -------------------------------------------------------------------------
  // AccessibilitySystem
  // -------------------------------------------------------------------------

  it('should scale fonts and provide contrast colors', () => {
    const a11y = new AccessibilitySystem();
    a11y.setFontScale(2.0);
    expect(a11y.scaledFontSize(16)).toBe(32);

    a11y.setContrastMode('high');
    const colors = a11y.getContrastColors();
    expect(colors.bg).toBe('#000000');
    expect(colors.fg).toBe('#FFFFFF');
  });

  it('should manage focus cycling and input remapping', () => {
    const a11y = new AccessibilitySystem();
    a11y.registerFocusable({ id: 'btn1', label: 'Start', role: 'button', tabIndex: 0 });
    a11y.registerFocusable({ id: 'btn2', label: 'Options', role: 'button', tabIndex: 1 });
    a11y.registerFocusable({ id: 'sld1', label: 'Volume', role: 'slider', tabIndex: 2 });

    const f1 = a11y.focusNext();
    expect(f1?.id).toBe('btn1');

    const f2 = a11y.focusNext();
    expect(f2?.id).toBe('btn2');

    // Remapping
    a11y.remapInput('space', 'enter');
    expect(a11y.resolveInput('space')).toBe('enter');
    expect(a11y.resolveInput('escape')).toBe('escape'); // Unmapped passes through
  });

  it('should queue screen reader announcements', () => {
    const a11y = new AccessibilitySystem();
    a11y.setConfig({ screenReaderEnabled: true });

    a11y.announce('Button focused');
    a11y.announce('Critical error!', 'assertive');

    const entries = a11y.flushAnnouncements();
    expect(entries.length).toBe(2);
    expect(entries[1].priority).toBe('assertive');

    // After flush, queue is empty
    expect(a11y.flushAnnouncements().length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // SubtitleRenderer
  // -------------------------------------------------------------------------

  it('should display and expire subtitles', () => {
    const subs = new SubtitleRenderer();
    subs.add('Hello there.', 2, 'Narrator');
    subs.add('General Kenobi!', 2, 'Kenobi');

    const active1 = subs.update(0.1);
    expect(active1.length).toBe(2);
    expect(subs.getFormattedText(active1[0])).toBe('[Narrator] Hello there.');

    // Advance past duration
    subs.update(3);
    expect(subs.getActiveSubtitles().length).toBe(0);
    expect(subs.getHistory().length).toBe(2);
  });
});
