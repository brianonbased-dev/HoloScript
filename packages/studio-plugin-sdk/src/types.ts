/**
 * Plugin type definitions for HoloScript Studio
 *
 * These types define the plugin API for extending Studio with custom:
 * - Workflow/Behavior Tree nodes
 * - UI panels and modals
 * - Toolbar buttons
 * - Keyboard shortcuts
 * - Menu items
 * - MCP servers
 * - Content types
 */

import type { ComponentType } from 'react';
import type { PluginSandboxManifest, SandboxPermission } from './sandbox/types.js';

// ── Responsive & Tablet Layout ────────────────────────────────────────────────

/** Breakpoint names for responsive layout */
export type ResponsiveBreakpoint = 'mobile' | 'tablet' | 'desktop' | 'wide';

/** Device orientation */
export type DeviceOrientation = 'portrait' | 'landscape';

/** Layout mode for panels on different devices */
export type PanelLayoutMode = 'docked' | 'floating' | 'drawer' | 'fullscreen' | 'collapsed';

/** Breakpoint configuration with pixel thresholds */
export interface ResponsiveBreakpoints {
  /** Mobile breakpoint max-width (default: 767) */
  mobile: number;
  /** Tablet breakpoint max-width (default: 1024) */
  tablet: number;
  /** Desktop breakpoint max-width (default: 1439) */
  desktop: number;
  /** Wide breakpoint min-width (default: 1440) */
  wide: number;
}

/** Per-breakpoint panel layout overrides */
export interface ResponsivePanelConfig {
  /** Layout mode at this breakpoint */
  layoutMode?: PanelLayoutMode;
  /** Position override for this breakpoint */
  position?: 'left' | 'right' | 'bottom' | 'modal' | 'top';
  /** Width override (pixels or percentage string like '80%') */
  width?: number | string;
  /** Height override (pixels or percentage string) */
  height?: number | string;
  /** Whether the panel starts collapsed at this breakpoint */
  defaultCollapsed?: boolean;
  /** Whether the panel can be dismissed via swipe gesture */
  swipeToDismiss?: boolean;
  /** Z-index override for layering */
  zIndex?: number;
}

/** Touch gesture types supported by panels and toolbars */
export type TouchGestureType =
  | 'swipe-left'
  | 'swipe-right'
  | 'swipe-up'
  | 'swipe-down'
  | 'pinch-in'
  | 'pinch-out'
  | 'long-press'
  | 'double-tap';

/** Configuration for a touch gesture action */
export interface TouchGestureAction {
  /** Gesture type to listen for */
  gesture: TouchGestureType;
  /** Action to perform when gesture is detected */
  action: 'toggle' | 'dismiss' | 'expand' | 'collapse' | 'custom';
  /** Custom handler (used when action is 'custom') */
  handler?: (event: TouchGestureEvent) => void;
  /** Minimum distance threshold for swipe gestures (pixels, default: 50) */
  threshold?: number;
  /** Duration threshold for long-press (ms, default: 500) */
  duration?: number;
}

/** Event data passed to touch gesture handlers */
export interface TouchGestureEvent {
  /** The type of gesture detected */
  type: TouchGestureType;
  /** Start position of the gesture */
  startPosition: { x: number; y: number };
  /** End position of the gesture (for swipes) */
  endPosition: { x: number; y: number };
  /** Distance traveled (for swipes) */
  distance: number;
  /** Direction angle in degrees (for swipes) */
  angle: number;
  /** Velocity of the gesture (pixels/ms) */
  velocity: number;
  /** Scale factor (for pinch gestures) */
  scale?: number;
  /** Duration of the gesture in ms */
  duration: number;
  /** The original touch event */
  originalEvent: TouchEvent;
}

/** Toolbar layout mode for tablet/responsive */
export type ToolbarLayoutMode = 'horizontal' | 'vertical' | 'floating-action-bar' | 'contextual';

/** Per-breakpoint toolbar layout overrides */
export interface ResponsiveToolbarConfig {
  /** Toolbar layout mode at this breakpoint */
  layoutMode?: ToolbarLayoutMode;
  /** Position for floating toolbar */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Whether to group buttons into overflow menu */
  overflow?: boolean;
  /** Maximum visible buttons before overflow */
  maxVisibleButtons?: number;
  /** Larger touch targets for tablet (default: true on tablet) */
  enlargedTouchTargets?: boolean;
  /** Touch target minimum size in pixels (default: 44 per WCAG) */
  touchTargetSize?: number;
}

// ── Plugin Metadata ───────────────────────────────────────────────────────────

export interface PluginMetadata {
  /** Unique plugin identifier (e.g., 'holoscript-analytics-dashboard') */
  id: string;

  /** Display name */
  name: string;

  /** Semantic version (e.g., '1.0.0') */
  version: string;

  /** Brief description of plugin functionality */
  description: string;

  /** Author information */
  author: {
    name: string;
    email?: string;
    url?: string;
  };

  /** Plugin homepage URL */
  homepage?: string;

  /** License identifier (SPDX format, e.g., 'MIT') */
  license?: string;

  /** Lucide icon name (e.g., 'BarChart2', 'Zap') */
  icon?: string;

  /** Keywords for search/discovery */
  keywords?: string[];

  /** Minimum Studio version required (semver) */
  minStudioVersion?: string;
}

// ── Plugin Lifecycle ──────────────────────────────────────────────────────────

export interface PluginLifecycle {
  /** Called when plugin is enabled (first time or after restart) */
  onLoad?: () => void | Promise<void>;

  /** Called when plugin is disabled */
  onUnload?: () => void | Promise<void>;

  /** Called when plugin is installed (one-time setup) */
  onInstall?: () => void | Promise<void>;

  /** Called when plugin is uninstalled (cleanup) */
  onUninstall?: () => void | Promise<void>;
}

// ── Plugin Settings ───────────────────────────────────────────────────────────

export interface PluginSetting {
  /** Setting key (storage identifier) */
  key: string;

  /** Display label */
  label: string;

  /** Input type */
  type: 'text' | 'number' | 'boolean' | 'select';

  /** Detailed description/help text */
  description?: string;

  /** Default value */
  defaultValue?: unknown;

  /** Required setting (must be configured before use) */
  required?: boolean;

  /** For 'select' type: available options */
  options?: Array<{ label: string; value: string }>;

  /** For 'number' type: min/max constraints */
  min?: number;
  max?: number;

  /** Validation pattern (regex string) */
  pattern?: string;
}

export interface PluginConfig {
  /** Settings schema (UI auto-generated from this) */
  settingsSchema?: PluginSetting[];

  /** Current settings values */
  settings?: Record<string, unknown>;
}

// ── Custom Extensions ─────────────────────────────────────────────────────────

export interface CustomNodeType {
  /** Node type identifier */
  type: string;

  /** Display label */
  label: string;

  /** Category for node palette grouping */
  category?: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Color (hex or CSS color) */
  color?: string;

  /** Node description/help text */
  description?: string;

  /** Input port definitions */
  inputs?: Array<{ id: string; label: string; type?: string }>;

  /** Output port definitions */
  outputs?: Array<{ id: string; label: string; type?: string }>;

  /** Default configuration */
  defaultConfig?: Record<string, unknown>;

  /** React component for custom node UI (optional) */
  component?: ComponentType<any>;
}

export interface CustomPanel {
  /** Panel identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Panel position in UI */
  position?: 'left' | 'right' | 'bottom' | 'modal';

  /** Default width (pixels) */
  width?: number;

  /** Default height (pixels, for bottom panels) */
  height?: number;

  /** React component for panel content */
  component: ComponentType<any>;

  /** Keyboard shortcut to toggle panel (e.g., 'Ctrl+Shift+P') */
  shortcut?: string;

  /**
   * Responsive layout overrides per breakpoint.
   * When set, the panel adapts its layout, position, and size
   * for different device sizes (tablet, mobile, etc.).
   *
   * @example
   * ```typescript
   * responsive: {
   *   tablet: {
   *     layoutMode: 'drawer',
   *     position: 'bottom',
   *     height: '60%',
   *     swipeToDismiss: true,
   *   },
   *   mobile: {
   *     layoutMode: 'fullscreen',
   *     defaultCollapsed: true,
   *   },
   * }
   * ```
   */
  responsive?: Partial<Record<ResponsiveBreakpoint, ResponsivePanelConfig>>;

  /**
   * Touch gesture actions for tablet/mobile interaction.
   * Define how gestures interact with this panel.
   *
   * @example
   * ```typescript
   * touchGestures: [
   *   { gesture: 'swipe-right', action: 'dismiss' },
   *   { gesture: 'swipe-up', action: 'expand' },
   *   { gesture: 'long-press', action: 'toggle' },
   * ]
   * ```
   */
  touchGestures?: TouchGestureAction[];

  /** Minimum width when resizing (pixels, default: 200) */
  minWidth?: number;

  /** Maximum width when resizing (pixels, default: 600) */
  maxWidth?: number;

  /** Whether the panel supports drag-to-resize on tablet */
  resizable?: boolean;
}

export interface CustomToolbarButton {
  /** Button identifier */
  id: string;

  /** Display label */
  label: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Tooltip text */
  tooltip?: string;

  /** Button position in toolbar */
  position?: 'left' | 'center' | 'right';

  /** Click handler */
  onClick: () => void;

  /** Button color theme */
  color?: 'default' | 'accent' | 'success' | 'warning' | 'error';

  /**
   * Priority for overflow ordering on tablet/mobile.
   * Higher priority buttons remain visible; lower priority
   * buttons are moved to an overflow menu.
   * Default: 0 (all buttons have equal priority)
   */
  priority?: number;

  /**
   * Whether this button should be hidden on specific breakpoints.
   * Useful for desktop-only actions that don't translate to touch.
   */
  hideOnBreakpoints?: ResponsiveBreakpoint[];

  /**
   * Long-press handler for tablet interaction.
   * Enables secondary actions via touch-and-hold.
   */
  onLongPress?: () => void;
}

export interface CustomKeyboardShortcut {
  /** Shortcut identifier */
  id: string;

  /** Key combination (e.g., 'Ctrl+Shift+P', 'Alt+N') */
  keys: string;

  /** Shortcut description */
  description: string;

  /** Handler function */
  handler: () => void;

  /** Scope (where shortcut is active) */
  scope?: 'global' | 'editor' | 'panel';
}

export interface CustomMenuItem {
  /** Menu item identifier */
  id: string;

  /** Display label */
  label: string;

  /** Menu path (e.g., 'File/Export/My Format') */
  path: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Click handler */
  onClick: () => void;

  /** Keyboard shortcut hint */
  shortcut?: string;
}

export interface CustomContentType {
  /** Content type identifier */
  type: string;

  /** Display label */
  label: string;

  /** File extension (without dot, e.g., 'hsplug') */
  extension: string;

  /** Icon (Lucide icon name) */
  icon?: string;

  /** Category for marketplace grouping */
  category?: string;

  /** Import handler (parse file) */
  import?: (file: File) => Promise<unknown>;

  /** Export handler (serialize to file) */
  export?: (data: unknown) => Promise<Blob>;
}

export interface CustomMCPServer {
  /** Server identifier */
  id: string;

  /** Display name */
  name: string;

  /** Server URL */
  url: string;

  /** Optional API key */
  apiKey?: string;

  /** Server description */
  description?: string;

  /** Auto-connect on plugin load */
  autoConnect?: boolean;
}

// ── Main Plugin Interface ─────────────────────────────────────────────────────

export interface HoloScriptPlugin extends PluginLifecycle, PluginConfig {
  /** Plugin metadata (required) */
  metadata: PluginMetadata;

  /**
   * Sandbox security manifest.
   *
   * When provided, the plugin will be loaded in a sandboxed iframe with
   * restricted capabilities. All communication with Studio happens through
   * a validated postMessage bridge.
   *
   * When omitted, the plugin runs as a trusted plugin in the main thread
   * (backward compatible with existing plugins). Only first-party plugins
   * should omit this field.
   *
   * @see PluginSandboxManifest
   */
  sandbox?: PluginSandboxManifest;

  /** Custom workflow/behavior tree nodes */
  nodeTypes?: {
    workflow?: CustomNodeType[];
    behaviorTree?: CustomNodeType[];
  };

  /** Custom UI panels */
  panels?: CustomPanel[];

  /** Custom toolbar buttons */
  toolbarButtons?: CustomToolbarButton[];

  /** Custom content types for marketplace */
  contentTypes?: CustomContentType[];

  /** Custom MCP servers */
  mcpServers?: CustomMCPServer[];

  /** Custom keyboard shortcuts */
  keyboardShortcuts?: CustomKeyboardShortcut[];

  /** Custom menu items */
  menuItems?: CustomMenuItem[];

  /**
   * Responsive layout configuration for the entire plugin.
   * Sets global breakpoint thresholds and default toolbar behavior.
   */
  responsive?: {
    /** Custom breakpoint thresholds (overrides defaults) */
    breakpoints?: Partial<ResponsiveBreakpoints>;
    /** Default toolbar layout per breakpoint */
    toolbar?: Partial<Record<ResponsiveBreakpoint, ResponsiveToolbarConfig>>;
  };
}

// ── Plugin Registry Entry ─────────────────────────────────────────────────────

export interface PluginRegistryEntry {
  plugin: HoloScriptPlugin;
  enabled: boolean;
  installedAt: number;
  enabledAt?: number;
  /** Whether this plugin runs in a sandboxed iframe */
  sandboxed: boolean;
  /** Granted permissions (for sandboxed plugins) */
  grantedPermissions?: SandboxPermission[];
}

// Re-export sandbox types for convenience
export type { PluginSandboxManifest, SandboxPermission } from './sandbox/types.js';
