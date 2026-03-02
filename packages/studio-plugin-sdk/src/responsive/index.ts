/**
 * Responsive Layout & Touch Gesture Support for HoloScript Studio
 *
 * Provides tablet-optimized panel layouts, touch gesture recognition,
 * and adaptive toolbar components for the Studio plugin SDK.
 *
 * ## Architecture
 *
 * ```
 * useResponsiveLayout (hook)
 *   |-- Detects breakpoint, orientation, touch capability
 *   |-- Drives layout decisions for panels and toolbars
 *   |
 * useTouchGestures (hook)
 *   |-- Recognizes swipe, pinch, long-press, double-tap
 *   |-- Fires gesture events to consuming components
 *   |
 * ResponsivePanel (component)
 *   |-- Wraps any panel with adaptive layout behavior
 *   |-- Docked -> Drawer -> Fullscreen based on breakpoint
 *   |-- Swipe-to-dismiss, drag handle, collapse/expand
 *   |
 * ResponsiveToolbar (component)
 *   |-- Horizontal bar -> Floating action bar based on breakpoint
 *   |-- Overflow menu for low-priority buttons
 *   |-- Enlarged touch targets (44px minimum per WCAG)
 *   |-- Long-press for secondary actions
 * ```
 *
 * @module @holoscript/studio-plugin-sdk/responsive
 */

// Hooks
export {
  useResponsiveLayout,
  getResponsiveClasses,
  DEFAULT_BREAKPOINTS,
  type ResponsiveLayoutState,
  type UseResponsiveLayoutOptions,
} from './useResponsiveLayout.js';

export {
  useTouchGestures,
  type UseTouchGesturesOptions,
  type TouchGestureState,
} from './useTouchGestures.js';

// Components
export { ResponsivePanel, type ResponsivePanelProps } from './ResponsivePanel.js';
export { ResponsiveToolbar, type ResponsiveToolbarProps } from './ResponsiveToolbar.js';
