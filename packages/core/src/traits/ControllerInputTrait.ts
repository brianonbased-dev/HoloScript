/**
 * ControllerInput Trait
 *
 * 6DOF controller input mapping with button states, triggers, and thumbsticks.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ControllerButton =
  | 'trigger'
  | 'grip'
  | 'thumbstick'
  | 'thumbstick_touch'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'menu'
  | 'system';

type ControllerHand = 'left' | 'right';

/**
 * Spatial pose information for a VR/AR controller.
 * Represents the complete 6DOF (six degrees of freedom) tracking data
 * including position, orientation, and motion vectors in 3D space.
 *
 * @example
 * ```typescript
 * const pose: ControllerPose = {
 *   position: { x: 0.5, y: 1.2, z: -0.8 },
 *   rotation: { x: 0, y: 0, z: 0, w: 1 }, // Identity quaternion
 *   velocity: { x: 0, y: 0, z: 0 }, // Stationary
 *   angularVelocity: { x: 0, y: 0, z: 0 }
 * };
 * ```
 */
interface ControllerPose {
  /** 3D position in meters relative to the tracking space origin */
  position: { x: number; y: number; z: number };
  /** Orientation as a quaternion (x, y, z, w) - normalized unit quaternion */
  rotation: { x: number; y: number; z: number; w: number };
  /** Linear velocity in meters per second */
  velocity: { x: number; y: number; z: number };
  /** Angular velocity in radians per second around each axis */
  angularVelocity: { x: number; y: number; z: number };
}

interface ButtonState {
  pressed: boolean;
  touched: boolean;
  value: number; // 0-1 for analog
}

interface ControllerData {
  connected: boolean;
  pose: ControllerPose;
  buttons: Map<ControllerButton, ButtonState>;
  thumbstick: { x: number; y: number };
  triggerValue: number;
  gripValue: number;
}

interface ControllerInputState {
  left: ControllerData;
  right: ControllerData;
  prevButtons: {
    left: Map<ControllerButton, boolean>;
    right: Map<ControllerButton, boolean>;
  };
  prevTrigger: { left: boolean; right: boolean };
  prevGrip: { left: boolean; right: boolean };
}

interface ButtonMapping {
  action: string;
  button: ControllerButton;
  hand?: ControllerHand;
  onPress?: boolean;
  onRelease?: boolean;
  onHold?: boolean;
}

interface ControllerInputConfig {
  haptic_on_button: boolean;
  haptic_intensity: number;
  deadzone: number;
  button_mapping: ButtonMapping[];
  trigger_threshold: number;
  grip_threshold: number;
  thumbstick_sensitivity: number;
  invert_y: boolean;
}

// =============================================================================
// HELPERS
// =============================================================================

function applyDeadzone(value: number, deadzone: number): number {
  if (Math.abs(value) < deadzone) return 0;
  const sign = value > 0 ? 1 : -1;
  return (sign * (Math.abs(value) - deadzone)) / (1 - deadzone);
}

function createEmptyControllerData(): ControllerData {
  return {
    connected: false,
    pose: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
    },
    buttons: new Map(),
    thumbstick: { x: 0, y: 0 },
    triggerValue: 0,
    gripValue: 0,
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const controllerInputHandler: TraitHandler<ControllerInputConfig> = {
  name: 'controller',

  defaultConfig: {
    haptic_on_button: true,
    haptic_intensity: 0.3,
    deadzone: 0.1,
    button_mapping: [],
    trigger_threshold: 0.5,
    grip_threshold: 0.5,
    thumbstick_sensitivity: 1.0,
    invert_y: false,
  },

  onAttach(node, config, context) {
    const state: ControllerInputState = {
      left: createEmptyControllerData(),
      right: createEmptyControllerData(),
      prevButtons: {
        left: new Map(),
        right: new Map(),
      },
      prevTrigger: { left: false, right: false },
      prevGrip: { left: false, right: false },
    };
    node.__controllerInputState = state;

    // Register for controller input
    context.emit?.('controller_register', { node });
  },

  onDetach(node, config, context) {
    context.emit?.('controller_unregister', { node });
    delete node.__controllerInputState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__controllerInputState as ControllerInputState;
    if (!state) return;

    // Process each hand
    for (const hand of ['left', 'right'] as ControllerHand[]) {
      const controller = hand === 'left' ? state.left : state.right;
      if (!controller.connected) continue;

      const prevButtons = state.prevButtons[hand];

      // Check button mappings
      for (const mapping of config.button_mapping) {
        if (mapping.hand && mapping.hand !== hand) continue;

        const buttonState = controller.buttons.get(mapping.button);
        const isPressed = buttonState?.pressed ?? false;
        const wasPressed = prevButtons.get(mapping.button) ?? false;

        if (mapping.onPress && isPressed && !wasPressed) {
          context.emit?.('controller_action', {
            node,
            action: mapping.action,
            hand,
            button: mapping.button,
            type: 'press',
          });

          if (config.haptic_on_button) {
            context.emit?.('haptic_pulse', {
              hand,
              intensity: config.haptic_intensity,
              duration: 30,
            });
          }
        }

        if (mapping.onRelease && !isPressed && wasPressed) {
          context.emit?.('controller_action', {
            node,
            action: mapping.action,
            hand,
            button: mapping.button,
            type: 'release',
          });
        }

        if (mapping.onHold && isPressed) {
          context.emit?.('controller_action', {
            node,
            action: mapping.action,
            hand,
            button: mapping.button,
            type: 'hold',
            delta,
          });
        }
      }

      // Update previous button states
      for (const [button, buttonState] of controller.buttons) {
        prevButtons.set(button, buttonState.pressed);
      }

      // Trigger state changes
      const triggerPressed = controller.triggerValue >= config.trigger_threshold;
      const prevTrigger = state.prevTrigger[hand];

      if (triggerPressed && !prevTrigger) {
        context.emit?.('controller_trigger_press', {
          node,
          hand,
          value: controller.triggerValue,
        });
      } else if (!triggerPressed && prevTrigger) {
        context.emit?.('controller_trigger_release', { node, hand });
      }
      state.prevTrigger[hand] = triggerPressed;

      // Grip state changes
      const gripPressed = controller.gripValue >= config.grip_threshold;
      const prevGrip = state.prevGrip[hand];

      if (gripPressed && !prevGrip) {
        context.emit?.('controller_grip_press', {
          node,
          hand,
          value: controller.gripValue,
        });
      } else if (!gripPressed && prevGrip) {
        context.emit?.('controller_grip_release', { node, hand });
      }
      state.prevGrip[hand] = gripPressed;

      // Thumbstick movement
      const stickX =
        applyDeadzone(controller.thumbstick.x, config.deadzone) * config.thumbstick_sensitivity;
      const stickY =
        applyDeadzone(controller.thumbstick.y, config.deadzone) *
        config.thumbstick_sensitivity *
        (config.invert_y ? -1 : 1);

      if (stickX !== 0 || stickY !== 0) {
        context.emit?.('controller_thumbstick', {
          node,
          hand,
          x: stickX,
          y: stickY,
          delta,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__controllerInputState as ControllerInputState;
    if (!state) return;

    if (event.type === 'controller_data') {
      // Receive controller data from XR system
      const hand = event.hand as ControllerHand;
      const data = (event as any).data as Partial<ControllerData>;

      const controller = hand === 'left' ? state.left : state.right;
      const wasConnected = controller.connected;

      if (data.connected !== undefined) {
        controller.connected = data.connected;
      }
      if (data.pose) {
        controller.pose = data.pose;
      }
      if (data.buttons) {
        controller.buttons = data.buttons;
      }
      if (data.thumbstick) {
        controller.thumbstick = data.thumbstick;
      }
      if (data.triggerValue !== undefined) {
        controller.triggerValue = data.triggerValue;
      }
      if (data.gripValue !== undefined) {
        controller.gripValue = data.gripValue;
      }

      // Connection events
      if (controller.connected && !wasConnected) {
        context.emit?.('controller_connected', { node, hand });
      } else if (!controller.connected && wasConnected) {
        context.emit?.('controller_disconnected', { node, hand });
      }
    } else if (event.type === 'controller_vibrate') {
      // Trigger haptic feedback
      const hand = event.hand as ControllerHand;
      const intensity = (event.intensity as number) ?? config.haptic_intensity;
      const duration = (event.duration as number) ?? 100;

      context.emit?.('haptic_pulse', { hand, intensity, duration });
    } else if (event.type === 'get_controller_pose') {
      const hand = event.hand as ControllerHand;
      const controller = hand === 'left' ? state.left : state.right;

      context.emit?.('controller_pose_result', {
        queryId: event.queryId,
        hand,
        pose: controller.pose,
        connected: controller.connected,
      });
    }
  },
};

export default controllerInputHandler;
