import { describe, it, expect, vi, beforeEach } from 'vitest';
import { I18nManager } from '../I18nManager';

describe('I18nManager', () => {
  let i18n: I18nManager;

  beforeEach(() => {
    i18n = new I18nManager();
    i18n.addTable('en', { greeting: 'Hello', farewell: 'Goodbye', welcome: 'Welcome, {{name}}!' });
    i18n.addTable('es', { greeting: 'Hola', farewell: 'Adiós' });
  });

  // ---------------------------------------------------------------------------
  // Locale Management
  // ---------------------------------------------------------------------------

  it('defaults to en locale', () => {
    expect(i18n.getLocale()).toBe('en');
  });

  it('setLocale changes current locale', () => {
    i18n.setLocale('es');
    expect(i18n.getLocale()).toBe('es');
  });

  it('onLocaleChange fires when locale changes', () => {
    const cb = vi.fn();
    i18n.onLocaleChange(cb);
    i18n.setLocale('es');
    expect(cb).toHaveBeenCalledWith('es');
  });

  it('getAvailableLocales returns registered locales', () => {
    expect(i18n.getAvailableLocales()).toEqual(expect.arrayContaining(['en', 'es']));
  });

  // ---------------------------------------------------------------------------
  // Translation
  // ---------------------------------------------------------------------------

  it('t returns translated string', () => {
    expect(i18n.t('greeting')).toBe('Hello');
  });

  it('t returns translated string for other locale', () => {
    i18n.setLocale('es');
    expect(i18n.t('greeting')).toBe('Hola');
  });

  it('t falls back to fallback locale', () => {
    i18n.setLocale('es');
    // 'welcome' only in 'en'
    expect(i18n.t('welcome', { name: 'World' })).toBe('Welcome, World!');
  });

  it('t returns [key] for missing key', () => {
    expect(i18n.t('nonexistent')).toBe('[nonexistent]');
  });

  // ---------------------------------------------------------------------------
  // Interpolation
  // ---------------------------------------------------------------------------

  it('t interpolates parameters', () => {
    expect(i18n.t('welcome', { name: 'Alice' })).toBe('Welcome, Alice!');
  });

  it('t leaves unknown placeholders as-is', () => {
    i18n.addTable('en', { template: '{{a}} and {{b}}' });
    expect(i18n.t('template', { a: 'X' })).toBe('X and {{b}}');
  });

  // ---------------------------------------------------------------------------
  // Pluralization
  // ---------------------------------------------------------------------------

  it('t handles plural rules', () => {
    i18n.addTable('en', {
      items: { zero: 'No items', one: '1 item', other: '{{count}} items' },
    });
    expect(i18n.t('items', { count: 0 })).toBe('No items');
    expect(i18n.t('items', { count: 1 })).toBe('1 item');
    expect(i18n.t('items', { count: 5 })).toBe('5 items');
  });

  it('t handles few plural form', () => {
    i18n.addTable('en', {
      apples: { one: '1 apple', few: 'a few apples', other: 'many apples' },
    });
    expect(i18n.t('apples', { count: 3 })).toBe('a few apples');
  });

  // ---------------------------------------------------------------------------
  // Table / Key Checks
  // ---------------------------------------------------------------------------

  it('hasKey returns true for existing key', () => {
    expect(i18n.hasKey('greeting')).toBe(true);
  });

  it('hasKey returns false for missing key', () => {
    expect(i18n.hasKey('nope')).toBe(false);
  });

  it('hasKey checks specific locale', () => {
    expect(i18n.hasKey('welcome', 'es')).toBe(false);
    expect(i18n.hasKey('welcome', 'en')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Completion Rate
  // ---------------------------------------------------------------------------

  it('getCompletionRate measures translation coverage', () => {
    // en has 3 keys, es has 2 of them
    const rate = i18n.getCompletionRate('es');
    expect(rate).toBeCloseTo(2 / 3, 2);
  });

  it('getCompletionRate returns 0 for unknown locale', () => {
    expect(i18n.getCompletionRate('fr')).toBe(0);
  });
});
