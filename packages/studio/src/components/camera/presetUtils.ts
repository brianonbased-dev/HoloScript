import { CameraState, CameraKeyframe, CinematicPreset, InterpolationMode } from './types';
import { DEFAULT_DOF } from './constants';

export function generateId(): string {
  return `kf_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function generatePresetKeyframes(
  preset: CinematicPreset,
  camera: CameraState
): CameraKeyframe[] {
  const base = { ...camera };
  const dof = { ...DEFAULT_DOF };

  switch (preset) {
    case 'crane':
      return [
        {
          id: generateId(),
          time: 0,
          camera: { ...base, position: { ...base.position, y: 0.5 } },
          dof,
          interpolation: 'bezier',
          easing: 'ease-in-out',
        },
        {
          id: generateId(),
          time: 2,
          camera: { ...base, position: { ...base.position, y: 4 } },
          dof,
          interpolation: 'bezier',
          easing: 'ease-in-out',
        },
        {
          id: generateId(),
          time: 4,
          camera: { ...base, position: { ...base.position, y: 8, z: base.position.z - 2 } },
          dof,
          interpolation: 'bezier',
          easing: 'ease-out',
        },
      ];

    case 'steadicam':
      return [
        {
          id: generateId(),
          time: 0,
          camera: { ...base },
          dof,
          interpolation: 'catmull-rom',
          easing: 'linear',
        },
        {
          id: generateId(),
          time: 1.5,
          camera: { ...base, position: { ...base.position, z: base.position.z - 2 } },
          dof,
          interpolation: 'catmull-rom',
          easing: 'linear',
        },
        {
          id: generateId(),
          time: 3,
          camera: { ...base, position: { ...base.position, z: base.position.z - 4 } },
          dof,
          interpolation: 'catmull-rom',
          easing: 'linear',
        },
        {
          id: generateId(),
          time: 4.5,
          camera: { ...base, position: { ...base.position, z: base.position.z - 6 } },
          dof,
          interpolation: 'catmull-rom',
          easing: 'ease-out',
        },
      ];

    case 'orbit':
      return Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = Math.sqrt(base.position.x ** 2 + base.position.z ** 2) || 5;
        return {
          id: generateId(),
          time: i * 0.75,
          camera: {
            ...base,
            position: {
              x: Math.sin(angle) * radius,
              y: base.position.y,
              z: Math.cos(angle) * radius,
            },
          },
          dof,
          interpolation: 'catmull-rom' as InterpolationMode,
          easing: 'linear' as const,
        };
      });

    case 'flythrough':
      return [
        {
          id: generateId(),
          time: 0,
          camera: { ...base, position: { x: -10, y: 3, z: 10 }, fov: 65 },
          dof,
          interpolation: 'bezier',
          easing: 'ease-in',
        },
        {
          id: generateId(),
          time: 1.5,
          camera: { ...base, position: { x: -3, y: 2, z: 3 }, fov: 55 },
          dof,
          interpolation: 'bezier',
          easing: 'linear',
        },
        {
          id: generateId(),
          time: 3,
          camera: { ...base, position: { x: 0, y: 1.5, z: 0.5 }, fov: 40 },
          dof,
          interpolation: 'bezier',
          easing: 'linear',
        },
        {
          id: generateId(),
          time: 4.5,
          camera: { ...base, position: { x: 5, y: 3, z: -5 }, fov: 50 },
          dof,
          interpolation: 'bezier',
          easing: 'ease-out',
        },
      ];

    case 'dollyZoom':
      return [
        {
          id: generateId(),
          time: 0,
          camera: { ...base, position: { ...base.position, z: 10 }, fov: 20 },
          dof: { ...dof, enabled: true, focusDistance: 10 },
          interpolation: 'linear',
          easing: 'linear',
        },
        {
          id: generateId(),
          time: 3,
          camera: { ...base, position: { ...base.position, z: 2 }, fov: 80 },
          dof: { ...dof, enabled: true, focusDistance: 2 },
          interpolation: 'linear',
          easing: 'linear',
        },
      ];

    case 'whipPan':
      return [
        {
          id: generateId(),
          time: 0,
          camera: { ...base, target: { x: -5, y: 0, z: 0 } },
          dof,
          interpolation: 'bezier',
          easing: 'ease-in',
        },
        {
          id: generateId(),
          time: 0.3,
          camera: { ...base, target: { x: 5, y: 0, z: 0 } },
          dof,
          interpolation: 'bezier',
          easing: 'ease-out',
        },
      ];

    default:
      return [];
  }
}
