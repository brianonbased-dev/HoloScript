export { createVolumetricHandler, type VolumetricConfig, type VolumetricFormat } from './traits/VolumetricTrait';
export { createGaussianSplatHandler, type GaussianSplatConfig } from './traits/GaussianSplatTrait';
export { createNeRFHandler, type NeRFConfig, type NeRFMethod } from './traits/NeRFTrait';
export { createCinematicCameraHandler, type CinematicCameraConfig, type CameraMovement } from './traits/CinematicCameraTrait';
export * from './traits/types';

import { createVolumetricHandler } from './traits/VolumetricTrait';
import { createGaussianSplatHandler } from './traits/GaussianSplatTrait';
import { createNeRFHandler } from './traits/NeRFTrait';
import { createCinematicCameraHandler } from './traits/CinematicCameraTrait';

export const pluginMeta = { name: '@holoscript/plugin-film3d-volumetrics', version: '1.0.0', traits: ['volumetric', 'gaussian_splat', 'nerf', 'cinematic_camera'] };
export const traitHandlers = [createVolumetricHandler(), createGaussianSplatHandler(), createNeRFHandler(), createCinematicCameraHandler()];
