// @vitest-environment node
/**
 * deviceDetect — UA + capability detection tests.
 *
 * Exercises every branch of detectViewer() with explicit option injection
 * (no global mutation) plus the unit predicates.
 */

import { describe, it, expect } from 'vitest';

import {
  detectViewer,
  hasWebXRRuntime,
  isLookingGlassEnvironment,
  isVisionProUserAgent,
} from './deviceDetect';

describe('deviceDetect — Vision Pro UA matching', () => {
  it.each([
    'Mozilla/5.0 (VisionOS; CPU OS 1_0) AppleWebKit/605.1.15',
    'Mozilla/5.0 (Vision Pro) AppleWebKit/605',
    'AppleWebKit/605 Vision/1.0',
  ])('detects %s as Vision Pro', (ua) => {
    expect(isVisionProUserAgent(ua)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605',
    'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit/605',
    'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
    '',
  ])('rejects non-Vision UA %s', (ua) => {
    expect(isVisionProUserAgent(ua)).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isVisionProUserAgent(undefined as unknown as string)).toBe(false);
    expect(isVisionProUserAgent(null as unknown as string)).toBe(false);
  });
});

describe('deviceDetect — Looking Glass environment', () => {
  it('returns true when explicit hasHoloplayCore=true', () => {
    expect(isLookingGlassEnvironment({ hasHoloplayCore: true })).toBe(true);
  });

  it('returns false when explicit hasHoloplayCore=false (overrides win)', () => {
    expect(
      isLookingGlassEnvironment({
        hasHoloplayCore: false,
        win: { HoloPlayCore: {} },
      })
    ).toBe(false);
  });

  it('falls back to win.HoloPlayCore when hasHoloplayCore not set', () => {
    expect(isLookingGlassEnvironment({ win: { HoloPlayCore: {} } })).toBe(true);
    expect(isLookingGlassEnvironment({ win: {} })).toBe(false);
    expect(isLookingGlassEnvironment({})).toBe(false);
  });
});

describe('deviceDetect — WebXR probe', () => {
  it('returns true when nav.xr is truthy', () => {
    expect(hasWebXRRuntime({ xr: {} })).toBe(true);
  });
  it('returns false when missing or undefined', () => {
    expect(hasWebXRRuntime({})).toBe(false);
    expect(hasWebXRRuntime(undefined)).toBe(false);
  });
});

describe('detectViewer — render path picker', () => {
  it('picks looking-glass when holoplay-core is present', () => {
    expect(
      detectViewer({
        userAgent: 'Mozilla/5.0 (Macintosh)',
        hasHoloplayCore: true,
      })
    ).toBe('looking-glass');
  });

  it('picks looking-glass even with Vision Pro UA when holoplay-core present', () => {
    // Holoplay is opt-in; user installed the SDK -> they meant it.
    expect(
      detectViewer({
        userAgent: 'Mozilla/5.0 (VisionOS) AppleWebKit/605',
        hasHoloplayCore: true,
      })
    ).toBe('looking-glass');
  });

  it('picks vision-pro on visionOS UA without holoplay-core', () => {
    expect(
      detectViewer({
        userAgent: 'Mozilla/5.0 (VisionOS; CPU OS 1_0) AppleWebKit/605.1.15',
        hasHoloplayCore: false,
      })
    ).toBe('vision-pro');
  });

  it('defaults to parallax for desktop Chrome', () => {
    expect(
      detectViewer({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
        hasHoloplayCore: false,
      })
    ).toBe('parallax');
  });

  it('defaults to parallax for iPhone Safari', () => {
    expect(
      detectViewer({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        hasHoloplayCore: false,
      })
    ).toBe('parallax');
  });

  it('defaults to parallax with no UA', () => {
    expect(detectViewer({ userAgent: '', hasHoloplayCore: false })).toBe(
      'parallax'
    );
  });

  it('defaults to parallax with no options at all (no globals available in node)', () => {
    // navigator is undefined in node test env; function must not throw.
    const result = detectViewer();
    expect(['looking-glass', 'vision-pro', 'parallax']).toContain(result);
    // Without any signal, the answer is parallax.
    expect(result).toBe('parallax');
  });
});
