/**
 * ThemeEngine.ts
 *
 * CSS-like theming engine for HoloScript+ UI.
 * Manages design tokens (colors, fonts, spacing),
 * dark/light mode, and cascading overrides.
 */

export interface ThemeTokens {
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    error: string;
    success: string;
    warning: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  fontSize: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  opacity: {
    disabled: number;
    hover: number;
    pressed: number;
  };
  shadow: {
    sm: string;
    md: string;
    lg: string;
  };
}

export interface Theme {
  name: string;
  mode: 'light' | 'dark';
  tokens: ThemeTokens;
}

// =============================================================================
// BUILT-IN THEMES
// =============================================================================

const darkTokens: ThemeTokens = {
  colors: {
    primary: '#6C63FF',
    secondary: '#3F3D56',
    accent: '#FF6584',
    background: '#0D1117',
    surface: '#161B22',
    text: '#E6EDF3',
    textSecondary: '#8B949E',
    border: '#30363D',
    error: '#F85149',
    success: '#3FB950',
    warning: '#D29922',
  },
  spacing: { xs: 0.004, sm: 0.008, md: 0.016, lg: 0.024, xl: 0.04 },
  borderRadius: { sm: 0.004, md: 0.008, lg: 0.016, full: 999 },
  fontSize: { xs: 0.02, sm: 0.025, md: 0.03, lg: 0.04, xl: 0.05, xxl: 0.07 },
  opacity: { disabled: 0.4, hover: 0.8, pressed: 0.6 },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.3)',
    md: '0 4px 8px rgba(0,0,0,0.4)',
    lg: '0 8px 24px rgba(0,0,0,0.5)',
  },
};

const lightTokens: ThemeTokens = {
  colors: {
    primary: '#5B52E0',
    secondary: '#E8E8F0',
    accent: '#E05577',
    background: '#FFFFFF',
    surface: '#F6F8FA',
    text: '#24292F',
    textSecondary: '#57606A',
    border: '#D0D7DE',
    error: '#CF222E',
    success: '#1A7F37',
    warning: '#9A6700',
  },
  spacing: { ...darkTokens.spacing },
  borderRadius: { ...darkTokens.borderRadius },
  fontSize: { ...darkTokens.fontSize },
  opacity: { disabled: 0.4, hover: 0.9, pressed: 0.7 },
  shadow: {
    sm: '0 1px 2px rgba(0,0,0,0.1)',
    md: '0 4px 8px rgba(0,0,0,0.15)',
    lg: '0 8px 24px rgba(0,0,0,0.2)',
  },
};

export const BuiltInThemes: Record<string, Theme> = {
  dark: { name: 'dark', mode: 'dark', tokens: darkTokens },
  light: { name: 'light', mode: 'light', tokens: lightTokens },
};

// =============================================================================
// THEME ENGINE
// =============================================================================

export class ThemeEngine {
  private themes: Map<string, Theme> = new Map();
  private activeThemeName: string = 'dark';
  private overrides: Partial<ThemeTokens> = {};
  private listeners: Array<(theme: Theme) => void> = [];

  constructor() {
    for (const [name, theme] of Object.entries(BuiltInThemes)) {
      this.themes.set(name, theme);
    }
  }

  registerTheme(theme: Theme): void {
    this.themes.set(theme.name, theme);
  }

  setTheme(name: string): void {
    if (!this.themes.has(name)) return;
    this.activeThemeName = name;
    this.notifyListeners();
  }

  getTheme(): Theme {
    return this.themes.get(this.activeThemeName) || BuiltInThemes.dark;
  }

  getTokens(): ThemeTokens {
    const base = this.getTheme().tokens;
    return this.mergeOverrides(base);
  }

  setOverrides(overrides: Partial<ThemeTokens>): void {
    this.overrides = overrides;
    this.notifyListeners();
  }

  /** Resolve a token path like 'colors.primary' */
  resolve(path: string): unknown {
    const tokens = this.getTokens();
    const parts = path.split('.');
    let current: unknown = tokens;
    for (const part of parts) {
      if (current === undefined) return undefined;
      current = current[part];
    }
    return current;
  }

  onThemeChange(callback: (theme: Theme) => void): void {
    this.listeners.push(callback);
  }

  getActiveThemeName(): string {
    return this.activeThemeName;
  }

  listThemes(): string[] {
    return Array.from(this.themes.keys());
  }

  private mergeOverrides(base: ThemeTokens): ThemeTokens {
    if (!this.overrides || Object.keys(this.overrides).length === 0) return base;
    return {
      colors: { ...base.colors, ...(this.overrides.colors || {}) },
      spacing: { ...base.spacing, ...(this.overrides.spacing || {}) },
      borderRadius: { ...base.borderRadius, ...(this.overrides.borderRadius || {}) },
      fontSize: { ...base.fontSize, ...(this.overrides.fontSize || {}) },
      opacity: { ...base.opacity, ...(this.overrides.opacity || {}) },
      shadow: { ...base.shadow, ...(this.overrides.shadow || {}) },
    };
  }

  private notifyListeners(): void {
    const theme = this.getTheme();
    for (const cb of this.listeners) cb(theme);
  }
}
