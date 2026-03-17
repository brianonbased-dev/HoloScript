/**
 * SpatialAccessory Trait
 *
 * Wearable/accessory tracking and haptic integration.
 * Supports VR controllers, trackers, and haptic devices.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type DeviceType =
  | 'controller'
  | 'tracker'
  | 'stylus'
  | 'haptic_vest'
  | 'haptic_gloves'
  | 'eye_tracker'
  | 'custom';
type TrackingMode = 'full_6dof' | 'rotation_only' | 'position_only' | 'optical' | 'hybrid';
type AttachPoint =
  | 'left_hand'
  | 'right_hand'
  | 'head'
  | 'waist'
  | 'left_foot'
  | 'right_foot'
  | 'chest'
  | 'custom';

interface SpatialAccessoryState {
  isConnected: boolean;
  batteryLevel: number;
  lastPose: {
    position: [number, number, number];
    rotation: [number, number, number, number];
  };
  inputs: Map<string, number>;
  hapticMotors: number;
  isCalibrated: boolean;
  lastInput: number;
}

interface SpatialAccessoryConfig {
  device_type: DeviceType;
  device_id: string;
  tracking_mode: TrackingMode;
  attach_point: AttachPoint;
  haptic_feedback: boolean;
  pressure_sensitivity: boolean;
  button_count: number;
  led_enabled: boolean;
  led_color: string;
  calibration_required: boolean;
  input_mapping: Record<string, string>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const spatialAccessoryHandler: TraitHandler<SpatialAccessoryConfig> = {
  name: 'spatial_accessory',

  defaultConfig: {
    device_type: 'stylus',
    device_id: '',
    tracking_mode: 'optical',
    attach_point: 'custom',
    haptic_feedback: false,
    pressure_sensitivity: false,
    button_count: 0,
    led_enabled: false,
    led_color: '#00ff00',
    calibration_required: false,
    input_mapping: {},
  },

  onAttach(node, config, context) {
    const state: SpatialAccessoryState = {
      isConnected: false,
      batteryLevel: 1.0,
      lastPose: {
        position: [0, 0, 0],
        rotation: [0, 0, 0, 1],
      },
      inputs: new Map(),
      hapticMotors: 0,
      isCalibrated: !config.calibration_required,
      lastInput: 0,
    };
    node.__spatialAccessoryState = state;

    if (config.device_id) {
      context.emit?.('accessory_connect', {
        node,
        deviceId: config.device_id,
        deviceType: config.device_type,
        trackingMode: config.tracking_mode,
      });
    }
  },

  onDetach(node, config, context) {
    const state = node.__spatialAccessoryState as SpatialAccessoryState;
    if (state?.isConnected) {
      context.emit?.('accessory_disconnect', { node });
    }
    delete node.__spatialAccessoryState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__spatialAccessoryState as SpatialAccessoryState;
    if (!state || !state.isConnected) return;

    context.emit?.('accessory_request_pose', {
      node,
      trackingMode: config.tracking_mode,
    });
  },

  onEvent(node, config, context, event) {
    const state = node.__spatialAccessoryState as SpatialAccessoryState;
    if (!state) return;

    if (event.type === 'accessory_connected') {
      state.isConnected = true;
      state.hapticMotors = (event.hapticMotors as number) || 0;
      state.batteryLevel = (event.batteryLevel as number) || 1.0;

      if (config.led_enabled) {
        context.emit?.('accessory_set_led', {
          node,
          color: config.led_color,
          enabled: true,
        });
      }

      context.emit?.('on_accessory_connected', {
        node,
        deviceType: config.device_type,
      });
    } else if (event.type === 'accessory_disconnected') {
      state.isConnected = false;
      context.emit?.('on_accessory_disconnected', { node });
    } else if (event.type === 'accessory_pose_update') {
      const pose = event.pose as typeof state.lastPose;
      state.lastPose = pose;

      context.emit?.('accessory_apply_pose', {
        node,
        attachPoint: config.attach_point,
        position: pose.position,
        rotation: pose.rotation,
      });
    } else if (event.type === 'accessory_input') {
      const buttonName = event.button as string;
      const value = event.value as number;

      state.inputs.set(buttonName, value);
      state.lastInput = Date.now();

      const mappedAction = config.input_mapping[buttonName];
      if (mappedAction) {
        context.emit?.('on_accessory_input', {
          node,
          button: buttonName,
          action: mappedAction,
          value,
        });
      }

      // Pressure sensitivity
      if (config.pressure_sensitivity && typeof value === 'number' && value > 0 && value < 1) {
        context.emit?.('on_pressure_change', {
          node,
          button: buttonName,
          pressure: value,
        });
      }
    } else if (event.type === 'accessory_haptic') {
      if (!config.haptic_feedback || state.hapticMotors === 0) return;

      context.emit?.('accessory_play_haptic', {
        node,
        intensity: (event.intensity as number) || 0.5,
        duration: (event.duration as number) || 100,
        pattern: (event.pattern as number[]) || [(event.intensity as number) || 0.5],
      });
    } else if (event.type === 'accessory_calibrate') {
      state.isCalibrated = false;
      context.emit?.('accessory_start_calibration', {
        node,
        deviceType: config.device_type,
      });
    } else if (event.type === 'accessory_calibration_complete') {
      state.isCalibrated = true;
      context.emit?.('on_accessory_calibrated', { node });
    } else if (event.type === 'accessory_battery_update') {
      state.batteryLevel = event.level as number;

      if (state.batteryLevel < 0.2) {
        context.emit?.('on_accessory_low_battery', {
          node,
          level: state.batteryLevel,
        });
      }
    } else if (event.type === 'accessory_query') {
      context.emit?.('accessory_info', {
        queryId: event.queryId,
        node,
        isConnected: state.isConnected,
        batteryLevel: state.batteryLevel,
        isCalibrated: state.isCalibrated,
        deviceType: config.device_type,
        attachPoint: config.attach_point,
        pose: state.lastPose,
        hapticMotors: state.hapticMotors,
        inputs: Object.fromEntries(state.inputs),
        buttonCount: config.button_count,
      });
    }
  },
};

export default spatialAccessoryHandler;
