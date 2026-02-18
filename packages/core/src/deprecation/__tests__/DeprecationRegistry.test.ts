import { describe, it, expect } from 'vitest';
import {
  DeprecationRegistry,
  createDeprecationRegistry,
  type DeprecationEntry,
} from '../DeprecationRegistry';

describe('DeprecationRegistry', () => {
  it('built-in deprecated traits are pre-registered', () => {
    const reg = createDeprecationRegistry();
    expect(reg.isTraitDeprecated('talkable')).toBeDefined();
    expect(reg.isTraitDeprecated('collision')).toBeDefined();
    expect(reg.isTraitDeprecated('interactive')).toBeDefined();
    expect(reg.isTraitDeprecated('collidable')).toBeDefined();
  });

  it('built-in deprecated properties exist', () => {
    const reg = createDeprecationRegistry();
    expect(reg.isPropertyDeprecated('pos')?.replacement).toBe('position');
    expect(reg.isPropertyDeprecated('rot')?.replacement).toBe('rotation');
    expect(reg.isPropertyDeprecated('scl')?.replacement).toBe('scale');
    expect(reg.isPropertyDeprecated('texture')?.replacement).toBe('material.map');
  });

  it('built-in deprecated functions exist', () => {
    const reg = createDeprecationRegistry();
    expect(reg.isFunctionDeprecated('spawn')).toBeDefined();
    expect(reg.isFunctionDeprecated('destroy')).toBeDefined();
  });

  it('register adds custom entry', () => {
    const reg = createDeprecationRegistry();
    const entry: DeprecationEntry = {
      id: 'custom-1',
      type: 'trait',
      name: 'myTrait',
      message: 'Deprecated custom trait',
      severity: 'warning',
    };
    reg.register(entry);
    expect(reg.isTraitDeprecated('myTrait')).toBe(entry);
    expect(reg.get('custom-1')).toBe(entry);
  });

  it('get returns undefined for unknown ID', () => {
    const reg = createDeprecationRegistry();
    expect(reg.get('nonexistent')).toBeUndefined();
  });

  it('getAll includes built-ins', () => {
    const reg = createDeprecationRegistry();
    expect(reg.getAll().length).toBeGreaterThanOrEqual(10);
  });

  it('getDeprecatedTraits / Properties / Functions list correctly', () => {
    const reg = createDeprecationRegistry();
    expect(reg.getDeprecatedTraits().length).toBe(4);
    expect(reg.getDeprecatedProperties().length).toBe(4);
    expect(reg.getDeprecatedFunctions().length).toBe(2);
  });

  it('checkSyntax detects deprecated patterns', () => {
    const reg = createDeprecationRegistry();
    const source = 'on_event("click")';
    const matches = reg.checkSyntax(source);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].entry.id).toBe('syntax-old-event');
  });

  it('checkSyntax detects var keyword', () => {
    const reg = createDeprecationRegistry();
    const matches = reg.checkSyntax('var x = 5;');
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches[0].entry.severity).toBe('error');
  });

  it('checkSyntax returns location info', () => {
    const reg = createDeprecationRegistry();
    const source = 'line1\non_event("tap")';
    const matches = reg.checkSyntax(source);
    expect(matches[0].location?.line).toBe(2);
    expect(matches[0].location?.column).toBe(1);
  });

  it('clear removes all entries', () => {
    const reg = createDeprecationRegistry();
    reg.clear();
    expect(reg.getAll().length).toBe(0);
    expect(reg.isTraitDeprecated('talkable')).toBeUndefined();
    expect(reg.checkSyntax('var x = 1;').length).toBe(0);
  });

  it('isTraitDeprecated returns undefined for non-deprecated', () => {
    const reg = createDeprecationRegistry();
    expect(reg.isTraitDeprecated('physics')).toBeUndefined();
  });
});
