/**
 * ThemeEngine Production Tests
 * Sprint CLIII - CSS-like theming engine for HoloScript+ UI
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ThemeEngine, BuiltInThemes } from '../ThemeEngine';

describe('ThemeEngine', () => {
  let engine: ThemeEngine;

  beforeEach(() => {
    engine = new ThemeEngine();
  });

  // -------------------------------------------------------------------------
  // BuiltInThemes
  // -------------------------------------------------------------------------

  describe('BuiltInThemes', () => {
    it('includes dark and light themes', () => {
      expect(BuiltInThemes.dark).toBeDefined();
      expect(BuiltInThemes.light).toBeDefined();
    });

    it('dark theme has mode=dark', () => {
      expect(BuiltInThemes.dark.mode).toBe('dark');
    });

    it('light theme has mode=light', () => {
      expect(BuiltInThemes.light.mode).toBe('light');
    });

    it('dark theme primary color is defined', () => {
      expect(BuiltInThemes.dark.tokens.colors.primary).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Default state
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('defaults to dark theme', () => {
      expect(engine.getActiveThemeName()).toBe('dark');
      expect(engine.getTheme().name).toBe('dark');
    });

    it('listThemes includes dark and light', () => {
      const list = engine.listThemes();
      expect(list).toContain('dark');
      expect(list).toContain('light');
    });
  });

  // -------------------------------------------------------------------------
  // setTheme / getTheme
  // -------------------------------------------------------------------------

  describe('setTheme', () => {
    it('switches to light theme', () => {
      engine.setTheme('light');
      expect(engine.getActiveThemeName()).toBe('light');
      expect(engine.getTheme().mode).toBe('light');
    });

    it('ignores unknown theme name', () => {
      engine.setTheme('nonexistent');
      expect(engine.getActiveThemeName()).toBe('dark'); // unchanged
    });

    it('notifies listeners on change', () => {
      const cb = vi.fn();
      engine.onThemeChange(cb);
      engine.setTheme('light');
      expect(cb).toHaveBeenCalledOnce();
      expect(cb.mock.calls[0][0].name).toBe('light');
    });
  });

  // -------------------------------------------------------------------------
  // registerTheme
  // -------------------------------------------------------------------------

  describe('registerTheme', () => {
    it('registers a custom theme', () => {
      const customTheme = {
        name: 'neon',
        mode: 'dark' as const,
        tokens: { ...BuiltInThemes.dark.tokens, colors: { ...BuiltInThemes.dark.tokens.colors, primary: '#00FF41' } },
      };
      engine.registerTheme(customTheme);
      expect(engine.listThemes()).toContain('neon');
    });

    it('can switch to registered custom theme', () => {
      const custom = { name: 'ocean', mode: 'light' as const, tokens: BuiltInThemes.light.tokens };
      engine.registerTheme(custom);
      engine.setTheme('ocean');
      expect(engine.getTheme().name).toBe('ocean');
    });
  });

  // -------------------------------------------------------------------------
  // getTokens
  // -------------------------------------------------------------------------

  describe('getTokens', () => {
    it('returns tokens matching the active theme', () => {
      const tokens = engine.getTokens();
      expect(tokens.colors.primary).toBe(BuiltInThemes.dark.tokens.colors.primary);
    });

    it('returns light tokens after switching', () => {
      engine.setTheme('light');
      const tokens = engine.getTokens();
      expect(tokens.colors.primary).toBe(BuiltInThemes.light.tokens.colors.primary);
    });
  });

  // -------------------------------------------------------------------------
  // setOverrides / getTokens with overrides
  // -------------------------------------------------------------------------

  describe('setOverrides', () => {
    it('overrides specific color tokens', () => {
      engine.setOverrides({ colors: { primary: '#DEADBE' } as any });
      expect(engine.getTokens().colors.primary).toBe('#DEADBE');
    });

    it('does not affect non-overridden tokens', () => {
      const originalSecondary = engine.getTokens().colors.secondary;
      engine.setOverrides({ colors: { primary: '#DEADBE' } as any });
      expect(engine.getTokens().colors.secondary).toBe(originalSecondary);
    });

    it('notifies listeners on override', () => {
      const cb = vi.fn();
      engine.onThemeChange(cb);
      engine.setOverrides({ spacing: { md: 0.032 } as any });
      expect(cb).toHaveBeenCalledOnce();
    });

    it('overrides spacing tokens', () => {
      engine.setOverrides({ spacing: { md: 99 } as any });
      expect(engine.getTokens().spacing.md).toBe(99);
    });
  });

  // -------------------------------------------------------------------------
  // resolve
  // -------------------------------------------------------------------------

  describe('resolve', () => {
    it('resolves colors.primary', () => {
      const primary = engine.resolve('colors.primary');
      expect(primary).toBe(engine.getTokens().colors.primary);
    });

    it('resolves spacing.md', () => {
      expect(engine.resolve('spacing.md')).toBe(engine.getTokens().spacing.md);
    });

    it('resolves fontSize.xl', () => {
      expect(engine.resolve('fontSize.xl')).toBe(engine.getTokens().fontSize.xl);
    });

    it('resolves nested borderRadius.full', () => {
      expect(engine.resolve('borderRadius.full')).toBe(999);
    });

    it('returns undefined for unknown path', () => {
      expect(engine.resolve('colors.doesNotExist')).toBeUndefined();
    });

    it('returns undefined for completely wrong path', () => {
      expect(engine.resolve('nonexistent.path')).toBeUndefined();
    });

    it('resolves shadow.lg', () => {
      expect(engine.resolve('shadow.lg')).toBeTruthy();
    });

    it('resolves opacity.disabled', () => {
      expect(engine.resolve('opacity.disabled')).toBe(0.4);
    });
  });

  // -------------------------------------------------------------------------
  // Multiple listeners
  // -------------------------------------------------------------------------

  describe('multiple listeners', () => {
    it('all listeners are invoked on theme change', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      engine.onThemeChange(cb1);
      engine.onThemeChange(cb2);
      engine.setTheme('light');
      expect(cb1).toHaveBeenCalledOnce();
      expect(cb2).toHaveBeenCalledOnce();
    });
  });
});
