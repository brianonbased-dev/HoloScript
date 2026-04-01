import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for phone-sleeve-vr traits (28 traits).
 * Phone-as-headset VR: stereoscopic rendering, lens correction, sensor tracking.
 */
export const PHONE_SLEEVE_VR_VISUALS: Record<string, TraitVisualConfig> = {
  // --- Hardware Form Factor ---
  phone_sleeve: {
    material: { roughness: 0.3, metalness: 0.6 },
    emissive: { color: '#00CCFF', intensity: 0.2 },
    tags: ['vr', 'phone', 'sleeve', 'headset'],
    layer: 'visual_effect',
  },
  sleeve_nfc_trigger: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['nfc', 'trigger', 'hardware'],
    layer: 'visual_effect',
  },
  sleeve_lens_profile: {
    material: { roughness: 0.1, metalness: 0.0 },
    opacity: 0.6,
    tags: ['lens', 'optics'],
    layer: 'visual_effect',
  },
  phone_detection: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['detection', 'calibration'],
    layer: 'visual_effect',
  },

  // --- Display ---
  stereo_split: {
    material: { roughness: 0.2 },
    emissive: { color: '#FF44AA', intensity: 0.2 },
    tags: ['stereoscopic', 'display', 'split'],
    layer: 'visual_effect',
  },
  barrel_distortion: {
    material: { roughness: 0.3 },
    emissive: { color: '#AA44FF', intensity: 0.15 },
    tags: ['distortion', 'shader', 'lens'],
    layer: 'visual_effect',
  },
  chromatic_aberration_fix: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF8800', intensity: 0.1 },
    tags: ['color', 'correction', 'lens'],
    layer: 'visual_effect',
  },
  ipd_adjust: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCFF', intensity: 0.1 },
    tags: ['calibration', 'ipd', 'comfort'],
    layer: 'visual_effect',
  },

  // --- Sensor / Tracking ---
  gyro_head_tracking: {
    material: { roughness: 0.4 },
    emissive: { color: '#00FF88', intensity: 0.15 },
    tags: ['tracking', 'gyroscope', '3dof'],
    layer: 'visual_effect',
  },
  accel_sensor_fusion: {
    material: { roughness: 0.4 },
    emissive: { color: '#00CC66', intensity: 0.1 },
    tags: ['sensor', 'accelerometer', 'fusion'],
    layer: 'visual_effect',
  },
  mag_drift_correction: {
    material: { roughness: 0.4 },
    emissive: { color: '#8844FF', intensity: 0.1 },
    tags: ['magnetometer', 'drift', 'correction'],
    layer: 'visual_effect',
  },
  positional_estimation: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA00', intensity: 0.15 },
    tags: ['6dof', 'vio', 'tracking'],
    layer: 'visual_effect',
  },

  // --- Interaction ---
  gaze_cursor: {
    material: { roughness: 0.2 },
    emissive: { color: '#FFFFFF', intensity: 0.3 },
    tags: ['gaze', 'cursor', 'reticle'],
    layer: 'visual_effect',
  },
  gaze_dwell_select: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFFF44', intensity: 0.2 },
    tags: ['gaze', 'dwell', 'selection'],
    layer: 'visual_effect',
  },
  bt_controller: {
    material: { roughness: 0.5, metalness: 0.3 },
    tags: ['bluetooth', 'controller', 'input'],
    layer: 'visual_effect',
  },
  tap_select: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF44', intensity: 0.1 },
    tags: ['tap', 'capacitive', 'input'],
    layer: 'visual_effect',
  },
  voice_command: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['voice', 'speech', 'command'],
    layer: 'visual_effect',
  },

  // --- Performance ---
  thermal_throttle: {
    material: { roughness: 0.6 },
    emissive: { color: '#FF4400', intensity: 0.2 },
    tags: ['thermal', 'throttle', 'performance'],
    layer: 'visual_effect',
  },
  battery_aware_lod: {
    material: { roughness: 0.5 },
    emissive: { color: '#44FF00', intensity: 0.1 },
    tags: ['battery', 'lod', 'adaptive'],
    layer: 'visual_effect',
  },
  sleeve_foveated: {
    material: { roughness: 0.3 },
    emissive: { color: '#CC44FF', intensity: 0.15 },
    tags: ['foveated', 'rendering', 'performance'],
    layer: 'visual_effect',
  },
  low_persistence: {
    material: { roughness: 0.2 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['display', 'persistence', 'blur'],
    layer: 'visual_effect',
  },

  // --- Comfort ---
  vr_comfort_vignette: {
    material: { roughness: 0.5 },
    opacity: 0.7,
    tags: ['comfort', 'vignette', 'motion'],
    layer: 'visual_effect',
  },
  reorient_snap: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FFCC', intensity: 0.1 },
    tags: ['snap', 'recenter', 'comfort'],
    layer: 'visual_effect',
  },
  static_horizon: {
    material: { roughness: 0.4 },
    emissive: { color: '#88FF88', intensity: 0.1 },
    tags: ['horizon', 'stability', 'nausea'],
    layer: 'visual_effect',
  },
  session_timer: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC00', intensity: 0.15 },
    tags: ['timer', 'health', 'breaks'],
    layer: 'visual_effect',
  },
};
