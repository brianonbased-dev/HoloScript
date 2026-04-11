/** @cinematic_camera Trait — Film-grade virtual camera control. @trait cinematic_camera */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type CameraMovement = 'static' | 'dolly' | 'truck' | 'pedestal' | 'pan' | 'tilt' | 'roll' | 'crane' | 'steadicam' | 'drone' | 'handheld';
export interface CinematicCameraConfig { focalLengthMm: number; sensorWidth: number; sensorHeight: number; tStop: number; focusDistanceM: number; movement: CameraMovement; shutterAngle: number; iso: number; whiteBalanceK: number; anamorphic: boolean; }

const defaultConfig: CinematicCameraConfig = { focalLengthMm: 50, sensorWidth: 36, sensorHeight: 24, tStop: 2.8, focusDistanceM: 3, movement: 'static', shutterAngle: 180, iso: 800, whiteBalanceK: 5600, anamorphic: false };

export function createCinematicCameraHandler(): TraitHandler<CinematicCameraConfig> {
  return { name: 'cinematic_camera', defaultConfig,
    onAttach(n: HSPlusNode, c: CinematicCameraConfig, ctx: TraitContext) {
      const fovDeg = 2 * Math.atan(c.sensorWidth / (2 * c.focalLengthMm)) * (180 / Math.PI);
      n.__camState = { fovDeg, isRecording: false, frameCount: 0, dofBlurRadius: c.focalLengthMm / (2 * c.tStop) };
      ctx.emit?.('camera:configured', { focal: c.focalLengthMm, fov: fovDeg, movement: c.movement });
    },
    onDetach(n: HSPlusNode, _c: CinematicCameraConfig, ctx: TraitContext) { delete n.__camState; ctx.emit?.('camera:removed'); },
    onUpdate(n: HSPlusNode, _c: CinematicCameraConfig, _ctx: TraitContext, _d: number) { const s = n.__camState as Record<string, unknown> | undefined; if (s?.isRecording) (s.frameCount as number)++; },
    onEvent(n: HSPlusNode, _c: CinematicCameraConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__camState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'camera:record') { s.isRecording = true; ctx.emit?.('camera:recording'); }
      if (e.type === 'camera:cut') { s.isRecording = false; ctx.emit?.('camera:cut', { frames: s.frameCount }); s.frameCount = 0; }
      if (e.type === 'camera:rack_focus') { ctx.emit?.('camera:focus_pulling', { to: e.payload?.distance }); }
    },
  };
}
