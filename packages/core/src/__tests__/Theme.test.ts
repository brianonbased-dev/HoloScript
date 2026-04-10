import { describe, it, expect, vi } from 'vitest';
import { ThemeEngine, BuiltInThemes } from '../theming/ThemeEngine';
import { StyleResolver } from '../theming/StyleResolver';

describe('Theming & Styling', () => {
  describe('ThemeEngine', () => {
    it('Provides dark theme by default', () => {
      const engine = new ThemeEngine();
      expect(engine.getActiveThemeName()).toBe('dark');
      expect(engine.getTokens().colors.primary).toBe('#6C63FF');
    });

    it('Switches between themes', () => {
      const engine = new ThemeEngine();
      engine.setTheme('light');
      expect(engine.getActiveThemeName()).toBe('light');
      expect(engine.getTokens().colors.background).toBe('#FFFFFF');
    });

    it('Resolves token paths', () => {
      const engine = new ThemeEngine();
      expect(engine.resolve('colors.primary')).toBe('#6C63FF');
      expect(engine.resolve('spacing.md')).toBe(0.016);
    });

    it('Applies overrides', () => {
      const engine = new ThemeEngine();
      engine.setOverrides({ colors: { primary: '#FF0000' } as any });
      expect(engine.resolve('colors.primary')).toBe('#FF0000');
      expect(engine.resolve('colors.secondary')).toBe('#3F3D56'); // Unchanged
    });

    it('Notifies on theme change', () => {
      const engine = new ThemeEngine();
      const cb = vi.fn();
      engine.onThemeChange(cb);
      engine.setTheme('light');
      expect(cb).toHaveBeenCalled();
    });

    it('Registers custom themes', () => {
      const engine = new ThemeEngine();
      engine.registerTheme({
        name: 'neon',
        mode: 'dark',
        tokens: {
          ...BuiltInThemes.dark.tokens,
          colors: { ...BuiltInThemes.dark.tokens.colors, primary: '#00FF00' },
        },
      });
      engine.setTheme('neon');
      expect(engine.resolve('colors.primary')).toBe('#00FF00');
    });
  });

  describe('StyleResolver', () => {
    it('Resolves base type styles', () => {
      const resolver = new StyleResolver();
      resolver.addRule('button', { backgroundColor: 'blue', padding: 8 });
      const style = resolver.resolve('button');
      expect(style.backgroundColor).toBe('blue');
    });

    it('Class overrides type', () => {
      const resolver = new StyleResolver();
      resolver.addRule('button', { backgroundColor: 'blue' });
      resolver.addRule('.danger', { backgroundColor: 'red' });
      const style = resolver.resolve('button', ['danger']);
      expect(style.backgroundColor).toBe('red');
    });

    it('State overrides class', () => {
      const resolver = new StyleResolver();
      resolver.addRule('button', { opacity: 1 });
      resolver.addRule('button:hover', { opacity: 0.8 });
      const style = resolver.resolve('button', [], ['hover']);
      expect(style.opacity).toBe(0.8);
    });

    it('Inline overrides everything', () => {
      const resolver = new StyleResolver();
      resolver.addRule('button', { color: 'white' });
      const style = resolver.resolve('button', [], [], { color: 'pink' });
      expect(style.color).toBe('pink');
    });

    it('Creates default rules from tokens', () => {
      const resolver = StyleResolver.fromTokens(BuiltInThemes.dark.tokens);
      expect(resolver.ruleCount).toBeGreaterThan(5);
      const style = resolver.resolve('button');
      expect(style.backgroundColor).toBeDefined();
    });
  });
});
