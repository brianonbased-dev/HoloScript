/**
 * HoloScript Partner Branding Kit
 *
 * Official assets and guidelines for partner integrations.
 */

// ============================================================================
// Types
// ============================================================================

export interface BrandAsset {
  name: string;
  description: string;
  formats: AssetFormat[];
  url: string;
  usage: UsageGuidelines;
}

export interface AssetFormat {
  type: 'svg' | 'png' | 'webp' | 'ico';
  size?: { width: number; height: number };
  url: string;
}

export interface UsageGuidelines {
  allowed: string[];
  prohibited: string[];
  clearSpace: number;
  minSize: number;
}

export interface ColorPalette {
  primary: ColorDefinition;
  secondary: ColorDefinition;
  accent: ColorDefinition;
  background: { light: string; dark: string };
  text: { light: string; dark: string };
}

export interface ColorDefinition {
  hex: string;
  rgb: { r: number; g: number; b: number };
  hsl: { h: number; s: number; l: number };
}

export interface Typography {
  fontFamily: string;
  fallbacks: string[];
  headings: FontStyle;
  body: FontStyle;
  code: FontStyle;
}

export interface FontStyle {
  fontFamily: string;
  weights: number[];
  lineHeight: number;
}

export interface BadgeConfig {
  tier: 'certified' | 'verified' | 'partner' | 'premium';
  style: 'badge' | 'banner' | 'inline';
  theme: 'light' | 'dark' | 'auto';
  size: 'small' | 'medium' | 'large';
}

// ============================================================================
// Brand Assets
// ============================================================================

export const BRAND_COLORS: ColorPalette = {
  primary: {
    hex: '#6366F1',
    rgb: { r: 99, g: 102, b: 241 },
    hsl: { h: 239, s: 84, l: 67 },
  },
  secondary: {
    hex: '#8B5CF6',
    rgb: { r: 139, g: 92, b: 246 },
    hsl: { h: 258, s: 90, l: 66 },
  },
  accent: {
    hex: '#06B6D4',
    rgb: { r: 6, g: 182, b: 212 },
    hsl: { h: 189, s: 94, l: 43 },
  },
  background: {
    light: '#FFFFFF',
    dark: '#0F172A',
  },
  text: {
    light: '#1E293B',
    dark: '#F1F5F9',
  },
};

export const TYPOGRAPHY: Typography = {
  fontFamily: 'Inter',
  fallbacks: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
  headings: {
    fontFamily: 'Inter',
    weights: [600, 700, 800],
    lineHeight: 1.2,
  },
  body: {
    fontFamily: 'Inter',
    weights: [400, 500],
    lineHeight: 1.6,
  },
  code: {
    fontFamily: 'JetBrains Mono',
    weights: [400, 500],
    lineHeight: 1.5,
  },
};

export const LOGO_ASSETS: BrandAsset[] = [
  {
    name: 'HoloScript Logo',
    description: 'Primary logo for HoloScript branding',
    formats: [
      { type: 'svg', url: 'https://cdn.holoscript.net/brand/logo.svg' },
      {
        type: 'png',
        size: { width: 512, height: 512 },
        url: 'https://cdn.holoscript.net/brand/logo-512.png',
      },
      {
        type: 'png',
        size: { width: 256, height: 256 },
        url: 'https://cdn.holoscript.net/brand/logo-256.png',
      },
      {
        type: 'png',
        size: { width: 128, height: 128 },
        url: 'https://cdn.holoscript.net/brand/logo-128.png',
      },
    ],
    url: 'https://cdn.holoscript.net/brand/logo.svg',
    usage: {
      allowed: [
        'Partner documentation',
        'Integration showcases',
        'Educational materials',
        'Plugin/addon branding',
      ],
      prohibited: [
        'Modifying logo colors',
        'Stretching or distorting',
        'Adding effects or shadows',
        'Using on busy backgrounds',
      ],
      clearSpace: 24,
      minSize: 32,
    },
  },
  {
    name: 'HoloScript Wordmark',
    description: 'Text-based logo for inline usage',
    formats: [
      { type: 'svg', url: 'https://cdn.holoscript.net/brand/wordmark.svg' },
      {
        type: 'png',
        size: { width: 400, height: 80 },
        url: 'https://cdn.holoscript.net/brand/wordmark.png',
      },
    ],
    url: 'https://cdn.holoscript.net/brand/wordmark.svg',
    usage: {
      allowed: ['Headers', 'Documentation', 'Partner pages'],
      prohibited: ['Modifying typography', 'Changing letter spacing'],
      clearSpace: 16,
      minSize: 48,
    },
  },
  {
    name: 'HoloScript Icon',
    description: 'Simplified icon for small spaces',
    formats: [
      { type: 'svg', url: 'https://cdn.holoscript.net/brand/icon.svg' },
      {
        type: 'png',
        size: { width: 64, height: 64 },
        url: 'https://cdn.holoscript.net/brand/icon-64.png',
      },
      { type: 'ico', url: 'https://cdn.holoscript.net/brand/favicon.ico' },
    ],
    url: 'https://cdn.holoscript.net/brand/icon.svg',
    usage: {
      allowed: ['Favicons', 'App icons', 'Small UI elements'],
      prohibited: ['Using at sizes below 16px'],
      clearSpace: 8,
      minSize: 16,
    },
  },
];

// ============================================================================
// Badge Generator
// ============================================================================

export class BrandingKit {
  private baseUrl = 'https://cdn.holoscript.net/brand';

  /**
   * Get brand color palette
   */
  getColors(): ColorPalette {
    return BRAND_COLORS;
  }

  /**
   * Get typography guidelines
   */
  getTypography(): Typography {
    return TYPOGRAPHY;
  }

  /**
   * Get logo assets
   */
  getLogoAssets(): BrandAsset[] {
    return LOGO_ASSETS;
  }

  /**
   * Generate partner badge HTML
   */
  generateBadge(config: BadgeConfig): string {
    const { tier, style, theme, size } = config;

    const badgeUrl = `${this.baseUrl}/badges/${tier}-${style}-${theme}.svg`;
    const sizes = { small: 80, medium: 120, large: 160 };
    const width = sizes[size];

    return `<a href="https://holoscript.net/partners" target="_blank" rel="noopener">
  <img 
    src="${badgeUrl}" 
    alt="HoloScript ${tier} Partner" 
    width="${width}"
    style="display: inline-block;"
  />
</a>`;
  }

  /**
   * Generate partner badge React component
   */
  generateBadgeReact(config: BadgeConfig): string {
    const { tier, style, theme, size } = config;

    const badgeUrl = `${this.baseUrl}/badges/${tier}-${style}-${theme}.svg`;
    const sizes = { small: 80, medium: 120, large: 160 };
    const width = sizes[size];

    return `import React from 'react';

export const HoloScriptBadge: React.FC = () => (
  <a 
    href="https://holoscript.net/partners" 
    target="_blank" 
    rel="noopener noreferrer"
  >
    <img 
      src="${badgeUrl}" 
      alt="HoloScript ${tier} Partner" 
      width={${width}}
      style={{ display: 'inline-block' }}
    />
  </a>
);`;
  }

  /**
   * Generate CSS variables for brand colors
   */
  generateCSSVariables(): string {
    const colors = BRAND_COLORS;
    const typography = TYPOGRAPHY;

    return `:root {
  /* HoloScript Brand Colors */
  --holoscript-primary: ${colors.primary.hex};
  --holoscript-secondary: ${colors.secondary.hex};
  --holoscript-accent: ${colors.accent.hex};
  --holoscript-bg-light: ${colors.background.light};
  --holoscript-bg-dark: ${colors.background.dark};
  --holoscript-text-light: ${colors.text.light};
  --holoscript-text-dark: ${colors.text.dark};

  /* Typography */
  --holoscript-font-family: ${typography.fontFamily}, ${typography.fallbacks.join(', ')};
  --holoscript-font-code: ${typography.code.fontFamily}, monospace;
  --holoscript-line-height: ${typography.body.lineHeight};
  --holoscript-heading-line-height: ${typography.headings.lineHeight};
}`;
  }

  /**
   * Generate Tailwind CSS config extend
   */
  generateTailwindConfig(): string {
    const colors = BRAND_COLORS;

    return `// Add to tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        holoscript: {
          primary: '${colors.primary.hex}',
          secondary: '${colors.secondary.hex}',
          accent: '${colors.accent.hex}',
        }
      },
      fontFamily: {
        holoscript: ['${TYPOGRAPHY.fontFamily}', ...defaultTheme.fontFamily.sans],
        'holoscript-code': ['${TYPOGRAPHY.code.fontFamily}', ...defaultTheme.fontFamily.mono],
      }
    }
  }
}`;
  }

  /**
   * Get "Powered by HoloScript" badge
   */
  getPoweredByBadge(theme: 'light' | 'dark' = 'light'): string {
    const bgColor = theme === 'dark' ? BRAND_COLORS.background.dark : BRAND_COLORS.background.light;
    const textColor = theme === 'dark' ? BRAND_COLORS.text.dark : BRAND_COLORS.text.light;

    return `<div style="
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: ${bgColor};
  border-radius: 8px;
  font-family: ${TYPOGRAPHY.fontFamily}, sans-serif;
  font-size: 14px;
  color: ${textColor};
">
  <img src="${this.baseUrl}/icon.svg" alt="" width="20" height="20" />
  <span>Powered by <strong style="color: ${BRAND_COLORS.primary.hex}">HoloScript</strong></span>
</div>`;
  }

  /**
   * Validate logo usage
   */
  validateLogoUsage(context: { size: number; background: string; clearSpace: number }): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check minimum size
    if (context.size < 32) {
      issues.push(`Logo size ${context.size}px is below minimum 32px`);
    }

    // Check clear space
    if (context.clearSpace < 24) {
      issues.push(`Clear space ${context.clearSpace}px is below required 24px`);
    }

    // Check background contrast (simplified)
    const isLightBg =
      context.background.toLowerCase() === '#ffffff' ||
      context.background.toLowerCase() === 'white';
    const isDarkBg =
      context.background.toLowerCase() === '#000000' ||
      context.background.toLowerCase() === 'black';

    if (!isLightBg && !isDarkBg) {
      issues.push('Logo should be used on solid light or dark backgrounds');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}

/**
 * Create branding kit instance
 */
export function createBrandingKit(): BrandingKit {
  return new BrandingKit();
}
