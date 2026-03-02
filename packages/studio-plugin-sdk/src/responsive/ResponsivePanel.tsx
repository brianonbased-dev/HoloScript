/**
 * ResponsivePanel - Adaptive panel wrapper for tablet editing
 *
 * Wraps any Studio panel component to provide responsive layout behavior:
 * - Automatically switches between docked, drawer, floating, and fullscreen modes
 * - Supports touch gestures for panel interaction (swipe to dismiss, expand, etc.)
 * - Respects WCAG 2.1 touch target sizing (minimum 44x44px)
 * - Smooth CSS transitions for layout changes
 * - Handles orientation changes gracefully
 *
 * ## Usage
 *
 * ```tsx
 * import { ResponsivePanel } from '@holoscript/studio-plugin-sdk/responsive';
 *
 * <ResponsivePanel
 *   panel={myPanelConfig}
 *   onDismiss={() => setVisible(false)}
 * >
 *   <MyPanelContent />
 * </ResponsivePanel>
 * ```
 *
 * @module @holoscript/studio-plugin-sdk/responsive
 */

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
  type CSSProperties,
} from 'react';

import type {
  CustomPanel,
  PanelLayoutMode,
  ResponsiveBreakpoint,
  ResponsivePanelConfig,
  TouchGestureAction,
  TouchGestureEvent,
  TouchGestureType,
} from '../types.js';
import { useResponsiveLayout, type ResponsiveLayoutState } from './useResponsiveLayout.js';
import { useTouchGestures } from './useTouchGestures.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResponsivePanelProps {
  /** The panel configuration from the plugin */
  panel: CustomPanel;
  /** Children (panel content) */
  children: ReactNode;
  /** Whether the panel is currently visible */
  visible?: boolean;
  /** Callback when the panel is dismissed (via gesture or close button) */
  onDismiss?: () => void;
  /** Callback when the panel is expanded */
  onExpand?: () => void;
  /** Callback when the panel is collapsed */
  onCollapse?: () => void;
  /** Callback when the panel layout mode changes */
  onLayoutChange?: (mode: PanelLayoutMode, breakpoint: ResponsiveBreakpoint) => void;
  /** Override the responsive layout detection (for testing) */
  layoutOverride?: Partial<ResponsiveLayoutState>;
  /** Additional CSS class names */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
}

// ── Default Responsive Panel Configs ─────────────────────────────────────────

const DEFAULT_RESPONSIVE_CONFIG: Record<ResponsiveBreakpoint, ResponsivePanelConfig> = {
  mobile: {
    layoutMode: 'fullscreen',
    defaultCollapsed: true,
    swipeToDismiss: true,
  },
  tablet: {
    layoutMode: 'drawer',
    position: 'right',
    width: '70%',
    swipeToDismiss: true,
  },
  desktop: {
    layoutMode: 'docked',
  },
  wide: {
    layoutMode: 'docked',
  },
};

// ── Helper: Resolve Panel Config for Breakpoint ──────────────────────────────

function resolveConfig(
  panel: CustomPanel,
  breakpoint: ResponsiveBreakpoint,
): ResponsivePanelConfig {
  const defaults = DEFAULT_RESPONSIVE_CONFIG[breakpoint];
  const overrides = panel.responsive?.[breakpoint];

  return {
    ...defaults,
    ...overrides,
  };
}

// ── Helper: Compute Panel Styles ─────────────────────────────────────────────

function computeStyles(
  config: ResponsivePanelConfig,
  panel: CustomPanel,
  isCollapsed: boolean,
  isVisible: boolean,
  layout: ResponsiveLayoutState,
): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    willChange: 'transform, width, height',
    zIndex: config.zIndex ?? 100,
    touchAction: 'none', // Prevent browser gestures on the panel itself
  };

  const mode = config.layoutMode ?? 'docked';

  switch (mode) {
    case 'docked': {
      const position = config.position ?? panel.position ?? 'right';
      const width = config.width ?? panel.width ?? 400;
      const height = config.height ?? panel.height ?? '100%';

      if (position === 'bottom') {
        Object.assign(base, {
          bottom: 0,
          left: 0,
          right: 0,
          height: isCollapsed ? 40 : height,
          transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        });
      } else if (position === 'top') {
        Object.assign(base, {
          top: 0,
          left: 0,
          right: 0,
          height: isCollapsed ? 40 : height,
          transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
        });
      } else if (position === 'left') {
        Object.assign(base, {
          top: 0,
          left: 0,
          bottom: 0,
          width: isCollapsed ? 40 : width,
          transform: isVisible ? 'translateX(0)' : 'translateX(-100%)',
        });
      } else {
        // right
        Object.assign(base, {
          top: 0,
          right: 0,
          bottom: 0,
          width: isCollapsed ? 40 : width,
          transform: isVisible ? 'translateX(0)' : 'translateX(100%)',
        });
      }
      break;
    }

    case 'drawer': {
      const position = config.position ?? panel.position ?? 'right';
      const width = config.width ?? '80%';
      const height = config.height ?? '60%';

      // Backdrop overlay for drawer mode
      if (position === 'bottom') {
        Object.assign(base, {
          bottom: 0,
          left: 0,
          right: 0,
          height,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          transform: isVisible && !isCollapsed ? 'translateY(0)' : 'translateY(100%)',
        });
      } else if (position === 'left') {
        Object.assign(base, {
          top: 0,
          left: 0,
          bottom: 0,
          width,
          transform: isVisible && !isCollapsed ? 'translateX(0)' : 'translateX(-100%)',
        });
      } else {
        // right
        Object.assign(base, {
          top: 0,
          right: 0,
          bottom: 0,
          width,
          transform: isVisible && !isCollapsed ? 'translateX(0)' : 'translateX(100%)',
        });
      }
      break;
    }

    case 'floating': {
      const width = config.width ?? panel.width ?? 360;
      const height = config.height ?? 'auto';

      Object.assign(base, {
        top: '50%',
        left: '50%',
        transform: isVisible
          ? 'translate(-50%, -50%)'
          : 'translate(-50%, -50%) scale(0.9)',
        width,
        height,
        maxWidth: '90vw',
        maxHeight: '80vh',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? 'auto' as const : 'none' as const,
      });
      break;
    }

    case 'fullscreen': {
      Object.assign(base, {
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        borderRadius: 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
      });
      break;
    }

    case 'collapsed': {
      const position = config.position ?? panel.position ?? 'right';
      Object.assign(base, {
        width: 48,
        height: 48,
        borderRadius: 24,
        cursor: 'pointer',
        ...(position === 'left' ? { left: 8, top: '50%', transform: 'translateY(-50%)' } : {}),
        ...(position === 'right' ? { right: 8, top: '50%', transform: 'translateY(-50%)' } : {}),
        ...(position === 'bottom' ? { bottom: 8, left: '50%', transform: 'translateX(-50%)' } : {}),
      });
      break;
    }
  }

  return base;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ResponsivePanel: React.FC<ResponsivePanelProps> = ({
  panel,
  children,
  visible = true,
  onDismiss,
  onExpand,
  onCollapse,
  onLayoutChange,
  layoutOverride,
  className,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rawLayout = useResponsiveLayout({
    breakpoints: panel.responsive
      ? undefined // Use defaults unless plugin specifies custom breakpoints
      : undefined,
  });

  // Allow test overrides
  const layout: ResponsiveLayoutState = layoutOverride
    ? { ...rawLayout, ...layoutOverride }
    : rawLayout;

  // Resolve responsive config for current breakpoint
  const config = useMemo(
    () => resolveConfig(panel, layout.breakpoint),
    [panel, layout.breakpoint],
  );

  const [isCollapsed, setIsCollapsed] = useState(
    config.defaultCollapsed ?? false,
  );

  // Notify parent of layout changes
  const prevBreakpointRef = useRef(layout.breakpoint);
  if (prevBreakpointRef.current !== layout.breakpoint) {
    prevBreakpointRef.current = layout.breakpoint;
    onLayoutChange?.(config.layoutMode ?? 'docked', layout.breakpoint);

    // Auto-collapse if the new breakpoint says so
    if (config.defaultCollapsed !== undefined) {
      setIsCollapsed(config.defaultCollapsed);
    }
  }

  // Gesture handlers
  const handleGestureAction = useCallback(
    (gestureEvent: TouchGestureEvent) => {
      // Find matching gesture action from panel config
      const gestureAction = panel.touchGestures?.find(
        (g) => g.gesture === gestureEvent.type,
      );
      if (!gestureAction) return;

      switch (gestureAction.action) {
        case 'dismiss':
          onDismiss?.();
          break;
        case 'expand':
          setIsCollapsed(false);
          onExpand?.();
          break;
        case 'collapse':
          setIsCollapsed(true);
          onCollapse?.();
          break;
        case 'toggle':
          setIsCollapsed((prev) => {
            const next = !prev;
            if (next) onCollapse?.();
            else onExpand?.();
            return next;
          });
          break;
        case 'custom':
          gestureAction.handler?.(gestureEvent);
          break;
      }
    },
    [panel.touchGestures, onDismiss, onExpand, onCollapse],
  );

  // Build gesture list -- combine panel-defined gestures with defaults
  const activeGestures = useMemo((): TouchGestureAction[] => {
    const gestures: TouchGestureAction[] = [];

    // Add panel-defined gestures
    if (panel.touchGestures) {
      gestures.push(...panel.touchGestures);
    }

    // Add default swipe-to-dismiss if configured for this breakpoint
    if (
      config.swipeToDismiss &&
      !gestures.some((g) => g.gesture === 'swipe-right' || g.gesture === 'swipe-down')
    ) {
      const position = config.position ?? panel.position ?? 'right';
      const dismissGesture: TouchGestureType =
        position === 'bottom' || position === 'top' ? 'swipe-down' :
        position === 'left' ? 'swipe-left' : 'swipe-right';

      gestures.push({
        gesture: dismissGesture,
        action: 'dismiss',
        threshold: 80,
      });
    }

    return gestures;
  }, [panel.touchGestures, config]);

  // Apply touch gestures
  useTouchGestures({
    targetRef: containerRef,
    gestures: activeGestures.map((g) => ({
      ...g,
      handler: handleGestureAction,
    })),
    enabled: layout.isTouchDevice && visible,
  });

  // Compute styles
  const panelStyles = useMemo(
    () => computeStyles(config, panel, isCollapsed, visible, layout),
    [config, panel, isCollapsed, visible, layout],
  );

  // Build CSS class names
  const classNames = [
    'studio-responsive-panel',
    `studio-panel-${config.layoutMode ?? 'docked'}`,
    `studio-panel-${layout.breakpoint}`,
    isCollapsed ? 'studio-panel-collapsed' : 'studio-panel-expanded',
    layout.isTouchDevice ? 'studio-panel-touch' : 'studio-panel-pointer',
    className,
  ].filter(Boolean).join(' ');

  // Handle collapse toggle for collapsed pill
  const handleCollapsedClick = useCallback(() => {
    if (isCollapsed) {
      setIsCollapsed(false);
      onExpand?.();
    }
  }, [isCollapsed, onExpand]);

  return (
    <>
      {/* Backdrop overlay for drawer mode */}
      {config.layoutMode === 'drawer' && visible && !isCollapsed && (
        <div
          className="studio-panel-backdrop"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            zIndex: (config.zIndex ?? 100) - 1,
            transition: 'opacity 0.3s ease',
            opacity: visible ? 1 : 0,
          }}
          onClick={onDismiss}
          role="presentation"
        />
      )}

      <div
        ref={containerRef}
        className={classNames}
        style={{ ...panelStyles, ...style }}
        role="complementary"
        aria-label={panel.label}
        aria-expanded={!isCollapsed}
        aria-hidden={!visible}
      >
        {/* Drag handle for drawer mode (tablet) */}
        {config.layoutMode === 'drawer' && layout.isTouchDevice && (
          <div
            className="studio-panel-drag-handle"
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '8px 0 4px',
              cursor: 'grab',
              touchAction: 'none',
              minHeight: 20,
            }}
            aria-hidden="true"
          >
            <div
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'currentColor',
                opacity: 0.3,
              }}
            />
          </div>
        )}

        {/* Panel header with close/collapse controls */}
        <div
          className="studio-panel-header"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: layout.isTouchDevice ? '12px 16px' : '8px 12px',
            borderBottom: '1px solid var(--studio-border, rgba(255,255,255,0.1))',
            flexShrink: 0,
            minHeight: layout.isTouchDevice ? 48 : 36, // WCAG touch target
          }}
        >
          <span
            style={{
              fontSize: layout.isTouchDevice ? 16 : 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {panel.label}
          </span>

          <div style={{ display: 'flex', gap: 4 }}>
            {/* Collapse/Expand button */}
            {config.layoutMode !== 'fullscreen' && (
              <button
                onClick={() => {
                  setIsCollapsed((prev) => {
                    const next = !prev;
                    if (next) onCollapse?.();
                    else onExpand?.();
                    return next;
                  });
                }}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  minWidth: layout.isTouchDevice ? 44 : 28,
                  minHeight: layout.isTouchDevice ? 44 : 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  color: 'inherit',
                  opacity: 0.6,
                }}
                aria-label={isCollapsed ? 'Expand panel' : 'Collapse panel'}
                title={isCollapsed ? 'Expand' : 'Collapse'}
              >
                {isCollapsed ? '\u25B6' : '\u25BC'}
              </button>
            )}

            {/* Close button */}
            {onDismiss && (
              <button
                onClick={onDismiss}
                style={{
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  minWidth: layout.isTouchDevice ? 44 : 28,
                  minHeight: layout.isTouchDevice ? 44 : 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 4,
                  color: 'inherit',
                  opacity: 0.6,
                }}
                aria-label="Close panel"
                title="Close"
              >
                {'\u2715'}
              </button>
            )}
          </div>
        </div>

        {/* Panel content */}
        {!isCollapsed && (
          <div
            className="studio-panel-content"
            style={{
              flex: 1,
              overflow: 'auto',
              WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
              overscrollBehavior: 'contain',     // Prevent scroll chaining
            }}
          >
            {children}
          </div>
        )}

        {/* Collapsed state indicator */}
        {isCollapsed && config.layoutMode !== 'collapsed' && (
          <div
            className="studio-panel-collapsed-indicator"
            onClick={handleCollapsedClick}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              opacity: 0.5,
              fontSize: 12,
              minHeight: layout.isTouchDevice ? 44 : 28,
            }}
            role="button"
            tabIndex={0}
            aria-label={`Expand ${panel.label}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCollapsedClick();
              }
            }}
          >
            Tap to expand
          </div>
        )}
      </div>
    </>
  );
};
