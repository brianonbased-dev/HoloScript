/**
 * ThemeEngine Unit Tests
 *
 * Tests built-in themes, theme switching, token resolution,
 * overrides, listeners, and custom theme registration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeEngine, BuiltInThemes } from '../ThemeEngine';

describe('ThemeEngine', () => {
  let engine: ThemeEngine;

  beforeEach(() => {
    engine = new ThemeEngine();
  });

  describe('built-in themes', () => {
    it('should start with dark theme', () => {
      expect(engine.getActiveThemeName()).toBe('dark');
      expect(engine.getTheme().mode).toBe('dark');
    });

    it('should list both built-in themes', () => {
      const themes = engine.listThemes();
      expect(themes).toContain('dark');
      expect(themes).toContain('light');
    });
  });

  describe('setTheme', () => {
    it('should switch to light theme', () => {
      engine.setTheme('light');
      expect(engine.getActiveThemeName()).toBe('light');
      expect(engine.getTheme().mode).toBe('light');
    });

    it('should no-op for unknown theme', () => {
      engine.setTheme('nonexistent');
      expect(engine.getActiveThemeName()).toBe('dark');
    });

    it('should notify listeners on change', () => {
      const listener = vi.fn();
      engine.onThemeChange(listener);
      engine.setTheme('light');
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ name: 'light' }));
    });
  });

  describe('getTokens', () => {
    it('should return tokens for active theme', () => {
      const tokens = engine.getTokens();
      expect(tokens.colors.primary).toBeDefined();
      expect(tokens.spacing.md).toBeDefined();
      expect(tokens.fontSize.md).toBeDefined();
    });
  });

  describe('resolve', () => {
    it('should resolve dot-path to token value', () => {
      expect(engine.resolve('colors.primary')).toBe('#6C63FF');
    });

    it('should resolve nested paths', () => {
      expect(engine.resolve('spacing.lg')).toBeDefined();
    });

    it('should return undefined for invalid path', () => {
      expect(engine.resolve('nonexistent.path')).toBeUndefined();
    });
  });

  describe('overrides', () => {
    it('should merge overrides with base tokens', () => {
      engine.setOverrides({ colors: { primary: '#FF0000' } as any });
      const tokens = engine.getTokens();
      expect(tokens.colors.primary).toBe('#FF0000');
      // Other tokens should remain
      expect(tokens.colors.secondary).toBe('#3F3D56');
    });

    it('should notify listeners on override change', () => {
      const listener = vi.fn();
      engine.onThemeChange(listener);
      engine.setOverrides({ colors: { accent: '#00FF00' } as any });
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('registerTheme', () => {
    it('should register custom theme', () => {
      engine.registerTheme({
        name: 'custom',
        mode: 'dark',
        tokens: BuiltInThemes.dark.tokens,
      });

      expect(engine.listThemes()).toContain('custom');
      engine.setTheme('custom');
      expect(engine.getActiveThemeName()).toBe('custom');
    });
  });
});
