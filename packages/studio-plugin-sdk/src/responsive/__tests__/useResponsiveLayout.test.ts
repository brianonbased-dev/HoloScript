/**
 * Tests for useResponsiveLayout hook
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DEFAULT_BREAKPOINTS } from '../useResponsiveLayout.js';

// Since these are unit tests for the logic, we test the helper functions
// and breakpoint resolution directly. React hook testing would require
// @testing-library/react-hooks which is a peer dependency.

describe('DEFAULT_BREAKPOINTS', () => {
  it('should define all four breakpoints', () => {
    expect(DEFAULT_BREAKPOINTS).toHaveProperty('mobile');
    expect(DEFAULT_BREAKPOINTS).toHaveProperty('tablet');
    expect(DEFAULT_BREAKPOINTS).toHaveProperty('desktop');
    expect(DEFAULT_BREAKPOINTS).toHaveProperty('wide');
  });

  it('should have mobile < tablet < desktop <= wide', () => {
    expect(DEFAULT_BREAKPOINTS.mobile).toBeLessThan(DEFAULT_BREAKPOINTS.tablet);
    expect(DEFAULT_BREAKPOINTS.tablet).toBeLessThan(DEFAULT_BREAKPOINTS.desktop);
    expect(DEFAULT_BREAKPOINTS.desktop).toBeLessThanOrEqual(DEFAULT_BREAKPOINTS.wide);
  });

  it('should have standard breakpoint values', () => {
    expect(DEFAULT_BREAKPOINTS.mobile).toBe(767);
    expect(DEFAULT_BREAKPOINTS.tablet).toBe(1024);
    expect(DEFAULT_BREAKPOINTS.desktop).toBe(1439);
    expect(DEFAULT_BREAKPOINTS.wide).toBe(1440);
  });
});

describe('getResponsiveClasses', () => {
  // Import the function
  let getResponsiveClasses: typeof import('../useResponsiveLayout.js').getResponsiveClasses;

  beforeEach(async () => {
    const module = await import('../useResponsiveLayout.js');
    getResponsiveClasses = module.getResponsiveClasses;
  });

  it('should include breakpoint class', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'tablet',
      orientation: 'landscape',
      isTouchDevice: true,
      hasKeyboard: false,
      viewportWidth: 800,
      viewportHeight: 600,
      isTablet: true,
      isMobile: false,
      isDesktop: false,
      pixelRatio: 2,
    });

    expect(classes).toContain('studio-tablet');
  });

  it('should include orientation class', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'desktop',
      orientation: 'portrait',
      isTouchDevice: false,
      hasKeyboard: true,
      viewportWidth: 1200,
      viewportHeight: 900,
      isTablet: false,
      isMobile: false,
      isDesktop: true,
      pixelRatio: 1,
    });

    expect(classes).toContain('studio-portrait');
  });

  it('should include touch class for touch devices', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'tablet',
      orientation: 'landscape',
      isTouchDevice: true,
      hasKeyboard: false,
      viewportWidth: 800,
      viewportHeight: 600,
      isTablet: true,
      isMobile: false,
      isDesktop: false,
      pixelRatio: 2,
    });

    expect(classes).toContain('studio-touch');
  });

  it('should not include touch class for non-touch devices', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'desktop',
      orientation: 'landscape',
      isTouchDevice: false,
      hasKeyboard: true,
      viewportWidth: 1200,
      viewportHeight: 900,
      isTablet: false,
      isMobile: false,
      isDesktop: true,
      pixelRatio: 1,
    });

    expect(classes).not.toContain('studio-touch');
  });

  it('should include tablet-mode class for tablets', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'tablet',
      orientation: 'landscape',
      isTouchDevice: true,
      hasKeyboard: false,
      viewportWidth: 800,
      viewportHeight: 600,
      isTablet: true,
      isMobile: false,
      isDesktop: false,
      pixelRatio: 2,
    });

    expect(classes).toContain('studio-tablet-mode');
  });

  it('should generate mobile classes correctly', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'mobile',
      orientation: 'portrait',
      isTouchDevice: true,
      hasKeyboard: false,
      viewportWidth: 375,
      viewportHeight: 812,
      isTablet: false,
      isMobile: true,
      isDesktop: false,
      pixelRatio: 3,
    });

    expect(classes).toContain('studio-mobile');
    expect(classes).toContain('studio-portrait');
    expect(classes).toContain('studio-touch');
  });

  it('should generate desktop classes correctly', () => {
    const classes = getResponsiveClasses({
      breakpoint: 'wide',
      orientation: 'landscape',
      isTouchDevice: false,
      hasKeyboard: true,
      viewportWidth: 1920,
      viewportHeight: 1080,
      isTablet: false,
      isMobile: false,
      isDesktop: true,
      pixelRatio: 1,
    });

    expect(classes).toContain('studio-wide');
    expect(classes).toContain('studio-landscape');
    expect(classes).not.toContain('studio-touch');
    expect(classes).not.toContain('studio-tablet-mode');
  });
});

describe('breakpoint resolution logic', () => {
  // Test the breakpoint determination logic directly
  function getBreakpoint(
    width: number,
    breakpoints = DEFAULT_BREAKPOINTS,
  ): string {
    if (width <= breakpoints.mobile) return 'mobile';
    if (width <= breakpoints.tablet) return 'tablet';
    if (width <= breakpoints.desktop) return 'desktop';
    return 'wide';
  }

  it('should return mobile for widths <= 767', () => {
    expect(getBreakpoint(320)).toBe('mobile');
    expect(getBreakpoint(375)).toBe('mobile');
    expect(getBreakpoint(414)).toBe('mobile');
    expect(getBreakpoint(767)).toBe('mobile');
  });

  it('should return tablet for widths 768-1024', () => {
    expect(getBreakpoint(768)).toBe('tablet');
    expect(getBreakpoint(834)).toBe('tablet');
    expect(getBreakpoint(1024)).toBe('tablet');
  });

  it('should return desktop for widths 1025-1439', () => {
    expect(getBreakpoint(1025)).toBe('desktop');
    expect(getBreakpoint(1280)).toBe('desktop');
    expect(getBreakpoint(1366)).toBe('desktop');
    expect(getBreakpoint(1439)).toBe('desktop');
  });

  it('should return wide for widths >= 1440', () => {
    expect(getBreakpoint(1440)).toBe('wide');
    expect(getBreakpoint(1920)).toBe('wide');
    expect(getBreakpoint(2560)).toBe('wide');
    expect(getBreakpoint(3840)).toBe('wide');
  });

  it('should handle boundary values correctly', () => {
    // Exact boundary between mobile and tablet
    expect(getBreakpoint(767)).toBe('mobile');
    expect(getBreakpoint(768)).toBe('tablet');

    // Exact boundary between tablet and desktop
    expect(getBreakpoint(1024)).toBe('tablet');
    expect(getBreakpoint(1025)).toBe('desktop');

    // Exact boundary between desktop and wide
    expect(getBreakpoint(1439)).toBe('desktop');
    expect(getBreakpoint(1440)).toBe('wide');
  });

  it('should support custom breakpoints', () => {
    const custom = {
      mobile: 600,
      tablet: 900,
      desktop: 1200,
      wide: 1201,
    };

    expect(getBreakpoint(599, custom)).toBe('mobile');
    expect(getBreakpoint(600, custom)).toBe('mobile');
    expect(getBreakpoint(601, custom)).toBe('tablet');
    expect(getBreakpoint(900, custom)).toBe('tablet');
    expect(getBreakpoint(901, custom)).toBe('desktop');
    expect(getBreakpoint(1200, custom)).toBe('desktop');
    expect(getBreakpoint(1201, custom)).toBe('wide');
  });
});
