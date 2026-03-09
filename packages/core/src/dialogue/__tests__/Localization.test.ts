import { describe, it, expect, beforeEach } from 'vitest';
import { Localization } from '../Localization';

describe('Localization', () => {
  let loc: Localization;

  beforeEach(() => {
    loc = new Localization();
    loc.addLocale('en', { greeting: 'Hello, {name}!', farewell: 'Goodbye!' });
    loc.addLocale('es', { greeting: '¡Hola, {name}!' });
    loc.setLocale('en');
  });

  it('t returns translated string', () => {
    expect(loc.t('greeting', { name: 'Player' })).toBe('Hello, Player!');
  });

  it('t interpolates multiple params', () => {
    loc.addLocale('en', { msg: '{a} and {b}' });
    expect(loc.t('msg', { a: 'X', b: 'Y' })).toBe('X and Y');
  });

  it('t falls back to fallback locale', () => {
    loc.setLocale('es');
    // 'farewell' not in 'es', falls back to 'en'
    expect(loc.t('farewell')).toBe('Goodbye!');
  });

  it('t returns bracketed key for missing', () => {
    expect(loc.t('nonexistent')).toBe('[nonexistent]');
  });

  it('missing keys are tracked', () => {
    loc.t('missing1');
    loc.t('missing2');
    expect(loc.getMissingKeys()).toContain('missing1');
    expect(loc.getMissingKeys().length).toBe(2);
  });

  it('clearMissingKeys resets', () => {
    loc.t('nope');
    loc.clearMissingKeys();
    expect(loc.getMissingKeys().length).toBe(0);
  });

  it('setLocale returns false if unknown', () => {
    expect(loc.setLocale('jp')).toBe(false);
    expect(loc.getCurrentLocale()).toBe('en');
  });

  it('setLocale switches locale', () => {
    loc.setLocale('es');
    expect(loc.t('greeting', { name: 'Juan' })).toBe('¡Hola, Juan!');
  });

  it('getAvailableLocales', () => {
    expect(loc.getAvailableLocales()).toEqual(['en', 'es']);
  });

  it('getStringCount', () => {
    expect(loc.getStringCount('en')).toBe(2);
    expect(loc.getStringCount('es')).toBe(1);
  });

  it('hasKey checks specific locale', () => {
    expect(loc.hasKey('greeting')).toBe(true);
    expect(loc.hasKey('farewell', 'es')).toBe(false);
  });

  it('plural with rules', () => {
    loc.addPluralRule('en', 'items', {
      zero: 'No items',
      one: '{count} item',
      other: '{count} items',
    });
    expect(loc.plural('items', 0)).toBe('No items');
    expect(loc.plural('items', 1)).toBe('1 item');
    expect(loc.plural('items', 5)).toBe('5 items');
  });

  it('plural few category', () => {
    loc.addPluralRule('en', 'things', {
      one: '1 thing',
      few: '{count} things (few)',
      other: '{count} things',
    });
    expect(loc.plural('things', 3)).toBe('3 things (few)');
  });

  it('getCompletionPercentage', () => {
    // en has 2 strings, es has 1 matching key
    expect(loc.getCompletionPercentage('es')).toBe(50);
  });
});
