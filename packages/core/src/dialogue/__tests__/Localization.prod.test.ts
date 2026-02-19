/**
 * Localization — Production Test Suite
 *
 * Covers: addLocale, setLocale, translation, interpolation,
 * fallback, pluralization, missing keys, completion percentage.
 */
import { describe, it, expect } from 'vitest';
import { Localization } from '../Localization';

describe('Localization — Production', () => {
  // ─── Basic Translation ────────────────────────────────────────────
  it('t() returns translated string', () => {
    const l = new Localization();
    l.addLocale('en', { greeting: 'Hello' });
    expect(l.t('greeting')).toBe('Hello');
  });

  it('t() with interpolation', () => {
    const l = new Localization();
    l.addLocale('en', { welcome: 'Hello, {name}!' });
    expect(l.t('welcome', { name: 'Brian' })).toBe('Hello, Brian!');
  });

  // ─── Locale Switching ─────────────────────────────────────────────
  it('setLocale switches language', () => {
    const l = new Localization();
    l.addLocale('en', { greeting: 'Hello' });
    l.addLocale('es', { greeting: 'Hola' });
    l.setLocale('es');
    expect(l.t('greeting')).toBe('Hola');
    expect(l.getCurrentLocale()).toBe('es');
  });

  it('setLocale returns false for unknown locale', () => {
    const l = new Localization();
    expect(l.setLocale('zz')).toBe(false);
  });

  // ─── Fallback ─────────────────────────────────────────────────────
  it('falls back to fallback locale', () => {
    const l = new Localization();
    l.addLocale('en', { greeting: 'Hello', farewell: 'Goodbye' });
    l.addLocale('fr', { greeting: 'Bonjour' }); // no farewell
    l.setLocale('fr');
    expect(l.t('farewell')).toBe('Goodbye');
  });

  it('missing key returns [key] and tracks it', () => {
    const l = new Localization();
    l.addLocale('en', {});
    expect(l.t('missing')).toBe('[missing]');
    expect(l.getMissingKeys()).toContain('missing');
  });

  // ─── Pluralization ────────────────────────────────────────────────
  it('plural() uses correct form', () => {
    const l = new Localization();
    l.addLocale('en', {});
    l.addPluralRule('en', 'items', {
      zero: 'No items',
      one: '{count} item',
      other: '{count} items',
    });
    expect(l.plural('items', 0)).toBe('No items');
    expect(l.plural('items', 1)).toBe('1 item');
    expect(l.plural('items', 5)).toBe('5 items');
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getAvailableLocales lists registered', () => {
    const l = new Localization();
    l.addLocale('en', {});
    l.addLocale('ja', {});
    expect(l.getAvailableLocales()).toEqual(expect.arrayContaining(['en', 'ja']));
  });

  it('hasKey checks key existence', () => {
    const l = new Localization();
    l.addLocale('en', { ok: 'OK' });
    expect(l.hasKey('ok')).toBe(true);
    expect(l.hasKey('nope')).toBe(false);
  });

  it('getStringCount returns correct count', () => {
    const l = new Localization();
    l.addLocale('en', { a: 'A', b: 'B', c: 'C' });
    expect(l.getStringCount()).toBe(3);
  });

  it('getCompletionPercentage compares to fallback', () => {
    const l = new Localization();
    l.addLocale('en', { a: 'A', b: 'B', c: 'C', d: 'D' });
    l.addLocale('fr', { a: 'A', b: 'B' }); // 2 of 4
    expect(l.getCompletionPercentage('fr')).toBe(50);
  });

  it('clearMissingKeys resets', () => {
    const l = new Localization();
    l.addLocale('en', {});
    l.t('missing1');
    l.t('missing2');
    l.clearMissingKeys();
    expect(l.getMissingKeys().length).toBe(0);
  });
});
