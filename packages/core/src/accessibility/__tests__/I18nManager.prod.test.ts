/**
 * I18nManager — Production Test Suite
 *
 * Covers: locale management, string tables, translation (t),
 * interpolation, pluralization, fallback, completionRate, listeners.
 */
import { describe, it, expect, vi } from 'vitest';
import { I18nManager } from '../I18nManager';

describe('I18nManager — Production', () => {
  // ─── Locale ───────────────────────────────────────────────────────
  it('defaults to en locale', () => {
    const i = new I18nManager();
    expect(i.getLocale()).toBe('en');
  });

  it('setLocale changes locale and fires listeners', () => {
    const i = new I18nManager();
    const cb = vi.fn();
    i.onLocaleChange(cb);
    i.setLocale('fr');
    expect(i.getLocale()).toBe('fr');
    expect(cb).toHaveBeenCalledWith('fr');
  });

  // ─── String Tables ────────────────────────────────────────────────
  it('addTable and hasKey work', () => {
    const i = new I18nManager();
    i.addTable('en', { greeting: 'Hello' });
    expect(i.hasKey('greeting')).toBe(true);
    expect(i.hasKey('nope')).toBe(false);
  });

  it('getAvailableLocales returns all registered', () => {
    const i = new I18nManager();
    i.addTable('en', { a: 'A' });
    i.addTable('fr', { a: 'A_fr' });
    expect(i.getAvailableLocales()).toContain('en');
    expect(i.getAvailableLocales()).toContain('fr');
  });

  // ─── Translation ──────────────────────────────────────────────────
  it('t returns translated string', () => {
    const i = new I18nManager();
    i.addTable('en', { hello: 'Hello World' });
    expect(i.t('hello')).toBe('Hello World');
  });

  it('t returns key placeholder for missing key', () => {
    const i = new I18nManager();
    expect(i.t('missing')).toBe('[missing]');
  });

  it('t interpolates params with {{}}', () => {
    const i = new I18nManager();
    i.addTable('en', { greeting: 'Hi {{name}}!' });
    expect(i.t('greeting', { name: 'Alice' })).toBe('Hi Alice!');
  });

  // ─── Pluralization ────────────────────────────────────────────────
  it('t handles plural rules', () => {
    const i = new I18nManager();
    i.addTable('en', {
      items: { one: '{{count}} item', other: '{{count}} items', zero: 'No items' },
    });
    expect(i.t('items', { count: 0 })).toBe('No items');
    expect(i.t('items', { count: 1 })).toBe('1 item');
    expect(i.t('items', { count: 5 })).toBe('5 items');
  });

  // ─── Fallback ─────────────────────────────────────────────────────
  it('falls back to fallback locale when key missing', () => {
    const i = new I18nManager();
    i.addTable('en', { hello: 'Hello' });
    i.setLocale('fr');
    expect(i.t('hello')).toBe('Hello'); // falls back to en
  });

  // ─── Completion Rate ──────────────────────────────────────────────
  it('getCompletionRate computes correctly', () => {
    const i = new I18nManager();
    i.addTable('en', { a: 'A', b: 'B', c: 'C' });
    i.addTable('fr', { a: 'A_fr', b: 'B_fr' });
    expect(i.getCompletionRate('fr')).toBeCloseTo(2 / 3, 2);
  });

  it('getCompletionRate returns 0 for unknown locale', () => {
    const i = new I18nManager();
    expect(i.getCompletionRate('xx')).toBe(0);
  });

  // ─── setFallback ──────────────────────────────────────────────────
  it('setFallback changes the fallback locale', () => {
    const i = new I18nManager();
    i.addTable('es', { hola: 'Hola' });
    i.setFallback('es');
    i.setLocale('de');
    expect(i.t('hola')).toBe('Hola');
  });
});
