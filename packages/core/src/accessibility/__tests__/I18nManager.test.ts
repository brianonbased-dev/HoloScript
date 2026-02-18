import { describe, it, expect, vi } from 'vitest';
import { I18nManager } from '../I18nManager';

describe('I18nManager', () => {
  it('defaults to en locale', () => {
    const m = new I18nManager();
    expect(m.getLocale()).toBe('en');
  });

  it('setLocale changes current locale', () => {
    const m = new I18nManager();
    m.setLocale('fr');
    expect(m.getLocale()).toBe('fr');
  });

  it('setLocale notifies listeners', () => {
    const m = new I18nManager();
    const cb = vi.fn();
    m.onLocaleChange(cb);
    m.setLocale('de');
    expect(cb).toHaveBeenCalledWith('de');
  });

  it('setFallback changes fallback locale', () => {
    const m = new I18nManager();
    m.addTable('en', { hello: 'Hello' });
    m.addTable('es', {});
    m.setFallback('en');
    m.setLocale('es');
    expect(m.t('hello')).toBe('Hello'); // falls back to en
  });

  it('addTable and hasKey', () => {
    const m = new I18nManager();
    m.addTable('en', { greeting: 'Hi' });
    expect(m.hasKey('greeting')).toBe(true);
    expect(m.hasKey('nope')).toBe(false);
  });

  it('hasKey with explicit locale', () => {
    const m = new I18nManager();
    m.addTable('fr', { bonjour: 'Salut' });
    expect(m.hasKey('bonjour', 'fr')).toBe(true);
    expect(m.hasKey('bonjour', 'en')).toBe(false);
  });

  it('getAvailableLocales', () => {
    const m = new I18nManager();
    m.addTable('en', { a: '1' });
    m.addTable('fr', { a: '2' });
    m.addTable('de', { a: '3' });
    expect(m.getAvailableLocales().sort()).toEqual(['de', 'en', 'fr']);
  });

  it('t returns simple string', () => {
    const m = new I18nManager();
    m.addTable('en', { hello: 'Hello World' });
    expect(m.t('hello')).toBe('Hello World');
  });

  it('t returns [key] for missing key', () => {
    const m = new I18nManager();
    expect(m.t('missing')).toBe('[missing]');
  });

  it('t interpolates params', () => {
    const m = new I18nManager();
    m.addTable('en', { greet: 'Hello {{name}}, age {{age}}' });
    expect(m.t('greet', { name: 'Alice', age: 30 })).toBe('Hello Alice, age 30');
  });

  it('t preserves unmatched placeholders', () => {
    const m = new I18nManager();
    m.addTable('en', { msg: 'Hi {{who}}' });
    expect(m.t('msg', {})).toBe('Hi {{who}}');
  });

  it('t handles plural zero', () => {
    const m = new I18nManager();
    m.addTable('en', { items: { zero: 'no items', one: '1 item', other: '{{count}} items' } });
    expect(m.t('items', { count: 0 })).toBe('no items');
  });

  it('t handles plural one', () => {
    const m = new I18nManager();
    m.addTable('en', { items: { one: '1 item', other: '{{count}} items' } });
    expect(m.t('items', { count: 1 })).toBe('1 item');
  });

  it('t handles plural few (2-4)', () => {
    const m = new I18nManager();
    m.addTable('en', { items: { one: '1', few: 'a few', other: 'many' } });
    expect(m.t('items', { count: 3 })).toBe('a few');
  });

  it('t handles plural many (>=5)', () => {
    const m = new I18nManager();
    m.addTable('en', { items: { one: '1', many: 'lots', other: 'other' } });
    expect(m.t('items', { count: 10 })).toBe('lots');
  });

  it('t plural falls back to other', () => {
    const m = new I18nManager();
    m.addTable('en', { items: { one: '1', other: '{{count}}+' } });
    expect(m.t('items', { count: 7 })).toBe('7+');
  });

  it('t falls back to fallback locale', () => {
    const m = new I18nManager();
    m.addTable('en', { hello: 'Hello' });
    m.setLocale('fr'); // fr has no table
    expect(m.t('hello')).toBe('Hello');
  });

  it('getCompletionRate full', () => {
    const m = new I18nManager();
    m.addTable('en', { a: '1', b: '2', c: '3' });
    m.addTable('fr', { a: '1', b: '2', c: '3' });
    expect(m.getCompletionRate('fr')).toBe(1);
  });

  it('getCompletionRate partial', () => {
    const m = new I18nManager();
    m.addTable('en', { a: '1', b: '2', c: '3', d: '4' });
    m.addTable('fr', { a: '1', b: '2' });
    expect(m.getCompletionRate('fr')).toBe(0.5);
  });

  it('getCompletionRate returns 0 for unknown locale', () => {
    const m = new I18nManager();
    m.addTable('en', { a: '1' });
    expect(m.getCompletionRate('zz')).toBe(0);
  });

  it('addTable merges into existing table', () => {
    const m = new I18nManager();
    m.addTable('en', { a: '1' });
    m.addTable('en', { b: '2' });
    expect(m.hasKey('a')).toBe(true);
    expect(m.hasKey('b')).toBe(true);
  });
});
