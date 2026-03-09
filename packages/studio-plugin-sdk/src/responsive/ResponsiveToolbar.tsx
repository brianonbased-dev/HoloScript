/**
 * ResponsiveToolbar - Adaptive toolbar for tablet editing
 *
 * Transforms the standard Studio toolbar into a touch-friendly interface:
 * - Horizontal bar (desktop) -> Floating action bar (tablet) -> Bottom bar (mobile)
 * - Enlarged touch targets (minimum 44x44px per WCAG 2.1 SC 2.5.5)
 * - Overflow menu for low-priority buttons on smaller screens
 * - Long-press support for secondary actions
 * - Haptic-style visual feedback on touch
 *
 * ## Usage
 *
 * ```tsx
 * import { ResponsiveToolbar } from '@holoscript/studio-plugin-sdk/responsive';
 *
 * <ResponsiveToolbar
 *   buttons={plugin.toolbarButtons}
 *   responsive={plugin.responsive?.toolbar}
 * />
 * ```
 *
 * @module @holoscript/studio-plugin-sdk/responsive
 */

import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  type CSSProperties,
} from 'react';

import type {
  CustomToolbarButton,
  ResponsiveBreakpoint,
  ResponsiveToolbarConfig,
  ToolbarLayoutMode,
} from '../types.js';
import { useResponsiveLayout, type ResponsiveLayoutState } from './useResponsiveLayout.js';

// ── Types ────────────────────────────────────────────────────────────────────

export interface ResponsiveToolbarProps {
  /** Toolbar buttons from the plugin */
  buttons: CustomToolbarButton[];
  /** Per-breakpoint toolbar configuration */
  responsive?: Partial<Record<ResponsiveBreakpoint, ResponsiveToolbarConfig>>;
  /** Additional CSS class names */
  className?: string;
  /** Additional inline styles */
  style?: CSSProperties;
  /** Override layout detection (for testing) */
  layoutOverride?: Partial<ResponsiveLayoutState>;
}

// ── Default Toolbar Configs ──────────────────────────────────────────────────

const DEFAULT_TOOLBAR_CONFIG: Record<ResponsiveBreakpoint, ResponsiveToolbarConfig> = {
  mobile: {
    layoutMode: 'floating-action-bar',
    position: 'bottom',
    overflow: true,
    maxVisibleButtons: 4,
    enlargedTouchTargets: true,
    touchTargetSize: 48,
  },
  tablet: {
    layoutMode: 'floating-action-bar',
    position: 'bottom',
    overflow: true,
    maxVisibleButtons: 6,
    enlargedTouchTargets: true,
    touchTargetSize: 44,
  },
  desktop: {
    layoutMode: 'horizontal',
    position: 'top',
    overflow: false,
    enlargedTouchTargets: false,
    touchTargetSize: 32,
  },
  wide: {
    layoutMode: 'horizontal',
    position: 'top',
    overflow: false,
    enlargedTouchTargets: false,
    touchTargetSize: 32,
  },
};

// ── Helper: Resolve Toolbar Config ───────────────────────────────────────────

function resolveToolbarConfig(
  responsive: ResponsiveToolbarProps['responsive'],
  breakpoint: ResponsiveBreakpoint
): ResponsiveToolbarConfig {
  const defaults = DEFAULT_TOOLBAR_CONFIG[breakpoint];
  const overrides = responsive?.[breakpoint];
  return { ...defaults, ...overrides };
}

// ── Helper: Sort & Filter Buttons ────────────────────────────────────────────

function prepareButtons(
  buttons: CustomToolbarButton[],
  breakpoint: ResponsiveBreakpoint,
  config: ResponsiveToolbarConfig
): { visible: CustomToolbarButton[]; overflow: CustomToolbarButton[] } {
  // Filter out buttons hidden on this breakpoint
  const filtered = buttons.filter((btn) => !btn.hideOnBreakpoints?.includes(breakpoint));

  // Sort by priority (higher priority = more visible)
  const sorted = [...filtered].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  if (!config.overflow || !config.maxVisibleButtons) {
    return { visible: sorted, overflow: [] };
  }

  return {
    visible: sorted.slice(0, config.maxVisibleButtons),
    overflow: sorted.slice(config.maxVisibleButtons),
  };
}

// ── Sub-component: Toolbar Button ────────────────────────────────────────────

interface ToolbarButtonItemProps {
  button: CustomToolbarButton;
  touchTargetSize: number;
  isTouchDevice: boolean;
  layoutMode: ToolbarLayoutMode;
}

const ToolbarButtonItem: React.FC<ToolbarButtonItemProps> = ({
  button,
  touchTargetSize,
  isTouchDevice,
  layoutMode,
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = useCallback(() => {
    setIsPressed(true);

    if (button.onLongPress) {
      longPressTimerRef.current = setTimeout(() => {
        button.onLongPress!();
        setIsPressed(false);
      }, 500);
    }
  }, [button]);

  const handleTouchEnd = useCallback(() => {
    setIsPressed(false);
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleClick = useCallback(() => {
    // Don't fire click if long-press was triggered
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    button.onClick();
  }, [button]);

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Color mapping
  const colorMap: Record<string, string> = {
    default: 'var(--studio-text, #e0e0e0)',
    accent: 'var(--studio-accent, #6366f1)',
    success: 'var(--studio-success, #10b981)',
    warning: 'var(--studio-warning, #f59e0b)',
    error: 'var(--studio-error, #ef4444)',
  };

  const buttonColor = colorMap[button.color ?? 'default'] ?? colorMap.default;

  const isVertical = layoutMode === 'vertical' || layoutMode === 'floating-action-bar';

  const buttonStyle: CSSProperties = {
    display: 'flex',
    flexDirection: isVertical ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: isVertical ? 2 : 6,
    minWidth: touchTargetSize,
    minHeight: touchTargetSize,
    padding: isTouchDevice ? '8px 12px' : '4px 8px',
    border: 'none',
    borderRadius: 8,
    background: isPressed ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
    color: buttonColor,
    cursor: 'pointer',
    transition: 'background 0.15s ease, transform 0.1s ease',
    transform: isPressed ? 'scale(0.95)' : 'scale(1)',
    WebkitTapHighlightColor: 'transparent',
    touchAction: 'manipulation',
    userSelect: 'none' as const,
  };

  return (
    <button
      className="studio-toolbar-button"
      style={buttonStyle}
      onClick={handleClick}
      onTouchStart={isTouchDevice ? handleTouchStart : undefined}
      onTouchEnd={isTouchDevice ? handleTouchEnd : undefined}
      onTouchCancel={isTouchDevice ? handleTouchEnd : undefined}
      onMouseDown={!isTouchDevice ? () => setIsPressed(true) : undefined}
      onMouseUp={!isTouchDevice ? () => setIsPressed(false) : undefined}
      onMouseLeave={!isTouchDevice ? () => setIsPressed(false) : undefined}
      title={button.tooltip ?? button.label}
      aria-label={button.label}
    >
      {/* Icon placeholder - in real usage, this would render a Lucide icon */}
      {button.icon && (
        <span
          className="studio-toolbar-icon"
          style={{
            fontSize: isTouchDevice ? 20 : 16,
            lineHeight: 1,
          }}
          aria-hidden="true"
        >
          {/* Lucide icon rendering is handled by the consuming application */}
          {button.icon}
        </span>
      )}

      {/* Label - hidden on small floating action bars */}
      {layoutMode !== 'floating-action-bar' && (
        <span
          className="studio-toolbar-label"
          style={{
            fontSize: isTouchDevice ? 11 : 12,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {button.label}
        </span>
      )}
    </button>
  );
};

// ── Sub-component: Overflow Menu ─────────────────────────────────────────────

interface OverflowMenuProps {
  buttons: CustomToolbarButton[];
  touchTargetSize: number;
  isTouchDevice: boolean;
}

const OverflowMenu: React.FC<OverflowMenuProps> = ({ buttons, touchTargetSize, isTouchDevice }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isOpen]);

  if (buttons.length === 0) return null;

  return (
    <div ref={menuRef} className="studio-toolbar-overflow" style={{ position: 'relative' }}>
      <button
        className="studio-toolbar-overflow-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: touchTargetSize,
          minHeight: touchTargetSize,
          padding: isTouchDevice ? '8px' : '4px',
          border: 'none',
          borderRadius: 8,
          background: isOpen ? 'rgba(255, 255, 255, 0.15)' : 'transparent',
          color: 'var(--studio-text, #e0e0e0)',
          cursor: 'pointer',
          touchAction: 'manipulation',
        }}
        aria-label={`More actions (${buttons.length} more)`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        {'\u22EF'} {/* Horizontal ellipsis */}
      </button>

      {isOpen && (
        <div
          className="studio-toolbar-overflow-menu"
          role="menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            right: 0,
            marginBottom: 8,
            minWidth: 180,
            padding: '4px 0',
            borderRadius: 8,
            backgroundColor: 'var(--studio-panel-bg, #1e1e2e)',
            border: '1px solid var(--studio-border, rgba(255,255,255,0.1))',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
            zIndex: 200,
          }}
        >
          {buttons.map((btn) => (
            <button
              key={btn.id}
              className="studio-toolbar-overflow-item"
              onClick={() => {
                btn.onClick();
                setIsOpen(false);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: isTouchDevice ? '12px 16px' : '8px 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--studio-text, #e0e0e0)',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: isTouchDevice ? 15 : 13,
                minHeight: touchTargetSize,
              }}
              role="menuitem"
              aria-label={btn.label}
            >
              {btn.icon && (
                <span style={{ opacity: 0.7, fontSize: 16 }} aria-hidden="true">
                  {btn.icon}
                </span>
              )}
              <span>{btn.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

export const ResponsiveToolbar: React.FC<ResponsiveToolbarProps> = ({
  buttons,
  responsive,
  className,
  style,
  layoutOverride,
}) => {
  const rawLayout = useResponsiveLayout();
  const layout: ResponsiveLayoutState = layoutOverride
    ? { ...rawLayout, ...layoutOverride }
    : rawLayout;

  const config = useMemo(
    () => resolveToolbarConfig(responsive, layout.breakpoint),
    [responsive, layout.breakpoint]
  );

  const { visible, overflow } = useMemo(
    () => prepareButtons(buttons, layout.breakpoint, config),
    [buttons, layout.breakpoint, config]
  );

  const touchTargetSize = config.touchTargetSize ?? (layout.isTouchDevice ? 44 : 32);
  const layoutMode = config.layoutMode ?? 'horizontal';

  // Group visible buttons by position
  const leftButtons = visible.filter((b) => b.position === 'left');
  const centerButtons = visible.filter((b) => b.position === 'center');
  const rightButtons = visible.filter((b) => b.position === 'right' || !b.position);

  // Container styles based on layout mode
  const containerStyle: CSSProperties = useMemo(() => {
    const base: CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      gap: layout.isTouchDevice ? 4 : 2,
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      touchAction: 'manipulation',
    };

    switch (layoutMode) {
      case 'horizontal':
        return {
          ...base,
          flexDirection: 'row',
          padding: '4px 8px',
          justifyContent: 'space-between',
        };

      case 'vertical':
        return {
          ...base,
          flexDirection: 'column',
          padding: '8px 4px',
          position: 'fixed' as const,
          [config.position === 'left' ? 'left' : 'right']: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          borderRadius: 12,
          backgroundColor: 'var(--studio-panel-bg, #1e1e2e)',
          border: '1px solid var(--studio-border, rgba(255,255,255,0.1))',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
          zIndex: 150,
        };

      case 'floating-action-bar':
        return {
          ...base,
          flexDirection: 'row',
          justifyContent: 'center',
          padding: '6px 12px',
          position: 'fixed' as const,
          ...(config.position === 'bottom' ? { bottom: 16 } : { top: 16 }),
          left: '50%',
          transform: 'translateX(-50%)',
          borderRadius: 16,
          backgroundColor: 'var(--studio-panel-bg, rgba(30, 30, 46, 0.95))',
          border: '1px solid var(--studio-border, rgba(255,255,255,0.1))',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          zIndex: 150,
          maxWidth: '90vw',
          overflowX: 'auto',
        };

      case 'contextual':
        return {
          ...base,
          flexDirection: 'row',
          padding: '4px 8px',
          borderRadius: 8,
          backgroundColor: 'var(--studio-panel-bg, #1e1e2e)',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
        };

      default:
        return base;
    }
  }, [layoutMode, layout.isTouchDevice, config.position]);

  const classNames = [
    'studio-responsive-toolbar',
    `studio-toolbar-${layoutMode}`,
    `studio-toolbar-${layout.breakpoint}`,
    layout.isTouchDevice ? 'studio-toolbar-touch' : 'studio-toolbar-pointer',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classNames}
      style={{ ...containerStyle, ...style }}
      role="toolbar"
      aria-label="Studio toolbar"
      aria-orientation={layoutMode === 'vertical' ? 'vertical' : 'horizontal'}
    >
      {/* Left group */}
      {leftButtons.length > 0 && layoutMode === 'horizontal' && (
        <div
          className="studio-toolbar-group studio-toolbar-left"
          style={{ display: 'flex', gap: layout.isTouchDevice ? 4 : 2 }}
        >
          {leftButtons.map((btn) => (
            <ToolbarButtonItem
              key={btn.id}
              button={btn}
              touchTargetSize={touchTargetSize}
              isTouchDevice={layout.isTouchDevice}
              layoutMode={layoutMode}
            />
          ))}
        </div>
      )}

      {/* Center group (or all buttons for non-horizontal layouts) */}
      <div
        className="studio-toolbar-group studio-toolbar-center"
        style={{
          display: 'flex',
          gap: layout.isTouchDevice ? 4 : 2,
          flexDirection: layoutMode === 'vertical' ? 'column' : 'row',
        }}
      >
        {layoutMode === 'horizontal'
          ? centerButtons.map((btn) => (
              <ToolbarButtonItem
                key={btn.id}
                button={btn}
                touchTargetSize={touchTargetSize}
                isTouchDevice={layout.isTouchDevice}
                layoutMode={layoutMode}
              />
            ))
          : // In non-horizontal modes, show all visible buttons in one group
            visible.map((btn) => (
              <ToolbarButtonItem
                key={btn.id}
                button={btn}
                touchTargetSize={touchTargetSize}
                isTouchDevice={layout.isTouchDevice}
                layoutMode={layoutMode}
              />
            ))}
      </div>

      {/* Right group */}
      {rightButtons.length > 0 && layoutMode === 'horizontal' && (
        <div
          className="studio-toolbar-group studio-toolbar-right"
          style={{ display: 'flex', gap: layout.isTouchDevice ? 4 : 2 }}
        >
          {rightButtons.map((btn) => (
            <ToolbarButtonItem
              key={btn.id}
              button={btn}
              touchTargetSize={touchTargetSize}
              isTouchDevice={layout.isTouchDevice}
              layoutMode={layoutMode}
            />
          ))}
        </div>
      )}

      {/* Overflow menu */}
      {overflow.length > 0 && (
        <OverflowMenu
          buttons={overflow}
          touchTargetSize={touchTargetSize}
          isTouchDevice={layout.isTouchDevice}
        />
      )}
    </div>
  );
};
