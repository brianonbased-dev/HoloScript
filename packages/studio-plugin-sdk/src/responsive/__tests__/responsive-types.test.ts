/**
 * Tests for responsive type system and panel/toolbar configuration
 *
 * Validates that the extended type system for responsive layouts
 * integrates correctly with existing plugin types and the helper
 * functions produce valid configurations.
 */
import { describe, it, expect } from 'vitest';
import {
  createPlugin,
  createPanel,
  validatePlugin,
} from '../../helpers.js';
import type {
  HoloScriptPlugin,
  CustomPanel,
  CustomToolbarButton,
  ResponsiveBreakpoint,
  ResponsivePanelConfig,
  ResponsiveToolbarConfig,
  TouchGestureAction,
  TouchGestureType,
  PanelLayoutMode,
  ToolbarLayoutMode,
  DeviceOrientation,
} from '../../types.js';

// ── Type Validation Tests ────────────────────────────────────────────────────

describe('ResponsiveBreakpoint type', () => {
  it('should accept all valid breakpoint values', () => {
    const breakpoints: ResponsiveBreakpoint[] = [
      'mobile', 'tablet', 'desktop', 'wide',
    ];
    expect(breakpoints).toHaveLength(4);
  });
});

describe('PanelLayoutMode type', () => {
  it('should accept all valid layout modes', () => {
    const modes: PanelLayoutMode[] = [
      'docked', 'floating', 'drawer', 'fullscreen', 'collapsed',
    ];
    expect(modes).toHaveLength(5);
  });
});

describe('ToolbarLayoutMode type', () => {
  it('should accept all valid toolbar layout modes', () => {
    const modes: ToolbarLayoutMode[] = [
      'horizontal', 'vertical', 'floating-action-bar', 'contextual',
    ];
    expect(modes).toHaveLength(4);
  });
});

describe('TouchGestureType type', () => {
  it('should accept all valid gesture types', () => {
    const gestures: TouchGestureType[] = [
      'swipe-left', 'swipe-right', 'swipe-up', 'swipe-down',
      'pinch-in', 'pinch-out', 'long-press', 'double-tap',
    ];
    expect(gestures).toHaveLength(8);
  });
});

describe('DeviceOrientation type', () => {
  it('should accept portrait and landscape', () => {
    const orientations: DeviceOrientation[] = ['portrait', 'landscape'];
    expect(orientations).toHaveLength(2);
  });
});

// ── Plugin Integration Tests ─────────────────────────────────────────────────

describe('CustomPanel with responsive configuration', () => {
  it('should create a panel with responsive tablet drawer mode', () => {
    const panel: CustomPanel = createPanel({
      id: 'test-panel',
      label: 'Test Panel',
      component: () => null,
      responsive: {
        tablet: {
          layoutMode: 'drawer',
          position: 'right',
          width: '70%',
          swipeToDismiss: true,
        },
      },
    });

    expect(panel.responsive?.tablet?.layoutMode).toBe('drawer');
    expect(panel.responsive?.tablet?.width).toBe('70%');
    expect(panel.responsive?.tablet?.swipeToDismiss).toBe(true);
  });

  it('should create a panel with responsive mobile fullscreen mode', () => {
    const panel: CustomPanel = createPanel({
      id: 'mobile-panel',
      label: 'Mobile Panel',
      component: () => null,
      responsive: {
        mobile: {
          layoutMode: 'fullscreen',
          defaultCollapsed: true,
          swipeToDismiss: true,
        },
      },
    });

    expect(panel.responsive?.mobile?.layoutMode).toBe('fullscreen');
    expect(panel.responsive?.mobile?.defaultCollapsed).toBe(true);
  });

  it('should create a panel with all breakpoint overrides', () => {
    const panel: CustomPanel = createPanel({
      id: 'full-responsive',
      label: 'Full Responsive Panel',
      component: () => null,
      responsive: {
        mobile: {
          layoutMode: 'fullscreen',
          defaultCollapsed: true,
        },
        tablet: {
          layoutMode: 'drawer',
          position: 'bottom',
          height: '60%',
        },
        desktop: {
          layoutMode: 'docked',
          width: 400,
        },
        wide: {
          layoutMode: 'docked',
          width: 500,
        },
      },
    });

    expect(panel.responsive?.mobile?.layoutMode).toBe('fullscreen');
    expect(panel.responsive?.tablet?.layoutMode).toBe('drawer');
    expect(panel.responsive?.desktop?.layoutMode).toBe('docked');
    expect(panel.responsive?.wide?.layoutMode).toBe('docked');
    expect(panel.responsive?.wide?.width).toBe(500);
  });

  it('should create a panel with touch gesture actions', () => {
    const panel: CustomPanel = createPanel({
      id: 'gestured-panel',
      label: 'Gestured Panel',
      component: () => null,
      touchGestures: [
        { gesture: 'swipe-right', action: 'dismiss' },
        { gesture: 'swipe-up', action: 'expand' },
        { gesture: 'swipe-down', action: 'collapse' },
        { gesture: 'long-press', action: 'toggle' },
      ],
    });

    expect(panel.touchGestures).toHaveLength(4);
    expect(panel.touchGestures![0].gesture).toBe('swipe-right');
    expect(panel.touchGestures![0].action).toBe('dismiss');
    expect(panel.touchGestures![3].action).toBe('toggle');
  });

  it('should create a panel with custom gesture handler', () => {
    const customHandler = () => { /* custom logic */ };

    const panel: CustomPanel = createPanel({
      id: 'custom-gesture',
      label: 'Custom Gesture Panel',
      component: () => null,
      touchGestures: [
        {
          gesture: 'pinch-in',
          action: 'custom',
          handler: customHandler,
          threshold: 100,
        },
      ],
    });

    expect(panel.touchGestures![0].action).toBe('custom');
    expect(panel.touchGestures![0].handler).toBe(customHandler);
    expect(panel.touchGestures![0].threshold).toBe(100);
  });

  it('should support resizable panels with min/max constraints', () => {
    const panel: CustomPanel = createPanel({
      id: 'resizable',
      label: 'Resizable Panel',
      component: () => null,
      resizable: true,
      minWidth: 280,
      maxWidth: 600,
    });

    expect(panel.resizable).toBe(true);
    expect(panel.minWidth).toBe(280);
    expect(panel.maxWidth).toBe(600);
  });

  it('should preserve default position and width from createPanel', () => {
    const panel = createPanel({
      id: 'defaults',
      label: 'Defaults Panel',
      component: () => null,
    });

    // createPanel sets defaults: position='right', width=400
    expect(panel.position).toBe('right');
    expect(panel.width).toBe(400);
  });
});

describe('CustomToolbarButton with responsive features', () => {
  it('should support priority for overflow ordering', () => {
    const buttons: CustomToolbarButton[] = [
      {
        id: 'high-priority',
        label: 'Important',
        onClick: () => {},
        priority: 10,
      },
      {
        id: 'low-priority',
        label: 'Less Important',
        onClick: () => {},
        priority: 1,
      },
      {
        id: 'default-priority',
        label: 'Default',
        onClick: () => {},
        // No priority = 0
      },
    ];

    const sorted = [...buttons].sort(
      (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
    );

    expect(sorted[0].id).toBe('high-priority');
    expect(sorted[1].id).toBe('low-priority');
    expect(sorted[2].id).toBe('default-priority');
  });

  it('should support hiding buttons on specific breakpoints', () => {
    const button: CustomToolbarButton = {
      id: 'desktop-only',
      label: 'Desktop Only Action',
      onClick: () => {},
      hideOnBreakpoints: ['mobile', 'tablet'],
    };

    expect(button.hideOnBreakpoints).toContain('mobile');
    expect(button.hideOnBreakpoints).toContain('tablet');
    expect(button.hideOnBreakpoints).not.toContain('desktop');
  });

  it('should support long-press handler', () => {
    const longPressHandler = () => {};

    const button: CustomToolbarButton = {
      id: 'with-long-press',
      label: 'Long Press',
      onClick: () => {},
      onLongPress: longPressHandler,
    };

    expect(button.onLongPress).toBe(longPressHandler);
  });
});

describe('HoloScriptPlugin with responsive configuration', () => {
  it('should validate a plugin with responsive panel config', () => {
    const plugin: HoloScriptPlugin = createPlugin({
      metadata: {
        id: 'responsive-plugin',
        name: 'Responsive Plugin',
        version: '1.0.0',
        description: 'A plugin with responsive panels',
        author: { name: 'Test Author' },
      },
      panels: [
        {
          id: 'main-panel',
          label: 'Main Panel',
          component: () => null,
          responsive: {
            tablet: {
              layoutMode: 'drawer',
              swipeToDismiss: true,
            },
            mobile: {
              layoutMode: 'fullscreen',
            },
          },
          touchGestures: [
            { gesture: 'swipe-right', action: 'dismiss' },
          ],
        },
      ],
    });

    const validation = validatePlugin(plugin);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should support global responsive toolbar configuration', () => {
    const plugin: HoloScriptPlugin = createPlugin({
      metadata: {
        id: 'toolbar-plugin',
        name: 'Toolbar Plugin',
        version: '1.0.0',
        description: 'A plugin with responsive toolbar',
        author: { name: 'Test Author' },
      },
      toolbarButtons: [
        { id: 'btn1', label: 'Action 1', onClick: () => {}, priority: 10 },
        { id: 'btn2', label: 'Action 2', onClick: () => {}, priority: 5 },
        { id: 'btn3', label: 'Action 3', onClick: () => {}, hideOnBreakpoints: ['mobile'] },
      ],
      responsive: {
        toolbar: {
          tablet: {
            layoutMode: 'floating-action-bar',
            position: 'bottom',
            maxVisibleButtons: 4,
            enlargedTouchTargets: true,
            touchTargetSize: 44,
          },
          mobile: {
            layoutMode: 'floating-action-bar',
            position: 'bottom',
            maxVisibleButtons: 3,
            touchTargetSize: 48,
          },
        },
      },
    });

    expect(plugin.responsive?.toolbar?.tablet?.layoutMode).toBe('floating-action-bar');
    expect(plugin.responsive?.toolbar?.tablet?.touchTargetSize).toBe(44);
    expect(plugin.responsive?.toolbar?.mobile?.maxVisibleButtons).toBe(3);
  });

  it('should support custom breakpoint thresholds', () => {
    const plugin: HoloScriptPlugin = createPlugin({
      metadata: {
        id: 'custom-breakpoints',
        name: 'Custom Breakpoints',
        version: '1.0.0',
        description: 'Plugin with custom breakpoints',
        author: { name: 'Test' },
      },
      responsive: {
        breakpoints: {
          mobile: 600,
          tablet: 900,
        },
      },
    });

    expect(plugin.responsive?.breakpoints?.mobile).toBe(600);
    expect(plugin.responsive?.breakpoints?.tablet).toBe(900);
  });
});

// ── Responsive Config Resolution Tests ───────────────────────────────────────

describe('ResponsivePanelConfig resolution', () => {
  it('should allow percentage-based width', () => {
    const config: ResponsivePanelConfig = {
      layoutMode: 'drawer',
      width: '80%',
    };
    expect(config.width).toBe('80%');
  });

  it('should allow pixel-based width', () => {
    const config: ResponsivePanelConfig = {
      layoutMode: 'docked',
      width: 400,
    };
    expect(config.width).toBe(400);
  });

  it('should support all position values', () => {
    const positions: Array<ResponsivePanelConfig['position']> = [
      'left', 'right', 'bottom', 'modal', 'top',
    ];
    positions.forEach((pos) => {
      const config: ResponsivePanelConfig = {
        layoutMode: 'docked',
        position: pos,
      };
      expect(config.position).toBe(pos);
    });
  });

  it('should support z-index for layering', () => {
    const config: ResponsivePanelConfig = {
      layoutMode: 'drawer',
      zIndex: 200,
    };
    expect(config.zIndex).toBe(200);
  });
});

describe('ResponsiveToolbarConfig resolution', () => {
  it('should support enlarged touch targets with custom size', () => {
    const config: ResponsiveToolbarConfig = {
      enlargedTouchTargets: true,
      touchTargetSize: 48,
    };
    expect(config.enlargedTouchTargets).toBe(true);
    expect(config.touchTargetSize).toBe(48);
  });

  it('should support overflow with max visible buttons', () => {
    const config: ResponsiveToolbarConfig = {
      overflow: true,
      maxVisibleButtons: 5,
    };
    expect(config.overflow).toBe(true);
    expect(config.maxVisibleButtons).toBe(5);
  });

  it('should support all toolbar positions', () => {
    const positions: Array<ResponsiveToolbarConfig['position']> = [
      'top', 'bottom', 'left', 'right',
    ];
    positions.forEach((pos) => {
      const config: ResponsiveToolbarConfig = {
        layoutMode: 'floating-action-bar',
        position: pos,
      };
      expect(config.position).toBe(pos);
    });
  });
});

// ── Touch Gesture Action Tests ───────────────────────────────────────────────

describe('TouchGestureAction configuration', () => {
  it('should support all built-in actions', () => {
    const actions: TouchGestureAction[] = [
      { gesture: 'swipe-right', action: 'dismiss' },
      { gesture: 'swipe-up', action: 'expand' },
      { gesture: 'swipe-down', action: 'collapse' },
      { gesture: 'long-press', action: 'toggle' },
      { gesture: 'double-tap', action: 'custom', handler: () => {} },
    ];

    expect(actions).toHaveLength(5);
    expect(actions[4].action).toBe('custom');
    expect(actions[4].handler).toBeDefined();
  });

  it('should support custom threshold and duration', () => {
    const gesture: TouchGestureAction = {
      gesture: 'swipe-right',
      action: 'dismiss',
      threshold: 100,  // 100px swipe distance
    };

    expect(gesture.threshold).toBe(100);

    const longPress: TouchGestureAction = {
      gesture: 'long-press',
      action: 'toggle',
      duration: 800, // 800ms hold
    };

    expect(longPress.duration).toBe(800);
  });
});
