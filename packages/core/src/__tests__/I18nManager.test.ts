import { describe, it, expect, beforeEach } from 'vitest';
import { I18nManager } from '../accessibility/I18nManager';

describe('I18nManager', () => {
  let i18n: I18nManager;

  beforeEach(() => {
    i18n = new I18nManager();
    i18n.addTable('en', { greeting: 'Hello {{name}}', farewell: 'Goodbye' });
    i18n.addTable('es', { greeting: 'Hola {{name}}' });
  });

  it('translates simple key', () => {
    expect(i18n.t('farewell')).toBe('Goodbye');
  });

  it('interpolates parameters', () => {
    expect(i18n.t('greeting', { name: 'World' })).toBe('Hello World');
  });

  it('falls back to fallback locale', () => {
    i18n.setLocale('es');
    expect(i18n.t('farewell')).toBe('Goodbye'); // not in es, falls to en
  });

  it('returns bracketed key for missing translations', () => {
    expect(i18n.t('unknown_key')).toBe('[unknown_key]');
  });

  it('locale change sets and gets', () => {
    i18n.setLocale('es');
    expect(i18n.getLocale()).toBe('es');
    expect(i18n.t('greeting', { name: 'Mundo' })).toBe('Hola Mundo');
  });

  it('pluralization selects correct form', () => {
    i18n.addTable('en', {
      items: { zero: 'No items', one: '{{count}} item', other: '{{count}} items' },
    });
    expect(i18n.t('items', { count: 0 })).toBe('No items');
    expect(i18n.t('items', { count: 1 })).toBe('1 item');
    expect(i18n.t('items', { count: 5 })).toBe('5 items');
  });

  it('few plural form for 2-4', () => {
    i18n.addTable('en', {
      apples: { one: '1 apple', few: '{{count}} apples (few)', other: '{{count}} apples' },
    });
    expect(i18n.t('apples', { count: 3 })).toBe('3 apples (few)');
  });

  it('hasKey checks presence', () => {
    expect(i18n.hasKey('greeting')).toBe(true);
    expect(i18n.hasKey('nope')).toBe(false);
    expect(i18n.hasKey('greeting', 'es')).toBe(true);
  });

  it('getAvailableLocales lists added locales', () => {
    const locales = i18n.getAvailableLocales();
    expect(locales).toContain('en');
    expect(locales).toContain('es');
  });

  it('getCompletionRate measures translation coverage', () => {
    // es has 1 of 2 en keys
    const rate = i18n.getCompletionRate('es');
    expect(rate).toBeCloseTo(0.5);
  });

  it('onLocaleChange listener fires', () => {
    let newLocale = '';
    i18n.onLocaleChange((l) => {
      newLocale = l;
    });
    i18n.setLocale('fr');
    expect(newLocale).toBe('fr');
  });
});
