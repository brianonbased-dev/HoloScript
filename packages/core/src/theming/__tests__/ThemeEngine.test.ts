import { describe, it, expect, vi } from 'vitest';
import { ThemeEngine, BuiltInThemes } from '../ThemeEngine';

describe('ThemeEngine', () => {
  it('default theme is dark', () => {
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

  it('setTheme ignores unknown names', () => {
    const te = new ThemeEngine();
    te.setTheme('nonexistent');
    expect(te.getActiveThemeName()).toBe('dark');
  });

  it('registerTheme adds custom theme', () => {
    const te = new ThemeEngine();
    te.registerTheme({
      name: 'ocean',
      mode: 'dark',
      tokens: { ...BuiltInThemes.dark.tokens, colors: { ...BuiltInThemes.dark.tokens.colors, primary: '#00AAFF' } },
    });
    expect(te.listThemes()).toContain('ocean');
    te.setTheme('ocean');
    expect(te.getTokens().colors.primary).toBe('#00AAFF');
  });

  it('getTokens returns dark tokens by default', () => {
    const te = new ThemeEngine();
    const tokens = te.getTokens();
    expect(tokens.colors.primary).toBe('#6C63FF');
    expect(tokens.colors.background).toBe('#0D1117');
  });

  it('resolve returns nested token value', () => {
    const te = new ThemeEngine();
    expect(te.resolve('colors.primary')).toBe('#6C63FF');
    expect(te.resolve('spacing.md')).toBe(0.016);
    expect(te.resolve('borderRadius.full')).toBe(999);
  });

  it('resolve returns undefined for invalid path', () => {
    const te = new ThemeEngine();
    expect(te.resolve('colors.nonexistent')).toBeUndefined();
    expect(te.resolve('invalid.deep.path')).toBeUndefined();
  });

  it('setOverrides merges onto active tokens', () => {
    const te = new ThemeEngine();
    te.setOverrides({ colors: { primary: '#FF0000' } as any });
    expect(te.getTokens().colors.primary).toBe('#FF0000');
    expect(te.getTokens().colors.secondary).toBe('#3F3D56'); // unchanged
  });

  it('onThemeChange fires on setTheme', () => {
    const te = new ThemeEngine();
    const cb = vi.fn();
    te.onThemeChange(cb);
    te.setTheme('light');
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0][0].name).toBe('light');
  });

  it('onThemeChange fires on setOverrides', () => {
    const te = new ThemeEngine();
    const cb = vi.fn();
    te.onThemeChange(cb);
    te.setOverrides({ spacing: { xs: 0.01 } as any });
    expect(cb).toHaveBeenCalledOnce();
  });

  it('light theme has distinct colors from dark', () => {
    const te = new ThemeEngine();
    const dark = te.getTokens().colors.background;
    te.setTheme('light');
    const light = te.getTokens().colors.background;
    expect(light).not.toBe(dark);
  });
});
