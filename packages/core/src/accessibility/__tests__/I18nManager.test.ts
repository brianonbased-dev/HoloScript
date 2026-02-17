/**
 * I18nManager Unit Tests
 *
 * Tests locale management, string tables, translation with
 * interpolation, pluralization, fallback chains, and completion rate.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { I18nManager } from '../I18nManager';

describe('I18nManager', () => {
  let i18n: I18nManager;

  beforeEach(() => {
    i18n = new I18nManager();
    i18n.addTable('en', {
      greeting: 'Hello, {{name}}!',
      farewell: 'Goodbye',
      items: { one: '{{count}} item', other: '{{count}} items', zero: 'No items' },
    });
    i18n.addTable('es', {
      greeting: '¡Hola, {{name}}!',
      farewell: 'Adiós',
    });
  });

  describe('locale management', () => {
    it('should default to en', () => {
      expect(i18n.getLocale()).toBe('en');
    });

    it('should change locale', () => {
      i18n.setLocale('es');
      expect(i18n.getLocale()).toBe('es');
    });

    it('should notify listeners on locale change', () => {
      const cb = vi.fn();
      i18n.onLocaleChange(cb);
      i18n.setLocale('es');
      expect(cb).toHaveBeenCalledWith('es');
    });

    it('should list available locales', () => {
      expect(i18n.getAvailableLocales()).toContain('en');
      expect(i18n.getAvailableLocales()).toContain('es');
    });
  });

  describe('translation', () => {
    it('should translate a simple key', () => {
      expect(i18n.t('farewell')).toBe('Goodbye');
    });

    it('should interpolate parameters', () => {
      expect(i18n.t('greeting', { name: 'World' })).toBe('Hello, World!');
    });

    it('should use current locale', () => {
      i18n.setLocale('es');
      expect(i18n.t('farewell')).toBe('Adiós');
    });

    it('should fall back to fallback locale', () => {
      i18n.setLocale('es');
      // 'items' not in es → fall back to en
      expect(i18n.t('items', { count: 1 })).toBe('1 item');
    });

    it('should return bracketed key for missing translations', () => {
      expect(i18n.t('nonexistent')).toBe('[nonexistent]');
    });
  });

  describe('pluralization', () => {
    it('should select zero form', () => {
      expect(i18n.t('items', { count: 0 })).toBe('No items');
    });

    it('should select one form', () => {
      expect(i18n.t('items', { count: 1 })).toBe('1 item');
    });

    it('should select other form', () => {
      expect(i18n.t('items', { count: 5 })).toBe('5 items');
    });
  });

  describe('hasKey', () => {
    it('should return true for existing key in current locale', () => {
      expect(i18n.hasKey('greeting')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(i18n.hasKey('missing')).toBe(false);
    });

    it('should check specific locale', () => {
      expect(i18n.hasKey('greeting', 'es')).toBe(true);
      expect(i18n.hasKey('items', 'es')).toBe(false);
    });
  });

  describe('completion rate', () => {
    it('should calculate completion rate for partial locale', () => {
      // es has 2/3 keys from en
      const rate = i18n.getCompletionRate('es');
      expect(rate).toBeCloseTo(2 / 3, 1);
    });

    it('should return 0 for unknown locale', () => {
      expect(i18n.getCompletionRate('fr')).toBe(0);
    });

    it('should return 1 for fallback locale', () => {
      expect(i18n.getCompletionRate('en')).toBe(1);
    });
  });

  describe('fallback', () => {
    it('should allow changing fallback locale', () => {
      i18n.setFallback('es');
      i18n.setLocale('fr'); // fr has no table
      // Should fall back to es now
      expect(i18n.t('greeting', { name: 'Mundo' })).toBe('¡Hola, Mundo!');
    });
  });
});
