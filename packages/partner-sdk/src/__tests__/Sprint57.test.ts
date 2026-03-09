/**
 * Sprint 57 — @partner-sdk acceptance tests
 * Covers: crypto utilities (hmacSha256, sha256, timingSafeEqual, randomHex,
 *         verifyHmacSha256), BrandingKit (colors, typography, badge generation,
 *         CSS variables, validateLogoUsage).
 */
import { describe, it, expect } from 'vitest';
import {
  hmacSha256,
  sha256,
  timingSafeEqual,
  randomHex,
  verifyHmacSha256,
} from '../utils/crypto.js';
import {
  BrandingKit,
  createBrandingKit,
  BRAND_COLORS,
  TYPOGRAPHY,
  LOGO_ASSETS,
} from '../branding/BrandingKit.js';

// ═══════════════════════════════════════════════
// hmacSha256
// ═══════════════════════════════════════════════
describe('hmacSha256', () => {
  it('is a function', () => {
    expect(typeof hmacSha256).toBe('function');
  });

  it('returns a 64-char hex string', async () => {
    const sig = await hmacSha256('hello', 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('same input + key produces same signature', async () => {
    const a = await hmacSha256('message', 'key');
    const b = await hmacSha256('message', 'key');
    expect(a).toBe(b);
  });

  it('different messages produce different signatures', async () => {
    const a = await hmacSha256('msg1', 'key');
    const b = await hmacSha256('msg2', 'key');
    expect(a).not.toBe(b);
  });

  it('different keys produce different signatures', async () => {
    const a = await hmacSha256('message', 'key1');
    const b = await hmacSha256('message', 'key2');
    expect(a).not.toBe(b);
  });

  it('handles empty message', async () => {
    const sig = await hmacSha256('', 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles single-char key', async () => {
    const sig = await hmacSha256('message', 'k');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });

  it('handles unicode content', async () => {
    const sig = await hmacSha256('héllo wörld 🌍', 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ═══════════════════════════════════════════════
// sha256
// ═══════════════════════════════════════════════
describe('sha256', () => {
  it('returns a 64-char hex string', async () => {
    const hash = await sha256('hello world');
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('known test vector', async () => {
    // SHA-256 of empty string
    const hash = await sha256('');
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('same input always produces same hash', async () => {
    const a = await sha256('HoloScript');
    const b = await sha256('HoloScript');
    expect(a).toBe(b);
  });

  it('different inputs produce different hashes', async () => {
    const a = await sha256('abc');
    const b = await sha256('abd');
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════
// timingSafeEqual
// ═══════════════════════════════════════════════
describe('timingSafeEqual', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
  });

  it('returns false for different lengths', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });

  it('returns true for empty strings', () => {
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('returns false for one empty, one non-empty', () => {
    expect(timingSafeEqual('', 'a')).toBe(false);
  });

  it('handles hex strings (typical HMAC use case)', () => {
    const hex = 'a3f1d2c4e5b6a7c8d9e0f1a2b3c4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2';
    expect(timingSafeEqual(hex, hex)).toBe(true);
    const hex2 = 'b3f1d2c4e5b6a7c8d9e0f1a2b3c4d5e6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2';
    expect(timingSafeEqual(hex, hex2)).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// randomHex
// ═══════════════════════════════════════════════
describe('randomHex', () => {
  it('returns a hex string', async () => {
    const r = await randomHex();
    expect(r).toMatch(/^[a-f0-9]+$/);
  });

  it('default length is 32 chars (16 bytes)', async () => {
    const r = await randomHex(16);
    expect(r).toHaveLength(32);
  });

  it('custom length produces correct output size', async () => {
    const r = await randomHex(8);
    expect(r).toHaveLength(16);
  });

  it('produces different values on each call', async () => {
    const a = await randomHex();
    const b = await randomHex();
    expect(a).not.toBe(b);
  });
});

// ═══════════════════════════════════════════════
// verifyHmacSha256
// ═══════════════════════════════════════════════
describe('verifyHmacSha256', () => {
  it('verifies a valid signature', async () => {
    const message = 'payload data';
    const secret = 'my-secret-key';
    const sig = await hmacSha256(message, secret);
    expect(await verifyHmacSha256(message, sig, secret)).toBe(true);
  });

  it('rejects a tampered message', async () => {
    const sig = await hmacSha256('original', 'secret');
    expect(await verifyHmacSha256('tampered', sig, 'secret')).toBe(false);
  });

  it('rejects a wrong signature', async () => {
    expect(await verifyHmacSha256('message', 'deadbeef'.repeat(8), 'secret')).toBe(false);
  });

  it('rejects when secret is different', async () => {
    const sig = await hmacSha256('message', 'key1');
    expect(await verifyHmacSha256('message', sig, 'key2')).toBe(false);
  });

  it('verifies empty message with non-empty key', async () => {
    const sig = await hmacSha256('', 'secret');
    expect(await verifyHmacSha256('', sig, 'secret')).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// BRAND_COLORS constant
// ═══════════════════════════════════════════════
describe('BRAND_COLORS', () => {
  it('has primary hex color', () => {
    expect(BRAND_COLORS.primary.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('primary RGB values are in range', () => {
    const { r, g, b } = BRAND_COLORS.primary.rgb;
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(255);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThanOrEqual(255);
  });

  it('has secondary and accent colors', () => {
    expect(BRAND_COLORS.secondary.hex).toBeTruthy();
    expect(BRAND_COLORS.accent.hex).toBeTruthy();
  });

  it('has background and text colors', () => {
    expect(BRAND_COLORS.background.light).toBeTruthy();
    expect(BRAND_COLORS.background.dark).toBeTruthy();
    expect(BRAND_COLORS.text.light).toBeTruthy();
    expect(BRAND_COLORS.text.dark).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════
// TYPOGRAPHY constant
// ═══════════════════════════════════════════════
describe('TYPOGRAPHY', () => {
  it('has fontFamily', () => {
    expect(typeof TYPOGRAPHY.fontFamily).toBe('string');
    expect(TYPOGRAPHY.fontFamily.length).toBeGreaterThan(0);
  });

  it('has fallbacks array', () => {
    expect(Array.isArray(TYPOGRAPHY.fallbacks)).toBe(true);
    expect(TYPOGRAPHY.fallbacks.length).toBeGreaterThan(0);
  });

  it('headings have weights', () => {
    expect(Array.isArray(TYPOGRAPHY.headings.weights)).toBe(true);
    expect(TYPOGRAPHY.headings.weights.length).toBeGreaterThan(0);
  });

  it('code block uses monospace font', () => {
    expect(TYPOGRAPHY.code.fontFamily).toBeTruthy();
  });

  it('body lineHeight is reasonable', () => {
    expect(TYPOGRAPHY.body.lineHeight).toBeGreaterThan(1);
    expect(TYPOGRAPHY.body.lineHeight).toBeLessThan(3);
  });
});

// ═══════════════════════════════════════════════
// LOGO_ASSETS constant
// ═══════════════════════════════════════════════
describe('LOGO_ASSETS', () => {
  it('has at least 3 assets', () => {
    expect(LOGO_ASSETS.length).toBeGreaterThanOrEqual(3);
  });

  it('each asset has name, url, and formats', () => {
    for (const asset of LOGO_ASSETS) {
      expect(typeof asset.name).toBe('string');
      expect(typeof asset.url).toBe('string');
      expect(Array.isArray(asset.formats)).toBe(true);
      expect(asset.formats.length).toBeGreaterThan(0);
    }
  });

  it('assets have usage guidelines', () => {
    for (const asset of LOGO_ASSETS) {
      expect(Array.isArray(asset.usage.allowed)).toBe(true);
      expect(Array.isArray(asset.usage.prohibited)).toBe(true);
      expect(typeof asset.usage.minSize).toBe('number');
    }
  });

  it('SVG format is always included', () => {
    for (const asset of LOGO_ASSETS) {
      expect(asset.formats.some((f) => f.type === 'svg')).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════
// BrandingKit
// ═══════════════════════════════════════════════
describe('BrandingKit', () => {
  let kit: BrandingKit;

  beforeEach(() => {
    kit = new BrandingKit();
  });

  // ── getColors ──
  it('getColors returns BRAND_COLORS', () => {
    expect(kit.getColors()).toEqual(BRAND_COLORS);
  });

  // ── getTypography ──
  it('getTypography returns TYPOGRAPHY', () => {
    expect(kit.getTypography()).toEqual(TYPOGRAPHY);
  });

  // ── getLogoAssets ──
  it('getLogoAssets returns LOGO_ASSETS array', () => {
    const assets = kit.getLogoAssets();
    expect(assets).toEqual(LOGO_ASSETS);
    expect(assets.length).toBeGreaterThanOrEqual(3);
  });

  // ── generateBadge ──
  it('generateBadge returns HTML string', () => {
    const html = kit.generateBadge({
      tier: 'certified',
      style: 'badge',
      theme: 'light',
      size: 'medium',
    });
    expect(typeof html).toBe('string');
    expect(html).toContain('<a ');
    expect(html).toContain('<img ');
  });

  it('generateBadge includes tier in badge URL', () => {
    const html = kit.generateBadge({
      tier: 'premium',
      style: 'banner',
      theme: 'dark',
      size: 'large',
    });
    expect(html).toContain('premium');
    expect(html).toContain('banner');
    expect(html).toContain('dark');
  });

  it('generateBadge small = width 80', () => {
    const html = kit.generateBadge({
      tier: 'partner',
      style: 'badge',
      theme: 'light',
      size: 'small',
    });
    expect(html).toContain('width="80"');
  });

  it('generateBadge medium = width 120', () => {
    const html = kit.generateBadge({
      tier: 'partner',
      style: 'badge',
      theme: 'light',
      size: 'medium',
    });
    expect(html).toContain('width="120"');
  });

  it('generateBadge large = width 160', () => {
    const html = kit.generateBadge({
      tier: 'partner',
      style: 'badge',
      theme: 'light',
      size: 'large',
    });
    expect(html).toContain('width="160"');
  });

  // ── generateBadgeReact ──
  it('generateBadgeReact returns React component string', () => {
    const code = kit.generateBadgeReact({
      tier: 'verified',
      style: 'inline',
      theme: 'auto',
      size: 'small',
    });
    expect(code).toContain('React');
    expect(code).toContain('HoloScriptBadge');
    expect(code).toContain('import');
  });

  it('generateBadgeReact includes correct width', () => {
    const code = kit.generateBadgeReact({
      tier: 'certified',
      style: 'badge',
      theme: 'light',
      size: 'large',
    });
    expect(code).toContain('160');
  });

  // ── generateCSSVariables ──
  it('generateCSSVariables returns CSS custom properties', () => {
    const css = kit.generateCSSVariables();
    expect(css).toContain(':root');
    expect(css).toContain('--holoscript-primary');
    expect(css).toContain('--holoscript-secondary');
    expect(css).toContain('--holoscript-accent');
  });

  it('generateCSSVariables includes typography variables', () => {
    const css = kit.generateCSSVariables();
    expect(css).toContain('--holoscript-font-family');
    expect(css).toContain('--holoscript-font-code');
  });

  it('generateCSSVariables includes actual hex values', () => {
    const css = kit.generateCSSVariables();
    expect(css).toContain(BRAND_COLORS.primary.hex);
    expect(css).toContain(BRAND_COLORS.secondary.hex);
  });

  // ── generateTailwindConfig ──
  it('generateTailwindConfig returns JS config string', () => {
    const config = kit.generateTailwindConfig();
    expect(config).toContain('tailwind.config.js');
    expect(config).toContain('holoscript');
    expect(config).toContain(BRAND_COLORS.primary.hex);
  });

  // ── getPoweredByBadge ──
  it('getPoweredByBadge returns HTML for light theme', () => {
    const badge = kit.getPoweredByBadge('light');
    expect(badge).toContain('Powered by');
    expect(badge).toContain('HoloScript');
  });

  it('getPoweredByBadge returns HTML for dark theme', () => {
    const badge = kit.getPoweredByBadge('dark');
    expect(badge).toContain('Powered by');
    expect(badge).toContain(BRAND_COLORS.background.dark);
  });

  it('getPoweredByBadge defaults to light', () => {
    const badge = kit.getPoweredByBadge();
    expect(badge).toContain(BRAND_COLORS.background.light);
  });

  // ── validateLogoUsage ──
  it('valid usage passes', () => {
    const result = kit.validateLogoUsage({ size: 64, background: '#ffffff', clearSpace: 24 });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('size below minimum fails', () => {
    const result = kit.validateLogoUsage({ size: 16, background: '#ffffff', clearSpace: 24 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('size'))).toBe(true);
  });

  it('insufficient clear space fails', () => {
    const result = kit.validateLogoUsage({ size: 64, background: '#ffffff', clearSpace: 8 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes('clear space') || i.includes('Clear'))).toBe(true);
  });

  it('non-solid background warns', () => {
    const result = kit.validateLogoUsage({ size: 64, background: '#ff0000', clearSpace: 24 });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('multiple issues reported together', () => {
    const result = kit.validateLogoUsage({ size: 10, background: '#aabbcc', clearSpace: 5 });
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});

// ── createBrandingKit factory ──
describe('createBrandingKit', () => {
  it('returns a BrandingKit instance', () => {
    const kit = createBrandingKit();
    expect(kit).toBeInstanceOf(BrandingKit);
  });

  it('each call returns a separate instance', () => {
    const a = createBrandingKit();
    const b = createBrandingKit();
    expect(a).not.toBe(b);
  });
});

import { beforeEach } from 'vitest';
