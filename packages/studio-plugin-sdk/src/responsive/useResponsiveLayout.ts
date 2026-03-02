/**
 * useResponsiveLayout - React hook for responsive layout detection
 *
 * Detects the current device breakpoint, orientation, and touch capability.
 * Used by ResponsivePanel and ResponsiveToolbar to adapt their layout
 * for tablet editing scenarios.
 *
 * Breakpoint thresholds follow a mobile-first approach:
 * - mobile:  <= 767px
 * - tablet:  768px - 1024px
 * - desktop: 1025px - 1439px
 * - wide:    >= 1440px
 *
 * @module @holoscript/studio-plugin-sdk/responsive
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ResponsiveBreakpoint,
  ResponsiveBreakpoints,
  DeviceOrientation,
} from '../types.js';

// ── Default Breakpoints ──────────────────────────────────────────────────────

export const DEFAULT_BREAKPOINTS: ResponsiveBreakpoints = {
  mobile: 767,
  tablet: 1024,
  desktop: 1439,
  wide: 1440,
};

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResponsiveLayoutState {
  /** Current active breakpoint */
  breakpoint: ResponsiveBreakpoint;
  /** Current device orientation */
  orientation: DeviceOrientation;
  /** Whether the device supports touch input */
  isTouchDevice: boolean;
  /** Whether a hardware keyboard is likely attached */
  hasKeyboard: boolean;
  /** Current viewport width in pixels */
  viewportWidth: number;
  /** Current viewport height in pixels */
  viewportHeight: number;
  /** Whether the device is considered a tablet (touch + tablet breakpoint) */
  isTablet: boolean;
  /** Whether the device is considered mobile */
  isMobile: boolean;
  /** Whether the device is desktop or wider */
  isDesktop: boolean;
  /** Pixel density of the display */
  pixelRatio: number;
}

export interface UseResponsiveLayoutOptions {
  /** Custom breakpoint thresholds */
  breakpoints?: Partial<ResponsiveBreakpoints>;
  /** Debounce delay for resize events in ms (default: 150) */
  debounceMs?: number;
  /** Whether to listen for orientation changes (default: true) */
  listenOrientation?: boolean;
}

// ── Helper: Determine Breakpoint ─────────────────────────────────────────────

function getBreakpoint(
  width: number,
  breakpoints: ResponsiveBreakpoints,
): ResponsiveBreakpoint {
  if (width <= breakpoints.mobile) return 'mobile';
  if (width <= breakpoints.tablet) return 'tablet';
  if (width <= breakpoints.desktop) return 'desktop';
  return 'wide';
}

// ── Helper: Detect Touch Support ─────────────────────────────────────────────

function detectTouchSupport(): boolean {
  if (typeof window === 'undefined') return false;

  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is a legacy IE property
    (navigator.msMaxTouchPoints != null && navigator.msMaxTouchPoints > 0)
  );
}

// ── Helper: Detect Hardware Keyboard ─────────────────────────────────────────

function detectKeyboard(): boolean {
  if (typeof window === 'undefined') return true;

  // Heuristic: devices with hover support likely have a keyboard
  if (window.matchMedia) {
    const hoverMedia = window.matchMedia('(hover: hover)');
    const pointerMedia = window.matchMedia('(pointer: fine)');
    return hoverMedia.matches || pointerMedia.matches;
  }

  return !detectTouchSupport();
}

// ── Helper: Get Orientation ──────────────────────────────────────────────────

function getOrientation(): DeviceOrientation {
  if (typeof window === 'undefined') return 'landscape';

  // Use Screen Orientation API if available
  if (screen.orientation) {
    return screen.orientation.type.startsWith('portrait') ? 'portrait' : 'landscape';
  }

  // Fallback to comparing dimensions
  return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useResponsiveLayout(
  options: UseResponsiveLayoutOptions = {},
): ResponsiveLayoutState {
  const {
    breakpoints: customBreakpoints,
    debounceMs = 150,
    listenOrientation = true,
  } = options;

  const breakpoints: ResponsiveBreakpoints = {
    ...DEFAULT_BREAKPOINTS,
    ...customBreakpoints,
  };

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getState = useCallback((): ResponsiveLayoutState => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const height = typeof window !== 'undefined' ? window.innerHeight : 768;
    const breakpoint = getBreakpoint(width, breakpoints);
    const isTouchDevice = detectTouchSupport();
    const orientation = getOrientation();

    return {
      breakpoint,
      orientation,
      isTouchDevice,
      hasKeyboard: detectKeyboard(),
      viewportWidth: width,
      viewportHeight: height,
      isTablet: breakpoint === 'tablet' || (isTouchDevice && breakpoint === 'desktop'),
      isMobile: breakpoint === 'mobile',
      isDesktop: breakpoint === 'desktop' || breakpoint === 'wide',
      pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    };
  }, [breakpoints]);

  const [state, setState] = useState<ResponsiveLayoutState>(getState);

  useEffect(() => {
    const handleUpdate = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        setState(getState());
      }, debounceMs);
    };

    // Listen for resize events
    window.addEventListener('resize', handleUpdate);

    // Listen for orientation changes
    if (listenOrientation) {
      if (screen.orientation) {
        screen.orientation.addEventListener('change', handleUpdate);
      } else {
        // Fallback for older browsers
        window.addEventListener('orientationchange', handleUpdate);
      }
    }

    // Listen for pointer changes (e.g., connecting/disconnecting stylus)
    const pointerMedia = window.matchMedia?.('(pointer: fine)');
    if (pointerMedia?.addEventListener) {
      pointerMedia.addEventListener('change', handleUpdate);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      window.removeEventListener('resize', handleUpdate);

      if (listenOrientation) {
        if (screen.orientation) {
          screen.orientation.removeEventListener('change', handleUpdate);
        } else {
          window.removeEventListener('orientationchange', handleUpdate);
        }
      }

      if (pointerMedia?.removeEventListener) {
        pointerMedia.removeEventListener('change', handleUpdate);
      }
    };
  }, [getState, debounceMs, listenOrientation]);

  return state;
}

// ── Utility: CSS Class Generator ─────────────────────────────────────────────

/**
 * Generates CSS class names based on the current responsive state.
 * Useful for applying conditional styles without media queries.
 *
 * @example
 * ```tsx
 * const layout = useResponsiveLayout();
 * const classes = getResponsiveClasses(layout);
 * // Returns: 'studio-tablet studio-landscape studio-touch'
 * ```
 */
export function getResponsiveClasses(state: ResponsiveLayoutState): string {
  const classes: string[] = [
    `studio-${state.breakpoint}`,
    `studio-${state.orientation}`,
  ];

  if (state.isTouchDevice) {
    classes.push('studio-touch');
  }

  if (state.isTablet) {
    classes.push('studio-tablet-mode');
  }

  return classes.join(' ');
}
