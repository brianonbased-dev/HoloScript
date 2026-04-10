import { describe, it, expect, vi } from 'vitest';
import { ThemeEngine, BuiltInThemes } from '../theming/ThemeEngine';
import { StyleResolver } from '../theming/StyleResolver';

// =============================================================================
// C211 — Theming (ThemeEngine + StyleResolver)
// =============================================================================

describe('ThemeEngine', () => {
  it('defaults to dark theme', () => {
    const te = new ThemeEngine();
    expect(te.getActiveThemeName()).toBe('dark');
    expect(te.getTheme().mode).toBe('dark');
  });

  it('lists built-in themes', () => {
    const te = new ThemeEngine();
    const names = te.listThemes();
    expect(names).toContain('dark');
    expect(names).toContain('light');
  });

  it('setTheme switches active theme', () => {
    const te = new ThemeEngine();
    te.setTheme('light');
    expect(te.getActiveThemeName()).toBe('light');
    expect(te.getTheme().mode).toBe('light');
  });

  it('setTheme ignores unknown themes', () => {
    const te = new ThemeEngine();
    te.setTheme('nope');
    expect(te.getActiveThemeName()).toBe('dark');
  });

  it('registerTheme adds custom theme', () => {
    const te = new ThemeEngine();
    const custom = { ...BuiltInThemes.dark, name: 'custom' };
    te.registerTheme(custom);
    expect(te.listThemes()).toContain('custom');
    te.setTheme('custom');
    expect(te.getActiveThemeName()).toBe('custom');
  });

  it('getTokens returns active theme tokens', () => {
    const te = new ThemeEngine();
    const tokens = te.getTokens();
    expect(tokens.colors.primary).toBe('#6C63FF');
  });

  it('setOverrides merges into tokens', () => {
    const te = new ThemeEngine();
    te.setOverrides({ colors: { primary: '#FF0000' } as any });
    const tokens = te.getTokens();
    expect(tokens.colors.primary).toBe('#FF0000');
    // Other colors preserved
    expect(tokens.colors.accent).toBe('#FF6584');
  });

  it('resolve navigates token path', () => {
    const te = new ThemeEngine();
    expect(te.resolve('colors.primary')).toBe('#6C63FF');
    expect(te.resolve('spacing.md')).toBe(0.016);
    expect(te.resolve('nope.deep')).toBeUndefined();
  });

  it('onThemeChange fires callback', () => {
    const te = new ThemeEngine();
    const cb = vi.fn();
    te.onThemeChange(cb);
    te.setTheme('light');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].name).toBe('light');
  });
});

// =============================================================================
// StyleResolver
// =============================================================================

describe('StyleResolver', () => {
  it('addRule and resolve by type', () => {
    const sr = new StyleResolver();
    sr.addRule('button', { color: 'red', padding: 4 });
    const style = sr.resolve('button');
    expect(style.color).toBe('red');
    expect(style.padding).toBe(4);
  });

  it('class rules override type rules', () => {
    const sr = new StyleResolver();
    sr.addRule('button', { color: 'red' });
    sr.addRule('.primary', { color: 'blue' });
    const style = sr.resolve('button', ['primary']);
    expect(style.color).toBe('blue');
  });

  it('state rules override class rules', () => {
    const sr = new StyleResolver();
    sr.addRule('button', { opacity: 1 });
    sr.addRule('.primary', { opacity: 0.9 });
    sr.addRule('button:hover', { opacity: 0.7 });
    const style = sr.resolve('button', ['primary'], ['hover']);
    expect(style.opacity).toBe(0.7);
  });

  it('inline overrides everything', () => {
    const sr = new StyleResolver();
    sr.addRule('button', { color: 'red' });
    sr.addRule('.danger', { color: 'orange' });
    sr.addRule('button:hover', { color: 'pink' });
    const style = sr.resolve('button', ['danger'], ['hover'], { color: 'green' });
    expect(style.color).toBe('green');
  });

  it('addRules accepts array', () => {
    const sr = new StyleResolver();
    sr.addRules([
      { selector: 'panel', properties: { bg: '#000' } },
      { selector: 'text', properties: { size: 14 } },
    ]);
    expect(sr.ruleCount).toBe(2);
    expect(sr.resolve('panel').bg).toBe('#000');
  });

  it('fromTokens creates resolver with default rules', () => {
    const tokens = BuiltInThemes.dark.tokens;
    const sr = StyleResolver.fromTokens(tokens);
    expect(sr.ruleCount).toBeGreaterThan(0);
    const buttonStyle = sr.resolve('button');
    expect(buttonStyle.backgroundColor).toBe(tokens.colors.primary);
  });

  it('resolve returns empty for unmatched type', () => {
    const sr = new StyleResolver();
    const style = sr.resolve('nonexistent');
    expect(Object.keys(style)).toHaveLength(0);
  });
});
