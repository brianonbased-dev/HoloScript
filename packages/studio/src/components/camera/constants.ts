import { CameraState, DepthOfFieldSettings, CinematicPreset } from './types';

export const MOVE_STEP = 0.5;
export const ROTATE_STEP = 5; // degrees

export const PRESET_ICONS: Record<CinematicPreset, string> = {
  crane: '🏗️',
  steadicam: '🎥',
  orbit: '🔄',
  flythrough: '🛩️',
  dollyZoom: '🔍',
  whipPan: '💨',
};

export const PRESET_DESCRIPTIONS: Record<CinematicPreset, string> = {
  crane: 'Vertical sweep with smooth arc',
  steadicam: 'Smooth forward tracking shot',
  orbit: '360° orbit around target',
  flythrough: 'Through-space camera flight',
  dollyZoom: 'Hitchcock vertigo effect',
  whipPan: 'Fast horizontal snap',
};

export const DEFAULT_CAMERA: CameraState = {
  position: { x: 0, y: 2, z: 5 },
  target: { x: 0, y: 0, z: 0 },
  fov: 50,
  zoom: 1,
  roll: 0,
};

export const DEFAULT_DOF: DepthOfFieldSettings = {
  enabled: false,
  aperture: 2.8,
  focusDistance: 5,
  focalLength: 50,
  bokehScale: 1,
  bokehShape: 'circle',
};
