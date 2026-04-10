export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraState {
  position: Vec3;
  target: Vec3;
  fov: number;
  zoom: number;
  roll: number; // degrees
}

export interface DepthOfFieldSettings {
  enabled: boolean;
  aperture: number; // f-stop (1.4 - 22)
  focusDistance: number; // meters
  focalLength: number; // mm (18 - 200)
  bokehScale: number; // 0-5
  bokehShape: 'circle' | 'hexagon' | 'octagon';
}

export type InterpolationMode = 'linear' | 'bezier' | 'catmull-rom' | 'step';

export interface CameraKeyframe {
  id: string;
  time: number; // seconds
  camera: CameraState;
  dof: DepthOfFieldSettings;
  interpolation: InterpolationMode;
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export type CinematicPreset =
  | 'crane'
  | 'steadicam'
  | 'orbit'
  | 'flythrough'
  | 'dollyZoom'
  | 'whipPan';

export interface CameraPath {
  name: string;
  keyframes: CameraKeyframe[];
  duration: number;
  loop: boolean;
  pathType: InterpolationMode;
}
